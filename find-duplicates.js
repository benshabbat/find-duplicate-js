#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * מחלץ פונקציות מקוד JavaScript
 */
function extractFunctions(code, filePath) {
  const functions = [];
  
  // תבניות regex לזיהוי פונקציות
  const patterns = [
    // function declaration: function name() {}
    /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{([^}]*)}/g,
    // arrow function: const name = () => {}
    /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*{([^}]*)}/g,
    // method: name() {}
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{([^}]*)}/g
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1];
      const body = match[2] || '';
      
      // נקה את הקוד מרווחים מיותרים ושורות ריקות
      const normalizedBody = normalizeCode(body);
      
      // בדוק את כל הפונקציות ללא קשר לגודל
      functions.push({
        name,
        body: normalizedBody,
        originalBody: body,
        filePath,
        fullMatch: match[0]
      });
    }
  });

  return functions;
}

/**
 * מנרמל קוד להשוואה - מסיר רווחים, הערות וכו'
 */
function normalizeCode(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // הסר הערות מרובות שורות
    .replace(/\/\/.*/g, '') // הסר הערות שורה בודדת
    .replace(/\s+/g, ' ') // החלף כל רווח ב-רווח בודד
    .replace(/\s*([{}();,=+\-*/<>!&|])\s*/g, '$1') // הסר רווחים סביב אופרטורים
    .trim();
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

  console.log(`\n🔍 סורק ${jsFiles.length} קבצי JavaScript...\n`);

  // חלץ פונקציות מכל הקבצים
  jsFiles.forEach(file => {
    try {
      const code = fs.readFileSync(file, 'utf8');
      const functions = extractFunctions(code, file);
      allFunctions.push(...functions);
    } catch (error) {
      console.error(`❌ שגיאה בקריאת קובץ ${file}:`, error.message);
    }
  });

  console.log(`📊 נמצאו ${allFunctions.length} פונקציות\n`);

  const duplicates = [];
  const checked = new Set();

  // השווה כל פונקציה עם כל הפונקציות האחרות
  for (let i = 0; i < allFunctions.length; i++) {
    for (let j = i + 1; j < allFunctions.length; j++) {
      const func1 = allFunctions[i];
      const func2 = allFunctions[j];
      
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
    console.log('✅ לא נמצאו פונקציות כפולות!\n');
    return;
  }

  console.log(`\n⚠️  נמצאו ${duplicates.length} זוגות פונקציות דומות:\n`);
  console.log('='.repeat(80));

  duplicates.forEach((dup, index) => {
    console.log(`\n${index + 1}. דמיון: ${dup.similarity}%`);
    console.log(`   📁 ${path.relative(process.cwd(), dup.func1.filePath)}`);
    console.log(`   🔹 ${dup.func1.name}()`);
    console.log(`   📁 ${path.relative(process.cwd(), dup.func2.filePath)}`);
    console.log(`   🔹 ${dup.func2.name}()`);
    console.log('-'.repeat(80));
  });

  console.log(`\n💡 סה"כ נמצאו ${duplicates.length} זוגות פונקציות דומות\n`);
}

// הרץ את הסקריפט
const args = process.argv.slice(2);
const directory = args[0] || process.cwd();
const threshold = parseInt(args[1]) || 80;

if (!fs.existsSync(directory)) {
  console.error(`❌ התיקייה ${directory} לא קיימת`);
  process.exit(1);
}

console.log(`\n🚀 מחפש קוד כפול בתיקייה: ${directory}`);
console.log(`📏 סף דמיון: ${threshold}%\n`);

const duplicates = findDuplicates(directory, threshold);
displayResults(duplicates);
