function pickFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || null;
}

function createValueCollector(metaSources) {
  return (...extractors) => {
    const collected = [];
    for (const source of metaSources) {
      if (!source) continue;
      for (const extractor of extractors) {
        try {
          const value = extractor(source);
          if (value !== undefined && value !== null) {
            collected.push(value);
          }
        } catch (_) {
          // Ignore extractor errors on unexpected metadata shapes.
        }
      }
    }
    return collected;
  };
}

function normalizeImdb(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const withPrefix = trimmed.startsWith('tt') ? trimmed : `tt${trimmed}`;
  return /^tt\d+$/.test(withPrefix) ? withPrefix : null;
}

function normalizeNumericId(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return trimmed;
}

function extractYear(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\d{4}/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildQueryPresenceFlags(meta) {
  const hasTvdbInQuery = Boolean(
    pickFirstDefined(
      meta?.tvdbId,
      meta?.tvdb_id,
      meta?.tvdb,
      meta?.tvdbSlug,
      meta?.tvdbid
    )
  );
  const hasTmdbInQuery = Boolean(
    pickFirstDefined(
      meta?.tmdbId,
      meta?.tmdb_id,
      meta?.tmdb,
      meta?.tmdbSlug,
      meta?.tmdbid
    )
  );
  const hasTitleInQuery = Boolean(
    pickFirstDefined(
      meta?.title,
      meta?.name,
      meta?.originalTitle,
      meta?.original_title
    )
  );
  return {
    hasTvdbInQuery,
    hasTmdbInQuery,
    hasTitleInQuery,
  };
}

module.exports = {
  pickFirstDefined,
  createValueCollector,
  normalizeImdb,
  normalizeNumericId,
  extractYear,
  buildQueryPresenceFlags,
};
