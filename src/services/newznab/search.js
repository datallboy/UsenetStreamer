const axios = require('axios');
const { parseStringPromise: parseXmlString } = require('xml2js');
const { getRandomUserAgent } = require('../../utils/userAgent');
const {
  XML_PARSE_OPTIONS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEBUG_BODY_CHAR_LIMIT,
  NEWZNAB_TEST_LOG_PREFIX,
} = require('./constants');
const {
  maskApiKey,
  extractErrorFromParsed,
  extractErrorFromBody,
  extractRequiredIdParams,
  buildSearchParams,
  ensureArray,
  normalizeNewznabItem,
} = require('./utils');

async function fetchIndexerResults(config, plan, options) {
  const supportedParams = options.supportedParams instanceof Set ? options.supportedParams : null;
  let effectivePlan = plan;
  if (supportedParams && Array.isArray(plan?.tokens)) {
    const filteredTokens = plan.tokens.filter((token) => {
      if (!token || typeof token !== 'string') return false;
      const match = token.match(/^\{([^:]+):/);
      if (!match) return true;
      const key = match[1].trim().toLowerCase();
      if (supportedParams.has(key)) return true;
      if (key === 'episode' && supportedParams.has('ep')) return true;
      if (key === 'ep' && supportedParams.has('episode')) return true;
      return false;
    });
    effectivePlan = { ...plan, tokens: filteredTokens };
    if (effectivePlan.rawQuery && !supportedParams.has('q')) {
      effectivePlan = { ...effectivePlan, rawQuery: null };
    }
  }

  const params = buildSearchParams(effectivePlan);
  params.apikey = config.apiKey;
  const requestUrl = config.baseUrl || `${config.endpoint}${config.apiPath}`;
  const safeParams = { ...params, apikey: maskApiKey(params.apikey) };
  const logPrefix = options.label || '[NEWZNAB]';

  if (options.logEndpoints) {
    const tokenSummary = Array.isArray(effectivePlan?.tokens) && effectivePlan.tokens.length > 0 ? effectivePlan.tokens.join(' ') : null;
    console.log(`${logPrefix}[ENDPOINT]`, {
      indexer: config.displayName || config.endpoint,
      planType: plan?.type,
      query: plan?.query,
      tokens: tokenSummary,
      url: requestUrl,
    });
  }
  if (options.debug) {
    console.log(`${logPrefix}[SEARCH][REQ]`, { url: requestUrl, params: safeParams });
  }

  const response = await axios.get(requestUrl, {
    params,
    timeout: options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    responseType: 'text',
    headers: {
      'User-Agent': getRandomUserAgent(),
    },
    validateStatus: () => true,
  });

  const contentType = response.headers?.['content-type'];
  const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

  if (options.debug) {
    console.log(`${logPrefix}[SEARCH][RESP]`, {
      url: requestUrl,
      status: response.status,
      contentType,
      body: body?.slice(0, DEBUG_BODY_CHAR_LIMIT),
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized (check API key)');
  }
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }

  const parsed = await parseXmlString(body, XML_PARSE_OPTIONS);
  const explicitError = extractErrorFromParsed(parsed) || extractErrorFromBody(body);
  if (explicitError) {
    throw new Error(explicitError);
  }
  const channel = parsed?.channel || parsed?.rss?.channel || parsed?.rss?.Channel || parsed?.rss;
  const itemsRaw = channel?.item || channel?.Item || parsed?.item || [];
  const items = ensureArray(itemsRaw)
    .map((item) => normalizeNewznabItem(item, config, { filterNzbOnly: options.filterNzbOnly }))
    .filter(Boolean);

  return { config, items };
}

async function searchNewznabIndexers(plan, configs, options = {}, deps) {
  const {
    filterUsableConfigs,
    getSupportedParams,
  } = deps;

  const defaults = {
    filterNzbOnly: true,
    debug: false,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    label: '[NEWZNAB]',
    logEndpoints: false,
  };
  const settings = { ...defaults, ...options };
  const eligible = filterUsableConfigs(configs, { requireEnabled: true, requireApiKey: true });
  if (!eligible.length) {
    return { results: [], errors: ['No enabled Newznab indexers configured'], endpoints: [] };
  }

  const requiredIdParams = extractRequiredIdParams(plan);
  const supportedMatrix = await Promise.all(
    eligible.map(async (config) => ({
      config,
      supportedParams: await getSupportedParams(config, { ...settings, planType: plan?.type }),
    }))
  );

  const filteredEligible = supportedMatrix
    .filter(({ config, supportedParams }) => {
      if (!supportedParams || supportedParams.size === 0) return true;
      if (requiredIdParams.size === 0) return true;
      let hasAny = false;
      for (const key of requiredIdParams) {
        if (supportedParams.has(key)) {
          hasAny = true;
          break;
        }
      }
      if (!hasAny && settings.debug) {
        console.log(`${settings.label}[SKIP] ${config.displayName} does not support any of ${Array.from(requiredIdParams).join(', ')}`);
      }
      return hasAny;
    })
    .map(({ config }) => config);

  if (!filteredEligible.length) {
    return { results: [], errors: ['No enabled Newznab indexers support the requested IDs'], endpoints: [] };
  }

  const tasks = filteredEligible.map((config) => {
    const supportedParams = supportedMatrix.find((entry) => entry.config === config)?.supportedParams || null;
    return fetchIndexerResults(config, plan, { ...settings, supportedParams });
  });

  const settled = await Promise.allSettled(tasks);
  const aggregated = [];
  const errors = [];
  const endpoints = [];

  settled.forEach((result, idx) => {
    const config = filteredEligible[idx];
    if (result.status === 'fulfilled') {
      aggregated.push(...result.value.items);
      endpoints.push({
        id: config.id,
        name: config.displayName,
        count: result.value.items.length,
      });
    } else {
      const message = result.reason?.message || result.reason || 'Unknown Newznab error';
      errors.push(`${config.displayName}: ${message}`);
      endpoints.push({
        id: config.id,
        name: config.displayName,
        count: 0,
        error: message,
      });
    }
  });

  return { results: aggregated, errors, endpoints };
}

async function validateNewznabSearch(config, options = {}) {
  const plan = {
    type: 'search',
    query: options.query || 'usenetstreamer',
    rawQuery: options.query || 'usenetstreamer',
    tokens: [],
  };
  const { items = [] } = await fetchIndexerResults(config, plan, {
    filterNzbOnly: false,
    timeoutMs: options.timeoutMs || 15000,
    debug: options.debug,
    label: options.label || NEWZNAB_TEST_LOG_PREFIX,
  });
  const total = Array.isArray(items) ? items.length : 0;
  const summary = total > 0
    ? `API validated (${total} sample NZB${total === 1 ? '' : 's'} returned)`
    : 'API validated';
  return summary;
}

async function testNewznabCaps(config, options = {}) {
  if (!config?.endpoint) {
    throw new Error('Newznab endpoint is required');
  }
  if (!config.apiKey) {
    throw new Error('Newznab API key is required');
  }
  const requestUrl = config.baseUrl || `${config.endpoint}${config.apiPath}`;
  const params = { t: 'caps', apikey: config.apiKey };
  const debugEnabled = Boolean(options.debug);
  const logPrefix = options.label || NEWZNAB_TEST_LOG_PREFIX;
  if (debugEnabled) {
    console.log(`${logPrefix}[REQ]`, { url: requestUrl, params: { ...params, apikey: maskApiKey(params.apikey) } });
  }

  const response = await axios.get(requestUrl, {
    params,
    timeout: options.timeoutMs || 12000,
    responseType: 'text',
    validateStatus: () => true,
  });
  const contentType = response.headers?.['content-type'];
  const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  if (debugEnabled) {
    console.log(`${logPrefix}[RESP]`, {
      url: requestUrl,
      status: response.status,
      contentType,
      body: body?.slice(0, DEBUG_BODY_CHAR_LIMIT),
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('Unauthorized (check API key)');
  }
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }
  let parsed = null;
  try {
    parsed = await parseXmlString(body, XML_PARSE_OPTIONS);
  } catch (error) {
    if (debugEnabled) {
      console.warn(`${logPrefix}[PARSE] Failed to parse CAPS XML`, error?.message || error);
    }
  }

  const explicitError = extractErrorFromParsed(parsed) || extractErrorFromBody(body);
  if (explicitError) {
    throw new Error(explicitError);
  }

  const lowerPayload = (body || '').toLowerCase();
  const hasCaps = Boolean(
    (parsed && (parsed.caps || parsed.Caps || parsed['newznab:caps'])) ||
    lowerPayload.includes('<caps')
  );
  if (!hasCaps) {
    throw new Error('Unexpected response from Newznab (missing <caps>)');
  }
  return `Connected to ${config.displayName || 'Newznab'}`;
}

module.exports = {
  searchNewznabIndexers,
  validateNewznabSearch,
  testNewznabCaps,
};
