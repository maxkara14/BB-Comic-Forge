import { MAX_PANELS } from '../core/constants.js';
import { clampInt } from '../core/numbers.js';
import { BUBBLE_POSITIONS } from '../presets/builtins.js';

export function normalizePanelNote(line) {
    return String(line || '').replace(/^\s*\d+[.)-]?\s*/, '').trim();
}

export function splitLines(text) {
    return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

export function parseBubbles(text) {
    const map = new Map();
    let autoIndex = 0;
    for (const line of splitLines(text)) {
        const parts = line.split('|').map(part => part.trim());
        let panel = 1;
        let type = 'speech';
        let position = BUBBLE_POSITIONS[autoIndex % BUBBLE_POSITIONS.length];
        let speaker = '';
        let bubbleText = line;
        if (parts.length >= 5) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeBubbleType(parts[1]);
            position = normalizeBubblePosition(parts[2], position);
            speaker = parts[3];
            bubbleText = parts.slice(4).join('|').trim();
        } else if (parts.length >= 4) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeBubbleType(parts[1]);
            position = normalizeBubblePosition(parts[2], position);
            bubbleText = parts.slice(3).join('|').trim();
        } else if (parts.length === 3) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeBubbleType(parts[1]);
            bubbleText = parts[2];
        } else if (parts.length === 2) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            bubbleText = parts[1];
        }
        if (!bubbleText) continue;
        if (!map.has(panel)) map.set(panel, []);
        map.get(panel).push({ type, position, speaker, text: bubbleText });
        autoIndex++;
    }
    return map;
}

export function parseSfx(text) {
    const map = new Map();
    for (const line of splitLines(text)) {
        const parts = line.split('|').map(part => part.trim());
        if (parts.length >= 2) {
            const panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            map.set(panel, parts.slice(1).join('|'));
        }
    }
    return map;
}

export function parseInserts(text) {
    const map = new Map();
    for (const line of splitLines(text).slice(0, 2)) {
        const parts = line.split('|').map(part => part.trim());
        let panel = 1;
        let type = 'detail';
        let position = 'bottom-right';
        let insertText = line;
        if (parts.length >= 4) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeInsertType(parts[1]);
            position = normalizeInsertPosition(parts[2], position);
            insertText = parts.slice(3).join('|').trim();
        } else if (parts.length === 3) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeInsertType(parts[1]);
            insertText = parts[2];
        } else if (parts.length === 2) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            insertText = parts[1];
        }
        if (!insertText) continue;
        if (!map.has(panel)) map.set(panel, []);
        map.get(panel).push({ type, position, text: insertText });
    }
    return map;
}

export function buildPanelInsertPrompt(inserts) {
    if (!inserts?.length) return '';
    const lines = inserts.map(insert =>
        `- ${insert.type} insert at ${insert.position}: ${insert.text}`).join('\n');
    return [
        `Integrate these small manga/webtoon overlay cut-in inserts inside this panel composition:`,
        lines,
        `Each insert must be a small bordered mini-panel or sticker drawn as part of the same image, matching the panel's style, lighting, linework, and color.`,
        `Use detail inserts for close-ups of hands, lips, eyes, weapons, blood, objects, or symbols; use chibi inserts only for comic or exaggerated reactions.`,
    ].join('\n');
}

export function normalizeBubbleType(value) {
    const type = String(value || '').toLowerCase();
    return ['speech', 'thought', 'shout', 'whisper'].includes(type) ? type : 'speech';
}

export function normalizeInsertType(value) {
    const type = String(value || '').toLowerCase().trim();
    if (['chibi', 'reaction', 'sticker', 'gag', 'чиби', 'реакция', 'стикер'].includes(type)) return 'chibi';
    if (['emotion', 'face', 'eyes', 'эмоция', 'лицо', 'глаза'].includes(type)) return 'emotion';
    if (['action', 'impact', 'motion', 'акция', 'действие', 'удар'].includes(type)) return 'action';
    return 'detail';
}

export function normalizeInsertPosition(value, fallback = 'bottom-right') {
    const position = String(value || '').toLowerCase().trim().replace(/[\s_]+/g, '-');
    const aliases = {
        'сверху-слева': 'top-left',
        'слева-сверху': 'top-left',
        'сверху-справа': 'top-right',
        'справа-сверху': 'top-right',
        'снизу-слева': 'bottom-left',
        'слева-снизу': 'bottom-left',
        'снизу-справа': 'bottom-right',
        'справа-снизу': 'bottom-right',
        'центр': 'center',
        'по-центру': 'center',
    };
    if (aliases[position]) return aliases[position];
    return ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(position) ? position : fallback;
}

export function normalizeBubblePosition(value, fallback) {
    const position = String(value || '').toLowerCase();
    return BUBBLE_POSITIONS.includes(position) ? position : fallback;
}
