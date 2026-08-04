#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { findDuplicates, findJsFiles } from './src/core/find-duplicates-core.js';
import { parseDirectoryArgs, parsePortFlag } from './src/core/find-duplicates-cli-args.js';
import { startServer } from './src/ui/find-duplicates-ui.js';

/**
 * Displays the duplicate detection results to the console
 * @param {{duplicates: Array, totalFunctions: number}} result - The analysis result object
 * @description Formats and prints duplicate function pairs with similarity scores and file locations
 */
function displayResults(result) {
  const duplicates = result.duplicates;
  
  if (duplicates.length === 0) {
    console.log('\n✅ Great! No duplicate functions found.\n');
    return;
  }

  console.log(`\n⚠️  Found ${duplicates.length} pairs of similar functions:\n`);
  console.log('═'.repeat(90));

  duplicates.forEach((dup, index) => {
    console.log(`\n📋 Match #${index + 1} - Similarity: ${dup.similarity}%`);
    console.log(`\n   File 1: ${path.relative(process.cwd(), dup.func1.filePath)}:${dup.func1.line}`);
    console.log(`   Function: ${dup.func1.name}()`);
    console.log(`   Code: ${dup.func1.originalBody.substring(0, 60).replace(/\n/g, ' ')}...`);
    console.log(`\n   File 2: ${path.relative(process.cwd(), dup.func2.filePath)}:${dup.func2.line}`);
    console.log(`   Function: ${dup.func2.name}()`);
    console.log(`   Code: ${dup.func2.originalBody.substring(0, 60).replace(/\n/g, ' ')}...`);
    console.log('\n' + '─'.repeat(90));
  });

  console.log(`\n💡 Summary: Found ${duplicates.length} duplicate function pair${duplicates.length > 1 ? 's' : ''}\n`);
}

const HELP_TEXT = `
Usage: find-duplicate [directory] [threshold] [options]

Arguments:
  directory   Directory to scan (default: current working directory)
  threshold   Similarity percentage between 1 and 100 (default: 70)

Options:
  --ui                   Launch the interactive web UI instead of printing to the terminal
  --port <number>        Port for the web UI server (only with --ui; default: 2712)
  --json                 Print results as JSON (machine-readable, no decorative output)
  --fail-on-duplicates   Exit with code 1 if any duplicates are found (for CI gates)
  -v, --version          Print the installed version and exit
  -h, --help             Show this help message and exit

Examples:
  find-duplicate                        Scan the current directory at 70% similarity
  find-duplicate ./src 85               Scan ./src at 85% similarity
  find-duplicate --ui ./src             Open the web UI for ./src
  find-duplicate ./src --json           Print JSON results for scripting
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
    const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
    process.exit(0);
  }

  const hasUIFlag = args.includes('--ui');
  const hasJsonFlag = args.includes('--json');
  const hasFailFlag = args.includes('--fail-on-duplicates');
  const { port, args: argsWithoutPort } = parsePortFlag(args);
  const filteredArgs = argsWithoutPort.filter(
    arg => arg !== '--ui' && arg !== '--json' && arg !== '--fail-on-duplicates'
  );

  if (hasUIFlag && (hasJsonFlag || hasFailFlag)) {
    console.error(`❌ Error: ${hasJsonFlag ? '--json' : '--fail-on-duplicates'} cannot be combined with --ui`);
    process.exit(1);
  }

  if (port !== undefined && !hasUIFlag) {
    console.error('❌ Error: --port can only be used with --ui');
    process.exit(1);
  }

  const { directory, threshold } = parseDirectoryArgs(filteredArgs);

  // Run UI server or CLI based on flag
  if (hasUIFlag) {
    startServer(directory, threshold, port);
    return;
  }

  const jsFiles = findJsFiles(directory);
  let result;

  if (hasJsonFlag) {
    result = findDuplicates(directory, threshold, jsFiles);
    console.log(JSON.stringify({
      directory: path.resolve(directory),
      threshold,
      filesScanned: jsFiles.length,
      totalFunctions: result.totalFunctions,
      duplicates: result.duplicates.map(dup => ({
        similarity: Number(dup.similarity),
        func1: locationOf(dup.func1),
        func2: locationOf(dup.func2)
      }))
    }, null, 2));
  } else {
    console.log(`\n🚀 Searching for duplicate code in: ${directory}`);
    console.log(`📏 Similarity threshold: ${threshold}%`);
    console.log(`\n🔍 Scanning ${jsFiles.length} JavaScript/TypeScript files...\n`);

    // Reuse the file list we already walked instead of having
    // findDuplicates() walk the directory tree a second time.
    result = findDuplicates(directory, threshold, jsFiles);
    console.log(`📊 Found ${result.totalFunctions} functions total\n`);

    displayResults(result);
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
export { findDuplicates, findJsFiles, extractFunctions, extractJSXComponents, normalizeCode, calculateSimilarity } from './src/core/find-duplicates-core.js';
