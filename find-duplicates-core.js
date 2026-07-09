import fs from 'fs';
import path from 'path';

/**
 * Finds the matching closing parenthesis for an opening parenthesis
 * @param {string} code - The JavaScript source code
 * @param {number} openParenIndex - The index of the opening parenthesis
 * @returns {number} The index of the matching closing parenthesis, or -1 if not found
 * @description Handles nested parentheses, strings, and comments correctly
 */
function findMatchingParen(code, openParenIndex) {
  let depth = 1;
  let i = openParenIndex + 1;
  let inString = false;
  let stringChar = '';
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  
  while (i < code.length && depth > 0) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';
    const nextChar = i < code.length - 1 ? code[i + 1] : '';
    
    // Handle single-line comments
    if (!inString && !inMultiLineComment && char === '/' && nextChar === '/') {
      inSingleLineComment = true;
      i++;
      continue;
    }
    
    if (inSingleLineComment) {
      if (char === '\n') {
        inSingleLineComment = false;
      }
      i++;
      continue;
    }
    
    // Handle multi-line comments
    if (!inString && !inSingleLineComment && char === '/' && nextChar === '*') {
      inMultiLineComment = true;
      i += 2;
      continue;
    }
    
    if (inMultiLineComment) {
      if (char === '*' && nextChar === '/') {
        inMultiLineComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    
    // Handle strings
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
      stringChar = '';
    }
    
    // Count parentheses only outside strings and comments
    if (!inString && !inSingleLineComment && !inMultiLineComment) {
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      }
    }
    
    i++;
  }
  
  return depth === 0 ? i - 1 : -1;
}

/**
 * Builds a sorted list of character offsets where each line starts,
 * so a character index can be converted to a 1-based line number.
 * @param {string} code - The source code
 * @returns {Array<number>} Offset of the first character of each line
 */
function buildLineOffsets(code) {
  const offsets = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

/**
 * Converts a character index into a 1-based line number using binary search.
 * @param {Array<number>} lineOffsets - Result of buildLineOffsets()
 * @param {number} index - Character index into the source code
 * @returns {number} 1-based line number
 */
function getLineNumber(lineOffsets, index) {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineOffsets[mid] <= index) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1;
}

/**
 * Extracts all functions from JavaScript/TypeScript code
 * @param {string} code - The JavaScript/TypeScript source code to parse
 * @param {string} filePath - The path to the source file (for tracking)
 * @returns {Array<{name: string, body: string, originalBody: string, filePath: string, startIndex: number, line: number}>} Array of extracted function objects
 * @description Identifies and extracts arrow functions, function declarations, class methods, async functions, and TypeScript functions
 */
