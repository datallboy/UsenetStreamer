const {
  toFiniteNumber,
  toPositiveInt,
  toBoolean,
  parseCommaList,
  normalizeSortMode,
  resolvePreferredLanguages,
  toSizeBytesFromGb,
} = require('../utils/config');
const { normalizeResolutionToken } = require('../utils/parsers');

function parseManagerIndexers(raw) {
  const value = (raw || '').trim();
  if (!value) return null;
  if (value === '-1') return -1;
  return parseCommaList(value);
}

function parseAllowedResolutionList(rawValue) {
  const entries = parseCommaList(rawValue);
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries
    .map((entry) => normalizeResolutionToken(entry))
    .filter(Boolean);
}

function parseResolutionLimitValue(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  const normalized = String(rawValue).trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

function buildTriageNntpConfig(env) {
  const host = (env.NZB_TRIAGE_NNTP_HOST || '').trim();
  if (!host) return null;
  return {
    host,
    port: toPositiveInt(env.NZB_TRIAGE_NNTP_PORT, 119),
    user: (env.NZB_TRIAGE_NNTP_USER || '').trim() || undefined,
    pass: (env.NZB_TRIAGE_NNTP_PASS || '').trim() || undefined,
    useTLS: toBoolean(env.NZB_TRIAGE_NNTP_TLS, false),
  };
}

function deepFreeze(input) {
  if (!input || typeof input !== 'object' || Object.isFrozen(input)) {
    return input;
  }
  Object.getOwnPropertyNames(input).forEach((key) => {
    const value = input[key];
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  });
  return Object.freeze(input);
}

function cloneOptionalStringArray(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function createRuntimeSnapshot(env = process.env, options = {}) {
  const defaultPort = Number.isFinite(Number(options.defaultPort)) ? Number(options.defaultPort) : 7000;
  const defaultAddonName = (options.defaultAddonName || 'UsenetStreamer').toString();
  const defaultMaxResultSizeGb = Number.isFinite(Number(options.defaultMaxResultSizeGb))
    ? Number(options.defaultMaxResultSizeGb)
    : 30;
  const serverHost = (options.serverHost || '0.0.0.0').toString();

  let streamingMode = (env.STREAMING_MODE || 'nzbdav').trim().toLowerCase();
  if (!['nzbdav', 'native'].includes(streamingMode)) streamingMode = 'nzbdav';

  let indexerManager = (env.INDEXER_MANAGER || 'none').trim().toLowerCase();
  if (streamingMode === 'native') indexerManager = 'none';

  const indexerManagerLabel = indexerManager === 'nzbhydra'
    ? 'NZBHydra'
    : indexerManager === 'none'
      ? 'Disabled'
      : 'Prowlarr';

  const snapshot = {
    generatedAt: new Date().toISOString(),
    server: {
      host: serverHost,
      port: Number(env.PORT || defaultPort),
    },
    streaming: {
      mode: streamingMode,
    },
    addon: {
      baseUrl: (env.ADDON_BASE_URL || '').trim(),
      sharedSecret: (env.ADDON_SHARED_SECRET || '').trim(),
      name: (env.ADDON_NAME || defaultAddonName).trim() || defaultAddonName,
    },
    indexerManager: {
      manager: indexerManager,
      url: (env.INDEXER_MANAGER_URL || env.PROWLARR_URL || '').trim(),
      apiKey: (env.INDEXER_MANAGER_API_KEY || env.PROWLARR_API_KEY || '').trim(),
      label: indexerManagerLabel,
      strictIdMatch: toBoolean(env.INDEXER_MANAGER_STRICT_ID_MATCH || env.PROWLARR_STRICT_ID_MATCH, false),
      indexers: parseManagerIndexers(env.INDEXER_MANAGER_INDEXERS || env.PROWLARR_INDEXERS || ''),
      cacheMinutes: (() => {
        const raw = Number(env.INDEXER_MANAGER_CACHE_MINUTES || env.NZBHYDRA_CACHE_MINUTES);
        return Number.isFinite(raw) && raw > 0 ? raw : (indexerManager === 'nzbhydra' ? 10 : null);
      })(),
      baseUrl: ((env.INDEXER_MANAGER_URL || env.PROWLARR_URL || '').trim()).replace(/\/+$/, ''),
      backoffEnabled: toBoolean(env.INDEXER_MANAGER_BACKOFF_ENABLED, true),
      backoffSeconds: toPositiveInt(env.INDEXER_MANAGER_BACKOFF_SECONDS, 120),
    },
    newznab: {
      enabled: toBoolean(env.NEWZNAB_ENABLED, false),
      filterNzbOnly: toBoolean(env.NEWZNAB_FILTER_NZB_ONLY, true),
      debugSearch: toBoolean(env.DEBUG_NEWZNAB_SEARCH, false),
      debugTest: toBoolean(env.DEBUG_NEWZNAB_TEST, false),
      debugEndpoints: toBoolean(env.DEBUG_NEWZNAB_ENDPOINTS, false),
    },
    sorting: {
      sortMode: normalizeSortMode(env.NZB_SORT_MODE, 'quality_then_size'),
      sortOrder: parseCommaList(env.NZB_SORT_ORDER),
      preferredLanguages: resolvePreferredLanguages(env.NZB_PREFERRED_LANGUAGE, []),
      preferredQualities: parseCommaList(env.NZB_PREFERRED_QUALITIES),
      preferredEncodes: parseCommaList(env.NZB_PREFERRED_ENCODES),
      preferredReleaseGroups: parseCommaList(env.NZB_PREFERRED_RELEASE_GROUPS),
      preferredVisualTags: parseCommaList(env.NZB_PREFERRED_VISUAL_TAGS),
      preferredAudioTags: parseCommaList(env.NZB_PREFERRED_AUDIO_TAGS),
      preferredKeywords: parseCommaList(env.NZB_PREFERRED_KEYWORDS),
      dedupeEnabled: toBoolean(env.NZB_DEDUP_ENABLED, true),
      hideBlockedResults: toBoolean(env.NZB_HIDE_BLOCKED_RESULTS, false),
      maxResultSizeBytes: toSizeBytesFromGb(
        env.NZB_MAX_RESULT_SIZE_GB && env.NZB_MAX_RESULT_SIZE_GB !== ''
          ? env.NZB_MAX_RESULT_SIZE_GB
          : defaultMaxResultSizeGb
      ),
      allowedResolutions: parseAllowedResolutionList(env.NZB_ALLOWED_RESOLUTIONS),
      releaseExclusions: parseCommaList(env.NZB_RELEASE_EXCLUSIONS),
      namingPattern: env.NZB_NAMING_PATTERN || '',
      displayNamePattern: env.NZB_DISPLAY_NAME_PATTERN || '',
      resolutionLimitPerQuality: parseResolutionLimitValue(env.NZB_RESOLUTION_LIMIT_PER_QUALITY),
    },
    triage: {
      enabled: toBoolean(env.NZB_TRIAGE_ENABLED, false),
      timeBudgetMs: toPositiveInt(env.NZB_TRIAGE_TIME_BUDGET_MS, 35000),
      maxCandidates: toPositiveInt(env.NZB_TRIAGE_MAX_CANDIDATES, 25),
      downloadConcurrency: toPositiveInt(env.NZB_TRIAGE_DOWNLOAD_CONCURRENCY, 8),
      priorityIndexers: parseCommaList(env.NZB_TRIAGE_PRIORITY_INDEXERS),
      priorityIndexerLimits: parseCommaList(env.NZB_TRIAGE_PRIORITY_INDEXER_LIMITS),
      healthIndexers: parseCommaList(env.NZB_TRIAGE_HEALTH_INDEXERS),
      serializedIndexers: parseCommaList(env.NZB_TRIAGE_SERIALIZED_INDEXERS),
      nntpConfig: buildTriageNntpConfig(env),
      maxDecodedBytes: toPositiveInt(env.NZB_TRIAGE_MAX_DECODED_BYTES, 32 * 1024),
      nntpMaxConnections: toPositiveInt(env.NZB_TRIAGE_MAX_CONNECTIONS, 12),
      maxParallelNzbs: toPositiveInt(env.NZB_TRIAGE_MAX_PARALLEL_NZBS, 16),
      reusePool: toBoolean(env.NZB_TRIAGE_REUSE_POOL, true),
      nntpKeepAliveMs: toPositiveInt(env.NZB_TRIAGE_NNTP_KEEP_ALIVE_MS, 0),
      prefetchFirstVerified: toBoolean(env.NZB_TRIAGE_PREFETCH_FIRST_VERIFIED, true),
    },
    nzbdav: {
      historyCatalogLimit: (() => {
        const raw = toFiniteNumber(env.NZBDAV_HISTORY_CATALOG_LIMIT, 100);
        if (!Number.isFinite(raw) || raw < 0) return 100;
        return Math.floor(raw);
      })(),
    },
  };

  // Defensively detach mutable arrays before freezing.
  snapshot.sorting.sortOrder = cloneOptionalStringArray(snapshot.sorting.sortOrder);
  snapshot.sorting.preferredLanguages = cloneOptionalStringArray(snapshot.sorting.preferredLanguages);
  snapshot.sorting.preferredQualities = cloneOptionalStringArray(snapshot.sorting.preferredQualities);
  snapshot.sorting.preferredEncodes = cloneOptionalStringArray(snapshot.sorting.preferredEncodes);
  snapshot.sorting.preferredReleaseGroups = cloneOptionalStringArray(snapshot.sorting.preferredReleaseGroups);
  snapshot.sorting.preferredVisualTags = cloneOptionalStringArray(snapshot.sorting.preferredVisualTags);
  snapshot.sorting.preferredAudioTags = cloneOptionalStringArray(snapshot.sorting.preferredAudioTags);
  snapshot.sorting.preferredKeywords = cloneOptionalStringArray(snapshot.sorting.preferredKeywords);
  snapshot.sorting.allowedResolutions = cloneOptionalStringArray(snapshot.sorting.allowedResolutions);
  snapshot.sorting.releaseExclusions = cloneOptionalStringArray(snapshot.sorting.releaseExclusions);
  snapshot.triage.priorityIndexers = cloneOptionalStringArray(snapshot.triage.priorityIndexers);
  snapshot.triage.priorityIndexerLimits = cloneOptionalStringArray(snapshot.triage.priorityIndexerLimits);
  snapshot.triage.healthIndexers = cloneOptionalStringArray(snapshot.triage.healthIndexers);
  snapshot.triage.serializedIndexers = cloneOptionalStringArray(snapshot.triage.serializedIndexers);
  if (Array.isArray(snapshot.indexerManager.indexers)) {
    snapshot.indexerManager.indexers = snapshot.indexerManager.indexers.slice();
  }

  return deepFreeze(snapshot);
}

module.exports = {
  createRuntimeSnapshot,
};
