function createAdminConnectionTestHandler({
  testIndexerConnection,
  testNzbdavConnection,
  testUsenetConnection,
  testNewznabConnection,
  testNewznabSearch,
  testTmdbConnection,
  easynewsService,
  tvdbService,
}) {
  return async (req, res) => {
    const payload = req.body || {};
    const { type, values } = payload;
    if (!type || typeof values !== 'object') {
      res.status(400).json({ error: 'Invalid payload: expected "type" and "values"' });
      return;
    }

    try {
      let message;
      switch (type) {
        case 'indexer':
          message = await testIndexerConnection(values);
          break;
        case 'nzbdav':
          message = await testNzbdavConnection(values);
          break;
        case 'usenet':
          message = await testUsenetConnection(values);
          break;
        case 'newznab':
          message = await testNewznabConnection(values);
          break;
        case 'newznab-search':
          message = await testNewznabSearch(values);
          break;
        case 'easynews': {
          const username = values?.EASYNEWS_USERNAME || '';
          const password = values?.EASYNEWS_PASSWORD || '';
          message = await easynewsService.testEasynewsCredentials({ username, password });
          break;
        }
        case 'tmdb':
          message = await testTmdbConnection(values);
          break;
        case 'tvdb':
          message = await tvdbService.testTvdbConnection({
            apiKey: values?.TVDB_API_KEY,
            enabled: values?.TVDB_ENABLED,
          });
          break;
        default:
          res.status(400).json({ error: `Unknown test type: ${type}` });
          return;
      }
      res.json({ status: 'ok', message });
    } catch (error) {
      const reason = error?.message || 'Connection test failed';
      res.json({ status: 'error', message: reason });
    }
  };
}

module.exports = {
  createAdminConnectionTestHandler,
};