function extractFunctions(code, filePath) {
  const functions = [];
  const functionPositions = new Map();
  const lineOffsets = buildLineOffsets(code);
  
  // Find all functions and their positions
  const functionMatches = [];
  
  // 1. Arrow functions with const/let/var (with optional TypeScript type annotations)
  // Improved regex to handle complex parameters and type annotations
  const arrowPattern = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\(/g;
  let match;
  while ((match = arrowPattern.exec(code)) !== null) {
    const startIndex = match.index;
    const nameEndIndex = match.index + match[0].length;
    
    // Find the closing parenthesis of parameters (handle nested parens)
    const closingParenIndex = findMatchingParen(code, nameEndIndex - 1);
    
    if (closingParenIndex !== -1) {
      // Check if this is followed by => (with optional return type)
      let afterParen = code.substring(closingParenIndex + 1).trimStart();
      
      // Skip TypeScript return type annotation if present (e.g., ): ReturnType =>)
      if (afterParen.startsWith(':')) {
        const arrowPos = afterParen.indexOf('=>');
        if (arrowPos !== -1) {
          afterParen = afterParen.substring(arrowPos).trimStart();
        }
      }
      
      if (afterParen.startsWith('=>')) {
        const arrowIndex = closingParenIndex + 1 + (code.substring(closingParenIndex + 1).length - afterParen.length);
        const afterArrow = code.substring(arrowIndex + 2).trimStart();
        
        // Only extract if followed by {
        if (afterArrow.startsWith('{')) {
          const braceIndex = arrowIndex + 2 + (code.substring(arrowIndex + 2).length - afterArrow.length);
          functionMatches.push({
            name: match[1],
            start: startIndex,
            bodyStart: braceIndex,
            type: 'arrow'
          });
        }
      }
    }
  }
  
  // 2. Function declarations (with optional TypeScript type annotations)
  const funcPattern = /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:<[^>]+>)?\s*\(/g;
  while ((match = funcPattern.exec(code)) !== null) {
    const startIndex = match.index;
    const parenStart = match.index + match[0].length - 1;
    
    // Find the closing parenthesis
    const closingParenIndex = findMatchingParen(code, parenStart);
    
    if (closingParenIndex !== -1) {
      let afterParen = code.substring(closingParenIndex + 1).trimStart();
      
      // Skip TypeScript return type annotation if present
      if (afterParen.startsWith(':')) {
        const bracePos = afterParen.indexOf('{');
        if (bracePos !== -1) {
          afterParen = afterParen.substring(bracePos).trimStart();
        }
      }
      
      // Check if followed by {
      if (afterParen.startsWith('{')) {
        const braceIndex = closingParenIndex + 1 + (code.substring(closingParenIndex + 1).length - afterParen.length);
        functionMatches.push({
          name: match[1],
          start: startIndex,
          bodyStart: braceIndex,
          type: 'function'
        });
      }
    }
  }
  
  // 3. Methods (class methods, object methods) with optional TypeScript annotations
  const methodRegex = /^\s*(?:public|private|protected|static|async)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:<[^>]+>)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm;
  while ((match = methodRegex.exec(code)) !== null) {
    const name = match[1];
    // Skip JavaScript keywords
    const jsKeywords = ['if', 'for', 'while', 'switch', 'catch', 'with'];
    if (jsKeywords.includes(name)) {
      continue;
    }
    
    // Check that it's not a function declaration or arrow function
    const before = code.substring(Math.max(0, match.index - 20), match.index);
    if (!/(?:function|const|let|var|=|=>)\s*$/.test(before)) {
      functionMatches.push({
        name: match[1],
        start: match.index,
        bodyStart: match.index + match[0].length - 1,
        type: 'method'
      });
    }
  }
  
  // Sort by position
  functionMatches.sort((a, b) => a.start - b.start);
  
  // Extract each function body
  functionMatches.forEach(funcMatch => {
    const body = extractFunctionBody(code, funcMatch.bodyStart);
    
    if (body && body.trim().length > 0) {
      const normalizedBody = normalizeCode(body);
      const uniqueKey = `${filePath}:${funcMatch.start}`;
      
      if (!functionPositions.has(uniqueKey)) {
        functionPositions.set(uniqueKey, true);
        
        // Extract JSX components from original body (before normalization)
        // Check file extension OR check if code contains JSX
        const hasJSX = filePath.endsWith('.jsx') || filePath.endsWith('.tsx') || body.includes('<');
        const jsxComponents = hasJSX ? extractJSXComponents(body) : new Set();
        
        functions.push({
          name: funcMatch.name,
          body: normalizedBody,
          originalBody: body,
          filePath,
          startIndex: funcMatch.start,
          line: getLineNumber(lineOffsets, funcMatch.start),
          jsxComponents: jsxComponents
        });
      }
    }
  });

  return functions;
}

/**
 * Extracts the body of a function from source code
 * @param {string} code - The JavaScript source code
 * @param {number} startBrace - The index of the opening brace
 * @returns {string|null} The function body content, or null if extraction fails
 * @description Handles nested braces, strings, and comments to accurately extract function bodies
 */
