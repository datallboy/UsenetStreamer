const MANIFEST_ROUTES = ['/manifest.json', '/:token/manifest.json'];
const CATALOG_ROUTES = ['/catalog/:type/:id.json', '/:token/catalog/:type/:id.json'];
const META_ROUTES = ['/meta/:type/:id.json', '/:token/meta/:type/:id.json'];

function registerAddonRoutes(app, handlers) {
  const { manifestHandler, catalogHandler, metaHandler } = handlers;

  MANIFEST_ROUTES.forEach((route) => {
    app.get(route, manifestHandler);
  });

  CATALOG_ROUTES.forEach((route) => {
    app.get(route, catalogHandler);
  });

  META_ROUTES.forEach((route) => {
    app.get(route, metaHandler);
  });
}

module.exports = {
  registerAddonRoutes,
};
