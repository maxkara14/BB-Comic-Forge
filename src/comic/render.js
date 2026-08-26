import { makeId } from '../core/id.js';
import { getBuiltinLayoutId } from '../presets/resolvers.js';
import { encodeJsonAttr, escapeHtml } from '../ui/html.js';

export function buildComicHtml(draft, panels) {
    const pageId = makeId('bbcf-page');
    const safeLayout = getBuiltinLayoutId(draft.layout) || 'webtoon';
    const panelHtml = panels.map(panel => buildPanelHtml(panel, safeLayout)).join('\n');
    return `<comics>
<div class="bbcf-comics-artifact" style="${comicArtifactStyle()}">
<div class="bbcf-comic-page bbcf-layout-${safeLayout}" data-bbcf-page="${escapeHtml(pageId)}" style="${comicPageStyle()}">
  <div class="bbcf-comic-title" style="${comicTitleStyle()}"><strong>${escapeHtml(draft.title || 'Comic page')}</strong></div>
  <div class="bbcf-page-grid" style="${comicGridStyle(safeLayout)}">
${panelHtml}
  </div>
</div>
</div>
</comics>`;
}

export function buildSingleComicHtml(draft, panel) {
    const pageId = makeId('bbcf-page');
    const html = buildPanelHtml({ ...panel, number: 1, title: draft.title || panel.title || 'Comic page' }, 'single');
    return `<comics>
<div class="bbcf-comics-artifact" style="${comicArtifactStyle()}">
<div class="bbcf-comic-page bbcf-layout-single" data-bbcf-page="${escapeHtml(pageId)}" style="${comicPageStyle()}">
  <div class="bbcf-comic-title" style="${comicTitleStyle()}"><strong>${escapeHtml(draft.title || 'Comic page')}</strong></div>
  <div class="bbcf-page-grid" style="${comicGridStyle('single')}">
${html}
  </div>
</div>
</div>
</comics>`;
}

export function buildPanelHtml(panel, layout = 'webtoon') {
    const instruction = encodeJsonAttr({
        prompt: panel.prompt,
        stylePrompt: panel.stylePrompt,
        negativePrompt: panel.negativePrompt,
        aspectRatio: panel.aspectRatio,
        imageSize: panel.imageSize,
        title: panel.title,
        panelNumber: panel.number,
        singlePage: Boolean(panel.singlePage),
    });
    if (panel.error || !panel.imagePath) {
        return `    <figure class="bbcf-panel bbcf-panel-error" data-bbcf-panel="${panel.number}" data-bbcf-instruction="${instruction}" style="${panelStyle(layout, panel.number)}; min-height:180px; display:grid; place-items:center; border-style:dashed;">
      <div class="bbcf-panel-error-body" style="display:grid; gap:10px; justify-items:center; max-width:92%; padding:16px; color:#f4d6d6; text-align:center;">
        <b>Panel ${panel.number}</b>
        <span style="color:#f0a8a8; font-size:0.84rem; line-height:1.35; overflow-wrap:anywhere;">${escapeHtml(panel.error || 'Панель не сгенерировалась.')}</span>
        <button type="button" class="menu_button bbcf-panel-retry" data-bbcf-regen="1"><i class="fa-solid fa-rotate"></i><span>Повторить</span></button>
      </div>
    </figure>`;
    }
    const bubbles = panel.bubbles.map((bubble, index) => `
      <div class="bbcf-bubble ${escapeHtml(bubble.type)}" data-pos="${escapeHtml(bubble.position)}" style="${bubbleStyle(bubble, index)}">${escapeHtml(bubble.text)}</div>`).join('');
    const sfx = panel.sfx ? `\n      <div class="bbcf-sfx" style="${sfxStyle()}">${escapeHtml(panel.sfx)}</div>` : '';
    return `    <figure class="bbcf-panel" data-bbcf-panel="${panel.number}" style="${panelStyle(layout, panel.number)}">
      <img src="${escapeHtml(panel.imagePath)}" alt="${escapeHtml(panel.title)} panel ${panel.number}" loading="lazy" style="${panelImageStyle()}">
      ${bubbles}${sfx}
    </figure>`;
}

function comicArtifactStyle() {
    return 'display:block; width:100%; max-width:100%; min-width:0; box-sizing:border-box;';
}

function comicPageStyle() {
    return [
        'display:block',
        'width:100%',
        'max-width:760px',
        'margin:28px auto',
        'padding:clamp(10px, 2.4vw, 18px)',
        'border:1px solid rgba(24,18,12,0.22)',
        'border-radius:8px',
        'background:#f1eadc',
        'box-shadow:0 18px 42px rgba(0,0,0,0.32)',
        'box-sizing:border-box',
        'overflow:visible',
    ].join('; ');
}

function comicTitleStyle() {
    return [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'gap:12px',
        'margin:0 0 12px',
        'color:#17120c',
        'font-size:1rem',
        'letter-spacing:0',
        'text-align:center',
        'box-sizing:border-box',
    ].join('; ');
}

