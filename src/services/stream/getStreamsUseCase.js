/**
 * @param {Object} deps
 * @returns {Function}
 */
function createGetStreamsUseCase(deps) {
  if (!deps || typeof deps !== 'object') {
    throw new Error('StreamDeps object is required');
  }
  const handler = deps.handlers && deps.handlers.legacyStreamHandler;
  if (typeof handler !== 'function') {
    throw new Error('StreamDeps.handlers.legacyStreamHandler must be a function');
  }

  return async function getStreams(req, res) {
    return handler(req, res);
  };
}

module.exports = {
  createGetStreamsUseCase,
};
