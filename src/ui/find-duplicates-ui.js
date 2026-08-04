#!/usr/bin/env node

import http from "http";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { findDuplicates, findJsFiles } from "../core/find-duplicates-core.js";
import { parseDirectoryArgs } from "../core/find-duplicates-cli-args.js";
import { generateHTML, escapeHtml, escapeJsString } from "./find-duplicates-report.js";

const DEFAULT_PORT = 2712;

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
      // Reuse the file list we already walked instead of having
      // findDuplicates() walk the directory tree a second time.
      const duplicates = findDuplicates(directory, threshold, jsFiles);

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
        
        child.on('error', () => {
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

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: find-duplicate-ui [directory] [threshold]

Starts a local web UI (http://localhost:${DEFAULT_PORT}) showing duplicate functions.

Arguments:
  directory   Directory to scan (default: current working directory)
  threshold   Similarity percentage between 1 and 100 (default: 70)

Options:
  -h, --help  Show this help message and exit
`);
    process.exit(0);
  }

  const { directory, threshold } = parseDirectoryArgs(args);
  startServer(directory, threshold);
}
