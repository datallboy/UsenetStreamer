function toTrimmedString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePaidLimit(value, fallback = 6) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(String(value).trim());
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(6, Math.max(1, Math.floor(numeric)));
  return clamped;
}

function normalizeApiPath(raw) {
  let value = toTrimmedString(raw) || '/api';
  if (!value.startsWith('/')) {
    value = `/${value}`;
  }
  value = value.replace(/\/+/g, '/');
  while (value.length > 1 && value.endsWith('/')) {
    value = value.slice(0, -1);
  }
  return value || '/api';
}

function extractHost(url) {
  try {
    const target = new URL(url);
    return target.hostname || target.host || url;
  } catch (_) {
    return url;
  }
}

function maskApiKey(key) {
  if (!key) return '';
  const value = String(key);
  if (value.length <= 6) return `${value[0]}***${value[value.length - 1]}`;
  const start = value.slice(0, 3);
  const end = value.slice(-2);
  return `${start}***${end}`;
}

function extractErrorFromParsed(parsed) {
  if (!parsed) return null;
  const candidate = parsed.error || parsed.Error || parsed.errors || parsed.Errors;
  if (!candidate) return null;
  const entries = Array.isArray(candidate) ? candidate : [candidate];
  for (const entry of entries) {
    if (!entry) continue;
    const attrs = entry.$ || {};
    const code = entry.code || entry.Code || attrs.code || attrs.Code || null;
    const description = entry.description || entry.Description || attrs.description || attrs.Description || entry._ || entry.text || null;
    if (description || code) {
      return [description || 'Newznab error', code ? `(code ${code})` : null].filter(Boolean).join(' ');
    }
  }
  return null;
}

function extractErrorFromBody(body) {
  if (!body || typeof body !== 'string') return null;
  const attrMatch = body.match(/<error[^>]*description="([^"]+)"[^>]*>/i);
  if (attrMatch && attrMatch[1]) return attrMatch[1];
  const textMatch = body.match(/<error[^>]*>([^<]+)<\/error>/i);
  if (textMatch && textMatch[1]) return textMatch[1].trim();
  const jsonMatch = body.match(/"error"\s*:\s*"([^"]+)"/i);
  if (jsonMatch && jsonMatch[1]) return jsonMatch[1];
  return null;
}

function normalizeCapsType(rawType) {
  const value = (rawType || '').toLowerCase();
  if (value === 'tv-search' || value === 'tvsearch') return 'tvsearch';
  if (value === 'movie-search' || value === 'movie') return 'movie';
  return 'search';
}

function parseSupportedParamsFromXml(xml) {
  if (!xml || typeof xml !== 'string') return null;
  const regex = /<(search|tv-search|movie-search)[^>]*supportedparams="([^"]+)"/gi;
  const supportedByType = {
    search: new Set(),
    tvsearch: new Set(),
    movie: new Set(),
  };
  let match = null;
  while ((match = regex.exec(xml)) !== null) {
    const type = normalizeCapsType(match[1]);
    const raw = match[2] || '';
    raw.split(/[,\s]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .forEach((token) => supportedByType[type].add(token.toLowerCase()));
  }

  const hasAny = Object.values(supportedByType).some((set) => set.size > 0);
  return hasAny ? supportedByType : null;
}

