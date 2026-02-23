const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const { pipeline } = require('stream');
const cache = require('../../cache');
const { normalizeNzbdavPath, inferMimeType } = require('../../utils/parsers');
const { safeStat } = require('../../utils/helpers');
const {
  STREAM_HIGH_WATER_MARK,
  FAILURE_VIDEO_PATH,
  VIDEO_TYPE_FAILURE_PATH,
  ADDON_VERSION,
  NZBDAV_STREAM_TIMEOUT_MS,
  NZBDAV_SUPPORTED_METHODS,
} = require('./constants');

const pipelineAsync = promisify(pipeline);

function createNzbdavStreaming({
  state,
  addNzbToNzbdav,
  waitForNzbdavHistorySlot,
  findBestVideoFile,
}) {
  async function buildNzbdavStream({ downloadUrl, category, title, requestedEpisode, existingSlot = null, inlineCachedEntry = null }) {
    let reuseError = null;
    const attempts = [];
    if (existingSlot?.nzoId) {
      attempts.push('reuse');
    }
    attempts.push('queue');

    for (const mode of attempts) {
      try {
        let slot = null;
        let nzoId = null;
        let slotCategory = category;
        let slotJobName = title;

        if (mode === 'reuse') {
          const reuseCategory = existingSlot?.category || category;
          slot = await waitForNzbdavHistorySlot(existingSlot.nzoId, reuseCategory);
          nzoId = existingSlot.nzoId;
          slotCategory = slot?.category || slot?.Category || reuseCategory;
          slotJobName = slot?.job_name || slot?.JobName || slot?.name || slot?.Name || existingSlot?.jobName || title;
          console.log(`[NZBDAV] Reusing completed NZB ${slotJobName} (${nzoId})`);
        } else {
          const cachedNzbEntry = inlineCachedEntry || cache.getVerifiedNzbCacheEntry(downloadUrl);
          if (cachedNzbEntry) {
            console.log('[CACHE] Using verified NZB payload', { downloadUrl });
          }
          const added = await addNzbToNzbdav({
            downloadUrl,
            cachedEntry: cachedNzbEntry,
            category,
            jobLabel: title,
          });
          nzoId = added.nzoId;
          slot = await waitForNzbdavHistorySlot(nzoId, category);
          slotCategory = slot?.category || slot?.Category || category;
          slotJobName = slot?.job_name || slot?.JobName || slot?.name || slot?.Name || title;
        }

        if (!slotJobName) {
          throw new Error('[NZBDAV] Unable to determine job name from history');
        }

        const bestFile = await findBestVideoFile({
          category: slotCategory,
          jobName: slotJobName,
          requestedEpisode
        });

        if (!bestFile) {
          const noVideoError = new Error('[NZBDAV] No playable video files found after mounting NZB');
          noVideoError.code = 'NO_VIDEO_FILES';
          throw noVideoError;
        }

        console.log(`[NZBDAV] Selected file ${bestFile.viewPath} (${bestFile.size} bytes)`);

        return {
          nzoId,
          category: slotCategory,
          jobName: slotJobName,
          viewPath: bestFile.viewPath,
          size: bestFile.size,
          fileName: bestFile.name
        };
      } catch (error) {
        if (mode === 'reuse') {
          reuseError = error;
          console.warn(`[NZBDAV] Reuse attempt failed for NZB ${existingSlot?.nzoId || 'unknown'}: ${error.message}`);
          continue;
        }
        if (error?.isNzbdavFailure) {
          error.downloadUrl = downloadUrl;
          error.category = category;
          error.title = title;
        }
        throw error;
      }
    }

    if (reuseError) {
      if (reuseError?.isNzbdavFailure) {
        reuseError.downloadUrl = downloadUrl;
        reuseError.category = category;
        reuseError.title = title;
      }
      throw reuseError;
    }

    const fallbackError = new Error('[NZBDAV] Unable to prepare NZB stream');
    fallbackError.downloadUrl = downloadUrl;
    fallbackError.category = category;
    fallbackError.title = title;
    throw fallbackError;
  }

  async function streamFileResponse(req, res, absolutePath, emulateHead, logPrefix, existingStats = null) {
    const stats = existingStats || (await safeStat(absolutePath));
    if (!stats || !stats.isFile()) {
      return false;
    }

    const totalSize = stats.size;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Last-Modified', stats.mtime.toUTCString());
    res.setHeader('Content-Type', 'application/octet-stream');

    if (emulateHead) {
      res.setHeader('Content-Length', totalSize);
      res.status(200).end();
      console.log(`[${logPrefix}] Served HEAD for ${absolutePath}`);
      return true;
    }

    let start = 0;
    let end = totalSize - 1;
    let statusCode = 200;

    const rangeHeader = req.headers.range;
    if (rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader)) {
      const [, rangeSpec] = rangeHeader.split('=');
      const [rangeStart, rangeEnd] = rangeSpec.split('-');

      if (rangeStart) {
        const parsedStart = Number.parseInt(rangeStart, 10);
        if (Number.isFinite(parsedStart) && parsedStart >= 0) {
          start = parsedStart;
        }
      }

      if (rangeEnd) {
        const parsedEnd = Number.parseInt(rangeEnd, 10);
        if (Number.isFinite(parsedEnd) && parsedEnd >= 0) {
          end = parsedEnd;
        }
      }

      if (!rangeEnd) {
        end = totalSize - 1;
      }

      if (start >= totalSize) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
        res.end();
        return true;
      }

      if (end >= totalSize || end < start) {
        end = totalSize - 1;
      }

      statusCode = 206;
    }

    const chunkSize = end - start + 1;
    const readStream = fs.createReadStream(absolutePath, {
      start,
      end,
      highWaterMark: STREAM_HIGH_WATER_MARK
    });

    if (statusCode === 206) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', chunkSize);
      console.log(`[${logPrefix}] Serving partial bytes ${start}-${end} from ${absolutePath}`);
    } else {
      res.status(200);
      res.setHeader('Content-Length', totalSize);
      console.log(`[${logPrefix}] Serving full file from ${absolutePath}`);
    }

    try {
      await pipelineAsync(readStream, res);
    } catch (error) {
      if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.warn(`[${logPrefix}] Stream closed early for ${absolutePath}: ${error.message}`);
        return true;
      }
      console.error(`[${logPrefix}] Pipeline error for ${absolutePath}:`, error.message);
      throw error;
    }

    return true;
  }

  async function streamFailureVideo(req, res, failureError) {
    const stats = await safeStat(FAILURE_VIDEO_PATH);
    if (!stats || !stats.isFile()) {
      console.error(`[FAILURE STREAM] Failure video not found at ${FAILURE_VIDEO_PATH}`);
      return false;
    }

    const emulateHead = (req.method || 'GET').toUpperCase() === 'HEAD';
    const failureMessage = failureError?.failureMessage || failureError?.message || 'NZBDav download failed';

    if (!res.headersSent) {
      res.setHeader('X-NZBDav-Failure', failureMessage);
    }

    console.warn(`[FAILURE STREAM] Serving fallback video due to NZBDav failure: ${failureMessage}`);
    return streamFileResponse(req, res, FAILURE_VIDEO_PATH, emulateHead, 'FAILURE STREAM', stats);
  }

  async function streamVideoTypeFailure(req, res, failureError) {
    const stats = await safeStat(VIDEO_TYPE_FAILURE_PATH);
    if (!stats || !stats.isFile()) {
      console.error(`[NO VIDEO STREAM] Failure video not found at ${VIDEO_TYPE_FAILURE_PATH}`);
      return false;
    }

    const emulateHead = (req.method || 'GET').toUpperCase() === 'HEAD';
    const failureMessage = failureError?.failureMessage || failureError?.message || 'NZB did not contain a playable video file';

    if (!res.headersSent) {
      res.setHeader('X-NZBDav-Failure', failureMessage);
    }

    console.warn(`[NO VIDEO STREAM] Serving fallback video (no playable files): ${failureMessage}`);
    return streamFileResponse(req, res, VIDEO_TYPE_FAILURE_PATH, emulateHead, 'NO VIDEO STREAM', stats);
  }

  async function proxyNzbdavStream(req, res, viewPath, fileNameHint = '') {
    const originalMethod = (req.method || 'GET').toUpperCase();
    if (!NZBDAV_SUPPORTED_METHODS.has(originalMethod)) {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const emulateHead = originalMethod === 'HEAD';
    const proxiedMethod = emulateHead ? 'GET' : originalMethod;

    const normalizedPath = normalizeNzbdavPath(viewPath);
    const encodedPath = normalizedPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const webdavBase = state.NZBDAV_WEBDAV_URL.replace(/\/+$/, '');
    const targetUrl = `${webdavBase}${encodedPath}`;
    const headers = {};

    console.log(`[NZBDAV] Streaming ${normalizedPath} via WebDAV`);

    const coerceToString = (value) => {
      if (Array.isArray(value)) {
        return value.find((item) => typeof item === 'string' && item.trim().length > 0) || '';
      }
      return typeof value === 'string' ? value : '';
    };

    let derivedFileName = typeof fileNameHint === 'string' ? fileNameHint.trim() : '';
    if (!derivedFileName) {
      const segments = normalizedPath.split('/').filter(Boolean);
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        try {
          derivedFileName = decodeURIComponent(lastSegment);
        } catch (decodeError) {
          derivedFileName = lastSegment;
        }
      }
    }
    if (!derivedFileName) {
      derivedFileName = coerceToString(req.query?.title || '').trim();
    }
    if (!derivedFileName) {
      derivedFileName = 'stream';
    }

    const sanitizedFileName = derivedFileName.replace(/[\\/:*?"<>|]+/g, '_') || 'stream';

    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers['if-range']) headers['If-Range'] = req.headers['if-range'];
    if (req.headers.accept) headers.Accept = req.headers.accept;
    if (req.headers['accept-language']) headers['Accept-Language'] = req.headers['accept-language'];
    if (req.headers['accept-encoding']) headers['Accept-Encoding'] = req.headers['accept-encoding'];
    if (req.headers['user-agent']) headers['User-Agent'] = req.headers['user-agent'];
    if (!headers['Accept-Encoding']) headers['Accept-Encoding'] = 'identity';
    if (emulateHead && !headers.Range) {
      headers.Range = 'bytes=0-0';
    }

    let totalFileSize = null;
    if (!req.headers.range && !emulateHead) {
      const headConfig = {
        url: targetUrl,
        method: 'HEAD',
        headers: {
          'User-Agent': headers['User-Agent'] || `UsenetStreamer/${ADDON_VERSION}`
        },
        timeout: 30000,
        validateStatus: (status) => status < 500
      };

      if (state.NZBDAV_WEBDAV_USER && state.NZBDAV_WEBDAV_PASS) {
        headConfig.auth = {
          username: state.NZBDAV_WEBDAV_USER,
          password: state.NZBDAV_WEBDAV_PASS
        };
      }

      try {
        const headResponse = await axios.request(headConfig);
        const headHeadersLower = Object.keys(headResponse.headers || {}).reduce((map, key) => {
          map[key.toLowerCase()] = headResponse.headers[key];
          return map;
        }, {});
        const headContentLength = headHeadersLower['content-length'];
        if (headContentLength) {
          totalFileSize = Number(headContentLength);
          console.log(`[NZBDAV] HEAD reported total size ${totalFileSize} bytes for ${normalizedPath}`);
        }
      } catch (headError) {
        console.warn('[NZBDAV] HEAD request failed; continuing without pre-fetched size:', headError.message);
      }
    }

    const requestConfig = {
      url: targetUrl,
      method: proxiedMethod,
      headers,
      responseType: 'stream',
      timeout: NZBDAV_STREAM_TIMEOUT_MS,
      validateStatus: (status) => status < 500
    };

    if (state.NZBDAV_WEBDAV_USER && state.NZBDAV_WEBDAV_PASS) {
      requestConfig.auth = {
        username: state.NZBDAV_WEBDAV_USER,
        password: state.NZBDAV_WEBDAV_PASS
      };
    }

    console.log(`[NZBDAV] Proxying ${proxiedMethod}${emulateHead ? ' (HEAD emulation)' : ''} ${targetUrl}`);

    const nzbdavResponse = await axios.request(requestConfig);

    let responseStatus = nzbdavResponse.status;
    const responseHeadersLower = Object.keys(nzbdavResponse.headers || {}).reduce((map, key) => {
      map[key.toLowerCase()] = nzbdavResponse.headers[key];
      return map;
    }, {});

    const incomingContentRange = responseHeadersLower['content-range'];
    if (incomingContentRange && responseStatus === 200) {
      responseStatus = 206;
    }

    res.status(responseStatus);

    const headerBlocklist = new Set(['transfer-encoding', 'www-authenticate', 'set-cookie', 'cookie', 'authorization']);

    Object.entries(nzbdavResponse.headers || {}).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (headerBlocklist.has(lowerKey)) {
        return;
      }
      if (value !== undefined) {
        res.setHeader(key, value);
      }
    });

    const incomingDisposition = nzbdavResponse.headers?.['content-disposition'];
    const hasFilenameInDisposition = typeof incomingDisposition === 'string' && /filename=/i.test(incomingDisposition);
    if (!hasFilenameInDisposition) {
      res.setHeader('Content-Disposition', `inline; filename="${sanitizedFileName}"`);
    }

    const inferredMime = inferMimeType(sanitizedFileName);
    if (!res.getHeader('Content-Type') || res.getHeader('Content-Type') === 'application/octet-stream') {
      res.setHeader('Content-Type', inferredMime);
    }

    const acceptRangesHeader = res.getHeader('Accept-Ranges');
    if (!acceptRangesHeader) {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    const contentLengthHeader = res.getHeader('Content-Length');
    if (incomingContentRange) {
      const match = incomingContentRange.match(/bytes\s+(\d+)-(\d+)\s*\/\s*(\d+|\*)/i);
      if (match) {
        const start = Number(match[1]);
        const end = Number(match[2]);
        const totalSize = match[3] !== '*' ? Number(match[3]) : null;
        const chunkLength = Number.isFinite(start) && Number.isFinite(end) ? end - start + 1 : null;
        if (Number.isFinite(chunkLength) && chunkLength > 0) {
          res.setHeader('Content-Length', String(chunkLength));
        }
        if (Number.isFinite(totalSize)) {
          res.setHeader('X-Total-Length', String(totalSize));
        }
      }
    } else if ((!contentLengthHeader || Number(contentLengthHeader) === 0) && Number.isFinite(totalFileSize)) {
      res.setHeader('Content-Length', String(totalFileSize));
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Content-Type,Accept-Ranges');

    if (emulateHead || !nzbdavResponse.data || typeof nzbdavResponse.data.pipe !== 'function') {
      if (nzbdavResponse.data && typeof nzbdavResponse.data.destroy === 'function') {
        nzbdavResponse.data.destroy();
      }
      res.end();
      return;
    }

    try {
      await pipelineAsync(nzbdavResponse.data, res);
    } catch (error) {
      if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.warn('[NZBDAV] Stream closed early by client');
        return;
      }
      throw error;
    }
  }

  return {
    buildNzbdavStream,
    streamFileResponse,
    streamFailureVideo,
    streamVideoTypeFailure,
    proxyNzbdavStream,
  };
}

module.exports = {
  createNzbdavStreaming,
};
