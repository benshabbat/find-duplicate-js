// Longest run of type-ish characters any of the TypeScript-stripping
// patterns below will consider. The bound is what keeps them linear - see
// the comment at their use site - and it is far above any real annotation
// or generic parameter list, so it never truncates genuine code.
const TYPE_SPAN = 200;

// Characters that can appear inside a type annotation or generic parameter
// list. Note it contains both `<` and `>`, which is precisely why the
// quantifiers over it have to be bounded.
const TYPE_CHARS = 'a-zA-Z_$<>[\\]{}|&,\\s';

// Hoisted so the patterns are compiled once rather than per normalizeCode()
// call (it runs once per extracted function).
const TYPE_ANNOTATION_BEFORE_DELIMITER = new RegExp(`:\\s*[${TYPE_CHARS}]{1,${TYPE_SPAN}}(?=\\s*[=,)\\]};])`, 'g');
const TYPE_ANNOTATION_AT_LINE_END = new RegExp(`:\\s*[${TYPE_CHARS}]{1,${TYPE_SPAN}}$`, 'gm');
const GENERIC_TYPE_PARAMETERS = new RegExp(`<[${TYPE_CHARS}]{1,${TYPE_SPAN}}>`, 'g');

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
    // The (?:[^X\\]|\\[\s\S])* form treats a backslash-escaped quote as part
    // of the string instead of terminating it, so 'it\'s' collapses to ""
    // in one piece rather than leaving a dangling `s'` tail behind.
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '""') // Replace template literals with generic string
    .replace(/'(?:[^'\\\n]|\\[\s\S])*'/g, '""') // Replace string literals with generic string
    .replace(/"(?:[^"\\\n]|\\[\s\S])*"/g, '""') // Replace string literals with generic string
    // JSX/TSX specific: Replace JSX component names with generic placeholder
    // This handles <ComponentName> tags, but we need to preserve the structure
    .replace(/<([A-Z][a-zA-Z0-9]*)/g, '<COMP') // Replace opening tags
    .replace(/\/([A-Z][a-zA-Z0-9]*)>/g, '/COMP>') // Replace closing tags
    // TypeScript specific: Remove type annotations. The length bounds baked
    // into these three patterns are load-bearing, not cosmetic - see
    // TYPE_SPAN above.
    .replace(TYPE_ANNOTATION_BEFORE_DELIMITER, '') // Remove type annotations (e.g., : string, : number[], : Array<T>)
    .replace(TYPE_ANNOTATION_AT_LINE_END, '') // Remove type annotations at end of line
    .replace(GENERIC_TYPE_PARAMETERS, '') // Remove generic type parameters (e.g., <T>, <T extends U>)
    .replace(/\bas\s+[a-zA-Z_$][a-zA-Z0-9_$]*/g, '') // Remove type assertions (e.g., as string)
    .replace(/\binterface\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*{[^}]*}/g, '') // Remove interface declarations
    .replace(/\btype\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[^;]+;/g, '') // Remove type aliases
    .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, 'V') // Replace variable names with V
    .replace(/\s+/g, '') // Remove all whitespace
    .trim();

  return normalized;
}

/**
 * Strips only non-semantic text (comments and insignificant whitespace) from
 * code, keeping identifiers and string literals intact.
 * @param {string} code - The JavaScript/TypeScript code to strip
 * @returns {string} The code with comments removed and all whitespace outside
 *   string/template literals dropped
 * @description Two functions whose stripped forms are identical are exact
 * copies of each other (modulo formatting and comments). This is the
 * complement of normalizeCode(), which additionally erases identifiers and
 * string literals and therefore also matches merely *structural* clones.
 * Implemented as a character scanner rather than regexes so that `//` inside
 * a string (e.g. a URL literal) is never mistaken for a comment. Known
 * limitation: regex literals aren't tracked, so a `//` inside one is treated
 * as a comment; this can only under-report exactness, never over-report it
 * for differing strings.
 */
function stripFormatting(code) {
  let out = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < code.length) {
    const char = code[i];
    const nextChar = code[i + 1];

    if (inString) {
      out += char;
      if (char === '\\' && i + 1 < code.length) {
        // Copy the escaped character verbatim so \' doesn't end the string.
        out += code[i + 1];
        i += 2;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      out += char;
      i++;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f' || char === '\v') {
      i++;
      continue;
    }

    out += char;
    i++;
  }

  return out;
}

export { normalizeCode, stripFormatting };
