import { uniqueStrings } from '../core/strings.js';

export function getKnownModelsForProvider(apiType) {
    if (apiType === 'openai-images') return ['gpt-image-1', 'dall-e-3', 'dall-e-2'];
    if (apiType === 'openai-chat') return ['gpt-image-1', 'grok-2-image', 'gemini-2.5-flash-image-preview', 'nano banana'];
    if (apiType === 'gemini') return ['gemini-2.5-flash-image-preview', 'gemini-2.0-flash-preview-image-generation'];
    if (apiType === 'naistera') return ['nano banana', 'grok', 'grok-pro', 'novelai'];
    return [];
}

export function extractModelNames(payload, apiType) {
    const names = [];
    const visit = value => {
        if (!value) return;
        if (typeof value === 'string') {
            if (/^[a-z0-9][a-z0-9._:/+-]{1,80}$/i.test(value)) names.push(value.replace(/^models\//, ''));
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value === 'object') {
            const candidate = value.id || value.name || value.model;
            if (candidate) {
                names.push(String(candidate).replace(/^models\//, ''));
                return;
            }
            Object.values(value).forEach(visit);
        }
    };
    visit(payload?.data || payload?.models || payload);
    return filterModelNamesForProvider(names, apiType);
}

export function filterModelNamesForProvider(names, apiType) {
    const all = uniqueStrings(names);
    if (apiType === 'openai-images') {
        const imageModels = all.filter(model => /gpt-image|dall|image|imagen|flux|sdxl|stable|midjourney/i.test(model));
        return imageModels.length ? imageModels : getKnownModelsForProvider(apiType);
    }
    if (apiType === 'openai-chat') {
        const chatImageModels = all.filter(model => /image|imagen|vision|banana|gemini|grok|flux/i.test(model));
        return chatImageModels.length ? chatImageModels : getKnownModelsForProvider(apiType);
    }
    if (apiType === 'gemini') {
        const geminiModels = all.filter(model => /image|imagen|gemini|banana|flash/i.test(model));
        return geminiModels.length ? geminiModels : getKnownModelsForProvider(apiType);
    }
    return all.length ? all : getKnownModelsForProvider(apiType);
}

export function filterDraftModelNames(names, mode) {
    const all = uniqueStrings(names);
    if (mode === 'gemini') {
        const geminiModels = all.filter(model => /gemini|flash|pro/i.test(model));
        return geminiModels.length ? geminiModels : all;
    }
    if (mode === 'openai-chat') {
        const textModels = all.filter(model => !/embedding|audio|tts|whisper|moderation|image|dall/i.test(model));
        return textModels.length ? textModels : all;
    }
    return [];
}
