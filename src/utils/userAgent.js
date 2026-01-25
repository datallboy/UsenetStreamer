const UserAgent = require('user-agents');

const BLOCKED_SUBSTRINGS = ['usenetstreamer-triage', 'undici'];
const FALLBACK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

let cachedUserAgent = null;
let cachedAt = 0;

function containsBlockedSubstring(value = '') {
  const lower = value.toLowerCase();
  return BLOCKED_SUBSTRINGS.some((blocked) => lower.includes(blocked));
}

function generateUserAgent() {
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

function getRandomUserAgent() {
  const now = Date.now();
  if (cachedUserAgent && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedUserAgent;
  }
  cachedUserAgent = generateUserAgent();
  cachedAt = now;
  return cachedUserAgent;
}

module.exports = {
  getRandomUserAgent,
};
