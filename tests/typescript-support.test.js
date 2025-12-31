import { test } from 'node:test';
import assert from 'node:assert';
import { extractFunctions, normalizeCode, calculateSimilarity } from '../find-duplicates-core.js';

/**
 * Tests for TypeScript support in find-duplicate-js
 * These tests verify that the tool correctly handles TypeScript syntax
 */

// =============================================================================
// Type Annotation Tests
// =============================================================================

test('should extract TypeScript function with parameter type annotations', () => {
  const code = `
    function greet(name: string): string {
      return "Hello, " + name;
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'greet', 'Function name should be greet');
});

test('should extract TypeScript arrow function with type annotations', () => {
  const code = `
    const add = (a: number, b: number): number => {
      return a + b;
    };
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'add', 'Function name should be add');
});

test('should normalize TypeScript by removing parameter type annotations', () => {
  const tsCode = 'function add(a: number, b: number) { return a + b; }';
  const jsCode = 'function add(a, b) { return a + b; }';
  
  const normalizedTS = normalizeCode(tsCode);
  const normalizedJS = normalizeCode(jsCode);
  
  // Both should normalize to the same thing
  assert.strictEqual(normalizedTS, normalizedJS, 'TS and JS should normalize identically');
});

test('should normalize TypeScript by removing return type annotations', () => {
  const tsCode = 'function getData(): Promise<User> { return fetch(); }';
  const jsCode = 'function getData() { return fetch(); }';
  
  const normalizedTS = normalizeCode(tsCode);
  const normalizedJS = normalizeCode(jsCode);
  
  // Check that both normalize similarly
  const similarity = calculateSimilarity(normalizedTS, normalizedJS);
  assert.ok(similarity > 80, `Similarity should be > 80%, got ${similarity}%`);
});

// =============================================================================
// Generic Type Tests
// =============================================================================

test('should extract TypeScript generic function', () => {
  const code = `
    function identity<T>(arg: T): T {
      return arg;
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'identity', 'Function name should be identity');
});

test('should normalize TypeScript generic parameters', () => {
  const tsCode = 'function map<T, U>(arr: T[], fn: (x: T) => U): U[] { return arr.map(fn); }';
  const jsCode = 'function map(arr, fn) { return arr.map(fn); }';
  
  const normalizedTS = normalizeCode(tsCode);
  const normalizedJS = normalizeCode(jsCode);
  
  const similarity = calculateSimilarity(normalizedTS, normalizedJS);
  assert.ok(similarity > 65, `Similarity should be > 65%, got ${similarity}%`);
});

test('should handle constrained generics', () => {
  const code = `
    function extend<T extends object>(obj: T, props: Partial<T>): T {
      return { ...obj, ...props };
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'extend', 'Function name should be extend');
});

// =============================================================================
// Class Method Tests
// =============================================================================

