#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * מחלץ פונקציות מקוד JavaScript
 */
function extractFunctions(code, filePath) {
  const functions = [];
  const functionPositions = new Map();
  
  // מצא את כל הפונקציות ומיקומן
  const functionMatches = [];
  
  // 1. Arrow functions with const/let/var
  const arrowRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g;
  let match;
  while ((match = arrowRegex.exec(code)) !== null) {
    functionMatches.push({
      name: match[1],
      start: match.index,
      bodyStart: match.index + match[0].length - 1,
      type: 'arrow'
    });
  }
  
  // 2. Function declarations
  const funcRegex = /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g;
  while ((match = funcRegex.exec(code)) !== null) {
    functionMatches.push({
      name: match[1],
      start: match.index,
      bodyStart: match.index + match[0].length - 1,
      type: 'function'
    });
  }
  
  // 3. Methods (class methods, object methods)
  const methodRegex = /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/gm;
  while ((match = methodRegex.exec(code)) !== null) {
    const name = match[1];
    // דלג על מילות מפתח של JavaScript
    const jsKeywords = ['if', 'for', 'while', 'switch', 'catch', 'with'];
    if (jsKeywords.includes(name)) {
      continue;
    }
    
    // בדוק שזה לא function declaration או arrow function
    const before = code.substring(Math.max(0, match.index - 20), match.index);
    if (!/(?:function|const|let|var|=|=>)\s*$/.test(before)) {
      functionMatches.push({
        name: match[1],
        start: match.index,
        bodyStart: match.index + match[0].length - 1,
        type: 'method'
      });
    }
  }
  
  // מיין לפי מיקום
  functionMatches.sort((a, b) => a.start - b.start);
  
  // חלץ את גוף כל פונקציה
  functionMatches.forEach(funcMatch => {
    const body = extractFunctionBody(code, funcMatch.bodyStart);
    
    if (body && body.trim().length > 0) {
      const normalizedBody = normalizeCode(body);
      const uniqueKey = `${filePath}:${funcMatch.start}`;
      
      if (!functionPositions.has(uniqueKey)) {
        functionPositions.set(uniqueKey, true);
        functions.push({
          name: funcMatch.name,
          body: normalizedBody,
          originalBody: body,
          filePath,
          startIndex: funcMatch.start
        });
      }
    }
  });

  return functions;
}

/**
 * מחלץ את גוף הפונקציה מתוך הקוד
 */
function extractFunctionBody(code, startBrace) {
  let braceCount = 1;
  let i = startBrace + 1;
  let inString = false;
  let stringChar = '';
  let inComment = false;
  
  while (i < code.length && braceCount > 0) {
    const char = code[i];
    const nextChar = code[i + 1];
    
    // Handle comments
    if (!inString && char === '/' && nextChar === '/') {
      // Skip to end of line
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (!inString && char === '/' && nextChar === '*') {
      // Skip to end of block comment
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    
    // Handle strings
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && code[i - 1] !== '\\') {
      inString = false;
    }
    
    // Count braces only outside strings
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    i++;
  }
  
  if (braceCount === 0) {
    return code.substring(startBrace + 1, i - 1);
  }
  
  return null;
}

/**
 * מנרמל קוד להשוואה - מסיר רווחים, הערות ושמות משתנים
 */
function normalizeCode(code) {
  let normalized = code
    .replace(/\/\*[\s\S]*?\*\//g, '') // הסר הערות מרובות שורות
    .replace(/\/\/.*/g, '') // הסר הערות שורה בודדת
    .replace(/`[^`]*`/g, '""') // החלף template literals במחרוזת גנרית
    .replace(/'[^']*'/g, '""') // החלף מחרוזות במחרוזת גנרית
    .replace(/"[^"]*"/g, '""') // החלף מחרוזות במחרוזת גנרית
    .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, 'V') // החלף שמות משתנים ב-V
    .replace(/\s+/g, '') // הסר כל רווח
    .trim();
  
  return normalized;
}

/**
 * מחשב דמיון בין שני קטעי קוד (באחוזים)
 */
function calculateSimilarity(code1, code2) {
  if (code1 === code2) return 100;
  
  const len1 = code1.length;
  const len2 = code2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 100;
  
  // השתמש ב-Levenshtein distance פשוט
  const distance = levenshteinDistance(code1, code2);
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
  return similarity;
}

/**
 * מחשב Levenshtein distance בין שני מחרוזות
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * מוצא את כל קבצי ה-JS בתיקייה באופן רקורסיבי
 */
function findJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // דלג על node_modules ו-.git
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build') {
        findJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * בודק כפילויות בפונקציות
 */
function findDuplicates(directory, similarityThreshold = 80) {
  const jsFiles = findJsFiles(directory);
  const allFunctions = [];

  console.log(`\n🔍 Scanning ${jsFiles.length} JavaScript files...\n`);

  // חלץ פונקציות מכל הקבצים
  jsFiles.forEach(file => {
    try {
      const code = fs.readFileSync(file, 'utf8');
      const functions = extractFunctions(code, file);
      allFunctions.push(...functions);
    } catch (error) {
      console.error(`❌ Error reading file ${file}:`, error.message);
    }
  });

  console.log(`📊 Found ${allFunctions.length} functions total\n`);

  const duplicates = [];
  const checked = new Set();

  // השווה כל פונקציה עם כל הפונקציות האחרות
  for (let i = 0; i < allFunctions.length; i++) {
    for (let j = i + 1; j < allFunctions.length; j++) {
      const func1 = allFunctions[i];
      const func2 = allFunctions[j];
      
      // דלג אם זו אותה פונקציה (אותו קובץ ואותו שם)
      if (func1.filePath === func2.filePath && func1.name === func2.name) {
        continue;
      }
      
      const key = [func1.filePath, func1.name, func2.filePath, func2.name].sort().join('|');
      
      if (checked.has(key)) continue;
      checked.add(key);

      const similarity = calculateSimilarity(func1.body, func2.body);

      if (similarity >= similarityThreshold) {
        duplicates.push({
          func1,
          func2,
          similarity: similarity.toFixed(2)
        });
      }
    }
  }

  return duplicates;
}

/**
 * מציג את התוצאות
 */
function displayResults(duplicates) {
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

const duplicates = findDuplicates(directory, threshold);
displayResults(duplicates);
