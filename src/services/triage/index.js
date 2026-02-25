const { parseStringPromise } = require('xml2js');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const lzma = require('lzma-native');
const { isVideoFileName } = require('../../utils/parsers');
const NNTPModule = require('nntp/lib/nntp');
const NNTP = typeof NNTPModule === 'function' ? NNTPModule : NNTPModule?.NNTP;
const {
  buildDecision,
  buildFlagCounts,
  collectUniqueSegments,
  pickRandomElements,
  buildErrorDecision,
  buildPoolKey,
  runWithDeadline,
} = require('./commonHelpers');
const { createArchiveInspector } = require('./archive');
const { createNntpOps } = require('./nntpPool');
const { createSevenZipDeepInspector } = require('./archive/sevenZipDeepInspector');
const { createArchiveUtils } = require('./archiveUtils');
function timingLog(event, details) {
  const payload = details ? { ...details, ts: new Date().toISOString() } : { ts: new Date().toISOString() };
  // console.log(`[NZB TRIAGE][TIMING] ${event}`, payload);
}

const archiveUtils = createArchiveUtils({ isVideoFileName });
const {
  extractFiles,
  extractTitle,
  extractPassword,
  guessFilenameFromSubject,
  isArchiveFile,
  isArchiveEntryName,
  isIsoFileName,
  isDiscStructurePath,
  isNonVideoMediaFile,
  isSevenZipFilename,
  recordSampleEntry,
  applyHeuristicArchiveHints,
  dedupeArchiveCandidates,
  detectInconsistentRarParts,
  canonicalArchiveKey,
  selectArchiveForInspection,
  buildCandidateNames,
} = archiveUtils;

const TRIAGE_ACTIVITY_TTL_MS = 5 * 60 * 1000; // 5 mins window for keep-alives
const triageState = {
  lastTriageActivityTs: 0,
  sharedNntpPoolRecord: null,
  sharedNntpPoolBuildPromise: null,
  currentMetrics: null,
  poolStats: {
    created: 0,
    reused: 0,
    closed: 0,
  },
};

const DEFAULT_OPTIONS = {
  archiveDirs: [],
  nntpConfig: null,
  healthCheckTimeoutMs: 35000,
  maxDecodedBytes: 64 * 1024,
  nntpMaxConnections: 60,
  reuseNntpPool: true,
  nntpKeepAliveMs: 120000 ,
  maxParallelNzbs: Number.POSITIVE_INFINITY,
  statSampleCount: 1,
  archiveSampleCount: 1,
};

function markTriageActivity() {
  triageState.lastTriageActivityTs = Date.now();
}

function isTriageActivityFresh() {
  if (!triageState.lastTriageActivityTs) return false;
  return (Date.now() - triageState.lastTriageActivityTs) < TRIAGE_ACTIVITY_TTL_MS;
}

function isSharedPoolStale() {
  if (!triageState.sharedNntpPoolRecord?.pool) return false;
  if (isTriageActivityFresh()) return false;
  const lastUsed = typeof triageState.sharedNntpPoolRecord.pool.getLastUsed === 'function'
    ? triageState.sharedNntpPoolRecord.pool.getLastUsed()
    : null;
  if (Number.isFinite(lastUsed)) {
    return (Date.now() - lastUsed) >= TRIAGE_ACTIVITY_TTL_MS;
  }
  // If we cannot determine last used timestamp, assume stale so we rebuild proactively.
  return true;
}

function buildKeepAliveMessageId() {
  const randomFragment = Math.random().toString(36).slice(2, 10);
  return `<keepalive-${Date.now().toString(36)}-${randomFragment}@invalid>`;
}

function snapshotPool(pool) {
  if (!pool) return {};
  const summary = { size: pool.size ?? 0 };
  if (typeof pool.getIdleCount === 'function') summary.idle = pool.getIdleCount();
  if (typeof pool.getLastUsed === 'function') summary.idleMs = Date.now() - pool.getLastUsed();
  return summary;
}

function recordPoolCreate(pool, meta = {}) {
  triageState.poolStats.created += 1;
  if (triageState.currentMetrics) triageState.currentMetrics.poolCreates += 1;
  timingLog('nntp-pool:created', {
    ...snapshotPool(pool),
    ...meta,
    totals: { ...triageState.poolStats },
  });
}

