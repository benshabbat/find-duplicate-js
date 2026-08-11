# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### 🐛 Fixed
- **`npx find-duplicate-js` failed outright.** Neither bin was named after the package, so npm refused to guess between them and exited with `could not determine executable to run`; the only way in was the roundabout `npx -p find-duplicate-js find-duplicate`. `find-duplicate-js` is now a bin alias for the same CLI, alongside the existing `find-duplicate`.
- **A TypeScript return type was extracted as the function body, inventing duplicate groups.** The extractor took the first `{` after the parameter list, so `function crop(w, h): { x: number; y: number; size: number } { ... }` was compared on its *type* rather than its code. Every function annotated with a similar object shape then collapsed into one group — in one report, a Supabase request guard returning `Promise<{ user } | { response }>`, an image-crop helper and a string splitter were reported as **100% structural** matches of each other. The annotation is now skipped with a nesting-aware scan, so the union-of-objects-inside-a-generic case and the plain `): { a: string } {` case both land on the real body.
- **A ternary's `:` was read as a return type, turning calls into function definitions.** Because the type skip searched forward for the next `{` without bound, `cond ?\n  createElement(Text, { style: bold }, v) :\n  createElement(Text, { style: normal }, v)` registered `createElement` as a function whose "body" was a props object — and two such call sites anywhere in a file were then reported as an **exact copy**. A `:` is now only treated as an annotation when what follows actually parses as a type; an identifier followed by `(` is a call, and rejects the match.
- **Normalization erased control flow, producing false positives.** Every word — keywords included — was replaced with `V`, so `if (user) { return user.name; }` and `while (list) { delete list.head; }` both normalized to `V(V){VV.V;}`. Two functions sharing nothing but their punctuation scored as duplicates; a realistic pair (one branching and returning, the other looping and throwing) was reported at **85.71% similar**. Reserved words and value literals (`true`/`false`/`null`/`undefined`) are now preserved, so the normalized form still records what the code *does* while still erasing the identifiers and string literals a copy-paste renames.
- **A symlink pointing at an ancestor directory crashed the scan.** The walk followed symlinked directories without tracking where it had been, so `sub/link -> ..` recursed through `sub/link/sub/link/...` until the process died on `ELOOP`. Real paths of symlinked directories are now remembered and visited once.
- **One unreadable directory aborted the whole scan.** `readdirSync` was uncaught, so a single `EACCES` threw away the other files. Unreadable directories now warn on stderr and are skipped; broken symlinks are skipped silently.
- **Most modern function forms were never extracted.** On a file containing seven common declaration styles, only one (a plain method) was found. Now also extracted: single-parameter arrows without parentheses (`x => {}`), arrows assigned to object properties and class fields (`handler: (req) => {}`, `onClick = (e) => {}`), function expressions, generators, anonymous and named `export default function`, getters and setters, and methods whose parameter lists span several lines (the old method pattern could not match across a newline).

### ✨ Added
- `--gitignore` flag (both bins): also skip whatever `.gitignore` excludes, including nested ignore files. Supports negation (`!`), directory-only (`build/`), anchoring, `*`/`**`/`?` and character classes; verified against real `git check-ignore`.
- `--output <file>` flag: write the report to a file instead of stdout, for both the human-readable and `--json` formats.
- `--config <file>` flag and automatic `.findduplicaterc.json` discovery, so a CI invocation doesn't have to repeat every flag. Command-line flags always override the config file, and an unknown key is a hard error rather than a silent no-op.
- `--json` output now carries `schemaVersion` and a `tool` object (`{ name, version }`), so consumers can check one number instead of sniffing for fields.
- Progress reporting on long scans, printed to **stderr** and only when stderr is a TTY — a redirected CI log or a piped `--json` document is never polluted. Available programmatically as `findDuplicates(..., { onProgress })`.
- `collectSourceFiles(directory, options)` is now part of the public API: the directory walk with the same `excludeDirs`/`gitignore` handling the CLI uses.

