function sanitizeStrictSearchPhrase(text) {
  if (!text) return '';
  return text
    .replace(/&/g, ' and ')
    .replace(/[\.\-_:\s]+/g, ' ')
    .replace(/[^\w\sÀ-ÿ]/g, '')
    .toLowerCase()
    .trim();
}

function matchesStrictSearch(title, strictPhrase) {
  if (!strictPhrase) return true;
  const candidate = sanitizeStrictSearchPhrase(title);
  if (!candidate) return false;
  if (candidate === strictPhrase) return true;
  const candidateTokens = candidate.split(' ').filter(Boolean);
  const phraseTokens = strictPhrase.split(' ').filter(Boolean);
  if (phraseTokens.length === 0) return true;

  if (candidateTokens[0] !== phraseTokens[0]) return false;
  if (candidateTokens[candidateTokens.length - 1] !== phraseTokens[phraseTokens.length - 1]) return false;

  let candidateIdx = 1;
  for (let i = 1; i < phraseTokens.length; i += 1) {
    const token = phraseTokens[i];
    let found = false;
    while (candidateIdx < candidateTokens.length) {
      if (candidateTokens[candidateIdx] === token) {
        found = true;
        candidateIdx += 1;
        break;
      }
      candidateIdx += 1;
    }
    if (!found) return false;
  }
  return true;
}

module.exports = {
  sanitizeStrictSearchPhrase,
  matchesStrictSearch,
};
