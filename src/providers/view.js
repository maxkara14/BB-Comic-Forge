import { uniqueStrings } from '../core/strings.js';
import { escapeHtml, option } from '../ui/html.js';
import { filterDraftModelNames, filterModelNamesForProvider, getKnownModelsForProvider } from './models.js';

export function buildModelOptionsHtml(settings) {
    return getModelSuggestions(settings).map(model => `<option value="${escapeHtml(model)}"></option>`).join('');
}

export function getModelSuggestions(settings) {
    const stored = filterModelNamesForProvider(Array.isArray(settings.availableModels) ? settings.availableModels : [], settings.apiType);
    const suggestions = stored.length ? stored : getKnownModelsForProvider(settings.apiType);
    return uniqueStrings([settings.model, ...suggestions]).slice(0, 120);
}

export function buildDraftModelOptionsHtml(settings) {
    return getDraftModelSuggestions(settings).map(model => `<option value="${escapeHtml(model)}"></option>`).join('');
}

export function buildDraftConnectionProfileOptionsHtml(settings, selected = settings.activeDraftConnectionProfileId) {
    const current = option('', selected, 'Текущие настройки');
    const saved = settings.draftConnectionProfiles.map(profile => option(profile.id, selected, profile.label)).join('');
    return `${current}${saved}`;
}

export function buildImageConnectionProfileOptionsHtml(settings, selected = settings.activeImageConnectionProfileId) {
    const current = option('', selected, 'Текущие настройки');
    const saved = settings.imageConnectionProfiles.map(profile => option(profile.id, selected, profile.label)).join('');
    return `${current}${saved}`;
}

export function getActiveDraftConnectionProfile(settings) {
    return settings.draftConnectionProfiles.find(profile => profile.id === settings.activeDraftConnectionProfileId) || null;
}

export function getActiveImageConnectionProfile(settings) {
    return settings.imageConnectionProfiles.find(profile => profile.id === settings.activeImageConnectionProfileId) || null;
}

export function getDraftModelSuggestions(settings) {
    return filterDraftModelNames(Array.isArray(settings.availableDraftModels) ? settings.availableDraftModels : [], settings.draftConnectionMode);
}

export function getDraftModelPlaceholder(mode) {
    if (mode === 'gemini') return 'Имя модели Gemini-compatible';
    if (mode === 'openai-chat') return 'Имя модели OpenAI-compatible';
    return 'используется модель SillyTavern';
}

export function getEndpointPlaceholder(apiType) {
    if (apiType === 'gemini') return 'https://generativelanguage.googleapis.com';
    if (apiType === 'openai-chat' || apiType === 'openai-images') return 'https://api.openai.com/v1';
    if (apiType === 'naistera') return 'https://naistera.org';
    return 'https://api.example.com';
}

export function getDraftEndpointPlaceholder(mode) {
    if (mode === 'gemini') return 'https://generativelanguage.googleapis.com';
    if (mode === 'openai-chat') return 'https://api.openai.com/v1';
    return 'не требуется';
}

export function getProviderNote(apiType) {
    if (apiType === 'gemini') return 'Gemini хорошо подходит для референсов и образов. Gemini-compatible endpoint можно указывать базой, например /compatible.';
    if (apiType === 'openai-images') return 'OpenAI Images: без референсов используется /images/generations. С включёнными референсами Comic Forge пробует /images/edits; если источник его не поддерживает, запрос повторяется без файлов — только с текстовыми описаниями референсов. Endpoint можно указывать как /v1 или просто базовый URL.';
    if (apiType === 'openai-chat') return 'OpenAI chat: режим для прокси, которые умеют возвращать изображения и читать референсы. OpenAI-compatible endpoint можно указывать базовым URL.';
    if (apiType === 'naistera') return 'Naistera использует отдельные поля model и preset ниже.';
    return '';
}
