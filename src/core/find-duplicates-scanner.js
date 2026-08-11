import fs from 'fs';
import path from 'path';
import { extractFunctions } from './find-duplicates-parser.js';
import { stripFormatting } from './find-duplicates-normalize.js';
import { createGitignoreMatcher } from './find-duplicates-gitignore.js';
import {
  applyComponentAdjustment,
  requiredRawSimilarity,
  levenshteinDistanceBounded
} from './find-duplicates-similarity.js';

// Directories that never contain first-party source worth scanning:
// package installs, VCS internals, generic build outputs, and the build/cache
// directories of common frameworks and tools (Next.js, Nuxt, SvelteKit,
// Astro, Angular, Gatsby, Parcel, Turborepo, Vercel). Without the framework
// entries, scanning a Next.js project root chews through hundreds of MB of
// compiled bundles in .next/ before ever reaching first-party code.
const SKIPPED_DIRECTORIES = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', 'out',
  '.next', '.nuxt', '.output', '.svelte-kit', '.astro', '.angular',
  '.turbo', '.vercel', '.cache', '.parcel-cache'
]);

// All JavaScript/TypeScript source extensions, including the ESM/CJS
// variants (.mjs/.cjs) and their TypeScript counterparts (.mts/.cts).
const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];

// Buckets in a normalized body's character histogram: one per ASCII code plus
// a catch-all for everything above. Normalized bodies are effectively ASCII
// (identifiers collapse to V and string contents are erased), so the catch-all
// is almost always empty - and lumping those characters together can only make
// the histogram bound below *smaller*, never larger, so it stays a valid bound.
const HISTOGRAM_BUCKETS = 129;
const OTHER_BUCKET = 128;

/**
 * Builds a character-frequency histogram for a string.
 * @param {string} str - The (normalized) function body
 * @returns {Uint32Array} Counts per character bucket
 */
function buildHistogram(str) {
  const histogram = new Uint32Array(HISTOGRAM_BUCKETS);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    histogram[code < OTHER_BUCKET ? code : OTHER_BUCKET]++;
  }
  return histogram;
}

/**
 * Lower bound on the edit distance between two strings, from their character
 * histograms alone.
 * @param {Uint32Array} histogram1 - Histogram of the first string
 * @param {Uint32Array} histogram2 - Histogram of the second string
 * @returns {number} A value that is guaranteed to be <= the true Levenshtein distance
 * @description Every single-character edit changes the character multiset by at
 * most 2 (a substitution removes one character and adds another; an insert or
 * delete changes it by 1), so `L1 / 2` can never exceed the true distance.
 * Computing it costs a fixed 129 operations, against the O(len * maxDistance)
 * of the banded DP it lets us skip - so pairs that merely *look* similar in
 * length but share no characters are rejected for a fraction of the price.
 */
function histogramDistanceBound(histogram1, histogram2) {
  let total = 0;
  for (let i = 0; i < HISTOGRAM_BUCKETS; i++) {
    const diff = histogram1[i] - histogram2[i];
    total += diff < 0 ? -diff : diff;
  }
  return Math.ceil(total / 2);
}

/**
 * Decides whether a file name is a scannable JS/TS source file.
 * @param {string} name - Base file name (not a full path)
 * @returns {boolean}
 * @description Declaration files (.d.ts/.d.mts/.d.cts) contain no function
 * bodies, and minified bundles (.min.js) only produce noise pairs, so both
 * are excluded even though their extensions would otherwise match.
 */
function isCodeFile(name) {
  if (name.endsWith('.d.ts') || name.endsWith('.d.mts') || name.endsWith('.d.cts')) return false;
  if (name.endsWith('.min.js')) return false;
  return CODE_EXTENSIONS.some(ext => name.endsWith(ext));
}

/**
 * Recursively finds all JavaScript/TypeScript files in a directory
 * @param {string} dir - The directory to search
 * @param {Array<string>} fileList - Accumulator array for found files (used internally)
 * @param {Set<string>|null} excludeDirs - Extra directory names to skip,
 *   on top of the built-in skip list (e.g. from the --exclude CLI flag)
 * @param {{ignore?: {ignores: Function}|null, visitedRealPaths?: Set<string>}} [walkState] -
 *   Internal walk state: an optional gitignore matcher and the set of real
 *   directory paths already visited (used to break symlink cycles)
 * @returns {Array<string>} Array of absolute file paths to JS/TS source files
 * @description Automatically skips node_modules, .git, dist, build, and
 * coverage directories, plus declaration files and minified bundles.
 * Directories that cannot be read (permissions, races, broken links) produce a
 * warning on stderr and are skipped, rather than aborting the whole scan -
 * a single unreadable directory should not cost you the other 10,000 files.
 */