function recordPoolReuse(pool, meta = {}) {
  triageState.poolStats.reused += 1;
  if (triageState.currentMetrics) triageState.currentMetrics.poolReuses += 1;
  timingLog('nntp-pool:reused', {
    ...snapshotPool(pool),
    ...meta,
    totals: { ...triageState.poolStats },
  });
}

async function closePool(pool, reason) {
  if (!pool) return;
  const poolSnapshot = snapshotPool(pool);
  await pool.close();
  triageState.poolStats.closed += 1;
  if (triageState.currentMetrics) triageState.currentMetrics.poolCloses += 1;
  timingLog('nntp-pool:closed', {
    reason,
    ...poolSnapshot,
    totals: { ...triageState.poolStats },
  });
}

function getInFlightPoolBuild() {
  return triageState.sharedNntpPoolBuildPromise;
}

function setInFlightPoolBuild(promise) {
  triageState.sharedNntpPoolBuildPromise = promise;
}

function clearInFlightPoolBuild(promise) {
  if (triageState.sharedNntpPoolBuildPromise === promise) {
    triageState.sharedNntpPoolBuildPromise = null;
  }
}

async function preWarmNntpPool(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  if (!config.reuseNntpPool) return;
  if (!config.nntpConfig || !NNTP) return;

  const desiredConnections = config.nntpMaxConnections ?? 1;
  const keepAliveMs = Number.isFinite(config.nntpKeepAliveMs) ? config.nntpKeepAliveMs : 0;
  const poolKey = buildPoolKey(config.nntpConfig, desiredConnections, keepAliveMs);

  // If there's already a build in progress, await it instead of starting a second one
  const existingBuild = getInFlightPoolBuild();
  if (existingBuild) {
    await existingBuild;
    return;
  }

  // If pool exists and matches config, just touch it
  if (triageState.sharedNntpPoolRecord?.key === poolKey && triageState.sharedNntpPoolRecord?.pool) {
    if (isSharedPoolStale()) {
      await closeSharedNntpPool('stale-prewarm');
    } else {
      if (typeof triageState.sharedNntpPoolRecord.pool.touch === 'function') {
        triageState.sharedNntpPoolRecord.pool.touch();
      }
      return;
    }
  }

  const buildPromise = (async () => {
    try {
      const freshPool = await createNntpPool(config.nntpConfig, desiredConnections, { keepAliveMs });
      if (triageState.sharedNntpPoolRecord?.pool) {
        try {
          await closePool(triageState.sharedNntpPoolRecord.pool, 'prewarm-replaced');
        } catch (closeErr) {
          console.warn('[NZB TRIAGE] Failed to close previous pre-warmed NNTP pool', closeErr?.message || closeErr);
        }
      }
      triageState.sharedNntpPoolRecord = { key: poolKey, pool: freshPool, keepAliveMs };
      recordPoolCreate(freshPool, { reason: 'prewarm' });
    } catch (err) {
      console.warn('[NZB TRIAGE] Failed to pre-warm NNTP pool', {
        message: err?.message,
        code: err?.code,
        name: err?.name,
      });
    }
  })();

  setInFlightPoolBuild(buildPromise);
  await buildPromise;
  clearInFlightPoolBuild(buildPromise);
}

