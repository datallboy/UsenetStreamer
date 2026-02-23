const { stripTrailingSlashes } = require('../../utils/config');
const { normalizeIndexerToken } = require('../../utils/parsers');
const {
  MAX_NEWZNAB_INDEXERS,
  NEWZNAB_NUMBERED_KEYS,
  BUILTIN_NEWZNAB_PRESETS,
} = require('./constants');
const {
  toTrimmedString,
  parseBoolean,
  parsePaidLimit,
  normalizeApiPath,
  extractHost,
} = require('./utils');

const ZYCLOPS_ENDPOINT = 'https://zyclops.elfhosted.com';
const ZYCLOPS_API_PATH = '/api';

function normalizePresetEntry(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') return null;
  const endpoint = toTrimmedString(raw.endpoint || raw.url || raw.baseUrl || raw.baseURL);
  if (!endpoint) return null;
  const label = toTrimmedString(raw.label || raw.name) || endpoint;
  const apiPath = normalizeApiPath(raw.apiPath || raw.api_path || raw.path || '/api');
  const id = toTrimmedString(raw.id) || fallbackId || label.toLowerCase().replace(/[^a-z0-9]+/gi, '-');
  return {
    id,
    label,
    endpoint,
    apiPath,
    description: toTrimmedString(raw.description || raw.note || raw.notes) || undefined,
    apiKeyUrl: toTrimmedString(raw.apiKeyUrl || raw.api_key_url || raw.keyUrl || raw.key_url) || undefined,
  };
}

function getEnvPresetEntries() {
  const raw = process.env.NEWZNAB_PRESETS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry, idx) => normalizePresetEntry(entry, `custom-${idx + 1}`))
      .filter(Boolean);
  } catch (error) {
    console.warn('[NEWZNAB] Failed to parse NEWZNAB_PRESETS env JSON:', error?.message || error);
    return [];
  }
}

function getAvailableNewznabPresets() {
  const custom = getEnvPresetEntries();
  const builtin = [...BUILTIN_NEWZNAB_PRESETS];
  if (!custom.length) return builtin;
  return [...custom, ...builtin];
}

function getZyclopsProviderHost() {
  return (process.env.NZB_TRIAGE_NNTP_HOST || '').trim();
}

function applyZyclopsTransform(config) {
  if (!config || !config.zyclopsEnabled) return config;
  const providerHost = getZyclopsProviderHost();
  if (!providerHost) {
    console.warn(`[NEWZNAB][${config.displayName}] Zyclops enabled but no NNTP host configured — skipping transform`);
    return config;
  }
  const originalBaseUrl = `${config.endpoint}${config.apiPath}`;
  const zyclopsApiKey = `${config.apiKey}&target=${encodeURIComponent(originalBaseUrl)}&provider_host=${encodeURIComponent(providerHost)}`;
  return {
    ...config,
    endpoint: ZYCLOPS_ENDPOINT,
    apiPath: ZYCLOPS_API_PATH,
    apiKey: zyclopsApiKey,
    baseUrl: `${ZYCLOPS_ENDPOINT}${ZYCLOPS_API_PATH}`,
    _zyclopsOriginalEndpoint: config.endpoint,
    _zyclopsOriginalApiPath: config.apiPath,
    _zyclopsOriginalApiKey: config.apiKey,
  };
}

function buildIndexerConfig(source, idx, { includeEmpty = false } = {}) {
  const key = String(idx).padStart(2, '0');
  const endpoint = toTrimmedString(source[`NEWZNAB_ENDPOINT_${key}`]);
  const apiKey = toTrimmedString(source[`NEWZNAB_API_KEY_${key}`]);
  const apiPathRaw = source[`NEWZNAB_API_PATH_${key}`];
  const apiPath = normalizeApiPath(apiPathRaw);
  const name = toTrimmedString(source[`NEWZNAB_NAME_${key}`]);
  const enabledRaw = source[`NEWZNAB_INDEXER_ENABLED_${key}`];
  const enabled = parseBoolean(enabledRaw, true);
  const paidRaw = source[`NEWZNAB_PAID_${key}`];
  const isPaid = parseBoolean(paidRaw, false);
  const paidLimitRaw = source[`NEWZNAB_PAID_LIMIT_${key}`];
  const paidLimit = isPaid ? parsePaidLimit(paidLimitRaw, 6) : null;
  const zyclopsRaw = source[`NEWZNAB_ZYCLOPS_${key}`];
  const zyclopsEnabled = parseBoolean(zyclopsRaw, false);

  const hasAnyValue = endpoint || apiKey || apiPathRaw || name || enabledRaw !== undefined;
  if (!hasAnyValue && !includeEmpty) {
    return null;
  }

  const normalizedEndpoint = endpoint ? stripTrailingSlashes(endpoint) : '';
  const displayName = name || (normalizedEndpoint ? extractHost(normalizedEndpoint) : `Indexer ${idx}`);
  const slug = normalizeIndexerToken(displayName.toLowerCase().replace(/[^a-z0-9]+/gi, '-'));

  const rawConfig = {
    id: key,
    ordinal: idx,
    endpoint: normalizedEndpoint,
    apiKey,
    apiPath,
    name,
    displayName,
    enabled,
    isPaid,
    paidLimit,
    zyclopsEnabled,
    slug,
    dedupeKey: slug || `indexer-${key}`,
    baseUrl: normalizedEndpoint ? `${normalizedEndpoint}${apiPath}` : '',
  };

  return applyZyclopsTransform(rawConfig);
}

function buildIndexerConfigs(source = {}, options = {}) {
  const configs = [];
  for (let i = 1; i <= MAX_NEWZNAB_INDEXERS; i += 1) {
    const config = buildIndexerConfig(source, i, options);
    if (config) configs.push(config);
  }
  return configs;
}

function getEnvNewznabConfigs(options = {}) {
  return buildIndexerConfigs(process.env, options);
}

function getNewznabConfigsFromValues(values = {}, options = {}) {
  return buildIndexerConfigs(values, options);
}

function filterUsableConfigs(configs = [], { requireEnabled = true, requireApiKey = true } = {}) {
  return configs.filter((config) => {
    if (!config || !config.endpoint) return false;
    if (requireEnabled && config.enabled === false) return false;
    if (requireApiKey && !config.apiKey) return false;
    return true;
  });
}

module.exports = {
  MAX_NEWZNAB_INDEXERS,
  NEWZNAB_NUMBERED_KEYS,
  getAvailableNewznabPresets,
  buildIndexerConfigs,
  getEnvNewznabConfigs,
  getNewznabConfigsFromValues,
  filterUsableConfigs,
};
