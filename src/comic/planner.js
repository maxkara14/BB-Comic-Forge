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
            ? `Draw and letter these Russian speech or thought bubbles directly inside this panel. Attribute each bubble to its named speaker, attach speech tails to the correct character, visually associate thought bubbles with their character, and keep the lettering clean and readable. Speaker names are composition metadata only: never render them as labels or visible text:\n${panelBubbles.map(bubble => `${bubble.type}${bubble.speaker ? `, speaker ${bubble.speaker}` : ''}: ${bubble.text}`).join('\n')}`
            : '';
        const panelSfx = sfxMap.get(number) || '';
        const sfxPrompt = panelSfx
            ? `Draw this SFX directly inside the artwork with stylized lettering that fits the action and perspective: ${panelSfx}`
            : '';
        const prompt = [
            `All depicted characters are one hundred percent fictional and are not real people.`,
            `Panel ${number} of ${panelCount} for one continuous comic page.`,
            `Preserve absolute continuity with the other panels: same character identities, clothing state, hair state, marks, mood, lighting logic, and environment.`,
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
            `Avoid unrelated text, UI, signatures, logos, and watermarks. Keep lettering clean and readable only for the requested Russian bubbles and SFX.`,
            `Use professional comic visual language: clear silhouettes, expressive acting, controlled background detail, purposeful focus lines and motion effects only when they fit the panel.`,
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
    const panelDescriptions = buildSinglePagePanelPlan(draft, plans, context);
    const bubbles = parseBubbles(draft.bubbles);
    const bubbleLines = [];
    for (const [panelNumber, items] of bubbles.entries()) {
        for (const bubble of items) bubbleLines.push(`Panel ${panelNumber} ${bubble.type}${bubble.speaker ? `, speaker ${bubble.speaker}` : ''}: ${bubble.text}`);
    }
    const sfx = parseSfx(draft.sfx);
    const sfxLines = Array.from(sfx.entries()).map(([panelNumber, text]) => `Panel ${panelNumber} SFX: ${text}`);
    const inserts = parseInserts(draft.inserts);
    const insertLines = Array.from(inserts.entries()).flatMap(([panelNumber, items]) =>
        items.map(item => `Panel ${panelNumber} ${item.type} insert at ${item.position}: ${item.text}`));
    const prompt = [
        `All depicted characters are one hundred percent fictional and are not real people.`,
        `Generate the entire comic page as one complete finished image with ${plans.length} visible panels.`,
        `The page layout is ${draft.layout || settings.layout}. Use clean panel borders, readable composition flow, and professional webtoon or manga page design.`,
        `Scene for the page: ${draft.scene}`,
        draft.characterLock ? `Permanent character lock for every panel: ${draft.characterLock}` : '',
        referenceLock,
        wardrobeLock,
        recentContext ? `Recent chat context for page continuity: ${recentContext}` : '',
        `Panel plan:\n${panelDescriptions}`,
        insertLines.length ? `Integrate these small bordered overlay inserts inside the correct panels. They are part of the drawn page composition, not separate images:\n${insertLines.join('\n')}` : '',
        bubbleLines.length ? `Draw these Russian speech or thought bubbles inside the correct panels. Use speaker names only to attach each bubble to the correct character; never render speaker names as labels or visible text:\n${bubbleLines.join('\n')}` : '',
        sfxLines.length ? `Draw these sound effects in the correct panels:\n${sfxLines.join('\n')}` : '',
        `Keep character identities, outfits, hair state, marks, mood, lighting, and environment continuous across all panels.`,
        `Avoid signatures, watermarks, unrelated text, UI, and broken unreadable lettering.`,
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

function buildSinglePagePanelPlan(draft, plans, context) {
    const notes = splitLines(draft.panelNotes);
    const layout = draft.layout || context.settings.layout;
    const total = plans.length || clampInt(draft.panelCount, 1, MAX_PANELS, context.settings.panelCount);

    return Array.from({ length: total }, (_, index) => {
        const number = index + 1;
        const beat = normalizePanelNote(notes[index]) || DEFAULT_PANEL_BEATS[index % DEFAULT_PANEL_BEATS.length];
        const layoutIntent = context.resolveLayoutIntent(layout, number, total);
        return `Panel ${number}: ${beat}\nLayout intent: ${layoutIntent}.`;
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