async function triageNzbs(nzbStrings, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const sharedPoolStale = config.reuseNntpPool && isSharedPoolStale();
  markTriageActivity();
  const healthTimeoutMs = Number.isFinite(config.healthCheckTimeoutMs) && config.healthCheckTimeoutMs > 0
    ? config.healthCheckTimeoutMs
    : DEFAULT_OPTIONS.healthCheckTimeoutMs;
  const start = Date.now();
  const decisions = [];

  triageState.currentMetrics = {
    statCalls: 0,
    statSuccesses: 0,
    statMissing: 0,
    statErrors: 0,
    statDurationMs: 0,
    bodyCalls: 0,
    bodySuccesses: 0,
    bodyMissing: 0,
    bodyErrors: 0,
    bodyDurationMs: 0,
    poolCreates: 0,
    poolReuses: 0,
    poolCloses: 0,
    clientAcquisitions: 0,
  };

  let nntpError = null;
  let nntpPool = null;
  let shouldClosePool = false;
  if (config.nntpConfig && NNTP) {
    const desiredConnections = config.nntpMaxConnections ?? 1;
    const keepAliveMs = Number.isFinite(config.nntpKeepAliveMs) ? config.nntpKeepAliveMs : 0;
    const poolKey = buildPoolKey(config.nntpConfig, desiredConnections, keepAliveMs);
    const canReuseSharedPool = config.reuseNntpPool
      && !sharedPoolStale
      && triageState.sharedNntpPoolRecord?.key === poolKey
      && triageState.sharedNntpPoolRecord?.pool;

    if (canReuseSharedPool) {
      nntpPool = triageState.sharedNntpPoolRecord.pool;
      if (typeof nntpPool?.touch === 'function') {
        nntpPool.touch();
      }
      recordPoolReuse(nntpPool, { reason: 'config-match' });
    } else {
      const hadSharedPool = Boolean(triageState.sharedNntpPoolRecord?.pool);
      if (config.reuseNntpPool && hadSharedPool && !getInFlightPoolBuild()) {
        await closeSharedNntpPool(sharedPoolStale ? 'stale' : 'replaced');
      }
      try {
        if (config.reuseNntpPool) {
          let buildPromise = getInFlightPoolBuild();
          if (!buildPromise) {
            buildPromise = (async () => {
              const freshPool = await createNntpPool(config.nntpConfig, desiredConnections, { keepAliveMs });
              const creationReason = sharedPoolStale
                ? 'stale-refresh'
                : (hadSharedPool ? 'refresh' : 'bootstrap');
              triageState.sharedNntpPoolRecord = { key: poolKey, pool: freshPool, keepAliveMs };
              recordPoolCreate(freshPool, { reason: creationReason });
              return freshPool;
            })();
            setInFlightPoolBuild(buildPromise);
          }
          nntpPool = await buildPromise;
          clearInFlightPoolBuild(buildPromise);
        } else {
          const freshPool = await createNntpPool(config.nntpConfig, desiredConnections, { keepAliveMs });
          nntpPool = freshPool;
          shouldClosePool = true;
          recordPoolCreate(freshPool, { reason: 'one-shot' });
        }
      } catch (err) {
        if (config.reuseNntpPool) {
          clearInFlightPoolBuild(getInFlightPoolBuild());
        }
        console.warn('[NZB TRIAGE] Failed to create NNTP pool', {
          message: err?.message,
          code: err?.code,
          name: err?.name,
          stack: err?.stack,
          raw: err
        });
        nntpError = err;
      }
    }
  } else if (config.nntpConfig && !NNTP) {
    nntpError = new Error('nntp module unavailable');
  }

  const parallelLimit = Math.max(1, Math.min(config.maxParallelNzbs ?? Number.POSITIVE_INFINITY, nzbStrings.length));
  const results = await runWithDeadline(
    () => analyzeWithConcurrency({
      nzbStrings,
      parallelLimit,
      config,
      nntpPool,
      nntpError,
    }),
    healthTimeoutMs,
  );
  results.sort((a, b) => a.index - b.index);
  for (const { decision } of results) decisions.push(decision);

  if (shouldClosePool && nntpPool) await closePool(nntpPool, 'one-shot');
  else if (config.reuseNntpPool && nntpPool && typeof nntpPool.touch === 'function') {
    nntpPool.touch();
  }

  const elapsedMs = Date.now() - start;
  const accepted = decisions.filter((x) => x.decision === 'accept').length;
  const rejected = decisions.filter((x) => x.decision === 'reject').length;
  const blockerCounts = buildFlagCounts(decisions, 'blockers');
  const warningCounts = buildFlagCounts(decisions, 'warnings');
  const metrics = triageState.currentMetrics;
  if (metrics) metrics.poolTotals = { ...triageState.poolStats };
  triageState.currentMetrics = null;
  return { decisions, accepted, rejected, elapsedMs, blockerCounts, warningCounts, metrics };
}

