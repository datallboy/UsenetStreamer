const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function createZipInspector({
  recordSampleEntry,
  isIsoFileName,
  isVideoFileName,
  isArchiveEntryName,
  isDiscStructurePath,
}) {
  function inspectZip(buffer) {
    let offset = 0;
    let nestedArchiveCount = 0;
    let playableEntryFound = false;
    let storedDetails = null;
    const sampleEntries = [];

    while (offset + 4 <= buffer.length) {
      const signature = buffer.readUInt32LE(offset);

      if (signature === ZIP_CENTRAL_DIRECTORY_SIGNATURE || signature === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
        break;
      }

      if (signature !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
        break;
      }

      if (offset + 30 > buffer.length) return { status: 'rar-insufficient-data' };

      const flags = buffer.readUInt16LE(offset + 6);
      const method = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);

      const headerEnd = offset + 30 + nameLength + extraLength;
      if (headerEnd > buffer.length) return { status: 'rar-insufficient-data' };

      const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString('utf8').replace(/\0/g, '');
      recordSampleEntry(sampleEntries, name);

      if (!storedDetails) {
        storedDetails = { name, method, format: 'zip' };
      }

      if (isIsoFileName(name)) {
        return { status: 'rar-iso-image', details: { name, sampleEntries } };
      }

      if ((flags & 0x0001) !== 0) {
        return { status: 'rar-encrypted', details: { name, format: 'zip', sampleEntries } };
      }

      if (method !== 0) {
        return { status: 'rar-compressed', details: { name, method, format: 'zip', sampleEntries } };
      }

      if (isVideoFileName(name)) {
        playableEntryFound = true;
      } else if (isArchiveEntryName(name)) {
        nestedArchiveCount += 1;
      }
      if (isDiscStructurePath(name)) {
        return { status: 'rar-disc-structure', details: { name, sampleEntries } };
      }

      if (compressedSize === 0xFFFFFFFF) return { status: 'rar-insufficient-data' };

      const nextOffset = headerEnd + compressedSize;
      if (nextOffset <= offset) return { status: 'rar-insufficient-data' };
      if (nextOffset > buffer.length) return { status: 'rar-insufficient-data' };
      offset = nextOffset;
    }

    if (storedDetails) {
      if (nestedArchiveCount > 0 && !playableEntryFound) {
        return {
          status: 'rar-nested-archive',
          details: { nestedEntries: nestedArchiveCount, sampleEntries },
        };
      }
      return { status: 'rar-stored', details: { ...storedDetails, sampleEntries } };
    }

    return { status: 'rar-header-not-found' };
  }

  return { inspectZip };
}

module.exports = {
  createZipInspector,
};
