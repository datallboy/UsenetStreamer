const {
  state,
  reloadConfig,
  ensureNzbdavConfigured,
  getNzbdavCategory,
  buildNzbdavApiParams,
  extractNzbdavQueueId,
  buildNzbdavCacheKey,
  getWebdavClientPromise,
  setWebdavClientPromise,
} = require('./nzbdav/configState');
const { createNzbdavApi } = require('./nzbdav/api');
const { createNzbdavWebdav } = require('./nzbdav/webdav');
const { createNzbdavStreaming } = require('./nzbdav/streaming');

const api = createNzbdavApi({
  state,
  ensureNzbdavConfigured,
  buildNzbdavApiParams,
  extractNzbdavQueueId,
});

const webdav = createNzbdavWebdav({
  state,
  getWebdavClientPromise,
  setWebdavClientPromise,
});

const streaming = createNzbdavStreaming({
  state,
  addNzbToNzbdav: api.addNzbToNzbdav,
  waitForNzbdavHistorySlot: api.waitForNzbdavHistorySlot,
  findBestVideoFile: webdav.findBestVideoFile,
});

module.exports = {
  ensureNzbdavConfigured,
  getNzbdavCategory,
  buildNzbdavApiParams,
  extractNzbdavQueueId,
  buildNzbdavCacheKey,
  addNzbToNzbdav: api.addNzbToNzbdav,
  waitForNzbdavHistorySlot: api.waitForNzbdavHistorySlot,
  fetchCompletedNzbdavHistory: api.fetchCompletedNzbdavHistory,
  getWebdavClient: webdav.getWebdavClient,
  listWebdavDirectory: webdav.listWebdavDirectory,
  findBestVideoFile: webdav.findBestVideoFile,
  buildNzbdavStream: streaming.buildNzbdavStream,
  streamFileResponse: streaming.streamFileResponse,
  streamFailureVideo: streaming.streamFailureVideo,
  streamVideoTypeFailure: streaming.streamVideoTypeFailure,
  proxyNzbdavStream: streaming.proxyNzbdavStream,
  reloadConfig,
};