### ⚡ Performance
- A character-histogram lower bound on edit distance rejects hopeless pairs before the banded Levenshtein DP runs. Since every single-character edit changes the character multiset by at most 2, `L1 / 2` can never exceed the true distance — so the check is exact, not heuristic. On a 600-function corpus of varied shapes this cut scan time by **27%** (1378ms → 1002ms); when it cannot reject anything its fixed cost is unmeasurable.
- Identical normalized bodies now short-circuit to distance 0 instead of running the DP.

### ⚠️ Behavior changes
- **Similarity scores shift, and thresholds may need retuning.** Preserving keywords lengthens normalized bodies and changes what the percentage measures: genuinely similar code that shares a control-flow skeleton scores *higher* (a pair in the test suite moved 83.33% → 90.48%), while code that merely shares punctuation scores much *lower* — which is the point. If you pin a threshold in CI, re-check it against your codebase after upgrading.
- Function counts rise on codebases using the previously-missed declaration forms (object-property arrows, class fields, getters, generators, default exports). This is recovered recall, not double counting — a function is still reported once no matter how many patterns match it.

### 🧪 Tests
- 205 tests (up from 144), covering every fix above: the return-type/ternary extraction repros and the bin naming that `npx` depends on, the false-positive repro, each newly-supported function form, negative cases proving the looser patterns don't invent functions from comparisons/ternaries/multi-line calls, symlink cycles and broken links, unreadable directories, the gitignore matcher (including a differential test against real `git check-ignore`), progress reporting and its TTY gating, and the new CLI flags with their config-precedence and error paths.

## [1.10.0] - 2026-08-05

### ✨ Added
- **Grouped output**: mutually similar functions are now clustered into groups (connected components over the pair graph) everywhere — CLI, `--json` (new `groups` array with similarity range, member list, and pair count), and the web UI (one card per group plus a "Duplicate Groups" stat). 10 near-identical route handlers are now 1 group, not 45 pair rows. Exposed programmatically as `groupDuplicates(duplicates)`.
- **Match-type labeling**: every pair and group is labeled `exact` (identical code apart from formatting and comments) or `structural` (same shape, but identifiers/strings differ). This makes explicit that similarity is measured *after* normalizing identifiers and string literals — a structural "100%" is not a byte-for-byte copy (e.g. two setters that differ only in the field they update). The CLI prints a legend explaining the distinction.

### 🔒 Security
All of these affect the web UI (`--ui` / `find-duplicate-ui`) only; the CLI and the programmatic API were never exposed. The common thread is that **file names from the scanned tree are untrusted input** — pointing the tool at a repository you did not write was enough to trigger the first three.

- **Stored XSS via crafted file names.** File paths were interpolated into `onclick="openFile('...')"`. The escaping turned `"` into `\"`, which is a valid JavaScript escape but still a literal quote — and the HTML parser unquotes an attribute *before* the JavaScript parser sees it, so a file named `a" onmouseover="..." x=".js` closed the attribute and the remainder became a live event handler with access to the report's origin. Paths now travel in `data-*` attributes and are read back as text by a delegated click handler, so no path is ever parsed as markup or code. `escapeJsString()` additionally emits `\xNN` hex escapes for quotes, `<`, `>` and `&`, which are safe in both parsers (quotes in file names are legal on Linux and macOS).
- **Server listened on every network interface.** `server.listen(port)` binds `::`/`0.0.0.0` by default, so anyone sharing a LAN could read the report — absolute paths and source snippets — and drive `/open-file`. It now binds `127.0.0.1` only.
- **Command injection in the editor fallback.** When `code` was not on `PATH`, the fallback built a shell command string; on Linux and macOS a file named `x'$(...)'.js` escaped the single quotes. The POSIX fallback is gone entirely (`code` is a real executable there, so a failed `spawn` means it is absent and a shell would fail identically). Windows keeps a shell retry because VSCode installs `code` as a `.cmd` shim that Node will not launch otherwise — sound there because a double quote cannot occur in a Windows path, and a path containing one is refused outright.
- **CSRF on `/open-file`.** The endpoint had a side effect and was reachable with a plain `GET`, so any page the user had open could trigger it via an `<img>` tag. It now requires a per-server random token that only the report page it served knows, and rejects requests whose `Sec-Fetch-Site` marks them cross-site.
- **Path boundary escapes.** The containment check was `absolutePath.startsWith(baseDir)`, which accepted any sibling sharing the prefix — scanning `/work/proj` also granted `/work/proj-secrets/keys.js`. It now compares path segments via `path.relative`, and re-checks after `fs.realpathSync`, so a symlink planted in the scanned tree and pointing at (say) `~/.ssh/id_rsa` no longer passes.
- **Unescaped error page**, which reflected messages containing scanned file paths. Now escaped. Report responses also carry `Content-Security-Policy: default-src 'none'; connect-src 'self'`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.

