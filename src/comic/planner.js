import { MAX_PANELS } from '../core/constants.js';
import { clampInt } from '../core/numbers.js';
import { ASPECT_PATTERNS, DEFAULT_PANEL_BEATS, STYLE_PRESETS } from '../presets/builtins.js';
import { getBuiltinSinglePageAspectRatio } from '../presets/resolvers.js';
import {
    buildPanelInsertPrompt,
    normalizePanelNote,
    parseBubbles,
    parseInserts,
    parseSfx,
    splitLines,
} from './syntax.js';

const BUBBLE_ATTRIBUTION_RULES = `Reproduce the supplied wording and language without translation. Each named speaker owns the entire corresponding line. Multiple bubbles assigned to the same speaker must all remain with that speaker; do not alternate speakers or distribute dialogue among characters to balance the composition. Bubble positions guide placement, never speaker identity. For visible speakers, attach every speech tail to the named character; visually associate thought bubbles with their named thinker. Use main-panel characters rather than chibi stickers as speakers unless the draft explicitly requests otherwise. Preserve off-panel speakers without assigning their words to a visible character. Speaker names are composition metadata only: never render them as labels or visible text.`;
const BUBBLE_STAGING_RULES = `Coordinate character staging and balloon placement so every balloon connects unambiguously to its assigned speaker. Do not assign a balloon to the nearest character merely because of its corner position. Consecutive speech bubbles from one character may form a connected balloon cluster pointing to that character; preserve their order and wording. Keep speech and thought treatments distinct. Panel numbers and instruction headings are metadata, not visible lettering.`;

function buildBubbleLines(bubbles, panelNumber = null) {
    return bubbles.map((bubble, index) => {
        const previous = bubbles[index - 1];
        const owner = bubble.speaker && (previous?.speaker !== bubble.speaker || previous?.type !== bubble.type)
            ? `Dialogue owner: ${bubble.speaker} (${bubble.type}); all following lines in this group belong to this character.\n` : '';
        const next = bubbles[index + 1];
        const end = bubble.speaker && (next?.speaker !== bubble.speaker || next?.type !== bubble.type) ? '\nEnd of dialogue group.' : '';
        return `${owner}${panelNumber !== null ? `Panel ${panelNumber} ` : ''}${bubble.type} at ${bubble.position}${bubble.speaker ? `, speaker ${bubble.speaker}` : ''}: ${bubble.text}${end}`;
    }).join('\n');
}

export function createPanelPlans(draft, context) {
    const { settings, recentContext, referenceLock, wardrobeLock } = context;
    const notes = splitLines(draft.panelNotes);
    const bubbleMap = parseBubbles(draft.bubbles);
    const sfxMap = parseSfx(draft.sfx);
    const insertMap = parseInserts(draft.inserts);
    const stylePrompt = buildStylePrompt(draft.stylePreset, draft.customPrompt ?? draft.customStyle, context.resolveStylePreset);
    const layout = draft.layout || settings.layout;
    const panelCount = clampInt(draft.panelCount, 1, MAX_PANELS, settings.panelCount);
    const plans = [];
    for (let index = 0; index < panelCount; index++) {
        const number = index + 1;
        const aspectRatio = getAspectForPanel(layout, index, context.resolveLayoutPreset);
        const beat = normalizePanelNote(notes[index]) || DEFAULT_PANEL_BEATS[index % DEFAULT_PANEL_BEATS.length];
        const panelInserts = insertMap.get(number) || [];
        const insertPrompt = buildPanelInsertPrompt(panelInserts);
        const panelBubbles = bubbleMap.get(number) || [];
        const bubblePrompt = panelBubbles.length
            ? `Draw and letter these supplied speech or thought bubbles directly inside this panel. ${BUBBLE_ATTRIBUTION_RULES} ${BUBBLE_STAGING_RULES}\n${buildBubbleLines(panelBubbles)}`
            : '';
        const panelSfx = sfxMap.get(number) || '';
        const sfxPrompt = panelSfx
            ? `Draw this SFX directly inside the artwork with stylized lettering that fits the action and perspective: ${panelSfx}`
            : '';
        const prompt = [
            `All depicted characters are one hundred percent fictional and are not real people.`,
            `Panel ${number} of ${panelCount} for one continuous comic page.`,
            `Use the supplied draft for scene content, expressions, proportions, insert treatment and lettering language. Apply the selected style and layout without replacing the draft's explicit directions with generic defaults.`,
            `Preserve character identity and continuity across panels while depicting changes in clothing, expression, condition, lighting and environment explicitly requested by the draft.`,
            draft.characterLock ? `Permanent character lock: ${draft.characterLock}` : '',
            referenceLock,
            wardrobeLock,
            `Scene for the page: ${draft.scene}`,
            recentContext ? `Recent chat context for continuity: ${recentContext}` : '',
            `Panel direction: ${beat}`,
            `Layout intent: ${context.resolveLayoutIntent(layout, number, panelCount)}.`,
            insertPrompt,
            bubblePrompt,
            sfxPrompt,
            `Render the supplied bubble text and SFX exactly in their supplied languages. Do not translate them or add unrelated text, UI, signatures, logos or watermarks; include such elements only when explicitly requested by the draft.`,
            `Follow the draft for framing, acting, background detail and effects; do not add or suppress visual elements based on a generic artistic preference.`,
        ].filter(Boolean).join('\n\n');
        plans.push({
            number,
            title: draft.title || 'Comic page',
            layout,
            stylePreset: draft.stylePreset,
            stylePrompt,
            prompt,
            negativePrompt: draft.negativePrompt,
            aspectRatio,
            imageSize: settings.imageSize,
            bubbles: [],
            sfx: '',
        });
    }
    return plans;
}

