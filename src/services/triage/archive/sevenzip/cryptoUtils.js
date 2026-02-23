function createSevenZipCrypto({ crypto }) {
  function parse7zAESProperties(properties) {
    if (!properties || properties.length === 0) return null;
    const firstByte = properties[0];
    const numCyclesPower = firstByte & 0x3F;

    let pos = 1;
    let saltSize = 0;
    let ivSize = 0;

    if (firstByte & 0xC0) {
      if (pos >= properties.length) return null;
      const secondByte = properties[pos++];
      saltSize = ((firstByte >> 7) & 1) + ((secondByte >> 4) & 0x0F);
      ivSize = ((firstByte >> 6) & 1) + (secondByte & 0x0F);
    }

    const salt = saltSize > 0 ? Buffer.from(properties.subarray(pos, pos + saltSize)) : Buffer.alloc(0);
    pos += saltSize;
    const iv = Buffer.alloc(16, 0);
    if (ivSize > 0) {
      const ivBytes = Math.min(ivSize, 16);
      properties.copy(iv, 0, pos, pos + ivBytes);
    }

    return { numCyclesPower, salt, iv };
  }

  function derive7zAESKey(password, salt, numCyclesPower) {
    const passwordBuf = Buffer.from(password, 'utf16le');
    const numRounds = 1 << numCyclesPower;
    const hash = crypto.createHash('sha256');

    const iterPrefix = Buffer.concat([salt, passwordBuf]);
    const batchSize = Math.min(4096, numRounds);
    const iterSize = iterPrefix.length + 8;
    const batch = Buffer.alloc(batchSize * iterSize);

    for (let start = 0; start < numRounds; start += batchSize) {
      const end = Math.min(start + batchSize, numRounds);
      let offset = 0;
      for (let i = start; i < end; i++) {
        iterPrefix.copy(batch, offset);
        offset += iterPrefix.length;
        batch.writeUInt32LE(i & 0xFFFFFFFF, offset);
        batch.writeUInt32LE(Math.floor(i / 0x100000000), offset + 4);
        offset += 8;
      }
      hash.update(batch.subarray(0, offset));
    }

    return hash.digest();
  }

  function decrypt7zAES(encryptedData, password, aesProperties) {
    const params = parse7zAESProperties(aesProperties);
    if (!params) return null;
    const key = derive7zAESKey(password, params.salt, params.numCyclesPower);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, params.iv);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  }

  return {
    decrypt7zAES,
  };
}

module.exports = {
  createSevenZipCrypto,
};
