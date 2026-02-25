function createArchiveUtils({ isVideoFileName }) {
  const ARCHIVE_EXTENSIONS = new Set(['.rar', '.r00', '.r01', '.r02', '.7z', '.zip']);
  const VIDEO_FILE_EXTENSIONS = ['.mkv', '.mp4', '.mov', '.avi', '.ts', '.m4v', '.mpg', '.mpeg', '.wmv', '.flv', '.webm'];
  const ISO_FILE_EXTENSIONS = ['.iso'];
  const ARCHIVE_SAMPLE_ENTRY_LIMIT = 5;
  const NON_VIDEO_MEDIA_EXTENSIONS = new Set([
    '.mp3', '.flac', '.wav', '.aac', '.ogg', '.wma', '.ape', '.opus', '.m4a', '.alac',
    '.dsf', '.dff', '.wv',
    '.pdf', '.epub', '.mobi', '.azw3', '.cbr', '.cbz',
  ]);

  function extractFiles(parsedNzb) {
    const filesNode = parsedNzb?.nzb?.file ?? [];
    const items = Array.isArray(filesNode) ? filesNode : [filesNode];

    return items
      .filter(Boolean)
      .map((file) => {
        const subject = file.$?.subject ?? '';
        const filename = guessFilenameFromSubject(subject);
        const extension = filename ? getExtension(filename) : undefined;
        const segments = normalizeSegments(file.segments?.segment);
        return { subject, filename, extension, segments };
      });
  }

  function normalizeSegments(segmentNode) {
    const segments = Array.isArray(segmentNode) ? segmentNode : segmentNode ? [segmentNode] : [];
    return segments.map((seg) => ({
      number: Number(seg.$?.number ?? 0),
      bytes: Number(seg.$?.bytes ?? 0),
      id: seg._ ?? '',
    }));
  }

  function extractTitle(parsedNzb) {
    const meta = parsedNzb?.nzb?.head?.meta;
    if (!meta) return null;
    const items = Array.isArray(meta) ? meta : [meta];
    const match = items.find((entry) => entry?.$?.type === 'title');
    return match?._ ?? null;
  }

  function extractPassword(parsedNzb) {
    const meta = parsedNzb?.nzb?.head?.meta;
    if (!meta) return null;
    const items = Array.isArray(meta) ? meta : [meta];
    const match = items.find((entry) => entry?.$?.type === 'password');
    return match?._ ?? null;
  }

  function guessFilenameFromSubject(subject) {
    if (!subject) return null;
    const quoted = subject.match(/"([^"\\]+)"/);
    if (quoted) return quoted[1];
    const explicit = subject.match(/([\w\-.\(\)\[\]]+\.(?:rar|r\d{2}|7z|par2|sfv|nfo|mkv|mp4|avi|mov|wmv))/i);
    if (explicit) return explicit[1];
    return null;
  }

  function isArchiveFile(file) {
    const ext = file.extension ?? getExtension(file.filename);
    if (!ext) return false;
    if (ARCHIVE_EXTENSIONS.has(ext)) return true;
    return /^\.r\d{2}$/i.test(ext);
  }

  function isArchiveEntryName(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return /\.r\d{2}(?:\b|$)/.test(lower)
      || /\.part\d+\.rar/.test(lower)
      || lower.endsWith('.rar')
      || lower.endsWith('.7z')
      || lower.endsWith('.zip');
  }

  function isIsoFileName(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return ISO_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function isDiscStructurePath(name) {
    if (!name) return false;
    const lower = name.toLowerCase().replace(/\\/g, '/');
    if (/\bbdmv\//.test(lower)) return true;
    if (/\bvideo_ts\//.test(lower)) return true;
    if (lower.endsWith('.bdjo') || lower.endsWith('.clpi') || lower.endsWith('.mpls')) return true;
    if (lower.endsWith('.bup') || lower.endsWith('.ifo') || lower.endsWith('.vob')) return true;
    return false;
  }

  function isPlayableVideoName(name) {
    if (!name) return false;
    if (!isVideoFileName(name)) return false;
    return !/sample|proof/i.test(name);
  }

  function isNonVideoMediaFile(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    const dot = lower.lastIndexOf('.');
    if (dot < 0) return false;
    return NON_VIDEO_MEDIA_EXTENSIONS.has(lower.slice(dot));
  }

  function isSevenZipFilename(name) {
    if (!name) return false;
    const lower = name.trim().toLowerCase();
    if (lower.endsWith('.7z')) return true;
    return /\.7z\.\d{2,3}$/.test(lower);
  }

  function analyzeBufferFilenames(buffer) {
    if (!buffer || buffer.length === 0) {
      return { nested: 0, playable: 0, discImages: 0, samples: [] };
    }
    const ascii = buffer.toString('latin1');
    const filenameRegex = /[A-Za-z0-9_\-()\[\]\s]{3,120}\.[A-Za-z0-9]{2,5}(?:\.[A-Za-z0-9]{2,5})?/g;
    const matches = ascii.match(filenameRegex) || [];
    let nested = 0;
    let playable = 0;
    let discImages = 0;
    const samples = [];
    matches.forEach((raw) => {
      const normalized = raw.trim().toLowerCase();
      if (!normalized) return;
      samples.push(normalized);
      if (VIDEO_FILE_EXTENSIONS.some((ext) => normalized.endsWith(ext))) {
        playable += 1;
        return;
      }
      if (ISO_FILE_EXTENSIONS.some((ext) => normalized.endsWith(ext))) {
        discImages += 1;
        return;
      }
      if (isArchiveEntryName(normalized)) {
        nested += 1;
      }
    });
    return { nested, playable, discImages, samples };
  }

  function recordSampleEntry(target, name) {
    if (!target || !name) return;
    if (target.includes(name)) return;
    if (target.length >= ARCHIVE_SAMPLE_ENTRY_LIMIT) return;
    target.push(name);
  }

  function applyHeuristicArchiveHints(result, buffer, context = {}) {
    if (!buffer || buffer.length === 0) {
      return result;
    }
    const statusLabel = String(result?.status || '').toLowerCase();
    if (statusLabel.startsWith('sevenzip')) {
      return result;
    }
    const hints = analyzeBufferFilenames(buffer);
    if (hints.discImages > 0) {
      return {
        status: 'rar-iso-image',
        details: {
          ...(result.details || {}),
          discImages: hints.discImages,
          heuristic: true,
          sample: hints.samples[0] || null,
          filename: context.filename || null,
        }
      };
    }
    if (hints.nested > 0 && hints.playable === 0) {
      const detailPatch = {
        ...(result.details || {}),
        nestedEntries: hints.nested,
        heuristic: true,
        sample: hints.samples[0] || null,
        filename: context.filename || null,
      };
      if (result.status.startsWith('sevenzip')) {
        return { status: 'sevenzip-nested-archive', details: detailPatch };
      }
      if (result.status === 'rar-stored') {
        return { status: 'rar-nested-archive', details: detailPatch };
      }
    }
    return result;
  }

  function getExtension(filename) {
    if (!filename) return undefined;
    const lower = filename.toLowerCase();
    const splitMatch = lower.match(/\.(rar|7z|zip)\.(?:part)?\d{2,3}$/);
    if (splitMatch) return `.${splitMatch[1]}`;
    const partMatch = lower.match(/\.part\d+\.(rar|7z|zip)$/);
    if (partMatch) return `.${partMatch[1]}`;
    const lastDot = lower.lastIndexOf('.');
    if (lastDot === -1) return undefined;
    return lower.slice(lastDot);
  }

  function dedupeArchiveCandidates(archives) {
    const seen = new Set();
    const result = [];
    for (const archive of archives) {
      const key = canonicalArchiveKey(archive.filename ?? archive.subject ?? '');
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(archive);
    }
    return result;
  }

  const PARTNN_RAR_RE = /^(.+)\.part(\d+)\.rar$/i;
  function detectInconsistentRarParts(files) {
    const groups = new Map();
    for (const file of files) {
      const name = file.filename || guessFilenameFromSubject(file.subject) || '';
      const m = PARTNN_RAR_RE.exec(name);
      if (!m) continue;
      const archiveName = m[1].toLowerCase();
      const partNum = parseInt(m[2], 10);
      const segCount = Array.isArray(file.segments) ? file.segments.length : 0;
      if (!groups.has(archiveName)) groups.set(archiveName, []);
      groups.get(archiveName).push({ partNum, segCount, filename: name });
    }

    for (const [archiveName, parts] of groups) {
      if (parts.length < 3) continue;
      parts.sort((a, b) => a.partNum - b.partNum);
      const allButLast = parts.slice(0, -1);
      if (allButLast.length < 2) continue;
      const expectedSize = allButLast[0].segCount;
      if (expectedSize === 0) continue;
      const mismatchCount = allButLast.filter((p) => p.segCount !== expectedSize).length;
      if (mismatchCount > 0 && mismatchCount / allButLast.length > 0.2) {
        const sizes = parts.map((p) => p.segCount);
        return {
          archiveName,
          totalParts: parts.length,
          expectedSegments: expectedSize,
          mismatchCount,
          segmentCounts: sizes,
          sample: parts.find((p) => p.segCount !== expectedSize)?.filename || null,
        };
      }
    }
    return null;
  }

  function canonicalArchiveKey(name) {
    if (!name) return null;
    return name.toLowerCase();
  }

  function selectArchiveForInspection(archives) {
    if (!Array.isArray(archives) || archives.length === 0) return null;
    const candidates = archives
      .filter((archive) => archive.segments && archive.segments.length > 0)
      .map((archive) => ({ archive, score: buildArchiveScore(archive) }))
      .sort((a, b) => b.score - a.score);
    return candidates.length > 0 ? candidates[0].archive : null;
  }

  function buildArchiveScore(archive) {
    const filename = archive.filename || guessFilenameFromSubject(archive.subject) || '';
    let score = 0;
    if (/\.rar$/i.test(filename)) score += 10;
    if (/\.r\d{2}$/i.test(filename)) score += 9;
    if (/\.part\d+\.rar$/i.test(filename)) score += 8;
    if (/\.7z$/i.test(filename)) score += 10;
    if (/\.7z\.001$/i.test(filename)) score += 10;
    if (/\.7z\.\d{3}$/i.test(filename)) score += 9;
    if (/proof|sample|nfo/i.test(filename)) score -= 5;
    if (isVideoFileName(filename)) score += 4;
    return score;
  }

  function buildCandidateNames(filename) {
    const candidates = new Set();
    candidates.add(filename);

    if (/\.part\d+\.rar$/i.test(filename)) {
      candidates.add(filename.replace(/\.part\d+\.rar$/i, '.rar'));
    }

    if (/\.r\d{2}$/i.test(filename)) {
      candidates.add(filename.replace(/\.r\d{2}$/i, '.rar'));
    }

    return Array.from(candidates);
  }

  return {
    extractFiles,
    normalizeSegments,
    extractTitle,
    extractPassword,
    guessFilenameFromSubject,
    isArchiveFile,
    isArchiveEntryName,
    isIsoFileName,
    isDiscStructurePath,
    isPlayableVideoName,
    isNonVideoMediaFile,
    isSevenZipFilename,
    analyzeBufferFilenames,
    recordSampleEntry,
    applyHeuristicArchiveHints,
    getExtension,
    dedupeArchiveCandidates,
    detectInconsistentRarParts,
    canonicalArchiveKey,
    selectArchiveForInspection,
    buildArchiveScore,
    buildCandidateNames,
  };
}

module.exports = {
  createArchiveUtils,
};
