const test = require('node:test');
const assert = require('node:assert/strict');

const { encodeStreamParams, decodeStreamParams } = require('../../src/utils/streamParams');

test('encodeStreamParams and decodeStreamParams round trip URL params', () => {
  const params = new URLSearchParams();
  params.set('downloadUrl', 'https://example.com/nzb?id=123');
  params.set('category', 'movies');
  params.set('title', 'Example.Title.2024.1080p');
  const encoded = encodeStreamParams(params);
  const decoded = decodeStreamParams(encoded);
  assert.deepEqual(decoded, {
    downloadUrl: 'https://example.com/nzb?id=123',
    category: 'movies',
    title: 'Example.Title.2024.1080p',
  });
});

test('decodeStreamParams returns null for invalid payloads', () => {
  assert.equal(decodeStreamParams('not-valid-@@'), null);
});
