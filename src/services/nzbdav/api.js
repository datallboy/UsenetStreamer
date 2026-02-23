const axios = require('axios');
const FormData = require('form-data');
const cache = require('../../cache');
const { normalizeReleaseTitle } = require('../../utils/parsers');
const { sleep } = require('../../utils/helpers');
const {
  NZBDAV_API_TIMEOUT_MS,
  NZBDAV_HISTORY_TIMEOUT_MS,
} = require('./constants');

function createNzbdavApi({
  state,
  ensureNzbdavConfigured,
  buildNzbdavApiParams,
  extractNzbdavQueueId,
}) {
  async function addNzbToNzbdav({ downloadUrl, cachedEntry = null, category, jobLabel }) {
    ensureNzbdavConfigured();

    if (!category) {
      throw new Error('Missing NZBDav category');
    }
    if (!downloadUrl && !cachedEntry) {
      throw new Error('Missing NZB source');
    }

    const jobLabelDisplay = jobLabel || 'untitled';
    if (cachedEntry?.payloadBuffer) {
      try {
        console.log(`[NZBDAV] Queueing cached NZB payload via addfile (${jobLabelDisplay})`);
        const form = new FormData();
        const uploadName = cache.buildVerifiedNzbFileName(cachedEntry, jobLabel);
        form.append('nzbfile', cachedEntry.payloadBuffer, {
          filename: uploadName,
          contentType: 'application/x-nzb+xml'
        });

        const headers = {
          ...form.getHeaders(),
        };
        if (state.NZBDAV_API_KEY) {
          headers['x-api-key'] = state.NZBDAV_API_KEY;
        }

        const params = buildNzbdavApiParams('addfile', {
          cat: category,
          nzbname: jobLabel || undefined,
          output: 'json'
        });

        const response = await axios.post(`${state.NZBDAV_URL}/api`, form, {
          params,
          timeout: NZBDAV_API_TIMEOUT_MS,
          headers,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: (status) => status < 500,
        });

        if (!response.data?.status) {
          const errorMessage = response.data?.error || `addfile returned status ${response.status}`;
          throw new Error(errorMessage);
        }

        const nzoId = extractNzbdavQueueId(response.data);
        if (!nzoId) {
          throw new Error('addfile succeeded but no nzo_id returned');
        }

        console.log(`[NZBDAV] NZB queued with id ${nzoId} (uploaded payload)`);
        return { nzoId };
      } catch (error) {
        if (!downloadUrl) {
          throw new Error(`[NZBDAV] Failed to upload cached NZB: ${error.message}`);
        }
        console.warn(`[NZBDAV] addfile failed, falling back to addurl: ${error.message}`);
      }
    }

    if (!downloadUrl) {
      throw new Error('Unable to queue NZB: no download URL available');
    }

    console.log(`[NZBDAV] Queueing NZB via addurl for category=${category} (${jobLabelDisplay})`);

    const params = buildNzbdavApiParams('addurl', {
      name: downloadUrl,
      cat: category,
      nzbname: jobLabel || undefined,
      output: 'json'
    });

    const headers = {};
    if (state.NZBDAV_API_KEY) {
      headers['x-api-key'] = state.NZBDAV_API_KEY;
    }

    const response = await axios.get(`${state.NZBDAV_URL}/api`, {
      params,
      timeout: NZBDAV_API_TIMEOUT_MS,
      headers,
      validateStatus: (status) => status < 500
    });

    if (!response.data?.status) {
      const errorMessage = response.data?.error || `addurl returned status ${response.status}`;
      throw new Error(`[NZBDAV] Failed to queue NZB: ${errorMessage}`);
    }

    const nzoId = extractNzbdavQueueId(response.data);

    if (!nzoId) {
      throw new Error('[NZBDAV] addurl succeeded but no nzo_id returned');
    }

    console.log(`[NZBDAV] NZB queued with id ${nzoId}`);
    return { nzoId };
  }

  async function waitForNzbdavHistorySlot(nzoId, category) {
    ensureNzbdavConfigured();
    const deadline = Date.now() + state.NZBDAV_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const params = buildNzbdavApiParams('history', {
        start: '0',
        limit: '50',
        category
      });

      const headers = {};
      if (state.NZBDAV_API_KEY) {
        headers['x-api-key'] = state.NZBDAV_API_KEY;
      }

      const response = await axios.get(`${state.NZBDAV_URL}/api`, {
        params,
        timeout: NZBDAV_HISTORY_TIMEOUT_MS,
        headers,
        validateStatus: (status) => status < 500
      });

      if (!response.data?.status) {
        const errorMessage = response.data?.error || `history returned status ${response.status}`;
        throw new Error(`[NZBDAV] Failed to query history: ${errorMessage}`);
      }

      const history = response.data?.history || response.data?.History;
      const slots = history?.slots || history?.Slots || [];
      const slot = slots.find((entry) => {
        const entryId = entry?.nzo_id || entry?.nzoId || entry?.NzoId;
        return entryId === nzoId;
      });

      if (slot) {
        const status = (slot.status || slot.Status || '').toString().toLowerCase();
        if (status === 'completed') {
          console.log(`[NZBDAV] NZB ${nzoId} completed in ${category}`);
          return slot;
        }
        if (status === 'failed') {
          const failMessage = slot.fail_message || slot.failMessage || slot.FailMessage || 'Unknown NZBDav error';
          const failureError = new Error(`[NZBDAV] NZB failed: ${failMessage}`);
          failureError.isNzbdavFailure = true;
          failureError.failureMessage = failMessage;
          failureError.nzoId = nzoId;
          failureError.category = category;
          throw failureError;
        }
      }

      await sleep(state.NZBDAV_POLL_INTERVAL_MS);
    }

    throw new Error('[NZBDAV] Timeout while waiting for NZB to become streamable');
  }

  async function fetchCompletedNzbdavHistory(categories = [], limitOverride = null) {
    ensureNzbdavConfigured();
    const categoryList = Array.isArray(categories) && categories.length > 0
      ? Array.from(new Set(categories.filter((value) => value !== undefined && value !== null && String(value).trim() !== '')))
      : [null];

    const effectiveLimit = Number.isFinite(limitOverride) && limitOverride > 0
      ? Math.floor(limitOverride)
      : state.NZBDAV_HISTORY_FETCH_LIMIT;

    const results = new Map();

    for (const category of categoryList) {
      try {
        const params = buildNzbdavApiParams('history', {
          start: '0',
          limit: String(effectiveLimit),
          category: category || undefined
        });

        const headers = {};
        if (state.NZBDAV_API_KEY) {
          headers['x-api-key'] = state.NZBDAV_API_KEY;
        }

        const response = await axios.get(`${state.NZBDAV_URL}/api`, {
          params,
          timeout: NZBDAV_HISTORY_TIMEOUT_MS,
          headers,
          validateStatus: (status) => status < 500
        });

        if (!response.data?.status) {
          const errorMessage = response.data?.error || `history returned status ${response.status}`;
          throw new Error(errorMessage);
        }

        const history = response.data?.history || response.data?.History;
        const slots = history?.slots || history?.Slots || [];

        for (const slot of slots) {
          const status = (slot?.status || slot?.Status || '').toString().toLowerCase();
          if (status !== 'completed') {
            continue;
          }

          const jobName = slot?.job_name || slot?.JobName || slot?.name || slot?.Name || slot?.nzb_name || slot?.NzbName;
          const nzoId = slot?.nzo_id || slot?.nzoId || slot?.NzoId;
          if (!jobName || !nzoId) {
            continue;
          }

          const normalized = normalizeReleaseTitle(jobName);
          if (!normalized) {
            continue;
          }

          if (!results.has(normalized)) {
            results.set(normalized, {
              nzoId,
              jobName,
              category: slot?.category || slot?.Category || category || null,
              size: slot?.size || slot?.Size || null,
              slot
            });
          }
        }
      } catch (error) {
        console.warn(`[NZBDAV] Failed to fetch history for category ${category || 'all'}: ${error.message}`);
      }
    }

    return results;
  }

  return {
    addNzbToNzbdav,
    waitForNzbdavHistorySlot,
    fetchCompletedNzbdavHistory,
  };
}

module.exports = {
  createNzbdavApi,
};
