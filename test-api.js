// Testing find-duplicate-js API

import { findDuplicates, findJsFiles } from './find-duplicates-core.js';

console.log('🧪 Testing find-duplicate-js API\n');

// 1. Test file search
console.log('1️⃣ Searching for JavaScript files...');
const files = findJsFiles('./demo-project');
console.log(`✅ Found ${files.length} files`);
console.log('📂 Files:', files);

// 2. Test duplicate search
console.log('\n2️⃣ Searching for duplicates...');
const result = findDuplicates('./demo-project', 70);

console.log(`✅ Total functions: ${result.totalFunctions}`);
console.log(`⚠️  Duplicate pairs: ${result.duplicates.length}`);

// 3. Display results
if (result.duplicates.length > 0) {
  console.log('\n📋 Duplicate details:\n');
  result.duplicates.forEach((dup, index) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔍 Match #${index + 1}`);
    console.log(`📊 Similarity: ${dup.similarity}%`);
    console.log(`\n📄 Function 1:`);
    console.log(`   Name: ${dup.func1.name}`);
    console.log(`   File: ${dup.func1.filePath}`);
    console.log(`\n📄 Function 2:`);
    console.log(`   Name: ${dup.func2.name}`);
    console.log(`   File: ${dup.func2.filePath}`);
    console.log();
  });
} else {
  console.log('\n✨ No duplicates found!');
}

console.log('\n✅ Test completed successfully!');