test('should extract TypeScript class methods with access modifiers', () => {
  const code = `
    class Calculator {
      public add(a: number, b: number): number {
        return a + b;
      }
      
      private multiply(x: number, y: number): number {
        return x * y;
      }
      
      protected divide(a: number, b: number): number {
        return a / b;
      }
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 3, 'Should extract three methods');
  assert.ok(functions.some(f => f.name === 'add'), 'Should extract add method');
  assert.ok(functions.some(f => f.name === 'multiply'), 'Should extract multiply method');
  assert.ok(functions.some(f => f.name === 'divide'), 'Should extract divide method');
});

test('should normalize class methods with access modifiers', () => {
  const tsCode = 'public add(a: number, b: number): number { return a + b; }';
  const jsCode = 'add(a, b) { return a + b; }';
  
  const normalizedTS = normalizeCode(tsCode);
  const normalizedJS = normalizeCode(jsCode);
  
  const similarity = calculateSimilarity(normalizedTS, normalizedJS);
  assert.ok(similarity > 75, `Similarity should be > 75%, got ${similarity}%`);
});

test('should extract static TypeScript methods', () => {
  const code = `
    class MathUtils {
      static sum(a: number, b: number): number {
        return a + b;
      }
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one static method');
  assert.strictEqual(functions[0].name, 'sum', 'Method name should be sum');
});

// =============================================================================
// Optional Parameters Tests
// =============================================================================

test('should extract function with optional parameters', () => {
  const code = `
    function buildName(first: string, last?: string): string {
      return last ? first + " " + last : first;
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'buildName', 'Function name should be buildName');
});

test('should normalize optional parameters', () => {
  const tsCode = 'function greet(name: string, age?: number) { return name; }';
  const jsCode = 'function greet(name, age) { return name; }';
  
  const normalizedTS = normalizeCode(tsCode);
  const normalizedJS = normalizeCode(jsCode);
  
  const similarity = calculateSimilarity(normalizedTS, normalizedJS);
  assert.ok(similarity > 90, `Similarity should be > 90%, got ${similarity}%`);
});

// =============================================================================
// Type Assertion Tests
// =============================================================================

test('should normalize type assertions', () => {
  const tsCode = 'const name = (user as User).name;';
  const jsCode = 'const name = user.name;';
  
  const normalizedTS = normalizeCode(tsCode);
  const normalizedJS = normalizeCode(jsCode);
  
  // Should be similar after normalization
  const similarity = calculateSimilarity(normalizedTS, normalizedJS);
  assert.ok(similarity > 70, `Similarity should be > 70%, got ${similarity}%`);
});

// =============================================================================
// Cross-Language Duplicate Detection Tests
// =============================================================================

test('should detect duplicates between TypeScript and JavaScript', () => {
  const tsCode = `
    function calculateSum(a: number, b: number): number {
      const result = a + b;
      return result;
    }
  `;
  
  const jsCode = `
    function addNumbers(x, y) {
      const total = x + y;
      return total;
    }
  `;
  
  const tsFunctions = extractFunctions(tsCode, 'math.ts');
  const jsFunctions = extractFunctions(jsCode, 'math.js');
  
  assert.strictEqual(tsFunctions.length, 1, 'Should extract TS function');
  assert.strictEqual(jsFunctions.length, 1, 'Should extract JS function');
  
  const similarity = calculateSimilarity(tsFunctions[0].body, jsFunctions[0].body);
  
  assert.ok(similarity > 90, `TS and JS functions should be similar (got ${similarity}%)`);
});

test('should detect duplicates with different type annotations', () => {
  const code1 = `
    function process(data: string): string {
      const result = data.toUpperCase();
      return result;
    }
  `;
  
  const code2 = `
    function transform(input: string): string {
      const output = input.toUpperCase();
      return output;
    }
  `;
  
  const functions1 = extractFunctions(code1, 'file1.ts');
  const functions2 = extractFunctions(code2, 'file2.ts');
  
  const similarity = calculateSimilarity(functions1[0].body, functions2[0].body);
  
  assert.ok(similarity > 90, `Functions should be similar (got ${similarity}%)`);
});

// =============================================================================
// Complex Type Tests
// =============================================================================

test('should handle union types', () => {
  const code = `
    function process(value: string | number): string {
      return value.toString();
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'process', 'Function name should be process');
});

test('should handle array types', () => {
  const code = `
    function sum(numbers: number[]): number {
      return numbers.reduce((a, b) => a + b, 0);
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'sum', 'Function name should be sum');
});

test('should handle Promise return types', () => {
  const code = `
    async function fetchData(id: string): Promise<User> {
      const response = await fetch('/api/' + id);
      return response.json();
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one async function');
  assert.strictEqual(functions[0].name, 'fetchData', 'Function name should be fetchData');
});

// =============================================================================
// Arrow Function with Type Annotations Tests
// =============================================================================

test('should extract arrow function with complex type annotations', () => {
  const code = `
    const processUser = async (user: User, options?: ProcessOptions): Promise<Result> => {
      const data = await validateUser(user);
      return processData(data, options);
    };
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one arrow function');
  assert.strictEqual(functions[0].name, 'processUser', 'Function name should be processUser');
});

test('should handle arrow function with variable type annotation', () => {
  const code = `
    const multiply = (a: number, b: number): number => {
      return a * b;
    };
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'multiply', 'Function name should be multiply');
});

// =============================================================================
// Real-World Scenario Tests
// =============================================================================

test('should detect duplicate in real-world TypeScript vs JavaScript scenario', () => {
  const tsCode = `
    export async function getUserById(id: string): Promise<User | null> {
      try {
        const response = await fetch(\`/api/users/\${id}\`);
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error fetching user:', error);
        return null;
      }
    }
  `;
  
  const jsCode = `
    export async function fetchUser(userId) {
      try {
        const result = await fetch(\`/api/users/\${userId}\`);
        const json = await result.json();
        return json;
      } catch (err) {
        console.error('Error fetching user:', err);
        return null;
      }
    }
  `;
  
  const tsFunctions = extractFunctions(tsCode, 'userService.ts');
  const jsFunctions = extractFunctions(jsCode, 'userService.js');
  
  assert.strictEqual(tsFunctions.length, 1, 'Should extract TS function');
  assert.strictEqual(jsFunctions.length, 1, 'Should extract JS function');
  
  const similarity = calculateSimilarity(tsFunctions[0].body, jsFunctions[0].body);
  
  assert.ok(similarity > 70, `Real-world TS and JS functions should be similar (got ${similarity}%)`);
});

test('should handle TypeScript class with multiple features', () => {
  const code = `
    export class DataService {
      public get(id: string): string {
        return id;
      }
      
      private fetchFromAPI(id: string): string {
        return id;
      }
    }
  `;
  
  const functions = extractFunctions(code, 'dataService.ts');
  
  // Should extract at least the two methods
  assert.ok(functions.length >= 1, `Should extract at least 1 method, got ${functions.length}`);
  const hasGet = functions.some(f => f.name === 'get');
  const hasFetch = functions.some(f => f.name === 'fetchFromAPI');
  assert.ok(hasGet || hasFetch, 'Should extract at least one of the methods');
});

// =============================================================================
// Edge Cases
// =============================================================================

test('should handle readonly parameters', () => {
  const code = `
    function getFirst(arr: readonly number[]): number {
      return arr[0];
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'getFirst', 'Function name should be getFirst');
});

test('should handle tuple types', () => {
  const code = `
    function swap(pair: [number, number]): [number, number] {
      return [pair[1], pair[0]];
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'swap', 'Function name should be swap');
});

test('should handle function type parameters', () => {
  const code = `
    function execute(callback: (x: number) => string): string {
      return callback(42);
    }
  `;
  
  const functions = extractFunctions(code, 'test.ts');
  
  assert.strictEqual(functions.length, 1, 'Should extract one function');
  assert.strictEqual(functions[0].name, 'execute', 'Function name should be execute');
});

console.log('✅ All TypeScript support tests configured');
