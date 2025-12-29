import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  extractFunctions,
  normalizeCode,
  calculateSimilarity,
  findJsFiles,
  findDuplicates
} from '../find-duplicates-core.js';
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

  test('should not find duplicates in identical functions from same file', () => {
    const testDir = path.join(__dirname, 'fixtures-same');
    
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create file with same function name twice (both will be extracted)
    fs.writeFileSync(
      path.join(testDir, 'file1.js'),
      'function add(a, b) { return a + b; }\nfunction add(c, d) { return c + d; }'
    );
    
    const result = findDuplicates(testDir, 70);
    
    // Should extract both functions (different positions)
    assert.strictEqual(result.totalFunctions, 2);
    
    // Cleanup
    fs.unlinkSync(path.join(testDir, 'file1.js'));
    fs.rmdirSync(testDir);
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
