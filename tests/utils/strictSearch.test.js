const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeStrictSearchPhrase, matchesStrictSearch } = require('../../src/utils/strictSearch');

test('sanitizeStrictSearchPhrase normalizes separators and punctuation', () => {
  const sanitized = sanitizeStrictSearchPhrase('The.Show-S01:E02 & Friends!');
  assert.equal(sanitized, 'the show s01 e02 and friends');
});

test('matchesStrictSearch requires first/last token and ordered gaps', () => {
  const phrase = sanitizeStrictSearchPhrase('The Last of Us');
  assert.equal(matchesStrictSearch('The Last of Us', phrase), true);
  assert.equal(matchesStrictSearch('The Last Great Story of Us', phrase), true);
  assert.equal(matchesStrictSearch('Last of Us The', phrase), false);
});
