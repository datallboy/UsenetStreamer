function formatResolutionBadge(resolution) {
  if (!resolution) return null;
  const normalized = resolution.toLowerCase();

  if (normalized === '8k' || normalized === '4320p') return '8K';
  if (normalized === '4k' || normalized === '2160p' || normalized === 'uhd') return '4K';

  if (normalized.endsWith('p')) return normalized.toUpperCase();
  return resolution;
}

function extractQualityFeatureBadges(title, qualityFeaturePatterns) {
  if (!title) return [];
  const badges = [];
  qualityFeaturePatterns.forEach(({ label, regex }) => {
    if (regex.test(title)) {
      badges.push(label);
    }
  });
  return badges;
}

module.exports = {
  formatResolutionBadge,
  extractQualityFeatureBadges,
};
