import fs from 'fs';

/**
 * Parses the shared `directory [threshold]` positional arguments used by
 * both bin entry points (find-duplicates.js and find-duplicates-ui.js) and
 * validates that the directory exists. Kept in one place so the two CLIs
 * can't drift out of sync on validation (they previously did: only one of
 * the two checked `fs.existsSync` before starting).
 * @param {string[]} args - Positional args, e.g. `process.argv.slice(2)`
 *   with any flags already filtered out
 * @returns {{directory: string, threshold: number}}
 */
function parseDirectoryArgs(args) {
  const directory = args[0] || process.cwd();
  let threshold = 70;

  if (args[1] !== undefined) {
    // Number() (unlike parseInt) rejects trailing garbage like "70abc",
    // so typos fail loudly instead of silently scanning with the default.
    threshold = Number(args[1]);
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
      console.error(`❌ Error: Threshold must be a number between 1 and 100 (got "${args[1]}")`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(directory)) {
    console.error(`❌ Error: Directory "${directory}" does not exist`);
    process.exit(1);
  }

  return { directory, threshold };
}

export { parseDirectoryArgs };
