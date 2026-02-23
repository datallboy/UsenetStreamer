function buildDecision(decision, blockers, warnings, meta) {
  return {
    decision,
    blockers: Array.from(blockers),
    warnings: Array.from(warnings),
    ...meta,
  };
}

function buildFlagCounts(decisions, property) {
  const counts = {};
  for (const decision of decisions) {
    const items = decision?.[property];
    if (!items || items.length === 0) continue;
    for (const item of items) {
      counts[item] = (counts[item] ?? 0) + 1;
    }
  }
  return counts;
}

function pickRandomSubset(items, fraction) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const desiredCount = Math.max(1, Math.ceil(items.length * fraction));
  const shuffled = items.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(desiredCount, shuffled.length));
}

function collectUniqueSegments(files) {
  const unique = [];
  const seen = new Set();
  for (const file of files) {
    if (!file?.segments) continue;
    for (const segment of file.segments) {
      const segmentId = segment?.id;
      if (!segmentId || seen.has(segmentId)) continue;
      seen.add(segmentId);
      unique.push({ file, segmentId });
    }
  }
  return unique;
}

function pickRandomElements(items, maxCount) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const count = Math.min(maxCount, items.length);
  const shuffled = items.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function buildErrorDecision(err, nzbIndex) {
  const blockers = new Set(['analysis-error']);
  const warnings = new Set();
  if (err?.code) warnings.add(`code:${err.code}`);
  if (err?.message) warnings.add(err.message);
  if (warnings.size === 0) warnings.add('analysis-failed');
  return buildDecision('reject', blockers, warnings, {
    fileCount: 0,
    nzbTitle: null,
    nzbIndex,
    archiveFindings: [],
  });
}

function buildPoolKey(config, connections, keepAliveMs = 0) {
  return [
    config.host,
    config.port ?? 119,
    config.user ?? '',
    config.useTLS ? 'tls' : 'plain',
    connections,
    keepAliveMs,
  ].join('|');
}

function runWithDeadline(factory, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return factory();
  let timer = null;
  let operationPromise;
  try {
    operationPromise = factory();
  } catch (err) {
    return Promise.reject(err);
  }
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Health check timed out');
      error.code = 'HEALTHCHECK_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

module.exports = {
  buildDecision,
  buildFlagCounts,
  pickRandomSubset,
  collectUniqueSegments,
  pickRandomElements,
  buildErrorDecision,
  buildPoolKey,
  runWithDeadline,
};
