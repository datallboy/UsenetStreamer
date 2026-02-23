async function handleNzbdavStreamService(req, res, ctx) {
  const {
    decodeStreamParams,
    parseRequestedEpisode,
    nzbdavService,
    resolvePrefetchedNzbdavJob,
    easynewsService,
    cache,
    inferMimeType,
    prefetchTracker,
  } = ctx;

  // Decode base64url encoded params from path if present
  if (req.params.encodedParams && !req.query.downloadUrl) {
    const decoded = decodeStreamParams(req.params.encodedParams);
    if (decoded && typeof decoded === 'object') {
      Object.assign(req.query, decoded);
    }
  }
  let { downloadUrl, type = 'movie', id = '', title = 'NZB Stream' } = req.query;
  const easynewsPayload = typeof req.query.easynewsPayload === 'string' ? req.query.easynewsPayload : null;
  const declaredSize = Number(req.query.size);

  const historyNzoId = req.query.historyNzoId;
  if (!downloadUrl && !historyNzoId) {
    res.status(400).json({ error: 'downloadUrl or historyNzoId query parameter is required' });
    return;
  }
  if (!downloadUrl && historyNzoId) {
    downloadUrl = `history:${historyNzoId}`;
  }

  try {
    const category = nzbdavService.getNzbdavCategory(type);
    const requestedEpisode = parseRequestedEpisode(type, id, req.query || {});
    const cacheKey = nzbdavService.buildNzbdavCacheKey(downloadUrl, category, requestedEpisode);
    let existingSlotHint = historyNzoId
      ? {
        nzoId: historyNzoId,
        jobName: req.query.historyJobName,
        category: req.query.historyCategory,
      }
      : null;

    let prefetchedSlotHint = null;
    if (!existingSlotHint) {
      prefetchedSlotHint = await resolvePrefetchedNzbdavJob(downloadUrl);
      if (prefetchedSlotHint?.nzoId) {
        existingSlotHint = {
          nzoId: prefetchedSlotHint.nzoId,
          jobName: prefetchedSlotHint.jobName,
          category: prefetchedSlotHint.category,
        };
      }
    }

    let inlineEasynewsEntry = null;
    if (!existingSlotHint && easynewsPayload) {
      try {
        const easynewsNzb = await easynewsService.downloadEasynewsNzb(easynewsPayload);
        const nzbString = easynewsNzb.buffer.toString('utf8');
        cache.cacheVerifiedNzbPayload(downloadUrl, nzbString, {
          title,
          size: Number.isFinite(declaredSize) ? declaredSize : undefined,
          fileName: easynewsNzb.fileName,
        });
        inlineEasynewsEntry = cache.getVerifiedNzbCacheEntry(downloadUrl);
        if (!inlineEasynewsEntry) {
          inlineEasynewsEntry = {
            payloadBuffer: Buffer.from(nzbString, 'utf8'),
            metadata: {
              title,
              size: Number.isFinite(declaredSize) ? declaredSize : undefined,
              fileName: easynewsNzb.fileName,
            },
          };
        }
        console.log('[EASYNEWS] Downloaded NZB payload for inline queueing');
      } catch (easynewsError) {
        const message = easynewsError?.message || easynewsError || 'unknown error';
        console.warn('[EASYNEWS] Failed to fetch NZB payload:', message);
        throw new Error(`Unable to download Easynews NZB payload: ${message}`);
      }
    }

    const streamData = await cache.getOrCreateNzbdavStream(cacheKey, () =>
      nzbdavService.buildNzbdavStream({
        downloadUrl,
        category,
        title,
        requestedEpisode,
        existingSlot: existingSlotHint,
        inlineCachedEntry: inlineEasynewsEntry,
      })
    );

    if (prefetchedSlotHint?.nzoId) {
      prefetchTracker.setResolved(downloadUrl, {
        ...prefetchedSlotHint,
        jobName: streamData.jobName || prefetchedSlotHint.jobName,
        category: streamData.category || prefetchedSlotHint.category,
      });
    }

    if ((req.method || 'GET').toUpperCase() === 'HEAD') {
      const inferredMime = inferMimeType(streamData.fileName || title || 'stream');
      const totalSize = Number.isFinite(streamData.size) ? streamData.size : undefined;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', inferredMime);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Content-Type,Accept-Ranges');
      res.setHeader('Content-Disposition', `inline; filename=\"${(streamData.fileName || 'stream').replace(/[\\\\/:*?\"<>|]+/g, '_')}\"`);
      if (Number.isFinite(totalSize)) {
        res.setHeader('Content-Length', String(totalSize));
        res.setHeader('X-Total-Length', String(totalSize));
      }
      res.status(200).end();
      return;
    }

    await nzbdavService.proxyNzbdavStream(req, res, streamData.viewPath, streamData.fileName || '');
  } catch (error) {
    if (error?.isNzbdavFailure) {
      console.warn('[NZBDAV] Stream failure detected:', error.failureMessage || error.message);
      const served = await nzbdavService.streamFailureVideo(req, res, error);
      if (!served && !res.headersSent) {
        res.status(502).json({ error: error.failureMessage || error.message });
      } else if (!served) {
        res.end();
      }
      return;
    }

    if (error?.code === 'NO_VIDEO_FILES') {
      console.warn('[NZBDAV] Stream failure due to missing playable files');
      const served = await nzbdavService.streamVideoTypeFailure(req, res, error);
      if (!served && !res.headersSent) {
        res.status(502).json({ error: error.message });
      } else if (!served) {
        res.end();
      }
      return;
    }

    const statusCode = error.response?.status || 502;
    if (!res.headersSent) {
      res.status(statusCode).json({ error: error.message });
    } else {
      res.end();
    }
  }
}

module.exports = {
  handleNzbdavStreamService,
};
