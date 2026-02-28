/**
 * @param {Object} deps
 * @returns {(req: import('../../types').CatalogHandlerRequest, res: import('../../types').CatalogHandlerResponse) => Promise<void>}
 */
function createCatalogHandler(deps) {
  const { getState, nzbdavService, catalogMetaService } = deps;

  return async function catalogHandler(req, res) {
    const { streamingMode, historyCatalogLimit, addonBaseUrl } = getState();

    if (streamingMode === 'native' || historyCatalogLimit <= 0) {
      res.status(404).json({ metas: [] });
      return;
    }

    const { type, id } = req.params;
    if (id !== 'nzbdav_completed') {
      res.status(404).json({ metas: [] });
      return;
    }

    try {
      nzbdavService.ensureNzbdavConfigured();
    } catch (error) {
      res.status(500).json({ metas: [], error: error.message });
      return;
    }

    const skip = Math.max(0, parseInt(req.query.skip || '0', 10) || 0);
    const metas = await catalogMetaService.buildCatalogMetas({
      type,
      skip,
      historyCatalogLimit,
      addonBaseUrl,
      nzbdavService,
    });

    res.json({ metas });
  };
}

module.exports = {
  createCatalogHandler,
};
