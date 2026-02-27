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
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/manifest.json`);
      if (res.status === 200) return;
    } catch (_) {
      // retry
    }
    await sleep(250);
  }
  throw new Error('server readiness timeout');
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const outputDir = path.join(repoRoot, 'docs', 'artifacts');
  const outputJson = path.join(outputDir, 'v2-latency-error-baseline.json');
  const outputMd = path.join(outputDir, 'v2-latency-error-baseline.md');

  const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usenetstreamer-latency-'));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const sampleCount = Number(process.env.BASELINE_SAMPLE_COUNT || 10);

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
    const endpoints = [
      { id: 'manifest', method: 'GET', path: '/manifest.json', expectedStatus: 200 },
      { id: 'catalog', method: 'GET', path: '/catalog/movie/nzbdav_completed.json', expectedStatus: 404 },
      { id: 'meta', method: 'GET', path: '/meta/movie/nzbdav:test-id.json', expectedStatus: 404 },
      { id: 'stream', method: 'GET', path: '/stream/movie/bad-id.json', expectedStatus: 400 },
    ];

    const metrics = [];
    for (const endpoint of endpoints) {
      const durations = [];
      let statusMismatches = 0;
      let transportErrors = 0;

      for (let i = 0; i < sampleCount; i += 1) {
        const start = process.hrtime.bigint();
        try {
          const response = await fetch(`${baseUrl}${endpoint.path}`, { method: endpoint.method });
          const end = process.hrtime.bigint();
          const durationMs = Number(end - start) / 1e6;
          durations.push(durationMs);
          if (response.status !== endpoint.expectedStatus) {
            statusMismatches += 1;
          }
        } catch (_) {
          const end = process.hrtime.bigint();
          const durationMs = Number(end - start) / 1e6;
          durations.push(durationMs);
          transportErrors += 1;
        }
      }

      const sorted = durations.slice().sort((a, b) => a - b);
      const sum = durations.reduce((acc, value) => acc + value, 0);
      metrics.push({
        endpoint: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        expectedStatus: endpoint.expectedStatus,
        sampleCount: durations.length,
        avgMs: Number((sum / Math.max(1, durations.length)).toFixed(2)),
        p50Ms: Number(percentile(sorted, 50).toFixed(2)),
        p95Ms: Number(percentile(sorted, 95).toFixed(2)),
        maxMs: Number((sorted[sorted.length - 1] || 0).toFixed(2)),
        statusMismatches,
        transportErrors,
        errorRate: Number(((statusMismatches + transportErrors) / Math.max(1, durations.length)).toFixed(4)),
      });
    }

    const payload = {
      baselineVersion: 1,
      generatedAt: new Date().toISOString(),
      profile: 'native-smoke',
      sampleCount,
      metrics,
    };

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputJson, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    const lines = [
      '# V2 Latency/Error Baseline',
      '',
      `Generated: ${payload.generatedAt}`,
      `Profile: ${payload.profile}`,
      `Sample count per endpoint: ${payload.sampleCount}`,
      '',
      '| Endpoint | Expected | Avg (ms) | P50 (ms) | P95 (ms) | Max (ms) | Error Rate |',
      '|---|---:|---:|---:|---:|---:|---:|',
    ];
    metrics.forEach((row) => {
      lines.push(
        `| ${row.endpoint} | ${row.expectedStatus} | ${row.avgMs} | ${row.p50Ms} | ${row.p95Ms} | ${row.maxMs} | ${row.errorRate} |`
      );
    });
    lines.push('');
    lines.push('Notes:');
    lines.push('- Baseline uses deterministic native profile (no external providers).');
    lines.push('- Non-200 responses for catalog/meta/stream are expected in this profile.');
    lines.push('- Treat this as a trend baseline; recapture when endpoint contracts change.');
    lines.push('');
    fs.writeFileSync(outputMd, `${lines.join('\n')}\n`, 'utf8');

    console.log(`[baseline] wrote ${path.relative(repoRoot, outputJson)}`);
    console.log(`[baseline] wrote ${path.relative(repoRoot, outputMd)}`);
  } catch (error) {
    console.error(`[baseline] capture failed: ${error?.message || error}`);
    if (stderr.trim()) {
      console.error('[baseline] server stderr:');
      console.error(stderr.trim());
    }
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(`[baseline] fatal: ${error?.message || error}`);
  process.exit(1);
});
