import { test, describe } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const cliPath = path.join(repoRoot, 'find-duplicates.js');
const uiCliPath = path.join(repoRoot, 'src', 'ui', 'find-duplicates-ui.js');
const pkgVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', ...options });
}

describe('find-duplicates.js CLI', () => {
  test('--version prints the package version and exits 0', () => {
    const result = runCli(['--version']);
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), pkgVersion);
  });

  test('-v prints the package version and exits 0', () => {
    const result = runCli(['-v']);
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), pkgVersion);
  });

  test('--help prints usage and exits 0', () => {
    const result = runCli(['--help']);
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /Usage: find-duplicate/);
    assert.match(result.stdout, /--json/);
  });

  test('-h prints usage and exits 0', () => {
    const result = runCli(['-h']);
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /Usage: find-duplicate/);
  });

  test('exits 1 with an error when the directory does not exist', () => {
    const missingDir = path.join(os.tmpdir(), 'find-duplicates-does-not-exist-' + Date.now());
    const result = runCli([missingDir]);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /does not exist/);
  });

  test('exits 1 when the threshold is not a number', () => {
    const result = runCli(['.', 'abc']);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Threshold must be a number between 1 and 100/);
  });

  test('exits 1 when the threshold is out of range', () => {
    for (const bad of ['0', '101', '-5']) {
      const result = runCli(['.', bad]);
      assert.strictEqual(result.status, 1, `threshold ${bad} should be rejected`);
      assert.match(result.stderr, /Threshold must be a number between 1 and 100/);
    }
  });

  test('exits 1 when --json is combined with --ui', () => {
    const result = runCli(['--json', '--ui']);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /--json cannot be combined with --ui/);
  });

  test('exits 1 for a missing directory even with --ui (validates before starting the server)', () => {
    const missingDir = path.join(os.tmpdir(), 'find-duplicates-does-not-exist-ui-' + Date.now());
    const result = runCli(['--ui', missingDir]);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /does not exist/);
  });

  describe('scanning a real directory', () => {
    let tmpDir;

    test('setup: create temp dir with duplicate functions', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-duplicates-cli-test-'));
      fs.writeFileSync(
        path.join(tmpDir, 'a.js'),
        'function addNumbers(x, y) { const total = x + y; return total; }\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'b.js'),
        'function sumValues(a, b) { const total = a + b; return total + 1; }\n'
      );
    });

    test('reports duplicate functions and exits 0', () => {
      const result = runCli([tmpDir, '70']);
      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /Found \d+ pairs? of similar functions/);
    });

    test('reports no duplicates above the pair\'s similarity score', () => {
      const result = runCli([tmpDir, '90']);
      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /No duplicate functions found/);
    });

    test('defaults to the current working directory when none is given', () => {
      const result = runCli([], { cwd: tmpDir });
      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /Searching for duplicate code/);
    });

    test('--json prints valid machine-readable results with no decorative output', () => {
      const result = runCli([tmpDir, '70', '--json']);
      assert.strictEqual(result.status, 0);

      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.threshold, 70);
      assert.strictEqual(parsed.filesScanned, 2);
      assert.ok(parsed.totalFunctions >= 2);
      assert.ok(Array.isArray(parsed.duplicates));
      assert.ok(parsed.duplicates.length >= 1);

      const dup = parsed.duplicates[0];
      assert.strictEqual(typeof dup.similarity, 'number');
      for (const func of [dup.func1, dup.func2]) {
        assert.strictEqual(typeof func.name, 'string');
        assert.strictEqual(typeof func.file, 'string');
        assert.strictEqual(typeof func.line, 'number');
      }
    });

    test('--json reports an empty duplicates array when nothing matches', () => {
      const result = runCli([tmpDir, '99', '--json']);
      assert.strictEqual(result.status, 0);
      const parsed = JSON.parse(result.stdout);
      assert.deepStrictEqual(parsed.duplicates, []);
    });

    test('teardown: remove temp dir', () => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});

describe('find-duplicate-ui bin (src/ui/find-duplicates-ui.js)', () => {
  test('exits 1 with an error when the directory does not exist', () => {
    const missingDir = path.join(os.tmpdir(), 'find-duplicates-ui-does-not-exist-' + Date.now());
    const result = spawnSync(process.execPath, [uiCliPath, missingDir], { encoding: 'utf8' });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /does not exist/);
  });

  test('--help prints usage and exits 0 without starting the server', () => {
    const result = spawnSync(process.execPath, [uiCliPath, '--help'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /Usage: find-duplicate-ui/);
  });
});
