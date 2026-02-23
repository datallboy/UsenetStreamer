const { toPositiveInt, toBoolean } = require('../utils/config');

function buildTriageNntpConfig() {
  const host = (process.env.NZB_TRIAGE_NNTP_HOST || '').trim();
  if (!host) return null;
  return {
    host,
    port: toPositiveInt(process.env.NZB_TRIAGE_NNTP_PORT, 119),
    user: (process.env.NZB_TRIAGE_NNTP_USER || '').trim() || undefined,
    pass: (process.env.NZB_TRIAGE_NNTP_PASS || '').trim() || undefined,
    useTLS: toBoolean(process.env.NZB_TRIAGE_NNTP_TLS, false),
  };
}

function buildNntpServersArray() {
  const host = (process.env.NZB_TRIAGE_NNTP_HOST || '').trim();
  if (!host) return [];

  const port = toPositiveInt(process.env.NZB_TRIAGE_NNTP_PORT, 119);
  const user = (process.env.NZB_TRIAGE_NNTP_USER || '').trim();
  const pass = (process.env.NZB_TRIAGE_NNTP_PASS || '').trim();
  const useTLS = toBoolean(process.env.NZB_TRIAGE_NNTP_TLS, false);
  const connections = toPositiveInt(process.env.NZB_TRIAGE_NNTP_MAX_CONNECTIONS, 12);

  const protocol = useTLS ? 'nntps' : 'nntp';
  const auth = user && pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : '';
  const serverUrl = `${protocol}://${auth}${host}:${port}/${connections}`;

  return [serverUrl];
}

module.exports = {
  buildTriageNntpConfig,
  buildNntpServersArray,
};
