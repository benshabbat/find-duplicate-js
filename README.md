# 🔍 Find Duplicate JS

[![npm version](https://img.shields.io/npm/v/find-duplicate-js.svg)](https://www.npmjs.com/package/find-duplicate-js)
[![npm downloads](https://img.shields.io/npm/dm/find-duplicate-js.svg)](https://www.npmjs.com/package/find-duplicate-js)
[![license](https://img.shields.io/npm/l/find-duplicate-js.svg)](https://github.com/benshabbat/find-duplicate-js/blob/main/LICENSE)

A powerful and intelligent tool to detect duplicate and similar code in JavaScript projects. Find Duplicate JS helps you maintain cleaner codebases by automatically identifying redundant functions and code patterns across your project.

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
  - Arrow functions (`const func = () => {}`)
  - Function declarations (`function func() {}`)
  - Class methods and object methods
  - Async functions
  
- **🧠 Intelligent Code Analysis**: 
  - Normalizes code to ignore irrelevant differences (whitespace, comments, variable names)
  - Uses Levenshtein distance algorithm for accurate similarity scoring
  - Configurable similarity threshold (default 70%)

- **🎨 Two Usage Modes**:
  - **CLI Mode**: Quick terminal-based analysis with detailed text output
  - **Web UI Mode**: Beautiful, interactive web interface with visual comparisons

- **⚡ Performance**:
  - Recursively scans entire project directories
  - Automatically skips `node_modules`, `.git`, `dist`, and `build` folders
  - Handles both `.js` and `.jsx` files

- **🔧 Zero Configuration**: Works out of the box with sensible defaults

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
    "find-duplicates": "find-duplicates ./src",
    "find-duplicates-ui": "find-duplicates-ui ./src"
  }
}
```

## 🚀 Usage

### CLI Mode

Run a quick analysis from the command line and get results in your terminal:

```bash
# Analyze current directory with default threshold (70%)
find-duplicates

# Analyze specific directory
find-duplicates ./src

# Custom similarity threshold (80%)
find-duplicates ./src 80

# Analyze entire project
find-duplicates . 75
```

**CLI Output Example:**

```
🚀 Searching for duplicate code in: ./src
📏 Similarity threshold: 70%

🔍 Scanning 15 JavaScript files...

📊 Found 42 functions total

⚠️  Found 3 pairs of similar functions:

═══════════════════════════════════════════════════════════════════════════════════════

📋 Match #1 - Similarity: 95.5%

   File 1: src/utils/math.js
   Function: calculateTotal()
   Code: const sum = items.reduce((acc, item) => acc + item.price, 0)...

   File 2: src/components/cart.js
   Function: getTotalPrice()
   Code: const total = products.reduce((acc, prod) => acc + prod.pri...

─────────────────────────────────────────────────────────────────────────────────────

💡 Summary: Found 3 duplicate function pairs
```

### Web UI Mode

Launch an interactive web interface for a better visual experience:

```bash
# Start web UI server (opens browser automatically)
find-duplicates-ui

# Analyze specific directory
find-duplicates-ui ./src

# Custom threshold
find-duplicates-ui ./src 80
```

The web interface will:
1. Start a local server on `http://localhost:3000`
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

## 🔧 How It Works

### 1. **File Discovery**
Recursively scans your project directory and finds all `.js` and `.jsx` files, while intelligently skipping:
- `node_modules`
- `.git`
- `dist`
- `build`

### 2. **Function Extraction**
Uses sophisticated regex patterns to identify and extract:
- Arrow functions with `const`, `let`, or `var`
- Traditional function declarations
- Class and object methods
- Async functions

### 3. **Code Normalization**
Before comparison, the code is normalized to focus on logic rather than style:
- Removes all whitespace and line breaks
- Strips comments (single-line and multi-line)
- Replaces variable names with generic placeholders
- Replaces string literals with generic strings
- Removes template literals

**Example:**
```javascript
// Original Code
function calculateSum(num1, num2) {
  // Calculate sum of two numbers
  const result = num1 + num2;
  return result;
}

// Normalized Code
V(){V=V+V;V;}
```

### 4. **Similarity Calculation**
Uses the **Levenshtein Distance** algorithm to calculate how similar two functions are:
- Measures the minimum number of edits needed to transform one string into another
- Converts to a percentage (0-100%)
- Compares against your configured threshold

### 5. **Results Presentation**
Presents findings in an easy-to-understand format (CLI or Web UI) showing:
- Which functions are similar
- Their similarity percentage
- File locations
- Code previews

## ⚙️ Configuration Options

### Command Line Arguments

```bash
find-duplicates [directory] [threshold]
find-duplicates-ui [directory] [threshold]
```

**Parameters:**
- `directory` (optional): Path to analyze. Default: current directory (`.`)
- `threshold` (optional): Similarity percentage (0-100). Default: `70`

### Examples:

```bash
# Very strict (only near-identical code)
find-duplicates ./src 95

# Moderate (recommended)
find-duplicates ./src 70

# Lenient (catches more potential duplicates)
find-duplicates ./src 50
```

### Threshold Guidelines:

- **90-100%**: Nearly identical functions (different variable names only)
- **70-89%**: Very similar logic with minor variations
- **50-69%**: Similar patterns but with notable differences
- **Below 50%**: May produce many false positives

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

**Result**: 100% similarity - Same logic, different names

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

#### `findJsFiles(directory)`
Returns an array of all `.js` and `.jsx` file paths in the directory.

#### `findDuplicates(directory, threshold = 70)`
Analyzes the directory and returns:
```javascript
{
  duplicates: [
    {
      func1: { name, body, originalBody, filePath, startIndex },
      func2: { name, body, originalBody, filePath, startIndex },
      similarity: "95.50"
    }
  ],
  totalFunctions: 42
}
```

#### `calculateSimilarity(code1, code2)`
Calculates similarity percentage between two code strings.

#### `normalizeCode(code)`
Normalizes JavaScript code for comparison.

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
node find-duplicates-ui.js ./src
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
