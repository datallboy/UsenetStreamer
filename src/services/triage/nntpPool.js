function createNntpOps({ NNTP, timingLog, isTriageActivityFresh, buildKeepAliveMessageId }) {
  let metricsAccessor = () => null;
  function setMetricsAccessor(fn) {
    metricsAccessor = typeof fn === "function" ? fn : (() => null);
  }
  function getMetrics() {
    return metricsAccessor();
  }

function statSegment(pool, segmentId) {
  if (getMetrics()) getMetrics().statCalls += 1;
  const start = Date.now();
  timingLog('nntp-stat:start', { segmentId });
  return runWithClient(pool, (client) => statSegmentWithClient(client, segmentId))
    .then((result) => {
      if (getMetrics()) getMetrics().statSuccesses += 1;
      timingLog('nntp-stat:success', { segmentId, durationMs: Date.now() - start });
      return result;
    })
    .catch((err) => {
      if (getMetrics()) {
        if (err?.code === 'STAT_MISSING' || err?.code === 430) getMetrics().statMissing += 1;
        else getMetrics().statErrors += 1;
      }
      timingLog('nntp-stat:error', {
        segmentId,
        durationMs: Date.now() - start,
        code: err?.code,
        message: err?.message,
      });
      throw err;
    })
    .finally(() => {
      if (getMetrics()) getMetrics().statDurationMs += Date.now() - start;
    });
}

function statSegmentWithClient(client, segmentId) {
  const STAT_TIMEOUT_MS = 5000; // Aggressive 5s timeout per STAT
  return new Promise((resolve, reject) => {
    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        const error = new Error('STAT timed out after 5s');
        error.code = 'STAT_TIMEOUT';
        error.dropClient = true; // Mark client as broken
        reject(error);
      }
    }, STAT_TIMEOUT_MS);

    client.stat(`<${segmentId}>`, (err) => {
      if (completed) return; // Already timed out
      completed = true;
      clearTimeout(timer);
      
      if (err) {
        const error = new Error(err.message || 'STAT failed');
        const codeFromMessage = err.message && err.message.includes('430') ? 'STAT_MISSING' : err.code;
        error.code = err.code ?? codeFromMessage;
        if (['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'EPIPE'].includes(err.code)) {
          error.dropClient = true;
        }
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function fetchSegmentBody(pool, segmentId) {
  if (getMetrics()) getMetrics().bodyCalls += 1;
  const start = Date.now();
  timingLog('nntp-body:start', { segmentId });
  return runWithClient(pool, (client) => fetchSegmentBodyWithClient(client, segmentId))
    .then((result) => {
      if (getMetrics()) getMetrics().bodySuccesses += 1;
      timingLog('nntp-body:success', { segmentId, durationMs: Date.now() - start });
      return result;
    })
    .catch((err) => {
      if (getMetrics()) {
        if (err?.code === 'BODY_MISSING') getMetrics().bodyMissing += 1;
        else getMetrics().bodyErrors += 1;
      }
      timingLog('nntp-body:error', {
        segmentId,
        durationMs: Date.now() - start,
        code: err?.code,
        message: err?.message,
      });
      throw err;
    })
    .finally(() => {
      if (getMetrics()) getMetrics().bodyDurationMs += Date.now() - start;
    });
}

function fetchSegmentBodyWithClient(client, segmentId) {
  return new Promise((resolve, reject) => {
    client.body(`<${segmentId}>`, (err, _articleNumber, _messageId, bodyBuffer) => {
      if (err) {
        const error = new Error(err.message || 'BODY failed');
        error.code = err.code ?? 'BODY_ERROR';
        if (error.code === 430) error.code = 'BODY_MISSING';
        if (['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'EPIPE'].includes(err.code)) {
          error.dropClient = true;
        }
        reject(error);
        return;
      }

      if (!bodyBuffer || bodyBuffer.length === 0) {
        const error = new Error('Empty BODY response');
        error.code = 'BODY_ERROR';
        reject(error);
        return;
      }

      resolve(bodyBuffer);
    });
  });
}

async function createNntpPool(config, maxConnections, options = {}) {
  const numeric = Number.isFinite(maxConnections) ? Math.floor(maxConnections) : 1;
  const connectionCount = Math.max(1, numeric);
  const keepAliveMs = Number.isFinite(options.keepAliveMs) && options.keepAliveMs > 0 ? options.keepAliveMs : 0;

  const attachErrorHandler = (client) => {
    if (!client) return;
    try {
      client.on('error', (err) => {
        console.warn('[NZB TRIAGE] NNTP client error (pool)', {
          code: err?.code,
          message: err?.message,
          errno: err?.errno,
        });
      });
    } catch (_) {}
    try {
      const socketFields = ['socket', 'stream', '_socket', 'tlsSocket', 'connection'];
      for (const key of socketFields) {
        const s = client[key];
        if (s && typeof s.on === 'function') {
          s.on('error', (err) => {
            console.warn('[NZB TRIAGE] NNTP socket error (pool)', {
              socketProp: key,
              code: err?.code,
              message: err?.message,
              errno: err?.errno,
            });
          });
        }
      }
    } catch (_) {}
  };

  const connectTasks = Array.from({ length: connectionCount }, () => createNntpClient(config));
  let initialClients = [];
  try {
    const settled = await Promise.allSettled(connectTasks);
    const successes = settled.filter((entry) => entry.status === 'fulfilled').map((entry) => entry.value);
    const failure = settled.find((entry) => entry.status === 'rejected');
    if (failure) {
      await Promise.all(successes.map(closeNntpClient));
      throw failure.reason;
    }
    initialClients = successes;
    initialClients.forEach(attachErrorHandler);
  } catch (err) {
    throw err;
  }

  const idle = initialClients.slice();
  const waiters = [];
  const allClients = new Set(initialClients);
  let closing = false;
  let lastUsed = Date.now();
  let keepAliveTimer = null;

  const touch = () => {
    lastUsed = Date.now();
  };

  const attemptReplacement = () => {
    if (closing) return;
    (async () => {
      try {
        const replacement = await createNntpClient(config);
        attachErrorHandler(replacement);
        allClients.add(replacement);
        if (waiters.length > 0) {
          const waiter = waiters.shift();
          touch();
          waiter(replacement);
        } else {
          idle.push(replacement);
          touch();
        }
      } catch (createErr) {
        console.warn('[NZB TRIAGE] Failed to create replacement NNTP client', createErr?.message || createErr);
        if (!closing) {
          setTimeout(attemptReplacement, 1000);
        }
      }
    })();
  };

  const scheduleReplacement = (client) => {
    if (client) {
      allClients.delete(client);
      (async () => {
        try {
          await closeNntpClient(client);
        } catch (closeErr) {
          console.warn('[NZB TRIAGE] Failed to close NNTP client cleanly', closeErr?.message || closeErr);
        }
        attemptReplacement();
      })();
    } else {
      attemptReplacement();
    }
  };

  const noopTimers = new Map();
  const KEEPALIVE_INTERVAL_MS = 30000;
  const KEEPALIVE_TIMEOUT_MS = 6000;

  const scheduleKeepAlive = (client) => {
    if (closing || noopTimers.has(client)) return;
    if (!isTriageActivityFresh()) return;
    const timer = setTimeout(async () => {
      noopTimers.delete(client);
      if (!isTriageActivityFresh()) return;
      try {
        const statStart = Date.now();
        const keepAliveMessageId = buildKeepAliveMessageId();
        await Promise.race([
          new Promise((resolve, reject) => {
            client.stat(keepAliveMessageId, (err) => {
              if (err && err.code === 430) {
                resolve(); // 430 = article not found, which is expected and means socket is alive
              } else if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Keep-alive timeout')), KEEPALIVE_TIMEOUT_MS))
        ]);
        const elapsed = Date.now() - statStart;
        timingLog('nntp-keepalive:success', { durationMs: elapsed });
        if (!closing && idle.includes(client) && isTriageActivityFresh()) {
          scheduleKeepAlive(client);
        }
      } catch (err) {
        timingLog('nntp-keepalive:failed', { message: err?.message });
        console.warn('[NZB TRIAGE] Keep-alive failed, replacing client', err?.message || err);
        const idleIndex = idle.indexOf(client);
        if (idleIndex !== -1) {
          idle.splice(idleIndex, 1);
        }
        scheduleReplacement(client);
      }
    }, KEEPALIVE_INTERVAL_MS);
    noopTimers.set(client, timer);
  };

  const cancelKeepAlive = (client) => {
    const timer = noopTimers.get(client);
    if (timer) {
      clearTimeout(timer);
      noopTimers.delete(client);
    }
  };

  const releaseClient = (client, drop) => {
    if (!client) return;
    if (drop) {
      cancelKeepAlive(client);
      scheduleReplacement(client);
      return;
    }
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      touch();
      waiter(client);
    } else {
      idle.push(client);
      touch();
      scheduleKeepAlive(client);
    }
  };

  const acquireClient = () => new Promise((resolve, reject) => {
    if (closing) {
      reject(new Error('NNTP pool closing'));
      return;
    }
    if (idle.length > 0) {
      const client = idle.pop();
      cancelKeepAlive(client);
      touch();
      resolve(client);
    } else {
      waiters.push(resolve);
    }
  });

  if (keepAliveMs > 0) {
    keepAliveTimer = setInterval(() => {
      if (closing) return;
      if (!isTriageActivityFresh()) return;
      if (Date.now() - lastUsed < keepAliveMs) return;
      if (waiters.length > 0) return;
      if (idle.length === 0) return;
      const client = idle.pop();
      if (!client) return;
      scheduleReplacement(client);
      touch();
    }, keepAliveMs);
    if (typeof keepAliveTimer.unref === 'function') keepAliveTimer.unref();
  }

  return {
    size: connectionCount,
    acquire: acquireClient,
    release(client, options = {}) {
      const drop = Boolean(options.drop);
      releaseClient(client, drop);
    },
    async close() {
      closing = true;
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
      }
      noopTimers.forEach((timer) => clearTimeout(timer));
      noopTimers.clear();
      const clientsToClose = Array.from(allClients);
      allClients.clear();
      idle.length = 0;
      waiters.splice(0, waiters.length).forEach((resolve) => resolve(null));
      await Promise.all(clientsToClose.map((client) => closeNntpClient(client)));
    },
    touch,
    getLastUsed() {
      return lastUsed;
    },
    getIdleCount() {
      return idle.length;
    },
  };
}

async function runWithClient(pool, handler) {
  if (!pool) throw new Error('NNTP pool unavailable');
  const acquireStart = Date.now();
  const client = await pool.acquire();
  timingLog('nntp-client:acquired', {
    waitDurationMs: Date.now() - acquireStart,
  });
  if (getMetrics()) getMetrics().clientAcquisitions += 1;
  if (!client) throw new Error('NNTP client unavailable');
  let dropClient = false;
  try {
    return await handler(client);
  } catch (err) {
    if (err?.dropClient) dropClient = true;
    throw err;
  } finally {
    pool.release(client, { drop: dropClient });
  }
}

function decodeYencBuffer(bodyBuffer, maxBytes) {
  const out = Buffer.alloc(maxBytes);
  let writeIndex = 0;
  const lines = bodyBuffer.toString('binary').split('\r\n');
  let decoding = false;

  for (const line of lines) {
    if (!decoding) {
      if (line.startsWith('=ybegin')) decoding = true;
      continue;
    }

    if (line.startsWith('=ypart')) continue;
    if (line.startsWith('=yend')) break;

    const src = Buffer.from(line, 'binary');
    for (let i = 0; i < src.length; i += 1) {
      let byte = src[i];
      if (byte === 0x3D) { // '=' escape
        i += 1;
        if (i >= src.length) break;
        byte = (src[i] - 64) & 0xff;
      }
      byte = (byte - 42) & 0xff;
      out[writeIndex] = byte;
      writeIndex += 1;
      if (writeIndex >= maxBytes) return out;
    }
  }

  if (writeIndex === 0) {
    const error = new Error('No yEnc payload detected');
    error.code = 'DECODE_ERROR';
    throw error;
  }

  return out.slice(0, writeIndex);
}

async function createNntpClient({ host, port = 119, user, pass, useTLS = false, connTimeout }) {
  if (!NNTP) throw new Error('NNTP client unavailable');

  const client = new NNTP();
  const connectStart = Date.now();
  timingLog('nntp-connect:start', { host, port, useTLS, auth: Boolean(user) });
  
  // Attach early error handler to catch DNS/connection failures before 'ready'
  const earlyErrorHandler = (err) => {
    timingLog('nntp-connect:error', {
      host,
      port,
      useTLS,
      auth: Boolean(user),
      durationMs: Date.now() - connectStart,
      code: err?.code,
      message: err?.message,
    });
    console.warn('[NZB TRIAGE] NNTP connection error', {
      host,
      port,
      useTLS,
      message: err?.message,
      code: err?.code
    });
  };
  
  client.once('error', earlyErrorHandler);
  
  await new Promise((resolve, reject) => {
    client.once('ready', () => {
      // Remove the early error handler since we're about to add persistent ones
      client.removeListener('error', earlyErrorHandler);
      
      timingLog('nntp-connect:ready', {
        host,
        port,
        useTLS,
        auth: Boolean(user),
        durationMs: Date.now() - connectStart,
      });
      // Attach a runtime error handler to the client to prevent unhandled socket errors
      // from bubbling up and crashing the process. We log and let pool replacement
      // logic handle any broken clients.
      try {
        client.on('error', (err) => {
          timingLog('nntp-client:error', {
            host,
            port,
            useTLS,
            auth: Boolean(user),
            message: err?.message,
            code: err?.code,
          });
          console.warn('[NZB TRIAGE] NNTP client runtime error', err?.message || err);
        });
      } catch (_) {}
      try {
        // attach to a few common socket field names used by different NNTP implementations
        const socketFields = ['socket', 'stream', '_socket', 'tlsSocket', 'connection'];
        for (const key of socketFields) {
          const s = client[key];
          if (s && typeof s.on === 'function') {
            s.on('error', (err) => {
              timingLog('nntp-socket:error', { host, port, socketProp: key, message: err?.message, code: err?.code });
              console.warn('[NZB TRIAGE] NNTP socket runtime error', key, err?.message || err);
            });
          }
        }
      } catch (_) {}
      resolve();
    });
    // This error handler is for connection phase failures (DNS, TLS handshake, auth)
    // It will be removed and replaced with persistent handlers after 'ready'
    client.once('error', (err) => {
      reject(err);
    });
    
    // Intercept socket creation to attach error handlers immediately
    const originalConnect = client.connect;
    client.connect = function(...args) {
      const result = originalConnect.apply(this, args);
      // After connect() is called, the socket should exist
      process.nextTick(() => {
        try {
          const socketFields = ['socket', 'stream', '_socket', 'tlsSocket', 'connection'];
          for (const key of socketFields) {
            const s = client[key];
            if (s && typeof s.on === 'function' && !s.listenerCount('error')) {
              s.on('error', earlyErrorHandler);
            }
          }
        } catch (_) {}
      });
      return result;
    };
    
    client.connect({
      host,
      port,
      secure: useTLS,
      user,
      password: pass,
      connTimeout,
    });
  });
  return client;
}

function closeNntpClient(client) {
  return new Promise((resolve) => {
    const finalize = () => {
      client.removeListener('end', finalize);
      client.removeListener('close', finalize);
      client.removeListener('error', finalize);
      resolve();
    };

    client.once('end', finalize);
    client.once('close', finalize);
    client.once('error', finalize);
    try {
      client.end();
    } catch (_) {
      finalize();
      return;
    }
    setTimeout(finalize, 1000);
  });
}


  return {
    setMetricsAccessor,
    statSegment,
    statSegmentWithClient,
    fetchSegmentBody,
    fetchSegmentBodyWithClient,
    createNntpPool,
    runWithClient,
    decodeYencBuffer,
    createNntpClient,
    closeNntpClient,
  };
}

module.exports = {
  createNntpOps,
};
