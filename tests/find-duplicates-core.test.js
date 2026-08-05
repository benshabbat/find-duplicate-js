import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  extractFunctions,
  normalizeCode,
  calculateSimilarity,
  findJsFiles,
  findDuplicates,
  groupDuplicates
} from '../src/core/find-duplicates-core.js';
import { stripFormatting } from '../src/core/find-duplicates-normalize.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('normalizeCode', () => {
  test('should remove whitespace', () => {
    const code = 'const x = 5;\n  const y = 10;';
    const normalized = normalizeCode(code);
    assert.strictEqual(normalized.includes('\n'), false);
    assert.strictEqual(normalized.includes('  '), false);
  });

  test('should remove single-line comments', () => {
    const code = 'const x = 5; // this is a comment';
    const normalized = normalizeCode(code);
    assert.strictEqual(normalized.includes('//'), false);
  });

  test('should remove multi-line comments', () => {
    const code = 'const x = 5; /* multi\nline\ncomment */';
    const normalized = normalizeCode(code);
    assert.strictEqual(normalized.includes('/*'), false);
    assert.strictEqual(normalized.includes('*/'), false);
  });

  test('should treat strings with escaped quotes as a single literal', () => {
    // With naive quote matching, the escaped quote in 'it\'s done' would
    // terminate the string early and leave a dangling `s done'` tail, making
    // two otherwise-identical functions look different.
    const withEscape = normalizeCode("return 'it\\'s done';");
    const plain = normalizeCode("return 'finished';");
    assert.strictEqual(withEscape, plain);

    const doubleQuoted = normalizeCode('return "say \\"hi\\" now";');
    const doublePlain = normalizeCode('return "hello";');
    assert.strictEqual(doubleQuoted, doublePlain);
  });

  test('should replace variable names with V', () => {
    const code = 'const myVariable = 10;';
    const normalized = normalizeCode(code);
    assert.strictEqual(normalized.includes('myVariable'), false);
    assert.strictEqual(normalized.includes('V'), true);
  });

  test('should replace string literals', () => {
    const code = 'const str = "hello world";';
    const normalized = normalizeCode(code);
    assert.strictEqual(normalized.includes('hello'), false);
    assert.strictEqual(normalized.includes('""'), true);
  });

  test('should replace template literals', () => {
    const code = 'const str = `hello ${name}`;';
    const normalized = normalizeCode(code);
    assert.strictEqual(normalized.includes('hello'), false);
  });
});

describe('stripFormatting', () => {
  test('removes comments and whitespace but keeps identifiers and strings', () => {
    const code = 'const a = 1; // note\n/* block\ncomment */\nreturn a;';
    assert.strictEqual(stripFormatting(code), 'consta=1;returna;');
  });

  test('does not treat // inside a string literal as a comment', () => {
    const url1 = stripFormatting("fetch('https://a.example.com/x')");
    const url2 = stripFormatting("fetch('https://b.example.com/x')");
    assert.strictEqual(url1, "fetch('https://a.example.com/x')");
    assert.notStrictEqual(url1, url2);
  });

  test('preserves whitespace inside string literals', () => {
    assert.notStrictEqual(
      stripFormatting("return 'hello world';"),
      stripFormatting("return 'helloworld';")
    );
  });

  test('handles escaped quotes inside strings', () => {
    const code = "const msg = 'it\\'s done'; return msg;";
    assert.strictEqual(stripFormatting(code), "constmsg='it\\'s done';returnmsg;");
  });
});

describe('calculateSimilarity', () => {
  test('should return 100 for identical strings', () => {
    const similarity = calculateSimilarity('abc', 'abc');
    assert.strictEqual(similarity, 100);
  });

  test('should return 100 for empty strings', () => {
    const similarity = calculateSimilarity('', '');
    assert.strictEqual(similarity, 100);
  });

  test('should return 0 for completely different strings', () => {
    const similarity = calculateSimilarity('aaa', 'bbb');
    assert.strictEqual(similarity, 0);
  });

  test('should calculate partial similarity', () => {
    const similarity = calculateSimilarity('kitten', 'sitting');
    assert.ok(similarity > 0 && similarity < 100);
  });

  test('should be case-sensitive', () => {
    const similarity = calculateSimilarity('ABC', 'abc');
    assert.ok(similarity < 100);
  });
});

