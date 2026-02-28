const NZBDAV_STREAM_ROUTES = [
  '/:token/nzb/stream/:encodedParams/:filename',
  '/:token/nzb/stream/:filename',
  '/nzb/stream/:encodedParams/:filename',
  '/nzb/stream/:filename',
  '/:token/nzb/stream',
  '/nzb/stream',
];

const EASYNEWS_NZB_ROUTES = ['/:token/easynews/nzb', '/easynews/nzb'];

function registerDownloadRoutes(app, handlers) {
  const { nzbdavStreamHandler, easynewsNzbHandler } = handlers;

  NZBDAV_STREAM_ROUTES.forEach((route) => {
    app.get(route, nzbdavStreamHandler);
    app.head(route, nzbdavStreamHandler);
  });

  EASYNEWS_NZB_ROUTES.forEach((route) => {
    app.get(route, easynewsNzbHandler);
  });
}

module.exports = {
  registerDownloadRoutes,
};
