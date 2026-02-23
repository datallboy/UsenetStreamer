function createTriagePoolHelpers({
  state,
  preWarmNntpPool,
  evictStaleSharedNntpPool,
}) {
  function buildSharedPoolOptions() {
    if (!state.TRIAGE_NNTP_CONFIG) return null;
    return {
      nntpConfig: { ...state.TRIAGE_NNTP_CONFIG },
      nntpMaxConnections: state.TRIAGE_NNTP_MAX_CONNECTIONS,
      reuseNntpPool: state.TRIAGE_REUSE_POOL,
      nntpKeepAliveMs: state.TRIAGE_NNTP_KEEP_ALIVE_MS,
    };
  }

  function maybePrewarmSharedNntpPool() {
    if (!state.TRIAGE_REUSE_POOL || !state.TRIAGE_NNTP_CONFIG) {
      return;
    }
    const options = buildSharedPoolOptions();
    if (!options) return;
    preWarmNntpPool(options)
      .then(() => {
        console.log('[NZB TRIAGE] Pre-warmed NNTP pool with shared configuration');
      })
      .catch((err) => {
        console.warn('[NZB TRIAGE] Unable to pre-warm NNTP pool', err?.message || err);
      });
  }

  function triggerRequestTriagePrewarm(reason = 'request') {
    if (!state.TRIAGE_REUSE_POOL || !state.TRIAGE_NNTP_CONFIG) {
      return null;
    }
    const options = buildSharedPoolOptions();
    if (!options) return null;
    return preWarmNntpPool(options).catch((err) => {
      console.warn(`[NZB TRIAGE] Unable to pre-warm NNTP pool (${reason})`, err?.message || err);
    });
  }

  function restartSharedPoolMonitor() {
    if (state.sharedPoolMonitorTimer) {
      clearInterval(state.sharedPoolMonitorTimer);
      state.sharedPoolMonitorTimer = null;
    }
    if (!state.TRIAGE_REUSE_POOL || !state.TRIAGE_NNTP_CONFIG) {
      return;
    }
    const intervalMs = Math.max(30000, state.TRIAGE_NNTP_KEEP_ALIVE_MS || 120000);
    state.sharedPoolMonitorTimer = setInterval(() => {
      evictStaleSharedNntpPool().catch((err) => {
        console.warn('[NZB TRIAGE] Failed to evict stale NNTP pool', err?.message || err);
      });
    }, intervalMs);
    if (typeof state.sharedPoolMonitorTimer.unref === 'function') {
      state.sharedPoolMonitorTimer.unref();
    }
  }

  return {
    buildSharedPoolOptions,
    maybePrewarmSharedNntpPool,
    triggerRequestTriagePrewarm,
    restartSharedPoolMonitor,
  };
}

module.exports = {
  createTriagePoolHelpers,
};
