import { escapeHtml, option } from '../ui/html.js';
import { ASPECT_PATTERNS, STYLE_PRESETS } from './builtins.js';
import { describeLayoutIntent } from './resolvers.js';

export function buildStyleOptionsHtml(settings, selected) {
    const base = Object.entries(STYLE_PRESETS).map(([key, preset]) => option(key, selected, preset.label)).join('');
    const saved = settings.savedStyles.map(style => option(`saved:${style.id}`, selected, `★ ${style.label}`)).join('');
    return `${base}${saved}`;
}

export function buildLayoutOptionsHtml(settings, selected) {
    const base = Object.entries({
        webtoon: 'Webtoon vertical',
        grid: 'Grid',
        cinematic: 'Cinematic',
        manga: 'Manga',
        dramatic: 'Dramatic',
    }).map(([key, label]) => option(key, selected, label)).join('');
    const saved = settings.savedLayouts.map(layout => option(`saved:${layout.id}`, selected, `★ ${layout.label}`)).join('');
    return `${base}${saved}`;
}

export function buildStyleExamplesHtml(settings) {
    const builtin = Object.values(STYLE_PRESETS)
        .filter(preset => preset.prompt)
        .map(preset => ({ label: preset.label, prompt: preset.prompt, savedId: '' }));
    const saved = settings.savedStyles.map(style => ({ label: `★ ${style.label}`, prompt: style.prompt, savedId: style.id }));
    const examples = [...builtin, ...saved];
    return `<div class="bbcf-preset-example-group"><strong>Стили</strong>${examples.map(item => `
        <div class="bbcf-preset-example">
            <div class="bbcf-preset-example-top">
                <span>${escapeHtml(item.label)}</span>
                ${item.savedId ? `<button class="menu_button bbcf-icon-button bbcf-danger" type="button" title="Удалить стиль" aria-label="Удалить стиль" data-bbcf-delete-style="${escapeHtml(item.savedId)}"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            </div>
            <p>${escapeHtml(item.prompt)}</p>
        </div>
    `).join('')}</div>`;
}

export function buildLayoutExamplesHtml(settings) {
    const saved = settings.savedLayouts.map(layout => ({
        label: `★ ${layout.label}`,
        pattern: layout.pattern,
        intent: layout.intent,
        savedId: layout.id,
    }));
    const builtin = Object.keys(ASPECT_PATTERNS).map(key => ({
        label: key,
        pattern: ASPECT_PATTERNS[key],
        intent: describeLayoutIntent(key, 1, 4, settings),
        savedId: '',
    }));
    return `<div class="bbcf-preset-example-group"><strong>Макеты</strong>${[...builtin, ...saved].map(item => `
        <div class="bbcf-layout-example">
            <div class="bbcf-preset-example-top">
                <span>${escapeHtml(item.label)}</span>
                ${item.savedId ? `<button class="menu_button bbcf-icon-button bbcf-danger" type="button" title="Удалить макет" aria-label="Удалить макет" data-bbcf-delete-layout="${escapeHtml(item.savedId)}"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            </div>
            <div class="bbcf-layout-pattern">${item.pattern.slice(0, 6).map(ratio => `<b>${escapeHtml(ratio)}</b>`).join('')}</div>
            <p>${escapeHtml(item.intent || '')}</p>
        </div>
    `).join('')}</div>`;
}