function extractRequiredIdParams(plan) {
  const required = new Set();
  if (!plan || !Array.isArray(plan.tokens)) return required;
  plan.tokens.forEach((token) => {
    if (!token || typeof token !== 'string') return;
    const match = token.match(/^\{([^:]+):/);
    if (!match) return;
    const key = match[1].trim().toLowerCase();
    if (['imdbid', 'tvdbid', 'tmdbid'].includes(key)) {
      required.add(key);
    }
  });
  return required;
}

function applyTokenToParams(token, params) {
  if (!token || typeof token !== 'string') return;
  const match = token.match(/^\{([^:]+):(.*)\}$/);
  if (!match) return;
  const key = match[1].trim().toLowerCase();
  const rawValue = match[2].trim();

  switch (key) {
    case 'imdbid': {
      const trimmed = rawValue.replace(/^tt/i, '');
      if (trimmed) params.imdbid = trimmed;
      break;
    }
    case 'tmdbid':
      if (rawValue) params.tmdbid = rawValue;
      break;
    case 'tvdbid':
      if (rawValue) params.tvdbid = rawValue;
      break;
    case 'season':
      if (rawValue) params.season = rawValue;
      break;
    case 'episode':
      if (rawValue) params.ep = rawValue;
      break;
    default:
      if (rawValue) {
        params[key] = rawValue;
      }
      break;
  }
}

function buildSearchParams(plan) {
  const params = {};

  const hasIdToken = Array.isArray(plan?.tokens) && plan.tokens.some((token) => {
    const match = token?.match(/^\{([^:]+):/);
    return match && ['imdbid', 'tmdbid', 'tvdbid'].includes(match[1].trim().toLowerCase());
  });

  if (plan?.type === 'movie') {
    if (hasIdToken) {
      params.t = 'movie';
    } else {
      params.t = 'search';
      params.cat = '2000';
    }
  } else if (plan?.type === 'tvsearch') {
    if (hasIdToken) {
      params.t = 'tvsearch';
    } else {
      params.t = 'search';
      params.cat = '5000';
    }
  } else {
    params.t = 'search';
  }

  if (Array.isArray(plan?.tokens)) {
    plan.tokens.forEach((token) => applyTokenToParams(token, params));
  }
  if (plan?.rawQuery) {
    params.q = plan.rawQuery;
  } else if ((!plan?.tokens || plan.tokens.length === 0) && plan?.query) {
    params.q = plan.query;
  }
  return params;
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function buildAttrMap(item) {
  const map = {};
  const sources = [];
  const addSource = (source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach((entry) => addSource(entry));
      return;
    }
    sources.push(source);
  };

  addSource(item?.attr);
  addSource(item?.attrs);
  addSource(item?.attribute);
  addSource(item?.attributes);
  addSource(item?.['newznab:attr']);
  addSource(item?.['newznab:attrs']);

  sources.forEach((entry) => {
    if (!entry) return;
    const payload = entry.$ || entry;
    const name = toTrimmedString(payload.name || payload.Name || payload.field || payload.Field || payload.key || payload.Key).toLowerCase();
    if (!name) return;
    const value = payload.value ?? payload.Value ?? payload.content ?? payload.Content ?? payload['#text'] ?? payload.text;
    if (value !== undefined && value !== null) {
      map[name] = value;
    }
  });

  return map;
}

function parseGuid(rawGuid) {
  if (!rawGuid) return null;
  if (typeof rawGuid === 'string') return rawGuid;
  if (typeof rawGuid === 'object') {
    return rawGuid._ || rawGuid['#text'] || rawGuid.url || rawGuid.href || null;
  }
  return null;
}

function parseSizeValue(value) {
  if (value === undefined || value === null) return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isLikelyNzb(url) {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return (
    normalized.includes('.nzb') ||
    normalized.includes('mode=getnzb') ||
    normalized.includes('t=getnzb') ||
    normalized.includes('action=getnzb') ||
    /\bgetnzb\b/.test(normalized)
  );
}

function normalizeNewznabItem(item, config, { filterNzbOnly = true } = {}) {
  if (!item) return null;
  const parsedGuid = parseGuid(item.guid || item.GUID);
  let downloadUrl = null;

  if (parsedGuid && isLikelyNzb(parsedGuid)) {
    downloadUrl = parsedGuid;
  }

  const enclosure = item.enclosure;
  if (!downloadUrl && enclosure) {
    const enclosureTarget = Array.isArray(enclosure) ? enclosure[0] : enclosure;
    downloadUrl = enclosureTarget?.url || enclosureTarget?.href || enclosureTarget?.link;
    if (!downloadUrl && enclosureTarget?.guid) {
      downloadUrl = enclosureTarget.guid;
    }
  }
  if (!downloadUrl && item.link) {
    downloadUrl = item.link;
  }
  if (!downloadUrl && parsedGuid) {
    downloadUrl = parsedGuid;
  }
  if (!downloadUrl) return null;

  if (filterNzbOnly && !isLikelyNzb(downloadUrl)) {
    return null;
  }

  const attrMap = buildAttrMap(item);
  const sizeValue = attrMap.size || attrMap.filesize || attrMap.contentlength || item.size || item.Size;
  const publishDate = item.pubDate || item.pubdate || attrMap.pubdate || attrMap.publishdate || attrMap.usenetdate;
  const title = toTrimmedString(item.title || item.Title || item.name || downloadUrl);

  const resolved = {
    title: title || downloadUrl,
    downloadUrl,
    guid: parsedGuid,
    size: parseSizeValue(sizeValue),
    publishDate,
    publishDateMs: publishDate ? Date.parse(publishDate) : undefined,
    indexer: config.displayName,
    indexerId: config.dedupeKey,
    _sourceType: 'newznab',
  };

  if (attrMap.age) resolved.age = attrMap.age;
  if (attrMap.category) resolved.category = attrMap.category;
  if (!resolved.indexer && attrMap.indexer) {
    resolved.indexer = attrMap.indexer;
  }

  return resolved;
}

module.exports = {
  toTrimmedString,
  parseBoolean,
  parsePaidLimit,
  normalizeApiPath,
  extractHost,
  maskApiKey,
  extractErrorFromParsed,
  extractErrorFromBody,
  normalizeCapsType,
  parseSupportedParamsFromXml,
  extractRequiredIdParams,
  buildSearchParams,
  ensureArray,
  normalizeNewznabItem,
};
