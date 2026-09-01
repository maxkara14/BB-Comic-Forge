import {
    DRAFT_CONNECTION_MODES,
    IMAGE_API_TYPES,
    MAX_CONCURRENCY,
    MAX_PANELS,
    MAX_PREVIOUS_CONTEXT_IMAGES,
    OPENAI_IMAGE_QUALITIES,
    OPENAI_IMAGE_SIZES,
    VALID_ASPECT_RATIOS,
    VALID_IMAGE_SIZES,
} from '../core/constants.js';
import { clampInt } from '../core/numbers.js';
import { migrateDraftPrompt, normalizeDraftPromptPresets } from '../draft/prompts.js';
import { getLayoutPresetById, getStylePresetById } from '../presets/resolvers.js';
import { filterDraftModelNames, filterModelNamesForProvider } from '../providers/models.js';
import { normalizeDraftConnectionProfiles, normalizeImageConnectionProfiles } from '../providers/profiles.js';
import { migrateLegacyWardrobe } from '../wardrobe/migrations.js';
import { normalizeWardrobeAssignments, normalizeWardrobeItems } from '../wardrobe/normalizers.js';
import { DEFAULT_NEGATIVE_PROMPT, DEFAULT_SETTINGS } from './defaults.js';
import { normalizeSavedLayouts, normalizeSavedStyles } from './normalizers.js';

