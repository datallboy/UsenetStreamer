const { handleEasynewsNzbDownloadService } = require('../../services/stream/easynewsNzbRequestService');

async function handleEasynewsNzbDownload(req, res, ctx) {
  return handleEasynewsNzbDownloadService(req, res, ctx);
}

module.exports = {
  handleEasynewsNzbDownload,
};
