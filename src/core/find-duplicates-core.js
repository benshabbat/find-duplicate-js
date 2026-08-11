// This file is kept as a thin re-export barrel so existing consumers
// (find-duplicates.js, src/ui/find-duplicates-ui.js, tests/)
// can keep importing this module unchanged. The implementation has been
// split into cohesive modules:
//   - find-duplicates-parser.js:     brace/paren matching, line offsets,
//                                    function & JSX extraction
//   - find-duplicates-normalize.js:  code normalization for comparison
//   - find-duplicates-similarity.js: similarity scoring & Levenshtein distance
//   - find-duplicates-scanner.js:    filesystem walking & duplicate-finding
//                                    orchestration

// Only the functions that were part of the original public surface
// (module.exports of the pre-split find-duplicates-core.js) are re-exported
// here, to avoid silently expanding the public API as a side effect of
// this split. (groupDuplicates was added to the public surface deliberately,
// in v1.10.0, alongside the grouped CLI/JSON/UI output.)
export {
  extractFunctions,
  extractJSXComponents
} from './find-duplicates-parser.js';

export { normalizeCode } from './find-duplicates-normalize.js';

export { calculateSimilarity } from './find-duplicates-similarity.js';

export { findJsFiles, findDuplicates, groupDuplicates, collectSourceFiles } from './find-duplicates-scanner.js';
