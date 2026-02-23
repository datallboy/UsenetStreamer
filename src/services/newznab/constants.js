const MAX_NEWZNAB_INDEXERS = 20;
const NEWZNAB_FIELD_SUFFIXES = ['ENDPOINT', 'API_KEY', 'API_PATH', 'NAME', 'INDEXER_ENABLED', 'PAID', 'PAID_LIMIT', 'ZYCLOPS'];
const NEWZNAB_NUMBERED_KEYS = [];
for (let i = 1; i <= MAX_NEWZNAB_INDEXERS; i += 1) {
  const idx = String(i).padStart(2, '0');
  NEWZNAB_FIELD_SUFFIXES.forEach((suffix) => {
    NEWZNAB_NUMBERED_KEYS.push(`NEWZNAB_${suffix}_${idx}`);
  });
}

const XML_PARSE_OPTIONS = {
  explicitArray: false,
  explicitRoot: false,
  mergeAttrs: true,
  attrkey: '$',
  charkey: '_',
};

const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEBUG_BODY_CHAR_LIMIT = 1200;
const NEWZNAB_TEST_LOG_PREFIX = '[NEWZNAB][TEST]';

const BUILTIN_NEWZNAB_PRESETS = [
  {
    id: 'nzbgeek',
    label: 'NZBGeek (api.nzbgeek.info)',
    endpoint: 'https://api.nzbgeek.info',
    apiPath: '/api',
    description: 'Popular paid Newznab indexer. Requires membership and API key from your profile.',
    apiKeyUrl: 'https://nzbgeek.info/dashboard.php?myaccount'
  },
  {
    id: 'drunkenslug',
    label: 'DrunkenSlug (drunkenslug.com)',
    endpoint: 'https://drunkenslug.com',
    apiPath: '/api',
    description: 'Invite-only Newznab indexer. Paste your API key from the profile page.',
    apiKeyUrl: 'https://drunkenslug.com/profile'
  },
  {
    id: 'nzbplanet',
    label: 'NZBPlanet (nzbplanet.net)',
    endpoint: 'https://nzbplanet.net',
    apiPath: '/api',
    description: 'Long-running public/VIP indexer. VIP membership unlocks API usage.',
    apiKeyUrl: 'https://nzbplanet.net/profile'
  },
  {
    id: 'dognzb',
    label: 'DOGnzb (api.dognzb.cr)',
    endpoint: 'https://api.dognzb.cr',
    apiPath: '/api',
    description: 'Legacy invite-only indexer. Use the API hostname rather than the landing page.',
    apiKeyUrl: 'https://dognzb.cr/profile'
  },
  {
    id: 'althub',
    label: 'altHUB (api.althub.co.za)',
    endpoint: 'https://api.althub.co.za',
    apiPath: '/api',
    description: 'Community-run indexer popular in South Africa. Requires account + API key.',
    apiKeyUrl: 'https://althub.co.za/profile'
  },
  {
    id: 'animetosho',
    label: 'AnimeTosho (feed.animetosho.org)',
    endpoint: 'https://feed.animetosho.org',
    apiPath: '/api',
    description: 'Anime-focused public feed with Newznab-compatible API.',
    apiKeyUrl: 'https://animetosho.org/login'
  },
  {
    id: 'miatrix',
    label: 'Miatrix (miatrix.com)',
    endpoint: 'https://www.miatrix.com',
    apiPath: '/api',
    description: 'General-purpose indexer; membership required for API usage.',
    apiKeyUrl: 'https://www.miatrix.com/profile'
  },
  {
    id: 'ninjacentral',
    label: 'NinjaCentral (ninjacentral.co.za)',
    endpoint: 'https://ninjacentral.co.za',
    apiPath: '/api',
    description: 'Invite-only indexer focused on South African content. Paste your API key.',
    apiKeyUrl: 'https://ninjacentral.co.za/profile'
  },
  {
    id: 'nzblife',
    label: 'NZB.life (api.nzb.life)',
    endpoint: 'https://api.nzb.life',
    apiPath: '/api',
    description: 'Smaller public indexer. Requires account for API requests.',
    apiKeyUrl: 'https://nzb.life/profile'
  },
  {
    id: 'nzbfinder',
    label: 'NZBFinder (nzbfinder.ws)',
    endpoint: 'https://nzbfinder.ws',
    apiPath: '/api',
    description: 'Paid/veteran-friendly indexer. API key available on the profile page.',
    apiKeyUrl: 'https://nzbfinder.ws/account'
  },
  {
    id: 'nzbstars',
    label: 'NZBStars (nzbstars.com)',
    endpoint: 'https://nzbstars.com',
    apiPath: '/api',
    description: 'Invite-only indexer with TV and movie focus. Requires API key.',
    apiKeyUrl: 'https://nzbstars.com/account'
  },
  {
    id: 'scenenzbs',
    label: 'SceneNZBs (scenenzbs.com)',
    endpoint: 'https://scenenzbs.com',
    apiPath: '/api',
    description: 'Scene-focused indexer. API key from account settings is required.',
    apiKeyUrl: 'https://scenenzbs.com/profile'
  },
  {
    id: 'tabularasa',
    label: 'Tabula Rasa (tabula-rasa.pw)',
    endpoint: 'https://www.tabula-rasa.pw',
    apiPath: '/api/v1',
    description: 'Invite-only indexer with modern API v1 endpoint.',
    apiKeyUrl: 'https://www.tabula-rasa.pw/profile'
  },
  {
    id: 'usenet-crawler',
    label: 'Usenet Crawler (usenet-crawler.com)',
    endpoint: 'https://www.usenet-crawler.com',
    apiPath: '/api',
    description: 'Established public indexer with free and VIP plans. API key on profile page.',
    apiKeyUrl: 'https://www.usenet-crawler.com/profile'
  },
];

const DEFAULT_CAPS = {
  search: new Set(['q']),
  tvsearch: new Set(['q', 'tvdbid', 'imdbid', 'season', 'ep']),
  movie: new Set(['q', 'imdbid']),
};

module.exports = {
  MAX_NEWZNAB_INDEXERS,
  NEWZNAB_NUMBERED_KEYS,
  XML_PARSE_OPTIONS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEBUG_BODY_CHAR_LIMIT,
  NEWZNAB_TEST_LOG_PREFIX,
  BUILTIN_NEWZNAB_PRESETS,
  DEFAULT_CAPS,
};
