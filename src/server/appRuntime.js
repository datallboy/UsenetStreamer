const { preWarmNntpPool, evictStaleSharedNntpPool } = require('../services/triage');
const { getPublishMetadataFromResult, areReleasesWithinDays } = require('../utils/publishInfo');
const {
  toFiniteNumber,
  toPositiveInt,
  toBoolean,
  parseCommaList,
  parsePathList,
  normalizeSortMode,
  resolvePreferredLanguages,
  toSizeBytesFromGb,
} = require('../utils/config');
const { normalizeReleaseTitle, normalizeIndexerToken } = require('../utils/parsers');
const { parseAllowedResolutionList, parseResolutionLimitValue } = require('./streamHelpers');
const { buildTriageNntpConfig } = require('./nntpHelpers');
const newznabService = require('../services/newznab');
const indexerService = require('../services/indexer');
const easynewsService = require('../services/easynews');
const { createSearchExecutionHelpers } = require('./runtime/searchExecutionHelpers');
const { createIndexerLimitHelpers } = require('./runtime/indexerLimitHelpers');
const { createTriagePoolHelpers } = require('./runtime/triagePoolHelpers');
const {
  isNewznabDebugEnabled,
  isNewznabEndpointLoggingEnabled,
  summarizeNewznabPlan,
  logNewznabDebug,
} = require('./newznabDebug');

const DEDUPE_MAX_PUBLISH_DIFF_DAYS = 14;
const DEFAULT_MAX_RESULT_SIZE_GB = 30;
const NEWZNAB_LOG_PREFIX = '[NEWZNAB]';
const RELEASE_BLOCKLIST_REGEX = /(?:^|[\s.\-_(\[])(?:iso|img|bin|cue|exe)(?:[\s.\-_\)\]]|$)/i;
const newznabDebug = {
  isNewznabDebugEnabled,
  isNewznabEndpointLoggingEnabled,
  summarizeNewznabPlan,
  logNewznabDebug,
};