export function createSinglePagePanel(draft, plans, context) {
    const { settings, recentContext, referenceLock, wardrobeLock } = context;
    const bubbles = parseBubbles(draft.bubbles);
    const sfx = parseSfx(draft.sfx);
    const inserts = parseInserts(draft.inserts);
    const panelDescriptions = buildSinglePagePanelPlan(draft, plans, context, bubbles, sfx, inserts);
    const prompt = [
        `All depicted characters are one hundred percent fictional and are not real people.`,
        `Generate the entire comic page as one complete finished image with ${plans.length} visible panels.`,
        `Use the supplied draft for scene content, expressions, proportions, insert treatment and lettering language. Apply the selected style and layout without replacing the draft's explicit directions with generic defaults.`,
        `The page layout is ${draft.layout || settings.layout}. Follow the requested layout and panel directions for borders, composition and reading flow.`,
        `Scene for the page: ${draft.scene}`,
        draft.characterLock ? `Permanent character lock for every panel: ${draft.characterLock}` : '',
        referenceLock,
        wardrobeLock,
        recentContext ? `Recent chat context for page continuity: ${recentContext}` : '',
        bubbles.size ? `Draw and letter each panel's supplied speech or thought bubbles. ${BUBBLE_ATTRIBUTION_RULES} ${BUBBLE_STAGING_RULES}` : '',
        `Panel plan with each panel's own dialogue, inserts and sound effects:\n${panelDescriptions}`,
        `Preserve character identity and continuity across panels while depicting changes in clothing, expression, condition, lighting and environment explicitly requested by the draft.`,
        `Render the supplied bubble text and SFX exactly in their supplied languages. Do not translate them or add unrelated text, UI, signatures, logos or watermarks; include such elements only when explicitly requested by the draft.`,
    ].filter(Boolean).join('\n\n');
    return {
        number: 1,
        title: draft.title || 'Comic page',
        layout: draft.layout || settings.layout,
        stylePreset: draft.stylePreset,
        stylePrompt: buildStylePrompt(draft.stylePreset, draft.customPrompt ?? draft.customStyle, context.resolveStylePreset),
        prompt,
        negativePrompt: draft.negativePrompt,
        aspectRatio: getSinglePageAspectRatio(draft.layout || settings.layout, context.resolveLayoutPreset),
        imageSize: settings.imageSize,
        bubbles: [],
        sfx: '',
        singlePage: true,
    };
}

function buildSinglePagePanelPlan(draft, plans, context, bubbles, sfx, inserts) {
    const notes = splitLines(draft.panelNotes);
    const layout = draft.layout || context.settings.layout;
    const total = plans.length || clampInt(draft.panelCount, 1, MAX_PANELS, context.settings.panelCount);

    return Array.from({ length: total }, (_, index) => {
        const number = index + 1;
        const beat = normalizePanelNote(notes[index]) || DEFAULT_PANEL_BEATS[index % DEFAULT_PANEL_BEATS.length];
        const layoutIntent = context.resolveLayoutIntent(layout, number, total);
        const items = bubbles.get(number) || [];
        const overlayLines = (inserts.get(number) || []).map(item => `Panel ${number} ${item.type} insert at ${item.position}: ${item.text}`);
        return [
            `Panel ${number}: ${beat}\nLayout intent: ${layoutIntent}.`,
            items.length ? `Dialogue for this panel only:\n${buildBubbleLines(items, number)}` : '',
            overlayLines.length ? `Integrate these supplied overlay inserts inside this panel, following their described appearance, border treatment and expression. They are part of the drawn page, not separate images:\n${overlayLines.join('\n')}` : '',
            sfx.has(number) ? `Draw this sound effect in this panel: Panel ${number} SFX: ${sfx.get(number)}` : '',
        ].filter(Boolean).join('\n');
    }).join('\n\n');
}

function getSinglePageAspectRatio(layout, resolveLayoutPreset) {
    const preset = resolveLayoutPreset(layout);
    if (preset?.singleAspect) return preset.singleAspect;
    return getBuiltinSinglePageAspectRatio(layout);
}

function buildStylePrompt(stylePreset, customPrompt, resolveStylePreset) {
    const preset = resolveStylePreset(stylePreset) || { id: 'manhwa', ...STYLE_PRESETS.manhwa };
    const custom = String(customPrompt || '').trim();
    return [preset.prompt, custom].filter(Boolean).join('\n');
}

function getAspectForPanel(layout, index, resolveLayoutPreset) {
    const preset = resolveLayoutPreset(layout);
    const pattern = preset?.pattern || ASPECT_PATTERNS.webtoon;
    return pattern[index % pattern.length] || '1:1';
}
