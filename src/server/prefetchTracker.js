function createPrefetchTracker({ ttlMs, warn = () => {} } = {}) {
  const maxAgeMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60 * 60 * 1000;
  const entries = new Map();

  function prune() {
    if (entries.size === 0) return;
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, entry] of entries.entries()) {
      if (entry?.createdAt && entry.createdAt < cutoff) {
        entries.delete(key);
      }
    }
  }

  function has(key) {
    return entries.has(key);
  }

  function remove(key) {
    entries.delete(key);
  }

  function setPromise(key, promise) {
    entries.set(key, { promise, createdAt: Date.now() });
  }

  function setResolved(key, data = {}) {
    entries.set(key, { ...data, createdAt: Date.now() });
  }

  async function resolve(key) {
    prune();
    const entry = entries.get(key);
    if (!entry) return null;
    if (!entry.promise) return entry;

    try {
      const resolved = await entry.promise;
      const merged = { ...resolved, createdAt: resolved?.createdAt || Date.now() };
      const latest = entries.get(key);
      if (latest && latest.promise === entry.promise) {
        entries.set(key, merged);
      }
      return merged;
    } catch (error) {
      const latest = entries.get(key);
      if (latest && latest.promise === entry.promise) {
        entries.delete(key);
      }
      warn(error);
      return null;
    }
  }

  return {
    prune,
    has,
    remove,
    setPromise,
    setResolved,
    resolve,
  };
}

module.exports = {
  createPrefetchTracker,
};