function createAppRuntime({
  serverHost = '0.0.0.0',
  defaultAddonName = 'UsenetStreamer',
} = {}) {
  const state = {};
  state.currentPort = Number(process.env.PORT || 7000);
  state.paidIndexerTokens = new Set();
  state.sharedPoolMonitorTimer = null;
  state.indexerManagerUnavailableUntil = 0;
  state.TRIAGE_STAT_SAMPLE_COUNT = 0;
  state.TRIAGE_ARCHIVE_SAMPLE_COUNT = 1;
  state.ACTIVE_NEWZNAB_CONFIGS = [];

  const NEWZNAB_NUMBERED_KEYS = newznabService.NEWZNAB_NUMBERED_KEYS;

  const ADMIN_CONFIG_KEYS = [
    'PORT',
    'STREAMING_MODE',
    'ADDON_BASE_URL',
    'ADDON_NAME',
    'ADDON_SHARED_SECRET',
    'INDEXER_MANAGER',
    'INDEXER_MANAGER_URL',
    'INDEXER_MANAGER_API_KEY',
    'INDEXER_MANAGER_STRICT_ID_MATCH',
    'INDEXER_MANAGER_INDEXERS',
    'INDEXER_MANAGER_CACHE_MINUTES',
    'NZB_SORT_MODE',
    'NZB_PREFERRED_LANGUAGE',
    'NZB_MAX_RESULT_SIZE_GB',
    'NZB_DEDUP_ENABLED',
    'NZB_HIDE_BLOCKED_RESULTS',
    'NZB_ALLOWED_RESOLUTIONS',
    'NZB_RESOLUTION_LIMIT_PER_QUALITY',
    'NZB_RELEASE_EXCLUSIONS',
    'NZB_NAMING_PATTERN',
    'NZB_DISPLAY_NAME_PATTERN',
    'NZBDAV_URL',
    'NZBDAV_API_KEY',
    'NZBDAV_WEBDAV_URL',
    'NZBDAV_WEBDAV_USER',
    'NZBDAV_WEBDAV_PASS',
    'NZBDAV_CATEGORY',
    'NZBDAV_CATEGORY_MOVIES',
    'NZBDAV_CATEGORY_SERIES',
    'NZBDAV_HISTORY_CATALOG_LIMIT',
    'NZB_TRIAGE_HEALTH_INDEXERS',
    'SPECIAL_PROVIDER_ID',
    'SPECIAL_PROVIDER_URL',
    'SPECIAL_PROVIDER_SECRET',
    'NZB_TRIAGE_ENABLED',
    'NZB_TRIAGE_TIME_BUDGET_MS',
    'NZB_TRIAGE_MAX_CANDIDATES',
    'NZB_TRIAGE_PRIORITY_INDEXERS',
    'NZB_TRIAGE_PRIORITY_INDEXER_LIMITS',
    'NZB_TRIAGE_SERIALIZED_INDEXERS',
    'NZB_TRIAGE_DOWNLOAD_CONCURRENCY',
    'NZB_TRIAGE_MAX_CONNECTIONS',
    'NZB_TRIAGE_PREFETCH_FIRST_VERIFIED',
    'NZB_TRIAGE_MAX_PARALLEL_NZBS',
    'NZB_TRIAGE_STAT_SAMPLE_COUNT',
    'NZB_TRIAGE_ARCHIVE_SAMPLE_COUNT',
    'NZB_TRIAGE_MAX_DECODED_BYTES',
    'NZB_TRIAGE_NNTP_HOST',
    'NZB_TRIAGE_NNTP_PORT',
    'NZB_TRIAGE_NNTP_TLS',
    'NZB_TRIAGE_NNTP_USER',
    'NZB_TRIAGE_NNTP_PASS',
    'NZB_TRIAGE_ARCHIVE_DIRS',
    'NZB_TRIAGE_REUSE_POOL',
    'NZB_TRIAGE_NNTP_KEEP_ALIVE_MS',
    'EASYNEWS_ENABLED',
    'EASYNEWS_USERNAME',
    'EASYNEWS_PASSWORD',
    'EASYNEWS_TREAT_AS_INDEXER',
    'TMDB_ENABLED',
    'TMDB_API_KEY',
    'TMDB_SEARCH_LANGUAGES',
    'TMDB_SEARCH_MODE',
    'TVDB_ENABLED',
    'TVDB_API_KEY',
  ];

  ADMIN_CONFIG_KEYS.push('NEWZNAB_ENABLED', 'NEWZNAB_FILTER_NZB_ONLY', ...NEWZNAB_NUMBERED_KEYS);

  const {
    buildSearchLogPrefix,
    getNewznabDebugFlags,
    executeManagerPlanWithBackoff,
    executeNewznabPlan,
  } = createSearchExecutionHelpers({
    state,
    indexerService,
    newznabService,
    newznabDebug,
    newznabLogPrefix: NEWZNAB_LOG_PREFIX,
  });

  const {
    getPaidDirectIndexerTokens,
    refreshPaidIndexerTokens,
    dedupeResultsByTitle,
    buildCombinedLimitMap,
  } = createIndexerLimitHelpers({
    state,
    normalizeIndexerToken,
    normalizeReleaseTitle,
    getPublishMetadataFromResult,
    areReleasesWithinDays,
    dedupeMaxPublishDiffDays: DEDUPE_MAX_PUBLISH_DIFF_DAYS,
  });

  const {
    maybePrewarmSharedNntpPool,
    triggerRequestTriagePrewarm,
    restartSharedPoolMonitor,
  } = createTriagePoolHelpers({
    state,
    preWarmNntpPool,
    evictStaleSharedNntpPool,
  });

  function rebuildRuntimeConfig({ log = true } = {}) {
    const previousPort = state.currentPort;
    state.currentPort = Number(process.env.PORT || 7000);
    const previousBaseUrl = state.ADDON_BASE_URL;
    const previousSharedSecret = state.ADDON_SHARED_SECRET;

    state.STREAMING_MODE = (process.env.STREAMING_MODE || 'nzbdav').trim().toLowerCase();
    if (!['nzbdav', 'native'].includes(state.STREAMING_MODE)) state.STREAMING_MODE = 'nzbdav';

    state.ADDON_BASE_URL = (process.env.ADDON_BASE_URL || '').trim();
    state.ADDON_SHARED_SECRET = (process.env.ADDON_SHARED_SECRET || '').trim();
    state.ADDON_NAME = (process.env.ADDON_NAME || defaultAddonName).trim() || defaultAddonName;

    state.INDEXER_MANAGER = (process.env.INDEXER_MANAGER || 'none').trim().toLowerCase();
    if (state.STREAMING_MODE === 'native') state.INDEXER_MANAGER = 'none';
    state.INDEXER_MANAGER_URL = (process.env.INDEXER_MANAGER_URL || process.env.PROWLARR_URL || '').trim();
    state.INDEXER_MANAGER_LABEL = state.INDEXER_MANAGER === 'nzbhydra'
      ? 'NZBHydra'
      : state.INDEXER_MANAGER === 'none'
        ? 'Disabled'
        : 'Prowlarr';
    state.INDEXER_MANAGER_STRICT_ID_MATCH = toBoolean(process.env.INDEXER_MANAGER_STRICT_ID_MATCH || process.env.PROWLARR_STRICT_ID_MATCH, false);
    state.INDEXER_MANAGER_INDEXERS = (() => {
      const raw = process.env.INDEXER_MANAGER_INDEXERS || process.env.PROWLARR_INDEXERS || '';
      if (!raw.trim()) return null;
      if (raw.trim() === '-1') return -1;
      return parseCommaList(raw);
    })();
    state.INDEXER_MANAGER_CACHE_MINUTES = (() => {
      const raw = Number(process.env.INDEXER_MANAGER_CACHE_MINUTES || process.env.NZBHYDRA_CACHE_MINUTES);
      return Number.isFinite(raw) && raw > 0 ? raw : (state.INDEXER_MANAGER === 'nzbhydra' ? 10 : null);
    })();
    state.INDEXER_MANAGER_BACKOFF_ENABLED = toBoolean(process.env.INDEXER_MANAGER_BACKOFF_ENABLED, true);
    state.INDEXER_MANAGER_BACKOFF_SECONDS = toPositiveInt(process.env.INDEXER_MANAGER_BACKOFF_SECONDS, 120);
    state.NZBDAV_HISTORY_CATALOG_LIMIT = (() => {
      const raw = toFiniteNumber(process.env.NZBDAV_HISTORY_CATALOG_LIMIT, 0);
      if (!Number.isFinite(raw) || raw < 0) return 0;
      return Math.floor(raw);
    })();
    state.indexerManagerUnavailableUntil = 0;

    state.NEWZNAB_ENABLED = toBoolean(process.env.NEWZNAB_ENABLED, false);
    state.NEWZNAB_FILTER_NZB_ONLY = toBoolean(process.env.NEWZNAB_FILTER_NZB_ONLY, true);
    state.DEBUG_NEWZNAB_SEARCH = toBoolean(process.env.DEBUG_NEWZNAB_SEARCH, false);
    state.DEBUG_NEWZNAB_TEST = toBoolean(process.env.DEBUG_NEWZNAB_TEST, false);
    state.DEBUG_NEWZNAB_ENDPOINTS = toBoolean(process.env.DEBUG_NEWZNAB_ENDPOINTS, false);
    state.NEWZNAB_CONFIGS = newznabService.getEnvNewznabConfigs({ includeEmpty: false });
    state.ACTIVE_NEWZNAB_CONFIGS = newznabService.filterUsableConfigs(state.NEWZNAB_CONFIGS, { requireEnabled: true, requireApiKey: true });
    state.INDEXER_LOG_PREFIX = buildSearchLogPrefix({
      manager: state.INDEXER_MANAGER,
      managerLabel: state.INDEXER_MANAGER_LABEL,
      newznabEnabled: state.NEWZNAB_ENABLED,
    });

    state.INDEXER_SORT_MODE = normalizeSortMode(process.env.NZB_SORT_MODE, 'quality_then_size');
    state.INDEXER_PREFERRED_LANGUAGES = resolvePreferredLanguages(process.env.NZB_PREFERRED_LANGUAGE, []);
    state.INDEXER_DEDUP_ENABLED = toBoolean(process.env.NZB_DEDUP_ENABLED, true);
    state.INDEXER_HIDE_BLOCKED_RESULTS = toBoolean(process.env.NZB_HIDE_BLOCKED_RESULTS, false);
    state.INDEXER_MAX_RESULT_SIZE_BYTES = toSizeBytesFromGb(
      process.env.NZB_MAX_RESULT_SIZE_GB && process.env.NZB_MAX_RESULT_SIZE_GB !== ''
        ? process.env.NZB_MAX_RESULT_SIZE_GB
        : DEFAULT_MAX_RESULT_SIZE_GB
    );
    state.ALLOWED_RESOLUTIONS = parseAllowedResolutionList(process.env.NZB_ALLOWED_RESOLUTIONS);
    state.RELEASE_EXCLUSIONS = parseCommaList(process.env.NZB_RELEASE_EXCLUSIONS);
    state.NZB_NAMING_PATTERN = process.env.NZB_NAMING_PATTERN || '';
    state.NZB_DISPLAY_NAME_PATTERN = process.env.NZB_DISPLAY_NAME_PATTERN || '';
    state.RESOLUTION_LIMIT_PER_QUALITY = parseResolutionLimitValue(process.env.NZB_RESOLUTION_LIMIT_PER_QUALITY);

    state.TRIAGE_ENABLED = toBoolean(process.env.NZB_TRIAGE_ENABLED, false);
    state.TRIAGE_TIME_BUDGET_MS = toPositiveInt(process.env.NZB_TRIAGE_TIME_BUDGET_MS, 35000);
    state.TRIAGE_MAX_CANDIDATES = toPositiveInt(process.env.NZB_TRIAGE_MAX_CANDIDATES, 25);
    state.TRIAGE_PRIORITY_INDEXERS = parseCommaList(process.env.NZB_TRIAGE_PRIORITY_INDEXERS);
    state.TRIAGE_PRIORITY_INDEXER_LIMITS = parseCommaList(process.env.NZB_TRIAGE_PRIORITY_INDEXER_LIMITS);
    state.TRIAGE_HEALTH_INDEXERS = parseCommaList(process.env.NZB_TRIAGE_HEALTH_INDEXERS);
    state.TRIAGE_SERIALIZED_INDEXERS = parseCommaList(process.env.NZB_TRIAGE_SERIALIZED_INDEXERS);
    refreshPaidIndexerTokens();
    state.TRIAGE_ARCHIVE_DIRS = parsePathList(process.env.NZB_TRIAGE_ARCHIVE_DIRS);
    state.TRIAGE_NNTP_CONFIG = buildTriageNntpConfig();
    state.TRIAGE_MAX_DECODED_BYTES = toPositiveInt(process.env.NZB_TRIAGE_MAX_DECODED_BYTES, 32 * 1024);
    state.TRIAGE_NNTP_MAX_CONNECTIONS = toPositiveInt(process.env.NZB_TRIAGE_MAX_CONNECTIONS, 60);
    state.TRIAGE_MAX_PARALLEL_NZBS = toPositiveInt(process.env.NZB_TRIAGE_MAX_PARALLEL_NZBS, 16);
    state.TRIAGE_REUSE_POOL = toBoolean(process.env.NZB_TRIAGE_REUSE_POOL, true);
    state.TRIAGE_NNTP_KEEP_ALIVE_MS = toPositiveInt(process.env.NZB_TRIAGE_NNTP_KEEP_ALIVE_MS, 0);
    state.TRIAGE_PREFETCH_FIRST_VERIFIED = toBoolean(process.env.NZB_TRIAGE_PREFETCH_FIRST_VERIFIED, true);
    state.TRIAGE_BASE_OPTIONS = {
      archiveDirs: state.TRIAGE_ARCHIVE_DIRS,
      maxDecodedBytes: state.TRIAGE_MAX_DECODED_BYTES,
      nntpMaxConnections: state.TRIAGE_NNTP_MAX_CONNECTIONS,
      maxParallelNzbs: state.TRIAGE_MAX_PARALLEL_NZBS,
      statSampleCount: state.TRIAGE_STAT_SAMPLE_COUNT,
      archiveSampleCount: state.TRIAGE_ARCHIVE_SAMPLE_COUNT,
      reuseNntpPool: state.TRIAGE_REUSE_POOL,
      nntpKeepAliveMs: state.TRIAGE_NNTP_KEEP_ALIVE_MS,
      healthCheckTimeoutMs: state.TRIAGE_TIME_BUDGET_MS,
    };

    maybePrewarmSharedNntpPool();
    restartSharedPoolMonitor();
    const resolvedAddonBase = state.ADDON_BASE_URL || `http://${serverHost}:${state.currentPort}`;
    easynewsService.reloadConfig({ addonBaseUrl: resolvedAddonBase, sharedSecret: state.ADDON_SHARED_SECRET });

    const portChanged = previousPort !== undefined && previousPort !== state.currentPort;
    if (log) {
      console.log('[CONFIG] Runtime configuration refreshed', {
        port: state.currentPort,
        portChanged,
        baseUrlChanged: previousBaseUrl !== undefined && previousBaseUrl !== state.ADDON_BASE_URL,
        sharedSecretChanged: previousSharedSecret !== undefined && previousSharedSecret !== state.ADDON_SHARED_SECRET,
        addonName: state.ADDON_NAME,
        indexerManager: state.INDEXER_MANAGER,
        newznabEnabled: state.NEWZNAB_ENABLED,
        triageEnabled: state.TRIAGE_ENABLED,
        allowedResolutions: state.ALLOWED_RESOLUTIONS,
        resolutionLimitPerQuality: state.RESOLUTION_LIMIT_PER_QUALITY,
      });
    }

    return { portChanged };
  }

  function getRuntimeSnapshot() {
    return {
      currentPort: state.currentPort,
      STREAMING_MODE: state.STREAMING_MODE,
      INDEXER_MANAGER: state.INDEXER_MANAGER,
      INDEXER_MANAGER_URL: state.INDEXER_MANAGER_URL,
      INDEXER_MANAGER_LABEL: state.INDEXER_MANAGER_LABEL,
      INDEXER_MANAGER_STRICT_ID_MATCH: state.INDEXER_MANAGER_STRICT_ID_MATCH,
      INDEXER_MANAGER_INDEXERS: state.INDEXER_MANAGER_INDEXERS,
      INDEXER_LOG_PREFIX: state.INDEXER_LOG_PREFIX,
      INDEXER_MANAGER_CACHE_MINUTES: state.INDEXER_MANAGER_CACHE_MINUTES,
      ADDON_BASE_URL: state.ADDON_BASE_URL,
      ADDON_SHARED_SECRET: state.ADDON_SHARED_SECRET,
      ADDON_NAME: state.ADDON_NAME,
      NZBDAV_HISTORY_CATALOG_LIMIT: state.NZBDAV_HISTORY_CATALOG_LIMIT,
      NEWZNAB_ENABLED: state.NEWZNAB_ENABLED,
      NEWZNAB_FILTER_NZB_ONLY: state.NEWZNAB_FILTER_NZB_ONLY,
      NEWZNAB_CONFIGS: state.NEWZNAB_CONFIGS,
      ACTIVE_NEWZNAB_CONFIGS: state.ACTIVE_NEWZNAB_CONFIGS,
      INDEXER_SORT_MODE: state.INDEXER_SORT_MODE,
      INDEXER_PREFERRED_LANGUAGES: state.INDEXER_PREFERRED_LANGUAGES,
      INDEXER_DEDUP_ENABLED: state.INDEXER_DEDUP_ENABLED,
      INDEXER_HIDE_BLOCKED_RESULTS: state.INDEXER_HIDE_BLOCKED_RESULTS,
      INDEXER_MAX_RESULT_SIZE_BYTES: state.INDEXER_MAX_RESULT_SIZE_BYTES,
      ALLOWED_RESOLUTIONS: state.ALLOWED_RESOLUTIONS,
      RELEASE_EXCLUSIONS: state.RELEASE_EXCLUSIONS,
      NZB_NAMING_PATTERN: state.NZB_NAMING_PATTERN,
      NZB_DISPLAY_NAME_PATTERN: state.NZB_DISPLAY_NAME_PATTERN,
      RESOLUTION_LIMIT_PER_QUALITY: state.RESOLUTION_LIMIT_PER_QUALITY,
      TRIAGE_ENABLED: state.TRIAGE_ENABLED,
      TRIAGE_TIME_BUDGET_MS: state.TRIAGE_TIME_BUDGET_MS,
      TRIAGE_MAX_CANDIDATES: state.TRIAGE_MAX_CANDIDATES,
      TRIAGE_PRIORITY_INDEXERS: state.TRIAGE_PRIORITY_INDEXERS,
      TRIAGE_HEALTH_INDEXERS: state.TRIAGE_HEALTH_INDEXERS,
      TRIAGE_SERIALIZED_INDEXERS: state.TRIAGE_SERIALIZED_INDEXERS,
      TRIAGE_NNTP_CONFIG: state.TRIAGE_NNTP_CONFIG,
      TRIAGE_BASE_OPTIONS: state.TRIAGE_BASE_OPTIONS,
      TRIAGE_PREFETCH_FIRST_VERIFIED: state.TRIAGE_PREFETCH_FIRST_VERIFIED,
      NEWZNAB_LOG_PREFIX,
      RELEASE_BLOCKLIST_REGEX,
    };
  }

  rebuildRuntimeConfig({ log: false });

  return {
    getCurrentPort: () => state.currentPort,
    getRuntimeSnapshot,
    getAdminConfigKeys: () => ADMIN_CONFIG_KEYS,
    getNewznabNumberedKeys: () => NEWZNAB_NUMBERED_KEYS,
    getDefaultMaxResultSizeGb: () => DEFAULT_MAX_RESULT_SIZE_GB,
    getNewznabLogPrefix: () => NEWZNAB_LOG_PREFIX,
    getReleaseBlocklistRegex: () => RELEASE_BLOCKLIST_REGEX,
    rebuildRuntimeConfig,
    triggerRequestTriagePrewarm,
    getNewznabDebugFlags,
    getPaidDirectIndexerTokens,
    buildCombinedLimitMap,
    dedupeResultsByTitle,
    executeManagerPlanWithBackoff,
    executeNewznabPlan,
  };
}

module.exports = {
  createAppRuntime,
};
