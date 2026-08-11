import { test, describe } from 'node:test';
import assert from 'node:assert';
import { extractFunctions, calculateSimilarity } from '../src/core/find-duplicates-core.js';

/**
 * Regression tests for the boundary between a TypeScript return type annotation
 * and the function body it annotates.
 *
 * The extractor used to take the first `{` after the parameter list, so an
 * inline object return type became the "body" - which made every function
 * sharing a return type shape look like a duplicate of every other. The same
 * shortcut treated the `:` of a ternary as the start of a return type, turning
 * ordinary calls into function definitions whose "body" was an argument.
 */

describe('inline object return types are not mistaken for the body', () => {
  test('extracts the body, not an inline object return type', () => {
    const code = `
      function computeSquareCropRect(w: number, h: number): { x: number; y: number; size: number } {
        const size = Math.min(w, h);
        return { x: (w - size) / 2, y: (h - size) / 2, size };
      }
    `;

    const functions = extractFunctions(code, 'crop.ts');

    assert.strictEqual(functions.length, 1);
    assert.ok(
      functions[0].originalBody.includes('const size = Math.min(w, h);'),
      `Body should be the statements, got: ${functions[0].originalBody}`
    );
    assert.ok(
      !functions[0].originalBody.includes('x: number'),
      'Body should not contain the return type annotation'
    );
  });

  test('extracts the body when the return type is a union of object types in a generic', () => {
    const code = `
      export async function guardGenerationRequest(
        req: Request
      ): Promise<{ supabase: Client; user: User; response?: undefined } | { supabase?: undefined; user?: undefined; response: Response }> {
        const supabase = await createClient();
        const { data } = await supabase.auth.getUser();
        return { supabase, user: data.user };
      }
    `;

    const functions = extractFunctions(code, 'api-guards.ts');

    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, 'guardGenerationRequest');
    assert.ok(
      functions[0].originalBody.includes('await createClient()'),
      `Body should be the statements, got: ${functions[0].originalBody}`
    );
  });

  test('unrelated functions sharing a return type shape are not duplicates', () => {
    const code = `
      function firstHalf(text: string): { head: string; tail: string } {
        const middle = Math.floor(text.length / 2);
        return { head: text.slice(0, middle), tail: text.slice(middle) };
      }

      function loadUser(id: string): { head: string; tail: string } {
        logAccess(id);
        throw new Error('not implemented');
      }
    `;

    const functions = extractFunctions(code, 'mixed.ts');

    assert.strictEqual(functions.length, 2);
    const similarity = calculateSimilarity(functions[0].body, functions[1].body);
    assert.ok(similarity < 60, `Unrelated bodies should not match, got ${similarity}%`);
  });

  test('handles an inline object return type on an arrow function', () => {
    const code = `
      const splitName = (full: string): { first: string; last: string } => {
        const [first, ...rest] = full.split(' ');
        return { first, last: rest.join(' ') };
      };
    `;

    const functions = extractFunctions(code, 'name.ts');

    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, 'splitName');
    assert.ok(functions[0].originalBody.includes('full.split'));
  });

  test('handles an inline object return type on a class method', () => {
    const code = `
      class Box {
        measure(scale: number): { width: number; height: number } {
          const width = this.w * scale;
          return { width, height: this.h * scale };
        }
      }
    `;

    const functions = extractFunctions(code, 'box.ts');

    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, 'measure');
    assert.ok(functions[0].originalBody.includes('this.w * scale'));
  });

  test('handles a function type as the return type', () => {
    const code = `
      function makeFormatter(locale: string): (value: number) => string {
        const formatter = new Intl.NumberFormat(locale);
        return (value) => formatter.format(value);
      }
    `;

    const functions = extractFunctions(code, 'format.ts');

    assert.ok(functions.some(f => f.name === 'makeFormatter'), 'Should extract makeFormatter');
    const outer = functions.find(f => f.name === 'makeFormatter');
    assert.ok(outer.originalBody.includes('Intl.NumberFormat'));
  });

  test('does not invent a body for an overload signature that has none', () => {
    const code = `
      interface Repo {
        find(id: string): { name: string };
      }
    `;

    const functions = extractFunctions(code, 'repo.ts');

    assert.strictEqual(functions.length, 0, 'A declaration without a body is not a function to compare');
  });
});

describe('a ternary colon is not a return type annotation', () => {
  test('does not report a call as a function definition', () => {
    const code = `
      export function renderCell(value: string, isTotal: boolean) {
        const cell = isTotal ?
          createElement(Text, { style: styles.bold, wrap: false }, value) :
          createElement(Text, { style: styles.normal, wrap: false }, value);
        return cell;
      }
    `;

    const functions = extractFunctions(code, 'pdf.tsx');

    assert.deepStrictEqual(
      functions.map(f => f.name),
      ['renderCell'],
      'Only the enclosing function is a function'
    );
  });

  test('two such calls in different functions are not an exact duplicate', () => {
    const code = `
      function renderCell(value: string, isTotal: boolean) {
        return isTotal ?
          createElement(Text, { style: styles.bold, wrap: false }, value) :
          createElement(Text, { style: styles.normal, wrap: false }, value);
      }

      function renderHeaderCell(value: string, isTotal: boolean) {
        logHeader(value);
        return isTotal ?
          createElement(Text, { style: styles.bold, wrap: false }, value) :
          createElement(Text, { style: styles.normal, wrap: false }, value);
      }
    `;

    const functions = extractFunctions(code, 'pdf.tsx');

    assert.strictEqual(functions.length, 2, 'Only the two declared functions');
    assert.ok(
      !functions.some(f => f.name === 'createElement'),
      'A call is never a function definition'
    );
  });
});
