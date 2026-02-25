const { findSevenZipParts } = require('./sevenzip/parts');
const { createSevenZipParser } = require('./sevenzip/parser');
const { createSevenZipCrypto } = require('./sevenzip/cryptoUtils');
const { createSevenZipLzma } = require('./sevenzip/lzmaUtils');
const { createEncodedHeaderInspector } = require('./sevenzip/encodedHeader');

function createSevenZipDeepInspector({
  fetchSegmentBodyWithClient,
  decodeYencBuffer,
  guessFilenameFromSubject,
  isDiscStructurePath,
  isVideoFileName,
  lzma,
  crypto,
}) {
  const SEVENZIP_SIGNATURE = Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]);

  const parser = createSevenZipParser({
    isDiscStructurePath,
    isVideoFileName,
  });
  const sevenZipCrypto = createSevenZipCrypto({ crypto });
  const sevenZipLzma = createSevenZipLzma({ lzma });
  const encodedHeaderInspector = createEncodedHeaderInspector({
    decrypt7zAES: sevenZipCrypto.decrypt7zAES,
    decompressLzmaBuffer: sevenZipLzma.decompressLzmaBuffer,
  });

  async function inspectSevenZipDeep(file, allFiles, client, nzbPassword) {
    const parts = findSevenZipParts(allFiles, file, guessFilenameFromSubject);
    const firstPart = parts[0];
    const lastPart = parts[parts.length - 1];

    const firstSegments = firstPart.segments ?? [];
    if (firstSegments.length === 0) {
      return { status: 'sevenzip-signature-ok', details: { reason: 'no-first-segments' } };
    }
    const firstSegId = firstSegments[0]?.id;
    if (!firstSegId) {
      return { status: 'sevenzip-signature-ok', details: { reason: 'no-first-segment-id' } };
    }

    const headerBody = await fetchSegmentBodyWithClient(client, firstSegId);
    const headerBuf = decodeYencBuffer(headerBody, 2 * 1024 * 1024);

    if (headerBuf.length < 32 || !headerBuf.subarray(0, 6).equals(SEVENZIP_SIGNATURE)) {
      return { status: 'sevenzip-insufficient-data', details: { reason: 'invalid-signature' } };
    }

    const nextHeaderSize = Number(headerBuf.readBigUInt64LE(20));
    if (nextHeaderSize <= 0 || nextHeaderSize > 10 * 1024 * 1024) {
      return { status: 'sevenzip-signature-ok', details: { reason: 'metadata-too-large', nextHeaderSize } };
    }

    const lastSegments = lastPart.segments ?? [];
    if (lastSegments.length === 0) {
      return { status: 'sevenzip-signature-ok', details: { reason: 'no-last-segments' } };
    }
    const lastSegId = lastSegments[lastSegments.length - 1]?.id;
    if (!lastSegId) {
      return { status: 'sevenzip-signature-ok', details: { reason: 'no-last-segment-id' } };
    }

    const footerBody = await fetchSegmentBodyWithClient(client, lastSegId);
    const footerBuf = decodeYencBuffer(footerBody, 2 * 1024 * 1024);
    if (footerBuf.length < nextHeaderSize) {
      return { status: 'sevenzip-signature-ok', details: { reason: 'footer-too-small', footerLen: footerBuf.length, needed: nextHeaderSize } };
    }

    const attempts = [footerBuf.subarray(footerBuf.length - nextHeaderSize)];
    for (let offset = footerBuf.length - nextHeaderSize; offset >= Math.max(0, footerBuf.length - nextHeaderSize - 256); offset--) {
      const byte = footerBuf[offset];
      if ((byte === 0x01 || byte === 0x17) && offset !== footerBuf.length - nextHeaderSize) {
        attempts.push(footerBuf.subarray(offset));
        break;
      }
    }

    let lastError = null;
    for (const metadataSlice of attempts) {
      const parseResult = parser.parseSevenZipMetadata(metadataSlice);
      if (parseResult.error) {
        lastError = {
          error: parseResult.error,
          sliceLen: metadataSlice.length,
          firstBytes: metadataSlice.subarray(0, Math.min(8, metadataSlice.length)).toString('hex'),
        };
        continue;
      }

      if (parseResult.encodedHeader && parseResult.encodedInfo) {
        try {
          const realHeader = await encodedHeaderInspector.decompressEncodedHeader(parseResult.encodedInfo, footerBuf, nextHeaderSize);
          if (realHeader) {
            const innerResult = parser.parseSevenZipMetadata(realHeader);
            if (!innerResult.error && !innerResult.encodedHeader) {
              const fnames = innerResult.filenames || [];
              const nestedArchive = parser.detectNestedArchive(fnames);
              if (innerResult.compressed) {
                return { status: 'sevenzip-unsupported', details: { reason: 'compressed-coder-detected', nextHeaderSize, footerLen: footerBuf.length, encodedHeader: true, debug: innerResult.debug, filenames: fnames } };
              }
              if (nestedArchive) {
                return { status: 'sevenzip-nested-archive', details: { reason: 'nested-archive-detected', nestedType: nestedArchive, nextHeaderSize, footerLen: footerBuf.length, encodedHeader: true, filenames: fnames } };
              }
              if (parser.hasDiscStructure(fnames)) {
                return { status: 'sevenzip-unsupported', details: { reason: 'disc-structure-detected', nextHeaderSize, footerLen: footerBuf.length, encodedHeader: true, filenames: fnames } };
              }
              const innerStatus = parser.hasPlayableVideo(fnames) ? 'sevenzip-stored' : 'sevenzip-signature-ok';
              return { status: innerStatus, details: { reason: 'copy-only-confirmed', nextHeaderSize, footerLen: footerBuf.length, encodedHeader: true, debug: innerResult.debug, filenames: fnames } };
            }
            return { status: 'sevenzip-signature-ok', details: { reason: 'encoded-header-inner-parse-failed', nextHeaderSize, footerLen: footerBuf.length, innerError: innerResult.error, realHeaderLen: realHeader.length, realHeaderFirst8: realHeader.subarray(0, Math.min(8, realHeader.length)).toString('hex') } };
          }

          const method = parseResult.encodedInfo?.coderMethod || '';
          if (method.startsWith('06f107')) {
            if (nzbPassword && parseResult.encodedInfo.coders?.length >= 1) {
              try {
                const decryptedHeader = await encodedHeaderInspector.decryptEncodedHeader(parseResult.encodedInfo, footerBuf, nextHeaderSize, nzbPassword);
                if (decryptedHeader) {
                  const innerResult = parser.parseSevenZipMetadata(decryptedHeader);
                  if (!innerResult.error && !innerResult.encodedHeader) {
                    const fnames = innerResult.filenames || [];
                    const nestedArchive = parser.detectNestedArchive(fnames);
                    if (innerResult.compressed) {
                      return { status: 'sevenzip-unsupported', details: { reason: 'encrypted-compressed-coder', nextHeaderSize, footerLen: footerBuf.length, encodedHeader: true, encrypted: true, debug: innerResult.debug, filenames: fnames } };
                    }
                    if (nestedArchive) {
                      return { status: 'sevenzip-nested-archive', details: { reason: 'encrypted-nested-archive', nestedType: nestedArchive, nextHeaderSize, footerLen: footerBuf.length, encodedHeader: true, encrypted: true, filenames: fnames } };
                    }
                    if (parser.hasDiscStructure(fnames)) {
                      return { status: 'sevenzip-unsupported', details: { reason: 'encrypted-disc-structure', nextHeaderSize, footerLen: footerBuf.length, encodedHeader: true, encrypted: true, filenames: fnames } };
                    }
                    const innerStatus = parser.hasPlayableVideo(fnames) ? 'sevenzip-stored' : 'sevenzip-signature-ok';
                    return { status: innerStatus, details: { reason: 'encrypted-copy-confirmed', nextHeaderSize, footerLen: footerBuf.length, encodedHeader: true, encrypted: true, debug: innerResult.debug, filenames: fnames } };
                  }
                }
              } catch (_) {}
            }
            return { status: 'sevenzip-encrypted', details: { reason: 'aes-encrypted-header', nextHeaderSize, footerLen: footerBuf.length, encodedInfo: parseResult.encodedInfo } };
          }
          return { status: 'sevenzip-signature-ok', details: { reason: 'encoded-header-decompress-null', nextHeaderSize, footerLen: footerBuf.length, encodedInfo: parseResult.encodedInfo } };
        } catch (decompErr) {
          return { status: 'sevenzip-signature-ok', details: { reason: 'encoded-header-decompress-error', nextHeaderSize, footerLen: footerBuf.length, decompError: decompErr?.message, encodedInfo: parseResult.encodedInfo } };
        }
      }

      if (parseResult.encodedHeader) {
        return { status: 'sevenzip-signature-ok', details: { reason: 'encoded-header-no-info', nextHeaderSize, footerLen: footerBuf.length, debug: parseResult.debug } };
      }

      if (parseResult.compressed) {
        return { status: 'sevenzip-unsupported', details: { reason: 'compressed-coder-detected', nextHeaderSize, footerLen: footerBuf.length, debug: parseResult.debug, filenames: parseResult.filenames || [] } };
      }
      const fnames = parseResult.filenames || [];
      const nestedArchive = parser.detectNestedArchive(fnames);
      if (nestedArchive) {
        return { status: 'sevenzip-nested-archive', details: { reason: 'nested-archive-detected', nestedType: nestedArchive, nextHeaderSize, footerLen: footerBuf.length, filenames: fnames } };
      }
      if (parser.hasDiscStructure(fnames)) {
        return { status: 'sevenzip-unsupported', details: { reason: 'disc-structure-detected', nextHeaderSize, footerLen: footerBuf.length, filenames: fnames } };
      }
      const finalStatus = parser.hasPlayableVideo(fnames) ? 'sevenzip-stored' : 'sevenzip-signature-ok';
      return { status: finalStatus, details: { reason: 'copy-only-confirmed', nextHeaderSize, footerLen: footerBuf.length, debug: parseResult.debug, filenames: fnames } };
    }

    return {
      status: 'sevenzip-signature-ok',
      details: {
        reason: 'metadata-parse-error',
        message: lastError?.error || '7z-eof',
        nextHeaderSize,
        footerLen: footerBuf.length,
        sliceLen: lastError?.sliceLen,
        firstBytes: lastError?.firstBytes,
      },
    };
  }

  return {
    inspectSevenZipDeep,
  };
}

module.exports = {
  createSevenZipDeepInspector,
};
