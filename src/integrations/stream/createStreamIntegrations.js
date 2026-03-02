function createStreamIntegrations({
  indexerService,
  newznabService,
  easynewsService,
  nzbdavService,
  tmdbService,
  tvdbService,
}) {
  return {
    indexer: {
      ensureConfigured: () => indexerService.ensureIndexerManagerConfigured(),
      executePlan: (plan) => indexerService.executeIndexerPlan(plan),
      canShareDecision: (a, b) => indexerService.canShareDecision(a, b),
    },
    newznab: {
      searchIndexers: (plan, activeConfigs, options) => newznabService.searchNewznabIndexers(plan, activeConfigs, options),
      refreshCapsCache: (activeConfigs, options) => newznabService.refreshCapsCache(activeConfigs, options),
    },
    easynews: {
      reloadConfig: (options) => easynewsService.reloadConfig(options),
      requiresCinemetaMetadata: (isSpecialRequest) => easynewsService.requiresCinemetaMetadata(isSpecialRequest),
      isEnabled: () => easynewsService.isEasynewsEnabled(),
      search: (params) => easynewsService.searchEasynews(params),
      getStandaloneTimeoutMs: () => easynewsService.EASYNEWS_SEARCH_STANDALONE_TIMEOUT_MS,
    },
    nzbdav: {
      ensureConfigured: () => nzbdavService.ensureNzbdavConfigured(),
      getCategory: (type) => nzbdavService.getNzbdavCategory(type),
      fetchCompletedHistory: (categories, limit) => nzbdavService.fetchCompletedNzbdavHistory(categories, limit),
      buildCacheKey: (downloadUrl, category, requestedEpisode) => nzbdavService.buildNzbdavCacheKey(downloadUrl, category, requestedEpisode),
      addNzb: (params) => nzbdavService.addNzbToNzbdav(params),
    },
    tmdb: {
      isConfigured: () => tmdbService.isConfigured(),
      getExternalIds: (tmdbId, mediaType) => tmdbService.getExternalIds(tmdbId, mediaType),
      findByExternalId: (externalId, source) => tmdbService.findByExternalId(externalId, source),
      getConfig: () => tmdbService.getConfig(),
      getMetadataAndTitles: (params) => tmdbService.getMetadataAndTitles(params),
      normalizeToAscii: (value) => tmdbService.normalizeToAscii(value),
    },
    tvdb: {
      isConfigured: () => tvdbService.isConfigured(),
      getImdbIdForSeries: (tvdbId) => tvdbService.getImdbIdForSeries(tvdbId),
      getTvdbIdForSeries: (imdbId) => tvdbService.getTvdbIdForSeries(imdbId),
    },
  };
}

module.exports = {
  createStreamIntegrations,
};
