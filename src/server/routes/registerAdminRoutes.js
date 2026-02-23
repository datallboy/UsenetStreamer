function registerAdminRoutes(app, deps) {
  const {
    express,
    path,
    rootDir,
    ensureSharedSecret,
    runtimeEnv,
    collectConfigValues,
    computeManifestUrl,
    prepareAdminConfigUpdates,
    adminConfigKeys,
    newznabNumberedKeys,
    defaultMaxResultSizeGb,
    addonVersion,
    newznabService,
    isNzDebugEnabled,
    getNewznabDebugFlags,
    testIndexerConnection,
    testNzbdavConnection,
    testUsenetConnection,
    testNewznabConnection,
    testNewznabSearch,
    testTmdbConnection,
    easynewsService,
    tvdbService,
    indexerService,
    nzbdavService,
    tmdbService,
    cache,
    rebuildRuntimeConfig,
    restartHttpServer,
    startHttpServer,
  } = deps;

  const adminApiRouter = express.Router();
  adminApiRouter.use(express.json({ limit: '1mb' }));
  const adminStatic = express.static(path.join(rootDir, 'admin'));

  adminApiRouter.get('/config', (req, res) => {
    const values = collectConfigValues(adminConfigKeys);
    if (!values.NZB_MAX_RESULT_SIZE_GB) {
      values.NZB_MAX_RESULT_SIZE_GB = String(defaultMaxResultSizeGb);
    }
    if (!values.TMDB_SEARCH_MODE) {
      values.TMDB_SEARCH_MODE = 'english_only';
    }
    res.json({
      values,
      manifestUrl: computeManifestUrl(),
      runtimeEnvPath: runtimeEnv.RUNTIME_ENV_FILE,
      debugNewznabSearch: isNzDebugEnabled(getNewznabDebugFlags()),
      newznabPresets: newznabService.getAvailableNewznabPresets(),
      addonVersion,
    });
  });

  adminApiRouter.post('/config', async (req, res) => {
    const payload = req.body || {};
    const incoming = payload.values;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Invalid payload: expected "values" object' });
      return;
    }

    const updates = prepareAdminConfigUpdates({
      incoming,
      adminConfigKeys,
      numberedKeys: newznabNumberedKeys,
    });

    try {
      runtimeEnv.updateRuntimeEnv(updates);
      runtimeEnv.applyRuntimeEnv();

      const newznabConfigsForCaps = newznabService.getNewznabConfigsFromValues(incoming, { includeEmpty: false });
      try {
        const capsCache = await newznabService.refreshCapsCache(newznabConfigsForCaps, { timeoutMs: 12000 });
        console.log('[NEWZNAB][CAPS] Saved caps cache', capsCache);
        runtimeEnv.updateRuntimeEnv({
          NEWZNAB_CAPS_CACHE: Object.keys(capsCache).length > 0 ? JSON.stringify(capsCache) : '',
        });
        runtimeEnv.applyRuntimeEnv();
      } catch (capsError) {
        console.warn('[NEWZNAB][CAPS] Failed to refresh caps cache (config saved anyway)', capsError?.message || capsError);
      }

      indexerService.reloadConfig();
      nzbdavService.reloadConfig();
      tmdbService.reloadConfig();
      tvdbService.reloadConfig();
      if (typeof cache.reloadNzbdavCacheConfig === 'function') {
        cache.reloadNzbdavCacheConfig();
      }
      cache.clearAllCaches('admin-config-save');
      const { portChanged } = rebuildRuntimeConfig();
      if (portChanged) {
        await restartHttpServer();
      } else {
        startHttpServer();
      }
      res.json({ success: true, manifestUrl: computeManifestUrl(), hotReloaded: true, portChanged });
    } catch (error) {
      console.error('[ADMIN] Failed to update configuration', error);
      res.status(500).json({ error: 'Failed to persist configuration changes' });
    }
  });

  adminApiRouter.post('/test-connections', async (req, res) => {
    const payload = req.body || {};
    const { type, values } = payload;
    if (!type || typeof values !== 'object') {
      res.status(400).json({ error: 'Invalid payload: expected "type" and "values"' });
      return;
    }

    try {
      let message;
      switch (type) {
        case 'indexer':
          message = await testIndexerConnection(values);
          break;
        case 'nzbdav':
          message = await testNzbdavConnection(values);
          break;
        case 'usenet':
          message = await testUsenetConnection(values);
          break;
        case 'newznab':
          message = await testNewznabConnection(values);
          break;
        case 'newznab-search':
          message = await testNewznabSearch(values);
          break;
        case 'easynews': {
          const username = values?.EASYNEWS_USERNAME || '';
          const password = values?.EASYNEWS_PASSWORD || '';
          message = await easynewsService.testEasynewsCredentials({ username, password });
          break;
        }
        case 'tmdb':
          message = await testTmdbConnection(values);
          break;
        case 'tvdb':
          message = await tvdbService.testTvdbConnection({
            apiKey: values?.TVDB_API_KEY,
            enabled: values?.TVDB_ENABLED,
          });
          break;
        default:
          res.status(400).json({ error: `Unknown test type: ${type}` });
          return;
      }
      res.json({ status: 'ok', message });
    } catch (error) {
      const reason = error?.message || 'Connection test failed';
      res.json({ status: 'error', message: reason });
    }
  });

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
  registerAdminRoutes,
};
