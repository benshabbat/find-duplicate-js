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

export { normalizeCode };
