const crypto = require('crypto');

const RAR4_SIGNATURE = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00]);
const RAR5_SIGNATURE = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00]);

function createRarInspector({
  recordSampleEntry,
  isIsoFileName,
  isVideoFileName,
  isArchiveEntryName,
  isDiscStructurePath,
}) {
  function inspectRar4(buffer, password) {
    let offset = RAR4_SIGNATURE.length;
    let storedDetails = null;
    let nestedArchiveCount = 0;
    let playableEntryFound = false;
    const sampleEntries = [];

    while (offset + 7 <= buffer.length) {
      const headerType = buffer[offset + 2];
      const headerFlags = buffer.readUInt16LE(offset + 3);
      const headerSize = buffer.readUInt16LE(offset + 5);

      if (headerType < 0x72 || headerType > 0x7B) {
        break;
      }

      if (headerSize < 7) return { status: 'rar-corrupt-header' };
      if (offset + headerSize > buffer.length) return { status: 'rar-insufficient-data' };

      if (headerType === 0x73 && (headerFlags & 0x0080)) {
        const saltOffset = offset + headerSize;
        if (saltOffset + 8 > buffer.length) {
          return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'no-salt', archiveFlags: headerFlags } };
        }
        if (!password) {
          return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'no-password', archiveFlags: headerFlags } };
        }
        const salt = buffer.subarray(saltOffset, saltOffset + 8);
        let encryptedData = buffer.subarray(saltOffset + 8);
        const alignedLen = encryptedData.length - (encryptedData.length % 16);
        encryptedData = encryptedData.subarray(0, alignedLen);
        if (encryptedData.length < 16) {
          return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'too-short', archiveFlags: headerFlags } };
        }
        try {
          const decrypted = decryptRar3Header(encryptedData, password, salt);
          if (decrypted && decrypted.length > 7) {
            const result = inspectRar4DecryptedHeaders(decrypted, sampleEntries);
            if (result.status !== 'rar-header-not-found') return result;
          }
        } catch (_) {}
        return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'decrypt-failed', archiveFlags: headerFlags } };
      }

      let addSize = 0;

      if ((headerFlags & 0x8000) && headerType !== 0x74) {
        if (offset + 7 + 4 <= buffer.length) {
          addSize = buffer.readUInt32LE(offset + 7);
        }
      }

      if (headerType === 0x74) {
        let pos = offset + 7;
        if (pos + 11 > buffer.length) return { status: 'rar-insufficient-data' };

        const packSize = buffer.readUInt32LE(pos);
        addSize = packSize;

        pos += 4;
        pos += 4;
        pos += 1;
        pos += 4;
        pos += 4;
        if (pos >= buffer.length) return { status: 'rar-insufficient-data' };
        pos += 1;
        const methodByte = buffer[pos]; pos += 1;
        if (pos + 2 > buffer.length) return { status: 'rar-insufficient-data' };
        const nameSize = buffer.readUInt16LE(pos); pos += 2;
        pos += 4;
        if (headerFlags & 0x0100) {
          if (pos + 8 > buffer.length) return { status: 'rar-insufficient-data' };
          const highPackSize = buffer.readUInt32LE(pos);
          addSize += highPackSize * 4294967296;
          pos += 8;
        }
        if (pos + nameSize > buffer.length) return { status: 'rar-insufficient-data' };
        const name = buffer.slice(pos, pos + nameSize).toString('utf8').replace(/\0/g, '');
        recordSampleEntry(sampleEntries, name);
        if (isIsoFileName(name)) {
          return { status: 'rar-iso-image', details: { name, sampleEntries } };
        }
        const encrypted = Boolean(headerFlags & 0x0004);
        const solid = Boolean(headerFlags & 0x0010);

        if (encrypted && solid) {
          return { status: 'rar-solid-encrypted', details: { name, sampleEntries } };
        }
        if (methodByte !== 0x30) {
          return { status: 'rar-compressed', details: { name, method: methodByte, sampleEntries } };
        }

        if (!storedDetails) {
          storedDetails = { name, method: methodByte };
        }
        if (isVideoFileName(name)) {
          playableEntryFound = true;
        } else if (isArchiveEntryName(name)) {
          nestedArchiveCount += 1;
        }
        if (isDiscStructurePath(name)) {
          return { status: 'rar-disc-structure', details: { name, sampleEntries } };
        }
      }

      offset += headerSize + addSize;
    }

    if (storedDetails) {
      if (nestedArchiveCount > 0 && !playableEntryFound) {
        return {
          status: 'rar-nested-archive',
          details: { nestedEntries: nestedArchiveCount, sampleEntries },
        };
      }
      if (!playableEntryFound && sampleEntries.length > 0) {
        return { status: 'rar-no-video', details: { ...storedDetails, sampleEntries } };
      }
      return { status: 'rar-stored', details: { ...storedDetails, sampleEntries } };
    }

    return { status: 'rar-header-not-found' };
  }

  function inspectRar5(buffer, password) {
    let offset = RAR5_SIGNATURE.length;
    let nestedArchiveCount = 0;
    let playableEntryFound = false;
    let storedDetails = null;
    const sampleEntries = [];

    while (offset < buffer.length) {
      if (offset + 7 > buffer.length) break;

      let pos = offset + 4;

      const sizeRes = readRar5Vint(buffer, pos);
      if (!sizeRes) break;
      const headerSize = sizeRes.value;
      pos += sizeRes.bytes;

      const typeRes = readRar5Vint(buffer, pos);
      if (!typeRes) break;
      const headerType = typeRes.value;
      pos += typeRes.bytes;

      const flagsRes = readRar5Vint(buffer, pos);
      if (!flagsRes) break;
      const headerFlags = flagsRes.value;
      pos += flagsRes.bytes;

      let dataSize = 0;
      const hasExtraArea = (headerFlags & 0x0001) !== 0;
      const hasData = (headerFlags & 0x0002) !== 0;

      if (hasExtraArea) {
        const extraRes = readRar5Vint(buffer, pos);
        if (!extraRes) break;
        pos += extraRes.bytes;
      }

      if (hasData) {
        const dataRes = readRar5Vint(buffer, pos);
        if (!dataRes) break;
        dataSize = dataRes.value;
        pos += dataRes.bytes;
      }

      const nextBlockOffset = offset + 4 + sizeRes.bytes + headerSize + dataSize;

      if (headerType === 0x04) {
        const encVerRes = readRar5Vint(buffer, pos);
        if (!encVerRes) return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'bad-enc-header', format: 'rar5' } };
        pos += encVerRes.bytes;

        const encFlagsRes = readRar5Vint(buffer, pos);
        if (!encFlagsRes) return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'bad-enc-header', format: 'rar5' } };
        const encFlags = encFlagsRes.value;
        pos += encFlagsRes.bytes;

        if (pos + 1 > buffer.length) return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'truncated', format: 'rar5' } };
        const kdfCount = buffer[pos];
        pos += 1;

        if (pos + 16 > buffer.length) return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'truncated', format: 'rar5' } };
        const salt = buffer.subarray(pos, pos + 16);
        pos += 16;

        const hasPswCheck = (encFlags & 0x0001) !== 0;
        let pswCheck = null;
        if (hasPswCheck) {
          if (pos + 12 > buffer.length) return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'truncated', format: 'rar5' } };
          pswCheck = buffer.subarray(pos, pos + 12);
          pos += 12;
        }

        if (!password) {
          return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'no-password', format: 'rar5' } };
        }

        const iterations = 1 << kdfCount;
        const saltWithBlock = Buffer.concat([salt, Buffer.from([0, 0, 0, 1])]);
        const derivedParts = deriveRar5Key(password, saltWithBlock, iterations);

        if (hasPswCheck && pswCheck) {
          const derivedCheck = Buffer.alloc(8, 0);
          for (let i = 0; i < 32; i++) {
            derivedCheck[i % 8] ^= derivedParts[2][i];
          }
          if (!derivedCheck.equals(pswCheck.subarray(0, 8))) {
            return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'wrong-password', format: 'rar5' } };
          }
        }

        const aesKey = derivedParts[0].subarray(0, 32);
        const encOffset = nextBlockOffset;
        if (encOffset + 16 > buffer.length) {
          return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'no-encrypted-data', format: 'rar5' } };
        }

        try {
          const decryptedHeaders = decryptRar5Headers(buffer, encOffset, aesKey);
          if (decryptedHeaders && decryptedHeaders.length > 0) {
            const fakeBuffer = Buffer.concat([RAR5_SIGNATURE, decryptedHeaders]);
            const result = inspectRar5(fakeBuffer, null);
            if (result.status !== 'rar-header-not-found') return result;
          }
        } catch (_) {}

        return { status: 'rar-encrypted-headers-decrypt-fail', details: { reason: 'decrypt-failed', format: 'rar5' } };
      }

      if (headerType === 0x02) {
        const fileFlagsRes = readRar5Vint(buffer, pos);
        if (fileFlagsRes) {
          pos += fileFlagsRes.bytes;
          const fileFlags = fileFlagsRes.value;

          const unpackSizeRes = readRar5Vint(buffer, pos);
          if (unpackSizeRes) {
            pos += unpackSizeRes.bytes;

            const attrRes = readRar5Vint(buffer, pos);
            if (attrRes) {
              pos += attrRes.bytes;

              if (fileFlags & 0x0002) pos += 4;
              if (fileFlags & 0x0004) pos += 4;

              const compInfoRes = readRar5Vint(buffer, pos);
              if (compInfoRes) {
                const compInfo = compInfoRes.value;
                const methodCode = compInfo & 0x3F;
                if (methodCode !== 0) {
                  return {
                    status: 'rar-compressed',
                    details: { method: methodCode, compInfo, format: 'rar5', sampleEntries },
                  };
                }
                pos += compInfoRes.bytes;

                const hostOsRes = readRar5Vint(buffer, pos);
                if (hostOsRes) {
                  pos += hostOsRes.bytes;

                  const nameLenRes = readRar5Vint(buffer, pos);
                  if (nameLenRes) {
                    pos += nameLenRes.bytes;
                    const nameLen = nameLenRes.value;

                    if (pos + nameLen <= buffer.length) {
                      const name = buffer.slice(pos, pos + nameLen).toString('utf8');

                      if (!storedDetails) storedDetails = { name };
                      recordSampleEntry(sampleEntries, name);
                      if (isIsoFileName(name)) {
                        return { status: 'rar-iso-image', details: { name, sampleEntries } };
                      }

                      if (isVideoFileName(name)) {
                        playableEntryFound = true;
                      } else if (isArchiveEntryName(name)) {
                        nestedArchiveCount += 1;
                      }
                      if (isDiscStructurePath(name)) {
                        return { status: 'rar-disc-structure', details: { name, sampleEntries } };
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      offset = nextBlockOffset;
    }

    if (storedDetails) {
      if (nestedArchiveCount > 0 && !playableEntryFound) {
        return {
          status: 'rar-nested-archive',
          details: { nestedEntries: nestedArchiveCount, sampleEntries },
        };
      }
      if (!playableEntryFound && sampleEntries.length > 0) {
        return { status: 'rar-no-video', details: { ...storedDetails, sampleEntries } };
      }
      return { status: 'rar-stored', details: { ...storedDetails, sampleEntries } };
    }

    return { status: 'rar-header-not-found', details: { note: 'rar5-no-file-entries', sampleEntries } };
  }

  return {
    RAR4_SIGNATURE,
    RAR5_SIGNATURE,
    inspectRar4,
    inspectRar5,
  };
}

function readRar5Vint(buffer, offset) {
  let result = 0;
  let shift = 0;
  let bytes = 0;
  while (offset + bytes < buffer.length) {
    const b = buffer[offset + bytes];
    bytes += 1;
    result += (b & 0x7F) * Math.pow(2, shift);
    shift += 7;
    if ((b & 0x80) === 0) {
      return { value: result, bytes };
    }
    if (shift > 50) break;
  }
  return null;
}

function deriveRar5Key(password, salt, iterations) {
  const hmac = crypto.createHmac('sha256', Buffer.from(password, 'utf8'));
  let block = hmac.update(salt).digest();
  const finalHash = Buffer.from(block);

  const rounds = [iterations, 17, 17];
  const results = [];

  for (let x = 0; x < 3; x++) {
    for (let i = 1; i < rounds[x]; i++) {
      block = crypto.createHmac('sha256', Buffer.from(password, 'utf8')).update(block).digest();
      for (let j = 0; j < finalHash.length; j++) {
        finalHash[j] ^= block[j];
      }
    }
    results.push(Buffer.from(finalHash));
  }

  return results;
}

function decryptRar5Headers(buffer, startOffset, aesKey) {
  const chunks = [];
  let pos = startOffset;

  while (pos + 32 <= buffer.length) {
    const iv = buffer.subarray(pos, pos + 16);
    pos += 16;

    const remaining = buffer.length - pos;
    if (remaining < 16) break;

    const alignedLen = remaining - (remaining % 16);
    const encData = buffer.subarray(pos, pos + alignedLen);

    let decrypted;
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
      decipher.setAutoPadding(false);
      decrypted = Buffer.concat([decipher.update(encData), decipher.final()]);
    } catch (_) {
      break;
    }

    if (decrypted.length < 7) break;
    let dPos = 4;

    const sizeRes = readRar5Vint(decrypted, dPos);
    if (!sizeRes || sizeRes.value === 0) break;
    const headerSize = sizeRes.value;
    dPos += sizeRes.bytes;

    const typeRes = readRar5Vint(decrypted, dPos);
    if (!typeRes) break;
    const headerType = typeRes.value;
    if (headerType < 1 || headerType > 5) break;

    const headerBlockSize = 4 + sizeRes.bytes + headerSize;
    if (headerBlockSize > decrypted.length) break;

    chunks.push(decrypted.subarray(0, headerBlockSize));

    if (headerType === 5) break;

    const encBlockSize = headerBlockSize + ((16 - (headerBlockSize % 16)) % 16);
    pos += encBlockSize;
  }

  if (chunks.length === 0) return null;
  return Buffer.concat(chunks);
}

function deriveRar3Key(password, salt) {
  const passwordBytes = Buffer.from(password, 'utf8');
  const rawLength = 2 * password.length;
  const rawPassword = Buffer.alloc(rawLength + 8);
  for (let i = 0; i < password.length; i++) {
    rawPassword[i * 2] = passwordBytes[i];
    rawPassword[i * 2 + 1] = 0;
  }
  salt.copy(rawPassword, rawLength);

  const numRounds = 1 << 18;
  const blockSize = rawPassword.length + 3;
  const ivBuf = Buffer.alloc(16, 0);
  const data = Buffer.alloc(blockSize * numRounds);

  for (let i = 0; i < numRounds; i++) {
    const offset = i * blockSize;
    rawPassword.copy(data, offset);
    data[offset + rawPassword.length] = i & 0xFF;
    data[offset + rawPassword.length + 1] = (i >> 8) & 0xFF;
    data[offset + rawPassword.length + 2] = (i >> 16) & 0xFF;

    if (i % (numRounds / 16) === 0) {
      const digest = crypto.createHash('sha1').update(data.subarray(0, (i + 1) * blockSize)).digest();
      ivBuf[i / (numRounds / 16)] = digest[19];
    }
  }

  const digest = crypto.createHash('sha1').update(data).digest();
  const key = Buffer.alloc(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      key[i * 4 + j] = (
        (
          ((digest[i * 4] * 0x1000000) & 0xff000000)
          | ((digest[i * 4 + 1] * 0x10000) & 0xff0000)
          | ((digest[i * 4 + 2] * 0x100) & 0xff00)
          | (digest[i * 4 + 3] & 0xff)
        ) >>> (j * 8)
      ) & 0xFF;
    }
  }

  return { key, iv: ivBuf };
}

function decryptRar3Header(encryptedData, password, salt) {
  const { key, iv } = deriveRar3Key(password, salt);
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

function inspectRar4DecryptedHeaders(buffer, sampleEntries) {
  let offset = 0;
  let storedDetails = null;
  let nestedArchiveCount = 0;
  let playableEntryFound = false;

  while (offset + 7 <= buffer.length) {
    const headerType = buffer[offset + 2];
    const headerFlags = buffer.readUInt16LE(offset + 3);
    const headerSize = buffer.readUInt16LE(offset + 5);

    if (headerType < 0x72 || headerType > 0x7B) break;
    if (headerSize < 7) break;
    if (offset + headerSize > buffer.length) break;

    let addSize = 0;
    if ((headerFlags & 0x8000) && headerType !== 0x74) {
      if (offset + 7 + 4 <= buffer.length) {
        addSize = buffer.readUInt32LE(offset + 7);
      }
    }

    if (headerType === 0x74) {
      let pos = offset + 7;
      if (pos + 11 > buffer.length) break;

      const packSize = buffer.readUInt32LE(pos);
      addSize = packSize;
      pos += 4;
      pos += 4;
      pos += 1;
      pos += 4;
      pos += 4;
      if (pos >= buffer.length) break;
      pos += 1;
      const methodByte = buffer[pos]; pos += 1;
      if (pos + 2 > buffer.length) break;
      const nameSize = buffer.readUInt16LE(pos); pos += 2;
      pos += 4;
      if (headerFlags & 0x0100) {
        if (pos + 8 > buffer.length) break;
        const highPackSize = buffer.readUInt32LE(pos);
        addSize += highPackSize * 4294967296;
        pos += 8;
      }
      if (pos + nameSize > buffer.length) break;
      const name = buffer.slice(pos, pos + nameSize).toString('utf8').replace(/\0/g, '');
      sampleEntries.push(name);
      const encrypted = Boolean(headerFlags & 0x0004);
      const solid = Boolean(headerFlags & 0x0010);
      if (encrypted && solid) {
        return { status: 'rar-solid-encrypted', details: { name, sampleEntries, decrypted: true } };
      }
      if (methodByte !== 0x30) {
        return { status: 'rar-compressed', details: { name, method: methodByte, sampleEntries, decrypted: true } };
      }

      if (!storedDetails) storedDetails = { name, method: methodByte };
      if (/(\.mkv|\.mp4|\.mov|\.avi|\.ts|\.m4v|\.mpg|\.mpeg|\.wmv|\.flv|\.webm)$/i.test(name)) playableEntryFound = true;
      else if (/(\.rar|\.r\d{2,3}|\.zip|\.7z|\.iso)$/i.test(name)) nestedArchiveCount += 1;
      if (/(^|[\\/])(BDMV|VIDEO_TS)([\\/]|$)/i.test(name)) {
        return { status: 'rar-disc-structure', details: { name, sampleEntries, decrypted: true } };
      }
    }

    offset += headerSize + addSize;
  }

  if (storedDetails) {
    if (nestedArchiveCount > 0 && !playableEntryFound) {
      return { status: 'rar-nested-archive', details: { nestedEntries: nestedArchiveCount, sampleEntries, decrypted: true } };
    }
    if (!playableEntryFound && sampleEntries.length > 0) {
      return { status: 'rar-no-video', details: { ...storedDetails, sampleEntries, decrypted: true } };
    }
    return { status: 'rar-stored', details: { ...storedDetails, sampleEntries, decrypted: true } };
  }

  return { status: 'rar-header-not-found', details: { reason: 'no-file-entries-after-decrypt' } };
}

module.exports = {
  createRarInspector,
};
