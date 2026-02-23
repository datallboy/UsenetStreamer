async function handleEasynewsNzbDownloadService(req, res, ctx) {
  const { easynewsService, STREAMING_MODE } = ctx;

  if (!easynewsService.isEasynewsEnabled()) {
    res.status(503).json({ error: 'Easynews integration is disabled' });
    return;
  }
  const payload = typeof req.query.payload === 'string' ? req.query.payload : null;
  if (!payload) {
    res.status(400).json({ error: 'Missing payload parameter' });
    return;
  }
  try {
    const requester = req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown';
    console.log('[EASYNEWS] Incoming NZB request', {
      requester,
      payloadPreview: `${payload.slice(0, 16)}${payload.length > 16 ? '…' : ''}`,
      streamingMode: STREAMING_MODE,
    });
    const nzbData = await easynewsService.downloadEasynewsNzb(payload);
    console.log('[EASYNEWS] NZB download succeeded', {
      fileName: nzbData.fileName,
      size: nzbData.buffer?.length,
      contentType: nzbData.contentType,
    });
    res.setHeader('Content-Type', nzbData.contentType || 'application/x-nzb+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${nzbData.fileName || 'easynews.nzb'}"`);
    res.status(200).send(nzbData.buffer);
  } catch (error) {
    const statusCode = /credential|unauthorized|forbidden/i.test(error.message || '') ? 401 : 502;
    console.warn('[EASYNEWS] NZB download failed', error.message || error);
    res.status(statusCode).json({ error: error.message || 'Unable to fetch Easynews NZB' });
  }
}

module.exports = {
  handleEasynewsNzbDownloadService,
};
