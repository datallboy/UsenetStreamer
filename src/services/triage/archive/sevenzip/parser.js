const NESTED_ARCHIVE_RE = /\.(rar|r\d{2,3}|zip|7z|iso)$/i;
const SAMPLE_PROOF_FOLDER_RE = /[\\/](sample|proof)[\\/]/i;

function createSevenZipParser({ isDiscStructurePath, isVideoFileName }) {
  function parseSevenZipMetadata(buffer) {
    const reader = { buf: buffer, pos: 0 };
    try {
      const rootId = sz_readByte(reader);
      if (rootId === 0x17) {
        try {
          const info = sz_parseEncodedHeaderInfo(reader);
          return { compressed: false, encodedHeader: true, encodedInfo: info, debug: { rootId: '0x17-encoded', ...info } };
        } catch (err) {
          return { compressed: false, encodedHeader: true, debug: { rootId: '0x17-encoded', parseError: err?.message } };
        }
      }
      if (rootId !== 0x01) return { error: 'unexpected-root-id' };

      let streamsResult = null;
      let filenames = null;
      while (true) {
        const sectionId = sz_readByte(reader);
        if (sectionId === 0x00) break;
        if (sectionId === 0x04) {
          streamsResult = sz_parseStreamsInfo(reader);
        } else if (sectionId === 0x02) {
          sz_skipPropertyBlock(reader);
        } else if (sectionId === 0x03) {
          return { error: 'additional-streams-before-main' };
        } else if (sectionId === 0x05) {
          filenames = sz_parseFilesInfo(reader);
        } else {
          return { error: `unsupported-section-${sectionId}` };
        }
      }
      const compressed = streamsResult ? streamsResult.compressed : false;
      return { compressed, debug: streamsResult?.debug, filenames: filenames || [] };
    } catch (err) {
      return { error: err?.message || 'parse-exception' };
    }
  }

  function detectNestedArchive(filenames) {
    for (const name of filenames) {
      const match = NESTED_ARCHIVE_RE.exec(name);
      if (match) return match[1].toLowerCase();
    }
    return null;
  }

  function hasDiscStructure(filenames) {
    for (const name of filenames) {
      if (isDiscStructurePath(name)) return true;
    }
    return false;
  }

  function hasPlayableVideo(filenames) {
    for (const name of filenames) {
      if (!name) continue;
      if (SAMPLE_PROOF_FOLDER_RE.test(name)) continue;
      if (isVideoFileName(name)) return true;
    }
    return false;
  }

  function sz_parseStreamsInfo(reader) {
    let copyOnly = false;
    let sawUnpack = false;
    let debug = null;
    let numFolders = 0;
    let folders = [];
    while (true) {
      const id = sz_readByte(reader);
      if (id === 0x00) break;
      if (id === 0x06) {
        sz_skipPackInfo(reader);
      } else if (id === 0x07) {
        const result = sz_parseUnpackInfo(reader);
        copyOnly = result.copyOnly;
        debug = result.debug;
        numFolders = result.numFolders;
        folders = result.folders;
        sawUnpack = true;
      } else if (id === 0x08) {
        sz_skipSubStreamsInfo(reader, numFolders, folders);
      } else {
        throw new Error(`unsupported-streams-block-${id}`);
      }
    }
    return { copyOnly: sawUnpack ? copyOnly : false, compressed: sawUnpack ? !copyOnly : false, debug };
  }

  function sz_parseUnpackInfo(reader) {
    if (sz_readByte(reader) !== 0x0B) throw new Error('expected-kFolder');
    const numFolders = sz_readNumber(reader);
    if (sz_readByte(reader) !== 0) throw new Error('external-folders-unsupported');

    let allCopy = true;
    const folders = [];
    const coderDebug = [];
    for (let i = 0; i < numFolders; i++) {
      const folder = sz_parseFolder(reader);
      folders.push(folder);
      if (!folder.copyOnly) allCopy = false;
      coderDebug.push(folder.coderInfo);
    }

    if (sz_readByte(reader) !== 0x0C) throw new Error('expected-kCodersUnpackSize');
    for (const folder of folders) {
      for (let i = 0; i < folder.totalOutStreams; i++) sz_readNumber(reader);
    }

    const nextId = sz_readByte(reader);
    if (nextId === 0x0A) {
      sz_skipBoolVector(reader, numFolders, true);
      if (sz_readByte(reader) !== 0x00) throw new Error('expected-kEnd-after-crc');
    } else if (nextId !== 0x00) {
      throw new Error('unexpected-after-unpack');
    }

    return { copyOnly: allCopy, numFolders, folders, debug: { numFolders, coderDebug } };
  }

  function sz_parseFolder(reader) {
    const numCoders = sz_readNumber(reader);
    if (numCoders <= 0 || numCoders > 32) throw new Error('bad-coder-count');
    let totalIn = 0;
    let totalOut = 0;
    let copyOnly = true;
    const coderInfo = [];
    for (let i = 0; i < numCoders; i++) {
      const mainByte = sz_readByte(reader);
      const idSize = mainByte & 0x0F;
      const isSimple = (mainByte & 0x10) === 0;
      const hasAttributes = (mainByte & 0x20) !== 0;
      const methodId = idSize > 0 ? sz_readBytes(reader, idSize) : Buffer.alloc(0);
      const inStreams = isSimple ? 1 : sz_readNumber(reader);
      const outStreams = isSimple ? 1 : sz_readNumber(reader);
      if (hasAttributes) {
        const attrSize = sz_readNumber(reader);
        sz_skip(reader, attrSize);
      }
      totalIn += inStreams;
      totalOut += outStreams;
      const methodHex = Buffer.from(methodId).toString('hex');
      const isCopy = (idSize === 1 && methodId[0] === 0x00) || idSize === 0;
      const isAES = methodHex.startsWith('06f107');
      if (!isCopy && !isAES) copyOnly = false;
      coderInfo.push({ mainByte: `0x${mainByte.toString(16)}`, idSize, methodHex, isCopy });
    }
    const numBindPairs = totalOut > 0 ? totalOut - 1 : 0;
    for (let i = 0; i < numBindPairs; i++) { sz_readNumber(reader); sz_readNumber(reader); }
    const numPacked = totalIn - numBindPairs;
    if (numPacked > 1) { for (let i = 0; i < numPacked; i++) sz_readNumber(reader); }
    return { copyOnly, totalOutStreams: totalOut, coderInfo };
  }

  function sz_skipPackInfo(reader) {
    sz_readNumber(reader);
    const numPackStreams = sz_readNumber(reader);
    while (true) {
      const id = sz_readByte(reader);
      if (id === 0x00) break;
      if (id === 0x09) {
        for (let i = 0; i < numPackStreams; i++) sz_readNumber(reader);
      } else if (id === 0x0A) {
        sz_skipBoolVector(reader, numPackStreams, true);
      } else {
        const size = sz_readNumber(reader);
        sz_skip(reader, size);
      }
    }
  }

  function sz_skipPropertyBlock(reader) {
    while (true) {
      const id = sz_readByte(reader);
      if (id === 0x00) break;
      const size = sz_readNumber(reader);
      sz_skip(reader, size);
    }
  }

  function sz_skipSubStreamsInfo(reader, numFolders) {
    const numSubStreams = new Array(numFolders).fill(1);
    let totalSubStreams = numFolders;
    while (true) {
      const id = sz_readByte(reader);
      if (id === 0x00) break;
      if (id === 0x0D) {
        totalSubStreams = 0;
        for (let i = 0; i < numFolders; i++) {
          numSubStreams[i] = sz_readNumber(reader);
          totalSubStreams += numSubStreams[i];
        }
      } else if (id === 0x09) {
        for (let i = 0; i < numFolders; i++) {
          for (let j = 0; j < numSubStreams[i] - 1; j++) sz_readNumber(reader);
        }
      } else if (id === 0x0A) {
        sz_skipBoolVector(reader, totalSubStreams, true);
      } else {
        const size = sz_readNumber(reader);
        sz_skip(reader, size);
      }
    }
  }

  function sz_parseFilesInfo(reader) {
    const numFiles = sz_readNumber(reader);
    if (numFiles < 0 || numFiles > 100000) throw new Error('bad-file-count');
    const filenames = [];
    while (true) {
      const propType = sz_readByte(reader);
      if (propType === 0x00) break;
      const size = sz_readNumber(reader);
      if (propType === 0x11) {
        const external = sz_readByte(reader);
        if (external !== 0) {
          sz_skip(reader, size - 1);
        } else {
          const namesData = sz_readBytes(reader, size - 1);
          let start = 0;
          for (let i = 0; i < numFiles; i++) {
            let end = start;
            while (end + 1 < namesData.length) {
              if (namesData[end] === 0 && namesData[end + 1] === 0) break;
              end += 2;
            }
            const nameSlice = namesData.subarray(start, end);
            try {
              filenames.push(nameSlice.swap16 ? Buffer.from(nameSlice).toString('utf16le') : new TextDecoder('utf-16le').decode(nameSlice));
            } catch { filenames.push(''); }
            start = end + 2;
          }
        }
      } else {
        sz_skip(reader, size);
      }
    }
    return filenames;
  }

  function sz_skipBoolVector(reader, count, readCrcs) {
    const allDefined = sz_readByte(reader);
    let definedCount = count;
    if (allDefined === 0) {
      definedCount = 0;
      let mask = 0;
      let value = 0;
      for (let i = 0; i < count; i++) {
        if (mask === 0) { value = sz_readByte(reader); mask = 0x80; }
        if (value & mask) definedCount++;
        mask >>= 1;
      }
    }
    if (readCrcs) {
      for (let i = 0; i < definedCount; i++) sz_skip(reader, 4);
    }
    return definedCount;
  }

  function sz_parseEncodedHeaderInfo(reader) {
    let packPos = 0;
    const packSizes = [];
    let coderMethod = null;
    let coderProperties = null;
    let unpackSize = 0;
    let numFolders = 0;
    const folderOutStreams = [];
    const allCoders = [];
    const allUnpackSizes = [];

    while (true) {
      const id = sz_readByte(reader);
      if (id === 0x00) break;
      if (id === 0x06) {
        packPos = sz_readNumber(reader);
        const numPackStreams = sz_readNumber(reader);
        while (true) {
          const subId = sz_readByte(reader);
          if (subId === 0x00) break;
          if (subId === 0x09) {
            for (let i = 0; i < numPackStreams; i++) packSizes.push(sz_readNumber(reader));
          } else if (subId === 0x0A) {
            sz_skipBoolVector(reader, numPackStreams, true);
          } else {
            const size = sz_readNumber(reader);
            sz_skip(reader, size);
          }
        }
      } else if (id === 0x07) {
        if (sz_readByte(reader) !== 0x0B) throw new Error('expected-kFolder');
        numFolders = sz_readNumber(reader);
        if (sz_readByte(reader) !== 0) throw new Error('external-folders-unsupported');
        for (let fi = 0; fi < numFolders; fi++) {
          const numCoders = sz_readNumber(reader);
          let totalIn = 0;
          let totalOut = 0;
          for (let ci = 0; ci < numCoders; ci++) {
            const mainByte = sz_readByte(reader);
            const idSize = mainByte & 0x0F;
            const isSimple = (mainByte & 0x10) === 0;
            const hasAttributes = (mainByte & 0x20) !== 0;
            const methodId = idSize > 0 ? sz_readBytes(reader, idSize) : Buffer.alloc(0);
            if (fi === 0 && ci === 0) coderMethod = Buffer.from(methodId);
            const inS = isSimple ? 1 : sz_readNumber(reader);
            const outS = isSimple ? 1 : sz_readNumber(reader);
            if (hasAttributes) {
              const attrSize = sz_readNumber(reader);
              const attrs = sz_readBytes(reader, attrSize);
              if (fi === 0 && ci === 0) coderProperties = Buffer.from(attrs);
              if (fi === 0) allCoders.push({ method: Buffer.from(methodId).toString('hex'), properties: Buffer.from(attrs) });
            } else {
              if (fi === 0) allCoders.push({ method: Buffer.from(methodId).toString('hex'), properties: null });
            }
            totalIn += inS;
            totalOut += outS;
          }
          folderOutStreams.push(totalOut);
          const numBindPairs = totalOut > 0 ? totalOut - 1 : 0;
          for (let i = 0; i < numBindPairs; i++) { sz_readNumber(reader); sz_readNumber(reader); }
          const numPacked = totalIn - numBindPairs;
          if (numPacked > 1) { for (let i = 0; i < numPacked; i++) sz_readNumber(reader); }
        }
        if (sz_readByte(reader) !== 0x0C) throw new Error('expected-kCodersUnpackSize');
        for (let fi = 0; fi < numFolders; fi++) {
          const numOut = folderOutStreams[fi] || 1;
          for (let i = 0; i < numOut; i++) {
            const s = sz_readNumber(reader);
            if (fi === 0) {
              allUnpackSizes.push(s);
              if (i === 0) unpackSize = s;
            }
          }
        }
        while (true) {
          const subId = sz_readByte(reader);
          if (subId === 0x00) break;
          if (subId === 0x0A) { sz_skipBoolVector(reader, numFolders, true); }
          else { const size = sz_readNumber(reader); sz_skip(reader, size); }
        }
      } else if (id === 0x08) {
        sz_skipSubStreamsInfo(reader, numFolders);
      } else {
        throw new Error(`unknown-encoded-section-${id}`);
      }
    }

    return {
      packPos,
      packSize: packSizes[0] || 0,
      unpackSize,
      coderMethod: coderMethod ? coderMethod.toString('hex') : null,
      coderProperties: coderProperties || null,
      coders: allCoders,
      unpackSizes: allUnpackSizes,
    };
  }

  function sz_readByte(reader) {
    if (reader.pos >= reader.buf.length) throw new Error('7z-eof');
    return reader.buf[reader.pos++];
  }
  function sz_readBytes(reader, n) {
    if (reader.pos + n > reader.buf.length) throw new Error('7z-eof');
    const slice = reader.buf.subarray(reader.pos, reader.pos + n);
    reader.pos += n;
    return slice;
  }
  function sz_skip(reader, n) {
    if (reader.pos + n > reader.buf.length) throw new Error('7z-eof');
    reader.pos += n;
  }
  function sz_readNumber(reader) {
    const b = sz_readByte(reader);
    if ((b & 0x80) === 0) return b;
    let value = BigInt(sz_readByte(reader));
    for (let i = 1; i < 8; i++) {
      const mask = 0x80 >>> i;
      if ((b & mask) === 0) {
        const high = BigInt(b & (mask - 1));
        value |= (high << BigInt(i * 8));
        return Number(value);
      }
      value |= (BigInt(sz_readByte(reader)) << BigInt(i * 8));
    }
    return Number(value);
  }

  return {
    parseSevenZipMetadata,
    detectNestedArchive,
    hasDiscStructure,
    hasPlayableVideo,
  };
}

module.exports = {
  createSevenZipParser,
};
