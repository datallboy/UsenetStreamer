const express = require('express');
const path = require('path');

function registerAdminRoutes({ app, rootDir, ensureSharedSecret, adminApiRouter }) {
  const adminStatic = express.static(path.join(rootDir, 'admin'));

  app.use('/admin/api', (req, res, next) => ensureSharedSecret(req, res, next), adminApiRouter);
  app.use('/admin', adminStatic);
  app.use('/:token/admin', (req, res, next) => {
    ensureSharedSecret(req, res, (err) => {
      if (err) return;
      adminStatic(req, res, next);
    });
  });
}

module.exports = {
  registerAdminRoutes,
};
