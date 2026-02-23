async function prepareMetadataBootstrap({
  meta,
  incomingImdbId,
  incomingTmdbId,
  incomingTvdbId,
  isSpecialRequest,
  baseIdentifier,
  specialMetadataService,
  type,
  strictIdMatch,
  hasTitleInQuery,
  hasTvdbInQuery,
  hasTmdbInQuery,
  tmdbService,
  skipMetadataFetch,
  easynewsService,
  cinemetaUrl,
  axios,
}) {
  const metaSources = [meta];
  if (incomingImdbId) {
    metaSources.push({ ids: { imdb: incomingImdbId }, imdb_id: incomingImdbId });
  }
  if (incomingTmdbId) {
    metaSources.push({ ids: { tmdb: incomingTmdbId }, tmdb_id: String(incomingTmdbId) });
  }
  if (incomingTvdbId) {
    metaSources.push({ ids: { tvdb: incomingTvdbId }, tvdb_id: incomingTvdbId });
  }

  let specialMetadataResult = null;
  if (isSpecialRequest) {
    try {
      specialMetadataResult = await specialMetadataService.fetchSpecialMetadata(baseIdentifier);
      if (specialMetadataResult?.title) {
        metaSources.push({ title: specialMetadataResult.title, name: specialMetadataResult.title });
        console.log('[SPECIAL META] Resolved title for external catalog request', { title: specialMetadataResult.title });
      }
    } catch (error) {
      const bootstrapError = new Error('Failed to resolve external metadata');
      bootstrapError.status = 502;
      bootstrapError.cause = error;
      throw bootstrapError;
    }
  }

  const needsStrictSeriesTvdb = !isSpecialRequest && type === 'series' && !incomingTvdbId && Boolean(incomingImdbId);
  const needsRelaxedMetadata = !isSpecialRequest && !strictIdMatch && (
    (!hasTitleInQuery) ||
    (type === 'series' && !hasTvdbInQuery) ||
    (type === 'movie' && !hasTmdbInQuery)
  );

  const shouldUseTmdb = tmdbService.isConfigured() && incomingImdbId;
  let tmdbMetadataPromise = null;
  if (shouldUseTmdb && !skipMetadataFetch) {
    console.log('[TMDB] Starting TMDb metadata fetch in background');
    tmdbMetadataPromise = tmdbService.getMetadataAndTitles({
      imdbId: incomingImdbId,
      type,
    }).then((result) => {
      if (result) {
        console.log('[TMDB] Retrieved metadata', {
          tmdbId: result.tmdbId,
          mediaType: result.mediaType,
          originalTitle: result.originalTitle,
          year: result.year,
          titleCount: result.titles.length,
        });
      }
      return result;
    }).catch((error) => {
      console.error('[TMDB] Failed to fetch metadata:', error.message);
      return null;
    });
  }

  const needsCinemeta = !skipMetadataFetch && !shouldUseTmdb && (
    needsStrictSeriesTvdb
    || needsRelaxedMetadata
    || easynewsService.requiresCinemetaMetadata(isSpecialRequest)
  );

  let cinemetaPromise = null;
  if (needsCinemeta) {
    const cinemetaPath = type === 'series' ? `series/${baseIdentifier}.json` : `${type}/${baseIdentifier}.json`;
    const targetUrl = `${cinemetaUrl}/${cinemetaPath}`;
    console.log(`[CINEMETA] Starting Cinemeta fetch in background from ${targetUrl}`);
    cinemetaPromise = axios.get(targetUrl, { timeout: 10000 })
      .then((response) => {
        const resolvedMeta = response.data?.meta || null;
        if (resolvedMeta) {
          console.log('[CINEMETA] Received metadata identifiers', {
            imdb: resolvedMeta?.ids?.imdb || resolvedMeta?.imdb_id,
            tvdb: resolvedMeta?.ids?.tvdb || resolvedMeta?.tvdb_id,
            tmdb: resolvedMeta?.ids?.tmdb || resolvedMeta?.tmdb_id
          });
          console.log('[CINEMETA] Received metadata fields', {
            title: resolvedMeta?.title,
            name: resolvedMeta?.name,
            originalTitle: resolvedMeta?.originalTitle,
            year: resolvedMeta?.year,
            released: resolvedMeta?.released
          });
        } else {
          console.warn('[CINEMETA] No metadata payload returned');
        }
        return resolvedMeta;
      })
      .catch((error) => {
        console.warn(`[CINEMETA] Failed to fetch metadata for ${baseIdentifier}: ${error.message}`);
        return null;
      });
  }

  return {
    metaSources,
    specialMetadataResult,
    tmdbMetadataPromise,
    cinemetaPromise,
  };
}

module.exports = {
  prepareMetadataBootstrap,
};
