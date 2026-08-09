#!/usr/bin/env node

import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn, exec } from "child_process";
import { pathToFileURL } from "url";
import { findDuplicates, collectSourceFiles } from "../core/find-duplicates-core.js";
import {
  parseDirectoryArgs,
  parsePortFlag,
  parseExcludeFlag,
  parseMinLengthFlag,
  parseConfigFlag,
  loadConfig,
  excludeSetFromConfig
} from "../core/find-duplicates-cli-args.js";
import { generateHTML, escapeHtml, escapeJsString } from "./find-duplicates-report.js";

const DEFAULT_PORT = 2712;

// Loopback only, never the 0.0.0.0/:: default. This server renders local
// source code and exposes an endpoint that launches an editor, so listening
// on every interface would hand both to anyone sharing the network - a
// coffee-shop or office LAN is enough. 127.0.0.1 rather than "localhost" so
// the bound address can't come back as ::1 while the browser tries IPv4.
const LISTEN_HOST = "127.0.0.1";

// default-src 'none' plus connect-src 'self' means that even if something
// did get injected into the report, it has nowhere to send what it reads:
// no remote script, image, or fetch target is reachable. Inline script and
// style are still allowed because the page ships both inline by design.
const CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'";

/**
 * Reports whether a resolved path is really inside a base directory.
 * @param {string} basePath - Absolute, already-resolved base directory
 * @param {string} targetPath - Absolute, already-resolved candidate path
 * @returns {boolean}
 * @description Uses path.relative instead of a string prefix test. With
 * `targetPath.startsWith(basePath)`, a scan of /work/proj also accepts
 * /work/proj-secrets/keys.js, because the sibling directory shares the
 * prefix - the check has to be about path segments, not characters.
 */