async function analyzeSingleNzb(raw, ctx) {
  const parsed = await parseStringPromise(raw, { explicitArray: false, trim: true });
  const files = extractFiles(parsed);
  const blockers = new Set();
  const warnings = new Set();
  const archiveFindings = [];
  const archiveFiles = files.filter(isArchiveFile);
  const archiveCandidates = dedupeArchiveCandidates(archiveFiles);
  const checkedSegments = new Set();
  let primaryArchive = null;

  // Early NZB-level check: detect multipart RAR sets with inconsistent segment counts
  const inconsistentParts = detectInconsistentRarParts(files);
  if (inconsistentParts) {
    blockers.add('rar-inconsistent-parts');
    archiveFindings.push({
      source: 'nzb-metadata',
      filename: inconsistentParts.sample,
      subject: null,
      status: 'rar-inconsistent-parts',
      details: {
        archiveName: inconsistentParts.archiveName,
        totalParts: inconsistentParts.totalParts,
        expectedSegments: inconsistentParts.expectedSegments,
        mismatchCount: inconsistentParts.mismatchCount,
        segmentCounts: inconsistentParts.segmentCounts,
      },
    });
  }

  const runStatCheck = async (archive, segment) => {
    const segmentId = segment?.id;
    if (!segmentId || checkedSegments.has(segmentId)) return;
    checkedSegments.add(segmentId);
    try {
      await statSegment(ctx.nntpPool, segmentId);
      archiveFindings.push({
        source: 'nntp-stat',
        filename: archive.filename,
        subject: archive.subject,
        status: 'segment-ok',
        details: { segmentId },
      });
    } catch (err) {
      if (err?.code === 'STAT_MISSING' || err?.code === 430) {
        blockers.add('missing-articles');
        archiveFindings.push({
          source: 'nntp-stat',
          filename: archive.filename,
          subject: archive.subject,
          status: 'segment-missing',
          details: { segmentId },
        });
      } else {
        warnings.add('nntp-stat-error');
        archiveFindings.push({
          source: 'nntp-stat',
          filename: archive.filename,
          subject: archive.subject,
          status: 'segment-error',
          details: { segmentId, message: err?.message },
        });
      }
    }
  };

  if (archiveCandidates.length === 0) {
    warnings.add('no-archive-candidates');

    const uniqueSegments = collectUniqueSegments(files);

    if (!ctx.nntpPool) {
      if (ctx.nntpError) warnings.add(`nntp-error:${ctx.nntpError.code ?? ctx.nntpError.message}`);
      else warnings.add('nntp-disabled');
    } else if (uniqueSegments.length > 0) {
      const fallbackSampleCount = Math.max(1, Math.floor(ctx.config?.archiveSampleCount ?? 1));
      const sampledSegments = pickRandomElements(uniqueSegments, fallbackSampleCount);
      await Promise.all(sampledSegments.map(async ({ segmentId, file }) => {
        try {
          await statSegment(ctx.nntpPool, segmentId);
          archiveFindings.push({
            source: 'nntp-stat',
            filename: file.filename,
            subject: file.subject,
            status: 'segment-ok',
            details: { segmentId },
          });
        } catch (err) {
          if (err?.code === 'STAT_MISSING' || err?.code === 430) {
            blockers.add('missing-articles');
            archiveFindings.push({
              source: 'nntp-stat',
              filename: file.filename,
              subject: file.subject,
              status: 'segment-missing',
              details: { segmentId },
            });
          } else {
            warnings.add('nntp-stat-error');
            archiveFindings.push({
              source: 'nntp-stat',
              filename: file.filename,
              subject: file.subject,
              status: 'segment-error',
              details: { segmentId, message: err?.message },
            });
          }
        }
      }));
    }

    const decision = blockers.size === 0 ? 'accept' : 'reject';
    return buildDecision(decision, blockers, warnings, {
      fileCount: files.length,
      nzbTitle: extractTitle(parsed),
      nzbIndex: ctx.nzbIndex,
      archiveFindings,
    });
  }

  let storedArchiveFound = false;
  if (ctx.config.archiveDirs?.length) {
    for (const archive of archiveCandidates) {
      const localResult = await inspectLocalArchive(archive, ctx.config.archiveDirs);
      archiveFindings.push({
        source: 'local',
        filename: archive.filename,
        subject: archive.subject,
        status: localResult.status,
        path: localResult.path ?? null,
        details: localResult.details ?? null,
      });
      if (handleArchiveStatus(localResult.status, blockers, warnings)) {
        storedArchiveFound = true;
      }
    }
  }

  if (!ctx.nntpPool) {
    if (ctx.nntpError) warnings.add(`nntp-error:${ctx.nntpError.code ?? ctx.nntpError.message}`);
    else warnings.add('nntp-disabled');
  } else {
    const archiveWithSegments = selectArchiveForInspection(archiveCandidates);
    if (archiveWithSegments) {
      const nzbPassword = extractPassword(parsed);
      const nntpResult = await inspectArchiveViaNntp(archiveWithSegments, ctx, files, nzbPassword);
      archiveFindings.push({
        source: 'nntp',
        filename: archiveWithSegments.filename,
        subject: archiveWithSegments.subject,
        status: nntpResult.status,
        details: nntpResult.details ?? null,
      });
      if (nntpResult.segmentId) {
        checkedSegments.add(nntpResult.segmentId);
        if (nntpResult.status === 'rar-stored' || nntpResult.status === 'sevenzip-signature-ok') {
          archiveFindings.push({
            source: 'nntp-stat',
            filename: archiveWithSegments.filename,
            subject: archiveWithSegments.subject,
            status: 'segment-ok',
            details: { segmentId: nntpResult.segmentId },
          });
        }
      }
      primaryArchive = archiveWithSegments;
      if (handleArchiveStatus(nntpResult.status, blockers, warnings)) {
        storedArchiveFound = true;
      }
    } else {
      warnings.add('archive-no-segments');
    }
  }

  // Run STAT sampling for any archive inspection (including 7z) to detect missing articles
  const archiveInspected = Boolean(primaryArchive);
  if (ctx.nntpPool && archiveInspected && blockers.size === 0) {
    const extraStatChecks = Math.max(0, Math.floor(ctx.config?.statSampleCount ?? 0));
    if (extraStatChecks > 0 && primaryArchive?.segments?.length) {
      const availablePrimarySegments = primaryArchive.segments
        .filter((segment) => segment?.id && !checkedSegments.has(segment.id));
      const primarySamples = pickRandomElements(
        availablePrimarySegments,
        Math.min(extraStatChecks, availablePrimarySegments.length),
      );
      await Promise.all(primarySamples.map((segment) => runStatCheck(primaryArchive, segment)));
    }

    const archiveSampleCount = Math.max(0, Math.floor(ctx.config?.archiveSampleCount ?? 0));
    if (archiveSampleCount > 0) {
      const primaryKey = canonicalArchiveKey(primaryArchive?.filename || primaryArchive?.subject || '');
      const candidateArchives = archiveCandidates.filter((archive) => {
        if (!archive?.segments?.length) return false;
        const key = canonicalArchiveKey(archive.filename || archive.subject || '');
        if (primaryKey && key === primaryKey) return false;
        if (!archive.segments.some((segment) => segment?.id && !checkedSegments.has(segment.id))) return false;
        return true;
      });

      const uniqueCandidates = [];
      const seenArchiveKeys = new Set();
      candidateArchives.forEach((archive) => {
        const key = canonicalArchiveKey(archive.filename || archive.subject || '');
        if (!key || seenArchiveKeys.has(key)) return;
        seenArchiveKeys.add(key);
        uniqueCandidates.push(archive);
      });

      const sampleArchives = pickRandomElements(uniqueCandidates, archiveSampleCount);

      await Promise.all(sampleArchives.map(async (archive) => {
        const segment = archive.segments.find((entry) => entry?.id && !checkedSegments.has(entry.id));
        if (!segment) return;
        await runStatCheck(archive, segment);
      }));
    }
  }
  if (!storedArchiveFound && blockers.size === 0) warnings.add('rar-m0-unverified');

  const decision = blockers.size === 0 ? 'accept' : 'reject';
  return buildDecision(decision, blockers, warnings, {
    fileCount: files.length,
    nzbTitle: extractTitle(parsed),
    nzbIndex: ctx.nzbIndex,
    archiveFindings,
  });
}

