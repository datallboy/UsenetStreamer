function createDefaultState() {
  const state = {
    NZBDAV_URL: '',
    NZBDAV_API_KEY: '',
    NZBDAV_WEBDAV_URL: '',
    NZBDAV_WEBDAV_USER: '',
    NZBDAV_WEBDAV_PASS: '',
    NZBDAV_WEBDAV_ROOT: '/',
    NZBDAV_CATEGORY_MOVIES: 'Movies',
    NZBDAV_CATEGORY_SERIES: 'Tv',
    NZBDAV_CATEGORY_DEFAULT: 'Movies',
    NZBDAV_CATEGORY_OVERRIDE: '',
    NZBDAV_POLL_INTERVAL_MS: 2000,
    NZBDAV_POLL_TIMEOUT_MS: 80000,
    NZBDAV_HISTORY_FETCH_LIMIT: 400,
  };
  return state;
}

const state = createDefaultState();
let webdavClientPromise = null;

function resetWebdavClient() {
  webdavClientPromise = null;
}

function getWebdavClientPromise() {
  return webdavClientPromise;
}

function setWebdavClientPromise(promise) {
  webdavClientPromise = promise;
}

function reloadConfig() {
  state.NZBDAV_URL = (process.env.NZBDAV_URL || '').trim();
  state.NZBDAV_API_KEY = (process.env.NZBDAV_API_KEY || '').trim();
  state.NZBDAV_WEBDAV_URL = (process.env.NZBDAV_WEBDAV_URL || state.NZBDAV_URL).trim();
  state.NZBDAV_WEBDAV_USER = (process.env.NZBDAV_WEBDAV_USER || '').trim();
  state.NZBDAV_WEBDAV_PASS = (process.env.NZBDAV_WEBDAV_PASS || '').trim();
  state.NZBDAV_WEBDAV_ROOT = '/';
  state.NZBDAV_CATEGORY_MOVIES = process.env.NZBDAV_CATEGORY_MOVIES || 'Movies';
  state.NZBDAV_CATEGORY_SERIES = process.env.NZBDAV_CATEGORY_SERIES || 'Tv';
  state.NZBDAV_CATEGORY_DEFAULT = process.env.NZBDAV_CATEGORY_DEFAULT || 'Movies';
  state.NZBDAV_CATEGORY_OVERRIDE = (process.env.NZBDAV_CATEGORY || '').trim();
  state.NZBDAV_POLL_INTERVAL_MS = 2000;
  state.NZBDAV_POLL_TIMEOUT_MS = 80000;
  state.NZBDAV_HISTORY_FETCH_LIMIT = (() => {
    const raw = Number(process.env.NZBDAV_HISTORY_FETCH_LIMIT);
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 500) : 400;
  })();
  resetWebdavClient();
}

function ensureNzbdavConfigured() {
  if (!state.NZBDAV_URL) {
    throw new Error('NZBDAV_URL is not configured');
  }
  if (!state.NZBDAV_API_KEY) {
    throw new Error('NZBDAV_API_KEY is not configured');
  }
  if (!state.NZBDAV_WEBDAV_URL) {
    throw new Error('NZBDAV_WEBDAV_URL is not configured');
  }
}

function getNzbdavCategory(type) {
  let baseCategory;
  let suffixKey;

  if (type === 'series' || type === 'tv') {
    baseCategory = state.NZBDAV_CATEGORY_SERIES;
    suffixKey = 'TV';
  } else if (type === 'movie') {
    baseCategory = state.NZBDAV_CATEGORY_MOVIES;
    suffixKey = 'MOVIE';
  } else {
    baseCategory = state.NZBDAV_CATEGORY_DEFAULT;
    suffixKey = 'DEFAULT';
  }

  if (state.NZBDAV_CATEGORY_OVERRIDE) {
    return `${state.NZBDAV_CATEGORY_OVERRIDE}_${suffixKey}`;
  }

  return baseCategory;
}

function buildNzbdavApiParams(mode, extra = {}) {
  return {
    mode,
    apikey: state.NZBDAV_API_KEY,
    ...extra,
  };
}

function extractNzbdavQueueId(payload) {
  return payload?.nzo_id
    || payload?.nzoId
    || payload?.NzoId
    || (Array.isArray(payload?.nzo_ids) && payload.nzo_ids[0])
    || (Array.isArray(payload?.queue) && payload.queue[0]?.nzo_id)
    || null;
}

function buildNzbdavCacheKey(downloadUrl, category, requestedEpisode = null) {
  const keyParts = [downloadUrl, category];
  if (requestedEpisode && Number.isFinite(requestedEpisode.season) && Number.isFinite(requestedEpisode.episode)) {
    keyParts.push(`${requestedEpisode.season}x${requestedEpisode.episode}`);
  }
  return keyParts.join('|');
}

reloadConfig();

module.exports = {
  state,
  reloadConfig,
  ensureNzbdavConfigured,
  getNzbdavCategory,
  buildNzbdavApiParams,
  extractNzbdavQueueId,
  buildNzbdavCacheKey,
  resetWebdavClient,
  getWebdavClientPromise,
  setWebdavClientPromise,
};
