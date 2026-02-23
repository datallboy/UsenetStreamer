function resolveHealthIndexerContext({
  triageOverrides,
  triagePriorityIndexers,
  triageHealthIndexers,
  triageSerializedIndexers,
  indexerManager,
  toBoolean,
  normalizeIndexerToken,
  getPaidDirectIndexerTokens,
}) {
  const overrideIndexerTokens = (triageOverrides.indexers && triageOverrides.indexers.length > 0)
    ? triageOverrides.indexers
    : null;
  const directPaidTokens = overrideIndexerTokens ? [] : getPaidDirectIndexerTokens();
  const managerHealthTokens = indexerManager === 'none'
    ? []
    : (triagePriorityIndexers.length > 0 ? triagePriorityIndexers : triageHealthIndexers);
  let combinedHealthTokens = [];

  if (overrideIndexerTokens) {
    combinedHealthTokens = [...overrideIndexerTokens];
  } else {
    if (managerHealthTokens && managerHealthTokens.length > 0) {
      combinedHealthTokens = [...managerHealthTokens];
    }
    if (directPaidTokens.length > 0) {
      combinedHealthTokens = combinedHealthTokens.concat(directPaidTokens);
    }
  }

  const easynewsTreatAsIndexer = toBoolean(process.env.EASYNEWS_TREAT_AS_INDEXER, false);
  if (easynewsTreatAsIndexer) {
    const easynewsToken = 'easynews';
    const normalizedTokens = new Set((combinedHealthTokens || []).map((token) => normalizeIndexerToken(token)).filter(Boolean));
    if (!normalizedTokens.has(easynewsToken)) {
      combinedHealthTokens = [...combinedHealthTokens, easynewsToken];
    }
  }

  const serializedIndexerTokens = triageSerializedIndexers.length > 0
    ? triageSerializedIndexers
    : combinedHealthTokens;
  const healthIndexerSet = new Set((combinedHealthTokens || []).map((token) => normalizeIndexerToken(token)).filter(Boolean));

  return {
    combinedHealthTokens,
    serializedIndexerTokens,
    healthIndexerSet,
    easynewsTreatAsIndexer,
  };
}

function buildTriagePool({
  finalNzbResults,
  healthIndexerSet,
  easynewsTreatAsIndexer,
  nzbMatchesIndexer,
}) {
  if (healthIndexerSet.size === 0) {
    return [];
  }

  return finalNzbResults.filter((result) => {
    if (nzbMatchesIndexer(result, healthIndexerSet)) {
      return true;
    }
    return easynewsTreatAsIndexer && result._sourceType === 'easynews';
  });
}

module.exports = {
  resolveHealthIndexerContext,
  buildTriagePool,
};