function findJsFiles(dir, fileList = [], excludeDirs = null, walkState = {}) {
  const ignore = walkState.ignore || null;

  // Symlinked directories are followed, so a link pointing at one of its own
  // ancestors would otherwise recurse until the path length blows up
  // (`a/link/a/link/...` until ELOOP or a stack overflow kills the process).
  // Remembering the real path of every directory entered turns that cycle into
  // a single visit. Only symlinks need the realpath() syscall - a plain
  // directory cannot create a cycle.
  let visited = walkState.visitedRealPaths;
  if (!visited) {
    visited = new Set();
    try {
      visited.add(fs.realpathSync(dir));
    } catch {
      // Unresolvable root: fall through and let readdir report the problem.
    }
  }

  // withFileTypes avoids a separate statSync() syscall per entry - the
  // Dirent already reports whether it's a directory. Symlinks fall back to
  // statSync (Dirent.isDirectory() doesn't follow them) to preserve the
  // original behavior for that rare case.
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.warn(`⚠️  Skipping unreadable directory ${dir}: ${error.message}`);
    return fileList;
  }

  entries.forEach(entry => {
    const filePath = path.join(dir, entry.name);
    const isSymlink = entry.isSymbolicLink();

    let isDirectory;
    if (isSymlink) {
      try {
        isDirectory = fs.statSync(filePath).isDirectory();
      } catch {
        // Broken symlink - nothing to scan, and not worth a warning.
        return;
      }
    } else {
      isDirectory = entry.isDirectory();
    }

    if (isDirectory) {
      if (SKIPPED_DIRECTORIES.has(entry.name) || (excludeDirs && excludeDirs.has(entry.name))) {
        return;
      }
      if (ignore && ignore.ignores(filePath, true)) {
        return;
      }
      if (isSymlink) {
        let realPath;
        try {
          realPath = fs.realpathSync(filePath);
        } catch {
          return;
        }
        if (visited.has(realPath)) {
          return; // Already scanned through another path - this is a cycle.
        }
        visited.add(realPath);
      }
      findJsFiles(filePath, fileList, excludeDirs, { ignore, visitedRealPaths: visited });
    } else if (isCodeFile(entry.name)) {
      if (ignore && ignore.ignores(filePath, false)) {
        return;
      }
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
 * @param {{excludeDirs?: Set<string>, minLength?: number, onProgress?: Function}} options -
 * Optional filters: `excludeDirs` (extra directory names to skip when this
 * function walks the tree itself), `minLength` (minimum normalized-body length
 * in characters for a function to take part in comparison; filters out trivial
 * one-liners) and `onProgress` (called with `{phase, current, total}` as files
 * are parsed and functions compared, for long scans)
 * @returns {{duplicates: Array<{func1: Object, func2: Object, similarity: string}>, totalFunctions: number}} Analysis results
 * @description Extracts all functions from JavaScript files in the directory and compares them pairwise
 * to find duplicates based on normalized code similarity
 */
function findDuplicates(directory, similarityThreshold = 70, precomputedFiles = null, options = {}) {
  // Allow callers that already walked the directory (e.g. to report a file
  // count) to pass the list in, instead of walking the tree a second time.
  const jsFiles = precomputedFiles || findJsFiles(
    directory,
    [],
    options.excludeDirs || null,
    { ignore: options.gitignore ? createGitignoreMatcher(directory) : null }
  );
  let allFunctions = [];

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  // Extract functions from all files
  jsFiles.forEach((file, index) => {
    try {
      const code = fs.readFileSync(file, 'utf8');
      const functions = extractFunctions(code, file);
      allFunctions.push(...functions);
    } catch (error) {
      console.error(`❌ Error reading file ${file}:`, error.message);
    }
    if (onProgress) onProgress({ phase: 'parse', current: index + 1, total: jsFiles.length });
  });

  if (options.minLength > 0) {
    allFunctions = allFunctions.filter(func => func.body.length >= options.minLength);
  }

  // Sort by normalized body length so the inner loop below can `break`
  // instead of scanning every remaining pair: once two functions differ in
  // length by more than the 50% cutoff, every function later in this sorted
  // array is at least as long, so it would fail the same cutoff too.
  allFunctions.sort((a, b) => a.body.length - b.body.length);

  const duplicates = [];

  // Lazily computed stripped (comments/whitespace removed, identifiers and
  // strings kept) form of each function's original body, used to tell exact
  // copies apart from structural clones. Only functions that actually appear
  // in a reported pair ever pay for the strip.
  const strippedBodies = new Map();
  const strippedBodyOf = (func) => {
    let stripped = strippedBodies.get(func);
    if (stripped === undefined) {
      stripped = stripFormatting(func.originalBody);
      strippedBodies.set(func, stripped);
    }
    return stripped;
  };

  // Compare each function with all other functions.
  // Each unordered pair {i, j} is visited exactly once by this loop, so no
  // extra "already checked" bookkeeping is needed. (An earlier version
  // skipped any two functions that shared a name within the same file,
  // which meant copy-pasted same-named methods - e.g. two classes each
  // with a `render()` - were never reported as duplicates.)
  // Histograms are built once per function (O(total characters)) and then read
  // O(1) times per pair, so the precompute is paid back as soon as it rejects
  // a single comparison.
  const histograms = allFunctions.map(func => buildHistogram(func.body));

  for (let i = 0; i < allFunctions.length; i++) {
    const func1 = allFunctions[i];
    const len1 = func1.body.length;
    const histogram1 = histograms[i];

    if (onProgress) onProgress({ phase: 'compare', current: i + 1, total: allFunctions.length });

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

      // Cheap rejection before the DP: if the two bodies do not even share
      // enough characters to be within maxDistance edits of each other, no
      // arrangement of those characters can bring them closer.
      if (histogramDistanceBound(histogram1, histograms[j]) > maxDistance) {
        continue;
      }

      // Identical normalized bodies are the single most common outcome on a
      // codebase with real copy-paste, and they are exactly the case where the
      // banded DP does the most work for a foregone conclusion.
      const distance = func1.body === func2.body
        ? 0
        : levenshteinDistanceBounded(func1.body, func2.body, maxDistance);

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
          similarity: similarity.toFixed(2),
          // 'exact': same code apart from formatting and comments.
          // 'structural': same shape, but identifiers/strings differ - the
          // similarity score is computed after normalizing those away, so a
          // structural 100% is NOT a byte-for-byte copy.
          matchType: strippedBodyOf(func1) === strippedBodyOf(func2) ? 'exact' : 'structural'
        });
      }
    }
  }

  return {
    duplicates,
    totalFunctions: allFunctions.length
  };
}

