const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveStreamIdentifiers } = require('../../src/domain/stream/resolveStreamIdentifiers');
const { rankStreamResults } = require('../../src/domain/stream/rankStreamResults');

test('domain resolveStreamIdentifiers handles imdb/tmdb/tvdb/special/nzbdav ids', () => {
  const imdb = resolveStreamIdentifiers({
    type: 'movie',
    id: 'tt1234567',
    specialCatalogPrefixes: ['anime'],
  });
  assert.equal(imdb.incomingImdbId, 'tt1234567');
  assert.equal(imdb.requestLacksIdentifiers, false);

  const tmdb = resolveStreamIdentifiers({
    type: 'movie',
    id: 'tmdb:101',
    specialCatalogPrefixes: ['anime'],
  });
  assert.equal(tmdb.incomingTmdbId, '101');
  assert.equal(tmdb.baseIdentifier, 'tmdb:101');

  const tvdb = resolveStreamIdentifiers({
    type: 'series',
    id: 'tvdb:200',
    specialCatalogPrefixes: ['anime'],
  });
  assert.equal(tvdb.incomingTvdbId, '200');
  assert.equal(tvdb.baseIdentifier, 'tvdb:200');

  const special = resolveStreamIdentifiers({
    type: 'movie',
    id: 'anime:one-piece',
    specialCatalogPrefixes: ['anime'],
  });
  assert.equal(special.incomingSpecialId, 'one-piece');
  assert.equal(special.isSpecialRequest, true);

  const nzbdav = resolveStreamIdentifiers({
    type: 'movie',
    id: 'nzbdav:abc123',
    specialCatalogPrefixes: ['anime'],
  });
  assert.equal(nzbdav.incomingNzbdavId, 'abc123');
  assert.equal(nzbdav.isNzbdavRequest, true);
});

test('domain resolveStreamIdentifiers strips season/episode suffix for series ids', () => {
  const resolved = resolveStreamIdentifiers({
    type: 'series',
    id: 'tt0944947:1:2',
    specialCatalogPrefixes: [],
  });
  assert.equal(resolved.baseIdentifier, 'tt0944947');
  assert.equal(resolved.incomingImdbId, 'tt0944947');
});

test('domain rankStreamResults groups instant, verified, and regular streams', () => {
  const triage = new Map([['https://verified', { status: 'verified' }]]);
  const ranked = rankStreamResults({
    triageDecisionByDownloadUrl: triage,
    streams: [
      { name: 'instant', behaviorHints: { cached: true } },
      { name: 'verified', nzbUrl: 'https://verified' },
      { name: 'regular', nzbUrl: 'https://regular' },
    ],
  });

  assert.equal(ranked.buckets.instantStreams.length, 1);
  assert.equal(ranked.buckets.verifiedStreams.length, 1);
  assert.equal(ranked.buckets.regularStreams.length, 1);
  assert.equal(ranked.ranked[0].rank, 0);
  assert.equal(ranked.ranked[1].rank, 1);
  assert.equal(ranked.ranked[2].rank, 2);
});
