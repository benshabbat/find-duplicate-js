import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export { generateHTML, escapeHtml, escapeJsString };