describe('extractFunctions', () => {
  test('should extract arrow functions', () => {
    const code = 'const myFunc = () => { return 5; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract function declarations', () => {
    const code = 'function myFunc() { return 5; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract async functions', () => {
    const code = 'async function myFunc() { return 5; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract async arrow functions', () => {
    const code = 'const myFunc = async () => { return 5; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract class methods', () => {
    const code = `class MyClass {
      myMethod() { return 5; }
    }`;
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, 'myMethod');
  });

  test('should extract multiple functions', () => {
    const code = `
      function func1() { return 1; }
      const func2 = () => { return 2; }
      function func3() { return 3; }
    `;
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 3);
  });

  test('should skip JavaScript keywords', () => {
    const code = `
      if (true) { return 1; }
      for (let i = 0; i < 10; i++) { }
      while (true) { break; }
    `;
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 0);
  });

  test('should handle nested functions', () => {
    const code = `
      function outer() {
        function inner() {
          return 5;
        }
        return inner();
      }
    `;
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 2);
    assert.strictEqual(functions[0].name, 'outer');
    assert.strictEqual(functions[1].name, 'inner');
  });
});

describe('findJsFiles', () => {
  test('should find JavaScript files in directory', () => {
    const testDir = path.join(__dirname, 'fixtures');
    
    // Create test directory structure if it doesn't exist
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create test files
    fs.writeFileSync(path.join(testDir, 'test1.js'), 'console.log("test1");');
    fs.writeFileSync(path.join(testDir, 'test2.jsx'), 'console.log("test2");');
    fs.writeFileSync(path.join(testDir, 'test.txt'), 'not js');
    
    const files = findJsFiles(testDir);
    
    assert.ok(files.length >= 2);
    assert.ok(files.some(f => f.endsWith('.js')));
    assert.ok(files.some(f => f.endsWith('.jsx')));
    assert.ok(!files.some(f => f.endsWith('.txt')));
    
    // Cleanup
    fs.unlinkSync(path.join(testDir, 'test1.js'));
    fs.unlinkSync(path.join(testDir, 'test2.jsx'));
    fs.unlinkSync(path.join(testDir, 'test.txt'));
    fs.rmdirSync(testDir);
  });

  test('should skip node_modules directory', () => {
    const testDir = path.join(__dirname, 'fixtures-nm');
    const nodeModulesDir = path.join(testDir, 'node_modules');
    
    if (!fs.existsSync(nodeModulesDir)) {
      fs.mkdirSync(nodeModulesDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(testDir, 'app.js'), 'console.log("app");');
    fs.writeFileSync(path.join(nodeModulesDir, 'lib.js'), 'console.log("lib");');
    
    const files = findJsFiles(testDir);
    
    assert.ok(!files.some(f => f.includes('node_modules')));
    
    // Cleanup
    fs.unlinkSync(path.join(testDir, 'app.js'));
    fs.unlinkSync(path.join(nodeModulesDir, 'lib.js'));
    fs.rmdirSync(nodeModulesDir);
    fs.rmdirSync(testDir);
  });

  test('should include .mjs/.cjs/.mts/.cts and exclude declarations, minified bundles, and coverage/', () => {
    const testDir = path.join(__dirname, 'fixtures-ext');
    const coverageDir = path.join(testDir, 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });

    const included = ['mod.mjs', 'legacy.cjs', 'typed.mts', 'typed2.cts'];
    const excluded = ['types.d.ts', 'types.d.mts', 'types.d.cts', 'bundle.min.js'];
    for (const name of [...included, ...excluded]) {
      fs.writeFileSync(path.join(testDir, name), 'export const x = 1;');
    }
    fs.writeFileSync(path.join(coverageDir, 'instrumented.js'), 'console.log("cov");');

    const files = findJsFiles(testDir).map(f => path.basename(f));

    for (const name of included) {
      assert.ok(files.includes(name), `${name} should be scanned`);
    }
    for (const name of excluded) {
      assert.ok(!files.includes(name), `${name} should be skipped`);
    }
    assert.ok(!files.includes('instrumented.js'), 'coverage/ should be skipped');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should skip framework build/cache directories by default', () => {
    const testDir = path.join(__dirname, 'fixtures-framework');
    const skipped = ['.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel', '.cache', 'out'];

    for (const dir of skipped) {
      fs.mkdirSync(path.join(testDir, dir), { recursive: true });
      fs.writeFileSync(path.join(testDir, dir, 'chunk.js'), 'console.log("bundled");');
    }
    fs.writeFileSync(path.join(testDir, 'app.js'), 'console.log("app");');

    const files = findJsFiles(testDir);

    assert.strictEqual(files.length, 1);
    assert.ok(files[0].endsWith('app.js'));

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should skip extra directories passed via excludeDirs', () => {
    const testDir = path.join(__dirname, 'fixtures-exclude');
    fs.mkdirSync(path.join(testDir, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'app.js'), 'console.log("app");');
    fs.writeFileSync(path.join(testDir, 'generated', 'gen.js'), 'console.log("gen");');

    const all = findJsFiles(testDir);
    assert.strictEqual(all.length, 2);

    const filtered = findJsFiles(testDir, [], new Set(['generated']));
    assert.strictEqual(filtered.length, 1);
    assert.ok(filtered[0].endsWith('app.js'));

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});

describe('findDuplicates', () => {
  test('should find duplicate functions', () => {
    const testDir = path.join(__dirname, 'fixtures-dup');
    
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create files with duplicate functions
    fs.writeFileSync(
      path.join(testDir, 'file1.js'),
      'function add(a, b) { return a + b; }'
    );
    fs.writeFileSync(
      path.join(testDir, 'file2.js'),
      'function sum(x, y) { return x + y; }'
    );
    
    const result = findDuplicates(testDir, 70);
    
    assert.ok(result.duplicates.length > 0);
    assert.strictEqual(result.totalFunctions, 2);
    
    // Cleanup
    fs.unlinkSync(path.join(testDir, 'file1.js'));
    fs.unlinkSync(path.join(testDir, 'file2.js'));
    fs.rmdirSync(testDir);
  });

  test('should find duplicates between same-named functions in the same file', () => {
    const testDir = path.join(__dirname, 'fixtures-same');

    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Two distinct, copy-pasted functions that happen to share a name
    // (e.g. a `render()` method duplicated across two classes in one file)
    fs.writeFileSync(
      path.join(testDir, 'file1.js'),
      'function add(a, b) { return a + b; }\nfunction add(c, d) { return c + d; }'
    );

    const result = findDuplicates(testDir, 70);

    // Should extract both functions (different positions)
    assert.strictEqual(result.totalFunctions, 2);
    // And should flag them as duplicates of each other, not silently skip
    // the comparison just because they share a name
    assert.strictEqual(result.duplicates.length, 1);
    assert.strictEqual(result.duplicates[0].func1.name, 'add');
    assert.strictEqual(result.duplicates[0].func2.name, 'add');

    // Cleanup
    fs.unlinkSync(path.join(testDir, 'file1.js'));
    fs.rmdirSync(testDir);
  });

  test('should label byte-identical copies exact and renamed copies structural', () => {
    const testDir = path.join(__dirname, 'fixtures-matchtype');
    fs.mkdirSync(testDir, { recursive: true });

    // alpha/beta share an identical body; gamma has the same shape but
    // renamed identifiers, so it only matches after normalization.
    fs.writeFileSync(path.join(testDir, 'file1.js'), [
      'function alpha(a, b) { const sum = a + b; return sum; }',
      'function beta(a, b) { const sum = a + b; return sum; }',
      'function gamma(x, y) { const value = x + y; return value; }'
    ].join('\n'));

    const result = findDuplicates(testDir, 70);
    assert.strictEqual(result.duplicates.length, 3);

    const typeOf = (name1, name2) => result.duplicates.find(
      dup => [dup.func1.name, dup.func2.name].sort().join() === [name1, name2].sort().join()
    ).matchType;

    assert.strictEqual(typeOf('alpha', 'beta'), 'exact');
    assert.strictEqual(typeOf('alpha', 'gamma'), 'structural');
    assert.strictEqual(typeOf('beta', 'gamma'), 'structural');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should respect similarity threshold', () => {
    const testDir = path.join(__dirname, 'fixtures-threshold');
    
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create files with different functions
    fs.writeFileSync(
      path.join(testDir, 'file1.js'),
      'function func1() { const x = 1; const y = 2; return x + y; }'
    );
    fs.writeFileSync(
      path.join(testDir, 'file2.js'),
      'function func2() { const a = 10; const b = 20; const c = 30; return a + b + c; }'
    );
    
    const highThreshold = findDuplicates(testDir, 95);
    const lowThreshold = findDuplicates(testDir, 30);

    // High threshold should find fewer duplicates than low threshold
    assert.ok(highThreshold.duplicates.length <= lowThreshold.duplicates.length);

    // Cleanup
    fs.unlinkSync(path.join(testDir, 'file1.js'));
    fs.unlinkSync(path.join(testDir, 'file2.js'));
    fs.rmdirSync(testDir);
  });
});

describe('groupDuplicates', () => {
  test('clusters mutually similar functions into one group', () => {
    const testDir = path.join(__dirname, 'fixtures-groups');
    fs.mkdirSync(testDir, { recursive: true });

    fs.writeFileSync(path.join(testDir, 'trio.js'), [
      'function first(x, y) { const total = x + y; return total; }',
      'function second(p, q) { const total = p + q; return total; }',
      'function third(m, n) { const total = m + n; return total; }'
    ].join('\n'));

    const result = findDuplicates(testDir, 70);
    // 3 mutually similar functions produce 3 pairs...
    assert.strictEqual(result.duplicates.length, 3);

    // ...but only 1 group of 3 members
    const groups = groupDuplicates(result.duplicates);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].functions.length, 3);
    assert.strictEqual(groups[0].pairs.length, 3);
    assert.ok(groups[0].minSimilarity <= groups[0].maxSimilarity);
    // Members are sorted by file path, then line
    assert.deepStrictEqual(groups[0].functions.map(f => f.name), ['first', 'second', 'third']);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('keeps unrelated duplicate pairs in separate groups', () => {
    const testDir = path.join(__dirname, 'fixtures-groups-separate');
    fs.mkdirSync(testDir, { recursive: true });

    fs.writeFileSync(path.join(testDir, 'clusters.js'), [
      // Cluster 1: two small arithmetic functions
      'function first(x, y) { const total = x + y; return total; }',
      'function second(p, q) { const total = p + q; return total; }',
      // Cluster 2: two much larger branching functions (never compared
      // against cluster 1 thanks to the >50% size-difference cutoff)
      'function logA(v) { if (v) { console.log("yes-yes"); } else { console.log("no-no"); } }',
      'function logB(w) { if (w) { console.log("yes-yes"); } else { console.log("no-no"); } }'
    ].join('\n'));

    const result = findDuplicates(testDir, 70);
    const groups = groupDuplicates(result.duplicates);

    assert.strictEqual(groups.length, 2);
    for (const group of groups) {
      assert.strictEqual(group.functions.length, 2);
    }

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('labels a group exact only when every pair is an exact copy', () => {
    const testDir = path.join(__dirname, 'fixtures-groups-matchtype');
    fs.mkdirSync(testDir, { recursive: true });

    fs.writeFileSync(path.join(testDir, 'exact.js'), [
      'function alpha(a, b) { const sum = a + b; return sum; }',
      'function beta(a, b) { const sum = a + b; return sum; }'
    ].join('\n'));
    // Much larger than alpha/beta so the two clusters are never compared
    // against each other (>50% size-difference cutoff) and can't merge.
    fs.writeFileSync(path.join(testDir, 'renamed.js'), [
      'function gammaOne(value) { if (value) { console.log("yes-yes"); } else { console.log("no-no"); } }',
      'function gammaTwo(other) { if (other) { console.log("yes-yes"); } else { console.log("no-no"); } }'
    ].join('\n'));

    const result = findDuplicates(testDir, 70);
    const groups = groupDuplicates(result.duplicates);
    const byName = (name) => groups.find(g => g.functions.some(f => f.name === name));

    assert.strictEqual(byName('alpha').matchType, 'exact');
    assert.strictEqual(byName('gammaOne').matchType, 'structural');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('returns an empty array for no duplicates', () => {
    assert.deepStrictEqual(groupDuplicates([]), []);
  });
});
