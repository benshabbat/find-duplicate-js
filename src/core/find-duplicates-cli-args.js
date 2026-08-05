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
 * Extracts a single `--flag value` / `--flag=value` pair from an argument
 * list. Exits with an error if the flag is present but has no value.
 * @param {string[]} args - Raw args
 * @param {string} flag - Flag name including dashes, e.g. '--port'
 * @param {string} example - Example value shown in the missing-value error
 * @returns {{value: string|undefined, args: string[]}} The raw value (or
 *   undefined if the flag wasn't given) and the remaining args with the
 *   flag and its value removed
 */
function extractFlagValue(args, flag, example) {
  const remaining = [];
  let value;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === flag) {
      if (i + 1 >= args.length) {
        console.error(`❌ Error: ${flag} requires a value (e.g. ${flag} ${example})`);
        process.exit(1);
      }
      value = args[++i];
    } else if (arg.startsWith(flag + '=')) {
      value = arg.slice(flag.length + 1);
    } else {
      remaining.push(arg);
    }
  }

  return { value, args: remaining };
}

/**
 * Extracts a `--port <number>` / `--port=<number>` flag from an argument
 * list, validating the value. Shared by both bin entry points so the web UI
 * port can be chosen the same way from `find-duplicate --ui` and
 * `find-duplicate-ui`.
 * @param {string[]} args - Raw args, e.g. `process.argv.slice(2)`
 * @returns {{port: number|undefined, args: string[]}}
 */
function parsePortFlag(args) {
  const { value, args: remaining } = extractFlagValue(args, '--port', '3000');

  if (value === undefined) {
    return { port: undefined, args: remaining };
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`❌ Error: Port must be an integer between 1 and 65535 (got "${value}")`);
    process.exit(1);
  }

  return { port, args: remaining };
}

/**
 * Extracts an `--exclude <names>` / `--exclude=<names>` flag: a
 * comma-separated list of extra directory names to skip while scanning
 * (on top of the built-in skip list of package/VCS/build/cache directories -
 * see SKIPPED_DIRECTORIES in find-duplicates-scanner.js).
 * @param {string[]} args - Raw args
 * @returns {{excludeDirs: Set<string>|undefined, args: string[]}}
 */
function parseExcludeFlag(args) {
  const { value, args: remaining } = extractFlagValue(args, '--exclude', 'vendor,generated');

  if (value === undefined) {
    return { excludeDirs: undefined, args: remaining };
  }

  const names = value.split(',').map(name => name.trim()).filter(name => name.length > 0);
  if (names.length === 0) {
    console.error(`❌ Error: --exclude must list at least one directory name (got "${value}")`);
    process.exit(1);
  }

  return { excludeDirs: new Set(names), args: remaining };
}

/**
 * Extracts a `--min-length <chars>` / `--min-length=<chars>` flag: the
 * minimum normalized-body length (in characters) a function must have to
 * take part in duplicate comparison. Filters out trivial one-liners like
 * `return true;` that otherwise match each other at 100%.
 * @param {string[]} args - Raw args
 * @returns {{minLength: number|undefined, args: string[]}}
 */
function parseMinLengthFlag(args) {
  const { value, args: remaining } = extractFlagValue(args, '--min-length', '30');

  if (value === undefined) {
    return { minLength: undefined, args: remaining };
  }

  const minLength = Number(value);
  if (!Number.isInteger(minLength) || minLength < 0) {
    console.error(`❌ Error: --min-length must be a non-negative integer (got "${value}")`);
    process.exit(1);
  }

  return { minLength, args: remaining };
}

export { parseDirectoryArgs, parsePortFlag, parseExcludeFlag, parseMinLengthFlag };
