function isNativeStreamingMode(streamingMode) {
  return streamingMode === 'native';
}

function supportsNzbdavFeatures(streamingMode) {
  return !isNativeStreamingMode(streamingMode);
}

function ensureStreamingPrerequisites({
  streamingMode,
  indexerManager,
  indexerService,
  nzbdavService,
}) {
  if (indexerManager !== 'none') {
    indexerService.ensureIndexerManagerConfigured();
  }
  if (supportsNzbdavFeatures(streamingMode)) {
    nzbdavService.ensureNzbdavConfigured();
  }
}

function resolveCategoryForType({ streamingMode, nzbdavService, type }) {
  if (!supportsNzbdavFeatures(streamingMode)) return null;
  return nzbdavService.getNzbdavCategory(type);
}

async function fetchHistoryByTitle({ streamingMode, nzbdavService, categoryForType }) {
  if (!supportsNzbdavFeatures(streamingMode)) {
    return new Map();
  }
  return nzbdavService.fetchCompletedNzbdavHistory([categoryForType]);
}

function buildBehaviorHintsForMode({
  streamingMode,
  detectedResolutionToken,
  result,
  isInstant,
  historySlot,
}) {
  if (isNativeStreamingMode(streamingMode)) {
    return {
      bingeGroup: `usenetstreamer-${detectedResolutionToken || 'unknown'}`,
      videoSize: result.size || undefined,
      filename: result.title || undefined,
    };
  }

  const behaviorHints = {
    notWebReady: true,
    filename: result.title || undefined,
  };
  if (isInstant) {
    behaviorHints.cached = true;
    if (historySlot) {
      behaviorHints.cachedFromHistory = true;
    }
  }
  return behaviorHints;
}

module.exports = {
  isNativeStreamingMode,
  supportsNzbdavFeatures,
  ensureStreamingPrerequisites,
  resolveCategoryForType,
  fetchHistoryByTitle,
  buildBehaviorHintsForMode,
};
