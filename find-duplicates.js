#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { findDuplicates, collectSourceFiles, groupDuplicates } from './src/core/find-duplicates-core.js';
import {
  parseDirectoryArgs,
  parsePortFlag,
  parseExcludeFlag,
  parseMinLengthFlag,
  parseOutputFlag,
  parseConfigFlag,
  loadConfig,
  excludeSetFromConfig
} from './src/core/find-duplicates-cli-args.js';
import { createProgressReporter } from './src/core/find-duplicates-progress.js';
import { startServer } from './src/ui/find-duplicates-ui.js';

// Bumped only when the shape of --json output changes in a way a consumer
// could trip over, so scripts can check one number instead of sniffing fields.
const JSON_SCHEMA_VERSION = 1;

/**
 * Reads this package's version from its manifest.
 * @returns {string} The version string
 */
function packageVersion() {
  return JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
}

/**
 * Formats a group's similarity range for display, collapsing min==max to a
 * single percentage.
 * @param {{minSimilarity: number, maxSimilarity: number}} group
 * @returns {string} e.g. "100.00%" or "85.10-94.30%"
 */
function similarityRangeOf(group) {
  return group.minSimilarity === group.maxSimilarity
    ? `${group.maxSimilarity.toFixed(2)}%`
    : `${group.minSimilarity.toFixed(2)}-${group.maxSimilarity.toFixed(2)}%`;
}

/**
 * Displays the duplicate detection results to the console, grouped into
 * clusters of mutually similar functions.
 * @param {{duplicates: Array, totalFunctions: number}} result - The analysis result object
 * @param {(line: string) => void} [emit=console.log] - Where each line goes;
 *   --output swaps this for a collector that writes the report to a file
 * @description N functions that all match each other are printed as one
 * group instead of N*(N-1)/2 pair rows. Each group is labeled 'exact copies'
 * (identical apart from formatting/comments) or 'structural' (same shape,
 * but identifiers/strings differ - the similarity score is computed after
 * normalizing those away).
 */
function displayResults(result, emit = console.log) {
  const duplicates = result.duplicates;

  if (duplicates.length === 0) {
    emit('\n✅ Great! No duplicate functions found.\n');
    return;
  }

  const groups = groupDuplicates(duplicates);

  emit(`\n⚠️  Found ${duplicates.length} pair${duplicates.length > 1 ? 's' : ''} of similar functions in ${groups.length} group${groups.length > 1 ? 's' : ''}:\n`);
  emit('═'.repeat(90));

  groups.forEach((group, index) => {
    const label = group.matchType === 'exact' ? 'exact copies' : 'structural';
    emit(`\n📦 Group #${index + 1} - ${group.functions.length} functions - Similarity: ${similarityRangeOf(group)} (${label})`);
    group.functions.forEach(func => {
      emit(`   • ${func.name}()  ${path.relative(process.cwd(), func.filePath)}:${func.line}`);
    });
    emit(`   Code: ${group.functions[0].originalBody.substring(0, 60).replace(/\n/g, ' ')}...`);
    emit('\n' + '─'.repeat(90));
  });

  emit('\nℹ️  Similarity is measured after normalizing identifiers and string literals.');
  emit('   "structural" groups share the same shape but differ in names or literals;');
  emit('   only "exact copies" are identical code (apart from formatting and comments).');
  emit(`\n💡 Summary: ${groups.length} duplicate group${groups.length > 1 ? 's' : ''} (${duplicates.length} function pair${duplicates.length > 1 ? 's' : ''})\n`);
}

