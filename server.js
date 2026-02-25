require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
// webdav is an ES module; we'll import it lazily when first needed
const path = require('path');
const runtimeEnv = require('./config/runtimeEnv');

// Apply runtime environment BEFORE loading any services
runtimeEnv.applyRuntimeEnv();

const {
  testIndexerConnection,
  testNzbdavConnection,
  testUsenetConnection,
  testNewznabConnection,
  testNewznabSearch,
  testTmdbConnection,
} = require('./src/utils/connectionTests');
const { triageAndRank } = require('./src/services/triage/runner');
const { parseReleaseMetadata, QUALITY_FEATURE_PATTERNS } = require('./src/services/metadata/releaseParser');
const cache = require('./src/cache');
const { ensureSharedSecret } = require('./src/middleware/auth');
const newznabService = require('./src/services/newznab');
const easynewsService = require('./src/services/easynews');
const { toBoolean, resolvePreferredLanguages, resolveLanguageLabel, resolveLanguageLabels, collectConfigValues, computeManifestUrl } = require('./src/utils/config');
const { normalizeReleaseTitle, parseRequestedEpisode, inferMimeType, normalizeIndexerToken, normalizeResolutionToken, nzbMatchesIndexer } = require('./src/utils/parsers');
const { annotateNzbResult, prepareSortedResults, getPreferredLanguageMatches, buildTriageTitleMap, prioritizeTriageCandidates, triageDecisionsMatchStatuses, sanitizeDecisionForCache, serializeFinalNzbResults, restoreFinalNzbResults, formatStreamTitle } = require('./src/utils/helpers');
const indexerService = require('./src/services/indexer');
const nzbdavService = require('./src/services/nzbdav');
const specialMetadata = require('./src/services/specialMetadata');
const tmdbService = require('./src/services/tmdb');
const tvdbService = require('./src/services/tvdb');
const { formatResolutionBadge, extractQualityFeatureBadges, encodeStreamParams, decodeStreamParams, buildStreamCacheKey, sanitizeStrictSearchPhrase, matchesStrictSearch, extractTriageOverrides } = require('./src/server/streamHelpers');
const { createPrefetchTracker } = require('./src/server/prefetchTracker');
const { buildNntpServersArray } = require('./src/server/nntpHelpers');
const { prepareAdminConfigUpdates } = require('./src/server/adminConfigHelpers');
const { isNewznabDebugEnabled: isNzDebugEnabled } = require('./src/server/newznabDebug');
const { createHttpServer } = require('./src/server/httpServer');
const { startNewznabCapsWarmup } = require('./src/server/startupTasks');
const { createAppRuntime } = require('./src/server/appRuntime');
const { createRouteContexts } = require('./src/server/context/createRouteContexts');
const { registerAdminRoutes } = require('./src/server/routes/registerAdminRoutes');
const { registerAddonRoutes } = require('./src/server/routes/registerAddonRoutes');
const { version: ADDON_VERSION } = require('./package.json');

const app = express();
const DEFAULT_ADDON_NAME = 'UsenetStreamer';
const SERVER_HOST = '0.0.0.0';

const PREFETCH_NZBDAV_JOB_TTL_MS = 60 * 60 * 1000;
const prefetchTracker = createPrefetchTracker({
  ttlMs: PREFETCH_NZBDAV_JOB_TTL_MS,
  warn: (error) => {
    console.warn('[NZBDAV] Prefetch job failed before reuse:', error?.message || error);
  },
});
const TRIAGE_FINAL_STATUSES = new Set(['verified', 'blocked', 'unverified_7z']);

function isTriageFinalStatus(status) {
  if (!status) return false;
  return TRIAGE_FINAL_STATUSES.has(String(status).toLowerCase());
}

async function resolvePrefetchedNzbdavJob(downloadUrl) {
  return prefetchTracker.resolve(downloadUrl);
}

app.use(cors());
app.use('/assets', express.static(path.join(__dirname, 'assets')));

const appRuntime = createAppRuntime({
  serverHost: SERVER_HOST,
  defaultAddonName: DEFAULT_ADDON_NAME,
});

const ADMIN_CONFIG_KEYS = appRuntime.getAdminConfigKeys();
const NEWZNAB_NUMBERED_KEYS = appRuntime.getNewznabNumberedKeys();
const DEFAULT_MAX_RESULT_SIZE_GB = appRuntime.getDefaultMaxResultSizeGb();

function ensureAddonConfigured() {
  const { ADDON_BASE_URL } = appRuntime.getRuntimeSnapshot();
  if (!ADDON_BASE_URL) {
    throw new Error('ADDON_BASE_URL is not configured');
  }
}

const { startHttpServer, restartHttpServer } = createHttpServer({
  app,
  appRuntime,
  serverHost: SERVER_HOST,
});

const {
  getManifestContext,
  getCatalogContext,
  getMetaContext,
  getEasynewsContext,
  getNzbdavStreamContext,
  getStreamContext,
} = createRouteContexts({
  appRuntime,
  addonVersion: ADDON_VERSION,
  defaultAddonName: DEFAULT_ADDON_NAME,
  triageFinalStatuses: TRIAGE_FINAL_STATUSES,
  prefetchTracker,
  resolvePrefetchedNzbdavJob,
  ensureAddonConfigured,
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
    executeManagerPlanWithBackoff: appRuntime.executeManagerPlanWithBackoff,
    executeNewznabPlan: appRuntime.executeNewznabPlan,
    resolvePreferredLanguages,
    prepareSortedResults,
    getPreferredLanguageMatches,
    resolveLanguageLabels,
    resolveLanguageLabel,
    qualityFeaturePatterns: QUALITY_FEATURE_PATTERNS,
    buildCombinedLimitMap: appRuntime.buildCombinedLimitMap,
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
    getNewznabDebugFlags: appRuntime.getNewznabDebugFlags,
    getPaidDirectIndexerTokens: appRuntime.getPaidDirectIndexerTokens,
    isTriageFinalStatus,
    buildTriageTitleMap,
  },
});

registerAdminRoutes(app, {
  express,
  path,
  rootDir: __dirname,
  ensureSharedSecret,
  runtimeEnv,
  collectConfigValues,
  computeManifestUrl,
  prepareAdminConfigUpdates,
  adminConfigKeys: ADMIN_CONFIG_KEYS,
  newznabNumberedKeys: NEWZNAB_NUMBERED_KEYS,
  defaultMaxResultSizeGb: DEFAULT_MAX_RESULT_SIZE_GB,
  addonVersion: ADDON_VERSION,
  newznabService,
  isNzDebugEnabled,
  getNewznabDebugFlags: appRuntime.getNewznabDebugFlags,
  testIndexerConnection,
  testNzbdavConnection,
  testUsenetConnection,
  testNewznabConnection,
  testNewznabSearch,
  testTmdbConnection,
  easynewsService,
  tvdbService,
  indexerService,
  nzbdavService,
  tmdbService,
  cache,
  rebuildRuntimeConfig: appRuntime.rebuildRuntimeConfig,
  restartHttpServer,
  startHttpServer,
});

registerAddonRoutes(app, {
  getManifestContext,
  getCatalogContext,
  getMetaContext,
  getStreamContext,
  getEasynewsContext,
  getNzbdavStreamContext,
});

startHttpServer();

startNewznabCapsWarmup({
  appRuntime,
  newznabService,
  runtimeEnv,
});