async function analyzeWithConcurrency({ nzbStrings, parallelLimit, config, nntpPool, nntpError }) {
  const total = nzbStrings.length;
  if (total === 0) return [];
  const results = new Array(total);
  let nextIndex = 0;

  const workers = Array.from({ length: parallelLimit }, async () => {
    while (true) {
      const index = nextIndex;
      if (index >= total) break;
      nextIndex += 1;
      const nzbString = nzbStrings[index];
      const context = { config, nntpPool, nntpError, nzbIndex: index };
      try {
        const decision = await analyzeSingleNzb(nzbString, context);
        results[index] = { index, decision };
      } catch (err) {
        results[index] = { index, decision: buildErrorDecision(err, index) };
      }
    }
  });

  await Promise.all(workers);

  return results.filter(Boolean);
}

const archiveInspector = createArchiveInspector({
  recordSampleEntry,
  isIsoFileName,
  isVideoFileName,
  isArchiveEntryName,
  isDiscStructurePath,
  isNonVideoMediaFile,
});

async function inspectLocalArchive(file, archiveDirs) {
  const filename = file.filename ?? guessFilenameFromSubject(file.subject);
  if (!filename) return { status: 'missing-filename' };

  const candidateNames = buildCandidateNames(filename);
  for (const dir of archiveDirs) {
    for (const candidate of candidateNames) {
      const candidatePath = path.join(dir, candidate);
      try {
        const stat = await fs.stat(candidatePath);
        if (stat.isFile()) {
          const analysis = await analyzeArchiveFile(candidatePath);
          return { ...analysis, path: candidatePath };
        }
      } catch (err) {
        if (err.code !== 'ENOENT') return { status: 'io-error', details: err.message };
      }
    }
  }

  return { status: 'archive-not-found' };
}

