function deriveResultKey(result) {
  if (!result) return null;
  const indexerId = result.indexerId || result.IndexerId || 'unknown';
  const indexer = result.indexer || result.Indexer || '';
  const title = (result.title || result.Title || '').trim();
  const size = result.size || result.Size || 0;

  // Use title + indexer info + size as unique key for better deduplication
  return `${indexerId}|${indexer}|${title}|${size}`;
}

function createStrictPlanMatcher({
  type,
  seasonNum,
  episodeNum,
  releaseYear,
  annotateNzbResult,
  parseReleaseMetadata,
  sanitizeStrictSearchPhrase,
  matchesStrictSearch,
  logPrefix,
  debugEnabled,
}) {
  return (plan, item) => {
    if (!plan?.strictMatch || !plan.strictPhrase) return true;
    const annotated = (item?.parsedTitle || item?.parsedTitleDisplay || item?.season || item?.episode || item?.year)
      ? item
      : annotateNzbResult(item, 0);
    const candidateTitle = (annotated?.parsedTitle || annotated?.title || annotated?.Title || '').trim();
    const strictTitlePhrase = (() => {
      try {
        const parsed = parseReleaseMetadata(plan.query || plan.strictPhrase);
        if (parsed?.parsedTitle) return sanitizeStrictSearchPhrase(parsed.parsedTitle);
      } catch (_) {
        // Fallback to the stored strict phrase.
      }
      return plan.strictPhrase;
    })();

    if (!candidateTitle) {
      if (debugEnabled) {
        console.log(`${logPrefix} Strict text match failed (no parsed title)`, {
          rawTitle: item?.title || item?.Title || null,
          query: plan.query,
        });
      }
      return false;
    }
    if (!matchesStrictSearch(candidateTitle, strictTitlePhrase)) {
      if (debugEnabled) {
        console.log(`${logPrefix} Strict text match failed (title mismatch)`, {
          title: candidateTitle,
          query: strictTitlePhrase,
        });
      }
      return false;
    }
    if (type === 'series' && Number.isFinite(seasonNum) && Number.isFinite(episodeNum)) {
      if (!Number.isFinite(annotated?.season) || !Number.isFinite(annotated?.episode)) {
        if (debugEnabled) {
          console.log(`${logPrefix} Strict text match failed (missing season/episode)`, {
            title: candidateTitle,
            season: annotated?.season ?? null,
            episode: annotated?.episode ?? null,
            query: plan.query,
          });
        }
        return false;
      }
      if (Number(annotated.season) !== Number(seasonNum) || Number(annotated.episode) !== Number(episodeNum)) {
        if (debugEnabled) {
          console.log(`${logPrefix} Strict text match failed (season/episode mismatch)`, {
            title: candidateTitle,
            season: annotated?.season ?? null,
            episode: annotated?.episode ?? null,
            expectedSeason: seasonNum,
            expectedEpisode: episodeNum,
            query: plan.query,
          });
        }
        return false;
      }
    }
    if (type === 'movie' && Number.isFinite(releaseYear)) {
      if (!Number.isFinite(annotated?.year)) {
        if (debugEnabled) {
          console.log(`${logPrefix} Strict text match failed (missing year)`, {
            title: candidateTitle,
            year: annotated?.year ?? null,
            expectedYear: releaseYear,
            query: plan.query,
          });
        }
        return false;
      }
      if (Number(annotated.year) !== Number(releaseYear)) {
        if (debugEnabled) {
          console.log(`${logPrefix} Strict text match failed (year mismatch)`, {
            title: candidateTitle,
            year: annotated?.year ?? null,
            expectedYear: releaseYear,
            query: plan.query,
          });
        }
        return false;
      }
    }
    if (type === 'movie') {
      const releaseTypes = Array.isArray(annotated?.releaseTypes)
        ? annotated.releaseTypes.map((value) => String(value).toLowerCase())
        : [];
      const adultReleaseTypes = new Set(['xxx', 'adult', 'porn', 'pornographic', 'erotic', 'erotica']);
      const hasAdultReleaseType = releaseTypes.some((value) => adultReleaseTypes.has(value));
      if (hasAdultReleaseType) {
        if (debugEnabled) {
          console.log(`${logPrefix} Strict text match failed (adult release type)`, {
            title: candidateTitle,
            releaseTypes,
            query: plan.query,
          });
        }
        return false;
      }
      const audioOnlyPattern = /\b(soundtrack|ost|score|album|flac|mp3|aac|alac|wav|ape|m4a)\b/i;
      const containerValue = (annotated?.container || '').toString().toLowerCase();
      const isVideoContainer = /(mkv|mp4|avi|mov|wmv|mpg|mpeg|m4v|webm|ts|m2ts)/i.test(containerValue);
      if (audioOnlyPattern.test(candidateTitle) && !isVideoContainer) {
        if (debugEnabled) {
          console.log(`${logPrefix} Strict text match failed (audio-only title)`, {
            title: candidateTitle,
            container: containerValue || null,
            query: plan.query,
          });
        }
        return false;
      }
    }
    if (debugEnabled) {
      console.log(`${logPrefix} Strict text match passed`, {
        title: candidateTitle,
        season: annotated?.season ?? null,
        episode: annotated?.episode ?? null,
        year: annotated?.year ?? null,
        query: plan.query,
      });
    }
    return true;
  };
}

module.exports = {
  deriveResultKey,
  createStrictPlanMatcher,
};
