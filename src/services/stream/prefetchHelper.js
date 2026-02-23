function startVerifiedPrefetch({
  triagePrefetchFirstVerified,
  streamingMode,
  prefetchCandidate,
  prefetchTracker,
  cache,
  nzbdavService,
}) {
  if (!triagePrefetchFirstVerified || streamingMode === 'native' || !prefetchCandidate) {
    return;
  }

  prefetchTracker.prune();
  if (prefetchTracker.has(prefetchCandidate.downloadUrl)) {
    return;
  }

  const jobPromise = new Promise((resolve, reject) => {
    setImmediate(async () => {
      try {
        const cachedEntry = cache.getVerifiedNzbCacheEntry(prefetchCandidate.downloadUrl);
        if (cachedEntry) {
          console.log('[CACHE] Using verified NZB payload for prefetch', { downloadUrl: prefetchCandidate.downloadUrl });
        }
        const added = await nzbdavService.addNzbToNzbdav({
          downloadUrl: prefetchCandidate.downloadUrl,
          cachedEntry,
          category: prefetchCandidate.category,
          jobLabel: prefetchCandidate.title,
        });
        resolve({
          nzoId: added.nzoId,
          category: prefetchCandidate.category,
          jobName: prefetchCandidate.title,
          createdAt: Date.now(),
        });
      } catch (error) {
        reject(error);
      }
    });
  });

  prefetchTracker.setPromise(prefetchCandidate.downloadUrl, jobPromise);
  jobPromise
    .then((jobInfo) => {
      prefetchTracker.setResolved(prefetchCandidate.downloadUrl, jobInfo);
      console.log(`[NZBDAV] Prefetched first verified NZB queued (nzoId=${jobInfo.nzoId})`);
    })
    .catch((prefetchError) => {
      prefetchTracker.remove(prefetchCandidate.downloadUrl);
      console.warn('[NZBDAV] Prefetch of first verified NZB failed:', prefetchError.message);
    });
}

module.exports = {
  startVerifiedPrefetch,
};
