function prepareAdminConfigUpdates({
  incoming,
  adminConfigKeys,
  numberedKeys,
}) {
  const updates = {};
  const numberedKeySet = new Set(numberedKeys || []);

  numberedKeySet.forEach((key) => {
    updates[key] = null;
  });

  (adminConfigKeys || []).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) return;
    const value = incoming[key];

    if (numberedKeySet.has(key)) {
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (trimmed === '' || trimmed === null || trimmed === undefined) {
        updates[key] = null;
      } else if (typeof value === 'boolean') {
        updates[key] = value ? 'true' : 'false';
      } else {
        updates[key] = String(value);
      }
      return;
    }

    if (value === null || value === undefined) {
      updates[key] = '';
    } else if (typeof value === 'boolean') {
      updates[key] = value ? 'true' : 'false';
    } else {
      updates[key] = String(value);
    }
  });

  // Keep explicit TMDb persistence safeguard.
  if (Object.prototype.hasOwnProperty.call(incoming, 'TMDB_API_KEY')) {
    updates.TMDB_API_KEY = incoming.TMDB_API_KEY ? String(incoming.TMDB_API_KEY) : '';
  }
  if (Object.prototype.hasOwnProperty.call(incoming, 'TMDB_ENABLED')) {
    updates.TMDB_ENABLED = incoming.TMDB_ENABLED ? String(incoming.TMDB_ENABLED) : 'false';
  }
  if (Object.prototype.hasOwnProperty.call(incoming, 'TMDB_SEARCH_LANGUAGES')) {
    updates.TMDB_SEARCH_LANGUAGES = incoming.TMDB_SEARCH_LANGUAGES ? String(incoming.TMDB_SEARCH_LANGUAGES) : '';
  }
  if (Object.prototype.hasOwnProperty.call(incoming, 'TMDB_SEARCH_MODE')) {
    updates.TMDB_SEARCH_MODE = incoming.TMDB_SEARCH_MODE ? String(incoming.TMDB_SEARCH_MODE) : '';
  }

  return updates;
}

module.exports = {
  prepareAdminConfigUpdates,
};
