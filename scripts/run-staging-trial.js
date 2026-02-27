#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(sorted, p) {
  if (!Array.isArray(sorted) || sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

function readRuntimeSecret(runtimePath) {
  try {
    const raw = fs.readFileSync(runtimePath, 'utf8');
    const parsed = JSON.parse(raw);
    const secret = (parsed && parsed.ADDON_SHARED_SECRET) ? String(parsed.ADDON_SHARED_SECRET).trim() : '';
    return secret;
  } catch (_) {
    return '';
  }
}

function normalizeBody(value, baseUrl) {
  if (typeof value === 'string') {
    return value.split(baseUrl).join('{{BASE_URL}}');
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeBody(entry, baseUrl));
  }
  if (value && typeof value === 'object') {
    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = normalizeBody(value[key], baseUrl);
    });
    return next;
  }
  return value;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseSampleCases() {
  const raw = (process.env.STAGING_TRIAL_STREAM_IDS || '').trim();
  if (!raw) return [];

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(':');
      if (idx <= 0 || idx >= entry.length - 1) return null;
      const type = entry.slice(0, idx).trim().toLowerCase();
      const id = entry.slice(idx + 1).trim();
      if (!type || !id) return null;
      return {
        id: `stream-sample-${type}`,
        path: `/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`,
      };
    })
    .filter(Boolean);
}

