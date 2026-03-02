const express = require('express');
const path = require('path');
const { registerAdminRoutes } = require('../routes/admin/registerAdminRoutes');

function registerCoreRoutes({ app, rootDir, ensureSharedSecret, adminApiRouter }) {
  app.use('/assets', express.static(path.join(rootDir, 'assets')));

  registerAdminRoutes({
    app,
    rootDir,
    ensureSharedSecret,
    adminApiRouter,
  });

  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  app.get('/utils/templateEngine.js', (req, res) => {
    res.sendFile(path.join(rootDir, 'src/utils/templateEngine.js'));
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/assets/')) return next();
    if (req.path.startsWith('/admin') && !req.path.startsWith('/admin/api')) return next();
    if (/^\/[^/]+\/admin/.test(req.path) && !/^\/[^/]+\/admin\/api/.test(req.path)) return next();
    return ensureSharedSecret(req, res, next);
  });
}

module.exports = {
  registerCoreRoutes,
};
