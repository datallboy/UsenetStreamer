#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(repoRoot, 'src');

const layers = ['routes', 'controllers', 'services', 'integrations', 'domain'];
const inspectExtensions = new Set(['.js', '.cjs', '.mjs', '.ts', '.mts', '.cts']);

const sharedTopLevel = new Set(['types', 'utils', 'config', 'middleware', 'cache']);

const allowedLayerTargets = {
  routes: new Set(['routes', 'controllers']),
  controllers: new Set(['controllers', 'services', 'domain']),
  services: new Set(['services', 'integrations', 'domain']),
  integrations: new Set(['integrations', 'domain']),
  domain: new Set(['domain']),
};

const importRegexes = [
  /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function toPosix(inputPath) {
  return inputPath.split(path.sep).join('/');
}

function isFileToInspect(filePath) {
  return inspectExtensions.has(path.extname(filePath));
}

function getLayerFromPath(absoluteFilePath) {
  const rel = toPosix(path.relative(srcRoot, absoluteFilePath));
  for (const layer of layers) {
    if (rel === layer || rel.startsWith(`${layer}/`)) {
      return layer;
    }
  }
  return null;
}

function walkDir(dirPath, collector) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, collector);
      continue;
    }
    if (entry.isFile() && isFileToInspect(fullPath)) {
      collector.push(fullPath);
    }
  }
}

function collectLayerFiles() {
  const files = [];
  for (const layer of layers) {
    walkDir(path.join(srcRoot, layer), files);
  }
  return files;
}

function extractImportSpecifiers(fileContent) {
  const specs = [];
  for (const pattern of importRegexes) {
    pattern.lastIndex = 0;
    let match = pattern.exec(fileContent);
    while (match) {
      specs.push(match[1]);
      match = pattern.exec(fileContent);
    }
  }
  return specs;
}

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.cjs`,
    `${base}.mjs`,
    `${base}.ts`,
    `${base}.mts`,
    `${base}.cts`,
    path.join(base, 'index.js'),
    path.join(base, 'index.ts'),
    path.join(base, 'index.mjs'),
    path.join(base, 'index.cjs'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function validateImport(sourceFile, sourceLayer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const resolved = resolveImport(sourceFile, specifier);
  if (!resolved) return null;

  const resolvedRel = toPosix(path.relative(srcRoot, resolved));
  if (resolvedRel.startsWith('..')) return null;

  const targetLayer = getLayerFromPath(resolved);
  if (targetLayer) {
    const allowedTargets = allowedLayerTargets[sourceLayer] || new Set([sourceLayer]);
    if (!allowedTargets.has(targetLayer)) {
      return {
        sourceFile,
        sourceLayer,
        specifier,
        resolvedRel,
        reason: `Layer "${sourceLayer}" cannot import layer "${targetLayer}"`,
      };
    }
    return null;
  }

  const topLevel = resolvedRel.split('/')[0];
  if (sharedTopLevel.has(topLevel)) return null;

  return {
    sourceFile,
    sourceLayer,
    specifier,
    resolvedRel,
    reason: `Layer "${sourceLayer}" import targets unsupported top-level path "${topLevel}"`,
  };
}

function main() {
  const files = collectLayerFiles();
  const violations = [];

  for (const filePath of files) {
    const sourceLayer = getLayerFromPath(filePath);
    if (!sourceLayer) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const specs = extractImportSpecifiers(content);
    for (const specifier of specs) {
      const violation = validateImport(filePath, sourceLayer, specifier);
      if (violation) {
        violations.push(violation);
      }
    }
  }

  if (violations.length === 0) {
    console.log(`[layers] OK (${files.length} files checked)`);
    return;
  }

  console.error(`[layers] Found ${violations.length} layer-boundary violation(s):`);
  for (const item of violations) {
    const sourceRel = toPosix(path.relative(repoRoot, item.sourceFile));
    console.error(`- ${sourceRel}: "${item.specifier}" -> src/${item.resolvedRel}`);
    console.error(`  ${item.reason}`);
  }
  process.exitCode = 1;
}

main();
