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

function deepReplaceBaseUrl(value, baseUrl) {
  if (typeof value === 'string') {
    return value.split(baseUrl).join('{{BASE_URL}}');
  }
  if (Array.isArray(value)) return value.map((entry) => deepReplaceBaseUrl(entry, baseUrl));
  if (value && typeof value === 'object') {
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = deepReplaceBaseUrl(value[key], baseUrl);
    });
    return next;
  }
  return value;
}

function collectDiffs(expected, actual, pointer = '$', diffs = []) {
  if (expected === actual) return diffs;
  const expectedIsObject = expected && typeof expected === 'object';
  const actualIsObject = actual && typeof actual === 'object';

  if (!expectedIsObject || !actualIsObject) {
    diffs.push(`${pointer}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    return diffs;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    const expectedArray = Array.isArray(expected) ? expected : [];
    const actualArray = Array.isArray(actual) ? actual : [];
    if (expectedArray.length !== actualArray.length) {
      diffs.push(`${pointer}.length: expected ${expectedArray.length} but got ${actualArray.length}`);
    }
    const max = Math.max(expectedArray.length, actualArray.length);
    for (let i = 0; i < max; i += 1) {
      collectDiffs(expectedArray[i], actualArray[i], `${pointer}[${i}]`, diffs);
    }
    return diffs;
  }

  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      diffs.push(`${pointer}.${key}: unexpected key in actual payload`);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(actual, key)) {
      diffs.push(`${pointer}.${key}: missing key in actual payload`);
      continue;
    }
    collectDiffs(expected[key], actual[key], `${pointer}.${key}`, diffs);
  }
  return diffs;
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const fixturePath = path.join(repoRoot, 'tests', 'golden', 'core', 'native-baseline.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usenetstreamer-golden-check-'));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn('node', ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ADDON_BASE_URL: baseUrl,
      STREAMING_MODE: fixture.env?.STREAMING_MODE || 'native',
      INDEXER_MANAGER: fixture.env?.INDEXER_MANAGER || 'none',
      NEWZNAB_ENABLED: fixture.env?.NEWZNAB_ENABLED || 'false',
      EASYNEWS_ENABLED: fixture.env?.EASYNEWS_ENABLED || 'false',
      NZB_TRIAGE_ENABLED: fixture.env?.NZB_TRIAGE_ENABLED || 'false',
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
    let failures = 0;

    for (const expectedCase of fixture.cases || []) {
      const response = await fetch(`${baseUrl}${expectedCase.path}`, { method: expectedCase.method || 'GET' });
      const body = await response.json().catch(() => null);
      const normalizedBody = deepReplaceBaseUrl(body, baseUrl);
      const diffs = [];

      if (response.status !== expectedCase.status) {
        diffs.push(`$.status: expected ${expectedCase.status} but got ${response.status}`);
      }
      collectDiffs(expectedCase.body, normalizedBody, '$.body', diffs);

      if (diffs.length > 0) {
        failures += 1;
        console.error(`[golden-check] FAIL ${expectedCase.id}`);
        diffs.slice(0, 50).forEach((line) => {
          console.error(`  - ${line}`);
        });
        console.error('  expected body:', JSON.stringify(expectedCase.body, null, 2));
        console.error('  actual body  :', JSON.stringify(normalizedBody, null, 2));
      } else {
        console.log(`[golden-check] PASS ${expectedCase.id}`);
      }
    }

    if (failures > 0) {
      console.error(`[golden-check] ${failures} fixture case(s) mismatched`);
      process.exitCode = 1;
    } else {
      console.log('[golden-check] All fixture cases matched');
    }
  } catch (error) {
    console.error(`[golden-check] fatal: ${error?.message || error}`);
    if (stderr.trim()) {
      console.error('[golden-check] server stderr:');
      console.error(stderr.trim());
    }
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(`[golden-check] fatal: ${error?.message || error}`);
  process.exit(1);
});
