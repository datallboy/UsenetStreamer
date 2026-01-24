const UserAgent = require('user-agents');

const BLOCKED_SUBSTRINGS = ['usenetstreamer-triage', 'undici'];
const FALLBACK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function containsBlockedSubstring(value = '') {
  const lower = value.toLowerCase();
  return BLOCKED_SUBSTRINGS.some((blocked) => lower.includes(blocked));
}

function getRandomUserAgent() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const candidate = new UserAgent().toString();
      if (candidate && !containsBlockedSubstring(candidate)) {
        return candidate;
      }
    } catch (err) {
      break;
    }
  }
  return FALLBACK_UA;
}

module.exports = {
  getRandomUserAgent,
};