async function analyzeArchiveFile(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const slice = buffer.slice(0, bytesRead);
    return inspectArchiveBuffer(slice);
  } finally {
    await handle.close();
  }
}

async function inspectArchiveViaNntp(file, ctx, allFiles, nzbPassword) {
  const segments = file.segments ?? [];
  if (segments.length === 0) return { status: 'archive-no-segments' };
  const segmentId = segments[0]?.id;
  if (!segmentId) return { status: 'archive-no-segments' };
  const effectiveFilename = file.filename || guessFilenameFromSubject(file.subject) || '';
  const isSevenZip = isSevenZipFilename(effectiveFilename);
  return runWithClient(ctx.nntpPool, async (client) => {
    // For 7z archives, perform a quick STAT check before deep inspection.
    // For RAR/ZIP, BODY fetch already validates segment existence.
    if (isSevenZip) {
      let statStart = null;
      if (triageState.currentMetrics) {
        triageState.currentMetrics.statCalls += 1;
        statStart = Date.now();
      }
      try {
        await statSegmentWithClient(client, segmentId);
        if (triageState.currentMetrics && statStart !== null) {
          triageState.currentMetrics.statSuccesses += 1;
          triageState.currentMetrics.statDurationMs += Date.now() - statStart;
        }
      } catch (err) {
        if (triageState.currentMetrics && statStart !== null) {
          triageState.currentMetrics.statDurationMs += Date.now() - statStart;
          if (err.code === 'STAT_MISSING' || err.code === 430) triageState.currentMetrics.statMissing += 1;
          else triageState.currentMetrics.statErrors += 1;
        }
        if (err.code === 'STAT_MISSING' || err.code === 430) return { status: 'stat-missing', details: { segmentId }, segmentId };
        return { status: 'stat-error', details: { segmentId, message: err.message }, segmentId };
      }

      try {
        const deepResult = await inspectSevenZipDeep(file, allFiles || [], client, nzbPassword);
        return { ...deepResult, segmentId };
      } catch (err) {
        // Deep inspection failed; fall back to signature-ok so 7z still caps at unverified_7z
        return { status: 'sevenzip-signature-ok', details: { filename: effectiveFilename, deepError: err?.message }, segmentId };
      }
    }

    let bodyStart = null;
    if (triageState.currentMetrics) {
      triageState.currentMetrics.bodyCalls += 1;
      bodyStart = Date.now();
    }

    try {
      const bodyBuffer = await fetchSegmentBodyWithClient(client, segmentId);
      const decoded = decodeYencBuffer(bodyBuffer, ctx.config.maxDecodedBytes);
      // console.log('[NZB TRIAGE] Inspecting archive buffer', {
      //   filename: file.filename,
      //   subject: file.subject,
      //   segmentId,
      //   sampleBytes: decoded.slice(0, 8).toString('hex'),
      // });
      let archiveResult = inspectArchiveBuffer(decoded, nzbPassword);
      archiveResult = applyHeuristicArchiveHints(archiveResult, decoded, { filename: effectiveFilename });
      if (archiveResult.status === 'rar-header-not-found' && /\.(rar|7z)(?:\.|$)/i.test(effectiveFilename)) {
        archiveResult = {
          status: 'rar-no-signature',
          details: {
            ...(archiveResult.details || {}),
            filename: effectiveFilename,
            firstBytes: decoded.subarray(0, 8).toString('hex'),
          },
        };
      }
      // console.log('[NZB TRIAGE] Archive inspection via NNTP', {
      //   status: archiveResult.status,
      //   details: archiveResult.details,
      //   filename: file.filename,
      //   subject: file.subject,
      // });
      if (triageState.currentMetrics) {
        triageState.currentMetrics.bodySuccesses += 1;
        triageState.currentMetrics.bodyDurationMs += Date.now() - bodyStart;
      }
      return { ...archiveResult, segmentId };
    } catch (err) {
      if (triageState.currentMetrics && bodyStart !== null) triageState.currentMetrics.bodyDurationMs += Date.now() - bodyStart;
      if (triageState.currentMetrics) {
        if (err.code === 'BODY_MISSING') triageState.currentMetrics.bodyMissing += 1;
        else triageState.currentMetrics.bodyErrors += 1;
      }
      if (err.code === 'BODY_MISSING') return { status: 'body-missing', details: { segmentId }, segmentId };
      if (err.code === 'BODY_ERROR') return { status: 'body-error', details: { segmentId, message: err.message }, segmentId };
      if (err.code === 'DECODE_ERROR') return { status: 'decode-error', details: { segmentId, message: err.message }, segmentId };
      return { status: 'body-error', details: { segmentId, message: err.message }, segmentId };
    }
  });
}

