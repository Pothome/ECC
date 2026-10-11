'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SOURCE = 'manifests/install-assets/commonjs-scripts-package.json';
const key = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
const markerPath = root => path.join(root, 'scripts', 'package.json');
const isScriptBoundary = (operation, root) => operation.kind === 'copy-file'
  && operation.sourceRelativePath === SOURCE && key(operation.destinationPath) === key(markerPath(root));

// A nested package owns its own module scope. Symlinks and uncertain trees are
// preserved conservatively rather than followed while deciding scope changes.
function scopedJavaScriptFiles(directory, { nested = false, depth = 0 } = {}) {
  if (depth > 40) throw new Error('OpenCode scripts tree exceeds the safe inspection depth');
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe OpenCode scripts directory: ${directory}`);
  const packageStat = fs.lstatSync(path.join(directory, 'package.json'), { throwIfNoEntry: false });
  if (nested && packageStat?.isFile()) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unsafe OpenCode scripts symlink: ${file}`);
    if (entry.isDirectory()) files.push(...scopedJavaScriptFiles(file, { nested: true, depth: depth + 1 }));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.js')) files.push(file);
    if (files.length > 12000) throw new Error('OpenCode scripts tree exceeds the safe inspection count');
  }
  return files;
}

function assertScriptBoundary(plan, { readFile, previousOperations = [], writtenDestinations = new Set(), expectedContent }) {
  if (plan.adapter?.target !== 'opencode'
    || !plan.operations.some(operation => isScriptBoundary(operation, plan.targetRoot))) return;
  const marker = markerPath(plan.targetRoot);
  const content = readFile(marker);
  if (content !== null) {
    const metadata = JSON.parse(content.toString('utf8'));
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
      || (metadata.type !== undefined && metadata.type !== 'commonjs')) {
      throw new Error(`Refusing OpenCode CommonJS runtime migration: preserve the existing user module boundary at ${marker}.`);
    }
    // Existing user-owned CommonJS metadata is skipped by the ownership guard;
    // retaining its bytes does not change anyone's module interpretation.
    return;
  }
  const previous = new Map(previousOperations.filter(operation => operation.ownership === 'managed')
    .map(operation => [key(operation.destinationPath), operation]));
  const written = new Set([...writtenDestinations].map(key));
  const planned = new Map(plan.operations.map(operation => [key(operation.destinationPath), operation]));
  for (const file of scopedJavaScriptFiles(path.dirname(marker))) {
    const operation = previous.get(key(file));
    const bytes = readFile(file);
    const expected = written.has(key(file))
      ? expectedContent(planned.get(key(file))) : null;
    const digest = bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex');
    const expectedDigest = expected === null
      ? operation?.contentSha256 : crypto.createHash('sha256').update(expected).digest('hex');
    if (!expectedDigest || digest !== expectedDigest) {
      throw new Error(`Refusing OpenCode CommonJS runtime migration: unowned or edited JavaScript at ${file} would change module scope. Give user scripts their own package.json scope before retrying.`);
    }
  }
}

function retainScriptBoundary(operation, targetRoot) {
  if (!isScriptBoundary(operation, targetRoot)) return false;
  try { return scopedJavaScriptFiles(path.dirname(operation.destinationPath)).length > 0; }
  catch { return true; }
}

module.exports = { assertScriptBoundary, isScriptBoundary, retainScriptBoundary };
