const { handleStreamRequestService } = require('../../services/stream/streamRequestService');

async function handleStreamRequest(req, res, ctx) {
  return handleStreamRequestService(req, res, ctx);
}

module.exports = {
  handleStreamRequest,
};
