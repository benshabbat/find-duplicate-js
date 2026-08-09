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

// Words that can appear where a method name is expected but introduce a
// statement rather than a function: `if (x) {`, `return (a) ? ... : {` and
// friends all look like `name(...) {` to a line-anchored pattern.
const STATEMENT_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'with', 'do', 'else', 'try',
  'finally', 'case', 'default', 'function', 'return', 'throw', 'typeof',
  'new', 'delete', 'await', 'yield', 'void', 'in', 'of'
]);

/**
 * Given the index of a parameter list's opening parenthesis, returns the index
 * of the `{` that starts the function body, or -1 if this is not a function.
 * @param {string} code - The source code
 * @param {number} openParenIndex - Index of the `(` opening the parameter list
 * @param {boolean} expectArrow - True for arrow functions, where a `=>` must
 *   sit between the parameter list and the body
 * @returns {number} Index of the body's opening brace, or -1
 * @description Skips an optional TypeScript return type annotation between the
 * closing parenthesis and the body. Used by every pattern below so that a
 * parameter list spanning several lines - which a `\([^)]*\)` regex cannot
 * match - is handled by the same brace/string-aware scanner everywhere.
 */
function findBodyBrace(code, openParenIndex, expectArrow) {
  const closingParenIndex = findMatchingParen(code, openParenIndex);
  if (closingParenIndex === -1) return -1;

  let cursor = closingParenIndex + 1;
  const skipSpace = () => {
    while (cursor < code.length && /\s/.test(code[cursor])) cursor++;
  };

  skipSpace();

  // TypeScript return type: `): ReturnType =>` or `): ReturnType {`
  if (code[cursor] === ':') {
    const terminator = expectArrow ? code.indexOf('=>', cursor) : code.indexOf('{', cursor);
    if (terminator === -1) return -1;
    cursor = terminator;
  }

  if (expectArrow) {
    if (code[cursor] !== '=' || code[cursor + 1] !== '>') return -1;
    cursor += 2;
    skipSpace();
  }

  // Only concise bodies wrapped in braces are extracted; `x => x + 1` has no
  // block to compare.
  return code[cursor] === '{' ? cursor : -1;
}

/**
 * Extracts all functions from JavaScript/TypeScript code
 * @param {string} code - The JavaScript/TypeScript source code to parse
 * @param {string} filePath - The path to the source file (for tracking)
 * @returns {Array<{name: string, body: string, originalBody: string, filePath: string, startIndex: number, line: number}>} Array of extracted function objects
 * @description Identifies and extracts arrow functions (parenthesized and
 * single-parameter), function declarations and expressions, generators,
 * default-exported and anonymous functions, object-literal methods and
 * properties, class methods, class field arrows, getters/setters, async
 * functions, and their TypeScript-annotated forms.
 */