function isInsideDirectory(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Compares two strings without leaking their contents through timing.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqualString(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Opens a file in VSCode at a given line.
 * @param {string} absolutePath - Absolute path, already validated as living
 *   inside the scanned directory
 * @param {number} line - Validated 1-based line number
 * @description The path originates in the scanned tree, so it is
 * attacker-controlled whenever this tool is pointed at untrusted code.
 * spawn() with shell:false passes it as one argv entry, so nothing inside it
 * is ever interpreted. The Windows retry exists because VSCode installs
 * `code` as a .cmd shim, which Node will not launch without a shell; quoting
 * is sound there specifically because a double quote cannot occur in a
 * Windows path, so cmd.exe has nothing left to parse (&, |, ^ are literal
 * inside quotes) - and we bail out if one somehow appears anyway. There is
 * deliberately no POSIX retry: `code` is a real executable there, so a failed
 * spawn means it is not on PATH and a shell would fail identically, while a
 * POSIX filename may legally contain the quotes that make a shell command
 * line unsafe to build.
 */
function openInEditor(absolutePath, line) {
  const target = `${absolutePath}:${line}`;
  const child = spawn("code", ["--goto", target], {
    detached: true,
    stdio: "ignore",
    shell: false
  });
  child.unref();

  child.on("error", () => {
    if (process.platform !== "win32" || absolutePath.includes('"')) {
      console.error("❌ Could not open the file: the 'code' command was not found.");
      console.log("💡 Make sure VSCode is installed and 'code' is available in PATH");
      return;
    }

    console.log("Trying alternative method to open VSCode...");
    try {
      const retry = spawn(`code --goto "${target}"`, {
        shell: true,
        detached: true,
        stdio: "ignore"
      });
      retry.unref();
      retry.on("error", (error) => {
        console.error("❌ Error opening file:", error.message);
        console.log("💡 Make sure VSCode is installed and 'code' is available in PATH");
      });
    } catch (error) {
      console.error("❌ Error opening file:", error.message);
    }
  });
}

/**
 * Creates the HTTP server that serves the duplicate report and handles
 * "open file in editor" requests.
 * @param {string} directory - Directory being analyzed (also used as the
 *   security boundary for the /open-file path traversal check)
 * @param {number} threshold - Similarity threshold
 * @param {{excludeDirs?: Set<string>, minLength?: number}} [scanOptions] -
 *   Optional scan filters (see findDuplicates)
 * @returns {http.Server} The server, with the per-instance `openFileToken`
 *   attached so callers (and tests) can build an authorized /open-file URL
 */
function createServer(directory, threshold, scanOptions = {}) {
  // Fresh per server instance. The report page is the only place this is
  // published, and a cross-origin caller cannot read that page's body, so
  // possessing the token is what distinguishes "the user clicked a card"
  // from "some other tab issued a request".
  const openFileToken = crypto.randomBytes(32).toString("hex");

  const server = http.createServer((req, res) => {
  if (req.url === "/") {
    try {
      console.log("\n🔍 Analyzing JavaScript files...");

      const jsFiles = collectSourceFiles(directory, scanOptions);
      // Reuse the file list we already walked instead of having
      // findDuplicates() walk the directory tree a second time.
      const duplicates = findDuplicates(directory, threshold, jsFiles, scanOptions);

      const stats = {
        filesScanned: jsFiles.length,
        functionsFound: duplicates.totalFunctions || 0,
        duplicatesFound: duplicates.duplicates.length,
        threshold: threshold,
      };

      const html = generateHTML(duplicates.duplicates, stats, openFileToken);

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(html);

      console.log("✅ Analysis complete!");
    } catch (error) {
      console.error("❌ Error:", error);
      res.writeHead(500, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
        "X-Content-Type-Options": "nosniff",
      });
      // Escaped: an error message routinely carries a path from the scanned
      // tree, which is exactly the untrusted input the report escapes too.
      res.end(`<h1>Error</h1><pre>${escapeHtml(error.message)}</pre>`);
    }
  } else if (req.url.startsWith("/open-file?")) {
    // Handle file opening requests
    try {
      const params = new URLSearchParams(req.url.split("?")[1]);

      // CSRF: this endpoint has a side effect (it launches an editor) and is
      // reachable with a plain GET, so any page the user happens to have
      // open could otherwise trigger it with an <img> tag. Sec-Fetch-Site is
      // sent by current browsers and absent for non-browser clients, so it
      // turns away the drive-by case cheaply; the token below is the check
      // that actually authorizes the request.
      const fetchSite = req.headers["sec-fetch-site"];
      if (fetchSite !== undefined && fetchSite !== "same-origin" && fetchSite !== "none") {
        console.error(`❌ Blocked cross-site /open-file request (Sec-Fetch-Site: ${fetchSite})`);
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: cross-site request");
        return;
      }

      if (!timingSafeEqualString(params.get("token") || "", openFileToken)) {
        console.error("❌ Blocked /open-file request with a missing or invalid token");
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: invalid token");
        return;
      }

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
      const normalizedBasePath = path.resolve(directory);

      // Security: Ensure the resolved path is within the analyzed directory.
      // This runs before touching the disk, so ../../../../etc/passwd is
      // rejected without revealing whether it exists.
      if (!isInsideDirectory(normalizedBasePath, absolutePath)) {
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

      // Security: Re-check the boundary against the *real* path. The check
      // above is lexical, so on its own a symlink planted in the scanned
      // tree and pointing at ~/.ssh/id_rsa would sail through it.
      let realPath;
      try {
        realPath = fs.realpathSync(absolutePath);
      } catch (error) {
        console.error(`❌ Error resolving file: ${error.message}`);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
        return;
      }

      if (!isInsideDirectory(fs.realpathSync(normalizedBasePath), realPath)) {
        console.error(`❌ Symlink escape blocked: ${filePath} -> ${realPath}`);
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: Access denied");
        return;
      }

      // Security: Check if it's actually a file (not a directory)
      try {
        const stats = fs.statSync(realPath);
        if (!stats.isFile()) {
          console.error(`❌ Path is not a file: ${realPath}`);
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

      console.log(`📂 Opening: ${realPath}:${line}`);
      openInEditor(realPath, line);

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

  server.openFileToken = openFileToken;
  return server;
}

/**
 * Starts the duplicate finder web UI server and opens it in the default browser.
 * @param {string} directory - Directory to analyze
 * @param {number} [threshold=70] - Similarity threshold
 * @param {number} [port=DEFAULT_PORT] - Port to listen on
 * @param {{excludeDirs?: Set<string>, minLength?: number}} [scanOptions] -
 *   Optional scan filters (see findDuplicates)
 * @returns {http.Server}
 */
function startServer(directory, threshold = 70, port = DEFAULT_PORT, scanOptions = {}) {
  console.log("\n🚀 Starting Duplicate Finder Server...\n");
  console.log(`📂 Directory: ${directory}`);
  console.log(`📏 Threshold: ${threshold}%`);

  const server = createServer(directory, threshold, scanOptions);

  // Without this handler a busy port crashes with an unhandled 'error'
  // event and a raw stack trace.
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`\n❌ Error: Port ${port} is already in use. Pass --port <number> to use a different one.`);
    } else {
      console.error(`\n❌ Server error: ${error.message}`);
    }
    process.exit(1);
  });

  server.listen(port, LISTEN_HOST, () => {
    const url = `http://${LISTEN_HOST}:${port}`;
    console.log(`\n✨ Server running at ${url}`);
    console.log(`\n💡 Open your browser and visit: ${url}`);
    console.log(`\n⏹️  Press Ctrl+C to stop the server\n`);

    // Safe to build as a shell string: the port is a validated integer and
    // the host is a constant, so there is no caller-supplied text in here.
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

  return server;
}

export { generateHTML, escapeHtml, escapeJsString, createServer, startServer };

// Run as CLI only when this file is executed directly (not when imported)
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: find-duplicate-ui [directory] [threshold] [options]

Starts a local web UI (http://${LISTEN_HOST}:${DEFAULT_PORT}) showing duplicate functions.
The server listens on the loopback interface only.

Arguments:
  directory         Directory to scan (default: current working directory)
  threshold         Similarity percentage between 1 and 100 (default: 70)

Options:
  --port <number>        Port to listen on (default: ${DEFAULT_PORT})
  --exclude <names>      Comma-separated extra directory names to skip
  --gitignore            Also skip files and directories ignored by .gitignore
  --min-length <chars>   Ignore functions with a normalized body shorter than this
  --config <file>        Read defaults from a JSON config file
                         (default: .findduplicaterc.json, if present)
  -h, --help             Show this help message and exit
`);
    process.exit(0);
  }

  const { config: configPath, args: argsWithoutConfig } = parseConfigFlag(args);
  const config = loadConfig(configPath);
  const useGitignore = argsWithoutConfig.includes('--gitignore') || config.gitignore === true;

  const { port: portFlag, args: argsWithoutPort } = parsePortFlag(argsWithoutConfig);
  const { excludeDirs: excludeFlag, args: argsWithoutExclude } = parseExcludeFlag(argsWithoutPort);
  const { minLength: minLengthFlag, args: argsWithoutMinLength } = parseMinLengthFlag(argsWithoutExclude);
  const positionalArgs = argsWithoutMinLength.filter(arg => arg !== '--gitignore');

  // Flags win over the config file, exactly as in the main CLI.
  const port = portFlag !== undefined ? portFlag : config.port;
  const excludeDirs = excludeFlag !== undefined ? excludeFlag : excludeSetFromConfig(config.exclude);
  const minLength = minLengthFlag !== undefined ? minLengthFlag : config.minLength;

  if (positionalArgs[0] === undefined && config.directory !== undefined) {
    positionalArgs[0] = String(config.directory);
  }
  if (positionalArgs[1] === undefined && config.threshold !== undefined) {
    positionalArgs[1] = String(config.threshold);
  }

  const { directory, threshold } = parseDirectoryArgs(positionalArgs);
  startServer(directory, threshold, port, { excludeDirs, minLength, gitignore: useGitignore });
}
