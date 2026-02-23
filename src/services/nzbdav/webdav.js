const { normalizeNzbdavPath, isVideoFileName, fileMatchesEpisode } = require('../../utils/parsers');
const { NZBDAV_MAX_DIRECTORY_DEPTH } = require('./constants');

function createNzbdavWebdav({
  state,
  getWebdavClientPromise,
  setWebdavClientPromise,
}) {
  async function getWebdavClient() {
    const cached = getWebdavClientPromise();
    if (cached) return cached;

    const nextPromise = (async () => {
      const { createClient } = await import('webdav');

      const trimmedBase = state.NZBDAV_WEBDAV_URL.replace(/\/+$/, '');
      const rootSegment = (state.NZBDAV_WEBDAV_ROOT || '').replace(/^\/+/, '').replace(/\/+$/, '');
      const baseUrl = rootSegment ? `${trimmedBase}/${rootSegment}` : trimmedBase;

      const authOptions = {};
      if (state.NZBDAV_WEBDAV_USER && state.NZBDAV_WEBDAV_PASS) {
        authOptions.username = state.NZBDAV_WEBDAV_USER;
        authOptions.password = state.NZBDAV_WEBDAV_PASS;
      }

      return createClient(baseUrl, authOptions);
    })();
    setWebdavClientPromise(nextPromise);

    return nextPromise;
  }

  async function listWebdavDirectory(directory) {
    const client = await getWebdavClient();
    const normalizedPath = normalizeNzbdavPath(directory);
    const relativePath = normalizedPath === '/' ? '/' : normalizedPath.replace(/^\/+/, '');

    try {
      const entries = await client.getDirectoryContents(relativePath, { deep: false });
      return entries.map((entry) => ({
        name: entry?.basename ?? entry?.filename ?? '',
        isDirectory: entry?.type === 'directory',
        size: entry?.size ?? null,
        href: entry?.filename ?? entry?.href ?? null
      }));
    } catch (error) {
      throw new Error(`[NZBDAV] Failed to list ${relativePath}: ${error.message}`);
    }
  }

  async function findBestVideoFile({ category, jobName, requestedEpisode }) {
    const rootPath = normalizeNzbdavPath(`/content/${category}/${jobName}`);
    const queue = [{ path: rootPath, depth: 0 }];
    const visited = new Set();
    let bestMatch = null;
    let bestEpisodeMatch = null;

    while (queue.length > 0) {
      const { path: currentPath, depth } = queue.shift();
      if (depth > NZBDAV_MAX_DIRECTORY_DEPTH) {
        continue;
      }
      if (visited.has(currentPath)) {
        continue;
      }
      visited.add(currentPath);

      let entries;
      try {
        entries = await listWebdavDirectory(currentPath);
      } catch (error) {
        console.error(`[NZBDAV] Failed to list ${currentPath}:`, error.message);
        continue;
      }

      for (const entry of entries) {
        const entryName = entry?.name || entry?.Name;
        const isDirectory = entry?.isDirectory ?? entry?.IsDirectory;
        const entrySize = Number(entry?.size ?? entry?.Size ?? 0);
        const nextPath = normalizeNzbdavPath(`${currentPath}/${entryName}`);

        if (isDirectory) {
          queue.push({ path: nextPath, depth: depth + 1 });
          continue;
        }

        if (!entryName || !isVideoFileName(entryName)) {
          continue;
        }

        const matchesEpisode = fileMatchesEpisode(entryName, requestedEpisode);
        const candidate = {
          name: entryName,
          size: entrySize,
          matchesEpisode,
          absolutePath: nextPath,
          viewPath: nextPath.replace(/^\/+/, '')
        };

        if (matchesEpisode) {
          if (!bestEpisodeMatch || candidate.size > bestEpisodeMatch.size) {
            bestEpisodeMatch = candidate;
          }
        }

        if (!bestMatch || candidate.size > bestMatch.size) {
          bestMatch = candidate;
        }
      }
    }

    return bestEpisodeMatch || bestMatch;
  }

  return {
    getWebdavClient,
    listWebdavDirectory,
    findBestVideoFile,
  };
}

module.exports = {
  createNzbdavWebdav,
};
