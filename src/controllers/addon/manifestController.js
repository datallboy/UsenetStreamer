/**
 * @param {Object} deps
 * @returns {(req: import('../../types').ManifestHandlerRequest, res: import('../../types').ManifestHandlerResponse) => void}
 */
function createManifestHandler(deps) {
  const { ensureAddonConfigured, getState } = deps;

  return function manifestHandler(req, res) {
    ensureAddonConfigured();
    const {
      streamingMode,
      historyCatalogLimit,
      addonName,
      addonVersion,
      addonBaseUrl,
      defaultAddonName,
      specialIdPrefix,
    } = getState();

    const description = streamingMode === 'native'
      ? 'Native Usenet streaming for Stremio v5 (Windows) - NZB sources via direct Newznab indexers'
      : 'Usenet-powered instant streams for Stremio via Prowlarr/NZBHydra and NZBDav';

    const catalogs = [];
    const resources = ['stream'];
    const idPrefixes = ['tt', 'tvdb', 'tmdb', 'pt', specialIdPrefix];

    if (streamingMode !== 'native' && historyCatalogLimit > 0) {
      const catalogName = addonName || defaultAddonName;
      catalogs.push(
        { type: 'movie', id: 'nzbdav_completed', name: catalogName, pageSize: 20, extra: [{ name: 'skip' }] },
        { type: 'series', id: 'nzbdav_completed', name: catalogName, pageSize: 20, extra: [{ name: 'skip' }] },
      );
      resources.push('catalog', 'meta');
      idPrefixes.push('nzbdav');
    }

    res.json({
      id: streamingMode === 'native' ? 'com.usenet.streamer.native' : 'com.usenet.streamer',
      version: addonVersion,
      name: addonName,
      description,
      logo: `${addonBaseUrl.replace(/\/$/, '')}/assets/icon.png`,
      resources,
      types: ['movie', 'series', 'channel', 'tv'],
      catalogs,
      idPrefixes,
    });
  };
}

module.exports = {
  createManifestHandler,
};
