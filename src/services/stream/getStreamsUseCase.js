const { parseStreamRequest } = require('./components/parseStreamRequest');
const { resolveStreamIdentifiers } = require('./components/resolveStreamIdentifiers');
const { buildSearchPlan } = require('./components/buildSearchPlan');
const { rankStreamResults } = require('./components/rankStreamResults');
const { buildStreamResponse } = require('./components/buildStreamResponse');

/**
 * @param {Object} deps
 * @returns {Function}
 */
function createGetStreamsUseCase(deps) {
  if (!deps || typeof deps !== 'object') {
    throw new Error('StreamDeps object is required');
  }
  const legacyHandler = deps.handlers && deps.handlers.legacyStreamHandler;
  if (typeof legacyHandler !== 'function') {
    throw new Error('StreamDeps.handlers.legacyStreamHandler must be a function');
  }
  const pipelineExecutor = deps.integrations?.pipeline?.execute || legacyHandler;
  if (typeof pipelineExecutor !== 'function') {
    throw new Error('Stream pipeline executor must be a function');
  }

  const components = deps.components || {};
  const parseRequest = components.parseRequest || parseStreamRequest;
  const resolveIdentifiers = components.resolveIdentifiers || resolveStreamIdentifiers;
  const planSearch = components.planSearch || buildSearchPlan;
  const rankResults = components.rankResults || rankStreamResults;
  const buildResponse = components.buildResponse || buildStreamResponse;
  const specialCatalogPrefixes = Array.isArray(deps.runtime?.specialCatalogPrefixes)
    ? deps.runtime.specialCatalogPrefixes
    : [];

  return async function getStreams(req, res) {
    const request = parseRequest(req);
    const identifiers = resolveIdentifiers({
      type: request.type,
      id: request.id,
      specialCatalogPrefixes,
    });
    const plan = planSearch({
      type: request.type,
      query: request.query,
      identifiers,
      planner: deps.planner,
    });
    const ranked = rankResults({
      streams: Array.isArray(plan?.candidateStreams) ? plan.candidateStreams : [],
      triageDecisionByDownloadUrl: plan?.triageDecisionByDownloadUrl,
    });
    const response = buildResponse({
      buckets: ranked?.buckets,
    });

    req.streamV2Context = {
      request,
      identifiers,
      plan,
      ranked,
      response,
    };

    return pipelineExecutor(req, res);
  };
}

module.exports = {
  createGetStreamsUseCase,
};
