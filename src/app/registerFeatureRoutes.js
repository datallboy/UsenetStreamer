const { registerStreamRoutes } = require('../routes/stream/registerStreamRoutes');
const { registerAddonRoutes } = require('../routes/addon/registerAddonRoutes');
const { registerDownloadRoutes } = require('../routes/addon/registerDownloadRoutes');

function registerFeatureRoutes({
  app,
  manifestHandler,
  catalogHandler,
  metaHandler,
  streamHandler,
  nzbdavStreamHandler,
  easynewsNzbHandler,
}) {
  registerAddonRoutes(app, {
    manifestHandler,
    catalogHandler,
    metaHandler,
  });

  registerStreamRoutes(app, streamHandler);

  registerDownloadRoutes(app, {
    nzbdavStreamHandler,
    easynewsNzbHandler,
  });
}

module.exports = {
  registerFeatureRoutes,
};
