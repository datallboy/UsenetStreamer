const {
  MAX_NEWZNAB_INDEXERS,
  NEWZNAB_NUMBERED_KEYS,
  getAvailableNewznabPresets,
  buildIndexerConfigs,
  getEnvNewznabConfigs,
  getNewznabConfigsFromValues,
  filterUsableConfigs,
} = require('./newznab/configs');
const { maskApiKey } = require('./newznab/utils');
const {
  initializeCapsCache,
  getSupportedParams,
  refreshCapsCache: refreshCapsCacheInternal,
} = require('./newznab/caps');
const {
  searchNewznabIndexers: searchNewznabIndexersInternal,
  testNewznabCaps,
  validateNewznabSearch,
} = require('./newznab/search');

initializeCapsCache({
  configs: buildIndexerConfigs(process.env, { includeEmpty: false }),
  filterUsableConfigs,
});

async function searchNewznabIndexers(plan, configs, options = {}) {
  return searchNewznabIndexersInternal(plan, configs, options, {
    filterUsableConfigs,
    getSupportedParams,
  });
}

async function refreshCapsCache(configs, options = {}) {
  return refreshCapsCacheInternal(configs, options, filterUsableConfigs);
}

module.exports = {
  MAX_NEWZNAB_INDEXERS,
  NEWZNAB_NUMBERED_KEYS,
  getEnvNewznabConfigs,
  getNewznabConfigsFromValues,
  filterUsableConfigs,
  searchNewznabIndexers,
  testNewznabCaps,
  validateNewznabSearch,
  getAvailableNewznabPresets,
  maskApiKey,
  refreshCapsCache,
};
