import { esc } from './util.js';
import { icon } from './icons.js';

// 解析 unified diff 为带行号的 HTML
export function renderDiff(text) {
  if (!text || !text.trim()) {
    return '<div class="empty"><div class="empty-icon">∅</div><div class="empty-title">无差异内容</div></div>';
  }
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let html = '<div class="diff-table">';
  let oldLn = 0, newLn = 0;
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const m = line.match(/ b\/(.+)$/);
      html += `<div class="diff-file-header">${icon('file', 13)} ${esc(m ? m[1] : line)}</div>`;
      inHunk = false;
      continue;
    }
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (m) { oldLn = +m[1]; newLn = +m[2]; }
      html += `<div class="diff-line hunk"><span class="ln"></span><span class="ln"></span><span class="code">${esc(line)}</span></div>`;
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      if (line.trim()) html += `<div class="diff-line meta"><span class="ln"></span><span class="ln"></span><span class="code">${esc(line)}</span></div>`;
      continue;
    }
    if (line.startsWith('+')) {
      html += `<div class="diff-line add"><span class="ln"></span><span class="ln">${newLn++}</span><span class="code">${esc(line)}</span></div>`;
    } else if (line.startsWith('-')) {
      html += `<div class="diff-line del"><span class="ln">${oldLn++}</span><span class="ln"></span><span class="code">${esc(line)}</span></div>`;
    } else if (line.startsWith('\\')) {
      html += `<div class="diff-line meta"><span class="ln"></span><span class="ln"></span><span class="code">${esc(line)}</span></div>`;
    } else {
      html += `<div class="diff-line"><span class="ln">${oldLn++}</span><span class="ln">${newLn++}</span><span class="code">${esc(line)}</span></div>`;
    }
  }
  html += '</div>';
  return html;
}