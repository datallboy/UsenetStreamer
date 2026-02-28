const express = require('express');
const path = require('path');

function registerCoreRoutes({ app, rootDir, ensureSharedSecret, adminApiRouter }) {
  app.use('/assets', express.static(path.join(rootDir, 'assets')));

  const adminStatic = express.static(path.join(rootDir, 'admin'));

  app.use('/admin/api', (req, res, next) => ensureSharedSecret(req, res, next), adminApiRouter);
  app.use('/admin', adminStatic);
  app.use('/:token/admin', (req, res, next) => {
    ensureSharedSecret(req, res, (err) => {
      if (err) return;
      adminStatic(req, res, next);
    });
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
