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

/**
 * Extracts a `--port <number>` / `--port=<number>` flag from an argument
 * list, validating the value. Shared by both bin entry points so the web UI
 * port can be chosen the same way from `find-duplicate --ui` and
 * `find-duplicate-ui`.
 * @param {string[]} args - Raw args, e.g. `process.argv.slice(2)`
 * @returns {{port: number|undefined, args: string[]}} The parsed port (or
 *   undefined if the flag wasn't given) and the remaining args with the
 *   flag and its value removed
 */
function parsePortFlag(args) {
  const remaining = [];
  let port;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let value;

    if (arg === '--port') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --port requires a value (e.g. --port 3000)');
        process.exit(1);
      }
      value = args[++i];
    } else if (arg.startsWith('--port=')) {
      value = arg.slice('--port='.length);
    } else {
      remaining.push(arg);
      continue;
    }

    port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`❌ Error: Port must be an integer between 1 and 65535 (got "${value}")`);
      process.exit(1);
    }
  }

  return { port, args: remaining };
}

export { parseDirectoryArgs, parsePortFlag };
