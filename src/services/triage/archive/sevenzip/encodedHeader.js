function createEncodedHeaderInspector({ decrypt7zAES, decompressLzmaBuffer }) {
  async function decompressEncodedHeader(info, footerBuf, metaSize) {
    if (!info || !info.packSize || !info.unpackSize) return null;
    if (!metaSize || metaSize <= 0) return null;

    const packedEnd = footerBuf.length - metaSize;
    const packedStart = packedEnd - info.packSize;
    if (packedStart < 0 || packedEnd > footerBuf.length) return null;

    const compressedData = footerBuf.subarray(packedStart, packedEnd);
    return decompressLzmaBuffer(info, compressedData);
  }

  async function decryptEncodedHeader(info, footerBuf, metaSize, password) {
    if (!info || !info.packSize || !password) return null;
    if (!metaSize || metaSize <= 0) return null;

    const packedEnd = footerBuf.length - metaSize;
    const packedStart = packedEnd - info.packSize;
    if (packedStart < 0 || packedEnd > footerBuf.length) return null;

    const packedData = footerBuf.subarray(packedStart, packedEnd);
    const coders = info.coders || [];
    const unpackSizes = info.unpackSizes || [];

    const aesCoder = coders.find((c) => c.method.startsWith('06f107'));
    const lzmaCoder = coders.find((c) => c.method === '030101' || c.method === '21');
    if (!aesCoder) return null;

    try {
      const decrypted = decrypt7zAES(packedData, password, aesCoder.properties);
      if (!decrypted) return null;

      if (lzmaCoder) {
        const lzmaUnpackSize = unpackSizes[unpackSizes.length - 1] || info.unpackSize;
        const lzmaInfo = {
          coderMethod: lzmaCoder.method,
          coderProperties: lzmaCoder.properties,
          unpackSize: lzmaUnpackSize,
        };
        const trimSize = unpackSizes[0] || decrypted.length;
        const lzmaInput = decrypted.subarray(0, trimSize);
        const result = await decompressLzmaBuffer(lzmaInfo, lzmaInput);
        if (result && Buffer.isBuffer(result) && result.length > 0) {
          return result;
        }
      } else {
        const trimSize = unpackSizes[0] || decrypted.length;
        return decrypted.subarray(0, trimSize);
      }
    } catch (_) {}

    return null;
  }

  return {
    decompressEncodedHeader,
    decryptEncodedHeader,
  };
}

module.exports = {
  createEncodedHeaderInspector,
};
