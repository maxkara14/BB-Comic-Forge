import {
    DRAFT_CONNECTION_MODES,
    IMAGE_API_TYPES,
    OPENAI_IMAGE_QUALITIES,
    OPENAI_IMAGE_SIZES,
    VALID_ASPECT_RATIOS,
    VALID_IMAGE_SIZES,
} from '../core/constants.js';
import { makeId } from '../core/id.js';
import { DEFAULT_SETTINGS } from '../settings/defaults.js';
import { filterDraftModelNames, filterModelNamesForProvider } from './models.js';

export function normalizeDraftConnectionProfiles(rawProfiles, getTavernProfileLabel = () => '') {
    const profiles = Array.isArray(rawProfiles) ? rawProfiles : [];
    return profiles
        .filter(profile => profile && typeof profile === 'object')
        .map(profile => {
            const mode = DRAFT_CONNECTION_MODES.includes(profile.draftConnectionMode) ? profile.draftConnectionMode : DEFAULT_SETTINGS.draftConnectionMode;
            const availableDraftModels = filterDraftModelNames(Array.isArray(profile.availableDraftModels) ? profile.availableDraftModels : [], mode);
            return {
                id: String(profile.id || makeId('draft-connection')),
                label: String(profile.label || profile.name || getDraftConnectionProfileFallbackLabel(profile, mode, getTavernProfileLabel)).trim(),
                draftConnectionMode: mode,
                draftEndpoint: String(profile.draftEndpoint || ''),
                draftApiKey: String(profile.draftApiKey || ''),
                draftModel: String(profile.draftModel || ''),
                availableDraftModels,
                draftTemperature: Math.max(0, Math.min(2, Number(profile.draftTemperature ?? DEFAULT_SETTINGS.draftTemperature) || 0)),
                draftTavernProfileId: String(profile.draftTavernProfileId || profile.tavernProfileId || ''),
            };
        })
        .filter(profile => profile.id && profile.label)
        .slice(0, 40);
}

export function normalizeImageConnectionProfiles(rawProfiles) {
    const profiles = Array.isArray(rawProfiles) ? rawProfiles : [];
    return profiles
        .filter(profile => profile && typeof profile === 'object')
        .map(profile => {
            const apiType = IMAGE_API_TYPES.includes(profile.apiType) ? profile.apiType : DEFAULT_SETTINGS.apiType;
            const availableModels = filterModelNamesForProvider(Array.isArray(profile.availableModels) ? profile.availableModels : [], apiType);
            const aspectRatio = VALID_ASPECT_RATIOS.includes(profile.aspectRatio) || profile.aspectRatio === 'auto'
                ? profile.aspectRatio
                : DEFAULT_SETTINGS.aspectRatio;
            const naisteraAspectRatio = VALID_ASPECT_RATIOS.includes(profile.naisteraAspectRatio) || profile.naisteraAspectRatio === 'auto'
                ? profile.naisteraAspectRatio
                : DEFAULT_SETTINGS.naisteraAspectRatio;
            return {
                id: String(profile.id || makeId('image-connection')),
                label: String(profile.label || profile.name || getImageConnectionProfileFallbackLabel(profile, apiType)).trim(),
                apiType,
                endpoint: String(profile.endpoint || ''),
                apiKey: String(profile.apiKey || ''),
                model: String(profile.model || ''),
                availableModels,
                openaiSize: OPENAI_IMAGE_SIZES.includes(profile.openaiSize) ? profile.openaiSize : DEFAULT_SETTINGS.openaiSize,
                openaiQuality: OPENAI_IMAGE_QUALITIES.includes(profile.openaiQuality) ? profile.openaiQuality : DEFAULT_SETTINGS.openaiQuality,
                aspectRatio,
                imageSize: VALID_IMAGE_SIZES.includes(profile.imageSize) ? profile.imageSize : DEFAULT_SETTINGS.imageSize,
                naisteraModel: String(profile.naisteraModel || DEFAULT_SETTINGS.naisteraModel),
                naisteraAspectRatio,
                naisteraPreset: String(profile.naisteraPreset || DEFAULT_SETTINGS.naisteraPreset),
            };
        })
        .filter(profile => profile.id && profile.label)
        .slice(0, 40);
}

export function getImageConnectionProfileFallbackLabel(profile = {}, apiType = DEFAULT_SETTINGS.apiType) {
    const model = String(profile.model || profile.naisteraModel || '').trim();
    if (model) return model;
    return getImageApiLabel(apiType);
}

export function getImageApiLabel(apiType) {
    if (apiType === 'onlysq-imagen') return 'OnlySQ ImaGen';
    if (apiType === 'openai-images') return 'OpenAI Images';
    if (apiType === 'openai-chat') return 'OpenAI Chat Images';
    if (apiType === 'gemini') return 'Gemini';
    if (apiType === 'naistera') return 'Naistera';
    return 'Image API';
}

export function getDraftConnectionProfileFallbackLabel(
    profile = {},
    mode = DEFAULT_SETTINGS.draftConnectionMode,
    getTavernProfileLabel = () => '',
) {
    const model = String(profile.draftModel || '').trim();
    if (model) return model;
    if (mode === 'sillytavern') return getTavernProfileLabel(profile.draftTavernProfileId || profile.tavernProfileId) || 'SillyTavern';
    if (mode === 'gemini') return 'Gemini draft';
    return 'OpenAI draft';
}
