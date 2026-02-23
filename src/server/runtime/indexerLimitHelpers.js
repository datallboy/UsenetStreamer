function createIndexerLimitHelpers({
  state,
  normalizeIndexerToken,
  normalizeReleaseTitle,
  getPublishMetadataFromResult,
  areReleasesWithinDays,
  dedupeMaxPublishDiffDays,
}) {
  function getPaidDirectIndexerTokens(configs = state.ACTIVE_NEWZNAB_CONFIGS) {
    return configs
      .filter((config) => config && config.isPaid && !config.zyclopsEnabled)
      .map((config) => normalizeIndexerToken(config.slug || config.dedupeKey || config.displayName || config.id))
      .filter(Boolean);
  }

  function refreshPaidIndexerTokens() {
    const tokens = new Set();
    (state.TRIAGE_PRIORITY_INDEXERS || []).forEach((token) => {
      const normalized = normalizeIndexerToken(token);
      if (normalized) tokens.add(normalized);
    });
    getPaidDirectIndexerTokens(state.ACTIVE_NEWZNAB_CONFIGS).forEach((token) => {
      if (token) tokens.add(token);
    });
    state.paidIndexerTokens = tokens;
  }

  function isResultFromPaidIndexer(result) {
    if (!result || state.paidIndexerTokens.size === 0) return false;
    const tokens = [
      normalizeIndexerToken(result.indexerId || result.IndexerId),
      normalizeIndexerToken(result.indexer || result.Indexer),
    ].filter(Boolean);
    if (tokens.length === 0) return false;
    return tokens.some((token) => state.paidIndexerTokens.has(token));
  }

  function dedupeResultsByTitle(results) {
    if (!Array.isArray(results) || results.length === 0) return [];
    const buckets = new Map();
    const deduped = [];
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const normalizedTitle = normalizeReleaseTitle(result.title);
      const publishMeta = getPublishMetadataFromResult(result);
      if (publishMeta.publishDateMs && !result.publishDateMs) {
        result.publishDateMs = publishMeta.publishDateMs;
      }
      if (publishMeta.publishDateIso && !result.publishDateIso) {
        result.publishDateIso = publishMeta.publishDateIso;
      }
      if ((publishMeta.ageDays ?? null) !== null && (result.ageDays === undefined || result.ageDays === null)) {
        result.ageDays = publishMeta.ageDays;
      }
      if (!normalizedTitle) {
        deduped.push(result);
        continue;
      }
      let bucket = buckets.get(normalizedTitle);
      if (!bucket) {
        bucket = [];
        buckets.set(normalizedTitle, bucket);
      }
      const candidatePublish = publishMeta.publishDateMs ?? null;
      const candidateIsPaid = isResultFromPaidIndexer(result);
      let matchedEntry = null;
      for (const entry of bucket) {
        if (areReleasesWithinDays(entry.publishDateMs ?? null, candidatePublish ?? null, dedupeMaxPublishDiffDays)) {
          matchedEntry = entry;
          break;
        }
      }
      if (!matchedEntry) {
        const entry = {
          publishDateMs: candidatePublish,
          isPaid: candidateIsPaid,
          result,
          listIndex: deduped.length,
        };
        bucket.push(entry);
        deduped.push(result);
        continue;
      }
      if (candidateIsPaid && !matchedEntry.isPaid) {
        matchedEntry.isPaid = true;
        matchedEntry.publishDateMs = candidatePublish;
        matchedEntry.result = result;
        deduped[matchedEntry.listIndex] = result;
        continue;
      }
      if (candidateIsPaid === matchedEntry.isPaid) {
        const existingPublish = matchedEntry.publishDateMs;
        if (candidatePublish !== null && (existingPublish === null || candidatePublish > existingPublish)) {
          matchedEntry.publishDateMs = candidatePublish;
          matchedEntry.result = result;
          deduped[matchedEntry.listIndex] = result;
        }
      }
    }
    return deduped;
  }

  function buildPaidIndexerLimitMap(configs = state.ACTIVE_NEWZNAB_CONFIGS) {
    const limitMap = new Map();
    (configs || []).forEach((config) => {
      if (!config || !config.isPaid || config.zyclopsEnabled) return;
      const limit = Number.isFinite(config.paidLimit) ? config.paidLimit : 6;
      const tokens = [
        config.slug,
        config.dedupeKey,
        config.displayName,
        config.name,
        config.id,
      ].map((token) => normalizeIndexerToken(token)).filter(Boolean);
      tokens.forEach((token) => {
        const existing = limitMap.get(token);
        if (!existing || limit < existing) {
          limitMap.set(token, limit);
        }
      });
    });
    return limitMap;
  }

  function buildManagerIndexerLimitMap() {
    if (state.INDEXER_MANAGER === 'none') {
      return new Map();
    }
    const limitMap = new Map();
    const indexers = state.TRIAGE_PRIORITY_INDEXERS || [];
    const limits = state.TRIAGE_PRIORITY_INDEXER_LIMITS || [];
    indexers.forEach((indexer, idx) => {
      const token = normalizeIndexerToken(indexer);
      if (!token) return;
      const rawLimit = limits[idx];
      const parsed = rawLimit !== undefined ? Number(String(rawLimit).trim()) : NaN;
      const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 6;
      const existing = limitMap.get(token);
      if (!existing || limit < existing) {
        limitMap.set(token, limit);
      }
    });
    return limitMap;
  }

  function buildCombinedLimitMap(configs = state.ACTIVE_NEWZNAB_CONFIGS) {
    const newznabMap = buildPaidIndexerLimitMap(configs);
    const managerMap = buildManagerIndexerLimitMap();
    const combined = new Map(newznabMap);
    managerMap.forEach((limit, token) => {
      const existing = combined.get(token);
      if (!existing || limit < existing) {
        combined.set(token, limit);
      }
    });
    return combined;
  }

  return {
    getPaidDirectIndexerTokens,
    refreshPaidIndexerTokens,
    isResultFromPaidIndexer,
    dedupeResultsByTitle,
    buildPaidIndexerLimitMap,
    buildManagerIndexerLimitMap,
    buildCombinedLimitMap,
  };
}

module.exports = {
  createIndexerLimitHelpers,
};
