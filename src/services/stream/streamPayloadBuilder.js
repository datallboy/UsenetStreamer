function buildStreamPayload({
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
}) {
  if (isNativeMode) {
    const nntpServers = buildNntpServersArray();
    return {
      name: formattedName,
      description: formattedTitle,
      nzbUrl: result.downloadUrl,
      servers: nntpServers.length > 0 ? nntpServers : undefined,
      url: undefined,
      infoHash: undefined,
      behaviorHints,
    };
  }

  const stream = {
    title: formattedTitle,
    name: formattedName,
    url: streamUrl,
    behaviorHints,
    meta: {
      originalTitle: result.title,
      indexer: result.indexer,
      size: result.size,
      quality,
      age: result.age,
      type: 'nzb',
      cached: Boolean(isInstant),
      cachedFromHistory: Boolean(historySlot),
      languages: releaseLanguages,
      indexerLanguage: sourceLanguage,
      resolution: detectedResolutionToken || null,
      preferredLanguageMatch: preferredLanguageHit,
      preferredLanguageName: matchedPreferredLanguage,
      preferredLanguageNames: preferredLanguageMatches,
    }
  };

  if (triageTag || triageInfo || triageOutcome?.timedOut || !triageApplied) {
    if (triageInfo) {
      stream.meta.healthCheck = {
        status: triageStatus,
        blockers: triageInfo.blockers || [],
        warnings: triageInfo.warnings || [],
        fileCount: triageInfo.fileCount,
        archiveCheck: archiveCheckStatus,
        missingArticlesCheck: missingArticlesStatus,
        applied: triageApplied,
        inheritedFromTitle: triageDerivedFromTitle,
      };
      stream.meta.healthCheck.archiveFindings = archiveFindings;
      if (triageInfo.sourceDownloadUrl) {
        stream.meta.healthCheck.sourceDownloadUrl = triageInfo.sourceDownloadUrl;
      }
    } else {
      stream.meta.healthCheck = {
        status: triageOutcome?.timedOut ? 'pending' : 'not-run',
        applied: false,
      };
    }
  }

  return stream;
}

module.exports = {
  buildStreamPayload,
};
