const { deriveResultKey, createStrictPlanMatcher } = require('./streamPlanHelpers');
const { parseRequestIdentifiers, resolveExternalIds } = require('./identifierHelpers');
const { buildNzbdavHistoryResponse } = require('./nzbdavHistoryHelper');
const { hydrateStreamCache } = require('./streamCacheHelper');
const { startVerifiedPrefetch } = require('./prefetchHelper');
const {
  pickFirstDefined,
  createValueCollector,
  normalizeImdb,
  normalizeNumericId,
  extractYear,
  buildQueryPresenceFlags,
} = require('./requestMetadataHelpers');
const { buildPatternFromTokenList } = require('./namingPatternHelpers');
const { prepareMetadataBootstrap } = require('./metadataBootstrapHelper');
const { createSearchPlanManager } = require('./searchPlanManager');
const { normalizeCombinedPlanSettled } = require('./planResultHelpers');
const { stripSeriesSubtitle } = require('./titleSearchHelpers');
const { buildStreamPayload } = require('./streamPayloadBuilder');
const {
  isNativeStreamingMode,
  supportsNzbdavFeatures,
  ensureStreamingPrerequisites,
  resolveCategoryForType,
  fetchHistoryByTitle,
  buildBehaviorHintsForMode,
} = require('./streamModeHelpers');
const {
  resolveHealthIndexerContext,
  buildTriagePool,
} = require('./triagePoolHelpers');