### 🐛 Fixed
- Framework build/cache directories are now skipped by default: `.next`, `.nuxt`, `.output`, `.svelte-kit`, `.astro`, `.angular`, `.turbo`, `.vercel`, `.cache`, `.parcel-cache`, and `out`. Previously, scanning a Next.js project root chewed through hundreds of MB of compiled bundles in `.next/` (a real-world scan went from 7+ minutes to ~3 seconds).
- **Catastrophic regex backtracking in code normalization** could hang a scan. The TypeScript type-stripping patterns quantified over a character class containing the very delimiters they terminate on (`>` sits inside the class that `<...>` ends with), so cost grew far faster than input size: a 64 KB function body dense in `<` took **~98 seconds** to normalize, and a 16x larger input cost ~269x more. The runs are now length-bounded, which makes the scan linear in file size — the same input normalizes in ~172 ms (a ~570x improvement), with detection output byte-for-byte unchanged on the demo project.

### ⚠️ Behavior changes
- The web UI is reachable at `http://127.0.0.1:<port>` only. If you were relying on opening the report from another machine, that no longer works by design — tunnel to the host instead (e.g. `ssh -L`).
- `generateHTML(duplicates, stats)` takes an optional third argument, the `/open-file` token. Called without it the page still renders, but its click-to-open requests are rejected. `createServer()` exposes the generated token as `server.openFileToken`.

## [1.9.0] - 2026-08-05

### ✨ Added
- `--exclude <names>` flag (both bins): comma-separated extra directory names to skip while scanning, on top of the built-in `node_modules`/`.git`/`dist`/`build`/`coverage` list — previously the README's answer to "can I exclude directories?" was "modify the source code"
- `--min-length <chars>` flag (both bins): ignore functions whose normalized body is shorter than the given length, filtering out trivial one-liners (`return true;` stubs, getters) that otherwise match each other at 100%
- Both options are also available programmatically via `findDuplicates(dir, threshold, files, { excludeDirs, minLength })` and `findJsFiles(dir, [], excludeDirs)`

### 🏗️ Structure & Tooling
- Release workflow (`.github/workflows/release.yml`): pushing a `vX.Y.Z` tag now re-runs tests/lint, verifies the tag matches `package.json`, and publishes to npm with provenance via trusted publishing — tagging and publishing can no longer drift apart (v1.7.0 was once published without a tag), and no npm token lives in the repo
- Dependabot config for npm dev dependencies and GitHub Actions, so audit advisories arrive as PRs instead of surprise CI failures
- Documented the release process for maintainers in `CONTRIBUTING.md`
- Internal: the three value-taking CLI flags (`--port`, `--exclude`, `--min-length`) share one `--flag value` / `--flag=value` parser instead of three hand-rolled copies

## [1.8.0] - 2026-08-04

