import { test, describe } from 'node:test';
import assert from 'node:assert';
import { extractFunctions } from '../find-duplicates-core.js';

describe('Bug Fixes - Arrow Function Regex', () => {
  test('should extract arrow functions with destructured parameters', () => {
    const code = 'const myFunc = ({a, b}) => { return a + b; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with destructured params');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract arrow functions with default parameter values', () => {
    const code = 'const myFunc = (a = 5, b = 10) => { return a + b; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with default params');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract arrow functions with nested parentheses in params', () => {
    const code = 'const myFunc = (fn = (x) => x * 2) => { return fn(5); }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with nested parentheses');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract arrow functions with complex destructuring', () => {
    const code = 'const myFunc = ({a, b: {c, d}}, [e, f]) => { return a + c + e; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with complex destructuring');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract arrow functions with rest parameters', () => {
    const code = 'const myFunc = (first, ...rest) => { return rest.length; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with rest params');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract multiple arrow functions with complex params', () => {
    const code = `
      const func1 = ({x}) => { return x; }
      const func2 = (a = 5) => { return a; }
      const func3 = (...args) => { return args; }
    `;
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 3, 'Should extract all three functions');
  });

  test('should extract async arrow functions with complex params', () => {
    const code = 'const myFunc = async ({data}, callback = () => {}) => { return data; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract async arrow function');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should handle arrow functions with parentheses in string literals', () => {
    const code = `const myFunc = (text = "hello (world)") => { return text; }`;
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with string containing parens');
    assert.strictEqual(functions[0].name, 'myFunc');
  });
});

describe('Bug Fixes - Function Declaration Regex', () => {
  test('should extract function declarations with destructured parameters', () => {
    const code = 'function myFunc({a, b}) { return a + b; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with destructured params');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract function declarations with default parameters', () => {
    const code = 'function myFunc(a = 5, b = 10) { return a + b; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with default params');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should extract async function declarations with complex params', () => {
    const code = 'async function myFunc({data}, options = {}) { return data; }';
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract async function with complex params');
    assert.strictEqual(functions[0].name, 'myFunc');
  });
});

describe('Bug Fixes - Edge Cases', () => {
  test('should handle functions with comments in parameters', () => {
    const code = `function myFunc(
      a, // first param
      b  // second param
    ) { return a + b; }`;
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract function with commented params');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should handle multiline arrow functions', () => {
    const code = `const myFunc = (
      a,
      b,
      c
    ) => {
      return a + b + c;
    }`;
    const functions = extractFunctions(code, 'test.js');
    assert.strictEqual(functions.length, 1, 'Should extract multiline arrow function');
    assert.strictEqual(functions[0].name, 'myFunc');
  });

  test('should not extract arrow functions without braces', () => {
    const code = 'const myFunc = (x) => x * 2;';
    const functions = extractFunctions(code, 'test.js');
    // Our current implementation only extracts functions with braces
    assert.strictEqual(functions.length, 0, 'Should not extract implicit return arrow functions');
  });
});
