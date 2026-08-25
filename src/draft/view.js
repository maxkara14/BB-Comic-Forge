import { option } from '../ui/html.js';

export function buildDraftPromptPresetOptionsHtml(settings, selected = settings.activeDraftPromptPresetId) {
    const current = option('', selected, 'Текущий черновик');
    const saved = settings.draftPromptPresets.map(preset => option(preset.id, selected, preset.label)).join('');
    return `${current}${saved}`;
}

export function getActiveDraftPromptPreset(settings) {
    return settings.draftPromptPresets.find(preset => preset.id === settings.activeDraftPromptPresetId) || null;
}
