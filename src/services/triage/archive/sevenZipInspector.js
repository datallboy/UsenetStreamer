function inspectSevenZip(buffer) {
  if (buffer.length < 6
    || buffer[0] !== 0x37
    || buffer[1] !== 0x7A
    || buffer[2] !== 0xBC
    || buffer[3] !== 0xAF
    || buffer[4] !== 0x27
    || buffer[5] !== 0x1C) {
    return { status: 'sevenzip-insufficient-data', details: 'invalid or missing 7z signature' };
  }
  return { status: 'sevenzip-signature-ok' };
}

module.exports = {
  inspectSevenZip,
};
