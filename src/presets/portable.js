// Portable presets contain visual/generation behavior only; connections and scene data never cross installations.
import { MAX_PANELS, VALID_ASPECT_RATIOS } from '../core/constants.js';
import { clampInt } from '../core/numbers.js';
import { DEFAULT_DRAFT_PROMPT, DEFAULT_NEGATIVE_PROMPT, DEFAULT_SETTINGS } from '../settings/defaults.js';

export const PORTABLE_PRESET_FORMAT = 'bb-comic-forge-preset';
export const PORTABLE_PRESET_VERSION = 1;

export function createPortablePreset({ metadata = {}, recipe = {}, style = {}, layout = {}, recommendations = {} } = {}) {
    return normalizePortablePreset({
        format: PORTABLE_PRESET_FORMAT,
        version: PORTABLE_PRESET_VERSION,
        metadata: {
            name: metadata.name,
            description: metadata.description,
            author: metadata.author,
            tags: metadata.tags,
            exportedAt: new Date().toISOString(),
        },
        recipe,
        style,
        layout,
        recommendations,
    });
}

export function normalizePortablePreset(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Файл не содержит пресет Comic Forge.');
    }
    if (raw.format !== PORTABLE_PRESET_FORMAT) {
        throw new Error('Неизвестный формат пресета.');
    }
    if (Number(raw.version) !== PORTABLE_PRESET_VERSION) {
        throw new Error(`Версия пресета ${raw.version ?? 'не указана'} не поддерживается.`);
    }

    const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
    const recipe = raw.recipe && typeof raw.recipe === 'object' ? raw.recipe : {};
    const style = raw.style && typeof raw.style === 'object' ? raw.style : {};
    const layout = raw.layout && typeof raw.layout === 'object' ? raw.layout : {};
    const recommendations = raw.recommendations && typeof raw.recommendations === 'object' ? raw.recommendations : {};
    const name = cleanText(metadata.name || raw.name || 'Импортированный пресет', 120);
    const stylePrompt = cleanText(style.prompt, 20000);
    if (!stylePrompt) throw new Error('В пресете отсутствует prompt стиля.');

    const pattern = normalizePortableLayoutPattern(layout.pattern);
    if (!pattern.length) throw new Error('В пресете отсутствует корректный макет панелей.');

    return {
        format: PORTABLE_PRESET_FORMAT,
        version: PORTABLE_PRESET_VERSION,
        metadata: {
            name,
            description: cleanText(metadata.description, 1000),
            author: cleanText(metadata.author, 120),
            tags: normalizeTags(metadata.tags),
            exportedAt: normalizeIsoDate(metadata.exportedAt),
        },
        recipe: {
            generationMode: recipe.generationMode === 'single' ? 'single' : 'panels',
            insertMode: recipe.insertMode === 'append_last' ? 'append_last' : 'new',
            panelCount: clampInt(recipe.panelCount, 1, MAX_PANELS, DEFAULT_SETTINGS.panelCount),
            draftPrompt: cleanText(recipe.draftPrompt || DEFAULT_DRAFT_PROMPT, 50000),
            customPrompt: cleanText(recipe.customPrompt, 20000),
            negativePrompt: cleanText(recipe.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT, 20000),
        },
        style: {
            name: cleanText(style.name || style.label || name, 120),
            prompt: stylePrompt,
        },
        layout: {
            name: cleanText(layout.name || layout.label || 'Импортированный макет', 120),
            pattern,
            intent: cleanText(layout.intent, 1000),
            singleAspect: VALID_ASPECT_RATIOS.includes(layout.singleAspect) ? layout.singleAspect : '3:4',
        },
        recommendations: {
            apiType: cleanText(recommendations.apiType, 80),
            model: cleanText(recommendations.model, 160),
            size: cleanText(recommendations.size, 80),
            quality: cleanText(recommendations.quality, 80),
        },
    };
}

function normalizePortableLayoutPattern(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,;|]+/);
    const pattern = raw.map(item => String(item || '').trim()).filter(item => VALID_ASPECT_RATIOS.includes(item));
    return pattern.slice(0, MAX_PANELS);
}

export function getPortablePresetFilename(preset) {
    const name = String(preset?.metadata?.name || 'comic-forge-preset')
        .normalize('NFKC')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
    return `${name || 'comic-forge-preset'}.bbcf-preset.json`;
}

export function normalizePortablePresetMetadata(raw = {}) {
    return {
        kind: raw.kind === 'comic' ? 'comic' : 'snapshot',
        description: cleanText(raw.description, 1000),
        author: cleanText(raw.author, 120),
        tags: normalizeTags(raw.tags),
        recommendations: {
            apiType: cleanText(raw.recommendations?.apiType, 80),
            model: cleanText(raw.recommendations?.model, 160),
            size: cleanText(raw.recommendations?.size, 80),
            quality: cleanText(raw.recommendations?.quality, 80),
        },
        portableVersion: raw.kind === 'comic' ? PORTABLE_PRESET_VERSION : 0,
        importedAt: normalizeIsoDate(raw.importedAt),
    };
}

function normalizeTags(value) {
    const tags = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(tags.map(tag => cleanText(tag, 40).toLowerCase()).filter(Boolean))].slice(0, 8);
}

function normalizeIsoDate(value) {
    const date = new Date(String(value || ''));
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function cleanText(value, maxLength) {
    return String(value ?? '').replace(/\r/g, '').trim().slice(0, maxLength);
}
