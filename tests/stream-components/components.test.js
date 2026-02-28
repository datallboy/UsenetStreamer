const test = require('node:test');
const assert = require('node:assert/strict');

const { parseStreamRequest } = require('../../src/services/stream/components/parseStreamRequest');
const { resolveStreamIdentifiers } = require('../../src/services/stream/components/resolveStreamIdentifiers');
const { buildSearchPlan } = require('../../src/services/stream/components/buildSearchPlan');
const { rankStreamResults } = require('../../src/services/stream/components/rankStreamResults');
const { buildStreamResponse } = require('../../src/services/stream/components/buildStreamResponse');

test('parseStreamRequest reads route params and query', () => {
  const parsed = parseStreamRequest({
    params: { type: 'movie', id: 'tt1234567' },
    query: { quality: '1080p' },
  });
  assert.equal(parsed.type, 'movie');
  assert.equal(parsed.id, 'tt1234567');
  assert.deepEqual(parsed.query, { quality: '1080p' });
  assert.equal(Number.isFinite(parsed.requestStartTs), true);
});

test('resolveStreamIdentifiers parses series episode ids and special prefixes', () => {
  const resolvedSeries = resolveStreamIdentifiers({
    type: 'series',
    id: 'tt0944947:1:2',
    specialCatalogPrefixes: ['anime'],
  });
  assert.equal(resolvedSeries.baseIdentifier, 'tt0944947');
  assert.equal(resolvedSeries.incomingImdbId, 'tt0944947');
  assert.equal(resolvedSeries.requestLacksIdentifiers, false);

  const resolvedSpecial = resolveStreamIdentifiers({
    type: 'movie',
    id: 'anime:one-piece-film',
    specialCatalogPrefixes: ['anime'],
  });
  assert.equal(resolvedSpecial.incomingSpecialId, 'one-piece-film');
  assert.equal(resolvedSpecial.isSpecialRequest, true);
});

test('buildSearchPlan returns planner result or empty array', () => {
  const plans = buildSearchPlan({
    type: 'movie',
    query: { q: 'test' },
    identifiers: { incomingImdbId: 'tt1' },
    planner: () => [{ kind: 'search', query: 'test' }],
  });
  assert.deepEqual(plans, [{ kind: 'search', query: 'test' }]);

  const empty = buildSearchPlan({
    type: 'movie',
    query: {},
    identifiers: {},
  });
  assert.deepEqual(empty, []);
});

test('rankStreamResults buckets instant, verified, and regular streams', () => {
  const decisions = new Map([
    ['https://a', { status: 'verified' }],
  ]);
  const ranked = rankStreamResults({
    triageDecisionByDownloadUrl: decisions,
    streams: [
      { name: 'instant', meta: { cached: true } },
      { name: 'verified', nzbUrl: 'https://a' },
      { name: 'regular', nzbUrl: 'https://b' },
    ],
  });
  assert.equal(ranked.buckets.instantStreams.length, 1);
  assert.equal(ranked.buckets.verifiedStreams.length, 1);
  assert.equal(ranked.buckets.regularStreams.length, 1);
});

test('buildStreamResponse concatenates buckets in priority order', () => {
  const response = buildStreamResponse({
    buckets: {
      instantStreams: [{ name: '1' }],
      verifiedStreams: [{ name: '2' }],
      regularStreams: [{ name: '3' }],
    },
  });
  assert.deepEqual(response, {
    streams: [{ name: '1' }, { name: '2' }, { name: '3' }],
  });
});
