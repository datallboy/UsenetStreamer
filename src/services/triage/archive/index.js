const { createRarInspector } = require('./rarInspector');
const { createZipInspector } = require('./zipInspector');
const { inspectSevenZip } = require('./sevenZipInspector');

function createArchiveInspector(deps) {
  const rar = createRarInspector(deps);
  const zip = createZipInspector(deps);

  function inspectArchiveBuffer(buffer, password) {
    if (buffer.length >= rar.RAR4_SIGNATURE.length && buffer.subarray(0, rar.RAR4_SIGNATURE.length).equals(rar.RAR4_SIGNATURE)) {
      return rar.inspectRar4(buffer, password);
    }

    if (buffer.length >= rar.RAR5_SIGNATURE.length && buffer.subarray(0, rar.RAR5_SIGNATURE.length).equals(rar.RAR5_SIGNATURE)) {
      return rar.inspectRar5(buffer, password);
    }

    if (buffer.length >= 6 && buffer[0] === 0x37 && buffer[1] === 0x7A) {
      return inspectSevenZip(buffer);
    }

    if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) {
      return zip.inspectZip(buffer);
    }

    return { status: 'rar-header-not-found' };
  }

  return {
    inspectArchiveBuffer,
    inspectSevenZip,
  };
}

module.exports = {
  createArchiveInspector,
};