const HELP_TEXT = `
Usage: find-duplicate [directory] [threshold] [options]

Arguments:
  directory   Directory to scan (default: current working directory)
  threshold   Similarity percentage between 1 and 100 (default: 70)

Options:
  --ui                   Launch the interactive web UI instead of printing to the terminal
  --port <number>        Port for the web UI server (only with --ui; default: 2712)
  --exclude <names>      Comma-separated extra directory names to skip
                         (in addition to node_modules, .git, dist, build, out,
                         coverage, and framework build/cache dirs like .next,
                         .nuxt, .svelte-kit, .turbo, .vercel, .cache)
  --gitignore            Also skip files and directories ignored by .gitignore
  --min-length <chars>   Ignore functions whose normalized body is shorter than
                         this many characters (filters trivial one-liners)
  --json                 Print results as JSON (machine-readable, no decorative output)
  --output <file>        Write the report to a file instead of stdout
  --config <file>        Read defaults from a JSON config file
                         (default: .findduplicaterc.json, if present)
  --fail-on-duplicates   Exit with code 1 if any duplicates are found (for CI gates)
  -v, --version          Print the installed version and exit
  -h, --help             Show this help message and exit

Command-line flags always win over values from a config file.

Examples:
  find-duplicate                        Scan the current directory at 70% similarity
  find-duplicate ./src 85               Scan ./src at 85% similarity
  find-duplicate --ui ./src             Open the web UI for ./src
  find-duplicate ./src --json           Print JSON results for scripting
  find-duplicate ./src --json --output report.json
  find-duplicate ./src --gitignore --exclude vendor,generated --min-length 30
  find-duplicate ./src 80 --fail-on-duplicates   Fail a CI build on duplicates
`;

/**
 * Parses command line arguments and runs the CLI or UI server.
 * @description Only invoked when this file is executed directly (see the
 *   isMainModule check below) so that importing this module as a library
 *   never scans a directory or touches process.argv/process.exit as a
 *   side effect.
 */
