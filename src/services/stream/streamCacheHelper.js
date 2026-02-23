function hydrateStreamCache({
  streamCacheKey,
  cache,
  type,
  id,
  restoreTriageDecisions,
  isTriageFinalStatus,
  restoreFinalNzbResults,
  dedupeResultsByTitle,
}) {
  if (!streamCacheKey) {
    return {
      cachedStreamEntry: null,
      cachedSearchMeta: null,
      cachedTriageDecisionMap: null,
      immediatePayload: null,
      rawSearchResults: [],
      dedupedSearchResults: [],
      finalNzbResults: [],
      triageDecisions: new Map(),
      usingCachedSearchResults: false,
    };
  }

  const cachedStreamEntry = cache.getStreamCacheEntry(streamCacheKey);
  if (!cachedStreamEntry) {
    return {
      cachedStreamEntry: null,
      cachedSearchMeta: null,
      cachedTriageDecisionMap: null,
      immediatePayload: null,
      rawSearchResults: [],
      dedupedSearchResults: [],
      finalNzbResults: [],
      triageDecisions: new Map(),
      usingCachedSearchResults: false,
    };
  }

  const cacheMeta = cachedStreamEntry.meta;
  let cachedTriageDecisionMap = null;
  let cachedSearchMeta = null;

  if (cacheMeta?.version === 1 && Array.isArray(cacheMeta.finalNzbResults)) {
    const snapshot = Array.isArray(cacheMeta.triageDecisionsSnapshot) ? cacheMeta.triageDecisionsSnapshot : [];
    cachedTriageDecisionMap = restoreTriageDecisions(snapshot);

    if (!cacheMeta.triageComplete && Array.isArray(cacheMeta.triagePendingDownloadUrls)) {
      const pendingList = cacheMeta.triagePendingDownloadUrls;
      const unresolved = pendingList.filter((downloadUrl) => {
        const decision = cachedTriageDecisionMap.get(downloadUrl);
        return !isTriageFinalStatus(decision?.status);
      });
      if (unresolved.length === 0) {
        cacheMeta.triageComplete = true;
        cacheMeta.triagePendingDownloadUrls = [];
      } else if (unresolved.length !== pendingList.length) {
        cacheMeta.triagePendingDownloadUrls = unresolved;
      }
    }

    cachedSearchMeta = cacheMeta;
    if (cacheMeta.triageComplete) {
      console.log('[CACHE] Stream cache hit (rehydrating finalized results)', {
        type,
        id,
        cachedStreams: cachedStreamEntry.payload?.streams?.length || 0,
      });
    } else {
      console.log('[CACHE] Reusing cached search results for pending triage', {
        type,
        id,
        pending: cacheMeta.triagePendingDownloadUrls?.length || 0,
      });
    }
  } else if (!cacheMeta || cacheMeta.triageComplete) {
    console.log('[CACHE] Stream cache hit (legacy payload)', { type, id });
    return {
      cachedStreamEntry,
      cachedSearchMeta: cacheMeta || null,
      cachedTriageDecisionMap,
      immediatePayload: cachedStreamEntry.payload,
      rawSearchResults: [],
      dedupedSearchResults: [],
      finalNzbResults: [],
      triageDecisions: new Map(),
      usingCachedSearchResults: false,
    };
  } else {
    console.log('[CACHE] Entry missing usable metadata; ignoring context');
  }

  let usingCachedSearchResults = false;
  let rawSearchResults = [];
  let dedupedSearchResults = [];
  let finalNzbResults = [];
  const triageDecisions = cachedTriageDecisionMap
    || (cachedSearchMeta
      ? restoreTriageDecisions(cachedSearchMeta.triageDecisionsSnapshot)
      : new Map());

  if (cachedSearchMeta) {
    const restored = restoreFinalNzbResults(cachedSearchMeta.finalNzbResults);
    rawSearchResults = restored.slice();
    dedupedSearchResults = dedupeResultsByTitle(restored);
    finalNzbResults = dedupedSearchResults.slice();
    usingCachedSearchResults = true;
  }

  return {
    cachedStreamEntry,
    cachedSearchMeta,
    cachedTriageDecisionMap,
    immediatePayload: null,
    rawSearchResults,
    dedupedSearchResults,
    finalNzbResults,
    triageDecisions,
    usingCachedSearchResults,
  };
}

module.exports = {
  hydrateStreamCache,
};
