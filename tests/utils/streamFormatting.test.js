const test = require('node:test');
const assert = require('node:assert/strict');

const { formatResolutionBadge, extractQualityFeatureBadges } = require('../../src/utils/streamFormatting');

test('formatResolutionBadge normalizes common resolution aliases', () => {
  assert.equal(formatResolutionBadge('2160p'), '4K');
  assert.equal(formatResolutionBadge('1080p'), '1080P');
  assert.equal(formatResolutionBadge('uhd'), '4K');
});

test('extractQualityFeatureBadges returns labels for matching patterns', () => {
  const patterns = [
    { label: 'Dolby Vision', regex: /dolby[ ._-]?vision/i },
    { label: 'HDR10+', regex: /hdr10\+/i },
  ];
  const badges = extractQualityFeatureBadges('Movie.2024.Dolby.Vision.HDR10+', patterns);
  assert.deepEqual(badges, ['Dolby Vision', 'HDR10+']);
});
