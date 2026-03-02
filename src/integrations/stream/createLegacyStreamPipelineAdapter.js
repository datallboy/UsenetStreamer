function createLegacyStreamPipelineAdapter({ legacyStreamHandler }) {
  if (typeof legacyStreamHandler !== 'function') {
    throw new Error('legacyStreamHandler must be a function');
  }

  return {
    execute: (req, res) => legacyStreamHandler(req, res),
  };
}

module.exports = {
  createLegacyStreamPipelineAdapter,
};
