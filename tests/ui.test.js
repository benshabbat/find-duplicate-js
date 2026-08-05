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
    assert.strictEqual(escapeJsString('a\\b\'c"d\ne\rf\tg'), 'a\\\\b\\x27c\\x22d\\ne\\rf\\tg');
  });

  test('escapes < and > to prevent script injection', () => {
    assert.strictEqual(escapeJsString('<script>'), '\\x3Cscript\\x3E');
  });

  test('leaves no raw quote that could close an HTML attribute', () => {
    // A backslash escape (\") is valid JS but still contains a literal
    // quote, and the HTML parser unquotes the attribute first - so the
    // output has to carry no bare quote at all.
    const escaped = escapeJsString(`a" onmouseover="alert(1)" x='y'`);
    assert.ok(!escaped.includes('"'), `unexpected raw double quote in: ${escaped}`);
    assert.ok(!escaped.includes("'"), `unexpected raw single quote in: ${escaped}`);
  });

  test('escapes & so an HTML entity cannot smuggle a quote back in', () => {
    // Inside an attribute the HTML parser decodes &#39; to ' before the JS
    // parser runs, so an unescaped & reopens the injection.
    assert.strictEqual(escapeJsString('&#39;'), '\\x26#39;');
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

  test('a crafted file path cannot break out of an HTML attribute', () => {
    // Regression: file paths used to be interpolated into onclick="...".
    // escapeJsString turned " into \", which is a valid JS escape but still
    // a literal quote - and the HTML parser unquotes the attribute before
    // the JS parser ever sees it, so this closed the attribute and turned
    // the rest into a live event handler. Quotes in file names are legal
    // on Linux and macOS, so scanning an untrusted repo was enough.
    const evilPath = `/repo/src/a" onmouseover="alert(document.domain)" x=".js`;
    const duplicates = [
      {
        similarity: '100.00',
        matchType: 'exact',
        func1: { name: 'foo', filePath: evilPath, line: 1, originalBody: 'return 1;' },
        func2: { name: 'bar', filePath: '/repo/src/b.js', line: 2, originalBody: 'return 1;' },
      },
    ];
    const html = generateHTML(duplicates, { filesScanned: 2, functionsFound: 2, duplicatesFound: 1, threshold: 70 });

    // A live handler would be `onmouseover="...`; the escaped rendering
    // keeps the quotes as &quot; entities, so the attribute never closes.
    assert.doesNotMatch(html, /onmouseover\s*=\s*"/, 'file path produced a live event handler');
    assert.match(html, /&quot; onmouseover=&quot;/, 'file path should render as escaped text');
  });

  test('embeds the open-file token so the page can authorize its own requests', () => {
    const html = generateHTML([], { filesScanned: 1, functionsFound: 1, duplicatesFound: 0, threshold: 70 }, 'abc123');
    assert.match(html, /const OPEN_FILE_TOKEN = "abc123";/);
    assert.doesNotMatch(html, /\{\{openFileToken\}\}/);
  });
});

describe('createServer HTTP endpoints', () => {
  let tmpDir;
  let server;
  let port;

  let siblingDir;

  function request(urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: urlPath, headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
      }).on('error', reject);
    });
  }

  // Every legitimate /open-file call carries the token the report page was
  // served with; tests that probe the token check itself use request().
  function get(urlPath, headers) {
    const separator = urlPath.includes('?') ? '&' : '?';
    return request(`${urlPath}${separator}token=${server.openFileToken}`, headers);
  }

  test('setup: create temp dir and start server', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-duplicates-ui-test-'));
    fs.writeFileSync(path.join(tmpDir, 'sample.js'), 'function foo() { return 1; }\n');
    // A sibling whose path shares tmpDir's string prefix - the case a
    // startsWith() boundary check wrongly accepts.
    siblingDir = `${tmpDir}-secrets`;
    fs.mkdirSync(siblingDir, { recursive: true });
    fs.writeFileSync(path.join(siblingDir, 'keys.js'), '// secrets\n');

    server = createServer(tmpDir, 70);
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  test('GET / returns 200 with an HTML report', async () => {
    const { status, body } = await request('/');
    assert.strictEqual(status, 200);
    assert.match(body, /<html/i);
  });

  test('GET / sends a restrictive Content-Security-Policy', async () => {
    const { headers } = await request('/');
    assert.match(headers['content-security-policy'], /default-src 'none'/);
    assert.match(headers['content-security-policy'], /connect-src 'self'/);
    assert.strictEqual(headers['x-content-type-options'], 'nosniff');
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

  test('GET /open-file cannot reach a sibling directory sharing the name prefix', async () => {
    // Regression: the boundary check was `absolutePath.startsWith(basePath)`,
    // so scanning /work/proj also granted access to /work/proj-secrets.
    const siblingFile = path.join(siblingDir, 'keys.js');
    const { status } = await get(`/open-file?path=${encodeURIComponent(siblingFile)}&line=1`);
    assert.strictEqual(status, 403);
  });

  test('GET /open-file rejects a symlink pointing outside the directory', async (t) => {
    const outsideFile = path.join(os.tmpdir(), 'find-duplicates-symlink-target.js');
    fs.writeFileSync(outsideFile, '// outside\n');
    const linkPath = path.join(tmpDir, 'escape-link.js');
    try {
      fs.symlinkSync(outsideFile, linkPath);
    } catch {
      // Creating symlinks on Windows needs elevation or developer mode.
      fs.rmSync(outsideFile, { force: true });
      return t.skip('symlink creation not permitted on this host');
    }

    const { status } = await get(`/open-file?path=${encodeURIComponent(linkPath)}&line=1`);
    assert.strictEqual(status, 403);
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(outsideFile, { force: true });
  });

  test('GET /open-file with a non-existent file within the directory returns 404', async () => {
    const missingPath = path.join(tmpDir, 'does-not-exist.js');
    const { status } = await get(`/open-file?path=${encodeURIComponent(missingPath)}&line=1`);
    assert.strictEqual(status, 404);
  });

  test('GET /open-file without a token returns 403', async () => {
    const filePath = path.join(tmpDir, 'sample.js');
    const { status } = await request(`/open-file?path=${encodeURIComponent(filePath)}&line=1`);
    assert.strictEqual(status, 403);
  });

  test('GET /open-file with a wrong token returns 403', async () => {
    const filePath = path.join(tmpDir, 'sample.js');
    const { status } = await request(`/open-file?path=${encodeURIComponent(filePath)}&line=1&token=nope`);
    assert.strictEqual(status, 403);
  });

  test('GET /open-file from a cross-site context returns 403', async () => {
    // What a drive-by <img src="http://127.0.0.1:2712/open-file?..."> on an
    // unrelated page looks like on the wire.
    const filePath = path.join(tmpDir, 'sample.js');
    const { status } = await get(
      `/open-file?path=${encodeURIComponent(filePath)}&line=1`,
      { 'Sec-Fetch-Site': 'cross-site' }
    );
    assert.strictEqual(status, 403);
  });

  test('GET /unknown-route returns 404', async () => {
    const { status } = await request('/unknown-route');
    assert.strictEqual(status, 404);
  });

  test('teardown: close server and remove temp dir', () => {
    return new Promise((resolve) => {
      server.close(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.rmSync(siblingDir, { recursive: true, force: true });
        resolve();
      });
    });
  });
});
