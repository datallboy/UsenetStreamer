const { handleNzbdavStreamService } = require('../../services/stream/nzbdavStreamRequestService');

async function handleNzbdavStream(req, res, ctx) {
  return handleNzbdavStreamService(req, res, ctx);
}

module.exports = {
  handleNzbdavStream,
};