function extractFunctions(code, filePath) {
  const functions = [];
  const seenBodies = new Set();
  const lineOffsets = buildLineOffsets(code);

  // Find all functions and their positions
  const functionMatches = [];
  let match;

  /**
   * Records a candidate whose parameter list starts at openParenIndex.
   * @param {string} name - Function name to report
   * @param {number} start - Index the declaration starts at (used for line
   *   numbers and for preferring the outermost match on a shared body)
   * @param {number} openParenIndex - Index of the parameter list's `(`
   * @param {boolean} expectArrow - Whether a `=>` must follow the parameters
   * @param {string} type - Diagnostic label for the match kind
   */
  const addCandidate = (name, start, openParenIndex, expectArrow, type) => {
    const bodyStart = findBodyBrace(code, openParenIndex, expectArrow);
    if (bodyStart !== -1) {
      functionMatches.push({ name, start, bodyStart, type });
    }
  };

  // 1. Arrow functions bound to a declaration, an object property or a class
  //    field: `const f = (a) => {}`, `handler: (a) => {}`, `field = (a) => {}`.
  //    The `[:=]` is guarded so comparisons (`a === (b)`), arrows (`=>`) and
  //    relational operators are not mistaken for a binding.
  const ARROW_BINDING = /(?:(?:const|let|var)\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::\s*[^=;,{}()]{1,200})?\s*(?<![=!<>])([:=])(?![=>])\s*(?:async\s+)?\(/g;
  while ((match = ARROW_BINDING.exec(code)) !== null) {
    addCandidate(match[1], match.index, match.index + match[0].length - 1, true, 'arrow');
  }

  // 2. Single-parameter arrows without parentheses: `const f = x => {}`,
  //    `onClick: e => {}`. The parameter has no parens, so there is no list to
  //    scan - locate the brace directly after the `=>`.
  const ARROW_SINGLE_PARAM = /(?:(?:const|let|var)\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?<![=!<>])([:=])(?![=>])\s*(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*\{/g;
  while ((match = ARROW_SINGLE_PARAM.exec(code)) !== null) {
    functionMatches.push({
      name: match[1],
      start: match.index,
      bodyStart: match.index + match[0].length - 1,
      type: 'arrow-single-param'
    });
  }

  // 3. Function expressions and generators bound to a name:
  //    `const f = function () {}`, `const g = function* () {}`,
  //    `run: async function () {}`.
  const FUNCTION_EXPRESSION = /(?:(?:const|let|var)\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?<![=!<>])([:=])(?![=>])\s*(?:async\s+)?function\s*\*?\s*(?:[a-zA-Z_$][a-zA-Z0-9_$]*)?\s*(?:<[^>]+>)?\s*\(/g;
  while ((match = FUNCTION_EXPRESSION.exec(code)) !== null) {
    addCandidate(match[1], match.index, match.index + match[0].length - 1, false, 'function-expression');
  }

  // 4. Function declarations, including generators and anonymous
  //    `export default function () {}`. The name is optional so the anonymous
  //    default export is still compared - it is as copy-pasteable as any other.
  const FUNCTION_DECLARATION = /(?:export\s+default\s+)?(?:async\s+)?function\s*\*?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)?\s*(?:<[^>]+>)?\s*\(/g;
  while ((match = FUNCTION_DECLARATION.exec(code)) !== null) {
    const name = match[1] || (match[0].includes('default') ? 'default' : 'anonymous');
    addCandidate(name, match.index, match.index + match[0].length - 1, false, 'function');
  }

  // 5. Methods (class methods, object methods), getters/setters and method
  //    generators, with optional TypeScript annotations. The parameter list is
  //    located with findMatchingParen rather than matched in the regex, so
  //    parameters spread over several lines are handled.
  const METHOD = /^[ \t]*(?:(?:public|private|protected|static|readonly|override|abstract|async|get|set)\s+)*\*?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:<[^>]+>)?\s*\(/gm;
  while ((match = METHOD.exec(code)) !== null) {
    if (STATEMENT_KEYWORDS.has(match[1])) {
      continue;
    }

    // Check that it's not a function declaration or arrow function
    const before = code.substring(Math.max(0, match.index - 20), match.index);
    if (!/(?:function|const|let|var|=|=>)\s*$/.test(before)) {
      addCandidate(match[1], match.index, match.index + match[0].length - 1, false, 'method');
    }
  }

  // Sort by position so that when two patterns land on the same body, the one
  // that started earliest - the most complete match, and the one carrying the
  // better name - is the one kept by the dedup below.
  functionMatches.sort((a, b) => a.start - b.start);

  // Extract each function body
  functionMatches.forEach(funcMatch => {
    const body = extractFunctionBody(code, funcMatch.bodyStart);

    if (body && body.trim().length > 0) {
      const normalizedBody = normalizeCode(body);
      // Keyed on the body, not the declaration start: several patterns can
      // legitimately match the same function from different offsets (e.g.
      // `const f = function () {}` is both a binding and an expression), and
      // it is the body that decides whether they are the same function.
      const uniqueKey = `${filePath}:${funcMatch.bodyStart}`;

      if (!seenBodies.has(uniqueKey)) {
        seenBodies.add(uniqueKey);

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
