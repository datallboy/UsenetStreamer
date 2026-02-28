function parseStreamRequest(req) {
  const type = req?.params?.type;
  const id = req?.params?.id;
  const query = req?.query && typeof req.query === 'object' ? req.query : {};

  return {
    type,
    id,
    query,
    requestStartTs: Date.now(),
  };
}

module.exports = {
  parseStreamRequest,
};