function extractFunctionBody(code, startBrace) {
  let braceCount = 1;
  let i = startBrace + 1;
  let inString = false;
  let stringChar = '';
  
  while (i < code.length && braceCount > 0) {
    const char = code[i];
    const nextChar = code[i + 1];
    
    // Handle comments
    if (!inString && char === '/' && nextChar === '/') {
      // Skip to end of line
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (!inString && char === '/' && nextChar === '*') {
      // Skip to end of block comment
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    
    // Handle strings
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && code[i - 1] !== '\\') {
      inString = false;
    }
    
    // Count braces only outside strings
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    i++;
  }
  
  if (braceCount === 0) {
    return code.substring(startBrace + 1, i - 1);
  }
  
  return null;
}

/**
 * Extracts JSX/TSX component names from code
 * @param {string} code - The JavaScript/TypeScript/JSX/TSX code
 * @returns {Set<string>} Set of unique component names used in JSX
 * @description Identifies JSX component tags (e.g., <Button>, <UserCard>) in the code
 */
function extractJSXComponents(code) {
  const components = new Set();
  
  // Match JSX opening tags: <ComponentName ...> or <ComponentName/>
  // Component names start with uppercase letter
  const jsxPattern = /<([A-Z][a-zA-Z0-9]*)[\s/>]/g;
  let match;
  
  while ((match = jsxPattern.exec(code)) !== null) {
    components.add(match[1]);
  }
  
  return components;
}

/**
 * Normalizes code for comparison by removing irrelevant differences
 * @param {string} code - The JavaScript/TypeScript code to normalize
 * @returns {string} Normalized code with whitespace, comments, type annotations, and variable names removed
 * @description Removes: multi-line comments, single-line comments, string literals, template literals,
 * TypeScript type annotations, variable names (replaced with 'V'), and all whitespace. This allows for semantic comparison.
 */
function normalizeCode(code) {
  let normalized = code
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\/\/.*/g, '') // Remove single-line comments
    .replace(/`[^`]*`/g, '""') // Replace template literals with generic string
    .replace(/'[^']*'/g, '""') // Replace string literals with generic string
    .replace(/"[^"]*"/g, '""') // Replace string literals with generic string
    // JSX/TSX specific: Replace JSX component names with generic placeholder
    // This handles <ComponentName> tags, but we need to preserve the structure
    .replace(/<([A-Z][a-zA-Z0-9]*)/g, '<COMP') // Replace opening tags
    .replace(/\/([A-Z][a-zA-Z0-9]*)>/g, '/COMP>') // Replace closing tags
    // TypeScript specific: Remove type annotations
    .replace(/:\s*[a-zA-Z_$<>[\]{}|&,\s]+(?=\s*[=,)\]};])/g, '') // Remove type annotations (e.g., : string, : number[], : Array<T>)
    .replace(/:\s*[a-zA-Z_$<>[\]{}|&,\s]+$/gm, '') // Remove type annotations at end of line
    .replace(/<[a-zA-Z_$<>[\]{}|&,\s]+>/g, '') // Remove generic type parameters (e.g., <T>, <T extends U>)
    .replace(/\bas\s+[a-zA-Z_$][a-zA-Z0-9_$]*/g, '') // Remove type assertions (e.g., as string)
    .replace(/\binterface\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*{[^}]*}/g, '') // Remove interface declarations
    .replace(/\btype\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[^;]+;/g, '') // Remove type aliases
    .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, 'V') // Replace variable names with V
    .replace(/\s+/g, '') // Remove all whitespace
    .trim();
  
  return normalized;
}

/**
 * Calculates the similarity between two code snippets as a percentage
 * @param {string} code1 - First code snippet
 * @param {string} code2 - Second code snippet
 * @param {Set<string>} components1 - JSX components in first snippet (optional)
 * @param {Set<string>} components2 - JSX components in second snippet (optional)
 * @returns {number} Similarity percentage (0-100)
 * @description Uses Levenshtein distance algorithm to measure code similarity.
 * For JSX/TSX: reduces similarity if components are completely different.
 */
function calculateSimilarity(code1, code2, components1 = new Set(), components2 = new Set()) {
  const len1 = code1.length;
  const len2 = code2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 100;
  
  // Use simple Levenshtein distance
  const distance = levenshteinDistance(code1, code2);
  let similarity = ((maxLen - distance) / maxLen) * 100;
  
  // JSX/TSX specific: If both have JSX components, check if they're different
  if (components1.size > 0 && components2.size > 0) {
    // Find common components
    const commonComponents = new Set([...components1].filter(c => components2.has(c)));
    
    // If there are NO common components, this is likely a different template
    // Reduce similarity significantly
    if (commonComponents.size === 0) {
      similarity = similarity * 0.3; // Reduce by 70%
    } else {
      // If some components are common, reduce proportionally
      const totalUniqueComponents = new Set([...components1, ...components2]).size;
      const componentSimilarity = (commonComponents.size / totalUniqueComponents);
      
      // Apply component similarity as a factor (weight it 30%)
      similarity = similarity * 0.7 + (componentSimilarity * 100 * 0.3);
    }
  }
  
  return similarity;
}

/**
 * Calculates the Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} The minimum number of single-character edits required to change one string into the other
 * @description Classic dynamic programming implementation of edit distance
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  // Use two rolling 1D rows instead of a full (len2+1) x (len1+1) matrix.
  // Same O(len1*len2) time complexity, but O(len1) space instead of
  // O(len1*len2), which avoids allocating a new array-of-arrays on every
  // call. This matters a lot here because this function is invoked once
  // per compared function pair (up to O(n^2) times).
  let prevRow = new Array(len1 + 1);
  let currRow = new Array(len1 + 1);

  for (let j = 0; j <= len1; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    currRow[0] = i;
    const code2 = str2.charCodeAt(i - 1);

    for (let j = 1; j <= len1; j++) {
      const cost = code2 === str1.charCodeAt(j - 1) ? 0 : 1;
      const deletion = prevRow[j] + 1;
      const insertion = currRow[j - 1] + 1;
      const substitution = prevRow[j - 1] + cost;
      currRow[j] = deletion < insertion
        ? (deletion < substitution ? deletion : substitution)
        : (insertion < substitution ? insertion : substitution);
    }

    const tmp = prevRow;
    prevRow = currRow;
    currRow = tmp;
  }

  return prevRow[len1];
}

/**
 * Recursively finds all JavaScript files in a directory
 * @param {string} dir - The directory to search
 * @param {Array<string>} fileList - Accumulator array for found files (used internally)
 * @returns {Array<string>} Array of absolute file paths to .js and .jsx files
 * @description Automatically skips node_modules, .git, dist, and build directories
 */
function findJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and .git
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build') {
        findJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Finds duplicate functions in a directory
 * @param {string} directory - The root directory to analyze
 * @param {number} similarityThreshold - Minimum similarity percentage to consider as duplicate (default: 70)
 * @param {Array<string>|null} precomputedFiles - Optional pre-computed list of files (from findJsFiles),
 * to avoid walking the directory tree twice when the caller already needs the file list
 * @returns {{duplicates: Array<{func1: Object, func2: Object, similarity: string}>, totalFunctions: number}} Analysis results
 * @description Extracts all functions from JavaScript files in the directory and compares them pairwise
 * to find duplicates based on normalized code similarity
 */
function findDuplicates(directory, similarityThreshold = 70, precomputedFiles = null) {
  // Allow callers that already walked the directory (e.g. to report a file
  // count) to pass the list in, instead of walking the tree a second time.
  const jsFiles = precomputedFiles || findJsFiles(directory);
  const allFunctions = [];

  // Extract functions from all files
  jsFiles.forEach(file => {
    try {
      const code = fs.readFileSync(file, 'utf8');
      const functions = extractFunctions(code, file);
      allFunctions.push(...functions);
    } catch (error) {
      console.error(`❌ Error reading file ${file}:`, error.message);
    }
  });

  const duplicates = [];

  // Compare each function with all other functions.
  // Each unordered pair {i, j} is visited exactly once by this loop, so no
  // extra "already checked" bookkeeping is needed. (An earlier version
  // skipped any two functions that shared a name within the same file,
  // which meant copy-pasted same-named methods - e.g. two classes each
  // with a `render()` - were never reported as duplicates.)
  for (let i = 0; i < allFunctions.length; i++) {
    for (let j = i + 1; j < allFunctions.length; j++) {
      const func1 = allFunctions[i];
      const func2 = allFunctions[j];

      // Early exit: skip if size difference is too large (>50% difference)
      const len1 = func1.body.length;
      const len2 = func2.body.length;
      const sizeDiffPercent = Math.abs(len1 - len2) / Math.max(len1, len2) * 100;

      if (sizeDiffPercent > 50) {
        continue; // Functions too different in size to be similar
      }

      // Pass JSX component info for better comparison.
      // Note: no memoization here is needed/beneficial - the (i, j) loop
      // above already visits each function pair exactly once, so a
      // similarity cache keyed on the pair would never get a hit; it was
      // measured to have a 0% hit rate while still costing a Map insertion
      // per comparison and growing unbounded, so it was removed.
      const similarity = calculateSimilarity(
        func1.body,
        func2.body,
        func1.jsxComponents || new Set(),
        func2.jsxComponents || new Set()
      );

      if (similarity >= similarityThreshold) {
        duplicates.push({
          func1,
          func2,
          similarity: similarity.toFixed(2)
        });
      }
    }
  }

  return {
    duplicates,
    totalFunctions: allFunctions.length
  };
}

export {
  extractFunctions,
  normalizeCode,
  calculateSimilarity,
  findJsFiles,
  findDuplicates,
  extractJSXComponents
};