function comicGridStyle(layout) {
    const columns = {
        single: '1fr',
        webtoon: '1fr',
        grid: 'repeat(2, minmax(0, 1fr))',
        cinematic: 'repeat(6, minmax(0, 1fr))',
        manga: 'repeat(5, minmax(0, 1fr))',
        dramatic: 'repeat(12, minmax(0, 1fr))',
    }[layout] || '1fr';
    return `display:grid; grid-template-columns:${columns}; gap:8px; align-items:start; width:100%; max-width:100%; min-width:0; box-sizing:border-box;`;
}

export function panelStyle(layout, number = 1) {
    const extra = getPanelPlacementStyle(layout, number);
    return [
        'position:relative',
        'display:block',
        'width:100%',
        'min-width:0',
        'min-height:0',
        'max-width:100%',
        'height:auto',
        'aspect-ratio:auto',
        'grid-row:auto',
        'align-self:start',
        'justify-self:stretch',
        'margin:0',
        'overflow:hidden',
        'border:3px solid #15120d',
        'border-radius:4px',
        'background:#fffaf0',
        'isolation:isolate',
        'box-sizing:border-box',
        ...extra,
    ].join('; ');
}

function getPanelPlacementStyle(layout, number = 1) {
    const extra = [];
    const columns = getLayoutColumnCount(layout);
    const span = getPanelColumnSpan(layout, number);
    if (span && columns > 1) {
        extra.push(span >= columns ? 'grid-column:1 / -1' : `grid-column:span ${span}`);
    } else if (layout === 'cinematic') {
        extra.push(number === 1 || number === 4 ? 'grid-column:1 / -1' : 'grid-column:span 3');
    } else if (layout === 'manga') {
        if (number === 1) extra.push('grid-column:span 3');
        else if (number === 4) extra.push('grid-column:1 / -1');
        else extra.push('grid-column:span 2');
    } else if (layout === 'dramatic') {
        extra.push(number === 1 ? 'grid-column:1 / -1' : 'grid-column:span 6');
    }
    return extra;
}

export function getPanelLayoutFromElement(figure) {
    const page = figure?.closest?.('.bbcf-comic-page');
    const layoutClass = Array.from(page?.classList || []).find(item => item.startsWith('bbcf-layout-'));
    return layoutClass ? layoutClass.replace('bbcf-layout-', '') : 'webtoon';
}

function getLayoutColumnCount(layout) {
    return {
        grid: 2,
        cinematic: 6,
        manga: 5,
        dramatic: 12,
    }[layout] || 1;
}

function getPanelColumnSpan(layout, number = 1) {
    if (layout === 'grid') return 1;
    if (layout === 'cinematic') return number === 1 || number === 4 ? 6 : 3;
    if (layout === 'manga') {
        if (number === 1) return 3;
        if (number === 4) return 5;
        return 2;
    }
    if (layout === 'dramatic') return number === 1 ? 12 : 6;
    return 0;
}

export function panelImageStyle() {
    return 'display:block !important; width:100% !important; height:auto !important; max-width:none !important; max-height:none !important; min-width:100% !important; min-height:0; margin:0 !important; padding:0 !important; border:0; object-fit:contain !important; object-position:center !important; box-sizing:border-box;';
}

function bubbleStyle(bubble, index) {
    const position = {
        'top-left': 'top:8%; left:5%;',
        'top-right': 'top:8%; right:5%;',
        'bottom-left': 'bottom:9%; left:5%;',
        'bottom-right': 'right:5%; bottom:9%;',
    }[bubble.position] || 'top:8%; left:5%;';
    const type = String(bubble.type || 'speech');
    const typeStyle = type === 'thought'
        ? 'border-radius:34px; border-style:dashed;'
        : type === 'shout'
            ? 'border-radius:8px 20px 8px 20px; background:#fff5b8; transform:rotate(-1deg);'
            : type === 'whisper'
                ? 'background:rgba(235,246,255,0.9); color:#243140; font-weight:600;'
                : '';
    return [
        'position:absolute',
        'z-index:3',
        'max-width:min(76%, 310px)',
        'padding:8px 11px',
        'border:2px solid #0b0d12',
        'border-radius:18px',
        'background:rgba(255,255,255,0.94)',
        'color:#111318',
        'box-shadow:0 5px 0 rgba(0,0,0,0.18)',
        'font:700 0.92rem/1.18 system-ui, sans-serif',
        'letter-spacing:0',
        'box-sizing:border-box',
        position,
        typeStyle,
        bubbleOffsetStyle(index),
    ].filter(Boolean).join('; ');
}

function sfxStyle() {
    return [
        'position:absolute',
        'z-index:2',
        'right:7%',
        'bottom:8%',
        'color:#fff',
        'text-shadow:3px 3px 0 #0b0d12, -2px 2px 0 #ff4f8c',
        'transform:rotate(-8deg)',
        'font:900 2rem/1 system-ui, sans-serif',
        'letter-spacing:0',
    ].join('; ');
}

function bubbleOffsetStyle(index) {
    if (index === 0) return '';
    const shift = Math.min(18, index * 7);
    return `transform: translateY(${shift}px);`;
}

