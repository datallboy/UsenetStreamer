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

async function captureHttpFixture(repoRoot, fixtureConfig) {
  const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), `usenetstreamer-golden-${fixtureConfig.profile}-`));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn('node', ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ADDON_BASE_URL: baseUrl,
      CONFIG_DIR: tempConfigDir,
      ...fixtureConfig.env,
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
    const results = [];
    for (const entry of fixtureConfig.cases) {
      const response = await fetch(`${baseUrl}${entry.path}`, { method: entry.method || 'GET' });
      const body = await response.json().catch(() => null);
      results.push({
        id: entry.id,
        method: entry.method || 'GET',
        path: entry.path,
        status: response.status,
        body: deepReplaceBaseUrl(body, baseUrl),
      });
    }

    const fixturePath = path.join(repoRoot, 'tests', 'golden', 'core', `${fixtureConfig.profile}.json`);
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });

    const payload = {
      fixtureVersion: 2,
      fixtureType: 'http-endpoints',
      profile: fixtureConfig.profile,
      generatedAt: new Date().toISOString(),
      baseUrl: '{{BASE_URL}}',
      env: fixtureConfig.env,
      cases: results,
    };

    fs.writeFileSync(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`[golden] wrote ${path.relative(repoRoot, fixturePath)}`);
  } catch (error) {
    console.error(`[golden] capture failed for profile ${fixtureConfig.profile}: ${error?.message || error}`);
    if (stderr.trim()) {
      console.error('[golden] server stderr:');
      console.error(stderr.trim());
    }
    throw error;
  } finally {
    cleanup();
  }
}

function normalizeDecisionMap(decisions) {
  return Array.from(decisions.entries())
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

async function captureTriageFixture(repoRoot) {
  const scenarios = [
    {
      id: 'empty-candidates',
      description: 'No NZB candidates should produce empty decisions.',
      input: [],
      options: {
        timeBudgetMs: 500,
        maxCandidates: 5,
      },
    },
    {
      id: 'fetch-error-single',
      description: 'Unreachable NZB URL should produce fetch-error decision.',
      input: [
        {
          title: 'Unreachable NZB',
          downloadUrl: 'http://127.0.0.1:1/unreachable.nzb',
          size: 1024,
          indexerId: 'fixture-indexer',
        },
      ],
      options: {
        timeBudgetMs: 5000,
        downloadTimeoutMs: 100,
        maxCandidates: 1,
        downloadConcurrency: 1,
      },
    },
    {
      id: 'timeout-yields-pending',
      description: 'Immediate time budget timeout should produce timeout + pending outcomes.',
      input: [
        {
          title: 'Timeout Candidate A',
          downloadUrl: 'http://127.0.0.1:1/timeout-a.nzb',
          size: 2048,
          indexerId: 'fixture-indexer-a',
        },
        {
          title: 'Timeout Candidate B',
          downloadUrl: 'http://127.0.0.1:1/timeout-b.nzb',
          size: 2047,
          indexerId: 'fixture-indexer-b',
        },
      ],
      options: {
        timeBudgetMs: 0,
        downloadTimeoutMs: 100,
        maxCandidates: 2,
        downloadConcurrency: 1,
      },
    },
  ];

  const cases = [];
  for (const scenario of scenarios) {
    const outcome = await triageAndRank(scenario.input, scenario.options);
    cases.push({
      id: scenario.id,
      description: scenario.description,
      input: scenario.input,
      options: scenario.options,
      expected: normalizeTriageOutcome(outcome),
    });
  }

  const fixturePath = path.join(repoRoot, 'tests', 'golden', 'triage', 'runner-baseline.json');
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });

  const payload = {
    fixtureVersion: 1,
    fixtureType: 'triage-outcomes',
    profile: 'runner-baseline',
    generatedAt: new Date().toISOString(),
    cases,
  };

  fs.writeFileSync(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[golden] wrote ${path.relative(repoRoot, fixturePath)}`);
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');

  const httpFixtures = [
    {
      profile: 'native-baseline',
      env: {
        STREAMING_MODE: 'native',
        INDEXER_MANAGER: 'none',
        NEWZNAB_ENABLED: 'false',
        EASYNEWS_ENABLED: 'false',
        NZB_TRIAGE_ENABLED: 'false',
      },
      cases: [
        { id: 'manifest', method: 'GET', path: '/manifest.json' },
        { id: 'catalog', method: 'GET', path: '/catalog/movie/nzbdav_completed.json' },
        { id: 'meta', method: 'GET', path: '/meta/movie/nzbdav:test-id.json' },
        { id: 'stream-invalid-id', method: 'GET', path: '/stream/movie/bad-id.json' },
        { id: 'easynews-disabled', method: 'GET', path: '/easynews/nzb' },
        { id: 'nzbdav-stream-missing-params', method: 'GET', path: '/nzb/stream' },
      ],
    },
    {
      profile: 'nzbdav-error-baseline',
      env: {
        STREAMING_MODE: 'nzbdav',
        INDEXER_MANAGER: 'none',
        NEWZNAB_ENABLED: 'false',
        EASYNEWS_ENABLED: 'false',
        NZB_TRIAGE_ENABLED: 'false',
        NZBDAV_URL: '',
        NZBDAV_API_KEY: '',
        NZBDAV_WEBDAV_URL: '',
      },
      cases: [
        { id: 'manifest', method: 'GET', path: '/manifest.json' },
        { id: 'catalog-nzbdav-missing-config', method: 'GET', path: '/catalog/movie/nzbdav_completed.json' },
        { id: 'meta-nzbdav-missing-config', method: 'GET', path: '/meta/movie/nzbdav:test-id.json' },
      ],
    },
  ];

  try {
    for (const fixtureConfig of httpFixtures) {
      await captureHttpFixture(repoRoot, fixtureConfig);
    }
    await captureTriageFixture(repoRoot);
  } catch (error) {
    console.error(`[golden] fatal: ${error?.message || error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[golden] fatal: ${error?.message || error}`);
  process.exit(1);
});
