#!/usr/bin/env node

const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close((err) => {
        if (err) return reject(err);
        if (!port) return reject(new Error('Unable to resolve ephemeral port'));
        resolve(port);
      });
    });
  });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(baseUrl, timeoutMs) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/manifest.json`);
      if (res.status === 200) {
        return;
      }
      lastError = new Error(`manifest probe returned ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError || new Error('Timed out waiting for server readiness');
}

function shapeOk(body, shapeCheck) {
  if (!shapeCheck) return true;
  return shapeCheck(body);
}

async function runChecks(baseUrl) {
  const checks = [
    {
      name: 'manifest',
      url: `${baseUrl}/manifest.json`,
      expectedStatus: 200,
      shapeCheck: (body) => body && Array.isArray(body.resources) && body.id && body.name,
    },
    {
      name: 'catalog',
      url: `${baseUrl}/catalog/movie/nzbdav_completed.json`,
      expectedStatus: 404,
      shapeCheck: (body) => body && Array.isArray(body.metas),
    },
    {
      name: 'meta',
      url: `${baseUrl}/meta/movie/nzbdav:test-id.json`,
      expectedStatus: 404,
      shapeCheck: (body) => body && Object.prototype.hasOwnProperty.call(body, 'meta'),
    },
    {
      name: 'stream',
      url: `${baseUrl}/stream/movie/bad-id.json`,
      expectedStatus: 400,
      shapeCheck: (body) => body && typeof body.error === 'string',
    },
  ];

  const results = [];
  for (const check of checks) {
    let status = 0;
    let body = null;
    let pass = false;
    let detail = '';
    try {
      const response = await fetch(check.url);
      status = response.status;
      body = await response.json().catch(() => null);
      const statusOk = status === check.expectedStatus;
      const bodyOk = shapeOk(body, check.shapeCheck);
      pass = statusOk && bodyOk;
      detail = statusOk ? 'status ok' : `expected ${check.expectedStatus}, got ${status}`;
      if (statusOk && !bodyOk) {
        detail = 'status ok, response shape check failed';
      }
    } catch (error) {
      detail = error?.message || String(error);
    }
    results.push({
      ...check,
      status,
      pass,
      detail,
      body,
    });
  }
  return results;
}

function printResults(results) {
  let passCount = 0;
  for (const result of results) {
    const marker = result.pass ? 'PASS' : 'FAIL';
    if (result.pass) passCount += 1;
    console.log(`[smoke] ${marker} ${result.name} (${result.status || 'no-status'}) - ${result.detail}`);
  }
  console.log(`[smoke] Summary: ${passCount}/${results.length} checks passed`);
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usenetstreamer-smoke-'));

  const child = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      ADDON_BASE_URL: baseUrl,
      STREAMING_MODE: 'native',
      INDEXER_MANAGER: 'none',
      NEWZNAB_ENABLED: 'false',
      EASYNEWS_ENABLED: 'false',
      NZB_TRIAGE_ENABLED: 'false',
      CONFIG_DIR: tempConfigDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const cleanup = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    fs.rmSync(tempConfigDir, { recursive: true, force: true });
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  try {
    await waitForReady(baseUrl, 15000);
    const results = await runChecks(baseUrl);
    printResults(results);
    const failed = results.filter((item) => !item.pass);
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[smoke] FAIL startup - ${error?.message || error}`);
    if (stderr.trim()) {
      console.error('[smoke] server stderr:');
      console.error(stderr.trim());
    }
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(`[smoke] FAIL fatal - ${error?.message || error}`);
  process.exit(1);
});
