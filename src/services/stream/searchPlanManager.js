function createSearchPlanManager({
  strictTextMode,
  isSpecialRequest,
  seasonToken,
  episodeToken,
  sanitizeStrictSearchPhrase,
}) {
  const searchPlans = [];
  const seenPlans = new Set();

  function addPlan(planType, { tokens = [], rawQuery = null } = {}) {
    const tokenList = [...tokens];
    if (planType === 'tvsearch') {
      if (seasonToken) tokenList.push(seasonToken);
      if (episodeToken) tokenList.push(episodeToken);
    }
    const normalizedTokens = tokenList.filter(Boolean);
    const query = rawQuery ? rawQuery : normalizedTokens.join(' ');
    if (!query) {
      return false;
    }
    const planKey = `${planType}|${query}`;
    if (seenPlans.has(planKey)) {
      return false;
    }
    seenPlans.add(planKey);
    const planRecord = { type: planType, query, rawQuery: rawQuery ? rawQuery : null, tokens: normalizedTokens };
    if (strictTextMode && planType === 'search' && rawQuery && !isSpecialRequest) {
      const strictPhrase = sanitizeStrictSearchPhrase(rawQuery);
      if (strictPhrase) {
        planRecord.strictMatch = true;
        planRecord.strictPhrase = strictPhrase;
      }
    }
    searchPlans.push(planRecord);
    return true;
  }

  return {
    searchPlans,
    addPlan,
  };
}

module.exports = {
  createSearchPlanManager,
};
