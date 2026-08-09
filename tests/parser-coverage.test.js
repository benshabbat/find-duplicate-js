import { test, describe } from 'node:test';
import assert from 'node:assert';
import { extractFunctions } from '../src/core/find-duplicates-parser.js';
import { normalizeCode } from '../src/core/find-duplicates-normalize.js';

/**
 * @param {string} code - Source to parse
 * @returns {Array<string>} Names of the extracted functions
 */
function namesIn(code) {
  return extractFunctions(code, 'test.js').map(func => func.name);
}

describe('extractFunctions covers the common function forms', () => {
  test('arrow function with a single unparenthesized parameter', () => {
    assert.deepStrictEqual(namesIn('const double = x => {\n  return x * 2;\n};'), ['double']);
  });

  test('arrow function assigned to an object property', () => {
    const code = 'const api = {\n  handler: (req, res) => {\n    return res.send(req.body);\n  }\n};';
    assert.deepStrictEqual(namesIn(code), ['handler']);
  });

  test('arrow function as a class field', () => {
    const code = 'class C {\n  onClick = (event) => {\n    this.setState(event.target.value);\n  };\n}';
    assert.deepStrictEqual(namesIn(code), ['onClick']);
  });

  test('getters and setters', () => {
    const code = 'class C {\n  get value() {\n    return this._v;\n  }\n  set value(v) {\n    this._v = v;\n  }\n}';
    assert.deepStrictEqual(namesIn(code), ['value', 'value']);
  });

  test('a method literally named get is still a method', () => {
    const code = 'class Store {\n  get(key) {\n    return this.map.get(key);\n  }\n}';
    assert.deepStrictEqual(namesIn(code), ['get']);
  });

  test('anonymous default export', () => {
    assert.deepStrictEqual(namesIn('export default function () {\n  return 42;\n}'), ['default']);
  });

  test('named default export', () => {
    assert.deepStrictEqual(namesIn('export default function main() {\n  return 42;\n}'), ['main']);
  });

  test('generator function declarations and expressions', () => {
    const code = 'function* ids() {\n  yield 1;\n}\nconst gen = function* () {\n  yield 2;\n};';
    assert.deepStrictEqual(namesIn(code).sort(), ['gen', 'ids']);
  });

  test('function expression assigned to a declaration', () => {
    assert.deepStrictEqual(namesIn('const run = function () {\n  return 1;\n};'), ['run']);
  });

  test('async method with parameters spread over several lines', () => {
    // The old `\\([^)]*\\)` method pattern could not match across a newline, so
    // a wrapped parameter list made the whole method invisible.
    const code = 'class C {\n  async fetchAll(\n    first,\n    second\n  ) {\n    return [first, second];\n  }\n}';
    assert.deepStrictEqual(namesIn(code), ['fetchAll']);
  });

  test('a function is reported once even when several patterns match it', () => {
    assert.deepStrictEqual(namesIn('const run = function () {\n  return 1;\n};'), ['run']);
    assert.deepStrictEqual(namesIn('const add = (a, b) => {\n  return a + b;\n};'), ['add']);
  });

  test('TypeScript return types on arrows and methods', () => {
    const code = 'const parse = (raw: string): Result => {\n  return JSON.parse(raw);\n};';
    assert.deepStrictEqual(namesIn(code), ['parse']);
  });
});

describe('extractFunctions does not invent functions', () => {
  test('comparisons, ternaries and calls are not functions', () => {
    const code = [
      'const cfg = { retries: 3, label: "x" };',
      'if (a === (b)) { doThing(); }',
      'const ok = value >= (min) ? 1 : 2;',
      'someCall(',
      '  longArgumentOne,',
      '  longArgumentTwo',
      ');',
      'label: for (const x of xs) { break label; }',
      'switch (kind) {',
      '  case "a": {',
      '    break;',
      '  }',
      '}'
    ].join('\n');
    assert.deepStrictEqual(namesIn(code), []);
  });

  test('a TypeScript function-typed property is a type, not a body', () => {
    assert.deepStrictEqual(namesIn('interface Props {\n  onSelect: (id: string) => void;\n}'), []);
  });
});

describe('normalizeCode keeps structure that identifiers do not carry', () => {
  test('different control flow no longer normalizes to the same string', () => {
    // Collapsing every word to 'V' erased the keywords along with the names,
    // so these two produced the identical `V(V){VV.V;}` and scored 100%.
    const conditional = normalizeCode('if (user) { return user.name; }');
    const loop = normalizeCode('while (list) { delete list.head; }');
    assert.notStrictEqual(conditional, loop);
    assert.match(conditional, /if/);
    assert.match(conditional, /return/);
    assert.match(loop, /while/);
    assert.match(loop, /delete/);
  });

  test('identifiers and literals are still erased', () => {
    const a = normalizeCode('const total = price * quantity;');
    const b = normalizeCode('const sum = cost * count;');
    assert.strictEqual(a, b);
    assert.strictEqual(a.includes('price'), false);
  });

  test('value literals are structure, not names', () => {
    assert.notStrictEqual(normalizeCode('return true;'), normalizeCode('return count;'));
  });

  test('a JSX component stays distinguishable from a host tag', () => {
    assert.notStrictEqual(normalizeCode('return <Button />;'), normalizeCode('return <div />;'));
  });
});
