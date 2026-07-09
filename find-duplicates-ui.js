#!/usr/bin/env node

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findDuplicates, findJsFiles } from "./find-duplicates-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = 2712;

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
                          <div class="file-path clickable" onclick="openFile('${escapeJsString(dup.func1.filePath)}', ${parseInt(dup.func1.line) || 1})">📁 ${escapeHtml(dup.func1.filePath)}:${parseInt(dup.func1.line) || 1}</div>
                          <div class="function-name clickable" onclick="openFile('${escapeJsString(dup.func1.filePath)}', ${parseInt(dup.func1.line) || 1})">${escapeHtml(dup.func1.name)}()</div>
                          <div class="code-preview">${escapeHtml(
                            dup.func1.originalBody.substring(0, 200)
                          )}${dup.func1.originalBody.length > 200 ? "..." : ""}</div>
                      </div>
                      <div class="function-info">
                          <h4>Function 2</h4>
                          <div class="file-path clickable" onclick="openFile('${escapeJsString(dup.func2.filePath)}', ${parseInt(dup.func2.line) || 1})">📁 ${escapeHtml(dup.func2.filePath)}:${parseInt(dup.func2.line) || 1}</div>
                          <div class="function-name clickable" onclick="openFile('${escapeJsString(dup.func2.filePath)}', ${parseInt(dup.func2.line) || 1})">${escapeHtml(dup.func2.name)}()</div>
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

/**
 * Escapes a string for safe use in JavaScript code within HTML attributes
 * @param {string} str - The string to escape
 * @returns {string} JavaScript-safe string
 * @description Prevents XSS by properly escaping quotes, backslashes, and control characters
 */
function escapeJsString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/'/g, "\\'")      // Escape single quotes
    .replace(/"/g, '\\"')     // Escape double quotes
    .replace(/\n/g, '\\n')     // Escape newlines
    .replace(/\r/g, '\\r')     // Escape carriage returns
    .replace(/\t/g, '\\t')     // Escape tabs
    .replace(/</g, '\\x3C')    // Escape < to prevent script injection
    .replace(/>/g, '\\x3E');   // Escape > to prevent script injection
}

/**
 * Creates the HTTP server that serves the duplicate report and handles
 * "open file in editor" requests.
 * @param {string} directory - Directory being analyzed (also used as the
 *   security boundary for the /open-file path traversal check)
 * @param {number} threshold - Similarity threshold
 * @returns {http.Server}
 */
function createServer(directory, threshold) {
  return http.createServer((req, res) => {
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
      const lineParam = params.get("line") || "1";
      
      if (!filePath) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing file path");
        return;
      }
      
      // Security: Validate line number is actually a number
      const line = parseInt(lineParam, 10);
      if (isNaN(line) || line < 1) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid line number");
        return;
      }
      
      // Security: Convert to absolute path and prevent path traversal
      const absolutePath = path.resolve(filePath);
      
      // Security: Ensure the resolved path is within the analyzed directory
      // This prevents path traversal attacks like ../../../../etc/passwd
      const normalizedBasePath = path.resolve(directory);
      if (!absolutePath.startsWith(normalizedBasePath)) {
        console.error(`❌ Path traversal attempt blocked: ${filePath}`);
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: Access denied");
        return;
      }
      
      console.log(`📂 Attempting to open: ${absolutePath}`);
      
      // Security: Verify the file exists
      if (!fs.existsSync(absolutePath)) {
        console.error(`❌ File not found: ${absolutePath}`);
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("File not found");
        return;
      }
      
      // Security: Check if it's actually a file (not a directory)
      try {
        const stats = fs.statSync(absolutePath);
        if (!stats.isFile()) {
          console.error(`❌ Path is not a file: ${absolutePath}`);
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Path is not a file");
          return;
        }
      } catch (error) {
        console.error(`❌ Error checking file: ${error.message}`);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
        return;
      }
      
      // Security: Use array syntax to prevent command injection
      console.log(`📂 Opening: ${absolutePath}:${line}`);
      
      // Use spawn instead of exec for better security (prevents command injection)
      import('child_process').then(({ spawn, exec }) => {
        // Try using spawn first (more secure)
        const child = spawn('code', ['--goto', `${absolutePath}:${line}`], {
          detached: true,
          stdio: 'ignore',
          shell: false
        });
        
        child.unref();
        
        child.on('error', (spawnError) => {
          // Fallback to exec if spawn fails (e.g., code not in PATH on Windows)
          console.log("Trying alternative method to open VSCode...");
          const command = process.platform === 'win32' 
            ? `code --goto "${absolutePath}:${line}"` 
            : `code --goto '${absolutePath}:${line}'`;
          
          exec(command, (execError) => {
            if (execError) {
              console.error("❌ Error opening file:", execError.message);
              console.log("💡 Make sure VSCode is installed and 'code' command is available in PATH");
            } else {
              console.log("✅ File opened successfully");
            }
          });
        });
        
        // If no error, spawn succeeded
        setTimeout(() => console.log("✅ File opened successfully"), 100);
      }).catch(error => {
        console.error("❌ Error loading child_process:", error);
      });
      
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("File opened in VSCode");
    } catch (error) {
      console.error("❌ Error opening file:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal server error");
    }
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
  });
}

/**
 * Starts the duplicate finder web UI server and opens it in the default browser.
 * @param {string} directory - Directory to analyze
 * @param {number} [threshold=70] - Similarity threshold
 * @param {number} [port=DEFAULT_PORT] - Port to listen on
 * @returns {http.Server}
 */
function startServer(directory, threshold = 70, port = DEFAULT_PORT) {
  console.log("\n🚀 Starting Duplicate Finder Server...\n");
  console.log(`📂 Directory: ${directory}`);
  console.log(`📏 Threshold: ${threshold}%`);

  const server = createServer(directory, threshold);

  server.listen(port, () => {
    console.log(`\n✨ Server running at http://localhost:${port}`);
    console.log(`\n💡 Open your browser and visit: http://localhost:${port}`);
    console.log(`\n⏹️  Press Ctrl+C to stop the server\n`);

    // Try to open browser automatically
    const url = `http://localhost:${port}`;

    import('child_process').then(({ exec }) => {
      let command;
      switch (process.platform) {
        case "win32":
          command = `start ${url}`;
          break;
        case "darwin":
          command = `open ${url}`;
          break;
        default:
          command = `xdg-open ${url}`;
      }

      exec(command, (error) => {
        if (error) {
          console.log("Note: Could not open browser automatically. Please open manually.");
        }
      });
    });
  });

  return server;
}

export { generateHTML, escapeHtml, escapeJsString, createServer, startServer };

// Run as CLI only when this file is executed directly (not when imported)
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const args = process.argv.slice(2);
  const directory = args[0] || process.cwd();
  const threshold = parseInt(args[1]) || 70;
  startServer(directory, threshold);
}
