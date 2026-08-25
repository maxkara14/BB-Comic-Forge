import { ASPECT_PATTERNS, STYLE_PRESETS } from './builtins.js';

export function getStylePresetById(styleId, settings) {
    const id = String(styleId || '').trim();
    if (Object.hasOwn(STYLE_PRESETS, id)) return { id, ...STYLE_PRESETS[id], builtin: true };
    const savedId = id.startsWith('saved:') ? id.slice(6) : id;
    const saved = settings?.savedStyles?.find(style => style.id === savedId);
    return saved ? { ...saved, id: `saved:${saved.id}`, builtin: false } : null;
}

export function getLayoutPresetById(layoutId, settings) {
    const id = String(layoutId || '').trim();
    if (Object.hasOwn(ASPECT_PATTERNS, id)) {
        return {
            id,
            label: id,
            pattern: ASPECT_PATTERNS[id],
            intent: '',
            singleAspect: getBuiltinSinglePageAspectRatio(id),
            builtin: true,
        };
    }
    const savedId = id.startsWith('saved:') ? id.slice(6) : id;
    const saved = settings?.savedLayouts?.find(layout => layout.id === savedId);
    return saved ? { ...saved, id: `saved:${saved.id}`, builtin: false } : null;
}

export function getBuiltinLayoutId(layoutId) {
    const id = String(layoutId || '').trim();
    return Object.hasOwn(ASPECT_PATTERNS, id) ? id : null;
}

export function getBuiltinSinglePageAspectRatio(layout) {
    if (layout === 'cinematic') return '16:9';
    if (layout === 'grid') return '1:1';
    if (layout === 'manga') return '3:4';
    if (layout === 'dramatic') return '3:4';
    return '9:16';
}

export function describeLayoutIntent(layout, number, total, settings) {
    const preset = getLayoutPresetById(layout, settings);
    if (preset && !preset.builtin) return preset.intent || 'custom saved comic layout with the saved panel rhythm and clear reading flow';
    if (layout === 'webtoon') return 'vertical webtoon reading flow with spacious composition and clear emotional rhythm';
    if (layout === 'grid') return 'balanced comic grid panel with stable framing and readable action';
    if (layout === 'cinematic') return number === 1 || number === total ? 'wide cinematic anchor shot' : 'supporting cinematic detail shot';
    if (layout === 'manga') return 'manga page rhythm with varied panel energy, sharp eye flow, and bold insert composition';
    if (layout === 'dramatic') return 'dramatic broken-border comic feeling, strong silhouette, diagonal energy, and heightened emotion';
    return 'clean comic panel composition';
}
