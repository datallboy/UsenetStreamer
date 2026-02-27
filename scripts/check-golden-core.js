#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { triageAndRank } = require('../src/services/triage/runner');

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

function normalizeDecisionMap(decisions) {
  return Array.from((decisions || new Map()).entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([downloadUrl, decision]) => ({
      downloadUrl,
      status: decision?.status || null,
      blockers: Array.isArray(decision?.blockers) ? decision.blockers.slice() : [],
      warnings: Array.isArray(decision?.warnings) ? decision.warnings.slice() : [],
    }));
}

function normalizeTriageOutcome(outcome) {
  return {
    timedOut: Boolean(outcome?.timedOut),
    candidatesConsidered: Number.isFinite(outcome?.candidatesConsidered) ? outcome.candidatesConsidered : 0,
    evaluatedCount: Number.isFinite(outcome?.evaluatedCount) ? outcome.evaluatedCount : 0,
    fetchFailures: Number.isFinite(outcome?.fetchFailures) ? outcome.fetchFailures : 0,
    decisions: normalizeDecisionMap(outcome?.decisions || new Map()),
  };
}

async function verifyHttpFixture(repoRoot, fixturePath) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), `usenetstreamer-golden-check-${fixture.profile || 'profile'}-`));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn('node', ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ADDON_BASE_URL: baseUrl,
      CONFIG_DIR: tempConfigDir,
      ...(fixture.env || {}),
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

  let failures = 0;
  try {
    await waitForServer(baseUrl);

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
        console.error(`[golden-check] FAIL ${fixture.profile}/${expectedCase.id}`);
        diffs.slice(0, 50).forEach((line) => {
          console.error(`  - ${line}`);
        });
        console.error('  expected body:', JSON.stringify(expectedCase.body, null, 2));
        console.error('  actual body  :', JSON.stringify(normalizedBody, null, 2));
      } else {
        console.log(`[golden-check] PASS ${fixture.profile}/${expectedCase.id}`);
      }
    }
  } catch (error) {
    failures += 1;
    console.error(`[golden-check] FAIL ${fixture.profile} startup - ${error?.message || error}`);
    if (stderr.trim()) {
      console.error('[golden-check] server stderr:');
      console.error(stderr.trim());
    }
  } finally {
    cleanup();
  }

  return failures;
}

async function verifyTriageFixture(repoRoot, fixturePath) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  let failures = 0;

  for (const triageCase of fixture.cases || []) {
    const outcome = await triageAndRank(triageCase.input || [], triageCase.options || {});
    const normalized = normalizeTriageOutcome(outcome);
    const diffs = collectDiffs(triageCase.expected, normalized, '$', []);

    if (diffs.length > 0) {
      failures += 1;
      console.error(`[golden-check] FAIL triage/${triageCase.id}`);
      diffs.slice(0, 50).forEach((line) => {
        console.error(`  - ${line}`);
      });
      console.error('  expected:', JSON.stringify(triageCase.expected, null, 2));
      console.error('  actual  :', JSON.stringify(normalized, null, 2));
    } else {
      console.log(`[golden-check] PASS triage/${triageCase.id}`);
    }
  }

  return failures;
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const endpointFixturesDir = path.join(repoRoot, 'tests', 'golden', 'core');
  const endpointFixturePaths = fs.readdirSync(endpointFixturesDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(endpointFixturesDir, name));

  const triageFixturePath = path.join(repoRoot, 'tests', 'golden', 'triage', 'runner-baseline.json');

  let totalFailures = 0;

  for (const fixturePath of endpointFixturePaths) {
    totalFailures += await verifyHttpFixture(repoRoot, fixturePath);
  }

  if (fs.existsSync(triageFixturePath)) {
    totalFailures += await verifyTriageFixture(repoRoot, triageFixturePath);
  } else {
    totalFailures += 1;
    console.error('[golden-check] Missing triage fixture: tests/golden/triage/runner-baseline.json');
  }

  if (totalFailures > 0) {
    console.error(`[golden-check] ${totalFailures} fixture case(s) mismatched`);
    process.exitCode = 1;
  } else {
    console.log('[golden-check] All fixture cases matched');
  }
}

main().catch((error) => {
  console.error(`[golden-check] fatal: ${error?.message || error}`);
  process.exit(1);
});
