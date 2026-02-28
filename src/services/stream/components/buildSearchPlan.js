function buildSearchPlan({ type, query, identifiers, planner }) {
  if (typeof planner !== 'function') {
    return [];
  }
  const plans = planner({
    type,
    query,
    identifiers,
  });
  return Array.isArray(plans) ? plans : [];
}

module.exports = {
  buildSearchPlan,
};
