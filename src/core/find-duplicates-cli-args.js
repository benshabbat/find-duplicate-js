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
  const threshold = parseInt(args[1]) || 70;

  if (!fs.existsSync(directory)) {
    console.error(`❌ Error: Directory "${directory}" does not exist`);
    process.exit(1);
  }

  return { directory, threshold };
}

export { parseDirectoryArgs };
