const test = require('node:test');
const assert = require('node:assert/strict');

const { createStreamIntegrations } = require('../../src/integrations/stream/createStreamIntegrations');

test('createStreamIntegrations proxies calls to underlying clients', async () => {
  const calls = [];
  const indexerService = {
    ensureIndexerManagerConfigured: () => calls.push('indexer.ensure'),
    executeIndexerPlan: async (plan) => {
      calls.push(['indexer.execute', plan]);
      return [{ result: true }];
    },
    canShareDecision: (a, b) => {
      calls.push(['indexer.share', a, b]);
      return true;
    },
  };
  const newznabService = {
    searchNewznabIndexers: async (plan, activeConfigs, options) => {
      calls.push(['newznab.search', plan, activeConfigs, options]);
      return { results: [] };
    },
    refreshCapsCache: async (activeConfigs, options) => {
      calls.push(['newznab.refreshCaps', activeConfigs, options]);
      return {};
    },
  };
  const easynewsService = {
    EASYNEWS_SEARCH_STANDALONE_TIMEOUT_MS: 1234,
    reloadConfig: (options) => calls.push(['easynews.reload', options]),
    requiresCinemetaMetadata: (isSpecialRequest) => {
      calls.push(['easynews.requiresMeta', isSpecialRequest]);
      return Boolean(isSpecialRequest);
    },
    isEasynewsEnabled: () => {
      calls.push('easynews.enabled');
      return true;
    },
    searchEasynews: async (params) => {
      calls.push(['easynews.search', params]);
      return [];
    },
  };
  const nzbdavService = {
    ensureNzbdavConfigured: () => calls.push('nzbdav.ensure'),
    getNzbdavCategory: (type) => {
      calls.push(['nzbdav.category', type]);
      return 'Movies';
    },
    fetchCompletedNzbdavHistory: async (categories, limit) => {
      calls.push(['nzbdav.history', categories, limit]);
      return new Map();
    },
    buildNzbdavCacheKey: (url, category, episode) => {
      calls.push(['nzbdav.cacheKey', url, category, episode]);
      return 'cache-key';
    },
    addNzbToNzbdav: async (params) => {
      calls.push(['nzbdav.add', params]);
      return { nzoId: '123' };
    },
  };
  const tmdbService = {
    isConfigured: () => {
      calls.push('tmdb.configured');
      return true;
    },
    getExternalIds: async (tmdbId, mediaType) => {
      calls.push(['tmdb.externalIds', tmdbId, mediaType]);
      return {};
    },
    findByExternalId: async (externalId, source) => {
      calls.push(['tmdb.findByExternalId', externalId, source]);
      return null;
    },
    getConfig: () => {
      calls.push('tmdb.getConfig');
      return {};
    },
    getMetadataAndTitles: async (params) => {
      calls.push(['tmdb.getMetadataAndTitles', params]);
      return {};
    },
    normalizeToAscii: (value) => {
      calls.push(['tmdb.normalizeToAscii', value]);
      return String(value);
    },
  };
  const tvdbService = {
    isConfigured: () => {
      calls.push('tvdb.configured');
      return true;
    },
    getImdbIdForSeries: async (tvdbId) => {
      calls.push(['tvdb.getImdbIdForSeries', tvdbId]);
      return {};
    },
    getTvdbIdForSeries: async (imdbId) => {
      calls.push(['tvdb.getTvdbIdForSeries', imdbId]);
      return {};
    },
  };

  const integrations = createStreamIntegrations({
    indexerService,
    newznabService,
    easynewsService,
    nzbdavService,
    tmdbService,
    tvdbService,
  });

  integrations.indexer.ensureConfigured();
  await integrations.indexer.executePlan([{ kind: 'plan' }]);
  integrations.indexer.canShareDecision(1, 2);
  await integrations.newznab.searchIndexers([{ kind: 'search' }], [{ id: 'a' }], { debug: true });
  await integrations.newznab.refreshCapsCache([{ id: 'a' }], { timeoutMs: 100 });
  integrations.easynews.reloadConfig({ addonBaseUrl: 'http://x', sharedSecret: 's' });
  assert.equal(integrations.easynews.requiresCinemetaMetadata(true), true);
  assert.equal(integrations.easynews.isEnabled(), true);
  assert.equal(integrations.easynews.getStandaloneTimeoutMs(), 1234);
  await integrations.easynews.search({ rawQuery: 'q' });
  integrations.nzbdav.ensureConfigured();
  assert.equal(integrations.nzbdav.getCategory('movie'), 'Movies');
  await integrations.nzbdav.fetchCompletedHistory(['Movies'], 10);
  assert.equal(integrations.nzbdav.buildCacheKey('u', 'Movies', null), 'cache-key');
  await integrations.nzbdav.addNzb({ downloadUrl: 'u' });
  assert.equal(integrations.tmdb.isConfigured(), true);
  await integrations.tmdb.getExternalIds('1', 'movie');
  await integrations.tmdb.findByExternalId('tt1', 'imdb_id');
  integrations.tmdb.getConfig();
  await integrations.tmdb.getMetadataAndTitles({ imdbId: 'tt1' });
  assert.equal(integrations.tmdb.normalizeToAscii('abc'), 'abc');
  assert.equal(integrations.tvdb.isConfigured(), true);
  await integrations.tvdb.getImdbIdForSeries('1');
  await integrations.tvdb.getTvdbIdForSeries('tt1');

  assert.ok(calls.length > 0);
});
