function buildStreamResponse({ buckets }) {
  const streamBuckets = buckets || {
    instantStreams: [],
    verifiedStreams: [],
    regularStreams: [],
  };
  return {
    streams: []
      .concat(streamBuckets.instantStreams || [])
      .concat(streamBuckets.verifiedStreams || [])
      .concat(streamBuckets.regularStreams || []),
  };
}

module.exports = {
  buildStreamResponse,
};
