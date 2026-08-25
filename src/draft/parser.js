import { stripHtmlForError, uniqueStrings } from '../core/strings.js';

export function extractJsonObject(raw) {
    const text = String(raw || '').trim();
    const candidates = uniqueStrings([
        text,
        ...extractCodeFenceBodies(text),
        findBalancedJsonObject(text),
        repairTruncatedJsonObject(text),
        text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
    ].filter(Boolean));
    for (const candidate of candidates) {
        for (const jsonText of [candidate, loosenDraftJson(candidate)]) {
            try {
                const parsed = JSON.parse(jsonText);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            } catch (error) {
                // Try the next candidate; models often wrap valid JSON in extra prose.
            }
        }
    }
    const sample = stripHtmlForError(text).slice(0, 220);
    throw new Error(`Модель не вернула пригодный JSON для черновика. Первые символы ответа: ${sample || 'пусто'}`);
}

function extractCodeFenceBodies(text) {
    const bodies = [];
    const regex = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text))) bodies.push(match[1].trim());
    return bodies;
}

function findBalancedJsonObject(text) {
    const source = String(text || '');
    const start = source.indexOf('{');
    if (start === -1) return '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    return '';
}

function repairTruncatedJsonObject(text) {
    const source = String(text || '');
    const start = source.indexOf('{');
    if (start === -1) return '';
    let out = '';
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        out += char;
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            stack.push('}');
        } else if (char === '[') {
            stack.push(']');
        } else if (char === '}' || char === ']') {
            const expected = stack[stack.length - 1];
            if (char === expected) stack.pop();
            if (!stack.length) return out;
        }
    }
    if (!out || !stack.length) return '';
    if (inString) out += '"';
    out = out.replace(/,\s*$/, '');
    while (stack.length) out += stack.pop();
    return out;
}

function loosenDraftJson(text) {
    return String(text || '')
        .trim()
        .replace(/^\uFEFF/, '')
        .replace(/^```(?:json|JSON)?\s*/, '')
        .replace(/\s*```$/, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, '$1');
}
