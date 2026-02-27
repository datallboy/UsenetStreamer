#!/usr/bin/env node

const {
  testIndexerConnection,
  testNzbdavConnection,
  testUsenetConnection,
  testNewznabConnection,
  testTmdbConnection,
} = require('../src/utils/connectionTests');
const easynewsService = require('../src/services/easynews');
const tvdbService = require('../src/services/tvdb');

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function masked(message) {
  return String(message || '').replace(/[A-Za-z0-9_-]{18,}/g, '[redacted]');
}

async function main() {
  const env = process.env;

  const values = {
    INDEXER_MANAGER: env.INDEXER_MANAGER || 'none',
    INDEXER_MANAGER_URL: env.INDEXER_MANAGER_URL || '',
    INDEXER_MANAGER_API_KEY: env.INDEXER_MANAGER_API_KEY || '',

    NZBDAV_URL: env.NZBDAV_URL || '',
    NZBDAV_API_KEY: env.NZBDAV_API_KEY || '',
    NZBDAV_WEBDAV_URL: env.NZBDAV_WEBDAV_URL || '',
    NZBDAV_WEBDAV_USER: env.NZBDAV_WEBDAV_USER || '',
    NZBDAV_WEBDAV_PASS: env.NZBDAV_WEBDAV_PASS || '',
    NZBDAV_CATEGORY: env.NZBDAV_CATEGORY || '',
    NZBDAV_CATEGORY_MOVIES: env.NZBDAV_CATEGORY_MOVIES || '',
    NZBDAV_CATEGORY_DEFAULT: env.NZBDAV_CATEGORY_DEFAULT || '',

    NZB_TRIAGE_NNTP_HOST: env.NZB_TRIAGE_NNTP_HOST || '',
    NZB_TRIAGE_NNTP_PORT: env.NZB_TRIAGE_NNTP_PORT || '',
    NZB_TRIAGE_NNTP_TLS: env.NZB_TRIAGE_NNTP_TLS || '',
    NZB_TRIAGE_NNTP_USER: env.NZB_TRIAGE_NNTP_USER || '',
    NZB_TRIAGE_NNTP_PASS: env.NZB_TRIAGE_NNTP_PASS || '',

    NEWZNAB_ENABLED: env.NEWZNAB_ENABLED || 'false',
    NEWZNAB_ENDPOINT_01: env.NEWZNAB_ENDPOINT_01 || '',
    NEWZNAB_API_KEY_01: env.NEWZNAB_API_KEY_01 || '',
    NEWZNAB_API_PATH_01: env.NEWZNAB_API_PATH_01 || '/api',
    NEWZNAB_NAME_01: env.NEWZNAB_NAME_01 || 'Primary Newznab',
    NEWZNAB_INDEXER_ENABLED_01: env.NEWZNAB_INDEXER_ENABLED_01 || 'true',

    TMDB_ENABLED: env.TMDB_ENABLED || 'false',
    TMDB_API_KEY: env.TMDB_API_KEY || '',

    TVDB_ENABLED: env.TVDB_ENABLED || 'false',
    TVDB_API_KEY: env.TVDB_API_KEY || '',

    EASYNEWS_ENABLED: env.EASYNEWS_ENABLED || 'false',
    EASYNEWS_USERNAME: env.EASYNEWS_USERNAME || '',
    EASYNEWS_PASSWORD: env.EASYNEWS_PASSWORD || '',
  };

  const checks = [
    {
      id: 'indexer-manager',
      enabled: () => {
        const manager = String(values.INDEXER_MANAGER || 'none').trim().toLowerCase();
        return manager !== 'none' && Boolean(values.INDEXER_MANAGER_URL && values.INDEXER_MANAGER_API_KEY);
      },
      run: () => testIndexerConnection(values),
    },
    {
      id: 'newznab',
      enabled: () => toBool(values.NEWZNAB_ENABLED, false)
        && Boolean(values.NEWZNAB_ENDPOINT_01 && values.NEWZNAB_API_KEY_01)
        && toBool(values.NEWZNAB_INDEXER_ENABLED_01, true),
      run: () => testNewznabConnection(values),
    },
    {
      id: 'nzbdav',
      enabled: () => Boolean(
        values.NZBDAV_URL
          && values.NZBDAV_API_KEY
          && values.NZBDAV_WEBDAV_URL
          && values.NZBDAV_WEBDAV_USER
          && values.NZBDAV_WEBDAV_PASS,
      ),
      run: () => testNzbdavConnection(values),
    },
    {
      id: 'usenet-nntp',
      enabled: () => Boolean(values.NZB_TRIAGE_NNTP_HOST),
      run: () => testUsenetConnection(values),
    },
    {
      id: 'easynews',
      enabled: () => toBool(values.EASYNEWS_ENABLED, false)
        && Boolean(values.EASYNEWS_USERNAME && values.EASYNEWS_PASSWORD),
      run: () => easynewsService.testEasynewsCredentials({
        username: values.EASYNEWS_USERNAME,
        password: values.EASYNEWS_PASSWORD,
      }),
    },
    {
      id: 'tmdb',
      enabled: () => toBool(values.TMDB_ENABLED, false) && Boolean(values.TMDB_API_KEY),
      run: () => testTmdbConnection(values),
    },
    {
      id: 'tvdb',
      enabled: () => toBool(values.TVDB_ENABLED, false) && Boolean(values.TVDB_API_KEY),
      run: () => tvdbService.testTvdbConnection({
        apiKey: values.TVDB_API_KEY,
        enabled: values.TVDB_ENABLED,
      }),
    },
  ];

  let executed = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  console.log('[live-integration] Starting nightly live integration checks');

  for (const check of checks) {
    if (!check.enabled()) {
      skipped += 1;
      console.log(`[live-integration] SKIP ${check.id} (not configured)`);
      continue;
    }

    executed += 1;
    const started = Date.now();
    try {
      const result = await check.run();
      passed += 1;
      const elapsed = Date.now() - started;
      console.log(`[live-integration] PASS ${check.id} (${elapsed}ms) - ${masked(result || 'ok')}`);
    } catch (error) {
      failed += 1;
      const elapsed = Date.now() - started;
      const message = error?.message || String(error);
      console.log(`[live-integration] FAIL ${check.id} (${elapsed}ms) - ${masked(message)}`);
    }
  }

  console.log('[live-integration] Summary', {
    executed,
    passed,
    failed,
    skipped,
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[live-integration] Fatal: ${error?.message || error}`);
  process.exit(1);
});
