function manifestHandler(req, res, ctx) {
  const {
    ensureAddonConfigured,
    STREAMING_MODE,
    NZBDAV_HISTORY_CATALOG_LIMIT,
    ADDON_NAME,
    DEFAULT_ADDON_NAME,
    ADDON_VERSION,
    ADDON_BASE_URL,
    specialMetadata,
  } = ctx;

  ensureAddonConfigured();

  const description = STREAMING_MODE === 'native'
    ? 'Native Usenet streaming for Stremio v5 (Windows) - NZB sources via direct Newznab indexers'
    : 'Usenet-powered instant streams for Stremio via Prowlarr/NZBHydra and NZBDav';

  const catalogs = [];
  const resources = ['stream'];
  const idPrefixes = ['tt', 'tvdb', 'tmdb', 'pt', specialMetadata.SPECIAL_ID_PREFIX];
  if (STREAMING_MODE !== 'native' && NZBDAV_HISTORY_CATALOG_LIMIT > 0) {
    const catalogName = ADDON_NAME || DEFAULT_ADDON_NAME;
    catalogs.push(
      { type: 'movie', id: 'nzbdav_completed', name: catalogName, pageSize: 20, extra: [{ name: 'skip' }] },
      { type: 'series', id: 'nzbdav_completed', name: catalogName, pageSize: 20, extra: [{ name: 'skip' }] }
    );
    resources.push('catalog', 'meta');
    idPrefixes.push('nzbdav');
  }

  res.json({
    id: STREAMING_MODE === 'native' ? 'com.usenet.streamer.native' : 'com.usenet.streamer',
    version: ADDON_VERSION,
    name: ADDON_NAME,
    description,
    logo: `${ADDON_BASE_URL.replace(/\/$/, '')}/assets/icon.png`,
    resources,
    types: ['movie', 'series', 'channel', 'tv'],
    catalogs,
    idPrefixes,
  });
}

async function catalogHandler(req, res, ctx) {
  const {
    STREAMING_MODE,
    NZBDAV_HISTORY_CATALOG_LIMIT,
    nzbdavService,
    ADDON_BASE_URL,
  } = ctx;

  if (STREAMING_MODE === 'native' || NZBDAV_HISTORY_CATALOG_LIMIT <= 0) {
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
  const limit = Math.max(0, Math.min(200, NZBDAV_HISTORY_CATALOG_LIMIT));
  if (limit === 0) {
    res.json({ metas: [] });
    return;
  }

  const categoryForType = nzbdavService.getNzbdavCategory(type);
  const historyMap = await nzbdavService.fetchCompletedNzbdavHistory([categoryForType], limit + skip);
  const entries = Array.from(historyMap.values());
  const slice = entries.slice(skip, skip + limit);
  const poster = `${ADDON_BASE_URL.replace(/\/$/, '')}/assets/icon.png`;

  const metas = slice.map((entry) => {
    const name = entry.jobName || 'NZBDav Completed';
    return {
      id: `nzbdav:${entry.nzoId}`,
      type,
      name,
      poster,
    };
  });

  res.json({ metas });
}

async function metaHandler(req, res, ctx) {
  const {
    STREAMING_MODE,
    NZBDAV_HISTORY_CATALOG_LIMIT,
    nzbdavService,
    ADDON_BASE_URL,
  } = ctx;

  if (STREAMING_MODE === 'native' || NZBDAV_HISTORY_CATALOG_LIMIT <= 0) {
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

  const nzoId = id.slice('nzbdav:'.length).trim();
  if (!nzoId) {
    res.status(404).json({ meta: null });
    return;
  }

  const categoryForType = nzbdavService.getNzbdavCategory(type);
  const historyMap = await nzbdavService.fetchCompletedNzbdavHistory([categoryForType], Math.max(50, NZBDAV_HISTORY_CATALOG_LIMIT));
  const match = Array.from(historyMap.values()).find((entry) => String(entry.nzoId) === String(nzoId));
  if (!match) {
    res.status(404).json({ meta: null });
    return;
  }

  const poster = `${ADDON_BASE_URL.replace(/\/$/, '')}/assets/icon.png`;
  res.json({
    meta: {
      id: `nzbdav:${match.nzoId}`,
      type,
      name: match.jobName || 'NZBDav Completed',
      poster,
    },
  });
}

module.exports = {
  manifestHandler,
  catalogHandler,
  metaHandler,
};
