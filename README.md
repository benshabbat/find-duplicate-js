# 🔍 Find Duplicate JS

[![npm version](https://img.shields.io/npm/v/find-duplicate-js.svg)](https://www.npmjs.com/package/find-duplicate-js)
[![npm downloads](https://img.shields.io/npm/dm/find-duplicate-js.svg)](https://www.npmjs.com/package/find-duplicate-js)
[![license](https://img.shields.io/npm/l/find-duplicate-js.svg)](https://github.com/benshabbat/find-duplicate-js/blob/main/LICENSE)

A powerful and intelligent tool to detect duplicate and similar code in JavaScript and TypeScript projects. Find Duplicate JS helps you maintain cleaner codebases by automatically identifying redundant functions and code patterns across your project.

## 📋 Table of Contents

- [Why Use Find Duplicate JS?](#why-use-find-duplicate-js)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [CLI Mode](#cli-mode)
  - [Web UI Mode](#web-ui-mode)
- [How It Works](#how-it-works)
- [Configuration Options](#configuration-options)
- [Examples](#examples)
- [API](#api)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Links](#links)
- [License](#license)

## 🎯 Why Use Find Duplicate JS?

Duplicate code is a common problem in software development that leads to:
- **Maintenance Headaches**: Fixing bugs requires updating code in multiple places
- **Increased File Size**: Unnecessary code bloat
- **Inconsistencies**: Changes in one place might not be reflected elsewhere
- **Technical Debt**: Harder to refactor and improve code quality

Find Duplicate JS helps you identify these issues automatically, saving time and improving code quality.

## ✨ Features

- **🎯 Smart Function Detection**: Recognizes multiple function types
  - Arrow functions (`const func = () => {}`), including single-parameter forms (`x => {}`)
  - Arrows on object properties and class fields (`handler: (req) => {}`, `onClick = (e) => {}`)
  - Function declarations (`function func() {}`) and function expressions
  - Generators (`function* ids() {}`) and `export default function () {}`
  - Class methods, object methods, getters and setters
  - Async functions
  - TypeScript functions with type annotations, including multi-line parameter lists
  - Generic functions (`<T>`)
  
- **🧠 Intelligent Code Analysis**: 
  - Normalizes code to ignore irrelevant differences (whitespace, comments, variable names)
  - Keeps control flow intact — `if`/`return` and `while`/`delete` are not the same shape
  - Automatically removes TypeScript type annotations for semantic comparison
  - Uses Levenshtein distance algorithm for accurate similarity scoring
  - Configurable similarity threshold (default 70%)
  - Clusters mutually similar functions into groups (10 near-identical handlers = 1 group, not 45 pair rows)
  - Distinguishes **exact copies** from **structural** matches (same shape, different identifiers/strings)

- **🎨 Two Usage Modes**:
  - **CLI Mode**: Quick terminal-based analysis with detailed text output
  - **Web UI Mode**: Beautiful, interactive web interface with visual comparisons
  - **🖱️ Clickable Navigation**: Click on file paths or function names to open in VSCode (v1.6.0+)

- **🔒 Hardened web UI**:
  - Binds to `127.0.0.1` only — never exposed to your network
  - Treats scanned file names as untrusted input (safe to point at code you didn't write)
  - Editor launching never goes through a shell on Linux/macOS
  - `/open-file` is scoped to the scanned directory, symlinks included, and requires a per-session token

- **⚡ Performance**:
  - Recursively scans entire project directories
  - Automatically skips `node_modules`, `.git`, `dist`, `build`, `out`, and `coverage` folders, plus framework build/cache directories (`.next`, `.nuxt`, `.output`, `.svelte-kit`, `.astro`, `.angular`, `.turbo`, `.vercel`, `.cache`, `.parcel-cache`)
  - Optionally honours your `.gitignore` (`--gitignore`)
  - Handles `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, and `.cts` files
  - Skips declaration files (`.d.ts`) and minified bundles (`.min.js`)
  - Skips pairs that provably cannot match before running the expensive comparison
  - Survives symlink cycles and unreadable directories instead of crashing

- **🔧 Zero Configuration**: Works out of the box with sensible defaults — with an optional `.findduplicaterc.json` when you want to pin settings for CI

## 📦 Installation

### Global Installation (Recommended)

```bash
npm install -g find-duplicate-js
```

### Local Installation

```bash
npm install --save-dev find-duplicate-js
```

Then add to your `package.json` scripts:

```json
{
  "scripts": {
    "find-duplicate": "find-duplicate",
    "find-duplicate:ui": "find-duplicate --ui"
  }
}
```

Or use the built-in npm scripts:
```bash
npm start        # Run CLI mode
npm run ui       # Run UI mode
npm test         # Run tests
```

## 🚀 Usage

### CLI Mode

Run a quick analysis from the command line and get results in your terminal:

```bash
# Analyze current directory with default threshold (70%)
find-duplicate

# Analyze specific directory
find-duplicate ./src

# Custom similarity threshold (80%)
find-duplicate ./src 80

# Analyze entire project
find-duplicate . 75
```

**CLI Output Example:**

```
🚀 Searching for duplicate code in: ./src
📏 Similarity threshold: 70%

🔍 Scanning 15 JavaScript/TypeScript files...

📊 Found 42 functions total

⚠️  Found 3 pairs of similar functions in 2 groups:

═══════════════════════════════════════════════════════════════════════════════════════

📦 Group #1 - 3 functions - Similarity: 92.10-95.50% (structural)
   • calculateTotal()  src/utils/math.js:12
   • getTotalPrice()  src/components/cart.js:8
   • sumOrder()  src/orders/summary.js:31
   Code: const sum = items.reduce((acc, item) => acc + item.price, 0)...

─────────────────────────────────────────────────────────────────────────────────────

📦 Group #2 - 2 functions - Similarity: 100.00% (exact copies)
   • formatDate()  src/utils/date.js:4
   • formatDate()  src/reports/helpers.js:9
   Code: const d = new Date(value); return d.toISOString().slice(0, 1...

─────────────────────────────────────────────────────────────────────────────────────

ℹ️  Similarity is measured after normalizing identifiers and string literals.
   "structural" groups share the same shape but differ in names or literals;
   only "exact copies" are identical code (apart from formatting and comments).

💡 Summary: 2 duplicate groups (3 function pairs)
```

N functions that all match each other are reported as **one group** instead of N×(N-1)/2 pair rows, and every group is labeled either **exact copies** (identical apart from formatting/comments) or **structural** (same shape after identifier/string normalization — a structural "100%" is *not* a byte-for-byte copy).

### Web UI Mode

Launch an interactive web interface for a better visual experience using the `--ui` flag:

```bash
# Start web UI server (opens browser automatically)
find-duplicate --ui

# Analyze specific directory
find-duplicate --ui ./src

# Custom threshold
find-duplicate --ui ./src 80

# Custom port (default: 2712)
find-duplicate --ui ./src 80 --port 3000
```

**Alternative:** You can also use the dedicated UI command (backwards compatibility):
```bash
find-duplicate-ui ./src 80
```

The web interface will:
1. Start a local server on `http://127.0.0.1:2712` (loopback only — not reachable from your network)
2. Automatically open your default browser
3. Display an interactive dashboard with:
   - Project statistics
   - Color-coded duplicate pairs
   - Side-by-side code comparison
   - Similarity percentages
   - File paths and function names

**Features in Web UI:**
- 📊 **Statistics Dashboard**: Overview of scanned files, functions found, and duplicates
- 🎨 **Beautiful Design**: Modern, responsive interface
- 🔄 **Live Refresh**: Re-analyze your code with a single click
- 📱 **Mobile Friendly**: Works on all devices
- 🎯 **Easy Navigation**: Jump directly to problematic code
- 🖱️ **Click to Open in VSCode** (v1.6.0+): Click file paths or function names to instantly open them in VSCode at the exact line
  - Direct integration with VSCode
  - Visual hover effects show clickable elements
  - Cross-platform support (Windows, macOS, Linux)

### 🔒 Security of the web UI

The threat model worth stating plainly: **file names in the scanned tree are untrusted input.** If you scan a repository you didn't write, a crafted file name is attacker-controlled text that reaches the report page and the editor-launching endpoint. The UI is built so that this is safe.

- **Loopback only**: the server binds `127.0.0.1`, so the report — which contains absolute paths and source snippets — is never reachable from your network. To view it from another machine, tunnel to the host (`ssh -L 2712:127.0.0.1:2712 …`).
- **No injection surface for file names**: paths reach the page in `data-*` attributes and are read back as text, never interpolated into inline handlers or JavaScript.
- **No shell on the editor path**: `code` is launched via `spawn()` with array arguments. On Linux/macOS there is no shell fallback at all; the Windows retry exists only because VSCode installs `code` as a `.cmd` shim, and paths that could break its quoting are refused.
- **`/open-file` is scoped and authenticated**: requests must stay inside the scanned directory (compared by path segment, and re-checked after resolving symlinks), must carry the per-session token embedded in the page that served them, and are rejected if the browser marks them cross-site.
- **Defense in depth**: `Content-Security-Policy: default-src 'none'; connect-src 'self'` plus `nosniff` and `no-referrer`, so even an unforeseen injection has nowhere to send what it reads.

All of this is on by default with no configuration.

Found something? Please open a [security issue](https://github.com/benshabbat/find-duplicate-js/issues).

## 🔧 How It Works

### 1. **File Discovery**
Recursively scans your project directory and finds all `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, and `.cts` files, while intelligently skipping:
- `node_modules`
- `.git`
- Generic build outputs: `dist`, `build`, `out`, `coverage`
- Framework build/cache directories: `.next` (Next.js), `.nuxt`/`.output` (Nuxt), `.svelte-kit` (SvelteKit), `.astro` (Astro), `.angular` (Angular), `.turbo` (Turborepo), `.vercel` (Vercel), `.cache` (Gatsby and others), `.parcel-cache` (Parcel)
- Declaration files (`.d.ts`, `.d.mts`, `.d.cts`) and minified bundles (`.min.js`)
- Anything your `.gitignore` excludes, when `--gitignore` is passed

Symlinked directories are followed, but a link pointing back at one of its own ancestors is visited once rather than walked forever, and a directory that can't be read is reported and skipped instead of aborting the scan.

### 2. **Function Extraction**
Uses layered regex patterns plus a brace/string-aware scanner to identify and extract:
- Arrow functions bound to `const`/`let`/`var`, including single-parameter forms without parentheses (`x => { ... }`)
- Arrow functions assigned to object properties and class fields (`handler: (req) => { ... }`, `onClick = (e) => { ... }`)
- Traditional function declarations and function expressions
- Generators (`function* ids() { ... }`) and anonymous default exports (`export default function () { ... }`)
- Class and object methods, including getters and setters
- Async functions
- TypeScript functions with type annotations, including parameter lists spread over several lines
- Generic functions with type parameters

> **Note:** extraction is pattern-based rather than a full AST parse. That keeps the tool dependency-free and fast, at the cost of missing exotic constructs. If a function form you rely on isn't found, please open an issue with a snippet.

### 3. **Code Normalization**
Before comparison, the code is normalized to focus on logic rather than style:
- Removes all whitespace and line breaks
- Strips comments (single-line and multi-line)
- Removes TypeScript type annotations and generic parameters
- Replaces variable names with generic placeholders
- Replaces string literals with generic strings
- Removes template literals
- **Keeps reserved words** (`if`, `while`, `return`, `throw`, `true`, …) so that control flow survives normalization

That last point matters more than it sounds. If every word collapses to `V`, then `if (user) { return user.name; }` and `while (list) { delete list.head; }` both become `V(V){VV.V;}` — two functions sharing nothing but punctuation score as duplicates. Keeping the keywords means the normalized form still records *what the code does*, while erasing the names a copy-paste actually changes.

**Example:**
```javascript
// Original JavaScript Code
function calculateSum(num1, num2) {
  // Calculate sum of two numbers
  const result = num1 + num2;
  return result;
}

// Original TypeScript Code
function calculateSum(num1: number, num2: number): number {
  // Calculate sum of two numbers
  const result: number = num1 + num2;
  return result;
}

// Both Normalized to
constV=V+V;returnV;
```

This allows the tool to recognize that TypeScript and JavaScript versions of the same function are duplicates!

### 4. **Similarity Calculation**
Uses the **Levenshtein Distance** algorithm to calculate how similar two functions are:
- Measures the minimum number of edits needed to transform one string into another
- Converts to a percentage (0-100%)
- Compares against your configured threshold

### 5. **Results Presentation**
Presents findings in an easy-to-understand format (CLI or Web UI) showing:
- Groups of mutually similar functions (instead of a quadratic list of pairs)
- Their similarity percentage range and match type (exact copies vs. structural)
- File locations
- Code previews

## ⚙️ Configuration Options

### Command Line Arguments

```bash
find-duplicate [directory] [threshold]
find-duplicate-ui [directory] [threshold]
find-duplicate --version
find-duplicate --help
```

**Parameters:**
- `directory` (optional): Path to analyze. Default: current directory (`.`)
- `threshold` (optional): Similarity percentage (1-100). Default: `70`. Invalid or out-of-range values exit with an error instead of silently falling back to the default.
- `--ui` (optional flag): Launch the interactive web UI instead of printing to the terminal
- `--port <number>` (optional): Port for the web UI server (only with `--ui`; default: `2712`)
- `--exclude <names>` (optional): Comma-separated extra directory names to skip, e.g. `--exclude vendor,generated` (in addition to the built-in skip list: `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, and framework build/cache dirs like `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.vercel`, `.cache`)
- `--gitignore` (optional flag): Also skip files and directories your `.gitignore` excludes, including nested `.gitignore` files. Handy when build output lives somewhere the built-in skip list doesn't know about
- `--min-length <chars>` (optional): Ignore functions whose normalized body is shorter than this many characters. Useful for filtering out trivial one-liners (getters, `return true;` stubs) that otherwise match each other at 100%
- `--json` (optional flag): Print results as JSON for scripting/CI (cannot be combined with `--ui`)
- `--output <file>` (optional): Write the report to a file instead of stdout. Works for both the human-readable and `--json` formats (cannot be combined with `--ui`)
- `--config <file>` (optional): Read defaults from a JSON config file. Without it, a `.findduplicaterc.json` in the working directory is used if present
- `--fail-on-duplicates` (optional flag): Exit with code 1 if any duplicates are found — made for CI gates (cannot be combined with `--ui`)
- `--version` / `-v` (optional flag): Print the installed version and exit
- `--help` / `-h` (optional flag): Show usage help and exit

### Config File

Rather than repeating the same flags in every CI invocation, put them in `.findduplicaterc.json` at your project root:

```json
{
  "directory": "./src",
  "threshold": 80,
  "exclude": ["vendor", "generated"],
  "minLength": 30,
  "gitignore": true,
  "failOnDuplicates": true
}
```

```bash
find-duplicate                      # picks up .findduplicaterc.json automatically
find-duplicate --config ci.json     # or point at a specific file
find-duplicate ./lib 95             # command-line values always win
```

Supported keys: `directory`, `threshold`, `exclude` (array or comma-separated string), `minLength`, `port`, `output`, `ui`, `json`, `gitignore`, `failOnDuplicates`. **Command-line flags always override the config file.** An unknown key is a hard error rather than a silent no-op, so a typo like `minLenght` tells you instead of quietly changing nothing.

### JSON Output

For scripting and CI pipelines, `--json` prints a single machine-readable JSON object and nothing else:

```bash
find-duplicate ./src 80 --json
```

```json
{
  "schemaVersion": 1,
  "tool": { "name": "find-duplicate-js", "version": "1.10.0" },
  "directory": "/absolute/path/to/src",
  "threshold": 80,
  "filesScanned": 12,
  "totalFunctions": 42,
  "duplicates": [
    {
      "similarity": 95.5,
      "matchType": "structural",
      "func1": { "name": "validateUser", "file": "src/auth.js", "line": 10 },
      "func2": { "name": "checkCredentials", "file": "src/login.js", "line": 3 }
    }
  ],
  "groups": [
    {
      "similarity": { "min": 95.5, "max": 95.5 },
      "matchType": "structural",
      "pairCount": 1,
      "functions": [
        { "name": "validateUser", "file": "src/auth.js", "line": 10 },
        { "name": "checkCredentials", "file": "src/login.js", "line": 3 }
      ]
    }
  ]
}
```

`duplicates` lists every matching pair; `groups` clusters mutually similar functions (one entry per connected cluster, members sorted by file). `matchType` is `"exact"` when the code is identical apart from formatting and comments, or `"structural"` when it only matches after identifier/string normalization.

`schemaVersion` is bumped only when the shape of this document changes in a way that could break a consumer, so a script can assert on one number instead of sniffing for fields.

### Examples:

```bash
# Very strict (only near-identical code)
find-duplicate ./src 95

# Moderate (recommended)
find-duplicate ./src 70

# Lenient (catches more potential duplicates)
find-duplicate ./src 50
```

### Threshold Guidelines:

- **90-100%**: Nearly identical functions (different variable names only)
- **70-89%**: Very similar logic with minor variations
- **50-69%**: Similar patterns but with notable differences
- **Below 50%**: May produce many false positives

## 🎯 TypeScript Support

Find Duplicate JS now fully supports TypeScript! The tool intelligently handles TypeScript-specific syntax:

### Supported TypeScript Features

- ✅ **Type Annotations**: Function parameters, return types, and variable types
- ✅ **Interfaces and Type Aliases**: Automatically filtered during normalization
- ✅ **Generics**: Generic type parameters (`<T>`, `<T extends U>`)
- ✅ **Type Assertions**: `as` keyword syntax
- ✅ **Access Modifiers**: `public`, `private`, `protected`
- ✅ **Optional Parameters**: `param?: type`
- ✅ **Union and Intersection Types**: `type1 | type2`, `type1 & type2`

### How It Works

The tool normalizes TypeScript code by removing all type information, allowing it to detect duplicates regardless of whether they're written in JavaScript or TypeScript:

```typescript
// TypeScript version
function fetchUser(id: string): Promise<User> {
  return api.get<User>(`/users/${id}`);
}

// JavaScript version  
function getUserData(userId) {
  return api.get(`/users/${userId}`);
}

// Both will be detected as similar! ✅
```

## 🎨 JSX/TSX Smart Detection

**New in v1.5.0:** Intelligent handling of React components to avoid false positives!

### The Problem

Before v1.5.0, JSX templates with similar structure but different components were incorrectly flagged as duplicates:

```tsx
// Component 1
const FormA = () => (
  <div>
    <Button>Submit</Button>
    <Input value={name} />
  </div>
);

// Component 2
const FormB = () => (
  <div>
    <Card>Content</Card>
    <Image src={url} />
  </div>
);

// ❌ Old behavior: 100% duplicate (false positive!)
```

### The Solution

The tool now extracts and compares JSX component names:

- **Different components** → Low similarity (30%)
- **Same components** → High similarity (70-100%)
- **Partial overlap** → Weighted calculation

```tsx
// Example Results:
// Button + Input vs Card + Image = 30% (different components)
// Button + Input vs Button + Input = 100% (same components)
// Button + Form vs Button + TextArea = 85% (50% overlap)
```

### How Component Analysis Works

1. **Extract Components**: Identifies all JSX components (capitalized tags like `<Button>`, `<UserCard>`)
2. **Compare Sets**: Calculates overlap between component sets
3. **Adjust Similarity**: 
   - No overlap = 70% reduction in similarity
   - Partial overlap = weighted calculation (70% code structure + 30% component similarity)

This ensures that templates with truly different purposes aren't flagged as duplicates, while still catching actual code duplication.

### Mixed Projects

Works seamlessly in projects that contain both JavaScript and TypeScript:

```bash
# Analyze a mixed JS/TS project
find-duplicate ./src

# Files analyzed:
# ✅ .js files
# ✅ .jsx files  
# ✅ .ts files
# ✅ .tsx files
```

## 📚 Examples

### Example 1: Finding Exact Duplicates

**File 1: `auth.js`**
```javascript
function validateUser(username, password) {
  if (!username || !password) {
    return false;
  }
  return true;
}
```

**File 2: `login.js`**
```javascript
function checkCredentials(user, pass) {
  if (!user || !pass) {
    return false;
  }
  return true;
}
```

**Result**: 100% similarity - Same logic, different names (reported as a **structural** match, since the code isn't a byte-for-byte copy)

### Example 2: Similar Functions

**File 1: `cart.js`**
```javascript
const calculateTotal = (items) => {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

**File 2: `checkout.js`**
```javascript
const getTotalPrice = (products) => {
  let total = 0;
  products.forEach(product => {
    total += product.price;
  });
  return total;
}
```

**Result**: ~75% similarity - Same logic, different implementation

## 🔌 API

You can also use Find Duplicate JS programmatically in your Node.js projects:

```javascript
import { findDuplicates, findJsFiles } from 'find-duplicate-js';

// Find all JavaScript files
const files = findJsFiles('./src');
console.log(`Found ${files.length} files`);

// Find duplicates with 70% threshold
const result = findDuplicates('./src', 70);

console.log(`Total functions: ${result.totalFunctions}`);
console.log(`Duplicate pairs: ${result.duplicates.length}`);

// Iterate through duplicates
result.duplicates.forEach((dup, index) => {
  console.log(`\nMatch #${index + 1}:`);
  console.log(`Similarity: ${dup.similarity}%`);
  console.log(`Function 1: ${dup.func1.name} in ${dup.func1.filePath}`);
  console.log(`Function 2: ${dup.func2.name} in ${dup.func2.filePath}`);
});
```

### Available Functions

#### `findJsFiles(directory, fileList = [], excludeDirs = null)`
Returns an array of all JavaScript/TypeScript file paths in the directory (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts`), excluding declaration files and minified bundles. Pass a `Set` of directory names as `excludeDirs` to skip additional directories.

#### `collectSourceFiles(directory, options = {})`
The same walk, with the options the CLI uses: `excludeDirs` (a `Set` of extra directory names) and `gitignore` (a boolean; when true, `.gitignore` rules are applied). Prefer this over `findJsFiles` unless you need to pass your own accumulator.

```javascript
import { collectSourceFiles } from 'find-duplicate-js';

const files = collectSourceFiles('./src', { gitignore: true });
```

#### `findDuplicates(directory, threshold = 70, precomputedFiles = null, options = {})`
`options` supports `excludeDirs` (a `Set` of extra directory names to skip), `minLength` (minimum normalized-body length for a function to be compared), `gitignore` (apply `.gitignore` rules when this function walks the tree itself), and `onProgress` (a callback receiving `{ phase, current, total }` as files are parsed and functions compared).
Analyzes the directory and returns:
```javascript
{
  duplicates: [
    {
      func1: { name, body, originalBody, filePath, startIndex, line },
      func2: { name, body, originalBody, filePath, startIndex, line },
      similarity: "95.50",
      matchType: "structural" // or "exact" for byte-identical code
    }
  ],
  totalFunctions: 42
}
```

#### `groupDuplicates(duplicates)`
Clusters the `duplicates` array from `findDuplicates()` into groups of mutually similar functions (connected components). Returns one entry per cluster, largest first:
```javascript
[
  {
    functions: [/* member function objects, sorted by file then line */],
    pairs: [/* the duplicate pairs connecting them */],
    minSimilarity: 85.44,
    maxSimilarity: 97.6,
    matchType: "structural" // "exact" only if every pair is an exact copy
  }
]
```

#### `calculateSimilarity(code1, code2)`
Calculates similarity percentage between two code strings.

#### `normalizeCode(code)`
Normalizes JavaScript code for comparison.

#### `extractFunctions(code, filePath)`
Extracts all function declarations, expressions, arrow functions, and class methods from a code string.

#### `extractJSXComponents(code, filePath)`
Extracts JSX/TSX component functions from a code string, used to reduce false-positive duplicates between components and plain functions.

## 🔧 Troubleshooting

### Clickable File Paths Not Working (v1.6.0+)

If you don't see hover effects or can't click on file paths:

**1. Check Your Version**
```bash
find-duplicate --version
# Should show 1.6.0 or higher
```

**2. Update to Latest Version**
```bash
npm update -g find-duplicate-js
# or
npm install -g find-duplicate-js@latest
```

**3. Clear Browser Cache**
- Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac) to hard refresh
- Or clear your browser cache manually

**4. Verify VSCode CLI is Installed**
```bash
code --version
```
If not found, install VSCode and add it to PATH:
- Windows: Reinstall VSCode and check "Add to PATH" during installation
- Mac: Open VSCode, press `Cmd+Shift+P`, type "Shell Command: Install 'code' command in PATH"
- Linux: Usually installed automatically with VSCode

**5. Check Server Logs**
Look for these messages in the terminal:
```
📂 Attempting to open: /path/to/file.js:10
✅ File opened successfully
```

If you see errors, they might indicate:
- `File not found` - The file path is incorrect
- `Path traversal attempt blocked` - Security protection triggered (shouldn't happen with legitimate files)
- `spawn code ENOENT` - VSCode CLI not in PATH

### Web UI Not Loading

**1. Port Already in Use**
If port 2712 is busy:
```bash
# Find and kill the process using port 2712
# Windows:
netstat -ano | findstr :2712
taskkill /PID <PID> /F

# Mac/Linux:
lsof -ti:2712 | xargs kill -9
```

**2. Browser Not Opening Automatically**
Manually navigate to: `http://127.0.0.1:2712`

### General Issues

**"Module not found" Error**
```bash
# Reinstall the package
npm uninstall -g find-duplicate-js
npm install -g find-duplicate-js
```

**Permission Errors (Mac/Linux)**
```bash
sudo npm install -g find-duplicate-js
```

## ❓ FAQ

### Q: Why can't I see the hover effects on file paths?
**A:** You need version 1.6.0 or higher. Update with:
```bash
npm install -g find-duplicate-js@latest
```
Then clear your browser cache (Ctrl+Shift+R or Cmd+Shift+R).

### Q: Clicking on file paths doesn't open VSCode. What's wrong?
**A:** Make sure VSCode CLI is installed and in your PATH:
```bash
code --version
```
If not found, follow the [VSCode CLI installation guide](https://code.visualstudio.com/docs/editor/command-line).

### Q: Can I use this with other editors like Sublime or Atom?
**A:** Currently, only VSCode is supported for the click-to-open feature. The analysis still works for all editors.

### Q: Is it safe to run this on a repository I didn't write?
**A:** Yes — that case is explicitly part of the threat model, because file names in the scanned tree are attacker-controlled text. The web UI's report renders them as inert text, the endpoint that opens files in your editor never builds a shell command from them on Linux/macOS, and it refuses anything resolving outside the directory you scanned. See [Security of the web UI](#-security-of-the-web-ui) for specifics.

The tool reads files inside your project directory and writes nothing. The web UI listens on `127.0.0.1` only, so nothing is exposed to your network.

### Q: Does this work with TypeScript generics and complex types?
**A:** Yes! The tool automatically strips TypeScript type annotations for comparison, including:
- Generic types (`<T>`, `<T extends Type>`)
- Union and intersection types
- Type assertions
- Decorators

### Q: What similarity threshold should I use?
**A:** 
- **70-80%** (Default): Good balance, catches most duplicates
- **80-90%**: Stricter, only very similar code
- **60-70%**: More permissive, may include false positives
- **90-100%**: Only nearly identical code

### Q: Can I exclude certain directories?
**A:** Yes! The tool automatically skips:
- `node_modules/`
- `.git/`
- Build outputs: `dist/`, `build/`, `out/`, `coverage/`
- Framework build/cache dirs: `.next/`, `.nuxt/`, `.output/`, `.svelte-kit/`, `.astro/`, `.angular/`, `.turbo/`, `.vercel/`, `.cache/`, `.parcel-cache/`

For custom exclusions, use the `--exclude` flag:
```bash
find-duplicate ./src --exclude vendor,generated
```

Or reuse the ignore rules you already maintain:
```bash
find-duplicate ./src --gitignore
```

### Q: What does a "structural" 100% mean?
**A:** Similarity is computed after normalizing identifiers and string literals, so two functions with the same shape but different variable names, property names, or strings score 100%. The report labels those **structural**; only groups labeled **exact copies** are identical code (apart from formatting and comments). A structural match is still a useful signal — it usually means the pair is a candidate for extracting one parameterized function — but it is not a copy-paste.

### Q: How do I use this in CI/CD?
**A:** Use `--fail-on-duplicates`, which exits with code 1 when duplicates are found:
```bash
find-duplicate ./src 80 --fail-on-duplicates
```

For custom reporting, combine it with `--json` — the JSON is printed before the non-zero exit:
```bash
find-duplicate ./src 80 --json --fail-on-duplicates > duplicates.json
```

### Q: Why are JSX components not showing as duplicates?
**A:** Version 1.5.0+ includes smart JSX detection. Components using different React components (e.g., `<Button>` vs `<Card>`) are correctly identified as different, even if the structure is similar.

### Q: Does this support arrow functions and async/await?
**A:** Yes! The tool recognizes:
- Arrow functions (`const f = () => {}`)
- Async functions (`async function f() {}`)
- Async arrow functions (`const f = async () => {}`)
- Class methods and object methods
- Function declarations

### Q: How accurate is the similarity detection?
**A:** Very accurate! Uses the Levenshtein distance algorithm after:
- Normalizing whitespace
- Removing comments
- Stripping variable names and type annotations
- Standardizing code structure

### Q: Can I use this programmatically in my Node.js code?
**A:** Yes! See the [API section](#api) for examples.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/benshabbat/find-duplicate-js.git

# Install dependencies
cd find-duplicate-js
npm install

# Run locally
node find-duplicates.js ./src
node src/ui/find-duplicates-ui.js ./src
```

## 🔗 Links

- [npm Package](https://www.npmjs.com/package/find-duplicate-js)
- [GitHub Repository](https://github.com/benshabbat/find-duplicate-js)
- [Issues & Bug Reports](https://github.com/benshabbat/find-duplicate-js/issues)

## 📄 License

MIT © [benshabbat](https://github.com/benshabbat)

---

**Made with ❤️ to help developers write better code**

If you find this tool helpful, please consider giving it a ⭐ on [GitHub](https://github.com/benshabbat/find-duplicate-js)!