async function handleStreamRequestService(req, res, ctx) {
  // Context bundle is assembled by server bootstrap and route-context factory.
  const {
    ensureAddonConfigured,
    INDEXER_MANAGER,
    INDEXER_MANAGER_LABEL,
    INDEXER_MANAGER_URL,
    indexerService,
    STREAMING_MODE,
    nzbdavService,
    triggerRequestTriagePrewarm,
    tmdbService,
    tvdbService,
    NZBDAV_HISTORY_CATALOG_LIMIT,
    ADDON_SHARED_SECRET,
    ADDON_BASE_URL,
    encodeStreamParams,
    cache,
    STREAM_CACHE_MAX_ENTRIES,
    buildStreamCacheKey,
    restoreTriageDecisions,
    isTriageFinalStatus,
    restoreFinalNzbResults,
    dedupeResultsByTitle,
    buildTriageTitleMap,
    extractTriageOverrides,
    INDEXER_DEDUP_ENABLED,
    specialMetadata,
    CINEMETA_URL,
    axios,
    INDEXER_MANAGER_STRICT_ID_MATCH,
    easynewsService,
    sanitizeStrictSearchPhrase,
    parseReleaseMetadata,
    matchesStrictSearch,
    annotateNzbResult,
    executeManagerPlanWithBackoff,
    executeNewznabPlan,
    INDEXER_LOG_PREFIX,
    NEWZNAB_LOG_PREFIX,
    INDEXER_MANAGER_INDEXERS,
    resolvePreferredLanguages,
    INDEXER_PREFERRED_LANGUAGES,
    INDEXER_SORT_MODE,
    prepareSortedResults,
    RELEASE_EXCLUSIONS,
    ALLOWED_RESOLUTIONS,
    RESOLUTION_LIMIT_PER_QUALITY,
    getPreferredLanguageMatches,
    resolveLanguageLabels,
    resolveLanguageLabel,
    formatResolutionBadge,
    extractQualityFeatureBadges,
    QUALITY_FEATURE_PATTERNS,
    TRIAGE_FINAL_STATUSES,
    TRIAGE_PRIORITY_INDEXERS,
    TRIAGE_HEALTH_INDEXERS,
    TRIAGE_SERIALIZED_INDEXERS,
    TRIAGE_MAX_CANDIDATES,
    buildCombinedLimitMap,
    normalizeIndexerToken,
    normalizeResolutionToken,
    prioritizeTriageCandidates,
    TRIAGE_ENABLED,
    TRIAGE_NNTP_CONFIG,
    TRIAGE_TIME_BUDGET_MS,
    TRIAGE_BASE_OPTIONS,
    triageAndRank,
    triageDecisionsMatchStatuses,
    sanitizeDecisionForCache,
    serializeFinalNzbResults,
    TRIAGE_PREFETCH_FIRST_VERIFIED,
    prefetchTracker,
    ACTIVE_NEWZNAB_CONFIGS,
    INDEXER_MAX_RESULT_SIZE_BYTES,
    RELEASE_BLOCKLIST_REGEX,
    normalizeReleaseTitle,
    nzbMatchesIndexer,
    INDEXER_HIDE_BLOCKED_RESULTS,
    inferMimeType,
    formatStreamTitle,
    NZB_NAMING_PATTERN,
    NZB_DISPLAY_NAME_PATTERN,
    DEFAULT_ADDON_NAME,
    ADDON_NAME,
    buildNntpServersArray,
    resolvePrefetchedNzbdavJob,
    parseRequestedEpisode,
    toBoolean,
    isNzDebugEnabled,
    getNewznabDebugFlags,
    getPaidDirectIndexerTokens,
  } = ctx;
  const requestStartTs = Date.now();
  const { type, id } = req.params;
  const isNativeMode = isNativeStreamingMode(STREAMING_MODE);
  const useNzbdavFeatures = supportsNzbdavFeatures(STREAMING_MODE);
  console.log(`[REQUEST] Received request for ${type} ID: ${id}`, { ts: new Date(requestStartTs).toISOString() });
  let triagePrewarmPromise = null;

  const addonBaseUrl = ADDON_BASE_URL.replace(/\/$/, '');

  // 1) Parse inbound Stremio identifier (IMDb/TVDB/TMDb/special/NZBDav).
  let {
    baseIdentifier,
    incomingImdbId,
    incomingTvdbId,
    incomingSpecialId,
    incomingTmdbId,
    incomingNzbdavId,
    isSpecialRequest,
    isNzbdavRequest,
    requestLacksIdentifiers,
  } = parseRequestIdentifiers(type, id, specialMetadata.specialCatalogPrefixes);

  if (requestLacksIdentifiers && !isSpecialRequest) {
    res.status(400).json({ error: `Unsupported ID prefix for indexer manager search: ${baseIdentifier}` });
    return;
  }

  try {
    ensureAddonConfigured();
    ensureStreamingPrerequisites({
      streamingMode: STREAMING_MODE,
      indexerManager: INDEXER_MANAGER,
      indexerService,
      nzbdavService,
    });
    triagePrewarmPromise = triggerRequestTriagePrewarm();

    // 2) Resolve cross-system IDs so downstream search has canonical inputs.
    const externalIdResolution = await resolveExternalIds({
      type,
      incomingImdbId,
      incomingTvdbId,
      incomingTmdbId,
      tmdbService,
      tvdbService,
    });
    if (externalIdResolution.error) {
      res.status(externalIdResolution.error.status).json({ error: externalIdResolution.error.message });
      return;
    }
    incomingImdbId = externalIdResolution.ids.incomingImdbId;
    incomingTvdbId = externalIdResolution.ids.incomingTvdbId;
    incomingTmdbId = externalIdResolution.ids.incomingTmdbId;

    if (isNzbdavRequest) {
      // 3) Fast-path for NZBDav history items (no indexer search needed).
      const historyResponse = await buildNzbdavHistoryResponse({
        type,
        id,
        incomingNzbdavId,
        streamingMode: STREAMING_MODE,
        nzbdavService,
        nzbdavHistoryCatalogLimit: NZBDAV_HISTORY_CATALOG_LIMIT,
        addonBaseUrl,
        addonSharedSecret: ADDON_SHARED_SECRET,
        encodeStreamParams,
      });
      res.status(historyResponse.status).json(historyResponse.payload);
      return;
    }

    const requestedEpisode = parseRequestedEpisode(type, id, req.query || {});
    const streamCacheKey = STREAM_CACHE_MAX_ENTRIES > 0
      ? buildStreamCacheKey({ type, id, requestedEpisode, query: req.query || {} })
      : null;
    const cacheContext = hydrateStreamCache({
      streamCacheKey,
      cache,
      type,
      id,
      restoreTriageDecisions,
      isTriageFinalStatus,
      restoreFinalNzbResults,
      dedupeResultsByTitle,
    });
    const {
      immediatePayload,
      cachedSearchMeta,
      usingCachedSearchResults: initialUsingCachedSearchResults,
      finalNzbResults: initialFinalNzbResults,
      dedupedSearchResults: initialDedupedSearchResults,
      rawSearchResults: initialRawSearchResults,
      triageDecisions: initialTriageDecisions,
    } = cacheContext;
    if (immediatePayload) {
      res.json(immediatePayload);
      return;
    }

    let usingCachedSearchResults = initialUsingCachedSearchResults;
    let finalNzbResults = initialFinalNzbResults;
    let dedupedSearchResults = initialDedupedSearchResults;
    let rawSearchResults = initialRawSearchResults;
    let triageDecisions = initialTriageDecisions;
    let triageTitleMap = buildTriageTitleMap(triageDecisions);
    const triageOverrides = extractTriageOverrides(req.query || {});
    const dedupeOverride = typeof triageOverrides.dedupeEnabled === 'boolean' ? triageOverrides.dedupeEnabled : null;
    const dedupeEnabled = dedupeOverride !== null ? dedupeOverride : INDEXER_DEDUP_ENABLED;

    const meta = req.query || {};

    console.log('[REQUEST] Raw query payload from Stremio', meta);
    const { hasTvdbInQuery, hasTmdbInQuery, hasTitleInQuery } = buildQueryPresenceFlags(meta);

    const skipMetadataFetch = Boolean(cachedSearchMeta?.triageComplete);
    let tmdbMetadata = null;
    let cinemetaMeta = null;
    let metaSources = [];
    let specialMetadataResult = null;
    let tmdbMetadataPromise = null;
    let cinemetaPromise = null;
    try {
      const metadataBootstrap = await prepareMetadataBootstrap({
        meta,
        incomingImdbId,
        incomingTmdbId,
        incomingTvdbId,
        isSpecialRequest,
        baseIdentifier,
        specialMetadataService: specialMetadata,
        type,
        strictIdMatch: INDEXER_MANAGER_STRICT_ID_MATCH,
        hasTitleInQuery,
        hasTvdbInQuery,
        hasTmdbInQuery,
        tmdbService,
        skipMetadataFetch,
        easynewsService,
        cinemetaUrl: CINEMETA_URL,
        axios,
      });
      specialMetadataResult = metadataBootstrap.specialMetadataResult;
      tmdbMetadataPromise = metadataBootstrap.tmdbMetadataPromise;
      cinemetaPromise = metadataBootstrap.cinemetaPromise;
      metaSources = metadataBootstrap.metaSources;
    } catch (error) {
      console.error('[SPECIAL META] Failed to resolve metadata:', error.cause?.message || error.message);
      res.status(error.status || 502).json({ error: error.message || 'Failed to resolve external metadata' });
      return;
    }

    const collectValues = createValueCollector(metaSources);

    const seasonNum = requestedEpisode?.season ?? null;
    const episodeNum = requestedEpisode?.episode ?? null;

    const metaIds = {
      imdb: normalizeImdb(
        pickFirstDefined(
          ...collectValues(
            (src) => src?.imdb_id,
            (src) => src?.imdb,
            (src) => src?.imdbId,
            (src) => src?.imdbid,
            (src) => src?.ids?.imdb,
            (src) => src?.externals?.imdb
          ),
          incomingImdbId
        )
      ),
      tmdb: normalizeNumericId(
        pickFirstDefined(
          ...collectValues(
            (src) => src?.tmdb_id,
            (src) => src?.tmdb,
            (src) => src?.tmdbId,
            (src) => src?.ids?.tmdb,
            (src) => src?.ids?.themoviedb,
            (src) => src?.externals?.tmdb,
            (src) => src?.tmdbSlug,
            (src) => src?.tmdbid
          )
        )
      ),
      tvdb: normalizeNumericId(
        pickFirstDefined(
          ...collectValues(
            (src) => src?.tvdb_id,
            (src) => src?.tvdb,
            (src) => src?.tvdbId,
            (src) => src?.ids?.tvdb,
            (src) => src?.externals?.tvdb,
            (src) => src?.tvdbSlug,
            (src) => src?.tvdbid
          ),
          incomingTvdbId
        )
      )
    };

    console.log('[REQUEST] Normalized identifier set', metaIds);

    let movieTitle = pickFirstDefined(
      ...collectValues(
        (src) => src?.name,
        (src) => src?.title,
        (src) => src?.originalTitle,
        (src) => src?.original_title
      )
    );

    let releaseYear = extractYear(
      pickFirstDefined(
        ...collectValues(
          (src) => src?.year,
          (src) => src?.releaseYear,
          (src) => src?.released,
          (src) => src?.releaseInfo?.year
        )
      )
    );

    if (!movieTitle && specialMetadataResult?.title) {
      movieTitle = specialMetadataResult.title;
    }

    if (!releaseYear && specialMetadataResult?.year) {
      const specialYear = extractYear(specialMetadataResult.year);
      if (specialYear) {
        releaseYear = specialYear;
      }
    }

    let searchType;
    if (type === 'series') {
      searchType = 'tvsearch';
    } else if (type === 'movie') {
      searchType = 'movie';
    } else {
      searchType = 'search';
    }

    const seasonToken = Number.isFinite(seasonNum) ? `{Season:${seasonNum}}` : null;
    const episodeToken = Number.isFinite(episodeNum) ? `{Episode:${episodeNum}}` : null;
    const strictTextMode = !isSpecialRequest && (type === 'movie' || type === 'series');

    if (!usingCachedSearchResults) {
      const { searchPlans, addPlan } = createSearchPlanManager({
        strictTextMode,
        isSpecialRequest,
        seasonToken,
        episodeToken,
        sanitizeStrictSearchPhrase,
      });

      // Add ID-based searches immediately (before waiting for TMDb/Cinemeta)
      if (type === 'series') {
        if (metaIds.tvdb) {
          addPlan('tvsearch', { tokens: [`{TvdbId:${metaIds.tvdb}}`] });
        }
        if (metaIds.imdb) {
          addPlan('tvsearch', { tokens: [`{ImdbId:${metaIds.imdb}}`] });
        }
      } else if (type === 'movie') {
        if (metaIds.imdb) {
          addPlan('movie', { tokens: [`{ImdbId:${metaIds.imdb}}`] });
        }
        if (metaIds.tmdb) {
          addPlan('movie', { tokens: [`{TmdbId:${metaIds.tmdb}}`] });
        }
      } else if (metaIds.imdb) {
        addPlan(searchType, { tokens: [`{ImdbId:${metaIds.imdb}}`] });
      }

      // Start ID-based searches immediately in background
      const idSearchPromises = [];
      const idSearchStartTs = Date.now();
      if (searchPlans.length > 0) {
        console.log(`${INDEXER_LOG_PREFIX} Starting ${searchPlans.length} ID-based search(es) immediately`);
        idSearchPromises.push(...searchPlans.map((plan) => {
          console.log(`${INDEXER_LOG_PREFIX} Dispatching early ID plan`, plan);
          const planStartTs = Date.now();
          return Promise.allSettled([
            executeManagerPlanWithBackoff(plan),
            executeNewznabPlan(plan),
          ]).then((settled) => ({ plan, settled, startTs: planStartTs, endTs: Date.now() }));
        }));
      }

      // Now wait for TMDb to get localized titles (if applicable)
      const tmdbWaitStartTs = Date.now();
      if (tmdbMetadataPromise) {
        console.log('[TMDB] Waiting for TMDb metadata to add localized searches');
        tmdbMetadata = await tmdbMetadataPromise;
        console.log(`[TMDB] TMDb metadata fetch completed in ${Date.now() - tmdbWaitStartTs} ms`);
        if (tmdbMetadata) {
          if (!releaseYear && tmdbMetadata.year) {
            const tmdbYear = extractYear(tmdbMetadata.year);
            if (tmdbYear) {
              releaseYear = tmdbYear;
            }
          }
          // Create a metadata object compatible with existing code
          metaSources.push({
            imdb_id: incomingImdbId,
            tmdb_id: String(tmdbMetadata.tmdbId),
            title: tmdbMetadata.originalTitle,
            year: tmdbMetadata.year,
            _tmdbTitles: tmdbMetadata.titles, // Store for later use
          });
        }
      }

      // Wait for Cinemeta if applicable
      let cinemetaTitleCandidate = null;
      const cinemetaWaitStartTs = Date.now();
      if (cinemetaPromise) {
        console.log('[CINEMETA] Waiting for Cinemeta metadata');
        cinemetaMeta = await cinemetaPromise;
        console.log(`[CINEMETA] Cinemeta fetch completed in ${Date.now() - cinemetaWaitStartTs} ms`);
        if (cinemetaMeta) {
          metaSources.push(cinemetaMeta);
          cinemetaTitleCandidate = pickFirstDefined(
            cinemetaMeta?.name,
            cinemetaMeta?.title,
            cinemetaMeta?.originalTitle,
            cinemetaMeta?.original_title
          );
        }
      }

      if (type === 'series' && !tvdbService.isConfigured() && cinemetaMeta && !metaIds.tvdb) {
        const cinemetaTvdbId = normalizeNumericId(
          cinemetaMeta?.ids?.tvdb
          || cinemetaMeta?.tvdb_id
          || cinemetaMeta?.tvdb
        );
        if (cinemetaTvdbId) {
          metaIds.tvdb = cinemetaTvdbId;
          const added = addPlan('tvsearch', { tokens: [`{TvdbId:${metaIds.tvdb}}`] });
          if (added) {
            console.log(`${INDEXER_LOG_PREFIX} Added Cinemeta TVDB ID plan`, { tvdb: metaIds.tvdb });
            const planStartTs = Date.now();
            idSearchPromises.push(Promise.allSettled([
              executeManagerPlanWithBackoff(searchPlans[searchPlans.length - 1]),
              executeNewznabPlan(searchPlans[searchPlans.length - 1]),
            ]).then((settled) => ({
              plan: searchPlans[searchPlans.length - 1],
              settled,
              startTs: planStartTs,
              endTs: Date.now(),
            })));
          }
        }
      }

      if (!movieTitle) {
        movieTitle = pickFirstDefined(
          ...collectValues(
            (src) => src?.name,
            (src) => src?.title,
            (src) => src?.originalTitle,
            (src) => src?.original_title
          )
        );
      }

      if (!releaseYear) {
        releaseYear = extractYear(
          pickFirstDefined(
            ...collectValues(
              (src) => src?.year,
              (src) => src?.releaseYear,
              (src) => src?.released,
              (src) => src?.releaseInfo?.year
            )
          )
        );
      }

      console.log('[REQUEST] Resolved title/year', { movieTitle, releaseYear, elapsedMs: Date.now() - requestStartTs });

      const isCinemetaTitleSource = Boolean(
        cinemetaTitleCandidate
        && movieTitle
        && String(movieTitle).trim() === String(cinemetaTitleCandidate).trim()
      );
      const searchTitle = type === 'series'
        ? stripSeriesSubtitle(movieTitle, isCinemetaTitleSource)
        : movieTitle;

      // Continue with text-based searches using TMDb titles
      const textQueryParts = [];
      let tmdbLocalizedQuery = null;
      let easynewsSearchParams = null;
      let textQueryFallbackValue = null;
      if (searchTitle) {
        textQueryParts.push(searchTitle);
      }
      if (type === 'movie' && Number.isFinite(releaseYear)) {
        textQueryParts.push(String(releaseYear));
      } else if (type === 'series' && Number.isFinite(seasonNum) && Number.isFinite(episodeNum)) {
        textQueryParts.push(`S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`);
      }

      const shouldForceTextSearch = isSpecialRequest;
      const shouldAddTextSearch = shouldForceTextSearch || !INDEXER_MANAGER_STRICT_ID_MATCH;

      if (shouldAddTextSearch) {
        const hasTmdbTitles = metaSources.some(s => s?._tmdbTitles?.length > 0);
        const hasHumanTitleMeta = Boolean(movieTitle && movieTitle.trim());
        if (!hasTmdbTitles && !hasHumanTitleMeta) {
          console.log(`${INDEXER_LOG_PREFIX} Skipping text search plans (no TMDb/Cinemeta title)`);
        } else {
          const textQueryCandidate = textQueryParts.join(' ').trim();
          const isEpisodeOnly = /^s\d{2}e\d{2}$/i.test(textQueryCandidate) && !movieTitle;
          const isYearOnly = /^\d{4}$/.test(textQueryCandidate) && (!movieTitle || !movieTitle.trim());
          if (isEpisodeOnly) {
            console.log(`${INDEXER_LOG_PREFIX} Skipping episode-only text plan (no title)`);
          } else if (isYearOnly) {
            console.log(`${INDEXER_LOG_PREFIX} Skipping year-only text plan (no title)`);
          } else {
            const rawFallback = textQueryCandidate.trim();
            textQueryFallbackValue = tmdbService.normalizeToAscii(rawFallback);
            if (textQueryFallbackValue && textQueryFallbackValue !== rawFallback) {
              console.log(`${INDEXER_LOG_PREFIX} Normalized text query to ASCII`, { original: rawFallback, normalized: textQueryFallbackValue });
            }
            const normalizedValue = (textQueryFallbackValue || '').trim();
            const normalizedYearOnly = /^\d{4}$/.test(normalizedValue);
            const normalizedEpisodeOnly = /^s\d{2}e\d{2}$/i.test(normalizedValue) || /^s\d{2}$/i.test(normalizedValue) || /^e\d{2}$/i.test(normalizedValue);
            const rawHadNonAscii = /[^\x00-\x7F]/.test(rawFallback);
            if (normalizedYearOnly || normalizedEpisodeOnly) {
              console.log(`${INDEXER_LOG_PREFIX} Skipping text search plan (normalized to episode/year only)`, { original: rawFallback, normalized: normalizedValue });
            } else if (normalizedValue) {
              const addedTextPlan = addPlan('search', { rawQuery: textQueryFallbackValue });
              if (addedTextPlan) {
                console.log(`${INDEXER_LOG_PREFIX} Added text search plan`, { query: textQueryFallbackValue });
              } else {
                console.log(`${INDEXER_LOG_PREFIX} Text search plan already present (deduped)`, { query: textQueryFallbackValue });
              }
            } else {
              console.log(`${INDEXER_LOG_PREFIX} Skipping text search plan (empty after ASCII normalization); will use TMDb titles instead`);
            }
          }
        }

        // TMDb multi-language searches: add search plans for each configured language
        const tmdbTitles = metaSources.find(s => s?._tmdbTitles)?._tmdbTitles;
        if (tmdbTitles && tmdbTitles.length > 0 && !isSpecialRequest) {
          console.log(`[TMDB] Adding up to ${tmdbTitles.length} normalized TMDb search plans`);
          tmdbTitles.forEach((titleObj) => {
            const normalizedBase = (titleObj.asciiTitle || '').trim();
            if (!normalizedBase) {
              console.log(`${INDEXER_LOG_PREFIX} Skipping TMDb title with no ASCII representation`, { language: titleObj.language, title: titleObj.title });
              return;
            }

            let normalizedQuery = normalizedBase;
            if (type === 'movie' && Number.isFinite(releaseYear)) {
              normalizedQuery = `${normalizedQuery} ${releaseYear}`;
            } else if (type === 'series' && Number.isFinite(seasonNum) && Number.isFinite(episodeNum)) {
              normalizedQuery = `${normalizedQuery} S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`;
            }

            const added = addPlan('search', { rawQuery: normalizedQuery });
            if (added) {
              console.log(`${INDEXER_LOG_PREFIX} Added normalized TMDb ${titleObj.language} search plan`, { query: normalizedQuery });
            }

            if (!tmdbLocalizedQuery) {
              tmdbLocalizedQuery = normalizedQuery;
            }
          });
        }
      } else {
        const reason = INDEXER_MANAGER_STRICT_ID_MATCH ? 'strict ID matching enabled' : 'text search disabled';
        console.log(`${INDEXER_LOG_PREFIX} ${reason}; skipping text-based search`);
      }

      if (INDEXER_MANAGER_INDEXERS) {
        console.log(`${INDEXER_LOG_PREFIX} Using configured indexers`, INDEXER_MANAGER_INDEXERS);
      } else {
        console.log(`${INDEXER_LOG_PREFIX} Using manager default indexer selection`);
      }

      if (easynewsService.isEasynewsEnabled()) {
        const easynewsStrictMode = !isSpecialRequest && (type === 'movie' || type === 'series');
        let easynewsRawQuery = null;

        // Check if we have TMDb titles - prefer English titles for Easynews
        const tmdbTitles = metaSources.find(s => s?._tmdbTitles)?._tmdbTitles;
        if (tmdbTitles && tmdbTitles.length > 0) {
          // Find English title first
          const englishTitle = tmdbTitles.find(t => t.language && t.language.startsWith('en-'));
          if (englishTitle) {
            easynewsRawQuery = englishTitle.title;
            if (type === 'movie' && Number.isFinite(releaseYear)) {
              easynewsRawQuery = `${easynewsRawQuery} ${releaseYear}`;
            } else if (type === 'series' && Number.isFinite(seasonNum) && Number.isFinite(episodeNum)) {
              easynewsRawQuery = `${easynewsRawQuery} S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`;
            }
            console.log('[EASYNEWS] Using English title from TMDb:', easynewsRawQuery);
          } else {
            // No English title, try ASCII-safe titles only
            const asciiTitle = tmdbTitles.find(t => t.title && !/[^\x00-\x7F]/.test(t.title));
            if (asciiTitle) {
              easynewsRawQuery = asciiTitle.title;
              if (type === 'movie' && Number.isFinite(releaseYear)) {
                easynewsRawQuery = `${easynewsRawQuery} ${releaseYear}`;
              } else if (type === 'series' && Number.isFinite(seasonNum) && Number.isFinite(episodeNum)) {
                easynewsRawQuery = `${easynewsRawQuery} S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`;
              }
              console.log('[EASYNEWS] Using ASCII title from TMDb:', easynewsRawQuery);
            }
          }
        }

        // Fallback to old logic if no TMDb titles
        if (!easynewsRawQuery) {
          if (isSpecialRequest) {
            easynewsRawQuery = (specialMetadataResult?.title || movieTitle || baseIdentifier || '').trim();
          } else if (easynewsStrictMode) {
            easynewsRawQuery = (textQueryParts.join(' ').trim() || movieTitle || '').trim();
          } else {
            easynewsRawQuery = (textQueryParts.join(' ').trim() || movieTitle || '').trim();
          }
          if (!easynewsRawQuery && tmdbLocalizedQuery) {
            easynewsRawQuery = tmdbLocalizedQuery;
          }
          if (!easynewsRawQuery && textQueryFallbackValue) {
            easynewsRawQuery = textQueryFallbackValue;
          }
          if (!easynewsRawQuery && baseIdentifier) {
            easynewsRawQuery = baseIdentifier;
          }

          // Skip Easynews if final query contains non-ASCII characters
          if (easynewsRawQuery && /[^\x00-\x7F]/.test(easynewsRawQuery)) {
            console.log('[EASYNEWS] Skipping search - query contains non-ASCII characters:', easynewsRawQuery);
            easynewsRawQuery = null;
          }
        }

        if (!easynewsRawQuery && baseIdentifier) {
          easynewsRawQuery = baseIdentifier;
        }

        if (easynewsRawQuery) {
          const trimmedEasynewsQuery = easynewsRawQuery.trim();
          const easynewsEpisodeOnly = /^s\d{2}e\d{2}$/i.test(trimmedEasynewsQuery);
          const easynewsYearOnly = /^\d{4}$/.test(trimmedEasynewsQuery);
          if (easynewsEpisodeOnly) {
            console.log('[EASYNEWS] Skipping episode-only query (no title)');
            easynewsRawQuery = baseIdentifier || null;
          } else if (easynewsYearOnly && (!movieTitle || !movieTitle.trim())) {
            console.log('[EASYNEWS] Skipping year-only query (no title)');
            easynewsRawQuery = baseIdentifier || null;
          }
        }

        if (easynewsRawQuery) {
          easynewsSearchParams = {
            rawQuery: easynewsRawQuery,
            fallbackQuery: textQueryFallbackValue || baseIdentifier || movieTitle || '',
            year: type === 'movie' ? releaseYear : null,
            season: type === 'series' ? seasonNum : null,
            episode: type === 'series' ? episodeNum : null,
            strictMode: easynewsStrictMode,
            specialTextOnly: Boolean(isSpecialRequest || requestLacksIdentifiers),
          };
          console.log('[EASYNEWS] Prepared search params, will run in parallel with NZB searches');
        }
      }

      // Start Easynews search in parallel if params are ready
      let easynewsPromise = null;
      let easynewsSearchStartTs = null;
      if (easynewsSearchParams) {
        console.log('[EASYNEWS] Starting search in parallel');
        easynewsSearchStartTs = Date.now();
        easynewsPromise = easynewsService.searchEasynews(easynewsSearchParams)
          .then((results) => {
            if (Array.isArray(results) && results.length > 0) {
              console.log('[EASYNEWS] Retrieved results', { count: results.length, query: easynewsSearchParams.rawQuery });
              return results;
            }
            return [];
          })
          .catch((error) => {
            console.warn('[EASYNEWS] Search failed', error.message);
            return [];
          });
      }

      const usingStrictIdMatching = INDEXER_MANAGER_STRICT_ID_MATCH;
      const resultsByKey = usingStrictIdMatching ? null : new Map();
      const aggregatedResults = usingStrictIdMatching ? [] : null;
      const rawAggregatedResults = [];
      const planSummaries = [];
      const newznabDebugEnabled = isNzDebugEnabled(getNewznabDebugFlags());
      const resultMatchesStrictPlan = createStrictPlanMatcher({
        type,
        seasonNum,
        episodeNum,
        releaseYear,
        annotateNzbResult,
        parseReleaseMetadata,
        sanitizeStrictSearchPhrase,
        matchesStrictSearch,
        logPrefix: INDEXER_LOG_PREFIX,
        debugEnabled: newznabDebugEnabled,
      });

      // Process early ID-based searches that are already running
      const idProcessStartTs = Date.now();
      const idPlanResults = await Promise.all(idSearchPromises);
      console.log(`${INDEXER_LOG_PREFIX} ID-based searches completed in ${Date.now() - idSearchStartTs} ms total`);
      const processedIdPlans = new Set();

      for (const { plan, settled, startTs, endTs } of idPlanResults) {
        console.log(`${INDEXER_LOG_PREFIX} ID plan execution time: ${endTs - startTs} ms for "${plan.query}"`);
        processedIdPlans.add(`${plan.type}|${plan.query}`);
        const {
          managerResults,
          newznabResults,
          combinedResults,
          errors,
          newznabEndpoints,
        } = normalizeCombinedPlanSettled(settled);

        console.log(`${INDEXER_LOG_PREFIX} ✅ ${plan.type} returned ${combinedResults.length} total results for query "${plan.query}"`, {
          managerCount: managerResults.length || 0,
          newznabCount: newznabResults.length || 0,
          errors: errors.length ? errors : undefined,
        });

        const filteredResults = combinedResults.filter((item) =>
          item && typeof item === 'object' && item.downloadUrl && resultMatchesStrictPlan(plan, item)
        );
        filteredResults.forEach((item) => rawAggregatedResults.push({ result: item, planType: plan.type }));

        if (filteredResults.length > 0) {
          if (usingStrictIdMatching) {
            aggregatedResults.push(...filteredResults.map((item) => ({ result: item, planType: plan.type })));
          } else if (resultsByKey) {
            for (const item of filteredResults) {
              const key = deriveResultKey(item);
              if (!key) continue;
              if (!resultsByKey.has(key)) {
                resultsByKey.set(key, { result: item, planType: plan.type });
              }
            }
          }
        }

        planSummaries.push({
          planType: plan.type,
          query: plan.query,
          total: combinedResults.length,
          filtered: filteredResults.length,
          managerCount: managerResults.length,
          newznabCount: newznabResults.length,
          errors: errors.length ? errors : undefined,
          newznabEndpoints,
        });
      }

      // Now execute remaining text-based search plans (exclude already-processed ID plans)
      const remainingPlans = searchPlans.filter(p => !processedIdPlans.has(`${p.type}|${p.query}`));
      console.log(`${INDEXER_LOG_PREFIX} Executing ${remainingPlans.length} text-based search plan(s)`);
      const textSearchStartTs = Date.now();
      const planExecutions = remainingPlans.map((plan) => {
        console.log(`${INDEXER_LOG_PREFIX} Dispatching plan`, plan);
        return Promise.allSettled([
          executeManagerPlanWithBackoff(plan),
          executeNewznabPlan(plan),
        ]).then((settled) => {
          const {
            managerResults,
            newznabResults,
            combinedResults,
            errors,
            newznabEndpoints,
          } = normalizeCombinedPlanSettled(settled);
          if (combinedResults.length === 0 && errors.length > 0) {
            return {
              plan,
              status: 'rejected',
              error: new Error(errors.join('; ')),
              errors,
              mgrCount: managerResults.length,
              newznabCount: newznabResults.length,
            };
          }
          return {
            plan,
            status: 'fulfilled',
            data: combinedResults,
            errors,
            mgrCount: managerResults.length,
            newznabCount: newznabResults.length,
            newznabEndpoints,
          };
        });
      });

      const planResultsSettled = await Promise.all(planExecutions);
      console.log(`${INDEXER_LOG_PREFIX} Text-based searches completed in ${Date.now() - textSearchStartTs} ms`);

      for (const result of planResultsSettled) {
        const { plan } = result;
        if (result.status === 'rejected') {
          console.error(`${INDEXER_LOG_PREFIX} ❌ Search plan failed`, {
            message: result.error?.message || result.errors?.join('; ') || result.error,
            type: plan.type,
            query: plan.query
          });
          planSummaries.push({
            planType: plan.type,
            query: plan.query,
            total: 0,
            filtered: 0,
            uniqueAdded: 0,
            error: result.error?.message || result.errors?.join('; ') || 'Unknown failure'
          });
          continue;
        }

        const planResults = Array.isArray(result.data) ? result.data : [];
        console.log(`${INDEXER_LOG_PREFIX} ✅ ${plan.type} returned ${planResults.length} total results for query "${plan.query}"`, {
          managerCount: result.mgrCount || 0,
          newznabCount: result.newznabCount || 0,
          errors: result.errors && result.errors.length ? result.errors : undefined,
        });

        const filteredResults = planResults.filter((item) => {
          if (!item || typeof item !== 'object') {
            return false;
          }
          if (!item.downloadUrl) {
            return false;
          }
          return resultMatchesStrictPlan(plan, item);
        });

        filteredResults.forEach((item) => rawAggregatedResults.push({ result: item, planType: plan.type }));

        let addedCount = 0;
        if (usingStrictIdMatching) {
          aggregatedResults.push(...filteredResults.map((item) => ({ result: item, planType: plan.type })));
          addedCount = filteredResults.length;
        } else {
          const beforeSize = resultsByKey.size;
          for (const item of filteredResults) {
            const key = deriveResultKey(item);
            if (!key) continue;
            if (!resultsByKey.has(key)) {
              resultsByKey.set(key, { result: item, planType: plan.type });
            }
          }
          addedCount = resultsByKey.size - beforeSize;
        }

        planSummaries.push({
          planType: plan.type,
          query: plan.query,
          total: planResults.length,
          filtered: filteredResults.length,
          uniqueAdded: addedCount,
          managerCount: result.mgrCount || 0,
          newznabCount: result.newznabCount || 0,
          errors: result.errors && result.errors.length ? result.errors : undefined,
        });
        console.log(`${INDEXER_LOG_PREFIX} ✅ Plan summary`, planSummaries[planSummaries.length - 1]);
        if (result.newznabEndpoints && result.newznabEndpoints.length) {
          console.log(`${NEWZNAB_LOG_PREFIX} Endpoint results`, result.newznabEndpoints);
        }
      }

      const aggregationCount = usingStrictIdMatching ? aggregatedResults.length : resultsByKey.size;
      if (aggregationCount === 0) {
        console.warn(`${INDEXER_LOG_PREFIX} ⚠ All ${searchPlans.length} search plans returned no NZB results`);
      } else if (usingStrictIdMatching) {
        console.log(`${INDEXER_LOG_PREFIX} ✅ Aggregated NZB results with strict ID matching`, {
          plansRun: searchPlans.length,
          totalResults: aggregationCount
        });
      } else {
        console.log(`${INDEXER_LOG_PREFIX} ✅ Aggregated unique NZB results`, {
          plansRun: searchPlans.length,
          uniqueResults: aggregationCount
        });
      }

      const dedupedNzbResults = dedupeResultsByTitle(
        usingStrictIdMatching
          ? aggregatedResults.map((entry) => entry.result)
          : Array.from(resultsByKey.values()).map((entry) => entry.result)
      );
      const rawNzbResults = rawAggregatedResults.map((entry) => entry.result);

      dedupedSearchResults = dedupedNzbResults;
      rawSearchResults = rawNzbResults.length > 0 ? rawNzbResults : dedupedNzbResults.slice();

      const baseResults = dedupeEnabled ? dedupedSearchResults : rawSearchResults;
      if (!dedupeEnabled) {
        console.log(`${INDEXER_LOG_PREFIX} Dedupe disabled for this request; returning ${baseResults.length} raw results`);
      }

      finalNzbResults = baseResults
        .filter((result, index) => {
          if (!result.downloadUrl || !result.indexerId) {
            console.warn(`${INDEXER_LOG_PREFIX} Skipping NZB result ${index} missing required fields`, {
              hasDownloadUrl: !!result.downloadUrl,
              hasIndexerId: !!result.indexerId,
              title: result.title
            });
            return false;
          }
          return true;
        })
        .map((result) => ({ ...result, _sourceType: 'nzb' }));

      // Wait for Easynews results if search was started
      // Easynews gets 7s from its start if other searches are done, otherwise waits with them
      const easynewsWaitStartTs = Date.now();
      if (easynewsPromise) {
        console.log('[EASYNEWS] Waiting for parallel Easynews search to complete');
        const easynewsElapsedMs = Date.now() - (easynewsSearchStartTs || easynewsWaitStartTs);
        const remainingMs = Math.max(0, easynewsService.EASYNEWS_SEARCH_STANDALONE_TIMEOUT_MS - easynewsElapsedMs);
        let easynewsResults = [];
        try {
          easynewsResults = await Promise.race([
            easynewsPromise,
            new Promise((resolve) => setTimeout(() => resolve([]), remainingMs)),
          ]);
        } catch (err) {
          console.warn('[EASYNEWS] Search timed out or failed', err?.message || err);
        }
        console.log(`[EASYNEWS] Easynews search completed in ${Date.now() - easynewsWaitStartTs} ms`);
        if (Array.isArray(easynewsResults) && easynewsResults.length > 0) {
          console.log('[EASYNEWS] Adding results to final list', { count: easynewsResults.length });
          easynewsResults.forEach((item) => {
            const enriched = {
              ...item,
              _sourceType: 'easynews',
              indexer: item.indexer || 'Easynews',
              indexerId: item.indexerId || 'easynews',
            };
            finalNzbResults.push(enriched);
          });
        }
      }

      console.log(`${INDEXER_LOG_PREFIX} Final NZB selection: ${finalNzbResults.length} results`, { elapsedMs: Date.now() - requestStartTs });
    }

    const effectiveMaxSizeBytes = (() => {
      const overrideBytes = triageOverrides.maxSizeBytes;
      const defaultBytes = INDEXER_MAX_RESULT_SIZE_BYTES;
      const normalizedOverride = Number.isFinite(overrideBytes) && overrideBytes > 0 ? overrideBytes : null;
      const normalizedDefault = Number.isFinite(defaultBytes) && defaultBytes > 0 ? defaultBytes : null;
      if (normalizedOverride && normalizedDefault) {
        return Math.min(normalizedOverride, normalizedDefault);
      }
      return normalizedOverride || normalizedDefault || null;
    })();
    const resolvedPreferredLanguages = resolvePreferredLanguages(triageOverrides.preferredLanguages, INDEXER_PREFERRED_LANGUAGES);
    const activeSortMode = triageOverrides.sortMode || INDEXER_SORT_MODE;

    finalNzbResults = finalNzbResults.map((result, index) => annotateNzbResult(result, index));
    finalNzbResults = prepareSortedResults(finalNzbResults, {
      sortMode: activeSortMode,
      preferredLanguages: resolvedPreferredLanguages,
      maxSizeBytes: effectiveMaxSizeBytes,
      releaseExclusions: RELEASE_EXCLUSIONS,
      allowedResolutions: ALLOWED_RESOLUTIONS,
      resolutionLimitPerQuality: RESOLUTION_LIMIT_PER_QUALITY,
    });
    if (dedupeEnabled) {
      finalNzbResults = dedupeResultsByTitle(finalNzbResults);
    }

    if (triagePrewarmPromise) {
      await triagePrewarmPromise;
      triagePrewarmPromise = null;
    }

    const logTopLanguages = () => {
      // const sample = finalNzbResults.slice(0, 10).map((result, idx) => ({
      //   rank: idx + 1,
      //   title: result.title,
      //   indexer: result.indexer,
      //   resolution: result.resolution || result.release?.resolution || null,
      //   sizeGb: result.size ? (result.size / (1024 * 1024 * 1024)).toFixed(2) : null,
      //   languages: result.release?.languages || [],
      //   indexerLanguage: result.language || null,
      //   preferredMatches: resolvedPreferredLanguages.length > 0 ? getPreferredLanguageMatches(result, resolvedPreferredLanguages) : [],
      // }));
      // console.log('[LANGUAGE] Top stream ordering sample', sample);
    };
    logTopLanguages();
    const allowedCacheStatuses = TRIAGE_FINAL_STATUSES;
    const requestedDisable = triageOverrides.disabled === true;
    const requestedEnable = triageOverrides.enabled === true;
    const {
      combinedHealthTokens,
      serializedIndexerTokens,
      healthIndexerSet,
      easynewsTreatAsIndexer,
    } = resolveHealthIndexerContext({
      triageOverrides,
      triagePriorityIndexers: TRIAGE_PRIORITY_INDEXERS,
      triageHealthIndexers: TRIAGE_HEALTH_INDEXERS,
      triageSerializedIndexers: TRIAGE_SERIALIZED_INDEXERS,
      indexerManager: INDEXER_MANAGER,
      toBoolean,
      normalizeIndexerToken,
      getPaidDirectIndexerTokens,
    });
    console.log(`[NZB TRIAGE] Easynews health check mode: ${easynewsTreatAsIndexer ? 'ENABLED' : 'DISABLED'}`);

    const triagePool = buildTriagePool({
      finalNzbResults,
      healthIndexerSet,
      easynewsTreatAsIndexer,
      nzbMatchesIndexer,
    });
    console.log(`[NZB TRIAGE] Triage pool size: ${triagePool.length} (from ${finalNzbResults.length} total results)`);
    const getDecisionStatus = (candidate) => {
      const decision = triageDecisions.get(candidate.downloadUrl);
      return decision && decision.status ? String(decision.status).toLowerCase() : null;
    };
    const pendingStatuses = new Set(['unverified', 'pending', 'fetch-error']);
    const hasPendingRetries = triagePool.some((candidate) => pendingStatuses.has(getDecisionStatus(candidate)));
    const hasVerifiedResult = triagePool.some((candidate) => getDecisionStatus(candidate) === 'verified');
    let triageEligibleResults = [];
    const paidIndexerLimitMap = buildCombinedLimitMap(ACTIVE_NEWZNAB_CONFIGS);
    const getIndexerKey = (candidate) => normalizeIndexerToken(candidate?.indexerId || candidate?.indexer);

    if (hasPendingRetries) {
      triageEligibleResults = prioritizeTriageCandidates(triagePool, TRIAGE_MAX_CANDIDATES, {
        shouldInclude: (candidate) => pendingStatuses.has(getDecisionStatus(candidate)),
        perIndexerLimitMap: paidIndexerLimitMap,
        getIndexerKey,
      });
    } else if (!hasVerifiedResult) {
      triageEligibleResults = prioritizeTriageCandidates(triagePool, TRIAGE_MAX_CANDIDATES, {
        shouldInclude: (candidate) => !getDecisionStatus(candidate),
        perIndexerLimitMap: paidIndexerLimitMap,
        getIndexerKey,
      });
    }

    if (triageEligibleResults.length === 0 && triageDecisions.size === 0) {
      triageEligibleResults = prioritizeTriageCandidates(triagePool, TRIAGE_MAX_CANDIDATES, {
        perIndexerLimitMap: paidIndexerLimitMap,
        getIndexerKey,
      });
    }
    const candidateHasConclusiveDecision = (candidate) => {
      const decision = triageDecisions.get(candidate.downloadUrl);
      if (decision && isTriageFinalStatus(decision.status)) {
        return true;
      }
      const normalizedTitle = normalizeReleaseTitle(candidate.title);
      if (normalizedTitle) {
        const derived = triageTitleMap.get(normalizedTitle);
        if (
          derived
          && isTriageFinalStatus(derived.status)
          && indexerService.canShareDecision(derived.publishDateMs, candidate.publishDateMs)
        ) {
          return true;
        }
      }
      return false;
    };
    const categoryForType = resolveCategoryForType({ streamingMode: STREAMING_MODE, nzbdavService, type });
    const triageCandidatesToRun = triageEligibleResults.filter((candidate) => !candidateHasConclusiveDecision(candidate));
    const shouldSkipTriageForRequest = requestLacksIdentifiers || isSpecialRequest;
    const shouldAttemptTriage = triageCandidatesToRun.length > 0 && !requestedDisable && !shouldSkipTriageForRequest && (requestedEnable || TRIAGE_ENABLED);
    let triageOutcome = null;
    let triageCompleteForCache = !shouldAttemptTriage;
    let prefetchCandidate = null;
    let prefetchNzbPayload = null;

    if (shouldAttemptTriage) {
      if (!TRIAGE_NNTP_CONFIG) {
        console.warn('[NZB TRIAGE] Skipping health checks because NNTP configuration is missing');
      } else {
        const triageLogger = (level, message, context) => {
          const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
          if (context) logFn(`[NZB TRIAGE] ${message}`, context);
          else logFn(`[NZB TRIAGE] ${message}`);
        };
        const triageOptions = {
          allowedIndexerIds: combinedHealthTokens,
          preferredIndexerIds: combinedHealthTokens, // Use same indexers for filtering and ranking
          serializedIndexerIds: serializedIndexerTokens,
          timeBudgetMs: TRIAGE_TIME_BUDGET_MS,
          maxCandidates: TRIAGE_MAX_CANDIDATES,
          downloadConcurrency: Math.max(1, TRIAGE_MAX_CANDIDATES),
          triageOptions: {
            ...TRIAGE_BASE_OPTIONS,
            nntpConfig: { ...TRIAGE_NNTP_CONFIG },
          },
          captureNzbPayloads: true,
          logger: triageLogger,
        };
        try {
          triageOutcome = await triageAndRank(triageCandidatesToRun, triageOptions);
          const latestDecisions = triageOutcome?.decisions instanceof Map ? triageOutcome.decisions : new Map(triageOutcome?.decisions || []);
          latestDecisions.forEach((decision, downloadUrl) => {
            triageDecisions.set(downloadUrl, decision);
          });
          triageTitleMap = buildTriageTitleMap(triageDecisions);
          console.log(`[NZB TRIAGE] Evaluated ${triageOutcome.evaluatedCount}/${triageOutcome.candidatesConsidered} candidate NZBs in ${triageOutcome.elapsedMs} ms (timedOut=${triageOutcome.timedOut})`);
          if (triageDecisions.size > 0) {
            const statusCounts = {};
            let loggedSamples = 0;
            const sampleLimit = 5;
            const logDecisionSamples = false;
            triageDecisions.forEach((decision, downloadUrl) => {
              const status = decision?.status || 'unknown';
              statusCounts[status] = (statusCounts[status] || 0) + 1;
              if (logDecisionSamples && loggedSamples < sampleLimit) {
                console.log('[NZB TRIAGE] Decision sample', {
                  status,
                  blockers: decision?.blockers || [],
                  warnings: decision?.warnings || [],
                  fileCount: decision?.fileCount ?? null,
                  nzbIndex: decision?.nzbIndex ?? null,
                  downloadUrl
                });
                loggedSamples += 1;
              }
            });
            if (logDecisionSamples && triageDecisions.size > sampleLimit) {
              console.log(`[NZB TRIAGE] (${triageDecisions.size - sampleLimit}) additional decisions omitted from sample log`);
            }
            console.log('[NZB TRIAGE] Decision status breakdown', statusCounts);
          } else {
            console.log('[NZB TRIAGE] No decisions were produced by the triage runner');
          }
        } catch (triageError) {
          console.warn(`[NZB TRIAGE] Health check failed: ${triageError.message}`);
        }
      }
    } else if (shouldSkipTriageForRequest && TRIAGE_ENABLED && !requestedDisable) {
      const reason = isSpecialRequest
        ? 'special catalog request'
        : 'non-ID request (no IMDb/TVDB identifier)';
      console.log(`[NZB TRIAGE] Skipping health checks for ${reason}`);
    }

    if (shouldAttemptTriage) {
      triageCompleteForCache = Boolean(
        triageOutcome
        && !triageOutcome?.timedOut
        && triageDecisionsMatchStatuses(triageDecisions, triageEligibleResults, allowedCacheStatuses)
      );
    }

    if (triageCompleteForCache && shouldAttemptTriage) {
      triageEligibleResults.forEach((candidate) => {
        const decision = triageDecisions.get(candidate.downloadUrl);
        if (decision && decision.status === 'verified' && typeof decision.nzbPayload === 'string') {
          cache.cacheVerifiedNzbPayload(candidate.downloadUrl, decision.nzbPayload, {
            title: decision.title || candidate.title,
            size: candidate.size,
            fileName: candidate.title,
          });
          if (!prefetchCandidate && useNzbdavFeatures) {
            prefetchCandidate = {
              downloadUrl: candidate.downloadUrl,
              title: candidate.title,
              category: categoryForType,
              requestedEpisode,
            };
          }
        }
        if (decision && decision.nzbPayload) {
          delete decision.nzbPayload;
        }
      });
    } else if (triageDecisions && triageDecisions.size > 0) {
      triageDecisions.forEach((decision) => {
        if (decision && decision.nzbPayload) {
          delete decision.nzbPayload;
        }
      });
    }

    // If prefetch is enabled, capture first verified NZB payload even when triage cache completion criteria aren’t met
    if (TRIAGE_PREFETCH_FIRST_VERIFIED && useNzbdavFeatures && !prefetchCandidate && triageDecisions && triageDecisions.size > 0) {
      for (const candidate of triageEligibleResults) {
        const decision = triageDecisions.get(candidate.downloadUrl);
        if (decision && decision.status === 'verified' && typeof decision.nzbPayload === 'string') {
          prefetchCandidate = {
            downloadUrl: candidate.downloadUrl,
            title: candidate.title,
            category: categoryForType,
            requestedEpisode,
          };
          prefetchNzbPayload = decision.nzbPayload;
          cache.cacheVerifiedNzbPayload(candidate.downloadUrl, decision.nzbPayload, {
            title: decision.title || candidate.title,
            size: candidate.size,
            fileName: candidate.title,
          });
          delete decision.nzbPayload;
          break;
        }
      }
    }

    // NZBDav cache cleanup is now handled automatically by the cache module

    const triagePendingDownloadUrls = triageEligibleResults
      .filter((candidate) => !candidateHasConclusiveDecision(candidate))
      .map((candidate) => candidate.downloadUrl);
    const cacheReadyDecisionEntries = Array.from(triageDecisions.entries())
      .map(([downloadUrl, decision]) => {
        const sanitized = sanitizeDecisionForCache(decision);
        return sanitized ? [downloadUrl, sanitized] : null;
      })
      .filter(Boolean);
    const cacheMeta = streamCacheKey
      ? {
        version: 1,
        storedAt: Date.now(),
        triageComplete: !triageOutcome?.timedOut && triagePendingDownloadUrls.length === 0,
        triagePendingDownloadUrls,
        finalNzbResults: serializeFinalNzbResults(finalNzbResults),
        triageDecisionsSnapshot: cacheReadyDecisionEntries,
      }
      : null;

    let historyByTitle = new Map();
    try {
      historyByTitle = await fetchHistoryByTitle({
        streamingMode: STREAMING_MODE,
        nzbdavService,
        categoryForType,
      });
      if (useNzbdavFeatures && historyByTitle.size > 0) {
        console.log(`[NZBDAV] Loaded ${historyByTitle.size} completed NZBs for instant playback detection (category=${categoryForType})`);
      }
    } catch (historyError) {
      if (useNzbdavFeatures) {
        console.warn(`[NZBDAV] Unable to load NZBDav history for instant detection: ${historyError.message}`);
      }
    }

    let triageLogCount = 0;
    let triageLogSuppressed = false;
    const activePreferredLanguages = resolvedPreferredLanguages;

    const instantStreams = [];
    const verifiedStreams = [];
    const regularStreams = [];

    finalNzbResults.forEach((result) => {
      // Skip releases matching blocklist (ISO, sample, exe, etc.)
      if (result.title && RELEASE_BLOCKLIST_REGEX.test(result.title)) {
        return;
      }

      const sizeInGB = result.size ? (result.size / 1073741824).toFixed(2) : null;
      const sizeString = sizeInGB ? `${sizeInGB} GB` : 'Size Unknown';
      const releaseInfo = result.release || {};
      const releaseLanguages = Array.isArray(releaseInfo.languages) ? releaseInfo.languages : [];
      const releaseLanguageLabels = resolveLanguageLabels(releaseLanguages);
      const sourceLanguage = result.language || null;
      const sourceLanguageLabel = resolveLanguageLabel(sourceLanguage);
      const qualityMatch = result.title?.match(/(4320p|2160p|1440p|1080p|720p|576p|540p|480p|360p|240p|8k|4k|uhd)/i);
      const detectedResolutionToken = result.resolution
        || releaseInfo.resolution
        || (qualityMatch ? normalizeResolutionToken(qualityMatch[0]) : null);
      const resolutionBadge = formatResolutionBadge(detectedResolutionToken);
      const qualityLabel = releaseInfo.qualityLabel && releaseInfo.qualityLabel !== detectedResolutionToken
        ? releaseInfo.qualityLabel
        : null;
      const featureBadges = extractQualityFeatureBadges(result.title || '', QUALITY_FEATURE_PATTERNS);
      const qualityParts = [];
      if (resolutionBadge) qualityParts.push(resolutionBadge);
      if (qualityLabel) qualityParts.push(qualityLabel);
      featureBadges.forEach((badge) => {
        if (!qualityParts.includes(badge)) qualityParts.push(badge);
      });
      const qualitySummary = qualityParts.join(' ');
      const quality = resolutionBadge || qualityLabel || '';
      const languageLabel = releaseLanguageLabels.length > 0
        ? releaseLanguageLabels.join(', ')
        : (sourceLanguageLabel || null);
      const preferredLanguageMatches = activePreferredLanguages.length > 0
        ? getPreferredLanguageMatches(result, activePreferredLanguages)
        : [];
      const preferredLanguageLabels = resolveLanguageLabels(preferredLanguageMatches.map(resolveLanguageLabel));
      const matchedPreferredLanguage = preferredLanguageLabels.length > 0 ? preferredLanguageLabels[0] : null;
      const preferredLanguageHit = preferredLanguageMatches.length > 0;

      const baseParams = new URLSearchParams({
        indexerId: String(result.indexerId),
        type,
        id
      });

      baseParams.set('downloadUrl', result.downloadUrl);
      if (result.guid) baseParams.set('guid', result.guid);
      if (result.size) baseParams.set('size', String(result.size));
      if (result.title) baseParams.set('title', result.title);
      if (result.easynewsPayload) baseParams.set('easynewsPayload', result.easynewsPayload);
      if (result._sourceType) baseParams.set('sourceType', result._sourceType);

      const cacheKey = nzbdavService.buildNzbdavCacheKey(result.downloadUrl, categoryForType, requestedEpisode);
      // Cache entries are managed internally by the cache module
      const normalizedTitle = normalizeReleaseTitle(result.title);
      const historySlot = normalizedTitle ? historyByTitle.get(normalizedTitle) : null;
      const isInstant = Boolean(historySlot); // Instant playback if found in history

      const directTriageInfo = triageDecisions.get(result.downloadUrl);
      const fallbackTitleKey = normalizedTitle;
      const fallbackTriageInfo = !directTriageInfo && fallbackTitleKey ? triageTitleMap.get(fallbackTitleKey) : null;
      const fallbackAllowed = fallbackTriageInfo
        ? indexerService.canShareDecision(fallbackTriageInfo.publishDateMs, result.publishDateMs)
        : false;
      const triageInfo = directTriageInfo || (fallbackAllowed ? fallbackTriageInfo : null);
      const triageApplied = Boolean(directTriageInfo);
      const triageDerivedFromTitle = Boolean(!directTriageInfo && fallbackAllowed && fallbackTriageInfo);
      const triageStatus = triageInfo?.status || (triageApplied ? 'unknown' : 'not-run');
      if (INDEXER_HIDE_BLOCKED_RESULTS && triageStatus === 'blocked') {
        if (triageInfo) {
          // console.log('[STREMIO][TRIAGE] Hiding blocked stream', {
          //   title: result.title,
          //   downloadUrl: result.downloadUrl,
          //   indexer: result.indexer,
          //   blockers: triageInfo.blockers || [],
          //   warnings: triageInfo.warnings || [],
          //   archiveFindings: triageInfo.archiveFindings || [],
          // });
        } else {
          // console.log('[STREMIO][TRIAGE] Hiding blocked stream with missing triageInfo', {
          //   title: result.title,
          //   downloadUrl: result.downloadUrl,
          //   indexer: result.indexer,
          // });
        }
        return;
      }
      let triagePriority = 1;
      let triageTag = null;

      if (triageStatus === 'verified') {
        triagePriority = 0;
        triageTag = '✅';
      } else if (triageStatus === 'unverified' || triageStatus === 'unverified_7z') {
        triageTag = '⚠️';
      } else if (triageStatus === 'blocked') {
        triagePriority = 2;
        triageTag = '🚫';
      } else if (triageStatus === 'fetch-error') {
        triagePriority = 2;
        triageTag = '⚠️';
      } else if (triageStatus === 'error') {
        triagePriority = 2;
        triageTag = '⚠️';
      } else if (triageStatus === 'pending' || triageStatus === 'skipped') {
        if (triageOutcome?.timedOut) triageTag = '⏱️';
      }

      const archiveFindings = triageInfo?.archiveFindings || [];
      const archiveStatuses = archiveFindings.map((finding) => String(finding?.status || '').toLowerCase());
      const archiveFailureTokens = new Set([
        'rar-compressed',
        'rar-encrypted',
        'rar-solid',
        'rar5-unsupported',
        'sevenzip-unsupported',
        'archive-not-found',
        'archive-no-segments',
        'rar-insufficient-data',
        'rar-header-not-found',
      ]);
      const passedArchiveCheck = archiveStatuses.some((status) => status === 'rar-stored' || status === 'sevenzip-stored');
      const failedArchiveCheck = (triageInfo?.blockers || []).some((blocker) => archiveFailureTokens.has(blocker))
        || archiveStatuses.some((status) => archiveFailureTokens.has(status));
      let archiveCheckStatus = 'not-run';
      if (triageInfo) {
        if (failedArchiveCheck) archiveCheckStatus = 'failed';
        else if (passedArchiveCheck) archiveCheckStatus = 'passed';
        else if (archiveFindings.length > 0) archiveCheckStatus = 'inconclusive';
      }

      const missingArticlesFailure = (triageInfo?.blockers || []).includes('missing-articles')
        || archiveStatuses.includes('segment-missing');
      const missingArticlesSuccess = archiveStatuses.includes('segment-ok')
        || archiveStatuses.includes('sevenzip-untested');
      let missingArticlesStatus = 'not-run';
      if (triageInfo) {
        if (missingArticlesFailure) missingArticlesStatus = 'failed';
        else if (missingArticlesSuccess) missingArticlesStatus = 'passed';
        else if (archiveFindings.length > 0) missingArticlesStatus = 'inconclusive';
      }

      if (triageApplied || triageDerivedFromTitle) {
        // console.log('[STREMIO][TRIAGE] Stream decision', {
        //   title: result.title,
        //   downloadUrl: result.downloadUrl,
        //   indexer: result.indexer,
        //   triageStatus,
        //   triageApplied,
        //   triageDerivedFromTitle,
        //   blockers: triageInfo?.blockers || [],
        //   warnings: triageInfo?.warnings || [],
        //   archiveFindings,
        //   archiveCheckStatus,
        //   missingArticlesStatus,
        //   timedOut: Boolean(triageOutcome?.timedOut),
        //   decisionSource: triageApplied ? 'direct' : 'title-fallback',
        // });
      }

      if (historySlot?.nzoId) {
        baseParams.set('historyNzoId', historySlot.nzoId);
        if (historySlot.jobName) {
          baseParams.set('historyJobName', historySlot.jobName);
        }
        if (historySlot.category) {
          baseParams.set('historyCategory', historySlot.category);
        }
      }

      const tokenSegment = ADDON_SHARED_SECRET ? `/${ADDON_SHARED_SECRET}` : '';
      const rawFilename = (result.title || 'stream').toString().trim();
      const normalizedFilename = rawFilename
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const fileBase = normalizedFilename || 'stream';
      const hasVideoExt = /\.(mkv|mp4|m4v|avi|mov|wmv|mpg|mpeg|ts|webm)$/i.test(fileBase);
      const fileWithExt = hasVideoExt ? fileBase : `${fileBase}.mkv`;
      const encodedFilename = encodeURIComponent(fileWithExt);
      const streamUrl = `${addonBaseUrl}${tokenSegment}/nzb/stream/${encodeStreamParams(baseParams)}/${encodedFilename}`;
      const tags = [];
      if (triageTag) tags.push(triageTag);
      if (isInstant && useNzbdavFeatures) tags.push('⚡ Instant');
      if (preferredLanguageLabels.length > 0) {
        preferredLanguageLabels.forEach((language) => tags.push(language));
      }
      // quality summary now part of name; keep tags focused on status/language/size
      if (languageLabel) tags.push(`🌐 ${languageLabel}`);
      if (sizeString) tags.push(sizeString);
      const addonLabel = ADDON_NAME || DEFAULT_ADDON_NAME;

      const tagsString = tags.filter(Boolean).join(' • ');

      const namingContext = {
        addon: addonLabel,
        title: result.parsedTitleDisplay || result.parsedTitle || result.title || '',
        filename: normalizedFilename || '',
        indexer: result.indexer || '',
        size: sizeString || '',
        quality: qualitySummary || quality || '',
        source: result.source || releaseInfo.source || '',
        codec: result.codec || releaseInfo.codec || '',
        group: result.group || releaseInfo.group || '',
        health: triageTag || '',
        languages: languageLabel || '',
        tags: tagsString,
        resolution: detectedResolutionToken || result.resolution || releaseInfo.resolution || '',
        container: result.container || releaseInfo.container || '',
        hdr: (result.hdrList || releaseInfo.hdrList || []).join(' | '),
        audio: (result.audioList || releaseInfo.audioList || []).join(' '),
      };

      // Add nested context for AIOStreams template compatibility
      // We map our flat properties to the expected 'stream' object
      namingContext.stream = {
        proxied: true, // We proxy everything via NZBDav/Stremio
        private: false, // Public Usenet
        resolution: namingContext.resolution,
        upscaled: false, // We don't detect upscaling yet
        quality: quality || namingContext.resolution,
        encode: namingContext.codec,
        type: type || 'movie',
        visualTags: (result.hdrList || releaseInfo.hdrList || []),
        audioTags: (result.audioList || releaseInfo.audioList || []),
        audioChannels: [], // Not strictly parsed yet, usually part of audioTags
        seeders: 0, // Usenet doesn't have seeders
        size: result.size || 0, // Raw bytes
        folderSize: 0,
        indexer: namingContext.indexer,
        languages: releaseLanguageLabels.length > 0 ? releaseLanguageLabels : (sourceLanguageLabel ? [sourceLanguageLabel] : []),
        network: '', // Not strictly tracked
        title: namingContext.title,
        filename: namingContext.filename,
        message: namingContext.health, // Map health status to message
        health: namingContext.health, // Alias for clear naming
        releaseGroup: namingContext.group, // AIOStreams uses releaseGroup
        // Additional mappings
        shortName: namingContext.indexer,
        cached: isInstant || Boolean(triageTag && triageTag.includes('✅')),
        instant: isInstant
      };

      // Service context (representing the provider/addon logic)
      namingContext.service = {
        shortName: 'Usenet',
        cached: isInstant || Boolean(triageTag && triageTag.includes('✅')),
        instant: isInstant
      };

      // Addon context
      namingContext.addon = {
        name: addonLabel
      };

      // Default AIOStreams template
      const defaultDescriptionPattern = '{stream.title::exists["🎬 {stream.title}\n"||""]}{stream.source::exists["🎥 {stream.source} "||""]}{stream.encode::exists["🎞️ {stream.encode}\n"||"\n"]}{stream.visualTags::join(\' | \')::exists["📺 {stream.visualTags::join(\' | \')}\n"||""]}{stream.audioTags::join(\' \')::exists["🎧 {stream.audioTags::join(\' \')}\n"||""]}{stream.releaseGroup::exists["👥 {stream.releaseGroup}\n"||""]}{stream.size::>0["📦 {stream.size::bytes}\n"||""]}{stream.languages::join(\' \')::exists["🌎 {stream.languages::join(\' \')}\n"||""]}{stream.indexer::exists["🔎 {stream.indexer}"||""]}';
      const effectiveDescriptionPattern = buildPatternFromTokenList(NZB_NAMING_PATTERN, 'long', defaultDescriptionPattern);
      const formattedTitle = formatStreamTitle(effectiveDescriptionPattern, namingContext, defaultDescriptionPattern);

      const defaultNamePattern = '{addon.name} {stream.health::exists["{stream.health} "||""]}{stream.instant::istrue["⚡ "||""]}{stream.quality::exists["{stream.quality}"||""]}';
      const effectiveNamePattern = buildPatternFromTokenList(NZB_DISPLAY_NAME_PATTERN, 'short', defaultNamePattern);
      const formattedName = formatStreamTitle(effectiveNamePattern, namingContext, defaultNamePattern);

      const behaviorHints = buildBehaviorHintsForMode({
        streamingMode: STREAMING_MODE,
        detectedResolutionToken,
        result,
        isInstant,
        historySlot,
      });

      if (triageApplied && triageLogCount < 10) {
        const archiveSampleEntries = [];
        (triageInfo?.archiveFindings || []).forEach((finding) => {
          const samples = finding?.details?.sampleEntries;
          if (Array.isArray(samples)) {
            samples.forEach((entry) => {
              if (entry && !archiveSampleEntries.includes(entry)) {
                archiveSampleEntries.push(entry);
              }
            });
          } else if (finding?.details?.name && !archiveSampleEntries.includes(finding.details.name)) {
            archiveSampleEntries.push(finding.details.name);
          }
        });
        // console.log('[NZB TRIAGE] Stream candidate status', {
        //   title: result.title,
        //   downloadUrl: result.downloadUrl,
        //   status: triageStatus,
        //   triageApplied,
        //   triagePriority,
        //   blockers: triageInfo?.blockers || [],
        //   warnings: triageInfo?.warnings || [],
        //   archiveFindings: triageInfo?.archiveFindings || [],
        //   archiveSampleEntries,
        //   archiveCheckStatus,
        //   missingArticlesStatus,
        //   timedOut: Boolean(triageOutcome?.timedOut)
        // });
        triageLogCount += 1;
      } else if (!triageApplied) {
        // Skip logging for streams that were never part of the triage batch
      } else if (!triageLogSuppressed) {
        console.log('[NZB TRIAGE] Additional stream triage logs suppressed');
        triageLogSuppressed = true;
      }

      const stream = buildStreamPayload({
        isNativeMode,
        buildNntpServersArray,
        formattedName,
        formattedTitle,
        result,
        behaviorHints,
        streamUrl,
        quality,
        isInstant,
        historySlot,
        releaseLanguages,
        sourceLanguage,
        detectedResolutionToken,
        preferredLanguageHit,
        matchedPreferredLanguage,
        preferredLanguageMatches,
        triageStatus,
        triageTag,
        triageInfo,
        triageOutcome,
        triageApplied,
        triageDerivedFromTitle,
        archiveCheckStatus,
        missingArticlesStatus,
        archiveFindings,
      });

      if (isInstant) {
        instantStreams.push(stream);
      } else if (triageStatus === 'verified') {
        verifiedStreams.push(stream);
      } else {
        regularStreams.push(stream);
      }

      if (preferredLanguageMatches.length > 0 || sourceLanguage || releaseLanguages.length > 0) {
        // console.log('[LANGUAGE] Stream classification', {
        //   title: result.title,
        //   preferredLanguageMatches,
        //   parserLanguages: releaseLanguages,
        //   indexerLanguage: sourceLanguage,
        //   indexer: result.indexer,
        //   indexerId: result.indexerId,
        //   preferredLanguageHit,
        // });
      }
    });

    const streams = instantStreams.concat(verifiedStreams, regularStreams);

    // Log cached streams count (only relevant for NZBDav mode)
    if (useNzbdavFeatures) {
      const instantCount = streams.filter((stream) => stream?.meta?.cached).length;
      if (instantCount > 0) {
        console.log(`[STREMIO] ${instantCount}/${streams.length} streams already cached in NZBDav`);
      }
    }

    const requestElapsedMs = Date.now() - requestStartTs;
    const modeLabel = isNativeMode ? 'native NZB' : 'NZB';
    console.log(`[STREMIO] Returning ${streams.length} ${modeLabel} streams`, { elapsedMs: requestElapsedMs, ts: new Date().toISOString() });
    if (process.env.DEBUG_STREAM_PAYLOADS === 'true') {
      streams.forEach((stream, index) => {
        console.log(`[STREMIO] Stream[${index}]`, {
          name: stream.name,
          description: stream.description,
          nzbUrl: stream.nzbUrl,
          url: stream.url,
          infoHash: stream.infoHash,
          servers: stream.servers,
          behaviorHints: stream.behaviorHints,
          hasMeta: Boolean(stream.meta),
        });
      });
    }

    const responsePayload = { streams };
    if (streamCacheKey && cacheMeta) {
      cache.setStreamCacheEntry(streamCacheKey, responsePayload, cacheMeta);
    }

    res.json(responsePayload);

    startVerifiedPrefetch({
      triagePrefetchFirstVerified: TRIAGE_PREFETCH_FIRST_VERIFIED,
      streamingMode: STREAMING_MODE,
      prefetchCandidate,
      prefetchTracker,
      cache,
      nzbdavService,
    });
  } catch (error) {
    console.error('[ERROR] Processing failed:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message,
      details: {
        type,
        id,
        indexerManager: INDEXER_MANAGER_LABEL,
        indexerManagerUrl: INDEXER_MANAGER_URL,
        timestamp: new Date().toISOString()
      }
    });
  }
}


module.exports = {
  handleStreamRequestService,
};
