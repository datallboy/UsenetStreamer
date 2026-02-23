function parseRequestIdentifiers(type, id, specialCatalogPrefixes = []) {
  let baseIdentifier = id;
  if (type === 'series' && typeof id === 'string') {
    const parts = id.split(':');
    if (parts.length >= 3) {
      const potentialEpisode = Number.parseInt(parts[parts.length - 1], 10);
      const potentialSeason = Number.parseInt(parts[parts.length - 2], 10);
      if (Number.isFinite(potentialSeason) && Number.isFinite(potentialEpisode)) {
        baseIdentifier = parts.slice(0, parts.length - 2).join(':');
      }
    }
  }

  let incomingImdbId = null;
  let incomingTvdbId = null;
  let incomingSpecialId = null;
  let incomingTmdbId = null;
  let incomingNzbdavId = null;

  if (/^tt\d+$/i.test(baseIdentifier)) {
    incomingImdbId = baseIdentifier.startsWith('tt') ? baseIdentifier : `tt${baseIdentifier}`;
    baseIdentifier = incomingImdbId;
  } else if (/^tmdb:/i.test(baseIdentifier)) {
    const tmdbMatch = baseIdentifier.match(/^tmdb:([0-9]+)(?::.*)?$/i);
    if (tmdbMatch) {
      incomingTmdbId = tmdbMatch[1];
      baseIdentifier = `tmdb:${incomingTmdbId}`;
    }
  } else if (/^tvdb:/i.test(baseIdentifier)) {
    const tvdbMatch = baseIdentifier.match(/^tvdb:([0-9]+)(?::.*)?$/i);
    if (tvdbMatch) {
      incomingTvdbId = tvdbMatch[1];
      baseIdentifier = `tvdb:${incomingTvdbId}`;
    }
  } else {
    const lowerIdentifier = baseIdentifier.toLowerCase();
    for (const prefix of specialCatalogPrefixes) {
      const normalizedPrefix = prefix.toLowerCase();
      if (lowerIdentifier.startsWith(`${normalizedPrefix}:`)) {
        const remainder = baseIdentifier.slice(prefix.length + 1);
        if (remainder) {
          incomingSpecialId = remainder;
          baseIdentifier = `${prefix}:${remainder}`;
        }
        break;
      }
    }
    if (!incomingSpecialId && lowerIdentifier.startsWith('nzbdav:')) {
      const remainder = baseIdentifier.slice('nzbdav:'.length);
      if (remainder) {
        incomingNzbdavId = remainder.trim();
        baseIdentifier = `nzbdav:${incomingNzbdavId}`;
      }
    }
  }

  const isSpecialRequest = Boolean(incomingSpecialId);
  const isNzbdavRequest = Boolean(incomingNzbdavId);
  const requestLacksIdentifiers = !incomingImdbId && !incomingTvdbId && !incomingTmdbId && !isSpecialRequest && !isNzbdavRequest;

  return {
    baseIdentifier,
    incomingImdbId,
    incomingTvdbId,
    incomingSpecialId,
    incomingTmdbId,
    incomingNzbdavId,
    isSpecialRequest,
    isNzbdavRequest,
    requestLacksIdentifiers,
  };
}

async function resolveExternalIds({
  type,
  incomingImdbId,
  incomingTvdbId,
  incomingTmdbId,
  tmdbService,
  tvdbService,
}) {
  let resolvedImdbId = incomingImdbId;
  let resolvedTvdbId = incomingTvdbId;
  let resolvedTmdbId = incomingTmdbId;

  if (resolvedTmdbId && !resolvedImdbId && !resolvedTvdbId) {
    if (!tmdbService.isConfigured()) {
      return {
        error: { status: 400, message: 'TMDb is not configured (enable TMDB and set API key).' },
      };
    }
    const mediaType = type === 'movie' ? 'movie' : 'series';
    const externalIds = await tmdbService.getExternalIds(resolvedTmdbId, mediaType);
    if (externalIds?.imdbId) {
      resolvedImdbId = externalIds.imdbId.startsWith('tt') ? externalIds.imdbId : `tt${externalIds.imdbId}`;
    }
    if (externalIds?.tvdbId) {
      resolvedTvdbId = externalIds.tvdbId;
    }
    if (!resolvedImdbId && !resolvedTvdbId) {
      return {
        error: { status: 404, message: 'TMDb ID has no IMDb/TVDB mapping.' },
      };
    }
  }

  if (type === 'movie' && !resolvedTmdbId && resolvedImdbId && tmdbService.isConfigured()) {
    const tmdbFind = await tmdbService.findByExternalId(resolvedImdbId, 'imdb_id');
    if (tmdbFind?.tmdbId && tmdbFind.mediaType === 'movie') {
      resolvedTmdbId = String(tmdbFind.tmdbId);
    }
  }

  if (type === 'series' && tvdbService.isConfigured()) {
    if (resolvedTvdbId && !resolvedImdbId) {
      const tvdbLookup = await tvdbService.getImdbIdForSeries(resolvedTvdbId);
      if (tvdbLookup?.imdbId) {
        resolvedImdbId = tvdbLookup.imdbId.startsWith('tt') ? tvdbLookup.imdbId : `tt${tvdbLookup.imdbId}`;
      }
    } else if (resolvedImdbId && !resolvedTvdbId) {
      const tvdbLookup = await tvdbService.getTvdbIdForSeries(resolvedImdbId);
      if (tvdbLookup?.tvdbId) {
        resolvedTvdbId = tvdbLookup.tvdbId;
      }
    }
  }

  return {
    ids: {
      incomingImdbId: resolvedImdbId,
      incomingTvdbId: resolvedTvdbId,
      incomingTmdbId: resolvedTmdbId,
    },
  };
}

module.exports = {
  parseRequestIdentifiers,
  resolveExternalIds,
};
