function rankStreamResults({ streams, triageDecisionByDownloadUrl }) {
  const buckets = {
    instantStreams: [],
    verifiedStreams: [],
    regularStreams: [],
  };

  const ranked = [];
  (Array.isArray(streams) ? streams : []).forEach((stream) => {
    const downloadUrl = stream?.nzbUrl || stream?.meta?.healthCheck?.sourceDownloadUrl;
    const decision = downloadUrl && triageDecisionByDownloadUrl instanceof Map
      ? triageDecisionByDownloadUrl.get(downloadUrl)
      : null;
    const status = decision?.status || stream?.meta?.healthCheck?.status || null;
    const instant = Boolean(stream?.meta?.cached || stream?.behaviorHints?.cached);

    if (instant) {
      buckets.instantStreams.push(stream);
    } else if (String(status || '').toLowerCase() === 'verified') {
      buckets.verifiedStreams.push(stream);
    } else {
      buckets.regularStreams.push(stream);
    }

    ranked.push({
      stream,
      triageStatus: status,
      instant,
      rank: instant ? 0 : (String(status || '').toLowerCase() === 'verified' ? 1 : 2),
    });
  });

  return {
    ranked,
    buckets,
  };
}

module.exports = {
  rankStreamResults,
};
