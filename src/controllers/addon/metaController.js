/**
 * @param {Object} deps
 * @returns {(req: import('../../types').MetaHandlerRequest, res: import('../../types').MetaHandlerResponse) => Promise<void>}
 */
function createMetaHandler(deps) {
  const { getState, nzbdavService, catalogMetaService } = deps;

  return async function metaHandler(req, res) {
    const { streamingMode, historyCatalogLimit, addonBaseUrl } = getState();

    if (streamingMode === 'native' || historyCatalogLimit <= 0) {
      res.status(404).json({ meta: null });
      return;
    }

    const { type, id } = req.params;
    if (!id || !id.startsWith('nzbdav:')) {
      res.status(404).json({ meta: null });
      return;
    }

    try {
      nzbdavService.ensureNzbdavConfigured();
    } catch (error) {
      res.status(500).json({ meta: null, error: error.message });
      return;
    }

    const meta = await catalogMetaService.buildMetaResponse({
      type,
      id,
      historyCatalogLimit,
      addonBaseUrl,
      nzbdavService,
    });

    if (!meta) {
      res.status(404).json({ meta: null });
      return;
    }

    res.json({ meta });
  };
}

module.exports = {
  createMetaHandler,
};
