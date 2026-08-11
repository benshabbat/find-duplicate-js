import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGitignoreMatcher, parseGitignore, globToRegExp } from '../src/core/find-duplicates-gitignore.js';
import { collectSourceFiles } from '../src/core/find-duplicates-core.js';

describe('globToRegExp', () => {
  test('* does not cross a path separator', () => {
    assert.strictEqual(globToRegExp('*.js').test('a.js'), true);
    assert.strictEqual(globToRegExp('*.js').test('nested/a.js'), false);
  });

  test('**/ spans any number of directory levels, including none', () => {
    const regex = globToRegExp('**/build');
    assert.strictEqual(regex.test('build'), true);
    assert.strictEqual(regex.test('a/build'), true);
    assert.strictEqual(regex.test('a/b/c/build'), true);
  });

  test('? matches exactly one non-separator character', () => {
    assert.strictEqual(globToRegExp('a?.js').test('ab.js'), true);
    assert.strictEqual(globToRegExp('a?.js').test('abc.js'), false);
  });

  test('character classes work, including glob-style negation', () => {
    assert.strictEqual(globToRegExp('[abc].js').test('b.js'), true);
    assert.strictEqual(globToRegExp('[abc].js').test('d.js'), false);
    // Glob spells this [!...]; a naive translation would hand the regex engine
    // a literal '!' and quietly match the wrong set of files.
    assert.strictEqual(globToRegExp('[!abc].js').test('d.js'), true);
    assert.strictEqual(globToRegExp('[!abc].js').test('a.js'), false);
  });

  test('regex metacharacters in a pattern are literal', () => {
    assert.strictEqual(globToRegExp('a+b.js').test('a+b.js'), true);
    assert.strictEqual(globToRegExp('a+b.js').test('aab.js'), false);
  });
});

describe('parseGitignore', () => {
  test('skips blanks and comments', () => {
    assert.strictEqual(parseGitignore('\n# a comment\n\n  \n').length, 0);
  });

  test('records negation, directory-only and anchoring', () => {
    const [plain, negated, dirOnly, anchored] = parseGitignore('a.js\n!b.js\nbuild/\nsrc/c.js\n');
    assert.strictEqual(plain.negated, false);
    assert.strictEqual(negated.negated, true);
    assert.strictEqual(dirOnly.directoryOnly, true);
    assert.strictEqual(anchored.anchored, true);
    assert.strictEqual(plain.anchored, false);
  });
});

describe('createGitignoreMatcher', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-duplicates-gitignore-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'generated'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src', 'nested'), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'generated/\n*.gen.js\n!keep.gen.js\n');
    // A nested ignore file only governs its own subtree.
    fs.writeFileSync(path.join(tmpDir, 'src', 'nested', '.gitignore'), 'local.js\n');

    for (const file of [
      'src/a.js', 'src/b.gen.js', 'src/keep.gen.js',
      'generated/c.js', 'src/nested/d.js', 'src/nested/local.js'
    ]) {
      fs.writeFileSync(path.join(tmpDir, file), 'function q() { return 1; }\n');
    }
  });

  after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('matches the same paths git does', () => {
    const matcher = createGitignoreMatcher(tmpDir);
    const ignored = (rel, isDir = false) => matcher.ignores(path.join(tmpDir, rel), isDir);

    assert.strictEqual(ignored('src/a.js'), false);
    assert.strictEqual(ignored('src/b.gen.js'), true);
    assert.strictEqual(ignored('generated', true), true);
    // A later `!` rule re-includes a path an earlier rule excluded.
    assert.strictEqual(ignored('src/keep.gen.js'), false);
  });

  test('a nested .gitignore does not leak into sibling directories', () => {
    const matcher = createGitignoreMatcher(tmpDir);
    assert.strictEqual(matcher.ignores(path.join(tmpDir, 'src', 'nested', 'local.js'), false), true);
    // Same basename, but outside the subtree that declared the rule.
    fs.writeFileSync(path.join(tmpDir, 'src', 'local.js'), 'function q() { return 1; }\n');
    assert.strictEqual(matcher.ignores(path.join(tmpDir, 'src', 'local.js'), false), false);
    fs.rmSync(path.join(tmpDir, 'src', 'local.js'));
  });

  test('paths outside the scanned root are never ignored', () => {
    const matcher = createGitignoreMatcher(path.join(tmpDir, 'src'));
    assert.strictEqual(matcher.ignores(path.join(tmpDir, 'generated', 'c.js'), false), false);
  });

  test('collectSourceFiles honours the matcher only when asked', () => {
    const withoutIgnore = collectSourceFiles(tmpDir).map(f => path.relative(tmpDir, f)).sort();
    const withIgnore = collectSourceFiles(tmpDir, { gitignore: true }).map(f => path.relative(tmpDir, f)).sort();

    assert.strictEqual(withoutIgnore.length, 6);
    assert.deepStrictEqual(
      withIgnore.map(f => f.split(path.sep).join('/')).sort(),
      ['src/a.js', 'src/keep.gen.js', 'src/nested/d.js']
    );
  });

  test('agrees with real git check-ignore', (t) => {
    const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
    if (git.status !== 0) {
      t.skip('git is not available');
      return;
    }

    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'find-duplicates-gitcheck-'));
    try {
      spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
      fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
      fs.mkdirSync(path.join(repo, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(repo, '.gitignore'), 'dist/\n*.gen.js\n!keep.gen.js\n');

      const files = ['src/a.js', 'src/b.gen.js', 'src/keep.gen.js', 'dist/c.js'];
      for (const file of files) {
        fs.writeFileSync(path.join(repo, file), '\n');
      }

      const matcher = createGitignoreMatcher(repo);
      for (const file of files) {
        const fromGit = spawnSync('git', ['check-ignore', '-q', file], { cwd: repo }).status === 0;
        assert.strictEqual(
          matcher.ignores(path.join(repo, file), false),
          fromGit,
          `disagreed with git on ${file}`
        );
      }
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
