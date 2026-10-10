import { MAX_PANELS } from '../core/constants.js';
import { makeId } from '../core/id.js';
import { clampInt } from '../core/numbers.js';
import { normalizePortablePresetMetadata } from '../presets/portable.js';
import { DEFAULT_DRAFT_PROMPT, DEFAULT_SETTINGS, DRAFT_CAST_DIALOGUE_RULES } from '../settings/defaults.js';

export function migrateDraftPrompt(value) {
    const insertExample = '"inserts": []';
    const newInsertRules = [
        '- Add 0 to 2 overlay inserts when requested by the scene or draft instructions.',
        '- Use each insert type and expression according to the draft; chibi inserts do not require comedy.',
        '- Detail inserts are optional and should depict only requested scene content.',
        '- Place inserts only where they improve readability and do not overcrowd the panel.',
    ].join('\n');
    const rawPrompt = String(value || '');
    const isLegacyDefaultPrompt = rawPrompt.includes('Create a concise comic page draft from the roleplay context.')
        && rawPrompt.includes('"scene": "page-level visual scene summary for image generation"')
        && rawPrompt.includes('"panel_notes": ["panel 1 visual beat", "panel 2 visual beat"]');
    let prompt = isLegacyDefaultPrompt ? DEFAULT_DRAFT_PROMPT : String(value || DEFAULT_DRAFT_PROMPT);
    prompt = prompt.replace(
        '- Bubble text must be in Russian, 4 to 8 words per bubble.',
        '- Bubble text must be in Russian, usually 4 to 12 words per bubble; allow up to 16 only for plot-critical clarity.',
    );
    if (prompt.includes('<rules>') && prompt.includes('"bubbles"') && !prompt.includes('- Every speech or thought bubble must include a "speaker" field')) {
        prompt = prompt.replace('</rules>', `${DRAFT_CAST_DIALOGUE_RULES}\n</rules>`);
    }
    if (prompt.includes('"bubbles"') && !/"speaker"\s*:/.test(prompt)) {
        const bubbleSectionIndex = prompt.indexOf('"bubbles"');
        const prefix = prompt.slice(0, bubbleSectionIndex);
        const bubbleSection = prompt.slice(bubbleSectionIndex).replace(
            /("position"\s*:\s*"[^"]+"\s*,)\s*("text"\s*:)/,
            '$1 "speaker": "Character name", $2',
        );
        prompt = `${prefix}${bubbleSection}`;
    }
    if (prompt.includes('"fanservice_panel"')) {
        prompt = prompt.replace(
            '- Do not write explicit sexual content. Fanservice, if useful, must stay tasteful and non-explicit.',
            `${newInsertRules}\n- Do not write explicit sexual content.`,
        );
        prompt = prompt.replace(/"fanservice_panel"\s*:\s*0/g, insertExample);
    }
    if (prompt.includes('{{recent_chat}}') && prompt.includes('{{character_lock}}') && !prompt.includes('{{user_persona}}')) {
        prompt = prompt.replace(
            'Existing character lock:\n{{character_lock}}',
            'Existing character lock:\n{{character_lock}}\n\nUser persona:\n{{user_persona}}\n\nCurrent character card:\n{{character_context}}',
        );
    }
    return prompt;
}

export function normalizeDraftPromptPresets(rawPresets) {
    const presets = Array.isArray(rawPresets) ? rawPresets : [];
    return presets
        .filter(preset => preset && typeof preset === 'object')
        .map(preset => ({
            id: String(preset.id || makeId('draft-prompt')),
            label: String(preset.label || preset.name || 'Мой набор черновика').trim(),
            ...normalizePortablePresetMetadata(preset),
            draftPrompt: migrateDraftPrompt(preset.draftPrompt ?? preset.prompt ?? ''),
            generationMode: ['panels', 'single'].includes(preset.generationMode) ? preset.generationMode : DEFAULT_SETTINGS.generationMode,
            insertMode: ['new', 'append_last'].includes(preset.insertMode) ? preset.insertMode : DEFAULT_SETTINGS.insertMode,
            panelCount: clampInt(preset.panelCount, 1, MAX_PANELS, DEFAULT_SETTINGS.panelCount),
            layout: String(preset.layout || DEFAULT_SETTINGS.layout),
            stylePreset: String(preset.stylePreset || DEFAULT_SETTINGS.stylePreset),
            characterLock: String(preset.characterLock || ''),
            panelNotes: String(preset.panelNotes || ''),
            bubbles: String(preset.bubbles || ''),
            inserts: String(preset.inserts || ''),
            sfx: String(preset.sfx || ''),
            customPrompt: String(preset.customPrompt ?? preset.customStyle ?? ''),
            negativePrompt: String(preset.negativePrompt ?? ''),
        }))
        .filter(preset => preset.id && preset.label)
        .slice(0, 40);
}
