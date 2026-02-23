function normalizeCombinedPlanSettled(settled) {
  const managerSet = settled[0];
  const newznabSet = settled[1];
  const managerResults = managerSet?.status === 'fulfilled'
    ? (Array.isArray(managerSet.value?.results) ? managerSet.value.results : (Array.isArray(managerSet.value) ? managerSet.value : []))
    : [];
  const newznabResults = newznabSet?.status === 'fulfilled'
    ? (Array.isArray(newznabSet.value?.results) ? newznabSet.value.results : (Array.isArray(newznabSet.value) ? newznabSet.value : []))
    : [];
  const combinedResults = [...managerResults, ...newznabResults];
  const errors = [];
  if (managerSet?.status === 'rejected') {
    errors.push(`manager: ${managerSet.reason?.message || managerSet.reason}`);
  } else if (Array.isArray(managerSet?.value?.errors) && managerSet.value.errors.length) {
    managerSet.value.errors.forEach((err) => errors.push(`manager: ${err}`));
  }
  if (newznabSet?.status === 'rejected') {
    errors.push(`newznab: ${newznabSet.reason?.message || newznabSet.reason}`);
  } else if (Array.isArray(newznabSet?.value?.errors) && newznabSet.value.errors.length) {
    newznabSet.value.errors.forEach((err) => errors.push(`newznab: ${err}`));
  }
  return {
    managerResults,
    newznabResults,
    combinedResults,
    errors,
    newznabEndpoints: Array.isArray(newznabSet?.value?.endpoints) ? newznabSet.value.endpoints : [],
  };
}

module.exports = {
  normalizeCombinedPlanSettled,
};