function handleArchiveStatus(status, blockers, warnings) {
  switch (status) {
    case 'rar-stored':
    case 'sevenzip-stored':
      return true;
    case 'sevenzip-signature-ok':
      warnings.add('sevenzip-signature-ok');
      break;
    case 'rar-compressed':
    case 'rar-solid-encrypted':
    case 'rar-encrypted-headers-decrypt-fail':
    case 'rar-no-video':
    case 'rar-nested-archive':
    case 'rar-corrupt-header':
    case 'sevenzip-nested-archive':
    case 'sevenzip-unsupported':
    case 'sevenzip-encrypted':
    case 'rar-iso-image':
    case 'rar-disc-structure':
    case 'rar-insufficient-data':
    case 'rar-inconsistent-parts':
    case 'rar-no-signature':
      blockers.add(status);
      break;
    case 'stat-missing':
    case 'body-missing':
      blockers.add('missing-articles');
      break;
    case 'archive-not-found':
    case 'archive-no-segments':
    case 'rar-header-not-found':
    case 'sevenzip-insufficient-data':
    case 'io-error':
    case 'stat-error':
    case 'body-error':
    case 'decode-error':
    case 'missing-filename':
      warnings.add(status);
      break;
    case 'sevenzip-untested':
      warnings.add(status);
      break;
    default:
      break;
  }
  return false;
}

function inspectArchiveBuffer(buffer, password) {
  return archiveInspector.inspectArchiveBuffer(buffer, password);
}

// ---------------------------------------------------------------------------
// 7z deep inspection: fetch start header (first segment of first part) and
// footer (last segment of last part), then parse the metadata header in pure
// JS to determine if all coders are copy-only (stored).
// ---------------------------------------------------------------------------

const nntpOps = createNntpOps({
  NNTP,
  timingLog,
  isTriageActivityFresh,
  buildKeepAliveMessageId,
});
nntpOps.setMetricsAccessor(() => triageState.currentMetrics);
const {
  statSegment,
  statSegmentWithClient,
  fetchSegmentBodyWithClient,
  createNntpPool,
  runWithClient,
  decodeYencBuffer,
} = nntpOps;

const sevenZipDeepInspector = createSevenZipDeepInspector({
  fetchSegmentBodyWithClient,
  decodeYencBuffer,
  guessFilenameFromSubject,
  isDiscStructurePath,
  isVideoFileName,
  lzma,
  crypto,
});
const { inspectSevenZipDeep } = sevenZipDeepInspector;

async function closeSharedNntpPool(reason = 'manual') {
  if (triageState.sharedNntpPoolRecord?.pool) {
    await closePool(triageState.sharedNntpPoolRecord.pool, reason);
    triageState.sharedNntpPoolRecord = null;
  }
}

async function evictStaleSharedNntpPool(reason = 'stale-timeout') {
  if (!triageState.sharedNntpPoolRecord?.pool) return false;
  if (!isSharedPoolStale()) return false;
  await closeSharedNntpPool(reason);
  return true;
}

module.exports = {
  preWarmNntpPool,
  triageNzbs,
  closeSharedNntpPool,
  evictStaleSharedNntpPool,
};
