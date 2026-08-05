import { test, describe } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateHTML, escapeHtml, escapeJsString, createServer } from '../src/ui/find-duplicates-ui.js';

// The server handlers under test log a status line on every request (via
// console.log/console.error, with multibyte emoji). Inside the test runner's
// child process that console traffic is interleaved with the structured
// test-report stream on stdout, and the race has corrupted the stream in CI
// ("Unable to deserialize cloned data due to invalid or unsupported
// version", seen on ubuntu + Node 24). Silencing console in this file
// removes the trigger; the tests only assert on HTTP responses, never on
// console output.
console.log = () => {};
console.error = () => {};

describe('escapeHtml', () => {
  test('escapes <, >, &, ", \'', () => {
    assert.strictEqual(
      escapeHtml(`<script>alert("x" & 'y')</script>`),
      '&lt;script&gt;alert(&quot;x&quot; &amp; &#039;y&#039;)&lt;/script&gt;'
    );
  });

  test('leaves plain text unchanged', () => {
    assert.strictEqual(escapeHtml('hello world'), 'hello world');
  });

  test('handles empty string', () => {
    assert.strictEqual(escapeHtml(''), '');
  });
});

describe('escapeJsString', () => {
  test('escapes backslashes, quotes, and whitespace control chars', () => {
    assert.strictEqual(escapeJsString('a\\b\'c"d\ne\rf\tg'), "a\\\\b\\'c\\\"d\\ne\\rf\\tg");
  });

  test('escapes < and > to prevent script injection', () => {
    assert.strictEqual(escapeJsString('<script>'), '\\x3Cscript\\x3E');
  });

  test('returns empty string for falsy input', () => {
    assert.strictEqual(escapeJsString(''), '');
    assert.strictEqual(escapeJsString(undefined), '');
  });
});

describe('generateHTML', () => {
  test('renders the "no duplicates" state when there are none', () => {
    const html = generateHTML([], { filesScanned: 3, functionsFound: 10, duplicatesFound: 0, threshold: 70 });
    assert.match(html, /No Duplicates Found/);
    assert.match(html, /{{filesScanned}}|3/);
  });

  test('clusters pairs that share functions into a single group card', () => {
    // Three functions where A~B, A~C, B~C: the same objects appear across
    // pairs (grouping is keyed on object identity, as in findDuplicates()).
    const funcA = { name: 'a', filePath: 'a.js', line: 1, originalBody: 'return 1;' };
    const funcB = { name: 'b', filePath: 'b.js', line: 1, originalBody: 'return 1;' };
    const funcC = { name: 'c', filePath: 'c.js', line: 1, originalBody: 'return 2;' };
    const duplicates = [
      { similarity: '100.00', matchType: 'exact', func1: funcA, func2: funcB },
      { similarity: '95.00', matchType: 'structural', func1: funcA, func2: funcC },
      { similarity: '95.00', matchType: 'structural', func1: funcB, func2: funcC },
    ];

    const html = generateHTML(duplicates, { filesScanned: 3, functionsFound: 3, duplicatesFound: 3, threshold: 70 });

    assert.match(html, /Group #1 &mdash; 3 functions/);
    assert.doesNotMatch(html, /Group #2/);
    assert.match(html, /structural/);
    // The groups stat card is filled in from the computed clusters
    assert.match(html, /<div class="number">1<\/div>\s*<div class="label">Duplicate Groups<\/div>/);
  });

  test('escapes duplicate function names and file paths in output', () => {
    const duplicates = [
      {
        similarity: '95.00',
        func1: { name: '<evil>', filePath: '"onload=alert(1)"', line: 1, originalBody: 'function a(){}' },
        func2: { name: 'safeName', filePath: 'safe/path.js', line: 2, originalBody: 'function b(){}' },
      },
    ];
    const html = generateHTML(duplicates, { filesScanned: 1, functionsFound: 2, duplicatesFound: 1, threshold: 70 });
    assert.doesNotMatch(html, /<evil>/);
    assert.match(html, /&lt;evil&gt;/);
    assert.doesNotMatch(html, /"onload=alert\(1\)"/);
  });
});

describe('createServer HTTP endpoints', () => {
  let tmpDir;
  let server;
  let port;

  function get(urlPath) {
    return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: urlPath }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
  }

  test('setup: create temp dir and start server', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-duplicates-ui-test-'));
    fs.writeFileSync(path.join(tmpDir, 'sample.js'), 'function foo() { return 1; }\n');
    server = createServer(tmpDir, 70);
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  test('GET / returns 200 with an HTML report', async () => {
    const { status, body } = await get('/');
    assert.strictEqual(status, 200);
    assert.match(body, /<html/i);
  });

  test('GET /open-file with no path returns 400', async () => {
    const { status } = await get('/open-file?line=1');
    assert.strictEqual(status, 400);
  });

  test('GET /open-file with an invalid line number returns 400', async () => {
    const filePath = path.join(tmpDir, 'sample.js');
    const { status } = await get(`/open-file?path=${encodeURIComponent(filePath)}&line=abc`);
    assert.strictEqual(status, 400);
  });

  test('GET /open-file with a path traversal attempt returns 403', async () => {
    const outsidePath = path.join(os.tmpdir(), 'definitely-outside.js');
    fs.writeFileSync(outsidePath, '// outside the analyzed directory\n');
    const { status } = await get(`/open-file?path=${encodeURIComponent(outsidePath)}&line=1`);
    assert.strictEqual(status, 403);
    fs.unlinkSync(outsidePath);
  });

  test('GET /open-file with a non-existent file within the directory returns 404', async () => {
    const missingPath = path.join(tmpDir, 'does-not-exist.js');
    const { status } = await get(`/open-file?path=${encodeURIComponent(missingPath)}&line=1`);
    assert.strictEqual(status, 404);
  });

  test('GET /unknown-route returns 404', async () => {
    const { status } = await get('/unknown-route');
    assert.strictEqual(status, 404);
  });

  test('teardown: close server and remove temp dir', () => {
    return new Promise((resolve) => {
      server.close(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve();
      });
    });
  });
});
