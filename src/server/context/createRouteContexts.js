const { buildStreamHandlerContext } = require('./buildStreamHandlerContext');

const STREAM_CACHE_MAX_ENTRIES = 1000;
const CINEMETA_URL = 'https://v3-cinemeta.strem.io/meta';

function restoreTriageDecisions(snapshot) {
  const map = new Map();
  if (!Array.isArray(snapshot)) return map;
  snapshot.forEach(([downloadUrl, decision]) => {
    if (!downloadUrl || !decision) return;
    map.set(downloadUrl, { ...decision });
  });
  return map;
}

function createRouteContexts({
  appRuntime,
  addonVersion,
  defaultAddonName,
  triageFinalStatuses,
  prefetchTracker,
  resolvePrefetchedNzbdavJob,
  ensureAddonConfigured,
  services,
  helpers,
}) {
  const {
    axios,
    cache,
    easynewsService,
    indexerService,
    nzbdavService,
    specialMetadata,
    tmdbService,
    tvdbService,
  } = services;

  const {
    decodeStreamParams,
    parseRequestedEpisode,
    inferMimeType,
    buildNntpServersArray,
    formatResolutionBadge,
    extractQualityFeatureBadges,
    encodeStreamParams,
    buildStreamCacheKey,
    sanitizeStrictSearchPhrase,
    matchesStrictSearch,
    extractTriageOverrides,
    parseReleaseMetadata,
    annotateNzbResult,
    executeManagerPlanWithBackoff,
    executeNewznabPlan,
    resolvePreferredLanguages,
    prepareSortedResults,
    getPreferredLanguageMatches,
    resolveLanguageLabels,
    resolveLanguageLabel,
    qualityFeaturePatterns,
    buildCombinedLimitMap,
    normalizeIndexerToken,
    normalizeResolutionToken,
    prioritizeTriageCandidates,
    triageAndRank,
    triageDecisionsMatchStatuses,
    sanitizeDecisionForCache,
    serializeFinalNzbResults,
    restoreFinalNzbResults,
    normalizeReleaseTitle,
    nzbMatchesIndexer,
    formatStreamTitle,
    toBoolean,
    isNzDebugEnabled,
    getNewznabDebugFlags,
    getPaidDirectIndexerTokens,
    isTriageFinalStatus,
  } = helpers;

  function getManifestContext() {
    const runtime = appRuntime.getRuntimeSnapshot();
    return {
      ensureAddonConfigured,
      STREAMING_MODE: runtime.STREAMING_MODE,
      NZBDAV_HISTORY_CATALOG_LIMIT: runtime.NZBDAV_HISTORY_CATALOG_LIMIT,
      ADDON_NAME: runtime.ADDON_NAME,
      DEFAULT_ADDON_NAME: defaultAddonName,
      ADDON_VERSION: addonVersion,
      ADDON_BASE_URL: runtime.ADDON_BASE_URL,
      specialMetadata,
    };
  }

  function getCatalogContext() {
    const runtime = appRuntime.getRuntimeSnapshot();
    return {
      STREAMING_MODE: runtime.STREAMING_MODE,
      NZBDAV_HISTORY_CATALOG_LIMIT: runtime.NZBDAV_HISTORY_CATALOG_LIMIT,
      nzbdavService,
      ADDON_BASE_URL: runtime.ADDON_BASE_URL,
    };
  }

  function getMetaContext() {
    const runtime = appRuntime.getRuntimeSnapshot();
    return {
      STREAMING_MODE: runtime.STREAMING_MODE,
      NZBDAV_HISTORY_CATALOG_LIMIT: runtime.NZBDAV_HISTORY_CATALOG_LIMIT,
      nzbdavService,
      ADDON_BASE_URL: runtime.ADDON_BASE_URL,
    };
  }

  function getEasynewsContext() {
    const runtime = appRuntime.getRuntimeSnapshot();
    return {
      easynewsService,
      STREAMING_MODE: runtime.STREAMING_MODE,
    };
  }

  function getNzbdavStreamContext() {
    return {
      decodeStreamParams,
      parseRequestedEpisode,
      nzbdavService,
      resolvePrefetchedNzbdavJob,
      easynewsService,
      cache,
      inferMimeType,
      prefetchTracker,
    };
  }

  function getStreamContext() {
    const runtime = appRuntime.getRuntimeSnapshot();
    return buildStreamHandlerContext({
      runtime: {
        INDEXER_MANAGER: runtime.INDEXER_MANAGER,
        INDEXER_MANAGER_LABEL: runtime.INDEXER_MANAGER_LABEL,
        INDEXER_MANAGER_URL: runtime.INDEXER_MANAGER_URL,
        STREAMING_MODE: runtime.STREAMING_MODE,
        NZBDAV_HISTORY_CATALOG_LIMIT: runtime.NZBDAV_HISTORY_CATALOG_LIMIT,
        ADDON_SHARED_SECRET: runtime.ADDON_SHARED_SECRET,
        ADDON_BASE_URL: runtime.ADDON_BASE_URL,
        INDEXER_DEDUP_ENABLED: runtime.INDEXER_DEDUP_ENABLED,
        INDEXER_MANAGER_STRICT_ID_MATCH: runtime.INDEXER_MANAGER_STRICT_ID_MATCH,
        INDEXER_LOG_PREFIX: runtime.INDEXER_LOG_PREFIX,
        INDEXER_MANAGER_INDEXERS: runtime.INDEXER_MANAGER_INDEXERS,
        INDEXER_PREFERRED_LANGUAGES: runtime.INDEXER_PREFERRED_LANGUAGES,
        INDEXER_SORT_MODE: runtime.INDEXER_SORT_MODE,
        RELEASE_EXCLUSIONS: runtime.RELEASE_EXCLUSIONS,
        ALLOWED_RESOLUTIONS: runtime.ALLOWED_RESOLUTIONS,
        RESOLUTION_LIMIT_PER_QUALITY: runtime.RESOLUTION_LIMIT_PER_QUALITY,
        TRIAGE_PRIORITY_INDEXERS: runtime.TRIAGE_PRIORITY_INDEXERS,
        TRIAGE_HEALTH_INDEXERS: runtime.TRIAGE_HEALTH_INDEXERS,
        TRIAGE_SERIALIZED_INDEXERS: runtime.TRIAGE_SERIALIZED_INDEXERS,
        TRIAGE_MAX_CANDIDATES: runtime.TRIAGE_MAX_CANDIDATES,
        TRIAGE_ENABLED: runtime.TRIAGE_ENABLED,
        TRIAGE_NNTP_CONFIG: runtime.TRIAGE_NNTP_CONFIG,
        TRIAGE_TIME_BUDGET_MS: runtime.TRIAGE_TIME_BUDGET_MS,
        TRIAGE_BASE_OPTIONS: runtime.TRIAGE_BASE_OPTIONS,
        TRIAGE_PREFETCH_FIRST_VERIFIED: runtime.TRIAGE_PREFETCH_FIRST_VERIFIED,
        INDEXER_HIDE_BLOCKED_RESULTS: runtime.INDEXER_HIDE_BLOCKED_RESULTS,
        NZB_NAMING_PATTERN: runtime.NZB_NAMING_PATTERN,
        NZB_DISPLAY_NAME_PATTERN: runtime.NZB_DISPLAY_NAME_PATTERN,
        ADDON_NAME: runtime.ADDON_NAME,
        ACTIVE_NEWZNAB_CONFIGS: runtime.ACTIVE_NEWZNAB_CONFIGS,
        INDEXER_MAX_RESULT_SIZE_BYTES: runtime.INDEXER_MAX_RESULT_SIZE_BYTES,
        RELEASE_BLOCKLIST_REGEX: runtime.RELEASE_BLOCKLIST_REGEX,
      },
      services: {
        axios,
        cache,
        easynewsService,
        indexerService,
        nzbdavService,
        specialMetadata,
        tmdbService,
        tvdbService,
      },
      helpers: {
        ensureAddonConfigured,
        triggerRequestTriagePrewarm: appRuntime.triggerRequestTriagePrewarm,
        encodeStreamParams,
        buildStreamCacheKey,
        restoreTriageDecisions,
        isTriageFinalStatus,
        restoreFinalNzbResults,
        dedupeResultsByTitle: appRuntime.dedupeResultsByTitle,
        buildTriageTitleMap: helpers.buildTriageTitleMap,
        extractTriageOverrides,
        CINEMETA_URL,
        sanitizeStrictSearchPhrase,
        parseReleaseMetadata,
        matchesStrictSearch,
        annotateNzbResult,
        executeManagerPlanWithBackoff,
        executeNewznabPlan,
        NEWZNAB_LOG_PREFIX: runtime.NEWZNAB_LOG_PREFIX,
        resolvePreferredLanguages,
        prepareSortedResults,
        getPreferredLanguageMatches,
        resolveLanguageLabels,
        resolveLanguageLabel,
        formatResolutionBadge,
        extractQualityFeatureBadges,
        QUALITY_FEATURE_PATTERNS: qualityFeaturePatterns,
        TRIAGE_FINAL_STATUSES: triageFinalStatuses,
        buildCombinedLimitMap,
        normalizeIndexerToken,
        normalizeResolutionToken,
        prioritizeTriageCandidates,
        triageAndRank,
        triageDecisionsMatchStatuses,
        sanitizeDecisionForCache,
        serializeFinalNzbResults,
        prefetchTracker,
        normalizeReleaseTitle,
        nzbMatchesIndexer,
        inferMimeType,
        formatStreamTitle,
        DEFAULT_ADDON_NAME: defaultAddonName,
        buildNntpServersArray,
        resolvePrefetchedNzbdavJob,
        parseRequestedEpisode,
        toBoolean,
        isNzDebugEnabled,
        getNewznabDebugFlags,
        getPaidDirectIndexerTokens,
        STREAM_CACHE_MAX_ENTRIES,
      },
    });
  }

  return {
    getManifestContext,
    getCatalogContext,
    getMetaContext,
    getEasynewsContext,
    getNzbdavStreamContext,
    getStreamContext,
  };
}

module.exports = {
  createRouteContexts,
};
