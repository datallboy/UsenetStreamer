function createStreamHandler({
  getStreamV2Enabled,
  streamHandlerV2,
  legacyStreamHandler,
}) {
  return async (req, res) => {
    if (getStreamV2Enabled()) {
      return streamHandlerV2(req, res);
    }
    return legacyStreamHandler(req, res);
  };
}

module.exports = {
  createStreamHandler,
};
