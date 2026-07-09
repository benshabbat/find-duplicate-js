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
  const rawSimilarity = ((maxLen - distance) / maxLen) * 100;

  return applyComponentAdjustment(rawSimilarity, components1, components2);
}

/**
 * Adjusts a raw (text-only) similarity percentage based on JSX/TSX component
 * overlap between the two functions being compared.
 * @param {number} rawSimilarity - Similarity percentage from Levenshtein distance alone
 * @param {Set<string>} components1 - JSX components in first snippet
 * @param {Set<string>} components2 - JSX components in second snippet
 * @returns {number} Adjusted similarity percentage
 * @description Shared by calculateSimilarity() and findDuplicates()'s fast path
 * so both apply the exact same JSX weighting.
 */
function applyComponentAdjustment(rawSimilarity, components1, components2) {
  if (components1.size === 0 || components2.size === 0) {
    return rawSimilarity;
  }

  const commonComponents = new Set([...components1].filter(c => components2.has(c)));

  if (commonComponents.size === 0) {
    return rawSimilarity * 0.3; // Reduce by 70%
  }

  const totalUniqueComponents = new Set([...components1, ...components2]).size;
  const componentSimilarity = (commonComponents.size / totalUniqueComponents);

  // Apply component similarity as a factor (weight it 30%)
  return rawSimilarity * 0.7 + (componentSimilarity * 100 * 0.3);
}

/**
 * Computes the minimum *raw* (pre-JSX-adjustment) similarity percentage that
 * two functions would need in order for their JSX-adjusted similarity to
 * reach `threshold`, given their actual JSX component overlap.
 * @param {number} threshold - The similarity threshold that must be met
 * @param {Set<string>} components1 - JSX components in first snippet
 * @param {Set<string>} components2 - JSX components in second snippet
 * @returns {number} Required raw similarity percentage, clamped to [0, 100].
 * Returns Infinity if no raw similarity (not even 100%) could reach the
 * threshold, e.g. when both sides have JSX components but share none of them.
 * @description Used by findDuplicates() to size the Levenshtein "max distance"
 * band before running the expensive comparison, so pairs that can't possibly
 * reach the threshold are skipped without ever computing their exact distance.
 */
function requiredRawSimilarity(threshold, components1, components2) {
  if (components1.size === 0 || components2.size === 0) {
    return threshold;
  }

  const commonComponents = new Set([...components1].filter(c => components2.has(c)));

  if (commonComponents.size === 0) {
    // adjusted = raw * 0.3
    const required = threshold / 0.3;
    return required > 100 ? Infinity : required;
  }

  const totalUniqueComponents = new Set([...components1, ...components2]).size;
  const componentSimilarity = (commonComponents.size / totalUniqueComponents);

  // adjusted = raw * 0.7 + componentSimilarity * 30  =>  raw = (adjusted - componentSimilarity * 30) / 0.7
  const required = (threshold - componentSimilarity * 100 * 0.3) / 0.7;
  return Math.min(100, Math.max(0, required));
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
 * Computes the Levenshtein distance between two strings, but only up to
 * `maxDistance`. Returns `maxDistance + 1` (a "too far" sentinel) as soon as
 * it's certain the true distance exceeds `maxDistance`, without necessarily
 * computing the exact value in that case.
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {number} maxDistance - Largest distance the caller cares about
 * @returns {number} The exact distance if it is <= maxDistance, otherwise
 * `maxDistance + 1`.
 * @description Any edit path that visits a cell (i, j) with
 * |i - j| > maxDistance needs at least |i - j| insertions/deletions just to
 * reconcile the length difference, so its total cost is already >
 * maxDistance. Skipping those cells (banding) therefore never changes the
 * result when the true distance is <= maxDistance - it only skips
 * computation that couldn't have produced a better answer. This turns each
 * comparison from O(len1*len2) into O(max(len1,len2)*maxDistance), which
 * matters because findDuplicates() calls this once per compared function
 * pair whose sizes are already close enough to be plausible duplicates.
 */
function levenshteinDistanceBounded(str1, str2, maxDistance) {
  const len1 = str1.length;
  const len2 = str2.length;

  if (Math.abs(len1 - len2) > maxDistance) return maxDistance + 1;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  const TOO_FAR = maxDistance + 1;
  let prevRow = new Array(len1 + 1);
  let currRow = new Array(len1 + 1);

  for (let j = 0; j <= len1; j++) {
    prevRow[j] = j <= maxDistance ? j : TOO_FAR;
  }

  for (let i = 1; i <= len2; i++) {
    const jLo = Math.max(1, i - maxDistance);
    const jHi = Math.min(len1, i + maxDistance);
    const code2 = str2.charCodeAt(i - 1);

    currRow[0] = i <= maxDistance ? i : TOO_FAR;
    for (let j = 1; j < jLo; j++) currRow[j] = TOO_FAR;

    for (let j = jLo; j <= jHi; j++) {
      const cost = code2 === str1.charCodeAt(j - 1) ? 0 : 1;
      const deletion = prevRow[j] + 1;
      const insertion = currRow[j - 1] + 1;
      const substitution = prevRow[j - 1] + cost;
      const value = deletion < insertion
        ? (deletion < substitution ? deletion : substitution)
        : (insertion < substitution ? insertion : substitution);
      currRow[j] = value > TOO_FAR ? TOO_FAR : value;
    }

    for (let j = jHi + 1; j <= len1; j++) currRow[j] = TOO_FAR;

    const tmp = prevRow;
    prevRow = currRow;
    currRow = tmp;
  }

  return prevRow[len1] > maxDistance ? TOO_FAR : prevRow[len1];
}

export {
  calculateSimilarity,
  applyComponentAdjustment,
  requiredRawSimilarity,
  levenshteinDistance,
  levenshteinDistanceBounded
};
