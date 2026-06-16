import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(__dirname, '..', 'docs');
const outDir = path.join(__dirname, '..', 'docs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function mdToHtml(md) {
  let html = md;

  // Tables
  html = html.replace(/^\|(.+)\|\s*$/gm, (line) => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
  });
  html = html.replace(/<tr><td>[-:| ]+<\/td><\/tr>/g, '');
  html = html.replace(/((?:^|\n\n)<tr>.*?<\/tr>)((?:\n<tr>.*?<\/tr>)+)/gs, (match, header, body) => {
    const thead = header.replace('<tr>', '<thead><tr>').replace('</tr>', '</tr></thead>').replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
    const tbody = '<tbody>' + body.trim() + '</tbody>';
    return `<table>${thead}${tbody}</table>`;
  });
  html = html.replace(/(<tr>.*?<\/tr>\n?)+/gs, (match) => {
    if (match.includes('<table>')) return match;
    return `<table><tbody>${match}</tbody></table>`;
  });

  // Code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code>${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br>');

  // Headings
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Unordered lists - handle nested
  html = html.replace(/((?:^  - .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(line => `<li>${line.replace(/^  - /, '')}</li>`).join('');
    return `<ul class="nested">${items}</ul>`;
  });
  html = html.replace(/((?:^- .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(line => `<li>${line.replace(/^- /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs
  const lines = html.split('\n');
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '') {
      result.push('');
    } else if (
      line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<ol') ||
      line.startsWith('<table') || line.startsWith('<pre') || line.startsWith('<blockquote') ||
      line.startsWith('<hr') || line.startsWith('</') || line.startsWith('<tr') ||
      line.startsWith('<thead') || line.startsWith('<tbody')
    ) {
      result.push(line);
    } else {
      result.push(`<p>${line}</p>`);
    }
    i++;
  }

  return result.join('\n');
}

function buildHtml(title, body, subtitle) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #1a1a2e;
    background: #fff;
  }

  /* Cover page */
  .cover {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: 80px;
    background: linear-gradient(135deg, #0d3d45 0%, #175861 60%, #1e7a87 100%);
    color: white;
    page-break-after: always;
  }
  .cover-badge {
    font-size: 9pt;
    font-weight: 600;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.6);
    margin-bottom: 24px;
  }
  .cover h1 {
    font-size: 36pt;
    font-weight: 700;
    line-height: 1.2;
    color: white;
    border: none;
    padding: 0;
    margin: 0 0 16px 0;
  }
  .cover-subtitle {
    font-size: 14pt;
    color: rgba(255,255,255,0.75);
    margin-bottom: 60px;
    max-width: 500px;
    line-height: 1.5;
  }
  .cover-divider {
    width: 60px;
    height: 4px;
    background: rgba(255,255,255,0.4);
    border-radius: 2px;
    margin-bottom: 40px;
  }
  .cover-meta {
    font-size: 9pt;
    color: rgba(255,255,255,0.5);
    letter-spacing: 1px;
  }

  /* Page margins — ensures consistent whitespace on all four sides across every
     page. Without this Chrome headless applies its own defaults unevenly. */
  @page {
    margin: 18mm 16mm;
  }

  /* Content */
  .content {
    max-width: 740px;
    margin: 0 auto;
    padding: 12px 40px;
  }

  h1 {
    font-family: 'Courier New', Courier, monospace;
    font-size: 20pt;
    font-weight: bold;
    color: #175861;
    margin: 48px 0 16px;
    padding-bottom: 10px;
    border-bottom: 2.5px solid #175861;
    page-break-after: avoid;
  }
  h2 {
    font-family: 'Courier New', Courier, monospace;
    font-size: 14pt;
    font-weight: bold;
    color: #175861;
    margin: 40px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1.5px solid #d4eaed;
    page-break-after: avoid;
  }
  h3 {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12pt;
    font-weight: bold;
    color: #0d3d45;
    margin: 28px 0 8px;
    page-break-after: avoid;
  }
  h4 {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11pt;
    font-weight: bold;
    color: #175861;
    margin: 20px 0 6px;
    page-break-after: avoid;
  }
  h5, h6 {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10pt;
    font-weight: bold;
    color: #444;
    margin: 16px 0 4px;
  }

  p {
    margin: 8px 0;
    color: #333;
  }

  strong { color: #111; }

  a { color: #175861; text-decoration: underline; }

  ul, ol {
    margin: 8px 0 8px 24px;
    color: #333;
  }
  ul.nested {
    margin-left: 36px;
    margin-top: 4px;
  }
  li { margin: 4px 0; }

  blockquote {
    margin: 14px 0;
    padding: 12px 16px;
    border-left: 4px solid #175861;
    background: #f0f8f9;
    border-radius: 0 6px 6px 0;
    color: #1a4a52;
    font-size: 10.5pt;
  }

  code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9.5pt;
    background: #f4f6f8;
    padding: 1px 5px;
    border-radius: 3px;
    color: #0d3d45;
  }

  pre {
    background: #f4f6f8;
    border: 1px solid #e0e6e8;
    border-radius: 6px;
    padding: 14px 16px;
    margin: 12px 0;
    overflow-x: auto;
    font-family: 'Courier New', Courier, monospace;
  }
  pre code {
    background: none;
    padding: 0;
    font-size: 9pt;
    color: #1a1a2e;
    font-family: 'Courier New', Courier, monospace;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  th {
    background: #175861;
    color: white;
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
    font-size: 9.5pt;
  }
  td {
    padding: 7px 12px;
    border-bottom: 1px solid #e8eef0;
    color: #333;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8fbfc; }
  tr:hover td { background: #eef5f6; }

  hr {
    border: none;
    border-top: 1px solid #e0e8ea;
    margin: 32px 0;
  }

  @media print {
    body { font-size: 10.5pt; }
    .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr:nth-child(even) td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    blockquote { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2, h3, h4 { page-break-after: avoid; }
    table, pre, blockquote { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-badge">NauticApp · Documentación</div>
  <h1>${title}</h1>
  <div class="cover-divider"></div>
  <div class="cover-subtitle">${subtitle}</div>
  <div class="cover-meta">Versión actualizada · Junio 2026</div>
</div>

<div class="content">
${body}
</div>

</body>
</html>`;
}

function processFile(mdFile, outputName, title, subtitle) {
  console.log(`\nProcesando: ${mdFile}`);
  const md = fs.readFileSync(path.join(docsDir, mdFile), 'utf-8');
  const body = mdToHtml(md);
  const html = buildHtml(title, body, subtitle);

  const htmlPath = path.join(outDir, outputName + '.html');
  const pdfPath = path.join(outDir, outputName + '.pdf');

  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log(`  HTML generado: ${htmlPath}`);

  const chromeArgs = [
    `"${CHROME}"`,
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--run-all-compositor-stages-before-draw',
    '--disable-extensions',
    `--print-to-pdf="${pdfPath}"`,
    `--print-to-pdf-no-header`,
    '--no-pdf-header-footer',
    `"file:///${htmlPath.replace(/\\/g, '/')}"`,
  ].join(' ');

  try {
    execSync(chromeArgs, { stdio: 'pipe', timeout: 30000 });
    console.log(`  PDF generado: ${pdfPath}`);
  } catch (e) {
    console.error(`  Error al generar PDF: ${e.message}`);
  }
}

processFile(
  'manual-admin.md',
  'manual-admin',
  'Manual del Administrador',
  'Guía completa para gestionar tu club o guardería náutica desde el panel web de NauticApp.'
);

processFile(
  'manual-payway.md',
  'manual-payway',
  'Débito Automático con Payway',
  'Guía para configurar el débito automático mensual con Payway en NauticApp.'
);

console.log('\nListo.');
