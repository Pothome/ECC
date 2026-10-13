'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`  PASS ${name}\n`);
    passed += 1;
  } catch (error) {
    process.stdout.write(`  FAIL ${name}: ${error.message}\n`);
    failed += 1;
  }
}

process.stdout.write('\nSkill plugin-root script invocation tests:\n\n');

test('tdd-workflow resolves the package-manager detector through CLAUDE_PLUGIN_ROOT', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'tdd-workflow', 'SKILL.md'), 'utf8');
  assert.match(skill, /node "\$\{CLAUDE_PLUGIN_ROOT:-\$PWD\}\/scripts\/setup-package-manager\.js" --detect/);
  assert.doesNotMatch(skill, /^\s*node scripts\/setup-package-manager\.js --detect$/m);
});

test('autonomous-loops resolves claw.js through CLAUDE_PLUGIN_ROOT', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'autonomous-loops', 'SKILL.md'), 'utf8');
  assert.match(skill, /node "\$\{CLAUDE_PLUGIN_ROOT:-\$PWD\}\/scripts\/claw\.js"/);
  assert.match(skill, /CLAW_SESSION=my-project CLAW_SKILLS=tdd-workflow,security-review node "\$\{CLAUDE_PLUGIN_ROOT:-\$PWD\}\/scripts\/claw\.js"/);
  assert.doesNotMatch(skill, /^\s*node scripts\/claw\.js$/m);
});

test('dmux-workflows resolves orchestrate-worktrees.js through CLAUDE_PLUGIN_ROOT', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'dmux-workflows', 'SKILL.md'), 'utf8');
  assert.match(skill, /node "\$\{CLAUDE_PLUGIN_ROOT:-\$PWD\}\/scripts\/orchestrate-worktrees\.js" plan\.json --execute/);
  assert.doesNotMatch(skill, /^\s*node scripts\/orchestrate-worktrees\.js/m);
});

test('seedPaths examples stay relative to the user repository', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'dmux-workflows', 'SKILL.md'), 'utf8');
  assert.match(skill, /"scripts\/orchestrate-worktrees\.js"/);
});

test('sync seeds missing profile files but preserves user-edited profiles', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'tdd-workflow', 'SKILL.md'), 'utf8');
  assert.match(skill, /CLAUDE_PLUGIN_ROOT:-\$PWD/);
  const sync = fs.readFileSync(path.join(repoRoot, 'scripts', 'sync-ecc-to-codex.sh'), 'utf8');
  assert.match(sync, /if \[\[ -f "\$CODEX_HOME\/\$profile\.config\.toml" \]\]/);
  assert.match(sync, /log "Preserving existing \$profile\.config\.toml/);
});

process.stdout.write(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
process.exitCode = failed ? 1 : 0;
