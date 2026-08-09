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

  test('exits 1 when --fail-on-duplicates is combined with --ui', () => {
    const result = runCli(['--fail-on-duplicates', '--ui']);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /--fail-on-duplicates cannot be combined with --ui/);
  });

  test('exits 1 when --port is used without --ui', () => {
    const result = runCli(['--port', '3000']);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /--port can only be used with --ui/);
  });

  test('exits 1 when --port has an invalid value', () => {
    for (const bad of ['abc', '0', '70000', '3.5']) {
      const result = runCli(['--ui', `--port=${bad}`]);
      assert.strictEqual(result.status, 1, `port ${bad} should be rejected`);
      assert.match(result.stderr, /Port must be an integer between 1 and 65535/);
    }
  });

  test('exits 1 when --port is missing its value', () => {
    const result = runCli(['--ui', '--port']);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /--port requires a value/);
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
      // 99 rather than a value just above the pair's actual score: the two
      // bodies differ only by a trailing `+ 1`, and normalization keeps their
      // shared const/return skeleton, so they land in the low 90s.
      const result = runCli([tmpDir, '99']);
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

    test('console output clusters pairs into groups with a match-type label', () => {
      const result = runCli([tmpDir, '70']);
      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /in \d+ groups?:/);
      assert.match(result.stdout, /📦 Group #1 - \d+ functions - Similarity: [\d.]+%/);
      assert.match(result.stdout, /\((exact copies|structural)\)/);
      assert.match(result.stdout, /Summary: \d+ duplicate groups? \(\d+ function pairs?\)/);
    });

    test('--json includes groups with similarity range and matchType', () => {
      const parsed = JSON.parse(runCli([tmpDir, '70', '--json']).stdout);

      assert.ok(Array.isArray(parsed.groups));
      assert.ok(parsed.groups.length >= 1);
      const group = parsed.groups[0];
      assert.ok(group.functions.length >= 2);
      assert.strictEqual(typeof group.similarity.min, 'number');
      assert.strictEqual(typeof group.similarity.max, 'number');
      assert.ok(group.similarity.min <= group.similarity.max);
      assert.strictEqual(typeof group.pairCount, 'number');
      assert.ok(['exact', 'structural'].includes(group.matchType));

      // Pairs are also labeled individually
      assert.ok(['exact', 'structural'].includes(parsed.duplicates[0].matchType));
    });

    test('--json reports an empty duplicates array when nothing matches', () => {
      const result = runCli([tmpDir, '99', '--json']);
      assert.strictEqual(result.status, 0);
      const parsed = JSON.parse(result.stdout);
      assert.deepStrictEqual(parsed.duplicates, []);
    });

    test('--fail-on-duplicates exits 1 when duplicates are found', () => {
      const result = runCli([tmpDir, '70', '--fail-on-duplicates']);
      assert.strictEqual(result.status, 1);
      assert.match(result.stdout, /Found \d+ pairs? of similar functions/);
    });

    test('--fail-on-duplicates exits 0 when nothing matches', () => {
      const result = runCli([tmpDir, '99', '--fail-on-duplicates']);
      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /No duplicate functions found/);
    });

    test('--fail-on-duplicates combined with --json still prints valid JSON before exiting 1', () => {
      const result = runCli([tmpDir, '70', '--json', '--fail-on-duplicates']);
      assert.strictEqual(result.status, 1);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.duplicates.length >= 1);
    });

    test('teardown: remove temp dir', () => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('--exclude and --min-length', () => {
    let tmpDir;

    test('setup: create temp dir with a duplicate inside a vendor/ subdirectory', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-duplicates-flags-test-'));
      fs.mkdirSync(path.join(tmpDir, 'vendor'));
      fs.writeFileSync(
        path.join(tmpDir, 'main.js'),
        'function first(x, y) { const total = x + y; return total; }\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'vendor', 'copy.js'),
        'function second(a, b) { const total = a + b; return total; }\n'
      );
    });

    test('--exclude skips the named directory', () => {
      const withVendor = JSON.parse(runCli([tmpDir, '70', '--json']).stdout);
      assert.strictEqual(withVendor.filesScanned, 2);
      assert.ok(withVendor.duplicates.length >= 1);

      const excluded = JSON.parse(runCli([tmpDir, '70', '--json', '--exclude', 'vendor']).stdout);
      assert.strictEqual(excluded.filesScanned, 1);
      assert.deepStrictEqual(excluded.duplicates, []);
    });

    test('--exclude accepts comma-separated names and the --exclude=... form', () => {
      const excluded = JSON.parse(runCli([tmpDir, '70', '--json', '--exclude=vendor,unrelated']).stdout);
      assert.strictEqual(excluded.filesScanned, 1);
    });

    test('--exclude with no usable names errors', () => {
      const result = runCli([tmpDir, '70', '--exclude', ',']);
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /--exclude must list at least one directory name/);
    });

    test('--min-length filters tiny functions out of the comparison', () => {
      const all = JSON.parse(runCli([tmpDir, '70', '--json']).stdout);
      assert.strictEqual(all.totalFunctions, 2);

      const filtered = JSON.parse(runCli([tmpDir, '70', '--json', '--min-length', '100']).stdout);
      assert.strictEqual(filtered.totalFunctions, 0);
      assert.deepStrictEqual(filtered.duplicates, []);
    });

    test('--min-length rejects invalid values', () => {
      for (const bad of ['abc', '-1', '3.5']) {
        const result = runCli([tmpDir, '70', '--min-length', bad]);
        assert.strictEqual(result.status, 1, `min-length ${bad} should be rejected`);
        assert.match(result.stderr, /--min-length must be a non-negative integer/);
      }
    });

    test('--json output is stamped with a schema and tool version', () => {
      const parsed = JSON.parse(runCli([tmpDir, '70', '--json']).stdout);
      assert.strictEqual(parsed.schemaVersion, 1);
      assert.strictEqual(parsed.tool.name, 'find-duplicate-js');
      assert.strictEqual(parsed.tool.version, pkgVersion);
    });

    test('--output writes the report to a file instead of stdout', () => {
      const target = path.join(tmpDir, 'report.json');
      const result = runCli([tmpDir, '70', '--json', '--output', target]);

      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /Report written to/);
      // The point of the flag: stdout carries the confirmation, not the report.
      assert.strictEqual(result.stdout.includes('"duplicates"'), false);

      const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
      assert.ok(parsed.duplicates.length >= 1);
      fs.rmSync(target, { force: true });
    });

    test('--output works for the human-readable report too', () => {
      const target = path.join(tmpDir, 'report.txt');
      const result = runCli([tmpDir, '70', '--output', target]);

      assert.strictEqual(result.status, 0);
      const report = fs.readFileSync(target, 'utf8');
      assert.match(report, /Found \d+ pairs? of similar functions/);
      fs.rmSync(target, { force: true });
    });

    test('--output reports an unwritable destination instead of failing silently', () => {
      const result = runCli([tmpDir, '70', '--json', '--output', path.join(tmpDir, 'no-such-dir', 'r.json')]);
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /Could not write to/);
    });

    test('--output cannot be combined with --ui', () => {
      const result = runCli([tmpDir, '--ui', '--output', 'r.json']);
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /--output cannot be combined with --ui/);
    });

    test('--gitignore skips files git would ignore', () => {
      const ignoredDir = path.join(tmpDir, 'generated');
      fs.mkdirSync(ignoredDir, { recursive: true });
      fs.writeFileSync(path.join(ignoredDir, 'c.js'), 'function addNumbers(x, y) { const total = x + y; return total; }\n');
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'generated/\n');

      try {
        const without = JSON.parse(runCli([tmpDir, '70', '--json']).stdout);
        const with_ = JSON.parse(runCli([tmpDir, '70', '--json', '--gitignore']).stdout);
        assert.strictEqual(without.filesScanned, 3);
        assert.strictEqual(with_.filesScanned, 2);
      } finally {
        fs.rmSync(ignoredDir, { recursive: true, force: true });
        fs.rmSync(path.join(tmpDir, '.gitignore'), { force: true });
      }
    });

    test('a config file supplies defaults and flags override them', () => {
      const configPath = path.join(tmpDir, 'fd.json');
      fs.writeFileSync(configPath, JSON.stringify({ directory: tmpDir, threshold: 95, minLength: 4 }));

      try {
        const fromConfig = JSON.parse(runCli(['--json', '--config', configPath]).stdout);
        assert.strictEqual(fromConfig.threshold, 95);

        // An explicit positional threshold beats the configured one.
        const overridden = JSON.parse(runCli([tmpDir, '70', '--json', '--config', configPath]).stdout);
        assert.strictEqual(overridden.threshold, 70);
      } finally {
        fs.rmSync(configPath, { force: true });
      }
    });

    test('.findduplicaterc.json is picked up from the working directory', () => {
      const configPath = path.join(tmpDir, '.findduplicaterc.json');
      fs.writeFileSync(configPath, JSON.stringify({ threshold: 93 }));

      try {
        const parsed = JSON.parse(runCli(['--json'], { cwd: tmpDir }).stdout);
        assert.strictEqual(parsed.threshold, 93);
      } finally {
        fs.rmSync(configPath, { force: true });
      }
    });

    test('a config file with an unknown key is rejected rather than ignored', () => {
      const configPath = path.join(tmpDir, 'typo.json');
      fs.writeFileSync(configPath, JSON.stringify({ minLenght: 5 }));

      try {
        const result = runCli([tmpDir, '--config', configPath]);
        assert.strictEqual(result.status, 1);
        assert.match(result.stderr, /Unknown key in/);
        assert.match(result.stderr, /minLenght/);
      } finally {
        fs.rmSync(configPath, { force: true });
      }
    });

    test('a missing --config file is a hard error', () => {
      const result = runCli([tmpDir, '--config', path.join(tmpDir, 'absent.json')]);
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /does not exist/);
    });

    test('a malformed config file is a hard error', () => {
      const configPath = path.join(tmpDir, 'broken.json');
      fs.writeFileSync(configPath, '{ not json');

      try {
        const result = runCli([tmpDir, '--config', configPath]);
        assert.strictEqual(result.status, 1);
        assert.match(result.stderr, /Could not parse config file/);
      } finally {
        fs.rmSync(configPath, { force: true });
      }
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

  test('exits 1 when --port has an invalid value', () => {
    const result = spawnSync(process.execPath, [uiCliPath, '--port=abc'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Port must be an integer between 1 and 65535/);
  });

  test('exits 1 with a friendly message when the port is already in use', async () => {
    const { createServer } = await import('node:net');
    const blocker = createServer();
    // Port 0 lets the OS pick a free port; the UI bin then collides with it.
    // The blocker binds 127.0.0.1 because that is the only interface the UI
    // server listens on - binding the wildcard instead does not reliably
    // collide with a loopback-specific bind on Windows.
    await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
    const busyPort = blocker.address().port;

    try {
      const result = spawnSync(
        process.execPath,
        [uiCliPath, '--port', String(busyPort), '.'],
        { encoding: 'utf8', timeout: 10000 }
      );
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, new RegExp(`Port ${busyPort} is already in use`));
    } finally {
      blocker.close();
    }
  });
});
