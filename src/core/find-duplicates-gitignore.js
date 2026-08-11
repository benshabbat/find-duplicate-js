import fs from 'fs';
import path from 'path';

/**
 * A .gitignore matcher covering the pattern syntax that appears in real
 * project ignore files.
 *
 * Supported: comments and blank lines, `!` negation, trailing-slash
 * directory-only patterns, leading-slash and embedded-slash anchoring,
 * `*` (does not cross a path separator), `**` (does), `?`, and `[...]`
 * character classes - including the `[!...]` negation spelling that glob uses
 * and JavaScript's regex engine does not.
 *
 * Not supported: git's `core.excludesFile`, `.git/info/exclude`, and the
 * escaping of literal `!`/`#` with a backslash. Those are rare in the
 * project-level ignore files this walks, and the cost of getting them wrong is
 * a file scanned that git would have hidden - noise, not a wrong answer.
 */

/**
 * Escapes the regex metacharacters that carry no meaning in a glob.
 * @param {string} text - Literal text from a pattern
 * @returns {string} Regex-safe text
 */
function escapeRegex(text) {
  return text.replace(/[.+^${}()|\\]/g, '\\$&');
}

/**
 * Translates one gitignore glob into an anchored regular expression.
 * @param {string} glob - The pattern with any `!`, trailing `/` and
 *   surrounding whitespace already stripped
 * @returns {RegExp} Matches a path relative to the directory owning the pattern
 * @description Walks the glob character by character rather than chaining
 * string replacements, because the tokens overlap: a `*` inside a `[...]`
 * class is a literal, and `**` means something entirely different from two
 * single stars.
 */
function globToRegExp(glob) {
  let source = '';
  let i = 0;

  while (i < glob.length) {
    const char = glob[i];

    if (char === '*') {
      if (glob[i + 1] === '*') {
        // `**/` consumes whole directory levels, including none at all.
        if (glob[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 3;
        } else {
          source += '.*';
          i += 2;
        }
      } else {
        source += '[^/]*';
        i++;
      }
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      i++;
      continue;
    }

    if (char === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end === -1) {
        source += '\\[';
        i++;
        continue;
      }
      let body = glob.slice(i + 1, end);
      // Glob spells negation `[!abc]`; regex spells it `[^abc]`.
      if (body.startsWith('!')) {
        body = '^' + body.slice(1);
      }
      source += `[${body}]`;
      i = end + 1;
      continue;
    }

    source += escapeRegex(char);
    i++;
  }

  return new RegExp(`^${source}$`);
}

/**
 * Parses the contents of a .gitignore file into matchable rules.
 * @param {string} contents - Raw file contents
 * @returns {Array<{regex: RegExp, negated: boolean, directoryOnly: boolean, anchored: boolean}>}
 */
function parseGitignore(contents) {
  const rules = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    // Trailing spaces are not part of a pattern; leading ones are not either
    // in any file written by a human.
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) {
      continue;
    }

    let pattern = line;
    let negated = false;

    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }

    const directoryOnly = pattern.endsWith('/');
    if (directoryOnly) {
      pattern = pattern.slice(0, -1);
    }

    // A pattern with a slash anywhere but the end is matched against the whole
    // relative path; one without is matched against any single path segment.
    const anchored = pattern.includes('/');
    if (pattern.startsWith('/')) {
      pattern = pattern.slice(1);
    }

    if (pattern === '') {
      continue;
    }

    rules.push({ regex: globToRegExp(pattern), negated, directoryOnly, anchored });
  }

  return rules;
}

/**
 * Builds a matcher over the .gitignore files found while walking a tree.
 * @param {string} rootDir - Absolute path of the directory being scanned
 * @returns {{ignores: (absolutePath: string, isDirectory: boolean) => boolean}}
 * @description Ignore files are read lazily, once per directory, as the walk
 * reaches them - a scan that never descends into a subtree never pays to read
 * its .gitignore. Rules are applied from the outermost directory inward, and
 * the last rule that matches decides, which is what makes `!` re-inclusion of
 * a path excluded by an earlier rule work.
 */
function createGitignoreMatcher(rootDir) {
  const base = path.resolve(rootDir);
  // Directory absolute path -> rules declared by the .gitignore in it.
  const rulesByDirectory = new Map();

  const rulesFor = (directory) => {
    let rules = rulesByDirectory.get(directory);
    if (rules === undefined) {
      try {
        rules = parseGitignore(fs.readFileSync(path.join(directory, '.gitignore'), 'utf8'));
      } catch {
        rules = []; // No ignore file here, or it is unreadable.
      }
      rulesByDirectory.set(directory, rules);
    }
    return rules;
  };

  return {
    /**
     * @param {string} absolutePath - Path to test
     * @param {boolean} isDirectory - Whether the path is a directory
     * @returns {boolean} True if git would ignore this path
     */
    ignores(absolutePath, isDirectory) {
      const target = path.resolve(absolutePath);
      const relativeToBase = path.relative(base, target);

      if (relativeToBase === '' || relativeToBase.startsWith('..')) {
        return false;
      }

      const segments = relativeToBase.split(path.sep);

      // Each ancestor directory is tested in turn, not just the entry itself:
      // git stops descending at an ignored directory, so everything beneath
      // `dist/` is ignored by the rule `dist/` even though that rule is
      // directory-only and the thing being asked about is a file. It also
      // means a `!` rule inside an ignored directory cannot rescue anything -
      // hence the early return rather than a running flag.
      for (let depth = 0; depth < segments.length; depth++) {
        const isLastSegment = depth === segments.length - 1;
        // Every segment but the last is, by construction, a directory.
        const entryIsDirectory = isLastSegment ? isDirectory : true;
        const name = segments[depth];

        // Ignore files from the scan root down to this entry's parent apply,
        // outermost first, with the last matching rule winning.
        let ignored = false;
        let directory = base;

        for (let owner = 0; owner <= depth; owner++) {
          const relativeToOwner = segments.slice(owner, depth + 1).join('/');

          for (const rule of rulesFor(directory)) {
            if (rule.directoryOnly && !entryIsDirectory) {
              continue;
            }

            const subject = rule.anchored ? relativeToOwner : name;
            if (rule.regex.test(subject)) {
              ignored = !rule.negated;
            }
          }

          directory = path.join(directory, segments[owner]);
        }

        if (ignored) {
          return true;
        }
      }

      return false;
    }
  };
}

export { createGitignoreMatcher, parseGitignore, globToRegExp };
