function createSevenZipLzma({ lzma }) {
  function lzma2DictSize(byte) {
    if (byte > 40) return 0xFFFFFFFF;
    if (byte === 40) return 0xFFFFFFFF;
    const base = (2 | (byte & 1)) << ((byte >> 1) + 11);
    return base;
  }

  async function decompressLzmaBuffer(info, compressedData) {
    const methodHex = info.coderMethod;
    if (methodHex === '21') {
      const dictByte = info.coderProperties?.[0] ?? 24;
      return new Promise((resolve, reject) => {
        const decompressor = lzma.createStream('rawDecoder', {
          filters: [{ id: lzma.FILTER_LZMA2, options: { dictSize: lzma2DictSize(dictByte) } }],
        });
        const chunks = [];
        decompressor.on('data', (chunk) => chunks.push(chunk));
        decompressor.on('end', () => resolve(Buffer.concat(chunks)));
        decompressor.on('error', (err) => reject(err));
        decompressor.end(compressedData);
      });
    } else if (methodHex === '030101') {
      const props = info.coderProperties;
      if (!props || props.length < 5) return null;
      const dictSize = Buffer.from(props).readUInt32LE(1);
      const lzmaHeader = Buffer.alloc(13);
      lzmaHeader[0] = props[0];
      lzmaHeader.writeUInt32LE(dictSize, 1);
      const sizeBuf = Buffer.alloc(8);
      sizeBuf.writeBigUInt64LE(BigInt(info.unpackSize));
      sizeBuf.copy(lzmaHeader, 5);
      const lzmaStream = Buffer.concat([lzmaHeader, compressedData]);
      return new Promise((resolve, reject) => {
        lzma.decompress(lzmaStream, {}, (result) => {
          if (Buffer.isBuffer(result)) resolve(result);
          else reject(new Error('lzma-decompress-non-buffer'));
        }, (err) => reject(err instanceof Error ? err : new Error(String(err))));
      });
    } else if (methodHex === '00' || !methodHex) {
      return compressedData;
    }
    return null;
  }

  return {
    decompressLzmaBuffer,
  };
}

module.exports = {
  createSevenZipLzma,
};
