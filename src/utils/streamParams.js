function encodeStreamParams(params) {
  const json = JSON.stringify(Object.fromEntries(params.entries()));
  return Buffer.from(json, 'utf8').toString('base64url');
}

function decodeStreamParams(encoded) {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

module.exports = {
  encodeStreamParams,
  decodeStreamParams,
};
