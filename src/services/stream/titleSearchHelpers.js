function stripSeriesSubtitle(title, allowStrip) {
  if (!title || !allowStrip) return title;
  const colonIdx = title.indexOf(':');
  if (colonIdx > 0 && colonIdx < title.length - 1) {
    const beforeColon = title.slice(0, colonIdx).trim();
    const beforeWords = beforeColon.split(/\s+/).filter(Boolean);
    if (beforeWords.length >= 4) {
      const afterColon = title.slice(colonIdx + 1).trim();
      if (!/^\d{4}$/.test(afterColon)) {
        return beforeColon;
      }
    }
  }
  return title;
}

module.exports = {
  stripSeriesSubtitle,
};
