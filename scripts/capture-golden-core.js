#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : null;
      server.close((err) => {
        if (err) return reject(err);
        if (!port) return reject(new Error('failed to allocate free port'));
        resolve(port);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deepReplaceBaseUrl(value, baseUrl) {
  if (typeof value === 'string') {
    return value.split(baseUrl).join('{{BASE_URL}}');
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepReplaceBaseUrl(entry, baseUrl));
  }
  if (value && typeof value === 'object') {
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = deepReplaceBaseUrl(value[key], baseUrl);
    });
    return next;
  }
  return value;
}

async function waitForServer(baseUrl, timeoutMs = 15000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/manifest.json`);
      if (res.status === 200) return;
      lastError = new Error(`manifest probe returned ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError || new Error('server readiness timeout');
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const fixturesDir = path.join(repoRoot, 'tests', 'golden', 'core');
  const fixturePath = path.join(fixturesDir, 'native-baseline.json');
  const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usenetstreamer-golden-'));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn('node', ['server.js'], {
    cwd: repoRoot,
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
    if (!child.killed) child.kill('SIGTERM');
    fs.rmSync(tempConfigDir, { recursive: true, force: true });
  };

  try {
    await waitForServer(baseUrl);
    const cases = [
      { id: 'manifest', method: 'GET', path: '/manifest.json' },
      { id: 'catalog', method: 'GET', path: '/catalog/movie/nzbdav_completed.json' },
      { id: 'meta', method: 'GET', path: '/meta/movie/nzbdav:test-id.json' },
      { id: 'stream', method: 'GET', path: '/stream/movie/bad-id.json' },
    ];

    const results = [];
    for (const entry of cases) {
      const response = await fetch(`${baseUrl}${entry.path}`, { method: entry.method });
      const body = await response.json().catch(() => null);
      results.push({
        id: entry.id,
        method: entry.method,
        path: entry.path,
        status: response.status,
        body: deepReplaceBaseUrl(body, baseUrl),
      });
    }

    fs.mkdirSync(fixturesDir, { recursive: true });
    const payload = {
      fixtureVersion: 1,
      profile: 'native-baseline',
      generatedAt: new Date().toISOString(),
      baseUrl: '{{BASE_URL}}',
      env: {
        STREAMING_MODE: 'native',
        INDEXER_MANAGER: 'none',
        NEWZNAB_ENABLED: 'false',
        EASYNEWS_ENABLED: 'false',
        NZB_TRIAGE_ENABLED: 'false',
      },
      cases: results,
    };
    fs.writeFileSync(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`[golden] wrote ${path.relative(repoRoot, fixturePath)}`);
  } catch (error) {
    console.error(`[golden] capture failed: ${error?.message || error}`);
    if (stderr.trim()) {
      console.error('[golden] server stderr:');
      console.error(stderr.trim());
    }
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(`[golden] fatal: ${error?.message || error}`);
  process.exit(1);
});
