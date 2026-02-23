function buildNzbdavHistoryStreamUrl({
  addonBaseUrl,
  addonSharedSecret,
  type,
  id,
  match,
  encodeStreamParams,
}) {
  const tokenSegment = addonSharedSecret ? `/${addonSharedSecret}` : '';
  const rawFilename = (match.jobName || 'stream').toString().trim();
  const normalizedFilename = rawFilename
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fileBase = normalizedFilename || 'stream';
  const hasVideoExt = /\.(mkv|mp4|m4v|avi|mov|wmv|mpg|mpeg|ts|webm)$/i.test(fileBase);
  const fileWithExt = hasVideoExt ? fileBase : `${fileBase}.mkv`;
  const encodedFilename = encodeURIComponent(fileWithExt);
  const baseParams = new URLSearchParams({
    type,
    id,
    historyNzoId: String(match.nzoId),
  });
  if (match.jobName) baseParams.set('historyJobName', match.jobName);
  if (match.category) baseParams.set('historyCategory', match.category);
  return `${addonBaseUrl}${tokenSegment}/nzb/stream/${encodeStreamParams(baseParams)}/${encodedFilename}`;
}

async function buildNzbdavHistoryResponse({
  type,
  id,
  incomingNzbdavId,
  streamingMode,
  nzbdavService,
  nzbdavHistoryCatalogLimit,
  addonBaseUrl,
  addonSharedSecret,
  encodeStreamParams,
}) {
  if (streamingMode === 'native') {
    return {
      status: 400,
      payload: { error: 'NZBDav catalog is only available in NZBDav mode.' },
    };
  }

  const categoryForType = nzbdavService.getNzbdavCategory(type);
  const historyMap = await nzbdavService.fetchCompletedNzbdavHistory([categoryForType], Math.max(50, nzbdavHistoryCatalogLimit || 50));
  const match = Array.from(historyMap.values()).find((entry) => String(entry.nzoId) === String(incomingNzbdavId));
  if (!match) {
    return {
      status: 404,
      payload: { error: 'NZBDav history entry not found.' },
    };
  }

  const streamUrl = buildNzbdavHistoryStreamUrl({
    addonBaseUrl,
    addonSharedSecret,
    type,
    id,
    match,
    encodeStreamParams,
  });

  return {
    status: 200,
    payload: {
      streams: [{
        title: match.jobName || 'NZBDav Completed',
        name: match.jobName || 'NZBDav Completed',
        url: streamUrl,
        behaviorHints: {
          notWebReady: true,
          cached: true,
          cachedFromHistory: true,
          filename: match.jobName || undefined,
        },
      }],
    },
  };
}

module.exports = {
  buildNzbdavHistoryResponse,
};
