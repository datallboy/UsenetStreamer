function createSearchExecutionHelpers({
  state,
  indexerService,
  newznabService,
  newznabDebug,
  newznabLogPrefix,
}) {
  const {
    isNewznabDebugEnabled: isNzDebugEnabled,
    isNewznabEndpointLoggingEnabled: isNzEndpointLoggingEnabled,
    summarizeNewznabPlan,
    logNewznabDebug,
  } = newznabDebug;

  function buildSearchLogPrefix({ manager = state.INDEXER_MANAGER, managerLabel = state.INDEXER_MANAGER_LABEL, newznabEnabled = state.NEWZNAB_ENABLED } = {}) {
    const managerSegment = manager === 'none'
      ? 'mgr=OFF'
      : `mgr=${managerLabel.toUpperCase()}`;
    const directSegment = newznabEnabled ? 'direct=ON' : 'direct=OFF';
    return `[SEARCH ${managerSegment} ${directSegment}]`;
  }

  function getNewznabDebugFlags() {
    return {
      search: state.DEBUG_NEWZNAB_SEARCH,
      test: state.DEBUG_NEWZNAB_TEST,
      endpoints: state.DEBUG_NEWZNAB_ENDPOINTS,
    };
  }

  function executeManagerPlanWithBackoff(plan) {
    if (state.INDEXER_MANAGER === 'none') {
      return Promise.resolve({ results: [] });
    }
    if (state.INDEXER_MANAGER_BACKOFF_ENABLED && state.indexerManagerUnavailableUntil > Date.now()) {
      const remaining = Math.ceil((state.indexerManagerUnavailableUntil - Date.now()) / 1000);
      console.warn(`${state.INDEXER_LOG_PREFIX} Skipping manager search during backoff (${remaining}s remaining)`);
      return Promise.resolve({ results: [], errors: [`manager backoff (${remaining}s remaining)`] });
    }
    return indexerService.executeIndexerPlan(plan)
      .then((data) => ({ results: Array.isArray(data) ? data : [] }))
      .catch((error) => {
        if (state.INDEXER_MANAGER_BACKOFF_ENABLED) {
          state.indexerManagerUnavailableUntil = Date.now() + (state.INDEXER_MANAGER_BACKOFF_SECONDS * 1000);
          console.warn(`${state.INDEXER_LOG_PREFIX} Manager search failed; backing off for ${state.INDEXER_MANAGER_BACKOFF_SECONDS}s`, error?.message || error);
        }
        throw error;
      });
  }

  function executeNewznabPlan(plan) {
    const debugEnabled = isNzDebugEnabled(getNewznabDebugFlags());
    const endpointLogEnabled = isNzEndpointLoggingEnabled(getNewznabDebugFlags());
    const planSummary = summarizeNewznabPlan(plan);
    if (!state.NEWZNAB_ENABLED || state.ACTIVE_NEWZNAB_CONFIGS.length === 0) {
      logNewznabDebug('Skipping search plan because direct Newznab is disabled or no configs are available', {
        enabled: debugEnabled,
        logPrefix: newznabLogPrefix,
        context: {
          enabled: state.NEWZNAB_ENABLED,
          activeConfigs: state.ACTIVE_NEWZNAB_CONFIGS.length,
          plan: planSummary,
        },
      });
      return Promise.resolve({ results: [], errors: [], endpoints: [] });
    }

    if (debugEnabled) {
      logNewznabDebug('Dispatching search plan', {
        enabled: debugEnabled,
        logPrefix: newznabLogPrefix,
        context: {
          plan: planSummary,
          indexers: state.ACTIVE_NEWZNAB_CONFIGS.map((config) => ({
            id: config.id,
            name: config.displayName || config.endpoint,
            endpoint: config.endpoint,
          })),
          filterNzbOnly: state.NEWZNAB_FILTER_NZB_ONLY,
        },
      });
    }

    return newznabService.searchNewznabIndexers(plan, state.ACTIVE_NEWZNAB_CONFIGS, {
      filterNzbOnly: state.NEWZNAB_FILTER_NZB_ONLY,
      debug: debugEnabled,
      logEndpoints: endpointLogEnabled,
      label: newznabLogPrefix,
    }).then((result) => {
      logNewznabDebug('Search plan completed', {
        enabled: debugEnabled,
        logPrefix: newznabLogPrefix,
        context: {
          plan: planSummary,
          totalResults: Array.isArray(result?.results) ? result.results.length : 0,
          endpoints: result?.endpoints || [],
          errors: result?.errors || [],
        },
      });
      return result;
    }).catch((error) => {
      logNewznabDebug('Search plan failed', {
        enabled: debugEnabled,
        logPrefix: newznabLogPrefix,
        context: {
          plan: planSummary,
          error: error?.message || error,
        },
      });
      throw error;
    });
  }

  return {
    buildSearchLogPrefix,
    getNewznabDebugFlags,
    executeManagerPlanWithBackoff,
    executeNewznabPlan,
  };
}

module.exports = {
  createSearchExecutionHelpers,
};
