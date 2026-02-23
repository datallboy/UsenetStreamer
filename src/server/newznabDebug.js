function isNewznabDebugEnabled(flags = {}) {
  return Boolean(flags.search || flags.test || flags.endpoints);
}

function isNewznabEndpointLoggingEnabled(flags = {}) {
  return Boolean(flags.endpoints);
}

function summarizeNewznabPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }
  return {
    type: plan.type || null,
    query: plan.rawQuery || plan.query || null,
    tokens: Array.isArray(plan.tokens) ? plan.tokens.filter(Boolean) : [],
  };
}

function logNewznabDebug(message, { enabled = false, logPrefix = '[NEWZNAB]', context = null } = {}) {
  if (!enabled) return;
  if (context && Object.keys(context).length > 0) {
    console.log(`${logPrefix}[DEBUG] ${message}`, context);
  } else {
    console.log(`${logPrefix}[DEBUG] ${message}`);
  }
}

module.exports = {
  isNewznabDebugEnabled,
  isNewznabEndpointLoggingEnabled,
  summarizeNewznabPlan,
  logNewznabDebug,
};
