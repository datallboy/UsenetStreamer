const path = require('path');

const NZBDAV_MAX_DIRECTORY_DEPTH = 6;
const NZBDAV_API_TIMEOUT_MS = 80000;
const NZBDAV_HISTORY_TIMEOUT_MS = 60000;
const NZBDAV_STREAM_TIMEOUT_MS = 240000;
const NZBDAV_SUPPORTED_METHODS = new Set(['GET', 'HEAD']);
const STREAM_HIGH_WATER_MARK = (() => {
  const parsed = Number(process.env.STREAM_HIGH_WATER_MARK);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4 * 1024 * 1024;
})();

const FAILURE_VIDEO_PATH = path.resolve(__dirname, '../../../assets', 'failure_video.mp4');
const VIDEO_TYPE_FAILURE_PATH = path.resolve(__dirname, '../../../assets', 'video_type_failure.mp4');
const { version: ADDON_VERSION } = require('../../../package.json');

module.exports = {
  NZBDAV_MAX_DIRECTORY_DEPTH,
  NZBDAV_API_TIMEOUT_MS,
  NZBDAV_HISTORY_TIMEOUT_MS,
  NZBDAV_STREAM_TIMEOUT_MS,
  NZBDAV_SUPPORTED_METHODS,
  STREAM_HIGH_WATER_MARK,
  FAILURE_VIDEO_PATH,
  VIDEO_TYPE_FAILURE_PATH,
  ADDON_VERSION,
};
