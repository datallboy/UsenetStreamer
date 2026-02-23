const axios = require('axios');
const { DEFAULT_CAPS } = require('./constants');
const {
  extractErrorFromBody,
  normalizeCapsType,
  parseSupportedParamsFromXml,
} = require('./utils');

const newznabCapsCache = new Map();
let cacheInitialized = false;

function cloneCapsRecord(source) {
  return {
    search: new Set(source.search || []),
    tvsearch: new Set(source.tvsearch || []),
    movie: new Set(source.movie || []),
  };
}

function getDefaultCaps() {
  return cloneCapsRecord(DEFAULT_CAPS);
}

function getSupportedParamsForType(supportedParams, planType) {
  if (!supportedParams) return null;
  if (supportedParams instanceof Set) return supportedParams;
  const normalizedType = normalizeCapsType(planType);
  if (supportedParams[normalizedType] instanceof Set) return supportedParams[normalizedType];
  return null;
}

function loadCapsCacheFromEnv() {
  const raw = process.env.NEWZNAB_CAPS_CACHE || '';
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    Object.entries(parsed).forEach(([key, value]) => {
      if (!key) return;
      const capsRecord = { search: new Set(), tvsearch: new Set(), movie: new Set() };
      if (Array.isArray(value)) {
        value.map((entry) => String(entry).toLowerCase()).filter(Boolean)
          .forEach((token) => capsRecord.search.add(token));
      } else if (value && typeof value === 'object') {
        ['search', 'tvsearch', 'movie'].forEach((type) => {
          const list = Array.isArray(value[type]) ? value[type] : [];
          list.map((entry) => String(entry).toLowerCase()).filter(Boolean)
            .forEach((token) => capsRecord[type].add(token));
        });
      }
      newznabCapsCache.set(key, { supportedParams: capsRecord, fetchedAt: Date.now(), persisted: true });
    });
  } catch (error) {
    console.warn('[NEWZNAB] Failed to parse NEWZNAB_CAPS_CACHE:', error?.message || error);
  }
}

async function fetchNewznabCaps(config, options = {}) {
  if (!config?.endpoint || !config.apiKey) return null;
  const requestUrl = config.baseUrl || `${config.endpoint}${config.apiPath}`;
  const params = { t: 'caps', apikey: config.apiKey };
  const response = await axios.get(requestUrl, {
    params,
    timeout: options.timeoutMs || 12000,
    responseType: 'text',
    validateStatus: () => true,
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized (check API key)');
  }
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  const explicitError = extractErrorFromBody(body);
  if (explicitError) {
    throw new Error(explicitError);
  }
  return parseSupportedParamsFromXml(body);
}

function seedDefaultCaps(configs, filterUsableConfigs) {
  const eligible = filterUsableConfigs(configs, { requireEnabled: true, requireApiKey: true });
  eligible.forEach((config) => {
    if (!config?.dedupeKey || newznabCapsCache.has(config.dedupeKey)) return;
    newznabCapsCache.set(config.dedupeKey, { supportedParams: getDefaultCaps(), fetchedAt: Date.now(), persisted: false });
  });
}

function initializeCapsCache({ configs = [], filterUsableConfigs }) {
  if (cacheInitialized) return;
  loadCapsCacheFromEnv();
  if (typeof filterUsableConfigs === 'function') {
    seedDefaultCaps(configs, filterUsableConfigs);
  }
  cacheInitialized = true;
}

async function getSupportedParams(config, options = {}) {
  if (!config?.dedupeKey) return null;
  const cacheKey = config.dedupeKey;
  const cached = newznabCapsCache.get(cacheKey);
  if (cached && !options.forceRefresh) {
    return getSupportedParamsForType(cached.supportedParams, options.planType);
  }
  try {
    const supportedParams = await fetchNewznabCaps(config, options);
    newznabCapsCache.set(cacheKey, { supportedParams, fetchedAt: Date.now() });
    return getSupportedParamsForType(supportedParams, options.planType);
  } catch (error) {
    console.warn(`[NEWZNAB][CAPS] Failed to fetch caps for ${config.displayName || config.dedupeKey}, using defaults:`, error?.message || error);
    const defaults = getDefaultCaps();
    newznabCapsCache.set(cacheKey, { supportedParams: defaults, fetchedAt: Date.now() });
    return getSupportedParamsForType(defaults, options.planType);
  }
}

async function refreshCapsCache(configs, options = {}, filterUsableConfigs) {
  const eligible = filterUsableConfigs(configs, { requireEnabled: true, requireApiKey: true });
  const results = {};
  await Promise.all(eligible.map(async (config) => {
    try {
      const supportedParams = await fetchNewznabCaps(config, { ...options, forceRefresh: true });
      if (supportedParams) {
        newznabCapsCache.set(config.dedupeKey, { supportedParams, fetchedAt: Date.now(), persisted: true });
        results[config.dedupeKey] = {
          search: Array.from(supportedParams.search || []),
          tvsearch: Array.from(supportedParams.tvsearch || []),
          movie: Array.from(supportedParams.movie || []),
        };
      }
    } catch (error) {
      console.warn(`[NEWZNAB][CAPS] Failed to fetch caps for ${config.displayName || config.dedupeKey}, using defaults:`, error?.message || error);
      const defaults = getDefaultCaps();
      newznabCapsCache.set(config.dedupeKey, { supportedParams: defaults, fetchedAt: Date.now(), persisted: false });
      results[config.dedupeKey] = {
        search: Array.from(defaults.search),
        tvsearch: Array.from(defaults.tvsearch),
        movie: Array.from(defaults.movie),
      };
    }
  }));
  return results;
}

module.exports = {
  initializeCapsCache,
  getSupportedParams,
  refreshCapsCache,
};
