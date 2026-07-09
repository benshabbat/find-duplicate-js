#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { findDuplicates, findJsFiles } from './find-duplicates-core.js';
import { startServer } from './find-duplicates-ui.js';

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

// Parse command line arguments
const args = process.argv.slice(2);
const hasUIFlag = args.includes('--ui');
const filteredArgs = args.filter(arg => arg !== '--ui');
const directory = filteredArgs[0] || process.cwd();
const threshold = parseInt(filteredArgs[1]) || 70;

if (!fs.existsSync(directory)) {
  console.error(`❌ Error: Directory "${directory}" does not exist`);
  process.exit(1);
}

// Run UI server or CLI based on flag
if (hasUIFlag) {
  startServer(directory, threshold);
} else {
  console.log(`\n🚀 Searching for duplicate code in: ${directory}`);
  console.log(`📏 Similarity threshold: ${threshold}%`);

  const jsFiles = findJsFiles(directory);
  console.log(`\n🔍 Scanning ${jsFiles.length} JavaScript files...\n`);

  // Reuse the file list we already walked instead of having
  // findDuplicates() walk the directory tree a second time.
  const result = findDuplicates(directory, threshold, jsFiles);
  console.log(`📊 Found ${result.totalFunctions} functions total\n`);

  displayResults(result);
}

// Export functions for programmatic use
export { findDuplicates, findJsFiles, extractFunctions, normalizeCode, calculateSimilarity } from './find-duplicates-core.js';
