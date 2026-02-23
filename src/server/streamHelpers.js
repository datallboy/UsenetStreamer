const { toFiniteNumber, toBoolean, parseCommaList } = require('../utils/config');
const { normalizeResolutionToken } = require('../utils/parsers');

function formatResolutionBadge(resolution) {
  if (!resolution) return null;
  const normalized = resolution.toLowerCase();

  if (normalized === '8k' || normalized === '4320p') return '8K';
  if (normalized === '4k' || normalized === '2160p' || normalized === 'uhd') return '4K';

  if (normalized.endsWith('p')) return normalized.toUpperCase();
  return resolution;
}

function extractQualityFeatureBadges(title, patterns = []) {
  if (!title) return [];
  const badges = [];
  patterns.forEach(({ label, regex }) => {
    if (regex.test(title)) {
      badges.push(label);
    }
  });
  return badges;
}

function encodeStreamParams(params) {
  const json = JSON.stringify(Object.fromEntries(params.entries()));
  return Buffer.from(json, 'utf8').toString('base64url');
}

function decodeStreamParams(encoded) {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function buildStreamCacheKey({ type, id, query = {}, requestedEpisode = null }) {
  const normalizedQuery = {};
  Object.keys(query)
    .sort()
    .forEach((key) => {
      normalizedQuery[key] = query[key];
    });
  const normalizedEpisode = requestedEpisode
    ? {
      season: Number.isFinite(requestedEpisode.season) ? requestedEpisode.season : null,
      episode: Number.isFinite(requestedEpisode.episode) ? requestedEpisode.episode : null,
    }
    : null;
  return JSON.stringify({ type, id, requestedEpisode: normalizedEpisode, query: normalizedQuery });
}

function sanitizeStrictSearchPhrase(text) {
  if (!text) return '';
  return text
    .replace(/&/g, ' and ')
    .replace(/[\.\-_:\s]+/g, ' ')
    .replace(/[^\w\sÀ-ÿ]/g, '')
    .toLowerCase()
    .trim();
}

function matchesStrictSearch(title, strictPhrase) {
  if (!strictPhrase) return true;
  const candidate = sanitizeStrictSearchPhrase(title);
  if (!candidate) return false;
  if (candidate === strictPhrase) return true;
  const candidateTokens = candidate.split(' ').filter(Boolean);
  const phraseTokens = strictPhrase.split(' ').filter(Boolean);
  if (phraseTokens.length === 0) return true;

  // Nothing before first query token, nothing after last query token, gaps allowed in between
  if (candidateTokens[0] !== phraseTokens[0]) return false;
  if (candidateTokens[candidateTokens.length - 1] !== phraseTokens[phraseTokens.length - 1]) return false;
  // Remaining tokens must appear in order, gaps allowed
  let candidateIdx = 1;
  for (let i = 1; i < phraseTokens.length; i += 1) {
    const token = phraseTokens[i];
    let found = false;
    while (candidateIdx < candidateTokens.length) {
      if (candidateTokens[candidateIdx] === token) {
        found = true;
        candidateIdx += 1;
        break;
      }
      candidateIdx += 1;
    }
    if (!found) return false;
  }
  return true;
}

function extractTriageOverrides(query) {
  if (!query || typeof query !== 'object') return {};
  const sizeCandidate = query.maxSizeGb ?? query.max_size_gb ?? query.triageSizeGb ?? query.triage_size_gb ?? query.preferredSizeGb;
  const sizeGb = toFiniteNumber(sizeCandidate, null);
  const maxSizeBytes = Number.isFinite(sizeGb) && sizeGb > 0 ? sizeGb * 1024 * 1024 * 1024 : null;
  let indexerSource = null;
  if (typeof query.triageIndexerIds === 'string') indexerSource = query.triageIndexerIds;
  else if (Array.isArray(query.triageIndexerIds)) indexerSource = query.triageIndexerIds.join(',');
  const indexers = indexerSource ? parseCommaList(indexerSource) : null;
  const disabled = query.triageDisabled !== undefined ? toBoolean(query.triageDisabled, true) : null;
  const enabled = query.triageEnabled !== undefined ? toBoolean(query.triageEnabled, false) : null;
  const sortMode = typeof query.sortMode === 'string' ? query.sortMode : query.nzbSortMode;
  const preferredLanguageInput = query.preferredLanguages ?? query.preferredLanguage ?? query.language ?? query.lang;
  let dedupeOverride = null;
  if (query.dedupe !== undefined) {
    dedupeOverride = toBoolean(query.dedupe, true);
  } else if (query.dedupeEnabled !== undefined) {
    dedupeOverride = toBoolean(query.dedupeEnabled, true);
  } else if (query.dedupeDisabled !== undefined) {
    dedupeOverride = !toBoolean(query.dedupeDisabled, false);
  }
  return {
    maxSizeBytes,
    indexers,
    disabled,
    enabled,
    sortMode: typeof sortMode === 'string' ? sortMode : null,
    preferredLanguages: typeof preferredLanguageInput === 'string' ? preferredLanguageInput : null,
    dedupeEnabled: dedupeOverride,
  };
}

function parseAllowedResolutionList(rawValue) {
  const entries = parseCommaList(rawValue);
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries
    .map((entry) => normalizeResolutionToken(entry))
    .filter(Boolean);
}

function parseResolutionLimitValue(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  const normalized = String(rawValue).trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

module.exports = {
  formatResolutionBadge,
  extractQualityFeatureBadges,
  encodeStreamParams,
  decodeStreamParams,
  buildStreamCacheKey,
  sanitizeStrictSearchPhrase,
  matchesStrictSearch,
  extractTriageOverrides,
  parseAllowedResolutionList,
  parseResolutionLimitValue,
};
