import { MAX_PANELS, VALID_ASPECT_RATIOS } from '../core/constants.js';
import { makeId } from '../core/id.js';

export function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
}

export function findProfileSeed(profiles, fallbackKeys, hasData) {
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return null;
    for (const key of fallbackKeys) {
        if (!key || !hasOwn(profiles, key)) continue;
        const value = profiles[key];
        if (hasData(value)) return { key, value };
    }
    return null;
}

export function normalizeSavedStyles(rawStyles) {
    const styles = Array.isArray(rawStyles) ? rawStyles : [];
    return styles
        .filter(style => style && typeof style === 'object')
        .map(style => ({
            id: String(style.id || makeId('style')),
            label: String(style.label || style.name || 'Мой стиль').trim(),
            prompt: getSavedStylePrompt(style),
        }))
        .filter(style => style.id && (style.label || style.prompt));
}

export function getSavedStylePrompt(style) {
    return String(
        style?.prompt
        ?? style?.customPrompt
        ?? style?.customStyle
        ?? style?.description
        ?? style?.text
        ?? style?.value
        ?? ''
    ).trim();
}

export function normalizeSavedLayouts(rawLayouts) {
    const layouts = Array.isArray(rawLayouts) ? rawLayouts : [];
    return layouts
        .filter(layout => layout && typeof layout === 'object')
        .map(layout => ({
            id: String(layout.id || makeId('layout')),
            label: String(layout.label || layout.name || 'Мой макет').trim(),
            pattern: normalizeAspectPattern(layout.pattern || layout.aspectPattern),
            intent: String(layout.intent || '').trim(),
            singleAspect: VALID_ASPECT_RATIOS.includes(layout.singleAspect) ? layout.singleAspect : '3:4',
        }))
        .filter(layout => layout.pattern.length)
        .slice(0, 40);
}

export function normalizeAspectPattern(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,;|]+/);
    const pattern = raw.map(item => String(item || '').trim()).filter(item => VALID_ASPECT_RATIOS.includes(item));
    return pattern.length ? pattern.slice(0, MAX_PANELS) : ['2:3', '1:1', '16:9', '3:4'];
}

export function normalizeSavedDraft(rawDraft) {
    return rawDraft && typeof rawDraft === 'object' && !Array.isArray(rawDraft)
        ? structuredClone(rawDraft)
        : null;
}
