import { normalizeCode } from './find-duplicates-normalize.js';

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

export {
  findMatchingParen,
  buildLineOffsets,
  getLineNumber,
  extractFunctions,
  extractFunctionBody,
  extractJSXComponents
};
