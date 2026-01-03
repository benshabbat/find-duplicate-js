#!/usr/bin/env node

import { exec as open } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findDuplicates, findJsFiles } from "./find-duplicates-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 2712;

/**
 * Generates the HTML page for the web UI
 * @param {Array} duplicates - Array of duplicate function pairs
 * @param {{filesScanned: number, functionsFound: number, duplicatesFound: number, threshold: number}} stats - Analysis statistics
 * @returns {string} Complete HTML document as a string
 * @description Creates a responsive, interactive web interface with statistics dashboard and side-by-side code comparison
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
                          <div class="file-path clickable" onclick="openFile('${dup.func1.filePath.replace(/\\/g, '\\\\')}', ${dup.func1.line || 1})">📁 ${dup.func1.filePath}</div>
                          <div class="function-name clickable" onclick="openFile('${dup.func1.filePath.replace(/\\/g, '\\\\')}', ${dup.func1.line || 1})">${dup.func1.name}()</div>
                          <div class="code-preview">${escapeHtml(
                            dup.func1.originalBody.substring(0, 200)
                          )}${dup.func1.originalBody.length > 200 ? "..." : ""}</div>
                      </div>
                      <div class="function-info">
                          <h4>Function 2</h4>
                          <div class="file-path clickable" onclick="openFile('${dup.func2.filePath.replace(/\\/g, '\\\\')}', ${dup.func2.line || 1})">📁 ${dup.func2.filePath}</div>
                          <div class="function-name clickable" onclick="openFile('${dup.func2.filePath.replace(/\\/g, '\\\\')}', ${dup.func2.line || 1})">${dup.func2.name}()</div>
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
 * @param {string} text - The text to escape
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start server
const args = process.argv.slice(2);
const directory = args[0] || process.cwd();
const threshold = parseInt(args[1]) || 70;

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
  } else if (req.url.startsWith("/open-file?")) {
    // Handle file opening requests
    try {
      const params = new URLSearchParams(req.url.split("?")[1]);
      const filePath = params.get("path");
      const line = params.get("line") || "1";
      
      if (filePath) {
        // Open file in VSCode using 'code' command
        // The filePath from findDuplicates is already absolute
        const absolutePath = path.resolve(filePath);
        const command = `code --goto "${absolutePath}:${line}"`;
        
        console.log(`📂 Opening: ${absolutePath}:${line}`);
        
        open(command, (error) => {
          if (error) {
            console.error("❌ Error opening file:", error);
          } else {
            console.log("✅ File opened successfully");
          }
        });
        
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("File opened in VSCode");
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing file path");
      }
    } catch (error) {
      console.error("❌ Error opening file:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Error: ${error.message}`);
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
