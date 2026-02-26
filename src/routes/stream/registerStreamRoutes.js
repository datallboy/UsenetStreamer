const STREAM_ROUTES = ['/:token/stream/:type/:id.json', '/stream/:type/:id.json'];

function registerStreamRoutes(app, streamHandler) {
  STREAM_ROUTES.forEach((route) => {
    app.get(route, streamHandler);
  });
}

module.exports = {
  registerStreamRoutes,
};
