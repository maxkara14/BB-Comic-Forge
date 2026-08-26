import { escapeHtml } from '../ui/html.js';

export function makeShareHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('[data-bbcf-instruction]').forEach(node => {
        if (!node.classList.contains('bbcf-panel-error')) node.removeAttribute('data-bbcf-instruction');
    });
    doc.querySelectorAll('.bbcf-export-notice').forEach(node => node.remove());
    doc.querySelectorAll('.bbcf-panel-action').forEach(node => node.remove());
    doc.querySelectorAll('.bbcf-comic-action').forEach(node => node.remove());
    doc.querySelectorAll('.bbcf-comic-title span').forEach(span => {
        const text = span.textContent?.trim() || '';
        if (/^(?:single image|\d+\s+panels?)$/i.test(text)) span.remove();
    });
    return doc.body.innerHTML.trim();
}

export function extractImagePathsFromHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return Array.from(doc.querySelectorAll('img'))
        .map(img => img.getAttribute('src') || '')
        .filter(Boolean);
}

export function getCommonImageFolder(paths) {
    if (!paths?.length) return '';
    const first = String(paths[0] || '');
    const slash = first.lastIndexOf('/');
    if (slash === -1) return '';
    const folder = first.slice(0, slash);
    return paths.every(path => String(path || '').startsWith(`${folder}/`)) ? folder : '';
}

export function buildStandaloneComicDocument(record) {
    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(record.title || 'Comic page')}</title>
</head>
<body>
${record.html || ''}
</body>
</html>`;
}

export function safeFilename(value) {
    return String(value || 'comic')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80) || 'comic';
}
