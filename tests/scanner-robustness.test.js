import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findJsFiles, findDuplicates } from '../src/core/find-duplicates-core.js';
import { createProgressReporter } from '../src/core/find-duplicates-progress.js';

describe('findJsFiles survives a hostile directory tree', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-duplicates-walk-'));
    fs.mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'sub', 'x.js'), 'function a() { return 1; }\n');
  });

  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('a symlink pointing at an ancestor does not recurse forever', (t) => {
    try {
      fs.symlinkSync(tmpDir, path.join(tmpDir, 'sub', 'back'), 'dir');
    } catch {
      t.skip('symlinks are not available in this environment');
      return;
    }

    // Before the visited-realpath check this walked sub/back/sub/back/... until
    // the process died on ELOOP, taking the whole scan with it.
    const files = findJsFiles(tmpDir);
    assert.deepStrictEqual(
      files.map(file => path.relative(tmpDir, file).split(path.sep).join('/')),
      ['sub/x.js']
    );
  });

  test('a broken symlink is skipped rather than thrown on', (t) => {
    const link = path.join(tmpDir, 'sub', 'dangling');
    try {
      fs.symlinkSync(path.join(tmpDir, 'does-not-exist'), link, 'dir');
    } catch {
      t.skip('symlinks are not available in this environment');
      return;
    }

    assert.doesNotThrow(() => findJsFiles(tmpDir));
    fs.rmSync(link, { force: true });
  });

  test('a directory that fails to read warns and the rest of the scan continues', () => {
    const locked = path.join(tmpDir, 'locked');
    fs.mkdirSync(locked, { recursive: true });

    // The failure is injected rather than produced with chmod so the behavior
    // is covered on every platform: Windows does not enforce POSIX directory
    // permissions at all, and root ignores them. What matters is that readdir
    // throwing for one directory does not cost us the other files.
    const realReaddirSync = fs.readdirSync;
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);
    fs.readdirSync = (target, ...rest) => {
      if (path.resolve(String(target)) === path.resolve(locked)) {
        const error = new Error(`EACCES: permission denied, scandir '${locked}'`);
        error.code = 'EACCES';
        throw error;
      }
      return realReaddirSync(target, ...rest);
    };

    try {
      const files = findJsFiles(tmpDir);
      assert.ok(
        files.some(file => file.endsWith('x.js')),
        'files outside the unreadable directory should still be found'
      );
      assert.ok(
        warnings.some(warning => /Skipping unreadable directory/.test(warning)),
        'the skipped directory should be reported'
      );
    } finally {
      fs.readdirSync = realReaddirSync;
      console.warn = originalWarn;
      fs.rmSync(locked, { recursive: true, force: true });
    }
  });

  test('a directory made unreadable by permissions is skipped', (t) => {
    const locked = path.join(tmpDir, 'locked-perms');
    fs.mkdirSync(locked, { recursive: true });
    fs.chmodSync(locked, 0o000);

    // Windows has no POSIX directory permissions and root ignores them, so
    // probe whether the chmod actually took effect instead of guessing from
    // the platform. Where it did not, the injected-failure test above is the
    // coverage; this one only adds the end-to-end confirmation.
    let enforced = false;
    try {
      fs.readdirSync(locked);
    } catch {
      enforced = true;
    }
    if (!enforced) {
      fs.chmodSync(locked, 0o755);
      fs.rmSync(locked, { recursive: true, force: true });
      t.skip('directory permissions are not enforced in this environment');
      return;
    }

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);

    try {
      const files = findJsFiles(tmpDir);
      assert.ok(
        files.some(file => file.endsWith('x.js')),
        'files outside the unreadable directory should still be found'
      );
      assert.ok(
        warnings.some(warning => /Skipping unreadable directory/.test(warning)),
        'the skipped directory should be reported'
      );
    } finally {
      console.warn = originalWarn;
      fs.chmodSync(locked, 0o755);
      fs.rmSync(locked, { recursive: true, force: true });
    }
  });
});

describe('findDuplicates progress reporting', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-duplicates-progress-'));
    fs.writeFileSync(path.join(tmpDir, 'a.js'), 'function one(x) { const t = x + 1; return t; }\n');
    fs.writeFileSync(path.join(tmpDir, 'b.js'), 'function two(y) { const t = y + 1; return t; }\n');
  });

  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('onProgress is called for both phases and reaches the total', () => {
    const events = [];
    findDuplicates(tmpDir, 70, null, { onProgress: event => events.push(event) });

    const parse = events.filter(event => event.phase === 'parse');
    const compare = events.filter(event => event.phase === 'compare');

    assert.ok(parse.length > 0, 'expected parse progress');
    assert.ok(compare.length > 0, 'expected compare progress');
    assert.strictEqual(parse.at(-1).current, parse.at(-1).total);
    assert.strictEqual(compare.at(-1).current, compare.at(-1).total);
  });

  test('results are identical whether or not progress is reported', () => {
    const withProgress = findDuplicates(tmpDir, 70, null, { onProgress: () => {} });
    const withoutProgress = findDuplicates(tmpDir, 70);
    assert.strictEqual(withProgress.duplicates.length, withoutProgress.duplicates.length);
    assert.strictEqual(withProgress.totalFunctions, withoutProgress.totalFunctions);
  });
});

describe('createProgressReporter', () => {
  test('returns null when stderr is not a TTY', () => {
    // A carriage-return animation in a redirected CI log is thousands of junk
    // lines, so progress has to stay off unless a human is watching.
    assert.strictEqual(createProgressReporter({ stream: { isTTY: false, write() {} } }), null);
  });

  test('paints to a TTY stream and erases the line when done', () => {
    const written = [];
    const stream = { isTTY: true, write: (chunk) => written.push(chunk) };
    const reporter = createProgressReporter({ stream });

    assert.ok(reporter, 'expected a reporter for a TTY stream');
    reporter.onProgress({ phase: 'parse', current: 3, total: 3 });
    assert.match(written.join(''), /Parsing files: 3\/3 \(100%\)/);

    reporter.done();
    // The final write must leave the cursor at the start of a blank line so
    // the report that follows is not printed on top of the progress text.
    assert.match(written.at(-1), /^\r {2,}\r$/);
  });

  test('the last update of a phase is never throttled away', () => {
    const written = [];
    const stream = { isTTY: true, write: (chunk) => written.push(chunk) };
    const reporter = createProgressReporter({ stream });

    reporter.onProgress({ phase: 'compare', current: 1, total: 900 });
    reporter.onProgress({ phase: 'compare', current: 2, total: 900 });
    reporter.onProgress({ phase: 'compare', current: 900, total: 900 });

    assert.match(written.join(''), /Comparing functions: 900\/900 \(100%\)/);
  });
});
