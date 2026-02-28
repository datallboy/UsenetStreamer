function resolveStreamIdentifiers({ type, id, specialCatalogPrefixes = [] }) {
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
    const lowerIdentifier = String(baseIdentifier || '').toLowerCase();
    for (const prefix of specialCatalogPrefixes) {
      const normalizedPrefix = String(prefix || '').toLowerCase();
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
  const requestLacksIdentifiers = !incomingImdbId
    && !incomingTvdbId
    && !incomingTmdbId
    && !isSpecialRequest
    && !isNzbdavRequest;

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

module.exports = {
  resolveStreamIdentifiers,
};
