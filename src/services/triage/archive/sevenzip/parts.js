function findSevenZipParts(files, targetFile, guessFilenameFromSubject) {
  const targetName = targetFile.filename || guessFilenameFromSubject(targetFile.subject);
  if (!targetName) return [targetFile];
  const match = targetName.match(/^(.+)\.7z(?:\.\d{3})?$/i);
  if (!match) return [targetFile];
  const baseName = match[1].toLowerCase();
  const parts = files.filter((f) => {
    const name = f.filename || guessFilenameFromSubject(f.subject);
    if (!name) return false;
    const m = name.match(/^(.+)\.7z(?:\.\d{3})?$/i);
    return m && m[1].toLowerCase() === baseName;
  });
  parts.sort((a, b) => {
    const nameA = (a.filename || guessFilenameFromSubject(a.subject) || '').toLowerCase();
    const nameB = (b.filename || guessFilenameFromSubject(b.subject) || '').toLowerCase();
    const mA = nameA.match(/\.7z\.(\d{3})$/);
    const mB = nameB.match(/\.7z\.(\d{3})$/);
    const pA = mA ? parseInt(mA[1], 10) : 0;
    const pB = mB ? parseInt(mB[1], 10) : 0;
    return pA - pB;
  });
  return parts.length > 0 ? parts : [targetFile];
}

module.exports = {
  findSevenZipParts,
};
