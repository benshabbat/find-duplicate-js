import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { groupDuplicates } from "../core/find-duplicates-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Renders one member function of a duplicate group as a clickable card.
 * @param {{name: string, filePath: string, line: number}} func - Extracted function
 * @returns {string} HTML fragment
 * @description The file path is carried in a data-* attribute and read back
 * as text by the page's click handler, never interpolated into an inline
 * onclick. A path is attacker-controlled input whenever the tool is pointed
 * at untrusted code, and building `onclick="openFile('...')"` out of one is
 * not safely escapable: the HTML parser unquotes the attribute before the JS
 * parser ever sees it, so a file named `a" onmouseover="..." x=".js` closes
 * the attribute and the rest becomes a real event handler.
 */
function renderGroupMember(func) {
  const line = parseInt(func.line) || 1;
  const filePath = escapeHtml(func.filePath);
  return `
                      <div class="function-info" data-path="${filePath}" data-line="${line}">
                          <div class="file-path clickable">📁 ${filePath}:${line}</div>
                          <div class="function-name clickable">${escapeHtml(func.name)}()</div>
                      </div>`;
}

/**
 * Generates the HTML page for the web UI
 * @param {Array} duplicates - Array of duplicate function pairs
 * @param {{filesScanned: number, functionsFound: number, duplicatesFound: number, threshold: number}} stats - Analysis statistics
 * @param {string} [openFileToken=''] - Per-server secret the page must echo
 *   back on /open-file calls. Only a page this server actually handed out
 *   knows it, which is what stops an unrelated site the user has open from
 *   driving the endpoint (see the CSRF note in find-duplicates-ui.js).
 * @returns {string} Complete HTML document as a string
 * @description Creates a responsive, interactive web interface with a
 * statistics dashboard. Pairs are clustered into groups of mutually similar
 * functions (via groupDuplicates), so N near-identical functions render as
 * one card listing N members instead of N*(N-1)/2 pair cards. Each card is
 * labeled 'exact copies' or 'structural' (same shape after identifier/string
 * normalization, not a byte-for-byte copy).
 */
function generateHTML(duplicates, stats, openFileToken = '') {
  const templatePath = path.join(__dirname, "ui-template.html");
  const cssPath = path.join(__dirname, "ui-styles.css");

  let template = fs.readFileSync(templatePath, "utf-8");
  const css = fs.readFileSync(cssPath, "utf-8");

  const groups = groupDuplicates(duplicates);

  // Inject CSS inline
  template = template.replace('<link rel="stylesheet" href="ui-styles.css">', `<style>${css}</style>`);

  // Replace stats placeholders
  template = template
    .replace("{{openFileToken}}", escapeJsString(openFileToken))
    .replace("{{filesScanned}}", stats.filesScanned)
    .replace("{{functionsFound}}", stats.functionsFound)
    .replace("{{groupsFound}}", groups.length)
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
    : groups
        .map((group, index) => {
          const range = group.minSimilarity === group.maxSimilarity
            ? `${group.maxSimilarity.toFixed(2)}%`
            : `${group.minSimilarity.toFixed(2)}&ndash;${group.maxSimilarity.toFixed(2)}%`;
          const label = group.matchType === 'exact' ? 'exact copies' : 'structural';
          const preview = group.functions[0].originalBody;
          return `
          <div class="duplicate-card">
              <div class="duplicate-header">
                  <h3>📦 Group #${index + 1} &mdash; ${group.functions.length} functions</h3>
                  <div class="similarity-badge">${range} Similar &middot; ${label}</div>
              </div>
              <div class="duplicate-body">
                  <div class="function-comparison">${group.functions.map(renderGroupMember).join("")}
                  </div>
                  <div class="code-preview">${escapeHtml(preview.substring(0, 200))}${preview.length > 200 ? "..." : ""}</div>
              </div>
          </div>
        `;
        })
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
 * Escapes a string for safe use inside a JavaScript string literal, including
 * when that literal sits inside an HTML attribute.
 * @param {string} str - The string to escape
 * @returns {string} JavaScript-safe string
 * @description Quotes, angle brackets and ampersands become \xNN hex escapes
 * rather than backslash escapes. That matters because of parser ordering: in
 * `onclick="f('...')"` the HTML parser unquotes the attribute *before* the JS
 * parser runs, so a backslash-escaped `\"` still contains a literal `"` that
 * ends the attribute, and an `&quot;` entity is decoded back into one. A hex
 * escape carries no character that either parser treats as special. The
 * ampersand rule is what closes the entity-decoding route, so it must stay.
 */
function escapeJsString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/&/g, '\\x26')    // Escape & so HTML entities can't smuggle a quote back in
    .replace(/'/g, '\\x27')    // Escape single quotes
    .replace(/"/g, '\\x22')    // Escape double quotes
    .replace(/\n/g, '\\n')     // Escape newlines
    .replace(/\r/g, '\\r')     // Escape carriage returns
    .replace(/\t/g, '\\t')     // Escape tabs
    .replace(/</g, '\\x3C')    // Escape < to prevent script injection
    .replace(/>/g, '\\x3E');   // Escape > to prevent script injection
}

export { generateHTML, escapeHtml, escapeJsString };
