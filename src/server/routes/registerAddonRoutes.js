const { handleStreamRequest } = require('../../controllers/handlers/streamHandler');
const { manifestHandler: manifestController, catalogHandler: catalogController, metaHandler: metaController } = require('../../controllers/handlers/addonHandlers');
const { handleEasynewsNzbDownload: easynewsNzbController } = require('../../controllers/handlers/easynewsNzbHandler');
const { handleNzbdavStream: nzbdavStreamController } = require('../../controllers/handlers/nzbdavStreamHandler');

function registerAddonRoutes(app, deps) {
  const {
    getManifestContext,
    getCatalogContext,
    getMetaContext,
    getStreamContext,
    getEasynewsContext,
    getNzbdavStreamContext,
  } = deps;

  const manifestHandler = (req, res) => manifestController(req, res, getManifestContext());
  ['/manifest.json', '/:token/manifest.json'].forEach((route) => {
    app.get(route, manifestHandler);
  });

  const catalogHandler = (req, res) => catalogController(req, res, getCatalogContext());
  ['/catalog/:type/:id.json', '/:token/catalog/:type/:id.json'].forEach((route) => {
    app.get(route, catalogHandler);
  });

  const metaHandler = (req, res) => metaController(req, res, getMetaContext());
  ['/meta/:type/:id.json', '/:token/meta/:type/:id.json'].forEach((route) => {
    app.get(route, metaHandler);
  });

  const streamHandler = (req, res) => handleStreamRequest(req, res, getStreamContext());
  ['/:token/stream/:type/:id.json', '/stream/:type/:id.json'].forEach((route) => {
    app.get(route, streamHandler);
  });

  const easynewsNzbHandler = (req, res) => easynewsNzbController(req, res, getEasynewsContext());
  ['/:token/easynews/nzb', '/easynews/nzb'].forEach((route) => {
    app.get(route, easynewsNzbHandler);
  });

  const nzbdavStreamHandler = (req, res) => nzbdavStreamController(req, res, getNzbdavStreamContext());
  ['/:token/nzb/stream/:encodedParams/:filename', '/:token/nzb/stream/:filename', '/nzb/stream/:encodedParams/:filename', '/nzb/stream/:filename', '/:token/nzb/stream', '/nzb/stream'].forEach((route) => {
    app.get(route, nzbdavStreamHandler);
    app.head(route, nzbdavStreamHandler);
  });
}

module.exports = {
  registerAddonRoutes,
};
