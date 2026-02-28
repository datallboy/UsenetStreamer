async function buildCatalogMetas({ type, skip, historyCatalogLimit, addonBaseUrl, nzbdavService }) {
  const limit = Math.max(0, Math.min(200, historyCatalogLimit));
  if (limit === 0) {
    return [];
  }

  const categoryForType = nzbdavService.getNzbdavCategory(type);
  const historyMap = await nzbdavService.fetchCompletedNzbdavHistory([categoryForType], limit + skip);
  const entries = Array.from(historyMap.values());
  const slice = entries.slice(skip, skip + limit);
  const poster = `${addonBaseUrl.replace(/\/$/, '')}/assets/icon.png`;

  return slice.map((entry) => ({
    id: `nzbdav:${entry.nzoId}`,
    type,
    name: entry.jobName || 'NZBDav Completed',
    poster,
  }));
}

async function buildMetaResponse({ type, id, historyCatalogLimit, addonBaseUrl, nzbdavService }) {
  const nzoId = id.slice('nzbdav:'.length).trim();
  if (!nzoId) {
    return null;
  }

  const categoryForType = nzbdavService.getNzbdavCategory(type);
  const historyMap = await nzbdavService.fetchCompletedNzbdavHistory([categoryForType], Math.max(50, historyCatalogLimit));
  const match = Array.from(historyMap.values()).find((entry) => String(entry.nzoId) === String(nzoId));
  if (!match) {
    return null;
  }

  const poster = `${addonBaseUrl.replace(/\/$/, '')}/assets/icon.png`;
  return {
    id: `nzbdav:${match.nzoId}`,
    type,
    name: match.jobName || 'NZBDav Completed',
    poster,
  };
}

module.exports = {
  buildCatalogMetas,
  buildMetaResponse,
};
