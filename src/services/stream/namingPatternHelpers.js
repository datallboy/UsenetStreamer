function buildPatternFromTokenList(rawPattern, variant, defaultPattern) {
  if (rawPattern && typeof rawPattern === 'string' && rawPattern.includes('{')) {
    return rawPattern;
  }
  const hasLineBreaks = /[\r\n]/.test(String(rawPattern || ''));
  const normalizedList = String(rawPattern || '')
    .replace(/\band\b/gi, ',')
    .replace(/[;|]/g, ',');
  const tokens = normalizedList
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  if (!hasLineBreaks && tokens.length === 0) return defaultPattern;

  const shortTokenMap = {
    addon: '{addon.name}',
    title: '{stream.title::exists["{stream.title}"||""]}',
    instant: '{stream.instant::istrue["⚡"||""]}',
    health: '{stream.health::exists["{stream.health}"||""]}',
    quality: '{stream.quality::exists["{stream.quality}"||""]}',
    resolution: '{stream.resolution::exists["{stream.resolution}"||""]}',
    source: '{stream.source::exists["{stream.source}"||""]}',
    codec: '{stream.encode::exists["{stream.encode}"||""]}',
    group: '{stream.releaseGroup::exists["{stream.releaseGroup}"||""]}',
    size: '{stream.size::>0["{stream.size::bytes}"||""]}',
    languages: '{stream.languages::join(" ")::exists["{stream.languages::join(\\" \\")}"||""]}',
    indexer: '{stream.indexer::exists["{stream.indexer}"||""]}',
    filename: '{stream.filename::exists["{stream.filename}"||""]}',
    tags: '{tags::exists["{tags}"||""]}',
  };

  const longTokenMap = {
    title: '{stream.title::exists["🎬 {stream.title}"||""]}',
    filename: '{stream.filename::exists["📄 {stream.filename}"||""]}',
    source: '{stream.source::exists["🎥 {stream.source}"||""]}',
    codec: '{stream.encode::exists["🎞️ {stream.encode}"||""]}',
    resolution: '{stream.resolution::exists["🖥️ {stream.resolution}"||""]}',
    visual: '{stream.visualTags::join(" | ")::exists["📺 {stream.visualTags::join(\\" | \\")}"||""]}',
    audio: '{stream.audioTags::join(" ")::exists["🎧 {stream.audioTags::join(\\" \\")}"||""]}',
    group: '{stream.releaseGroup::exists["👥 {stream.releaseGroup}"||""]}',
    size: '{stream.size::>0["📦 {stream.size::bytes}"||""]}',
    languages: '{stream.languages::join(" ")::exists["🌎 {stream.languages::join(\\" \\")}"||""]}',
    indexer: '{stream.indexer::exists["🔎 {stream.indexer}"||""]}',
    health: '{stream.health::exists["🧪 {stream.health}"||""]}',
    instant: '{stream.instant::istrue["⚡ Instant"||""]}',
    quality: '{stream.quality::exists["✨ {stream.quality}"||""]}',
    tags: '{tags::exists["🏷️ {tags}"||""]}',
  };

  const tokenMap = variant === 'long' ? longTokenMap : shortTokenMap;

  if (hasLineBreaks) {
    const lines = String(rawPattern || '').split(/\r?\n/);
    const lineParts = lines.map((line) => {
      const normalizedLine = String(line || '')
        .replace(/\band\b/gi, ',')
        .replace(/[;|]/g, ',');
      const lineTokens = normalizedLine
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
      return lineTokens
        .map((token) => tokenMap[token.toLowerCase()] || null)
        .filter(Boolean)
        .join(' ');
    });
    const separator = variant === 'long' ? '\n' : ' ';
    const joined = lineParts.join(separator);
    if (joined.replace(/\s/g, '') === '') return defaultPattern;
    return joined;
  }

  const parts = tokens
    .map((token) => tokenMap[token.toLowerCase()] || null)
    .filter(Boolean);

  if (parts.length === 0) return defaultPattern;
  return parts.join(' ');
}

module.exports = {
  buildPatternFromTokenList,
};
