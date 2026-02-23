function startNewznabCapsWarmup({
  appRuntime,
  newznabService,
  runtimeEnv,
  timeoutMs = 12000,
}) {
  const startupRuntime = appRuntime.getRuntimeSnapshot();
  if (!startupRuntime.NEWZNAB_ENABLED || startupRuntime.ACTIVE_NEWZNAB_CONFIGS.length === 0) {
    return null;
  }

  return newznabService.refreshCapsCache(startupRuntime.ACTIVE_NEWZNAB_CONFIGS, { timeoutMs })
    .then((capsCache) => {
      console.log('[NEWZNAB][CAPS] Startup caps loaded', Object.keys(capsCache));
      if (Object.keys(capsCache).length > 0) {
        runtimeEnv.updateRuntimeEnv({ NEWZNAB_CAPS_CACHE: JSON.stringify(capsCache) });
        runtimeEnv.applyRuntimeEnv();
      }
    })
    .catch((err) => {
      console.warn('[NEWZNAB][CAPS] Startup caps fetch failed (using defaults)', err?.message || err);
    });
}

module.exports = {
  startNewznabCapsWarmup,
};
