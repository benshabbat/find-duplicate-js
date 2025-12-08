#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { findDuplicates, findJsFiles } = require('./find-duplicates-core.js');

const PORT = 3000;

function generateHTML(duplicates, stats) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JavaScript Duplicate Finder</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin-bottom: 30px;
            text-align: center;
        }
        
        .header h1 {
            color: #667eea;
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .header p {
            color: #666;
            font-size: 1.1em;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .stat-card .number {
            font-size: 2.5em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        
        .stat-card .label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .no-duplicates {
            background: white;
            padding: 60px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            text-align: center;
        }
        
        .no-duplicates .icon {
            font-size: 5em;
            margin-bottom: 20px;
        }
        
        .no-duplicates h2 {
            color: #4CAF50;
            font-size: 2em;
            margin-bottom: 10px;
        }
        
        .duplicate-card {
            background: white;
            border-radius: 15px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            margin-bottom: 25px;
            overflow: hidden;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .duplicate-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .duplicate-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .duplicate-header h3 {
            font-size: 1.3em;
        }
        
        .similarity-badge {
            background: rgba(255,255,255,0.2);
            padding: 8px 20px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 1.2em;
        }
        
        .duplicate-body {
            padding: 30px;
        }
        
        .function-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }
        
        .function-info {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }
        
        .function-info h4 {
            color: #667eea;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        .file-path {
            color: #666;
            font-size: 0.85em;
            margin-bottom: 8px;
            word-break: break-all;
        }
        
        .function-name {
            font-family: 'Courier New', monospace;
            background: #e3f2fd;
            padding: 5px 10px;
            border-radius: 5px;
            display: inline-block;
            margin-bottom: 15px;
            color: #1976d2;
            font-weight: bold;
        }
        
        .code-preview {
            background: #263238;
            color: #aed581;
            padding: 15px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 200px;
            overflow-y: auto;
        }
        
        @media (max-width: 768px) {
            .function-comparison {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 1.8em;
            }
        }
        
        .refresh-btn {
            background: white;
            color: #667eea;
            border: 2px solid #667eea;
            padding: 12px 30px;
            border-radius: 25px;
            font-size: 1em;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 20px;
        }
        
        .refresh-btn:hover {
            background: #667eea;
            color: white;
            transform: scale(1.05);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 JavaScript Duplicate Finder</h1>
            <p>Intelligent code duplication detection</p>
            <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Analysis</button>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="number">${stats.filesScanned}</div>
                <div class="label">Files Scanned</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.functionsFound}</div>
                <div class="label">Functions Found</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.duplicatesFound}</div>
                <div class="label">Duplicate Pairs</div>
            </div>
            <div class="stat-card">
                <div class="number">${stats.threshold}%</div>
                <div class="label">Threshold</div>
            </div>
        </div>
        
        ${duplicates.length === 0 ? `
            <div class="no-duplicates">
                <div class="icon">✅</div>
                <h2>Great! No Duplicates Found</h2>
                <p>Your code is clean and well-organized.</p>
            </div>
        ` : `
            ${duplicates.map((dup, index) => `
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
                                <div class="code-preview">${escapeHtml(dup.func1.originalBody.substring(0, 200))}${dup.func1.originalBody.length > 200 ? '...' : ''}</div>
                            </div>
                            <div class="function-info">
                                <h4>Function 2</h4>
                                <div class="file-path">📁 ${dup.func2.filePath}</div>
                                <div class="function-name">${dup.func2.name}()</div>
                                <div class="code-preview">${escapeHtml(dup.func2.originalBody.substring(0, 200))}${dup.func2.originalBody.length > 200 ? '...' : ''}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        `}
    </div>
    
    <script>
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Start server
const args = process.argv.slice(2);
const directory = args[0] || process.cwd();
const threshold = parseInt(args[1]) || 70;

console.log('\n🚀 Starting Duplicate Finder Server...\n');
console.log(`📂 Directory: ${directory}`);
console.log(`📏 Threshold: ${threshold}%`);

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    try {
      console.log('\n🔍 Analyzing JavaScript files...');
      
      const jsFiles = findJsFiles(directory);
      const duplicates = findDuplicates(directory, threshold);
      
      const stats = {
        filesScanned: jsFiles.length,
        functionsFound: duplicates.totalFunctions || 0,
        duplicatesFound: duplicates.duplicates.length,
        threshold: threshold
      };
      
      const html = generateHTML(duplicates.duplicates, stats);
      
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      
      console.log('✅ Analysis complete!');
    } catch (error) {
      console.error('❌ Error:', error);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error</h1><pre>${error.message}</pre>`);
    }
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n✨ Server running at http://localhost:${PORT}`);
  console.log(`\n💡 Open your browser and visit: http://localhost:${PORT}`);
  console.log(`\n⏹️  Press Ctrl+C to stop the server\n`);
  
  // Try to open browser automatically
  const open = require('child_process').exec;
  const url = `http://localhost:${PORT}`;
  
  switch (process.platform) {
    case 'win32':
      open(`start ${url}`);
      break;
    case 'darwin':
      open(`open ${url}`);
      break;
    default:
      open(`xdg-open ${url}`);
  }
});