/**
 * Groups pairwise duplicate results into clusters of mutually similar
 * functions (connected components over the pair graph).
 * @param {Array<{func1: Object, func2: Object, similarity: string, matchType?: string}>} duplicates -
 *   The `duplicates` array returned by findDuplicates()
 * @returns {Array<{functions: Array<Object>, pairs: Array, minSimilarity: number,
 *   maxSimilarity: number, matchType: 'exact'|'structural'}>} One entry per
 *   cluster: its member functions (sorted by file path, then line), the pairs
 *   that connect them, the similarity range across those pairs, and 'exact'
 *   only if every pair in the cluster is an exact copy. Clusters are sorted
 *   largest-first, then by similarity.
 * @description N functions that are all similar to each other produce
 * N*(N-1)/2 pairs; reporting per cluster instead of per pair collapses that
 * quadratic noise (e.g. 10 near-identical route handlers are one group, not
 * 45 rows). Grouping is transitive, so within a group A~C is only implied
 * via A~B~C and the two ends may score below the threshold against each
 * other - the similarity range reflects only the directly-compared pairs.
 */
function groupDuplicates(duplicates) {
  // Union-find keyed on the function objects themselves (each extracted
  // function is a unique object, so identity is a safe key).
  const parent = new Map();

  const find = (func) => {
    let root = func;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression
    let current = func;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };

  for (const dup of duplicates) {
    if (!parent.has(dup.func1)) parent.set(dup.func1, dup.func1);
    if (!parent.has(dup.func2)) parent.set(dup.func2, dup.func2);
    parent.set(find(dup.func1), find(dup.func2));
  }

  const groupsByRoot = new Map();
  for (const dup of duplicates) {
    const root = find(dup.func1);
    let group = groupsByRoot.get(root);
    if (!group) {
      group = { members: new Set(), pairs: [] };
      groupsByRoot.set(root, group);
    }
    group.members.add(dup.func1);
    group.members.add(dup.func2);
    group.pairs.push(dup);
  }

  const groups = [...groupsByRoot.values()].map(({ members, pairs }) => {
    const similarities = pairs.map(pair => Number(pair.similarity));
    return {
      functions: [...members].sort(
        (a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line
      ),
      pairs,
      minSimilarity: Math.min(...similarities),
      maxSimilarity: Math.max(...similarities),
      matchType: pairs.every(pair => pair.matchType === 'exact') ? 'exact' : 'structural'
    };
  });

  return groups.sort(
    (a, b) => b.functions.length - a.functions.length || b.maxSimilarity - a.maxSimilarity
  );
}

/**
 * Walks a directory for JS/TS files, honouring .gitignore when asked to.
 * @param {string} directory - Directory to scan
 * @param {{excludeDirs?: Set<string>, gitignore?: boolean}} [options] - Scan filters
 * @returns {Array<string>} Absolute paths of the files to analyze
 * @description Convenience wrapper so the two bin entry points build the
 * gitignore matcher the same way instead of each assembling walk state.
 */
function collectSourceFiles(directory, options = {}) {
  return findJsFiles(
    directory,
    [],
    options.excludeDirs || null,
    { ignore: options.gitignore ? createGitignoreMatcher(directory) : null }
  );
}

export { findJsFiles, findDuplicates, groupDuplicates, collectSourceFiles };