export function normalizeBaseSettings(settings, getTavernProfileLabel = () => '') {
    let dirty = false;
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (settings[key] === undefined) {
            settings[key] = structuredClone(value);
            dirty = true;
        }
    }
    if (Number(settings.schemaVersion || 0) < DEFAULT_SETTINGS.schemaVersion) {
        settings.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
        dirty = true;
    }
    settings.enabled = Boolean(settings.enabled);
    settings.showFab = Boolean(settings.showFab);
    settings.autoMode = Boolean(settings.autoMode);
    settings.wardrobeEnabled = settings.wardrobeEnabled !== false;
    settings.wardrobeSendDescription = settings.wardrobeSendDescription !== false;
    settings.wardrobeSendImages = settings.wardrobeSendImages !== false;
    if (!IMAGE_API_TYPES.includes(settings.apiType)) {
        settings.apiType = DEFAULT_SETTINGS.apiType;
        dirty = true;
    }
    if (!Array.isArray(settings.availableModels)) {
        settings.availableModels = [];
        dirty = true;
    }
    settings.availableModels = filterModelNamesForProvider(settings.availableModels, settings.apiType);
    settings.imageConnectionProfiles = normalizeImageConnectionProfiles(settings.imageConnectionProfiles);
    if (!settings.imageConnectionProfiles.some(profile => profile.id === settings.activeImageConnectionProfileId)) {
        settings.activeImageConnectionProfileId = '';
    }
    settings.savedStyles = normalizeSavedStyles(settings.savedStyles);
    settings.savedLayouts = normalizeSavedLayouts(settings.savedLayouts);
    if (!getStylePresetById(settings.stylePreset, settings)) settings.stylePreset = DEFAULT_SETTINGS.stylePreset;
    if (!getLayoutPresetById(settings.layout, settings)) settings.layout = DEFAULT_SETTINGS.layout;
    if (!['panels', 'single'].includes(settings.generationMode)) settings.generationMode = DEFAULT_SETTINGS.generationMode;
    if (settings.bubbleMode !== 'model') {
        settings.bubbleMode = 'model';
        dirty = true;
    }
    if (!['new', 'append_last'].includes(settings.insertMode)) settings.insertMode = DEFAULT_SETTINGS.insertMode;
    if (settings.customPrompt === undefined && settings.customStyle !== undefined) {
        settings.customPrompt = settings.customStyle;
        dirty = true;
    }
    settings.customPrompt = String(settings.customPrompt || '');
    const migratedDraftPrompt = migrateDraftPrompt(settings.draftPrompt);
    if (migratedDraftPrompt !== settings.draftPrompt) {
        settings.draftPrompt = migratedDraftPrompt;
        dirty = true;
    }
    settings.panelCount = clampInt(settings.panelCount, 1, MAX_PANELS, DEFAULT_SETTINGS.panelCount);
    settings.concurrency = clampInt(settings.concurrency, 1, MAX_CONCURRENCY, DEFAULT_SETTINGS.concurrency);
    settings.requestCooldownMs = clampInt(settings.requestCooldownMs, 0, 600000, DEFAULT_SETTINGS.requestCooldownMs);
    settings.contextMessages = clampInt(settings.contextMessages, 0, 20, DEFAULT_SETTINGS.contextMessages);
    settings.injectChatContextToImagePrompt = settings.injectChatContextToImagePrompt === true;
    settings.previousImageCount = clampInt(settings.previousImageCount, 0, MAX_PREVIOUS_CONTEXT_IMAGES, DEFAULT_SETTINGS.previousImageCount);
    settings.timeoutMs = clampInt(settings.timeoutMs, 30000, 600000, DEFAULT_SETTINGS.timeoutMs);
    if (!DRAFT_CONNECTION_MODES.includes(settings.draftConnectionMode)) settings.draftConnectionMode = DEFAULT_SETTINGS.draftConnectionMode;
    settings.draftEndpoint = String(settings.draftEndpoint || '');
    settings.draftApiKey = String(settings.draftApiKey || '');
    settings.draftModel = String(settings.draftModel || '');
    if (!Array.isArray(settings.availableDraftModels)) settings.availableDraftModels = [];
    settings.availableDraftModels = filterDraftModelNames(settings.availableDraftModels, settings.draftConnectionMode);
    settings.draftTemperature = Math.max(0, Math.min(2, Number(settings.draftTemperature ?? DEFAULT_SETTINGS.draftTemperature) || 0));
    settings.draftTavernProfileId = String(settings.draftTavernProfileId || '');
    settings.draftConnectionProfiles = normalizeDraftConnectionProfiles(settings.draftConnectionProfiles, getTavernProfileLabel);
    if (!settings.draftConnectionProfiles.some(profile => profile.id === settings.activeDraftConnectionProfileId)) {
        settings.activeDraftConnectionProfileId = '';
    }
    settings.draftPromptPresets = normalizeDraftPromptPresets(settings.draftPromptPresets);
    if (!settings.draftPromptPresets.some(preset => preset.id === settings.activeDraftPromptPresetId)) {
        settings.activeDraftPromptPresetId = '';
    }
    if (![2, 4, 6].includes(Number(settings.presetLibraryColumns))) {
        settings.presetLibraryColumns = DEFAULT_SETTINGS.presetLibraryColumns;
        dirty = true;
    } else {
        settings.presetLibraryColumns = Number(settings.presetLibraryColumns);
    }
    if (!OPENAI_IMAGE_SIZES.includes(settings.openaiSize)) settings.openaiSize = DEFAULT_SETTINGS.openaiSize;
    if (!OPENAI_IMAGE_QUALITIES.includes(settings.openaiQuality)) settings.openaiQuality = DEFAULT_SETTINGS.openaiQuality;
    if (!VALID_IMAGE_SIZES.includes(settings.imageSize)) settings.imageSize = DEFAULT_SETTINGS.imageSize;
    if (!VALID_ASPECT_RATIOS.includes(settings.aspectRatio) && settings.aspectRatio !== 'auto') settings.aspectRatio = DEFAULT_SETTINGS.aspectRatio;
    if (!VALID_ASPECT_RATIOS.includes(settings.naisteraAspectRatio) && settings.naisteraAspectRatio !== 'auto') settings.naisteraAspectRatio = DEFAULT_SETTINGS.naisteraAspectRatio;
    settings.negativePrompt = String(settings.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT);
    settings.defaultPanelNotes = String(settings.defaultPanelNotes || '');
    settings.defaultBubbles = String(settings.defaultBubbles || '');
    settings.defaultInserts = String(settings.defaultInserts || '');
    settings.defaultSfx = String(settings.defaultSfx || '');
    if (!Array.isArray(settings.wardrobeItems)) settings.wardrobeItems = [];
    if (!settings.wardrobeAssignments || typeof settings.wardrobeAssignments !== 'object') settings.wardrobeAssignments = {};
    if (Array.isArray(settings.wardrobe) && settings.wardrobe.some(item => item?.path || item?.description || item?.name)) {
        migrateLegacyWardrobe(settings);
        dirty = true;
    }
    settings.wardrobeItems = normalizeWardrobeItems(settings.wardrobeItems);
    settings.wardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeAssignments);
    settings.wardrobe = [];
    return dirty;
}
