#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const layerRoots = [
  'src/routes',
  'src/controllers',
  'src/services',
  'src/integrations',
  'src/domain',
];
const allowlistPath = path.join(repoRoot, 'config', 'layer-js-allowlist.json');

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function collectJsFiles(dirPath, files) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && path.extname(entry.name) === '.js') {
      files.push(toPosix(path.relative(repoRoot, fullPath)));
    }
  }
}

function loadAllowlist() {
  if (!fs.existsSync(allowlistPath)) {
    throw new Error(`Missing allowlist file: ${path.relative(repoRoot, allowlistPath)}`);
  }
  const raw = fs.readFileSync(allowlistPath, 'utf8');
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed.allowlist) ? parsed.allowlist : [];
  return new Set(entries.map((value) => toPosix(String(value).trim())).filter(Boolean));
}

function main() {
  const allowlist = loadAllowlist();
  const files = [];
  layerRoots.forEach((relativeDir) => {
    collectJsFiles(path.join(repoRoot, relativeDir), files);
  });

  files.sort();
  const violations = files.filter((file) => !allowlist.has(file));
  if (violations.length > 0) {
    console.error('[layer-js-guard] Found non-allowlisted .js file(s) in layered paths:');
    violations.forEach((file) => {
      console.error(`- ${file}`);
    });
    console.error('[layer-js-guard] Add approved exceptions to config/layer-js-allowlist.json.');
    process.exit(1);
  }

  console.log(`[layer-js-guard] OK (${files.length} layered .js files checked)`);
}

main();
