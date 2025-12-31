#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findDuplicates, findJsFiles } from './find-duplicates-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * Starts the web UI server
 * @param {string} directory - Directory to analyze
 * @param {number} threshold - Similarity threshold
 */
async function startUIServer(directory, threshold) {
  const { exec: open } = await import('child_process');
  const http = await import('http');
  
  const PORT = 2712;
  
  /**
   * Generates the HTML page for the web UI
   */
  function generateHTML(duplicates, stats) {
    const templatePath = path.join(__dirname, "ui-template.html");
    const cssPath = path.join(__dirname, "ui-styles.css");
    
    let template = fs.readFileSync(templatePath, "utf-8");
    const css = fs.readFileSync(cssPath, "utf-8");
    
    // Inject CSS inline
    template = template.replace('<link rel="stylesheet" href="ui-styles.css">', `<style>${css}</style>`);
    
    // Replace stats placeholders
    template = template
      .replace("{{filesScanned}}", stats.filesScanned)
      .replace("{{functionsFound}}", stats.functionsFound)
      .replace("{{duplicatesFound}}", stats.duplicatesFound)
      .replace("{{threshold}}", stats.threshold);
    
    // Generate results HTML
    const resultsHTML = duplicates.length === 0
      ? `
        <div class="no-duplicates">
            <div class="icon">✅</div>
            <h2>Great! No Duplicates Found</h2>
            <p>Your code is clean and well-organized.</p>
        </div>
      `
      : duplicates
          .map(
            (dup, index) => `
            <div class="duplicate-card">
                <div class="duplicate-header">
                    <h3>📋 Match #${index + 1}</h3>
                    <div class="similarity-badge">${dup.similarity}% Similar</div>
                </div>
                <div class="duplicate-body">
                    <div class="function-comparison">
                        <div class="function-info">
                            <h4>Function 1</h4>
                            <div class="file-path">📁 ${dup.func1.filePath}</div>
                            <div class="function-name">${dup.func1.name}()</div>
                            <div class="code-preview">${escapeHtml(
                              dup.func1.originalBody.substring(0, 200)
                            )}${dup.func1.originalBody.length > 200 ? "..." : ""}</div>
                        </div>
                        <div class="function-info">
                            <h4>Function 2</h4>
                            <div class="file-path">📁 ${dup.func2.filePath}</div>
                            <div class="function-name">${dup.func2.name}()</div>
                            <div class="code-preview">${escapeHtml(
                              dup.func2.originalBody.substring(0, 200)
                            )}${dup.func2.originalBody.length > 200 ? "..." : ""}</div>
                        </div>
                    </div>
                </div>
            </div>
          `
          )
          .join("");
    
    // Inject results
    template = template.replace('<div id="results">', `<div id="results">${resultsHTML}`);
    
    return template;
  }
  
  /**
   * Escapes HTML special characters to prevent XSS attacks
   */
  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  
  console.log("\n🚀 Starting Duplicate Finder Server...\n");
  console.log(`📂 Directory: ${directory}`);
  console.log(`📏 Threshold: ${threshold}%`);

  const server = http.createServer((req, res) => {
    if (req.url === "/") {
      try {
        console.log("\n🔍 Analyzing JavaScript files...");

        const jsFiles = findJsFiles(directory);
        const duplicates = findDuplicates(directory, threshold);

        const stats = {
          filesScanned: jsFiles.length,
          functionsFound: duplicates.totalFunctions || 0,
          duplicatesFound: duplicates.duplicates.length,
          threshold: threshold,
        };

        const html = generateHTML(duplicates.duplicates, stats);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);

        console.log("✅ Analysis complete!");
      } catch (error) {
        console.error("❌ Error:", error);
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<h1>Error</h1><pre>${error.message}</pre>`);
      }
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  server.listen(PORT, () => {
    console.log(`\n✨ Server running at http://localhost:${PORT}`);
    console.log(`\n💡 Open your browser and visit: http://localhost:${PORT}`);
    console.log(`\n⏹️  Press Ctrl+C to stop the server\n`);

    // Try to open browser automatically
    const url = `http://localhost:${PORT}`;

    switch (process.platform) {
      case "win32":
        open(`start ${url}`);
        break;
      case "darwin":
        open(`open ${url}`);
        break;
      default:
        open(`xdg-open ${url}`);
    }
  });
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
  startUIServer(directory, threshold);
} else {
  console.log(`\n🚀 Searching for duplicate code in: ${directory}`);
  console.log(`📏 Similarity threshold: ${threshold}%`);

  const jsFiles = findJsFiles(directory);
  console.log(`\n🔍 Scanning ${jsFiles.length} JavaScript files...\n`);

  const result = findDuplicates(directory, threshold);
  console.log(`📊 Found ${result.totalFunctions} functions total\n`);

  displayResults(result);
}

// Export functions for programmatic use
export { findDuplicates, findJsFiles, extractFunctions, normalizeCode, calculateSimilarity } from './find-duplicates-core.js';
