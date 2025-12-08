#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { findDuplicates, findJsFiles } = require('./find-duplicates-core.js');

/**
 * מציג את התוצאות
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
    console.log(`\n   File 1: ${path.relative(process.cwd(), dup.func1.filePath)}`);
    console.log(`   Function: ${dup.func1.name}()`);
    console.log(`   Code: ${dup.func1.originalBody.substring(0, 60).replace(/\n/g, ' ')}...`);
    console.log(`\n   File 2: ${path.relative(process.cwd(), dup.func2.filePath)}`);
    console.log(`   Function: ${dup.func2.name}()`);
    console.log(`   Code: ${dup.func2.originalBody.substring(0, 60).replace(/\n/g, ' ')}...`);
    console.log('\n' + '─'.repeat(90));
  });

  console.log(`\n💡 Summary: Found ${duplicates.length} duplicate function pair${duplicates.length > 1 ? 's' : ''}\n`);
}

// הרץ את הסקריפט
const args = process.argv.slice(2);
const directory = args[0] || process.cwd();
const threshold = parseInt(args[1]) || 70;

if (!fs.existsSync(directory)) {
  console.error(`❌ Error: Directory "${directory}" does not exist`);
  process.exit(1);
}

console.log(`\n🚀 Searching for duplicate code in: ${directory}`);
console.log(`📏 Similarity threshold: ${threshold}%`);

const jsFiles = findJsFiles(directory);
console.log(`\n🔍 Scanning ${jsFiles.length} JavaScript files...\n`);

const result = findDuplicates(directory, threshold);
console.log(`📊 Found ${result.totalFunctions} functions total\n`);

displayResults(result);