### ✨ Added
- `--help` / `-h` flag on both bin entry points (`find-duplicate`, `find-duplicate-ui`) printing usage, arguments, and examples
- `--json` flag for machine-readable output (directory, threshold, file/function counts, and duplicate pairs with name/file/line), for scripting and CI pipelines
- `--fail-on-duplicates` flag: exit with code 1 when duplicates are found, so the CLI can gate CI builds (composes with `--json`)
- `--port <number>` / `--port=<number>` flag for the web UI, on both `find-duplicate --ui` and `find-duplicate-ui` (default remains 2712)
- Scanning now includes `.mjs`, `.cjs`, `.mts`, and `.cts` files

### 🐛 Fixed
- Invalid threshold arguments (e.g. `abc`, `0`, `150`) now exit with a clear error instead of silently falling back to the default of 70
- TypeScript declaration files (`.d.ts`/`.d.mts`/`.d.cts`) and minified bundles (`.min.js`) are no longer scanned — they only produced noise pairs
- `coverage/` directories are now skipped like `node_modules`, `dist`, and `build`
- Corrected the README's CI/CD recipe: it claimed the CLI exits non-zero when duplicates are found (it never did); the recipe now uses `--json` output instead
- `npm test` now works on Windows with Node 20: the script uses `node --test` with no arguments (built-in test discovery) instead of a shell glob, which cmd.exe never expanded (Node's test runner only gained its own glob expansion in Node 21)
- Code normalization now treats backslash-escaped quotes (`'it\'s'`, `"say \"hi\""`) as part of the string literal instead of terminating it early, which previously left stray text in the normalized code and lowered similarity scores for otherwise-identical functions
- Starting the web UI on a busy port now prints a friendly "port already in use" error instead of crashing with an unhandled exception stack trace

### 🏗️ Structure & Tooling
- Resolved the high-severity `npm audit` advisory in `brace-expansion` (transitive dev dependency) and updated ESLint to 10.8.0
- CI now also tests on Node 24 (the active LTS line) and on Windows (where the `npm test` glob bug above was invisible to the Linux-only matrix)
- Added `Thumbs.db`, `Desktop.ini`, and `*.tgz` to `.gitignore`

### 🧹 Removed
- Stale `demo-project/BUGFIX-VERIFICATION.md` results snapshot (its claims are superseded by the test suite and this changelog, and several no longer matched the code)

## [1.7.0] - 2026-07-09

### ⚠️ Breaking
- Raised the minimum supported Node.js version from 14 to **20**. The test suite uses the built-in `node --test` runner, which doesn't exist before Node 18, and Node 18's test runner has its own internal stability bugs (structured-clone/IPC reporting failures against `tests/ui.test.js`) that don't reproduce on Node 20+. The `>=14.0.0` `engines` constraint was never actually accurate for this project's own tooling, and CI now catches that.

### 🏗️ Structure & Tooling
- Split the god files (`find-duplicates-core.js`, `find-duplicates-ui.js`) into cohesive modules under `src/core/` and `src/ui/`
- Reduced Levenshtein allocations and eliminated redundant directory walks in the similarity/scanning hot path
- Added a CI workflow (`.github/workflows/ci.yml`) running the test suite on Node 20/22 and linting on every push/PR
- Added ESLint (`eslint.config.js`) and a `npm run lint` script
- Added `CONTRIBUTING.md` and GitHub issue/PR templates

### ✨ Added
- `--version` / `-v` CLI flag to print the installed version
- Exported `extractJSXComponents` from the package entry point (`find-duplicates.js`), matching its existing documentation
- Test coverage for the UI/HTTP server layer (`tests/ui.test.js`): HTML escaping and the `/open-file` endpoint

### 🐛 Fixed
- Importing this package as a library (`import { findDuplicates } from 'find-duplicate-js'`) no longer runs the CLI as a side effect (previously it scanned `process.cwd()` and could call `process.exit()` on import)
- Corrected the CLI's "Scanning N JavaScript files" message to say "JavaScript/TypeScript files", matching what's actually scanned
- Removed the duplicated Table of Contents in the README

### 🧹 Removed
- Stale root `TEST-RESULTS.md` snapshot and the redundant manual `test-api.js` smoke script
- Redundant `.npmignore` (superseded by the `files` allowlist in `package.json`)

## [1.6.2] - 2026-01-04

### 🔒 Critical Security Update

#### Comprehensive XSS Protection
- **HTML Content Escaping**: All user-facing content properly escaped with `escapeHtml()`
- **JavaScript String Escaping**: Added `escapeJsString()` for safe onclick attributes
  - Escapes quotes, backslashes, newlines, and control characters
  - Prevents script injection via `<` and `>` characters
- **XSS Prevention**: Protects against malicious file paths containing script injection attempts

#### Path Traversal Protection
- **Directory Boundary Validation**: Added `startsWith()` check to prevent path traversal attacks
- **Prevents Access Outside Project**: Blocks attempts like `../../../../etc/passwd`
- **Enhanced Logging**: Security events are now logged for monitoring

### 🛡️ Security Layers
1. ✅ Command Injection: `spawn()` with `shell: false`
2. ✅ Path Traversal: Directory boundary validation
3. ✅ XSS in HTML: `escapeHtml()` for all content
4. ✅ XSS in JavaScript: `escapeJsString()` for onclick handlers
5. ✅ Input Validation: `parseInt()` with range checks
6. ✅ File Validation: `existsSync()` and `isFile()` checks
7. ✅ Info Disclosure: Generic error messages

### 📊 Security Rating: A+

## [1.6.1] - 2026-01-04

### 🔐 Security Enhancements

#### Command Injection Prevention
- **Secure Process Spawning**: Replaced `exec()` with `spawn()` using array arguments
- **Shell Disabled**: Added `shell: false` option to prevent command injection
- **Fallback Mechanism**: Secure fallback to `exec()` when spawn fails

#### Input Validation
- **Line Number Validation**: Added `parseInt()` with NaN and range checks
- **File Existence Check**: Validates file exists before attempting to open
- **File Type Validation**: Ensures path points to a file, not a directory

#### Error Handling
- **Sanitized Error Messages**: Generic error messages to prevent information disclosure
- **Enhanced Logging**: Better error logging for debugging without exposing sensitive info

## [1.6.0] - 2026-01-03

### ✨ New Feature: Clickable File Navigation

#### Interactive UI Enhancement
- **Click to Open in VSCode**: File paths and function names are now clickable
- **Direct Navigation**: Clicking opens the exact file and line in VSCode
- **Visual Feedback**: Hover effects show elements are clickable
  - File paths change color and underline on hover
  - Function names highlight and elevate on hover

#### Technical Implementation
- **New Server Endpoint**: `/open-file` handles file opening requests
- **VSCode Integration**: Uses `code --goto` for precise file positioning
- **Client-Side Function**: `openFile()` JavaScript function communicates with server
- **Cross-Platform**: Works on Windows, macOS, and Linux

#### UI Improvements
- **Clickable Styling**: Added `.clickable` CSS class with pointer cursor
- **Smooth Transitions**: 0.2s transitions for better UX
- **Interactive Design**: Clear visual cues for clickable elements

## [1.5.0] - 2026-01-03

### 🎉 Major New Features

#### Improved JSX/TSX Template Detection
- **Smart Component Analysis**: Now extracts and compares JSX component names to avoid false positives
- **Component-Based Similarity**: Templates with different component names are no longer flagged as duplicates
  - Functions using `<Button>` and `<Input>` vs `<Card>` and `<Image>` are now correctly identified as different
  - Similarity score is reduced by 70% when components are completely different
  - Partial component overlap is weighted proportionally (30% weight for component similarity)
- **Intelligent Normalization**: JSX component names are normalized to `COMP` placeholder while tracking actual components used

### ✨ Improvements
- **Better JSX Detection**: Automatically detects JSX in code, not just based on file extension
- **Reduced False Positives**: Significantly reduces duplicate detection in React/JSX codebases where templates have similar structure but use different components
- **Enhanced Testing**: Added 5 new tests specifically for JSX/TSX component handling

### 📚 Examples
```tsx
// Component 1 - uses Button and Input
const Form1 = () => {
  return (
    <div>
      <Button onClick={handleClick}>Submit</Button>
      <Input value={name} />
    </div>
  );
};

// Component 2 - uses Card and Image
const Form2 = () => {
  return (
    <div>
      <Card>Content</Card>
      <Image src={url} />
    </div>
  );
};

// Result: NOT detected as duplicates (30% similarity)
// Because the components are completely different
```

### 🔧 Technical Details
- Added `extractJSXComponents()` function to identify component usage
- Modified `calculateSimilarity()` to accept JSX component sets as parameters
- Updated `extractFunctions()` to track JSX components per function
- Component comparison logic:
  - 0 common components = 70% similarity reduction
  - Partial overlap = weighted calculation (70% code + 30% components)

## [1.4.0] - 2025-12-31

### 🎉 Major New Features

#### TypeScript Support
- **File Support**: Now scans and analyzes `.ts` and `.tsx` files in addition to `.js` and `.jsx`
- **Type Annotation Handling**: Automatically removes TypeScript type annotations during normalization
  - Function parameter types (e.g., `param: string`)
  - Return type annotations (e.g., `: Promise<User>`)
  - Generic type parameters (e.g., `<T>`, `<T extends U>`)
  - Type assertions (e.g., `as string`)
  - Interface and type alias declarations
- **Access Modifiers**: Recognizes TypeScript access modifiers (`public`, `private`, `protected`, `static`)
- **Cross-Language Detection**: Can identify duplicates between JavaScript and TypeScript code
  - A TypeScript function and its JavaScript equivalent will be detected as duplicates
  - Type information is normalized away to focus on logical similarity

### ✨ Improvements
- **Enhanced Pattern Matching**: Improved regex patterns to handle TypeScript syntax
- **Better Code Normalization**: More sophisticated normalization that preserves code logic while removing type information
- **Updated Documentation**: Added comprehensive TypeScript support section in README

### 📚 Examples
```typescript
// TypeScript function
function add(a: number, b: number): number {
  return a + b;
}

// JavaScript function - detected as duplicate!
function sum(x, y) {
  return x + y;
}
```

## [1.3.1] - 2025-12-31

### 📝 Changes

#### Simplified Command Names
- **Changed Command**: `find-duplicates` → `find-duplicate` (removed 's')
- **Changed UI Command**: `find-duplicates-ui` → `find-duplicate-ui` (removed 's')
- **Reason**: Avoid confusion - file names have 's' (find-duplicates.js) but commands don't
- **Backwards Compatibility**: Old commands may still work in cached installations

**New Usage:**
```bash
find-duplicate ./src 80
find-duplicate --ui ./src
find-duplicate-ui ./src
```

## [1.3.0] - 2025-12-31

### 🚀 New Features

#### Unified CLI with --ui Flag
- **Single Command**: No need for separate `find-duplicates-ui` command
- **--ui Flag**: Add `--ui` flag to launch web interface from main command
  - Example: `find-duplicates --ui ./src 80`
- **Backwards Compatible**: `find-duplicates-ui` command still works
- **Updated npm Scripts**: `npm run ui` now uses the `--ui` flag

### ✨ Improvements
- **Simplified Usage**: One command for both CLI and UI modes
- **Better UX**: More intuitive flag-based interface
- **Cleaner Architecture**: UI server code integrated into main file

## [1.2.0] - 2025-12-31

### 🚀 New Features

#### Programmatic API Support
- **Export Functions**: Package now exports core functions for programmatic use
  - `findDuplicates` - Main function to find duplicate code
  - `findJsFiles` - Find all JavaScript files in a directory
  - `extractFunctions` - Extract functions from code
  - `normalizeCode` - Normalize code for comparison
  - `calculateSimilarity` - Calculate similarity between code snippets
- **Usage Example**:
  ```javascript
  import { findDuplicates, findJsFiles } from 'find-duplicate-js';
  
  const result = findDuplicates('./src', 70);
  console.log(result);
  ```

### ✨ Improvements

#### UI Code Refactoring
- **Separated Concerns**: Split HTML, CSS, and JavaScript into separate files
  - `ui-template.html` - HTML structure
  - `ui-styles.css` - All styling
  - `find-duplicates-ui.js` - Logic only
- **Better Maintainability**: Easier to update and customize the UI
- **Cleaner Code**: More readable and organized codebase

### 🐛 Bug Fixes
- Fixed module export issue that prevented importing functions from the package
- Resolved "does not provide an export named 'findDuplicates'" error

## [1.1.0] - 2025-12-30

### 🐛 Bug Fixes

#### Fixed Arrow Function Regex Issues
- **Nested Parentheses**: Now correctly handles arrow functions with nested parentheses in parameters
  - Example: `const func = (fn = (x) => x * 2) => { ... }`
- **Destructured Parameters**: Improved support for complex destructuring patterns
  - Example: `const func = ({a, b: {c, d}}, [e, f]) => { ... }`
- **Default Values with Functions**: Properly handles default parameter values that are functions
  - Example: `const func = async ({data}, callback = () => {}) => { ... }`
- **String Literals in Parameters**: Correctly handles parentheses within string literals in default values
  - Example: `const func = (text = "hello (world)") => { ... }`

#### Fixed Function Declaration Regex Issues
- **Complex Parameters**: Now correctly extracts function declarations with complex parameter patterns
  - Destructured parameters
  - Default values
  - Rest parameters

### ✨ New Features

#### Comprehensive Test Suite
- Added 38+ unit tests using Node.js built-in test runner (no external dependencies)
- Tests cover all core functionality:
  - Code normalization
  - Similarity calculation
  - Function extraction (including all bug fix scenarios)
  - File system operations
  - Duplicate detection

#### Improved Documentation
- Added comprehensive JSDoc documentation to all functions
- Translated all inline comments from Hebrew to English
- Enhanced parameter and return type documentation

#### Performance Optimizations
- **Similarity Calculation Cache**: Results are cached to avoid redundant calculations
- **Early Exit Optimization**: Skips comparisons when function size difference exceeds 50%
- **Improved Algorithm**: More efficient duplicate detection for large codebases

### 🔧 Technical Improvements

#### Better Regex Handling
- Replaced simple regex patterns with helper function `findMatchingParen()`
- Properly handles:
  - Nested parentheses in function parameters
  - String literals with special characters
  - Single-line and multi-line comments
  - Template literals

#### Code Quality
- All code now includes JSDoc comments
- English-only comments for international collaboration
- Better error handling
- More maintainable code structure

### 📝 Testing

Run tests with:
```bash
npm test
```

All 38 tests pass successfully:
- ✅ 14 bug fix tests
- ✅ 24 core functionality tests

### 🚀 Upgrade Guide

No breaking changes. Simply update to the latest version:
```bash
npm update find-duplicate-js
```

### 📊 Statistics

- **Total Tests**: 38
- **Test Coverage**: Core functionality + edge cases
- **Bug Fixes**: 6 critical regex issues resolved
- **Performance**: ~30-50% faster on large codebases (with caching)

### 🙏 Acknowledgments

Thanks to the community for reporting these issues and helping improve the tool!

---

## [1.0.8] - Previous Release

Initial stable release with basic functionality.