function makeCases() {
  const baseCases = [
    { id: 'manifest', path: '/manifest.json' },
    { id: 'catalog', path: '/catalog/movie/nzbdav_completed.json' },
    { id: 'meta', path: '/meta/movie/nzbdav:test-id.json' },
    { id: 'stream-invalid-id', path: '/stream/movie/bad-id.json' },
    { id: 'easynews-nzb', path: '/easynews/nzb' },
    { id: 'nzb-stream-missing-params', path: '/nzb/stream' },
  ];

  const selectedCaseIds = (process.env.STAGING_TRIAL_CASES || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const selectedSet = selectedCaseIds.length > 0 ? new Set(selectedCaseIds) : null;
  const filteredBase = selectedSet
    ? baseCases.filter((trialCase) => selectedSet.has(trialCase.id))
    : baseCases;

  return filteredBase.concat(parseSampleCases());
}

async function requestJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json,*/*;q=0.8',
      },
    });
    const durationMs = Date.now() - started;
    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_) {
      body = text;
    }

    return {
      ok: true,
      status: response.status,
      durationMs,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      durationMs: Date.now() - started,
      body: { error: error?.message || String(error) },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runCaseForService(service, trialCase, samples, timeoutMs) {
  const durations = [];
  let failures = 0;
  let representative = null;

  for (let i = 0; i < samples; i += 1) {
    const tokenSegment = service.secret ? `/${encodeURIComponent(service.secret)}` : '';
    const url = `${service.baseUrl}${tokenSegment}${trialCase.path}`;
    const result = await requestJson(url, timeoutMs);

    durations.push(result.durationMs);
    if (!result.ok) failures += 1;
    if (!representative) {
      representative = {
        status: result.status,
        body: normalizeBody(result.body, service.baseUrl),
      };
    }

    await sleep(25);
  }

  const sorted = durations.slice().sort((a, b) => a - b);
  return {
    caseId: trialCase.id,
    path: trialCase.path,
    samples,
    avgMs: average(sorted),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted[sorted.length - 1] || 0,
    failureRate: Number((failures / samples).toFixed(3)),
    representative,
  };
}

function evaluateLatencyThreshold(baselineP95, candidateP95) {
  const allowed = Math.max(40, baselineP95 * 2);
  return {
    pass: candidateP95 <= allowed,
    allowed,
  };
}

function compareCase(baseline, candidate) {
  const baselineReachable = baseline.representative.status !== -1;
  const candidateReachable = candidate.representative.status !== -1;
  const statusMatches = baseline.representative.status === candidate.representative.status;
  const bodyMatches = deepEqual(baseline.representative.body, candidate.representative.body);
  const transportHealthy = baselineReachable && candidateReachable;
  const failureRatePass = candidate.failureRate <= (baseline.failureRate + 0.1);
  const latency = evaluateLatencyThreshold(baseline.p95Ms, candidate.p95Ms);

  return {
    caseId: baseline.caseId,
    transportHealthy,
    statusMatches,
    bodyMatches,
    failureRatePass,
    latencyPass: latency.pass,
    baselineStatus: baseline.representative.status,
    candidateStatus: candidate.representative.status,
    baselineP95Ms: baseline.p95Ms,
    candidateP95Ms: candidate.p95Ms,
    allowedP95Ms: Number(latency.allowed.toFixed(2)),
    pass: transportHealthy && statusMatches && bodyMatches && failureRatePass && latency.pass,
  };
}

function markdownReport(payload) {
  const lines = [];
  lines.push('# V2-036 Staging Trial Report');
  lines.push('');
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push(`Samples per case: ${payload.samples}`);
  lines.push(`Result: ${payload.pass ? 'PASS' : 'FAIL'}`);
  lines.push('');

  lines.push('## Service Metrics');
  lines.push('');
  lines.push('| Service | Case | Status | Avg (ms) | P95 (ms) | Max (ms) | Failure Rate |');
  lines.push('|---|---|---:|---:|---:|---:|---:|');

  payload.metrics.forEach((serviceEntry) => {
    serviceEntry.results.forEach((result) => {
      lines.push(
        `| ${serviceEntry.serviceId} | ${result.caseId} | ${result.representative.status} | ${result.avgMs} | ${result.p95Ms} | ${result.maxMs} | ${result.failureRate} |`,
      );
    });
  });

  lines.push('');
  lines.push('## Parity Checks');
  lines.push('');
  lines.push('| Compare | Case | Transport | Status | Body | Failure Rate | Latency | Overall |');
  lines.push('|---|---|---|---|---|---|---|---|');

  payload.comparisons.forEach((comparisonGroup) => {
    comparisonGroup.checks.forEach((check) => {
      lines.push(
        `| ${comparisonGroup.name} | ${check.caseId} | ${check.transportHealthy ? 'PASS' : 'FAIL'} | ${check.statusMatches ? 'PASS' : 'FAIL'} | ${check.bodyMatches ? 'PASS' : 'FAIL'} | ${check.failureRatePass ? 'PASS' : 'FAIL'} | ${check.latencyPass ? 'PASS' : 'FAIL'} | ${check.pass ? 'PASS' : 'FAIL'} |`,
      );
    });
  });

  lines.push('');
  lines.push('## Threshold Notes');
  lines.push('');
  lines.push('- Transport connectivity must succeed for both baseline and candidate (no `fetch failed`).');
  lines.push('- Status and normalized response body must match baseline for each case.');
  lines.push('- Candidate failure rate must be <= baseline + 0.10.');
  lines.push('- Candidate P95 must be <= max(40ms, baseline P95 * 2).');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const samples = Math.max(1, Number.parseInt(process.env.STAGING_TRIAL_SAMPLES || '3', 10) || 3);
  const timeoutMs = Math.max(1000, Number.parseInt(process.env.STAGING_TRIAL_TIMEOUT_MS || '15000', 10) || 15000);
  const cases = makeCases();

  const services = [
    {
      serviceId: 'v1',
      baseUrl: process.env.STAGING_TRIAL_V1_URL || 'http://127.0.0.1:17001',
      runtimePath: path.join(repoRoot, 'out', 'staging', 'v1', 'config', 'runtime-env.json'),
    },
    {
      serviceId: 'v2-legacy',
      baseUrl: process.env.STAGING_TRIAL_V2_LEGACY_URL || 'http://127.0.0.1:17002',
      runtimePath: path.join(repoRoot, 'out', 'staging', 'v2-legacy', 'config', 'runtime-env.json'),
    },
    {
      serviceId: 'v2-enabled',
      baseUrl: process.env.STAGING_TRIAL_V2_URL || 'http://127.0.0.1:17003',
      runtimePath: path.join(repoRoot, 'out', 'staging', 'v2', 'config', 'runtime-env.json'),
    },
  ].map((service) => ({
    ...service,
    secret: readRuntimeSecret(service.runtimePath),
  }));

  const metrics = [];
  for (const service of services) {
    const results = [];
    for (const trialCase of cases) {
      const result = await runCaseForService(service, trialCase, samples, timeoutMs);
      results.push(result);
    }
    metrics.push({ serviceId: service.serviceId, results });
  }

  const indexByService = new Map(metrics.map((entry) => [entry.serviceId, entry]));
  const baseV1 = indexByService.get('v1');
  const v2Legacy = indexByService.get('v2-legacy');
  const v2Enabled = indexByService.get('v2-enabled');

  const v1ByCase = new Map(baseV1.results.map((entry) => [entry.caseId, entry]));
  const v2LegacyByCase = new Map(v2Legacy.results.map((entry) => [entry.caseId, entry]));
  const v2EnabledByCase = new Map(v2Enabled.results.map((entry) => [entry.caseId, entry]));

  const compareV2LegacyToV1 = cases.map((trialCase) => compareCase(v1ByCase.get(trialCase.id), v2LegacyByCase.get(trialCase.id)));
  const compareV2EnabledToLegacy = cases.map((trialCase) => compareCase(v2LegacyByCase.get(trialCase.id), v2EnabledByCase.get(trialCase.id)));

  const serviceAvailability = metrics.map((serviceEntry) => {
    const manifestResult = serviceEntry.results.find((entry) => entry.caseId === 'manifest');
    return {
      serviceId: serviceEntry.serviceId,
      manifestReachable: Boolean(manifestResult && manifestResult.representative.status !== -1),
      manifestStatus: manifestResult ? manifestResult.representative.status : -1,
      manifestFailureRate: manifestResult ? manifestResult.failureRate : 1,
      pass: Boolean(
        manifestResult
          && manifestResult.representative.status !== -1
          && manifestResult.failureRate < 1,
      ),
    };
  });

  const comparisons = [
    {
      name: 'v2-legacy vs v1',
      checks: compareV2LegacyToV1,
    },
    {
      name: 'v2-enabled vs v2-legacy',
      checks: compareV2EnabledToLegacy,
    },
  ];

  const pass = serviceAvailability.every((entry) => entry.pass)
    && comparisons.every((group) => group.checks.every((check) => check.pass));

  const payload = {
    taskId: 'V2-036',
    generatedAt: new Date().toISOString(),
    samples,
    timeoutMs,
    pass,
    cases,
    services: services.map((service) => ({
      serviceId: service.serviceId,
      baseUrl: service.baseUrl,
      authMode: service.secret ? 'token-path' : 'open',
    })),
    serviceAvailability,
    metrics,
    comparisons,
  };

  const artifactsDir = path.join(repoRoot, 'docs', 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const jsonPath = path.join(artifactsDir, 'v2-036-staging-trial.json');
  const mdPath = path.join(artifactsDir, 'v2-036-staging-trial.md');

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, markdownReport(payload), 'utf8');

  console.log(`[staging-trial] Wrote ${path.relative(repoRoot, jsonPath)}`);
  console.log(`[staging-trial] Wrote ${path.relative(repoRoot, mdPath)}`);
  console.log(`[staging-trial] Result: ${pass ? 'PASS' : 'FAIL'}`);

  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[staging-trial] fatal: ${error?.message || error}`);
  process.exit(1);
});
