import fs from 'fs';
import path from 'path';
import { extractFunctions } from './find-duplicates-parser.js';
import {
  applyComponentAdjustment,
  requiredRawSimilarity,
  levenshteinDistanceBounded
} from './find-duplicates-similarity.js';

/**
 * Recursively finds all JavaScript files in a directory
 * @param {string} dir - The directory to search
 * @param {Array<string>} fileList - Accumulator array for found files (used internally)
 * @returns {Array<string>} Array of absolute file paths to .js and .jsx files
 * @description Automatically skips node_modules, .git, dist, and build directories
 */
function findJsFiles(dir, fileList = []) {
  // withFileTypes avoids a separate statSync() syscall per entry - the
  // Dirent already reports whether it's a directory. Symlinks fall back to
  // statSync (Dirent.isDirectory() doesn't follow them) to preserve the
  // original behavior for that rare case.
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach(entry => {
    const filePath = path.join(dir, entry.name);
    const isDirectory = entry.isSymbolicLink()
      ? fs.statSync(filePath).isDirectory()
      : entry.isDirectory();

    if (isDirectory) {
      // Skip node_modules and .git
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'build') {
        findJsFiles(filePath, fileList);
      }
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
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

  // Sort by normalized body length so the inner loop below can `break`
  // instead of scanning every remaining pair: once two functions differ in
  // length by more than the 50% cutoff, every function later in this sorted
  // array is at least as long, so it would fail the same cutoff too.
  allFunctions.sort((a, b) => a.body.length - b.body.length);

  const duplicates = [];

  // Compare each function with all other functions.
  // Each unordered pair {i, j} is visited exactly once by this loop, so no
  // extra "already checked" bookkeeping is needed. (An earlier version
  // skipped any two functions that shared a name within the same file,
  // which meant copy-pasted same-named methods - e.g. two classes each
  // with a `render()` - were never reported as duplicates.)
  for (let i = 0; i < allFunctions.length; i++) {
    const func1 = allFunctions[i];
    const len1 = func1.body.length;

    for (let j = i + 1; j < allFunctions.length; j++) {
      const func2 = allFunctions[j];

      // Early exit: stop if size difference is too large (>50% difference).
      // len2 >= len1 here because the array is sorted by length.
      const len2 = func2.body.length;
      const sizeDiffPercent = ((len2 - len1) / len2) * 100;

      if (sizeDiffPercent > 50) {
        break; // Every later j is at least as long, so it'll fail too.
      }

      // Pass JSX component info for better comparison.
      // Note: no memoization here is needed/beneficial - the (i, j) loop
      // above already visits each function pair exactly once, so a
      // similarity cache keyed on the pair would never get a hit; it was
      // measured to have a 0% hit rate while still costing a Map insertion
      // per comparison and growing unbounded, so it was removed.
      const components1 = func1.jsxComponents || new Set();
      const components2 = func2.jsxComponents || new Set();

      // Work out the minimum *raw* (pre-JSX) similarity these two would need
      // to reach the threshold, then size the Levenshtein comparison to that
      // exact max distance. If it's impossible (e.g. disjoint JSX component
      // sets), skip the comparison entirely - no Levenshtein call at all.
      const requiredRaw = requiredRawSimilarity(similarityThreshold, components1, components2);
      if (requiredRaw === Infinity) {
        continue;
      }

      const maxLen = Math.max(len1, len2);
      const maxDistance = maxLen === 0 ? 0 : Math.min(maxLen, Math.ceil(maxLen * (1 - requiredRaw / 100)));
      const distance = levenshteinDistanceBounded(func1.body, func2.body, maxDistance);

      if (distance > maxDistance) {
        // Bounded search hit its ceiling before finishing - the true
        // distance is > maxDistance, so the threshold can't be reached.
        continue;
      }

      const rawSimilarity = maxLen === 0 ? 100 : ((maxLen - distance) / maxLen) * 100;
      const similarity = applyComponentAdjustment(rawSimilarity, components1, components2);

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

export { findJsFiles, findDuplicates };
