function createAdminConfigGetHandler({
  collectConfigValues,
  getAdminConfigKeys,
  getDefaultMaxResultSizeGb,
  computeManifestUrl,
  runtimeEnv,
  isNewznabDebugEnabled,
  newznabService,
  getAddonVersion,
}) {
  return (req, res) => {
    const values = collectConfigValues(getAdminConfigKeys());
    if (!values.NZB_MAX_RESULT_SIZE_GB) {
      values.NZB_MAX_RESULT_SIZE_GB = String(getDefaultMaxResultSizeGb());
    }
    if (!values.TMDB_SEARCH_MODE) {
      values.TMDB_SEARCH_MODE = 'english_only';
    }
    res.json({
      values,
      manifestUrl: computeManifestUrl(),
      runtimeEnvPath: runtimeEnv.RUNTIME_ENV_FILE,
      debugNewznabSearch: isNewznabDebugEnabled(),
      newznabPresets: newznabService.getAvailableNewznabPresets(),
      addonVersion: getAddonVersion(),
    });
  };
}

function createAdminConfigSaveHandler({
  getAdminConfigKeys,
  getNewznabNumberedKeys,
  runtimeEnv,
  newznabService,
  indexerService,
  nzbdavService,
  tmdbService,
  tvdbService,
  cache,
  rebuildRuntimeConfig,
  restartHttpServer,
  startHttpServer,
  computeManifestUrl,
}) {
  return async (req, res) => {
    const payload = req.body || {};
    const incoming = payload.values;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Invalid payload: expected "values" object' });
      return;
    }

    console.log('[ADMIN] Received TMDb config:', {
      TMDB_ENABLED: incoming.TMDB_ENABLED,
      TMDB_API_KEY: incoming.TMDB_API_KEY ? `(${incoming.TMDB_API_KEY.length} chars)` : '(empty)',
      TMDB_SEARCH_LANGUAGES: incoming.TMDB_SEARCH_LANGUAGES,
      TMDB_SEARCH_MODE: incoming.TMDB_SEARCH_MODE,
    });

    const updates = {};
    const numberedKeys = getNewznabNumberedKeys();
    const numberedKeySet = new Set(numberedKeys);
    numberedKeys.forEach((key) => {
      updates[key] = null;
    });

    const adminConfigKeys = getAdminConfigKeys();

    if (!adminConfigKeys.includes('TMDB_API_KEY')) {
      console.error('[ADMIN] TMDB_API_KEY missing from ADMIN_CONFIG_KEYS');
    }
    if (!adminConfigKeys.includes('TMDB_ENABLED')) {
      console.error('[ADMIN] TMDB_ENABLED missing from ADMIN_CONFIG_KEYS');
    }
    if (!adminConfigKeys.includes('TMDB_SEARCH_LANGUAGES')) {
      console.error('[ADMIN] TMDB_SEARCH_LANGUAGES missing from ADMIN_CONFIG_KEYS');
    }
    if (!adminConfigKeys.includes('TMDB_SEARCH_MODE')) {
      console.error('[ADMIN] TMDB_SEARCH_MODE missing from ADMIN_CONFIG_KEYS');
    }
    const tmdbKeysInAdminConfig = adminConfigKeys.filter((k) => k.startsWith('TMDB_'));
    console.log('[ADMIN] TMDb keys in ADMIN_CONFIG_KEYS:', tmdbKeysInAdminConfig);
    console.log('[ADMIN] ADMIN_CONFIG_KEYS length:', adminConfigKeys.length);

    adminConfigKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) {
        const value = incoming[key];
        if (numberedKeySet.has(key)) {
          const trimmed = typeof value === 'string' ? value.trim() : value;
          if (trimmed === '' || trimmed === null || trimmed === undefined) {
            updates[key] = null;
          } else if (typeof value === 'boolean') {
            updates[key] = value ? 'true' : 'false';
          } else {
            updates[key] = String(value);
          }
          return;
        }
        if (value === null || value === undefined) {
          updates[key] = '';
        } else if (typeof value === 'boolean') {
          updates[key] = value ? 'true' : 'false';
        } else {
          updates[key] = String(value);
        }
      }
    });

    if (Object.prototype.hasOwnProperty.call(incoming, 'TMDB_API_KEY')) {
      updates.TMDB_API_KEY = incoming.TMDB_API_KEY ? String(incoming.TMDB_API_KEY) : '';
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'TMDB_ENABLED')) {
      updates.TMDB_ENABLED = incoming.TMDB_ENABLED ? String(incoming.TMDB_ENABLED) : 'false';
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'TMDB_SEARCH_LANGUAGES')) {
      updates.TMDB_SEARCH_LANGUAGES = incoming.TMDB_SEARCH_LANGUAGES ? String(incoming.TMDB_SEARCH_LANGUAGES) : '';
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'TMDB_SEARCH_MODE')) {
      updates.TMDB_SEARCH_MODE = incoming.TMDB_SEARCH_MODE ? String(incoming.TMDB_SEARCH_MODE) : '';
    }

    console.log('[ADMIN] TMDb updates to save:', {
      TMDB_ENABLED: updates.TMDB_ENABLED,
      TMDB_API_KEY: updates.TMDB_API_KEY ? `(${updates.TMDB_API_KEY.length} chars)` : '(not in updates)',
      TMDB_SEARCH_LANGUAGES: updates.TMDB_SEARCH_LANGUAGES,
      TMDB_SEARCH_MODE: updates.TMDB_SEARCH_MODE,
    });

    try {
      runtimeEnv.updateRuntimeEnv(updates);
      runtimeEnv.applyRuntimeEnv();

      const newznabConfigsForCaps = newznabService.getNewznabConfigsFromValues(incoming, { includeEmpty: false });
      try {
        const capsCache = await newznabService.refreshCapsCache(newznabConfigsForCaps, { timeoutMs: 12000 });
        console.log('[NEWZNAB][CAPS] Saved caps cache', capsCache);
        runtimeEnv.updateRuntimeEnv({
          NEWZNAB_CAPS_CACHE: Object.keys(capsCache).length > 0 ? JSON.stringify(capsCache) : ''
        });
        runtimeEnv.applyRuntimeEnv();
      } catch (capsError) {
        console.warn('[NEWZNAB][CAPS] Failed to refresh caps cache (config saved anyway)', capsError?.message || capsError);
      }

      console.log('[ADMIN] process.env.TMDB_API_KEY after apply:', process.env.TMDB_API_KEY ? `(${process.env.TMDB_API_KEY.length} chars)` : '(empty)');

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
  };
}

module.exports = {
  createAdminConfigGetHandler,
  createAdminConfigSaveHandler,
};