function runCli() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(packageVersion());
    process.exit(0);
  }

  const { config: configPath, args: argsWithoutConfig } = parseConfigFlag(args);
  const config = loadConfig(configPath);

  const hasUIFlag = argsWithoutConfig.includes('--ui') || config.ui === true;
  const hasJsonFlag = argsWithoutConfig.includes('--json') || config.json === true;
  const hasFailFlag = argsWithoutConfig.includes('--fail-on-duplicates') || config.failOnDuplicates === true;
  const useGitignore = argsWithoutConfig.includes('--gitignore') || config.gitignore === true;
  const { port: portFlag, args: argsWithoutPort } = parsePortFlag(argsWithoutConfig);
  const { excludeDirs: excludeFlag, args: argsWithoutExclude } = parseExcludeFlag(argsWithoutPort);
  const { minLength: minLengthFlag, args: argsWithoutMinLength } = parseMinLengthFlag(argsWithoutExclude);
  const { output: outputFlag, args: argsWithoutOutput } = parseOutputFlag(argsWithoutMinLength);
  const filteredArgs = argsWithoutOutput.filter(
    arg => arg !== '--ui' && arg !== '--json' && arg !== '--fail-on-duplicates' && arg !== '--gitignore'
  );

  // A flag that was actually passed always wins; the config file only fills in
  // what the command line left unsaid.
  const port = portFlag !== undefined ? portFlag : config.port;
  const excludeDirs = excludeFlag !== undefined ? excludeFlag : excludeSetFromConfig(config.exclude);
  const minLength = minLengthFlag !== undefined ? minLengthFlag : config.minLength;
  const output = outputFlag !== undefined ? outputFlag : config.output;

  if (hasUIFlag && (hasJsonFlag || hasFailFlag)) {
    console.error(`❌ Error: ${hasJsonFlag ? '--json' : '--fail-on-duplicates'} cannot be combined with --ui`);
    process.exit(1);
  }

  if (hasUIFlag && output !== undefined) {
    console.error('❌ Error: --output cannot be combined with --ui');
    process.exit(1);
  }

  if (port !== undefined && !hasUIFlag) {
    console.error('❌ Error: --port can only be used with --ui');
    process.exit(1);
  }

  // Positional arguments fall back to the config file the same way flags do.
  const positionalArgs = [...filteredArgs];
  if (positionalArgs[0] === undefined && config.directory !== undefined) {
    positionalArgs[0] = String(config.directory);
  }
  if (positionalArgs[1] === undefined && config.threshold !== undefined) {
    positionalArgs[1] = String(config.threshold);
  }

  const { directory, threshold } = parseDirectoryArgs(positionalArgs);
  const scanOptions = { excludeDirs, minLength, gitignore: useGitignore };

  // Run UI server or CLI based on flag
  if (hasUIFlag) {
    startServer(directory, threshold, port, scanOptions);
    return;
  }

  const jsFiles = collectSourceFiles(directory, { excludeDirs, gitignore: useGitignore });

  // Written to whenever --output is set, so the report lands in the file and
  // only the incidental chatter goes to the terminal.
  const reportLines = [];
  const emit = output !== undefined
    ? line => reportLines.push(line)
    : line => console.log(line);

  // The progress line and the report share the terminal, so progress has to be
  // torn down before anything is printed.
  const progress = hasJsonFlag ? null : createProgressReporter();
  const scanWithProgress = { ...scanOptions, onProgress: progress ? progress.onProgress : undefined };

  let result;

  if (hasJsonFlag) {
    result = findDuplicates(directory, threshold, jsFiles, scanWithProgress);
    emit(JSON.stringify({
      schemaVersion: JSON_SCHEMA_VERSION,
      tool: { name: 'find-duplicate-js', version: packageVersion() },
      directory: path.resolve(directory),
      threshold,
      filesScanned: jsFiles.length,
      totalFunctions: result.totalFunctions,
      duplicates: result.duplicates.map(dup => ({
        similarity: Number(dup.similarity),
        matchType: dup.matchType,
        func1: locationOf(dup.func1),
        func2: locationOf(dup.func2)
      })),
      groups: groupDuplicates(result.duplicates).map(group => ({
        similarity: { min: group.minSimilarity, max: group.maxSimilarity },
        matchType: group.matchType,
        pairCount: group.pairs.length,
        functions: group.functions.map(locationOf)
      }))
    }, null, 2));
  } else {
    console.log(`\n🚀 Searching for duplicate code in: ${directory}`);
    console.log(`📏 Similarity threshold: ${threshold}%`);
    console.log(`\n🔍 Scanning ${jsFiles.length} JavaScript/TypeScript files...\n`);

    // Reuse the file list we already walked instead of having
    // findDuplicates() walk the directory tree a second time.
    result = findDuplicates(directory, threshold, jsFiles, scanWithProgress);
    if (progress) progress.done();

    // totalFunctions is post-filter, so say so - otherwise a --min-length
    // run looks like the extractor missed most of the codebase.
    const minLengthNote = minLength > 0 ? ` (with normalized body >= ${minLength} chars; shorter ones ignored)` : '';
    emit(`📊 Found ${result.totalFunctions} functions total${minLengthNote}\n`);

    displayResults(result, emit);
  }

  if (progress) progress.done();

  if (output !== undefined) {
    try {
      fs.writeFileSync(output, reportLines.join('\n') + '\n');
    } catch (error) {
      console.error(`❌ Error: Could not write to "${output}": ${error.message}`);
      process.exit(1);
    }
    console.log(`✅ Report written to ${output}`);
  }

  if (hasFailFlag && result.duplicates.length > 0) {
    process.exit(1);
  }
}

/**
 * Maps an extracted function object to the compact location shape used in
 * `--json` output.
 * @param {{name: string, filePath: string, line: number}} func - Extracted function
 * @returns {{name: string, file: string, line: number}}
 */
function locationOf(func) {
  return {
    name: func.name,
    file: path.relative(process.cwd(), func.filePath),
    line: func.line
  };
}

// Run as CLI only when this file is executed directly (not when imported)
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runCli();
}

// Export functions for programmatic use
export { findDuplicates, findJsFiles, groupDuplicates, extractFunctions, extractJSXComponents, normalizeCode, calculateSimilarity } from './src/core/find-duplicates-core.js';
