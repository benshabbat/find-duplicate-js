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
 * Extracts all functions from JavaScript code
 * @param {string} code - The JavaScript source code to parse
 * @param {string} filePath - The path to the source file (for tracking)
 * @returns {Array<{name: string, body: string, originalBody: string, filePath: string, startIndex: number}>} Array of extracted function objects
 * @description Identifies and extracts arrow functions, function declarations, class methods, and async functions
 */
function extractFunctions(code, filePath) {
  const functions = [];
  const functionPositions = new Map();
  
  // Find all functions and their positions
  const functionMatches = [];
  
  // 1. Arrow functions with const/let/var
  // Improved regex to handle complex parameters
  const arrowPattern = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/g;
  let match;
  while ((match = arrowPattern.exec(code)) !== null) {
    const startIndex = match.index;
    const nameEndIndex = match.index + match[0].length;
    
    // Find the closing parenthesis of parameters (handle nested parens)
    const closingParenIndex = findMatchingParen(code, nameEndIndex - 1);
    
    if (closingParenIndex !== -1) {
      // Check if this is followed by =>
      const afterParen = code.substring(closingParenIndex + 1).trimStart();
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
  
  // 2. Function declarations
  const funcPattern = /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  while ((match = funcPattern.exec(code)) !== null) {
    const startIndex = match.index;
    const parenStart = match.index + match[0].length - 1;
    
    // Find the closing parenthesis
    const closingParenIndex = findMatchingParen(code, parenStart);
    
    if (closingParenIndex !== -1) {
      const afterParen = code.substring(closingParenIndex + 1).trimStart();
      
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
  
  // 3. Methods (class methods, object methods)
  const methodRegex = /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/gm;
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
        functions.push({
          name: funcMatch.name,
          body: normalizedBody,
          originalBody: body,
          filePath,
          startIndex: funcMatch.start
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
 * Normalizes code for comparison by removing irrelevant differences
 * @param {string} code - The JavaScript code to normalize
 * @returns {string} Normalized code with whitespace, comments, and variable names removed
 * @description Removes: multi-line comments, single-line comments, string literals, template literals,
 * variable names (replaced with 'V'), and all whitespace. This allows for semantic comparison.
 */
function normalizeCode(code) {
  let normalized = code
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\/\/.*/g, '') // Remove single-line comments
    .replace(/`[^`]*`/g, '""') // Replace template literals with generic string
    .replace(/'[^']*'/g, '""') // Replace string literals with generic string
    .replace(/"[^"]*"/g, '""') // Replace string literals with generic string
    .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, 'V') // Replace variable names with V
    .replace(/\s+/g, '') // Remove all whitespace
    .trim();
  
  return normalized;
}

/**
 * Calculates the similarity between two code snippets as a percentage
 * @param {string} code1 - First code snippet
 * @param {string} code2 - Second code snippet
 * @returns {number} Similarity percentage (0-100)
 * @description Uses Levenshtein distance algorithm to measure code similarity
 */
function calculateSimilarity(code1, code2) {
  if (code1 === code2) return 100;
  
  const len1 = code1.length;
  const len2 = code2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 100;
  
  // Use simple Levenshtein distance
  const distance = levenshteinDistance(code1, code2);
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
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
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
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
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Finds duplicate functions in a directory
 * @param {string} directory - The root directory to analyze
 * @param {number} similarityThreshold - Minimum similarity percentage to consider as duplicate (default: 70)
 * @returns {{duplicates: Array<{func1: Object, func2: Object, similarity: string}>, totalFunctions: number}} Analysis results
 * @description Extracts all functions from JavaScript files in the directory and compares them pairwise
 * to find duplicates based on normalized code similarity
 */
function findDuplicates(directory, similarityThreshold = 70) {
  const jsFiles = findJsFiles(directory);
  const allFunctions = [];
  const similarityCache = new Map(); // Cache for similarity calculations

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
  const checked = new Set();

  // Compare each function with all other functions
  for (let i = 0; i < allFunctions.length; i++) {
    for (let j = i + 1; j < allFunctions.length; j++) {
      const func1 = allFunctions[i];
      const func2 = allFunctions[j];
      
      // Skip if it's the same function (same file and same name)
      if (func1.filePath === func2.filePath && func1.name === func2.name) {
        continue;
      }
      
      // Early exit: skip if size difference is too large (>50% difference)
      const len1 = func1.body.length;
      const len2 = func2.body.length;
      const sizeDiffPercent = Math.abs(len1 - len2) / Math.max(len1, len2) * 100;
      
      if (sizeDiffPercent > 50) {
        continue; // Functions too different in size to be similar
      }
      
      const key = [func1.filePath, func1.name, func2.filePath, func2.name].sort().join('|');
      
      if (checked.has(key)) continue;
      checked.add(key);

      // Check cache first
      const cacheKey = `${func1.filePath}:${func1.startIndex}-${func2.filePath}:${func2.startIndex}`;
      let similarity;
      
      if (similarityCache.has(cacheKey)) {
        similarity = similarityCache.get(cacheKey);
      } else {
        similarity = calculateSimilarity(func1.body, func2.body);
        similarityCache.set(cacheKey, similarity);
      }

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
  findDuplicates
};
