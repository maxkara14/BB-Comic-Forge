import {
    addOneMessage,
    eventSource,
    event_types,
    saveChat,
    updateMessageBlock,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const MODULE_NAME = 'BB-Comic-Forge';
const SETTINGS_ID = 'bbcf-settings';
const FAB_ID = 'bbcf-open-fab';
const MODAL_ID = 'bbcf-modal-root';
const MAX_PANELS = 6;
const UPLOAD_ALLOWED_FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const VALID_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const VALID_IMAGE_SIZES = ['1K', '2K', '4K'];
const ONLYSQ_IMAGEN_ENDPOINT = 'https://api.onlysq.ru/ai/imagen';
const MAX_COMIC_HISTORY = 24;
const MAX_PREVIOUS_CONTEXT_IMAGES = 3;
const MAX_CONCURRENCY = 6;
const DRAFT_CONNECTION_MODES = ['sillytavern', 'openai-chat', 'gemini'];

const STYLE_PRESETS = {
    manhwa: {
        label: 'Premium manhwa',
        prompt: 'Premium Korean manhwa and webtoon illustration, crisp expressive line art, elegant cinematic color grading, refined faces, clean anatomy, rich fabric rendering, controlled detail, dynamic panel-ready composition, professional vertical comic production quality.',
    },
    manga: {
        label: 'Black ink manga',
        prompt: 'High quality manga illustration, confident black ink linework, screentone shading, dramatic composition, expressive eyes, clean readable silhouettes, speed lines and impact shapes where appropriate, professional printed comic finish.',
    },
    donghua: {
        label: 'Donghua fantasy',
        prompt: 'High-end donghua fantasy key art, graceful movement, luminous atmosphere, elegant costumes, soft volumetric light, painterly yet clean rendering, expressive cinematic framing, romantic color contrast.',
    },
    cinematic: {
        label: 'Cinematic anime',
        prompt: 'Cinematic anime film still, dramatic camera language, emotional close-ups, polished character acting, controlled depth, natural lighting, rich but uncluttered background detail, production art quality.',
    },
    chibi: {
        label: 'Comedy chibi',
        prompt: 'Expressive comedy chibi manga style, exaggerated reactions, clean cartoon deformation, bold shapes, playful impact symbols, readable silhouettes, polished comic gag insert quality.',
    },
    custom: {
        label: 'Custom',
        prompt: '',
    },
};

const DEFAULT_NEGATIVE_PROMPT = 'low quality, blurry, noisy, jpeg artifacts, bad anatomy, extra limbs, malformed hands, unreadable text, fake letters, watermark, logo, signature, cluttered panel, broken face, inconsistent character design';
const DEFAULT_DRAFT_PROMPT = `<task>
Create a concise comic page draft from the roleplay context.
</task>

<context>
Recent chat:
{{recent_chat}}

Existing character lock:
{{character_lock}}
</context>

<rules>
- Output only valid JSON, no markdown.
- The comic page must continue the current story with continuity.
- Use {{panel_count}} panels.
- Bubble text must be in Russian, 4 to 8 words per bubble.
- Use 2 to 4 bubbles total.
- Do not write explicit sexual content. Fanservice, if useful, must stay tasteful and non-explicit.
</rules>

<format>
{
  "title": "short page title",
  "scene": "page-level visual scene summary for image generation",
  "character_lock": "stable character descriptions and continuity notes",
  "panel_notes": ["panel 1 visual beat", "panel 2 visual beat"],
  "bubbles": [
    { "panel": 1, "type": "speech", "position": "top-left", "text": "Русская реплика здесь" }
  ],
  "sfx": [
    { "panel": 3, "text": "БАХ" }
  ],
  "fanservice_panel": 0
}
</format>`;

const DEFAULT_SETTINGS = {
    schemaVersion: 2,
    enabled: true,
    showFab: true,
    apiType: 'onlysq-imagen',
    endpoint: '',
    apiKey: '',
    model: '',
    availableModels: [],
    openaiSize: '1024x1024',
    openaiQuality: 'standard',
    aspectRatio: 'auto',
    imageSize: '1K',
    naisteraModel: 'nano banana',
    naisteraAspectRatio: 'auto',
    naisteraPreset: 'digital',
    timeoutMs: 180000,
    concurrency: 1,
    requestCooldownMs: 0,
    generationMode: 'panels',
    autoMode: false,
    bubbleMode: 'model',
    insertMode: 'new',
    panelCount: 4,
    layout: 'webtoon',
    stylePreset: 'manhwa',
    customPrompt: '',
    savedStyles: [],
    savedLayouts: [],
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    characterLock: '',
    contextMessages: 4,
    previousImageCount: 0,
    draftPrompt: DEFAULT_DRAFT_PROMPT,
    draftConnectionMode: 'sillytavern',
    draftEndpoint: '',
    draftApiKey: '',
    draftModel: '',
    availableDraftModels: [],
    draftTemperature: 0.35,
    references: [],
    referenceProfiles: {},
    activeReferenceProfileKey: '',
    wardrobeEnabled: true,
    wardrobeSendDescription: true,
    wardrobeSendImages: true,
    wardrobe: [],
    wardrobeItems: [],
    wardrobeAssignments: {},
    wardrobeProfiles: {},
    activeWardrobeProfileKey: '',
    savedDraft: null,
    comicHistory: [],
};

const DEFAULT_PANEL_BEATS = [
    'Opening establishing panel. Show the location clearly, the emotional weather of the scene, and the characters entering the moment with readable body language.',
    'Interaction panel. Focus on the key exchange between the characters, eye lines, hand placement, posture tension, and the immediate emotional conflict.',
    'Extreme close-up insert. Focus on a face, hand, symbolic object, or emotional micro-expression that reveals what is not being said.',
    'Dynamic reaction panel. Include movement, stylized emphasis lines, sparks, sweat drops, petals, or comedic distortion if the tone calls for it.',
    'Quiet aftermath panel. Show the emotional result of the moment with negative space, lingering gaze, and environmental continuity.',
    'Final hook panel. End with a visually memorable beat that invites the next page.',
];

const ASPECT_PATTERNS = {
    webtoon: ['9:16', '2:3', '16:9', '1:1', '2:3', '9:16'],
    grid: ['1:1', '1:1', '1:1', '1:1', '1:1', '1:1'],
    cinematic: ['16:9', '3:2', '3:2', '16:9', '1:1', '21:9'],
    manga: ['2:3', '1:1', '3:4', '16:9', '1:1', '2:3'],
    dramatic: ['16:9', '2:3', '1:1', '3:2', '9:16', '16:9'],
};

const BUBBLE_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const REFERENCE_SLOTS = [
    { id: 'char', label: '{{char}}' },
    { id: 'user', label: '{{user}}' },
    { id: 'npc1', label: 'NPC 1' },
    { id: 'npc2', label: 'NPC 2' },
    { id: 'npc3', label: 'NPC 3' },
    { id: 'npc4', label: 'NPC 4' },
];

const WARDROBE_SLOTS = REFERENCE_SLOTS.map(slot => ({
    ...slot,
    label: `${slot.label} outfit`,
}));

const WARDROBE_CATEGORIES = {
    full: 'Комплект',
    top: 'Верх',
    bottom: 'Низ',
    shoes: 'Обувь',
    accessories: 'Аксессуары',
    hair: 'Причёска',
};
const WARDROBE_CATEGORY_ORDER = Object.keys(WARDROBE_CATEGORIES);
const WARDROBE_TARGETS = {
    all: 'Для всех',
    char: '{{char}}',
    user: '{{user}}',
    npc: 'NPC',
};
const WARDROBE_MODE_CATEGORIES = {
    full: ['full', 'accessories', 'hair'],
    parts: ['top', 'bottom', 'shoes', 'accessories', 'hair'],
};

const state = {
    modal: null,
    modalMinimized: false,
    generating: false,
    observer: null,
    autoRunning: false,
    lastAutoMessageId: null,
    lastComic: null,
    pendingComic: null,
    wardrobeModal: null,
    wardrobeOwner: 'char',
    wardrobeCategory: 'all',
    wardrobeTag: 'all',
    wardrobeEditingId: null,
    wardrobeTempPath: '',
};

initialize();

function initialize() {
    getSettings();
    const context = SillyTavern.getContext();
    const readyEvent = context?.event_types?.APP_READY || event_types.APP_READY;
    const chatChangedEvent = context?.event_types?.CHAT_CHANGED || event_types.CHAT_CHANGED;
    setTimeout(bootstrapUi, 0);
    context.eventSource?.on?.(readyEvent, () => {
        bootstrapUi();
    });
    if (chatChangedEvent) {
        context.eventSource?.on?.(chatChangedEvent, () => {
            setTimeout(handleContextChanged, 0);
        });
    }
    context.eventSource?.on?.(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        setTimeout(() => handleCharacterMessageRendered(messageId), 0);
    });
    window.BBComicForge = {
        open: openForgeModal,
        settings: getSettings,
        generateFromDraft: generateFromDraft,
    };
}

function bootstrapUi() {
    createSettingsUi();
    updateFloatingButton();
    cleanupRenderedComics(document.getElementById('chat') || document.body);
    bindComicActions(document.getElementById('chat') || document.body);
    installChatObserver();
}

function handleCharacterMessageRendered(messageId) {
    cleanupRenderedComics(document.getElementById('chat') || document.body);
    void runAutoComicAfterMessage(messageId);
}

function handleContextChanged() {
    getSettings();
    refreshSettingsUi();
    if (state.wardrobeModal?.isConnected) renderWardrobeModal();
}

async function runAutoComicAfterMessage(rawMessageId) {
    const settings = getSettings();
    if (!settings.enabled || !settings.autoMode || state.autoRunning || state.generating) return;
    const messageId = resolveMessageId(rawMessageId);
    if (!Number.isInteger(messageId) || state.lastAutoMessageId === messageId) return;
    const context = SillyTavern.getContext();
    const message = Array.isArray(context.chat) ? context.chat[messageId] : null;
    if (!message || message.is_user || message.is_system || message.extra?.from === MODULE_NAME) return;
    state.lastAutoMessageId = messageId;
    state.autoRunning = true;
    state.generating = true;
    updateFloatingButton();
    toastr.info('Comic Forge: авто-генерация комикса запущена.', 'Comic Forge');
    let root = null;
    try {
        root = ensureForgeModalForAutomation();
        applyDefaultPageSettingsToModal(root);
        renderProgress(root.querySelector('#bbcf-progress'), [{ number: 1, title: 'Черновик' }]);
        updateProgress(root.querySelector('#bbcf-progress'), 1, 'running', 'Черновик из чата');
        await fillDraftFromAi(root, { throwErrors: true });
        const draft = readDraftFromModal(root);
        if (!draft.scene.trim()) throw new Error('AI-черновик не заполнил сцену.');
        state.generating = false;
        await handleGenerateFromModal(root);
        if (state.pendingComic?.html && !state.pendingComic.sent) {
            await sendPendingComicToChat(root, { targetMessageId: messageId });
        }
    } catch (error) {
        console.error('[BB Comic Forge] auto comic failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
        state.generating = false;
    } finally {
        state.autoRunning = false;
        updateFloatingButton();
    }
}

function resolveMessageId(value) {
    if (Number.isInteger(value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isInteger(parsed)) return parsed;
    }
    if (value && typeof value === 'object') {
        return resolveMessageId(value.messageId ?? value.mesid ?? value.id ?? value.index);
    }
    const context = SillyTavern.getContext();
    return Array.isArray(context.chat) ? context.chat.length - 1 : -1;
}

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    const settings = extension_settings[MODULE_NAME];
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
    if (!['onlysq-imagen', 'openai-images', 'openai-chat', 'gemini', 'naistera'].includes(settings.apiType)) settings.apiType = DEFAULT_SETTINGS.apiType;
    if (settings.apiType === 'openai-images' && String(settings.endpoint || '').includes('api.onlysq.ru')) {
        settings.apiType = 'onlysq-imagen';
        dirty = true;
    }
    if (!Array.isArray(settings.availableModels)) {
        settings.availableModels = [];
        dirty = true;
    }
    settings.availableModels = filterModelNamesForProvider(settings.availableModels, settings.apiType);
    if (settings.apiType === 'onlysq-imagen' && !settings.model) {
        settings.model = 'flux';
        dirty = true;
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
    settings.panelCount = clampInt(settings.panelCount, 1, MAX_PANELS, DEFAULT_SETTINGS.panelCount);
    settings.concurrency = clampInt(settings.concurrency, 1, MAX_CONCURRENCY, DEFAULT_SETTINGS.concurrency);
    settings.requestCooldownMs = clampInt(settings.requestCooldownMs, 0, 600000, DEFAULT_SETTINGS.requestCooldownMs);
    settings.contextMessages = clampInt(settings.contextMessages, 0, 20, DEFAULT_SETTINGS.contextMessages);
    settings.previousImageCount = clampInt(settings.previousImageCount, 0, MAX_PREVIOUS_CONTEXT_IMAGES, DEFAULT_SETTINGS.previousImageCount);
    settings.timeoutMs = clampInt(settings.timeoutMs, 30000, 600000, DEFAULT_SETTINGS.timeoutMs);
    if (!DRAFT_CONNECTION_MODES.includes(settings.draftConnectionMode)) settings.draftConnectionMode = DEFAULT_SETTINGS.draftConnectionMode;
    settings.draftEndpoint = String(settings.draftEndpoint || '');
    settings.draftApiKey = String(settings.draftApiKey || '');
    settings.draftModel = String(settings.draftModel || '');
    if (!Array.isArray(settings.availableDraftModels)) settings.availableDraftModels = [];
    settings.availableDraftModels = filterDraftModelNames(settings.availableDraftModels, settings.draftConnectionMode);
    settings.draftTemperature = Math.max(0, Math.min(2, Number(settings.draftTemperature ?? DEFAULT_SETTINGS.draftTemperature) || 0));
    if (!VALID_IMAGE_SIZES.includes(settings.imageSize)) settings.imageSize = DEFAULT_SETTINGS.imageSize;
    if (!VALID_ASPECT_RATIOS.includes(settings.aspectRatio) && settings.aspectRatio !== 'auto') settings.aspectRatio = DEFAULT_SETTINGS.aspectRatio;
    if (!VALID_ASPECT_RATIOS.includes(settings.naisteraAspectRatio) && settings.naisteraAspectRatio !== 'auto') settings.naisteraAspectRatio = DEFAULT_SETTINGS.naisteraAspectRatio;
    if (!settings.negativePrompt) settings.negativePrompt = DEFAULT_NEGATIVE_PROMPT;
    if (!Array.isArray(settings.wardrobeItems)) settings.wardrobeItems = [];
    if (!settings.wardrobeAssignments || typeof settings.wardrobeAssignments !== 'object') settings.wardrobeAssignments = {};
    if (Array.isArray(settings.wardrobe) && settings.wardrobe.some(item => item?.path || item?.description || item?.name)) {
        migrateLegacyWardrobe(settings);
        dirty = true;
    }
    settings.wardrobeItems = normalizeWardrobeItems(settings.wardrobeItems);
    settings.wardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeAssignments);
    settings.wardrobe = [];
    if (!settings.wardrobeProfiles || typeof settings.wardrobeProfiles !== 'object' || Array.isArray(settings.wardrobeProfiles)) {
        settings.wardrobeProfiles = {};
        dirty = true;
    }
    const wardrobeProfileKey = getWardrobeProfileKey();
    const legacyWardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeAssignments);
    const hasLegacyWardrobeAssignments = !settings.activeWardrobeProfileKey && hasAnyWardrobeAssignment(legacyWardrobeAssignments);
    if (!settings.wardrobeProfiles[wardrobeProfileKey] && hasLegacyWardrobeAssignments) {
        settings.wardrobeProfiles[wardrobeProfileKey] = structuredClone(legacyWardrobeAssignments);
        dirty = true;
    }
    if (settings.activeWardrobeProfileKey !== wardrobeProfileKey) {
        settings.activeWardrobeProfileKey = wardrobeProfileKey;
        dirty = true;
    }
    settings.wardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeProfiles[wardrobeProfileKey] || {});
    if (settings.savedDraft && typeof settings.savedDraft !== 'object') {
        settings.savedDraft = null;
        dirty = true;
    }
    if (!Array.isArray(settings.comicHistory)) {
        settings.comicHistory = [];
        dirty = true;
    } else if (settings.comicHistory.length > MAX_COMIC_HISTORY) {
        settings.comicHistory = settings.comicHistory.slice(0, MAX_COMIC_HISTORY);
        dirty = true;
    }
    if (!settings.referenceProfiles || typeof settings.referenceProfiles !== 'object' || Array.isArray(settings.referenceProfiles)) {
        settings.referenceProfiles = {};
        dirty = true;
    }
    const referenceProfileKey = getReferenceProfileKey();
    const legacyReferenceProfileKey = getLegacyReferenceProfileKey();
    const existingReferences = normalizeReferences(settings.references);
    const hasLegacyReferences = !settings.activeReferenceProfileKey && existingReferences.some(ref => ref.path || ref.name || ref.description);
    if (!settings.referenceProfiles[referenceProfileKey] && settings.referenceProfiles[legacyReferenceProfileKey]) {
        settings.referenceProfiles[referenceProfileKey] = structuredClone(normalizeReferences(settings.referenceProfiles[legacyReferenceProfileKey]));
        dirty = true;
    } else if (!settings.referenceProfiles[referenceProfileKey] && hasLegacyReferences) {
        settings.referenceProfiles[referenceProfileKey] = structuredClone(existingReferences);
        dirty = true;
    }
    if (settings.activeReferenceProfileKey !== referenceProfileKey) {
        settings.activeReferenceProfileKey = referenceProfileKey;
        dirty = true;
    }
    settings.references = normalizeReferences(settings.referenceProfiles[referenceProfileKey] || []);
    if (dirty) saveSettings();
    return settings;
}

function normalizeReferences(rawReferences) {
    const byId = new Map(Array.isArray(rawReferences) ? rawReferences.map(ref => [ref?.id, ref]) : []);
    return REFERENCE_SLOTS.map(slot => {
        const ref = byId.get(slot.id) || {};
        return {
            id: slot.id,
            label: slot.label,
            enabled: ref.enabled !== false,
            name: String(ref.name || '').trim(),
            description: String(ref.description || '').trim(),
            path: String(ref.path || '').trim(),
        };
    });
}

function normalizeSavedStyles(rawStyles) {
    const styles = Array.isArray(rawStyles) ? rawStyles : [];
    return styles
        .filter(style => style && typeof style === 'object')
        .map(style => ({
            id: String(style.id || makeId('style')),
            label: String(style.label || style.name || 'Мой стиль').trim(),
            prompt: String(style.prompt || '').trim(),
        }))
        .filter(style => style.prompt)
        .slice(0, 40);
}

function normalizeSavedLayouts(rawLayouts) {
    const layouts = Array.isArray(rawLayouts) ? rawLayouts : [];
    return layouts
        .filter(layout => layout && typeof layout === 'object')
        .map(layout => ({
            id: String(layout.id || makeId('layout')),
            label: String(layout.label || layout.name || 'Мой макет').trim(),
            pattern: normalizeAspectPattern(layout.pattern || layout.aspectPattern),
            intent: String(layout.intent || '').trim(),
            singleAspect: VALID_ASPECT_RATIOS.includes(layout.singleAspect) ? layout.singleAspect : '3:4',
        }))
        .filter(layout => layout.pattern.length)
        .slice(0, 40);
}

function normalizeAspectPattern(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,;|]+/);
    const pattern = raw.map(item => String(item || '').trim()).filter(item => VALID_ASPECT_RATIOS.includes(item));
    return pattern.length ? pattern.slice(0, MAX_PANELS) : ['2:3', '1:1', '16:9', '3:4'];
}

function normalizeWardrobeItems(rawItems) {
    const items = Array.isArray(rawItems) ? rawItems : [];
    return items
        .filter(item => item && typeof item === 'object')
        .map(item => ({
            id: String(item.id || makeId('wardrobe-item')),
            name: String(item.name || 'Новый образ').trim(),
            description: String(item.description || '').trim(),
            path: String(item.path || item.imagePath || '').trim(),
            category: WARDROBE_CATEGORIES[item.category] ? item.category : 'full',
            target: WARDROBE_TARGETS[item.target] ? item.target : 'all',
            tags: Array.isArray(item.tags) ? item.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8) : [],
            favorite: Boolean(item.favorite),
            createdAt: Number(item.createdAt || Date.now()),
        }));
}

function normalizeWardrobeAssignments(rawAssignments) {
    const normalized = {};
    for (const owner of REFERENCE_SLOTS) {
        normalized[owner.id] = normalizeWardrobeAssignment(rawAssignments?.[owner.id]);
    }
    return normalized;
}

function normalizeWardrobeAssignment(rawAssignment = {}) {
    return {
        mode: rawAssignment.mode === 'parts' ? 'parts' : 'full',
        full: String(rawAssignment.full || ''),
        top: String(rawAssignment.top || ''),
        bottom: String(rawAssignment.bottom || ''),
        shoes: String(rawAssignment.shoes || ''),
        accessories: String(rawAssignment.accessories || ''),
        hair: String(rawAssignment.hair || ''),
    };
}

function hasAnyWardrobeAssignment(assignments) {
    return Object.values(assignments || {}).some(assignment =>
        WARDROBE_CATEGORY_ORDER.some(category => String(assignment?.[category] || '').trim()));
}

function persistWardrobeAssignments(settings) {
    if (!settings) return;
    const profileKey = getWardrobeProfileKey();
    if (!settings.wardrobeProfiles || typeof settings.wardrobeProfiles !== 'object' || Array.isArray(settings.wardrobeProfiles)) {
        settings.wardrobeProfiles = {};
    }
    settings.wardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeAssignments);
    settings.wardrobeProfiles[profileKey] = structuredClone(settings.wardrobeAssignments);
    settings.activeWardrobeProfileKey = profileKey;
}

function migrateLegacyWardrobe(settings) {
    const migrated = [];
    for (const slot of settings.wardrobe || []) {
        if (!slot?.path && !slot?.description && !slot?.name) continue;
        const id = makeId(`wardrobe-${slot.id || 'item'}`);
        migrated.push({
            id,
            name: String(slot.name || slot.label || 'Образ').trim(),
            description: String(slot.description || '').trim(),
            path: String(slot.path || '').trim(),
            category: 'full',
            target: slot.id === 'char' || slot.id === 'user' ? slot.id : slot.id?.startsWith('npc') ? 'npc' : 'all',
            tags: [],
            favorite: false,
            createdAt: Date.now(),
        });
        if (slot.enabled && settings.wardrobeAssignments?.[slot.id] !== undefined) {
            settings.wardrobeAssignments[slot.id] = normalizeWardrobeAssignment({ mode: 'full', full: id });
        } else if (slot.enabled && REFERENCE_SLOTS.some(owner => owner.id === slot.id)) {
            settings.wardrobeAssignments[slot.id] = normalizeWardrobeAssignment({ mode: 'full', full: id });
        }
    }
    if (migrated.length) {
        settings.wardrobeItems = [...(Array.isArray(settings.wardrobeItems) ? settings.wardrobeItems : []), ...migrated];
    }
}

function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

function clampInt(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(number)));
}

function createSettingsUi() {
    if (document.getElementById(SETTINGS_ID)) return;
    const container = document.getElementById('extensions_settings');
    if (!container) return;
    const settings = getSettings();
    const wrapper = document.createElement('div');
    wrapper.id = SETTINGS_ID;
    wrapper.className = 'inline-drawer';
    wrapper.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header">
            <b><i class="fa-solid fa-book-open"></i> BB Comic Forge</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="bbcf-settings-body">
                <section class="bbcf-section">
                    <h4 class="bbcf-section-title"><i class="fa-solid fa-power-off"></i> Основное</h4>
                    <label class="checkbox_label"><input type="checkbox" id="bbcf-enabled" ${settings.enabled ? 'checked' : ''}> <span>Включить Comic Forge</span></label>
                    <label class="checkbox_label"><input type="checkbox" id="bbcf-show-fab" ${settings.showFab ? 'checked' : ''}> <span>Показывать плавающую кнопку</span></label>
                    <label class="checkbox_label"><input type="checkbox" id="bbcf-auto-mode" ${settings.autoMode ? 'checked' : ''}> <span>Автоматически после ответа бота</span></label>
                    <div class="bbcf-actions">
                        <button class="menu_button bbcf-primary" type="button" id="bbcf-open-modal"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Открыть кузницу</span></button>
                    </div>
                </section>

                <section class="bbcf-section">
                    <h4 class="bbcf-section-title"><i class="fa-solid fa-plug"></i> API генерации картинок</h4>
                    <p class="bbcf-hint bbcf-provider-note" id="bbcf-provider-note"></p>
                    <div class="bbcf-row">
                        <label for="bbcf-api-type">Тип API</label>
                        <select id="bbcf-api-type" class="text_pole">
                            <option value="onlysq-imagen" ${settings.apiType === 'onlysq-imagen' ? 'selected' : ''}>OnlySQ ImaGen</option>
                            <option value="gemini" ${settings.apiType === 'gemini' ? 'selected' : ''}>Gemini / Nano Banana</option>
                            <option value="openai-chat" ${settings.apiType === 'openai-chat' ? 'selected' : ''}>OpenAI chat.completions image</option>
                            <option value="openai-images" ${settings.apiType === 'openai-images' ? 'selected' : ''}>OpenAI images/generations</option>
                            <option value="naistera" ${settings.apiType === 'naistera' ? 'selected' : ''}>Naistera</option>
                        </select>
                    </div>
                    <div class="bbcf-row">
                        <label for="bbcf-endpoint">Endpoint</label>
                        <input id="bbcf-endpoint" class="text_pole" type="text" value="${escapeHtml(settings.endpoint)}" placeholder="${escapeHtml(getEndpointPlaceholder(settings.apiType))}">
                    </div>
                    <div class="bbcf-row">
                        <label for="bbcf-api-key">API key</label>
                        <input id="bbcf-api-key" class="text_pole" type="password" value="${escapeHtml(settings.apiKey)}">
                    </div>
                    <div class="bbcf-row bbcf-model-row">
                        <label for="bbcf-model">Модель</label>
                        <div class="bbcf-model-picker">
                            <input id="bbcf-model" class="text_pole" type="text" list="bbcf-model-options" value="${escapeHtml(settings.model)}" placeholder="flux">
                            <button class="menu_button" type="button" id="bbcf-load-models"><i class="fa-solid fa-plug-circle-bolt"></i><span>Подключить</span></button>
                        </div>
                        <datalist id="bbcf-model-options">${buildModelOptionsHtml(settings)}</datalist>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row bbcf-openai-row">
                            <label for="bbcf-openai-size">OpenAI size</label>
                            <select id="bbcf-openai-size" class="text_pole">
                                ${option('1024x1024', settings.openaiSize)}
                                ${option('1536x1024', settings.openaiSize)}
                                ${option('1024x1536', settings.openaiSize)}
                                ${option('1792x1024', settings.openaiSize)}
                                ${option('1024x1792', settings.openaiSize)}
                            </select>
                        </div>
                        <div class="bbcf-row bbcf-openai-row">
                            <label for="bbcf-openai-quality">Quality</label>
                            <select id="bbcf-openai-quality" class="text_pole">
                                ${option('standard', settings.openaiQuality)}
                                ${option('hd', settings.openaiQuality)}
                                ${option('high', settings.openaiQuality)}
                                ${option('medium', settings.openaiQuality)}
                                ${option('low', settings.openaiQuality)}
                            </select>
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row bbcf-image-size-row">
                            <label for="bbcf-image-size">Размер картинки</label>
                            <select id="bbcf-image-size" class="text_pole">
                                ${option('1K', settings.imageSize)}
                                ${option('2K', settings.imageSize)}
                                ${option('4K', settings.imageSize)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-timeout">Таймаут, сек</label>
                            <input id="bbcf-timeout" class="text_pole" type="number" min="30" max="600" value="${Math.round(settings.timeoutMs / 1000)}">
                        </div>
                    </div>
                    <div class="bbcf-grid-2 bbcf-naistera-row">
                        <div class="bbcf-row">
                            <label for="bbcf-naistera-model">Модель Naistera</label>
                            <select id="bbcf-naistera-model" class="text_pole">
                                ${option('grok', settings.naisteraModel)}
                                ${option('grok-pro', settings.naisteraModel)}
                                ${option('nano banana', settings.naisteraModel)}
                                ${option('novelai', settings.naisteraModel)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-naistera-preset">Пресет Naistera</label>
                            <input id="bbcf-naistera-preset" class="text_pole" type="text" value="${escapeHtml(settings.naisteraPreset)}">
                        </div>
                    </div>
                    <div class="bbcf-actions">
                        <button class="menu_button" type="button" id="bbcf-test-api"><i class="fa-solid fa-wifi"></i><span>Проверить</span></button>
                    </div>
                </section>

                <section class="bbcf-section">
                    <h4 class="bbcf-section-title"><i class="fa-solid fa-scroll"></i> AI-черновик</h4>
                    <p class="bbcf-hint bbcf-draft-connection-note" id="bbcf-draft-connection-note"></p>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-connection-mode">Кто пишет черновик</label>
                            <select id="bbcf-draft-connection-mode" class="text_pole">
                                ${option('sillytavern', settings.draftConnectionMode, 'Текущая модель SillyTavern')}
                                ${option('openai-chat', settings.draftConnectionMode, 'Отдельный OpenAI-compatible chat')}
                                ${option('gemini', settings.draftConnectionMode, 'Отдельный Gemini-compatible')}
                            </select>
                        </div>
                        <div class="bbcf-row bbcf-draft-connection-row">
                            <label for="bbcf-draft-model">Модель</label>
                            <input id="bbcf-draft-model" class="text_pole" type="text" list="bbcf-draft-model-options" value="${escapeHtml(settings.draftModel)}" placeholder="${escapeHtml(getDraftModelPlaceholder(settings.draftConnectionMode))}">
                            <datalist id="bbcf-draft-model-options">${buildDraftModelOptionsHtml(settings)}</datalist>
                        </div>
                    </div>
                    <div class="bbcf-grid-2 bbcf-draft-connection-row">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-endpoint">Endpoint</label>
                            <input id="bbcf-draft-endpoint" class="text_pole" type="text" value="${escapeHtml(settings.draftEndpoint)}" placeholder="${escapeHtml(getDraftEndpointPlaceholder(settings.draftConnectionMode))}">
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-draft-api-key">API key</label>
                            <input id="bbcf-draft-api-key" class="text_pole" type="password" value="${escapeHtml(settings.draftApiKey)}" placeholder="Можно оставить пустым, если совпадает с API картинок">
                        </div>
                    </div>
                    <div class="bbcf-row bbcf-draft-connection-row">
                        <label for="bbcf-draft-temperature">Температура</label>
                        <input id="bbcf-draft-temperature" class="text_pole" type="number" min="0" max="2" step="0.05" value="${settings.draftTemperature}">
                    </div>
                    <div class="bbcf-actions">
                        <button class="menu_button bbcf-draft-connection-row" type="button" id="bbcf-load-draft-models"><i class="fa-solid fa-plug-circle-bolt"></i><span>Подключить</span></button>
                        <button class="menu_button" type="button" id="bbcf-test-draft-api"><i class="fa-solid fa-wifi"></i><span>Проверить черновик</span></button>
                    </div>
                </section>

                <section class="bbcf-section">
                    <h4 class="bbcf-section-title"><i class="fa-solid fa-user-group"></i> Референсы персонажей</h4>
                    <div class="bbcf-ref-grid">
                        ${buildReferenceSettingsHtml(settings)}
                    </div>
                    <div class="bbcf-wardrobe-panel">
                        <div class="bbcf-wardrobe-head">
                            <div>
                                <h5><i class="fa-solid fa-shirt"></i> Гардероб</h5>
                            </div>
                            <button class="menu_button bbcf-primary" type="button" id="bbcf-open-wardrobe"><i class="fa-solid fa-door-open"></i><span>Открыть</span></button>
                        </div>
                        <div class="bbcf-wardrobe-options">
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-wardrobe-enabled" ${settings.wardrobeEnabled ? 'checked' : ''}> <span>Использовать встроенный гардероб</span></label>
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-wardrobe-desc" ${settings.wardrobeSendDescription ? 'checked' : ''}> <span>Учитывать описания образов</span></label>
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-wardrobe-images" ${settings.wardrobeSendImages ? 'checked' : ''}> <span>Прикладывать картинки образов</span></label>
                        </div>
                        <div class="bbcf-wardrobe-summary">
                            ${buildWardrobeSummaryHtml(settings)}
                        </div>
                    </div>
                </section>

                <details class="bbcf-section bbcf-settings-details">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-table-cells-large"></i> <span>Страница по умолчанию</span></summary>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-generation-mode">Режим</label>
                            <select id="bbcf-generation-mode" class="text_pole">
                                ${option('panels', settings.generationMode, 'Качественно: каждая панель отдельно')}
                                ${option('single', settings.generationMode, 'Экономно: весь комикс одним запросом')}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-panel-count">Панелей</label>
                            <input id="bbcf-panel-count" class="text_pole" type="number" min="1" max="${MAX_PANELS}" value="${settings.panelCount}">
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-insert-mode">Отправка в чат</label>
                            <select id="bbcf-insert-mode" class="text_pole">
                                ${option('new', settings.insertMode, 'Новым сообщением')}
                                ${option('append_last', settings.insertMode, 'В последнее сообщение')}
                            </select>
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-cooldown">Пауза между запросами, сек</label>
                            <input id="bbcf-cooldown" class="text_pole" type="number" min="0" max="600" value="${Math.round(settings.requestCooldownMs / 1000)}">
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-concurrency">Паралельность генераций</label>
                            <input id="bbcf-concurrency" class="text_pole" type="number" min="1" max="${MAX_CONCURRENCY}" value="${settings.concurrency}">
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-context-messages">Контекст сообщений из чата</label>
                            <input id="bbcf-context-messages" class="text_pole" type="number" min="0" max="20" value="${settings.contextMessages}">
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-previous-image-count">Контекст изображений из чата</label>
                            <input id="bbcf-previous-image-count" class="text_pole" type="number" min="0" max="${MAX_PREVIOUS_CONTEXT_IMAGES}" value="${settings.previousImageCount}">
                        </div>
                    </div>
                    <div class="bbcf-row">
                            <label for="bbcf-layout">Макет</label>
                            <select id="bbcf-layout" class="text_pole">
                            ${buildLayoutOptionsHtml(settings, settings.layout)}
                        </select>
                    </div>
                    <div class="bbcf-row">
                        <label for="bbcf-style-preset">Стиль</label>
                        <select id="bbcf-style-preset" class="text_pole">
                            ${buildStyleOptionsHtml(settings, settings.stylePreset)}
                        </select>
                    </div>
                    <details class="bbcf-preset-help">
                        <summary><i class="fa-solid fa-palette"></i><span>Примеры и сохранение</span></summary>
                        <div class="bbcf-preset-examples">
                            ${buildStyleExamplesHtml(settings)}
                            ${buildLayoutExamplesHtml(settings)}
                        </div>
                        <div class="bbcf-grid-2">
                            <div class="bbcf-field">
                                <label for="bbcf-save-style-name">Название стиля</label>
                                <input id="bbcf-save-style-name" class="text_pole" type="text" placeholder="Например: нежная акварель">
                            </div>
                            <div class="bbcf-field">
                                <label for="bbcf-save-style-prompt">Описание стиля</label>
                                <textarea id="bbcf-save-style-prompt" class="text_pole" rows="3" placeholder="Линия, цвет, свет, детализация, настроение."></textarea>
                            </div>
                        </div>
                        <button class="menu_button" type="button" id="bbcf-save-style"><i class="fa-solid fa-floppy-disk"></i><span>Сохранить стиль</span></button>
                        <div class="bbcf-grid-2">
                            <div class="bbcf-field">
                                <label for="bbcf-save-layout-name">Название макета</label>
                                <input id="bbcf-save-layout-name" class="text_pole" type="text" placeholder="Например: крупный финал">
                            </div>
                            <div class="bbcf-field">
                                <label for="bbcf-save-layout-pattern">Панели</label>
                                <input id="bbcf-save-layout-pattern" class="text_pole" type="text" placeholder="9:16, 1:1, 16:9, 3:4">
                            </div>
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-save-layout-intent">Описание макета</label>
                            <input id="bbcf-save-layout-intent" class="text_pole" type="text" placeholder="Вертикальный ритм с крупной эмоциональной финальной панелью">
                        </div>
                        <button class="menu_button" type="button" id="bbcf-save-layout"><i class="fa-solid fa-table-cells-large"></i><span>Сохранить макет</span></button>
                    </details>
                    <div class="bbcf-field">
                        <label for="bbcf-custom-style">Дополнительные инструкции к генерации</label>
                        <textarea id="bbcf-custom-style" class="text_pole" rows="3" placeholder="Разовые правки поверх выбранного стиля: свет, ракурс, темп, материалы.">${escapeHtml(settings.customPrompt)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-character-lock">Описание персонажей</label>
                        <textarea id="bbcf-character-lock" class="text_pole" rows="4" placeholder="Описание персонажей, одежды, особенностей и текущего состояния.">${escapeHtml(settings.characterLock)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-negative">Negative Prompt</label>
                        <textarea id="bbcf-negative" class="text_pole" rows="3">${escapeHtml(settings.negativePrompt)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-prompt">Промпт AI-черновика</label>
                        <textarea id="bbcf-draft-prompt" class="text_pole" rows="6">${escapeHtml(settings.draftPrompt)}</textarea>
                    </div>
                </details>
            </div>
        </div>
    `;
    container.appendChild(wrapper);
    bindSettingsUi(wrapper);
    syncProviderRows();
    syncDraftConnectionRows();
}

function bindSettingsUi(root) {
    root.querySelector('#bbcf-open-modal')?.addEventListener('click', openForgeModal);
    root.querySelector('#bbcf-test-api')?.addEventListener('click', testApiSettings);
    root.querySelector('#bbcf-load-models')?.addEventListener('click', () => loadProviderModels({ button: root.querySelector('#bbcf-load-models') }));
    root.querySelector('#bbcf-load-draft-models')?.addEventListener('click', () => loadDraftModels({ button: root.querySelector('#bbcf-load-draft-models') }));
    root.querySelector('#bbcf-test-draft-api')?.addEventListener('click', testDraftSettings);
    root.querySelector('#bbcf-open-wardrobe')?.addEventListener('click', openWardrobeModal);
    bindReferenceSettings(root);
    bindSettingInput(root, '#bbcf-enabled', 'enabled', 'checked', () => updateFloatingButton());
    bindSettingInput(root, '#bbcf-show-fab', 'showFab', 'checked', () => updateFloatingButton());
    bindSettingInput(root, '#bbcf-auto-mode', 'autoMode', 'checked');
    bindSettingInput(root, '#bbcf-wardrobe-enabled', 'wardrobeEnabled', 'checked');
    bindSettingInput(root, '#bbcf-wardrobe-desc', 'wardrobeSendDescription', 'checked');
    bindSettingInput(root, '#bbcf-wardrobe-images', 'wardrobeSendImages', 'checked');
    bindSettingInput(root, '#bbcf-api-type', 'apiType', 'value', () => {
        const settings = getSettings();
        settings.availableModels = getKnownModelsForProvider(settings.apiType);
        if (!settings.model && settings.availableModels.length) settings.model = settings.availableModels[0];
        saveSettings();
        updateModelPicker(root);
        syncProviderRows();
    });
    bindSettingInput(root, '#bbcf-draft-connection-mode', 'draftConnectionMode', 'value', () => {
        const settings = getSettings();
        settings.availableDraftModels = [];
        if (settings.draftConnectionMode === 'sillytavern') settings.draftModel = '';
        saveSettings();
        syncDraftConnectionRows();
    });
    bindSettingInput(root, '#bbcf-draft-endpoint', 'draftEndpoint');
    bindSettingInput(root, '#bbcf-draft-api-key', 'draftApiKey');
    bindSettingInput(root, '#bbcf-draft-model', 'draftModel');
    bindSettingInput(root, '#bbcf-draft-temperature', 'draftTemperature');
    bindSettingInput(root, '#bbcf-endpoint', 'endpoint');
    bindSettingInput(root, '#bbcf-api-key', 'apiKey');
    bindSettingInput(root, '#bbcf-model', 'model');
    bindSettingInput(root, '#bbcf-openai-size', 'openaiSize');
    bindSettingInput(root, '#bbcf-openai-quality', 'openaiQuality');
    bindSettingInput(root, '#bbcf-image-size', 'imageSize');
    bindSettingInput(root, '#bbcf-naistera-model', 'naisteraModel');
    bindSettingInput(root, '#bbcf-naistera-preset', 'naisteraPreset');
    bindSettingInput(root, '#bbcf-timeout', 'timeoutMs', 'seconds');
    bindSettingInput(root, '#bbcf-generation-mode', 'generationMode');
    bindSettingInput(root, '#bbcf-insert-mode', 'insertMode');
    bindSettingInput(root, '#bbcf-cooldown', 'requestCooldownMs', 'cooldownSeconds');
    bindSettingInput(root, '#bbcf-panel-count', 'panelCount', 'int');
    bindSettingInput(root, '#bbcf-concurrency', 'concurrency', 'int');
    bindSettingInput(root, '#bbcf-context-messages', 'contextMessages', 'int');
    bindSettingInput(root, '#bbcf-previous-image-count', 'previousImageCount', 'int');
    bindSettingInput(root, '#bbcf-layout', 'layout');
    bindSettingInput(root, '#bbcf-style-preset', 'stylePreset');
    bindSettingInput(root, '#bbcf-custom-style', 'customPrompt');
    root.querySelector('#bbcf-save-style')?.addEventListener('click', () => saveStyleFromSettings(root));
    root.querySelector('#bbcf-save-layout')?.addEventListener('click', () => saveLayoutFromSettings(root));
    bindSettingInput(root, '#bbcf-character-lock', 'characterLock');
    bindSettingInput(root, '#bbcf-negative', 'negativePrompt');
    bindSettingInput(root, '#bbcf-draft-prompt', 'draftPrompt');
}

function buildReferenceSettingsHtml(settings) {
    return settings.references.map(ref => `
        <div class="bbcf-ref-card" data-bbcf-ref="${escapeHtml(ref.id)}">
            <div class="bbcf-ref-thumb ${ref.path ? 'has-image' : ''}">
                ${ref.path ? `<img src="${escapeHtml(ref.path)}" alt="${escapeHtml(ref.label)}">` : '<i class="fa-solid fa-user"></i>'}
            </div>
            <div class="bbcf-ref-main">
                <label class="checkbox_label">
                    <input type="checkbox" class="bbcf-ref-enabled" ${ref.enabled ? 'checked' : ''}>
                    <span>${escapeHtml(ref.label)}</span>
                </label>
                <input class="text_pole bbcf-ref-name" type="text" value="${escapeHtml(ref.name)}" placeholder="Имя для промпта">
                <textarea class="text_pole bbcf-ref-description" rows="2" placeholder="Краткое описание внешности, если рефы недоступны">${escapeHtml(ref.description)}</textarea>
                <div class="bbcf-ref-actions">
                    <button class="menu_button bbcf-ref-upload" type="button"><i class="fa-solid fa-upload"></i><span>Загрузить</span></button>
                    <button class="menu_button bbcf-ref-clear" type="button" ${ref.path ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i></button>
                    <input class="bbcf-ref-file" type="file" accept="image/*" hidden>
                </div>
            </div>
        </div>
    `).join('');
}

function buildWardrobeSummaryHtml(settings) {
    if (!settings.wardrobeItems.length) {
        return '<div class="bbcf-wardrobe-empty"><i class="fa-solid fa-shirt"></i><span>Гардероб пока пуст</span></div>';
    }
    return REFERENCE_SLOTS.map(owner => {
        const active = getWardrobeActiveItems(settings, owner.id);
        const preview = active.slice(0, 3).map(item => `
            <span class="bbcf-wardrobe-mini-thumb" title="${escapeHtml(item.name)}">
                ${item.path ? `<img src="${escapeHtml(item.path)}" alt="">` : '<i class="fa-solid fa-shirt"></i>'}
            </span>
        `).join('');
        return `
            <div class="bbcf-wardrobe-owner-mini ${active.length ? 'has-outfit' : ''}">
                <strong>${escapeHtml(owner.label)}</strong>
                <div>${preview || '<span class="bbcf-muted">нет образа</span>'}</div>
            </div>
        `;
    }).join('');
}

function openWardrobeModal() {
    if (state.wardrobeModal?.isConnected) return;
    const root = document.createElement('div');
    root.className = 'bbcf-wardrobe-modal-root';
    root.innerHTML = `
        <div class="bbcf-wardrobe-backdrop" data-bbcf-wardrobe-close></div>
        <div class="bbcf-wardrobe-modal" role="dialog" aria-modal="true">
            <header class="bbcf-wardrobe-modal-header">
                <div>
                    <h3><i class="fa-solid fa-shirt"></i> Гардероб Comic Forge</h3>
                    <p>Сохраняй сеты, детали одежды и аксессуары. Потом надевай их на нужного героя.</p>
                </div>
                <button type="button" class="bbcf-modal-close" title="Закрыть" data-bbcf-wardrobe-close><i class="fa-solid fa-xmark"></i></button>
            </header>
            <div class="bbcf-wardrobe-modal-body"></div>
        </div>
    `;
    document.body.appendChild(root);
    state.wardrobeModal = root;
    root.querySelectorAll('[data-bbcf-wardrobe-close]').forEach(node => node.addEventListener('click', closeWardrobeModal));
    renderWardrobeModal();
}

function closeWardrobeModal() {
    state.wardrobeModal?.remove();
    state.wardrobeModal = null;
    state.wardrobeEditingId = null;
    state.wardrobeTempPath = '';
    refreshSettingsUi();
}

function renderWardrobeModal() {
    const root = state.wardrobeModal;
    const body = root?.querySelector('.bbcf-wardrobe-modal-body');
    if (!body) return;
    const settings = getSettings();
    if (!REFERENCE_SLOTS.some(owner => owner.id === state.wardrobeOwner)) state.wardrobeOwner = 'char';
    const owner = REFERENCE_SLOTS.find(slot => slot.id === state.wardrobeOwner) || REFERENCE_SLOTS[0];
    const assignment = settings.wardrobeAssignments[owner.id] || normalizeWardrobeAssignment();
    const allowedCategories = getAllowedWardrobeCategories(assignment.mode);
    if (state.wardrobeCategory !== 'all' && !allowedCategories.includes(state.wardrobeCategory)) {
        state.wardrobeCategory = 'all';
    }
    const visibleItems = getFilteredWardrobeItems(settings, owner.id, state.wardrobeCategory);
    body.innerHTML = `
        <aside class="bbcf-wardrobe-closet">
            <div class="bbcf-wardrobe-tabs">
                ${REFERENCE_SLOTS.map(slot => `<button type="button" class="${slot.id === owner.id ? 'active' : ''}" data-bbcf-wardrobe-owner="${escapeHtml(slot.id)}">${escapeHtml(slot.label)}</button>`).join('')}
            </div>
            <div class="bbcf-wardrobe-mode">
                <button type="button" class="${assignment.mode === 'full' ? 'active' : ''}" data-bbcf-wardrobe-mode="full"><i class="fa-solid fa-user"></i><span>Сет</span></button>
                <button type="button" class="${assignment.mode === 'parts' ? 'active' : ''}" data-bbcf-wardrobe-mode="parts"><i class="fa-solid fa-layer-group"></i><span>По частям</span></button>
            </div>
            <div class="bbcf-wardrobe-slots">
                ${buildWardrobeSlotsHtml(settings, owner.id)}
            </div>
        </aside>
        <main class="bbcf-wardrobe-library">
            <div class="bbcf-wardrobe-library-top">
                <div class="bbcf-wardrobe-filter">
                    ${buildWardrobeCategoryFiltersHtml()}
                </div>
                <button type="button" class="menu_button bbcf-primary" id="bbcf-wardrobe-new"><i class="fa-solid fa-plus"></i><span>Новая вещь</span></button>
            </div>
            ${buildWardrobeTagFiltersHtml(settings, owner.id)}
            ${state.wardrobeEditingId ? buildWardrobeEditorHtml(settings) : ''}
            <div class="bbcf-wardrobe-items">
                ${visibleItems.length ? visibleItems.map(item => buildWardrobeItemCardHtml(settings, owner.id, item)).join('') : '<div class="bbcf-wardrobe-empty-large"><i class="fa-solid fa-shirt"></i><span>Здесь пока пусто</span></div>'}
            </div>
        </main>
    `;
    bindWardrobeModalEvents(body);
}

function buildWardrobeCategoryFiltersHtml() {
    const settings = getSettings();
    const assignment = settings.wardrobeAssignments[state.wardrobeOwner] || normalizeWardrobeAssignment();
    const allowed = getAllowedWardrobeCategories(assignment.mode);
    const chips = [{ id: 'all', label: 'Все' }, ...allowed.map(id => ({ id, label: WARDROBE_CATEGORIES[id] }))];
    return chips.map(chip => `<button type="button" class="${state.wardrobeCategory === chip.id ? 'active' : ''}" data-bbcf-wardrobe-category="${escapeHtml(chip.id)}">${escapeHtml(chip.label)}</button>`).join('');
}

function buildWardrobeTagFiltersHtml(settings, ownerId) {
    const tags = getWardrobeTagsForOwner(settings, ownerId);
    if (!tags.length) return '';
    if (state.wardrobeTag !== 'all' && !tags.includes(state.wardrobeTag)) state.wardrobeTag = 'all';
    return `
        <div class="bbcf-wardrobe-tag-filter">
            <button type="button" class="${state.wardrobeTag === 'all' ? 'active' : ''}" data-bbcf-wardrobe-tag="all">Все теги</button>
            ${tags.map(tag => `<button type="button" class="${state.wardrobeTag === tag ? 'active' : ''}" data-bbcf-wardrobe-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
        </div>
    `;
}

function buildWardrobeSlotsHtml(settings, ownerId) {
    const assignment = settings.wardrobeAssignments[ownerId] || normalizeWardrobeAssignment();
    const categories = assignment.mode === 'parts'
        ? ['top', 'bottom', 'shoes', 'accessories', 'hair']
        : ['full', 'accessories', 'hair'];
    return categories.map(category => {
        const item = findWardrobeItem(settings, assignment[category]);
        return `
            <div class="bbcf-wardrobe-slot ${item ? 'filled' : ''}">
                <div class="bbcf-wardrobe-slot-img">
                    ${item?.path ? `<img src="${escapeHtml(item.path)}" alt="">` : `<i class="fa-solid ${getWardrobeCategoryIcon(category)}"></i>`}
                </div>
                <div class="bbcf-wardrobe-slot-info">
                    <span>${escapeHtml(WARDROBE_CATEGORIES[category])}</span>
                    <strong>${escapeHtml(item?.name || 'пусто')}</strong>
                </div>
                <button type="button" title="Снять" data-bbcf-wardrobe-clear="${escapeHtml(category)}" ${item ? '' : 'disabled'}><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
    }).join('');
}

function buildWardrobeItemCardHtml(settings, ownerId, item) {
    const assignment = settings.wardrobeAssignments[ownerId] || normalizeWardrobeAssignment();
    const active = assignment[item.category] === item.id;
    return `
        <article class="bbcf-wardrobe-item ${active ? 'active' : ''}" data-bbcf-wardrobe-item="${escapeHtml(item.id)}">
            <div class="bbcf-wardrobe-item-image">
                ${item.path ? `<img src="${escapeHtml(item.path)}" alt="${escapeHtml(item.name)}" loading="lazy">` : `<i class="fa-solid ${getWardrobeCategoryIcon(item.category)}"></i>`}
                <span>${escapeHtml(WARDROBE_CATEGORIES[item.category] || 'Вещь')}</span>
            </div>
            <div class="bbcf-wardrobe-item-body">
                <strong>${escapeHtml(item.name)}</strong>
                <p>${escapeHtml(item.description || 'Описание можно добавить позже.')}</p>
                ${item.tags?.length ? `<div class="bbcf-wardrobe-card-tags">${item.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                <div class="bbcf-wardrobe-card-actions">
                    <button type="button" class="menu_button bbcf-wardrobe-equip" data-bbcf-wardrobe-equip="${escapeHtml(item.id)}"><i class="fa-solid ${active ? 'fa-check' : 'fa-person-dress'}"></i><span>${active ? 'Надето' : 'Надеть'}</span></button>
                    <button type="button" class="menu_button bbcf-icon-button" title="Редактировать" data-bbcf-wardrobe-edit="${escapeHtml(item.id)}"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="menu_button bbcf-icon-button" title="Удалить" data-bbcf-wardrobe-delete="${escapeHtml(item.id)}"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        </article>
    `;
}

function buildWardrobeEditorHtml(settings) {
    const isNew = state.wardrobeEditingId === 'new';
    const item = isNew ? null : findWardrobeItem(settings, state.wardrobeEditingId);
    const path = item?.path || state.wardrobeTempPath || '';
    const assignment = settings.wardrobeAssignments[state.wardrobeOwner] || normalizeWardrobeAssignment();
    const allowedCategories = getAllowedWardrobeCategories(assignment.mode);
    const category = item?.category || (allowedCategories.includes(state.wardrobeCategory) ? state.wardrobeCategory : allowedCategories[0] || 'full');
    const target = item?.target || getTargetForOwner(state.wardrobeOwner);
    return `
        <form class="bbcf-wardrobe-editor" id="bbcf-wardrobe-editor">
            <div class="bbcf-wardrobe-editor-preview ${path ? 'has-image' : ''}">
                ${path ? `<img src="${escapeHtml(path)}" alt="">` : '<i class="fa-solid fa-camera"></i>'}
                <button class="menu_button" type="button" id="bbcf-wardrobe-editor-upload"><i class="fa-solid fa-upload"></i><span>Картинка</span></button>
                <input type="file" accept="image/*" id="bbcf-wardrobe-editor-file" hidden>
                <input type="hidden" id="bbcf-wardrobe-editor-path" value="${escapeHtml(path)}">
            </div>
            <div class="bbcf-wardrobe-editor-fields">
                <input class="text_pole" id="bbcf-wardrobe-editor-name" type="text" value="${escapeHtml(item?.name || '')}" placeholder="Название: летний сет, школьная форма, ленты">
                <div class="bbcf-grid-2">
                    <select class="text_pole" id="bbcf-wardrobe-editor-category">
                        ${allowedCategories.map(key => option(key, category, WARDROBE_CATEGORIES[key])).join('')}
                    </select>
                    <select class="text_pole" id="bbcf-wardrobe-editor-target">
                        ${Object.entries(WARDROBE_TARGETS).map(([key, label]) => option(key, target, label)).join('')}
                    </select>
                </div>
                <textarea class="text_pole" id="bbcf-wardrobe-editor-description" rows="3" placeholder="Коротко опиши одежду, ткань, цвет, аксессуары и состояние образа.">${escapeHtml(item?.description || '')}</textarea>
                <input class="text_pole" id="bbcf-wardrobe-editor-tags" type="text" value="${escapeHtml((item?.tags || []).join(', '))}" placeholder="Теги для поиска: вечер, дом, бой">
                <div class="bbcf-wardrobe-editor-actions">
                    <button class="menu_button" type="button" id="bbcf-wardrobe-editor-describe" ${path ? '' : 'disabled'}><i class="fa-solid fa-pen-nib"></i><span>Описать</span></button>
                    <button class="menu_button bbcf-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i><span>Сохранить</span></button>
                    <button class="menu_button" type="button" id="bbcf-wardrobe-editor-cancel"><i class="fa-solid fa-xmark"></i><span>Отмена</span></button>
                </div>
            </div>
        </form>
    `;
}

function bindReferenceSettings(root) {
    root.querySelectorAll('.bbcf-ref-card').forEach(card => {
        const id = card.getAttribute('data-bbcf-ref');
        if (!id) return;
        const fileInput = card.querySelector('.bbcf-ref-file');
        card.querySelector('.bbcf-ref-upload')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const path = await saveReferenceImageToFile(dataUrl, id);
                updateReference(id, { path });
                refreshSettingsUi();
                toastr.success('Референс сохранен.', 'Comic Forge');
            } catch (error) {
                console.error('[BB Comic Forge] reference upload failed', error);
                toastr.error(error?.message || String(error), 'Comic Forge');
            } finally {
                fileInput.value = '';
            }
        });
        card.querySelector('.bbcf-ref-clear')?.addEventListener('click', () => {
            updateReference(id, { path: '' });
            refreshSettingsUi();
            toastr.info('Референс очищен.', 'Comic Forge');
        });
        card.querySelector('.bbcf-ref-enabled')?.addEventListener('change', event => {
            updateReference(id, { enabled: Boolean(event.target.checked) });
        });
        card.querySelector('.bbcf-ref-name')?.addEventListener('input', event => {
            updateReference(id, { name: String(event.target.value || '') });
        });
        card.querySelector('.bbcf-ref-description')?.addEventListener('input', event => {
            updateReference(id, { description: String(event.target.value || '') });
        });
    });
}

function bindWardrobeModalEvents(root) {
    root.querySelectorAll('[data-bbcf-wardrobe-owner]').forEach(button => {
        button.addEventListener('click', () => {
            state.wardrobeOwner = button.getAttribute('data-bbcf-wardrobe-owner') || 'char';
            state.wardrobeEditingId = null;
            state.wardrobeTag = 'all';
            renderWardrobeModal();
        });
    });
    root.querySelectorAll('[data-bbcf-wardrobe-mode]').forEach(button => {
        button.addEventListener('click', () => {
            const settings = getSettings();
            const assignment = settings.wardrobeAssignments[state.wardrobeOwner] || normalizeWardrobeAssignment();
            assignment.mode = button.getAttribute('data-bbcf-wardrobe-mode') === 'parts' ? 'parts' : 'full';
            if (assignment.mode === 'full') {
                assignment.top = '';
                assignment.bottom = '';
                assignment.shoes = '';
            } else {
                assignment.full = '';
            }
            settings.wardrobeAssignments[state.wardrobeOwner] = assignment;
            if (state.wardrobeCategory !== 'all' && !getAllowedWardrobeCategories(assignment.mode).includes(state.wardrobeCategory)) {
                state.wardrobeCategory = 'all';
            }
            state.wardrobeTag = 'all';
            persistWardrobeAssignments(settings);
            saveSettings();
            renderWardrobeModal();
        });
    });
    root.querySelectorAll('[data-bbcf-wardrobe-category]').forEach(button => {
        button.addEventListener('click', () => {
            state.wardrobeCategory = button.getAttribute('data-bbcf-wardrobe-category') || 'all';
            state.wardrobeTag = 'all';
            renderWardrobeModal();
        });
    });
    root.querySelectorAll('[data-bbcf-wardrobe-tag]').forEach(button => {
        button.addEventListener('click', () => {
            state.wardrobeTag = button.getAttribute('data-bbcf-wardrobe-tag') || 'all';
            renderWardrobeModal();
        });
    });
    root.querySelector('#bbcf-wardrobe-new')?.addEventListener('click', () => {
        state.wardrobeEditingId = 'new';
        state.wardrobeTempPath = '';
        renderWardrobeModal();
    });
    root.querySelectorAll('[data-bbcf-wardrobe-equip]').forEach(button => {
        button.addEventListener('click', () => {
            equipWardrobeItem(button.getAttribute('data-bbcf-wardrobe-equip'));
            renderWardrobeModal();
        });
    });
    root.querySelectorAll('[data-bbcf-wardrobe-clear]').forEach(button => {
        button.addEventListener('click', () => {
            clearWardrobeSlot(button.getAttribute('data-bbcf-wardrobe-clear'));
            renderWardrobeModal();
        });
    });
    root.querySelectorAll('[data-bbcf-wardrobe-edit]').forEach(button => {
        button.addEventListener('click', () => {
            state.wardrobeEditingId = button.getAttribute('data-bbcf-wardrobe-edit');
            state.wardrobeTempPath = '';
            renderWardrobeModal();
        });
    });
    root.querySelectorAll('[data-bbcf-wardrobe-delete]').forEach(button => {
        button.addEventListener('click', () => {
            deleteWardrobeItem(button.getAttribute('data-bbcf-wardrobe-delete'));
            renderWardrobeModal();
        });
    });
    bindWardrobeEditor(root);
}

function bindWardrobeEditor(root) {
    const form = root.querySelector('#bbcf-wardrobe-editor');
    if (!form) return;
    const fileInput = form.querySelector('#bbcf-wardrobe-editor-file');
    form.querySelector('#bbcf-wardrobe-editor-upload')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            const path = await saveReferenceImageToFile(dataUrl, 'wardrobe_item');
            if (state.wardrobeEditingId && state.wardrobeEditingId !== 'new') {
                updateWardrobeItem(state.wardrobeEditingId, { path });
            } else {
                state.wardrobeTempPath = path;
            }
            renderWardrobeModal();
        } catch (error) {
            console.error('[BB Comic Forge] wardrobe upload failed', error);
            toastr.error(error?.message || String(error), 'Comic Forge');
        } finally {
            fileInput.value = '';
        }
    });
    form.querySelector('#bbcf-wardrobe-editor-cancel')?.addEventListener('click', () => {
        state.wardrobeEditingId = null;
        state.wardrobeTempPath = '';
        renderWardrobeModal();
    });
    form.querySelector('#bbcf-wardrobe-editor-describe')?.addEventListener('click', async () => {
        await describeWardrobeEditor(form);
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        saveWardrobeEditor(form);
        renderWardrobeModal();
    });
}

function updateReference(id, patch) {
    const settings = getSettings();
    const ref = settings.references.find(item => item.id === id);
    if (!ref) return;
    Object.assign(ref, patch);
    settings.referenceProfiles[getReferenceProfileKey()] = structuredClone(settings.references);
    saveSettings();
}

function updateWardrobeItem(id, patch) {
    const settings = getSettings();
    const item = settings.wardrobeItems.find(entry => entry.id === id);
    if (!item) return;
    Object.assign(item, patch);
    saveSettings();
}

function saveWardrobeEditor(form) {
    const settings = getSettings();
    const isNew = state.wardrobeEditingId === 'new';
    const id = isNew ? makeId('wardrobe-item') : state.wardrobeEditingId;
    const name = String(form.querySelector('#bbcf-wardrobe-editor-name')?.value || '').trim() || 'Новый образ';
    const item = {
        id,
        name,
        description: String(form.querySelector('#bbcf-wardrobe-editor-description')?.value || '').trim(),
        path: String(form.querySelector('#bbcf-wardrobe-editor-path')?.value || state.wardrobeTempPath || '').trim(),
        category: form.querySelector('#bbcf-wardrobe-editor-category')?.value || 'full',
        target: form.querySelector('#bbcf-wardrobe-editor-target')?.value || 'all',
        tags: String(form.querySelector('#bbcf-wardrobe-editor-tags')?.value || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 8),
        favorite: false,
        createdAt: Date.now(),
    };
    if (!WARDROBE_CATEGORIES[item.category]) item.category = 'full';
    if (!WARDROBE_TARGETS[item.target]) item.target = 'all';
    const index = settings.wardrobeItems.findIndex(entry => entry.id === id);
    if (index >= 0) {
        item.favorite = Boolean(settings.wardrobeItems[index].favorite);
        item.createdAt = settings.wardrobeItems[index].createdAt || item.createdAt;
        settings.wardrobeItems[index] = item;
    } else {
        settings.wardrobeItems.unshift(item);
    }
    state.wardrobeEditingId = null;
    state.wardrobeTempPath = '';
    saveSettings();
    refreshSettingsUi();
}

function equipWardrobeItem(id) {
    const settings = getSettings();
    const item = findWardrobeItem(settings, id);
    if (!item) return;
    const assignment = settings.wardrobeAssignments[state.wardrobeOwner] || normalizeWardrobeAssignment();
    if (['top', 'bottom', 'shoes'].includes(item.category)) {
        assignment.mode = 'parts';
        assignment.full = '';
    }
    if (item.category === 'full') {
        assignment.mode = 'full';
        assignment.top = '';
        assignment.bottom = '';
        assignment.shoes = '';
    }
    assignment[item.category] = assignment[item.category] === item.id ? '' : item.id;
    settings.wardrobeAssignments[state.wardrobeOwner] = assignment;
    persistWardrobeAssignments(settings);
    saveSettings();
    refreshSettingsUi();
}

function clearWardrobeSlot(category) {
    const settings = getSettings();
    const assignment = settings.wardrobeAssignments[state.wardrobeOwner] || normalizeWardrobeAssignment();
    if (WARDROBE_CATEGORIES[category]) {
        assignment[category] = '';
        settings.wardrobeAssignments[state.wardrobeOwner] = assignment;
        persistWardrobeAssignments(settings);
        saveSettings();
        refreshSettingsUi();
    }
}

function deleteWardrobeItem(id) {
    if (!id) return;
    const settings = getSettings();
    const item = findWardrobeItem(settings, id);
    if (!item) return;
    if (!confirm(`Удалить «${item.name}» из гардероба?`)) return;
    settings.wardrobeItems = settings.wardrobeItems.filter(entry => entry.id !== id);
    for (const assignment of Object.values(settings.wardrobeAssignments)) {
        for (const category of WARDROBE_CATEGORY_ORDER) {
            if (assignment?.[category] === id) assignment[category] = '';
        }
    }
    for (const assignments of Object.values(settings.wardrobeProfiles || {})) {
        for (const assignment of Object.values(assignments || {})) {
            for (const category of WARDROBE_CATEGORY_ORDER) {
                if (assignment?.[category] === id) assignment[category] = '';
            }
        }
    }
    persistWardrobeAssignments(settings);
    saveSettings();
    refreshSettingsUi();
}

function findWardrobeItem(settings, id) {
    if (!id) return null;
    return settings.wardrobeItems.find(item => item.id === id) || null;
}

function getFilteredWardrobeItems(settings, ownerId, category = 'all') {
    const ownerTarget = getTargetForOwner(ownerId);
    return settings.wardrobeItems
        .filter(item => getAllowedWardrobeCategories(settings.wardrobeAssignments?.[ownerId]?.mode || 'full').includes(item.category))
        .filter(item => category === 'all' || item.category === category)
        .filter(item => state.wardrobeTag === 'all' || (item.tags || []).includes(state.wardrobeTag))
        .filter(item => item.target === 'all' || item.target === ownerTarget)
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.createdAt || 0) - (a.createdAt || 0));
}

function getWardrobeTagsForOwner(settings, ownerId) {
    const ownerTarget = getTargetForOwner(ownerId);
    const allowed = getAllowedWardrobeCategories(settings.wardrobeAssignments?.[ownerId]?.mode || 'full');
    const tags = new Set();
    for (const item of settings.wardrobeItems) {
        if (!allowed.includes(item.category)) continue;
        if (item.target !== 'all' && item.target !== ownerTarget) continue;
        for (const tag of item.tags || []) tags.add(tag);
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

function getAllowedWardrobeCategories(mode) {
    return WARDROBE_MODE_CATEGORIES[mode === 'parts' ? 'parts' : 'full'];
}

function getWardrobeCategoryIcon(category) {
    if (category === 'full') return 'fa-user';
    if (category === 'top') return 'fa-shirt';
    if (category === 'bottom') return 'fa-table-cells-large';
    if (category === 'shoes') return 'fa-shoe-prints';
    if (category === 'accessories') return 'fa-gem';
    if (category === 'hair') return 'fa-scissors';
    return 'fa-shirt';
}

async function describeWardrobeEditor(form) {
    const button = form.querySelector('#bbcf-wardrobe-editor-describe');
    const textarea = form.querySelector('#bbcf-wardrobe-editor-description');
    const path = String(form.querySelector('#bbcf-wardrobe-editor-path')?.value || state.wardrobeTempPath || '').trim();
    const category = form.querySelector('#bbcf-wardrobe-editor-category')?.value || 'full';
    if (!path) {
        toastr.warning('Сначала добавь картинку вещи.', 'Comic Forge');
        return;
    }
    const originalHtml = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Описываю</span>';
    }
    try {
        const description = await describeWardrobeImage(path, category);
        if (description && textarea) {
            textarea.value = description;
            toastr.success('Описание готово.', 'Comic Forge');
        }
    } catch (error) {
        toastr.error(error?.message || String(error), 'Comic Forge');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalHtml;
        }
    }
}

async function describeWardrobeImage(path, category) {
    const settings = getSettings();
    if (!settings.apiKey) throw new Error('Для описания нужен API key.');
    const model = settings.model || getKnownModelsForProvider(settings.apiType)[0];
    if (!model && settings.apiType !== 'naistera') throw new Error('Выбери модель для описания.');
    const dataUrl = await fetchUrlAsDataUrl(path);
    const parsed = parseImageDataUrl(dataUrl);
    const prompt = getWardrobeDescriptionPrompt(category);
    if (settings.apiType === 'gemini') {
        const endpoint = settings.endpoint || 'https://generativelanguage.googleapis.com';
        const result = await fetchJson(normalizeGeminiGenerateUrl(endpoint, model), {
            method: 'POST',
            headers: geminiApiHeaders({ ...settings, endpoint }),
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: `image/${parsed.subtype}`, data: parsed.base64Data } },
                        { text: prompt },
                    ],
                }],
                generationConfig: { responseModalities: ['TEXT'], maxOutputTokens: 220 },
            }),
        });
        const text = (result?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('\n').trim();
        return cleanWardrobeDescription(text);
    }
    if (settings.apiType === 'openai-chat') {
        if (!settings.endpoint) throw new Error('Для OpenAI chat укажи endpoint.');
        const result = await fetchJson(`${normalizeOpenAiBase(settings.endpoint)}/chat/completions`, {
            method: 'POST',
            headers: imageApiHeaders(settings),
            body: JSON.stringify({
                model,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: dataUrl } },
                    ],
                }],
                max_tokens: 220,
                stream: false,
            }),
        });
        return cleanWardrobeDescription(result?.choices?.[0]?.message?.content || '');
    }
    throw new Error('Этот тип API не умеет описывать картинки. Используй Gemini или OpenAI chat.');
}

function getWardrobeDescriptionPrompt(category) {
    if (category === 'hair') {
        return 'Describe only the hairstyle in this image for an image generation prompt. Mention hair length, shape, styling, ornaments, and visible state. English only. Maximum 35 words. No preamble.';
    }
    if (category === 'accessories') {
        return 'Describe only the accessories in this image for an image generation prompt. Mention object type, material, color, placement, and style. English only. Maximum 45 words. No preamble.';
    }
    return 'Describe the visible outfit in this image for an image generation prompt. Mention garment names, fabric, fit, colors, details, accessories, and clothing condition. English only. Maximum 70 words. No preamble.';
}

function cleanWardrobeDescription(value) {
    const text = String(value || '')
        .replace(/^["'`\s]+|["'`\s]+$/g, '')
        .replace(/^(Here is|Here are|This image shows|The image shows|It shows|I see)\s*:?\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) throw new Error('API не вернул описание.');
    return text.slice(0, 700);
}

function getTargetForOwner(ownerId) {
    if (ownerId === 'char') return 'char';
    if (ownerId === 'user') return 'user';
    return 'npc';
}

function getWardrobeActiveItems(settings, ownerId) {
    const assignment = settings.wardrobeAssignments?.[ownerId] || normalizeWardrobeAssignment();
    const categories = assignment.mode === 'parts'
        ? ['top', 'bottom', 'shoes', 'accessories', 'hair']
        : ['full', 'accessories', 'hair'];
    return categories
        .map(category => findWardrobeItem(settings, assignment[category]))
        .filter(Boolean);
}

function getWardrobeActiveEntries(settings = getSettings()) {
    const entries = [];
    for (const owner of REFERENCE_SLOTS) {
        for (const item of getWardrobeActiveItems(settings, owner.id)) {
            entries.push({ owner, item });
        }
    }
    return entries;
}

function refreshSettingsUi() {
    document.getElementById(SETTINGS_ID)?.remove();
    createSettingsUi();
}

function bindSettingInput(root, selector, key, mode = 'value', after = null) {
    const input = root.querySelector(selector);
    if (!input) return;
    input.addEventListener('change', () => {
        const settings = getSettings();
        if (mode === 'checked') settings[key] = Boolean(input.checked);
        else if (mode === 'int') settings[key] = clampNumberInput(input, Number(input.value));
        else if (mode === 'seconds') settings[key] = Math.max(30, Number(input.value) || 180) * 1000;
        else if (mode === 'cooldownSeconds') settings[key] = Math.max(0, Number(input.value) || 0) * 1000;
        else settings[key] = input.value;
        const normalized = getSettings();
        if (mode === 'int') input.value = String(normalized[key]);
        else if (mode === 'seconds') input.value = String(Math.round(normalized[key] / 1000));
        else if (mode === 'cooldownSeconds') input.value = String(Math.round(normalized[key] / 1000));
        saveSettings();
        if (typeof after === 'function') after();
    });
    input.addEventListener('input', () => {
        if (mode === 'int') {
            const settings = getSettings();
            settings[key] = clampNumberInput(input, Number(input.value));
            input.value = String(getSettings()[key]);
            saveSettings();
        } else if (mode === 'seconds' || mode === 'cooldownSeconds') {
            const settings = getSettings();
            const seconds = clampNumberInput(input, Number(input.value) || (mode === 'seconds' ? 180 : 0));
            settings[key] = seconds * 1000;
            input.value = String(Math.round(getSettings()[key] / 1000));
            saveSettings();
        } else if (input.tagName === 'TEXTAREA' || input.type === 'text' || input.type === 'password') {
            const settings = getSettings();
            settings[key] = input.value;
            saveSettings();
        }
    });
}

function clampNumberInput(input, fallback = 0) {
    const min = input.min === '' ? Number.NEGATIVE_INFINITY : Number(input.min);
    const max = input.max === '' ? Number.POSITIVE_INFINITY : Number(input.max);
    return clampInt(input.value, Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY, Number.isFinite(max) ? max : Number.POSITIVE_INFINITY, fallback);
}

function syncProviderRows() {
    const settings = getSettings();
    const root = document.getElementById(SETTINGS_ID);
    if (!root) return;
    root.querySelectorAll('.bbcf-openai-row').forEach(node => node.classList.toggle('bbcf-hidden', settings.apiType !== 'openai-images'));
    root.querySelectorAll('.bbcf-naistera-row').forEach(node => node.classList.toggle('bbcf-hidden', settings.apiType !== 'naistera'));
    root.querySelectorAll('.bbcf-image-size-row').forEach(node => node.classList.toggle('bbcf-hidden', ['openai-images', 'onlysq-imagen', 'naistera'].includes(settings.apiType)));
    const endpoint = root.querySelector('#bbcf-endpoint');
    if (endpoint) endpoint.placeholder = getEndpointPlaceholder(settings.apiType);
    const note = root.querySelector('#bbcf-provider-note');
    if (note) note.textContent = getProviderNote(settings.apiType);
    updateModelPicker(root);
}

function syncDraftConnectionRows() {
    const settings = getSettings();
    const root = document.getElementById(SETTINGS_ID);
    if (!root) return;
    const external = settings.draftConnectionMode !== 'sillytavern';
    root.querySelectorAll('.bbcf-draft-connection-row').forEach(node => node.classList.toggle('bbcf-hidden', !external));
    const endpoint = root.querySelector('#bbcf-draft-endpoint');
    if (endpoint) endpoint.placeholder = getDraftEndpointPlaceholder(settings.draftConnectionMode);
    const model = root.querySelector('#bbcf-draft-model');
    if (model) model.placeholder = getDraftModelPlaceholder(settings.draftConnectionMode);
    const datalist = root.querySelector('#bbcf-draft-model-options');
    if (datalist) datalist.innerHTML = buildDraftModelOptionsHtml(settings);
    const note = root.querySelector('#bbcf-draft-connection-note');
    if (note) note.textContent = getDraftConnectionNote(settings.draftConnectionMode);
}

function option(value, selected, label = value) {
    return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function getStylePresetById(styleId, settings = getSettings()) {
    const id = String(styleId || '').trim();
    if (Object.hasOwn(STYLE_PRESETS, id)) return { id, ...STYLE_PRESETS[id], builtin: true };
    const savedId = id.startsWith('saved:') ? id.slice(6) : id;
    const saved = settings.savedStyles?.find(style => style.id === savedId);
    return saved ? { ...saved, id: `saved:${saved.id}`, builtin: false } : null;
}

function getLayoutPresetById(layoutId, settings = getSettings()) {
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
    const saved = settings.savedLayouts?.find(layout => layout.id === savedId);
    return saved ? { ...saved, id: `saved:${saved.id}`, builtin: false } : null;
}

function getBuiltinLayoutId(layoutId) {
    const id = String(layoutId || '').trim();
    return Object.hasOwn(ASPECT_PATTERNS, id) ? id : null;
}

function buildModelOptionsHtml(settings) {
    return getModelSuggestions(settings).map(model => `<option value="${escapeHtml(model)}"></option>`).join('');
}

function getModelSuggestions(settings = getSettings()) {
    const stored = filterModelNamesForProvider(Array.isArray(settings.availableModels) ? settings.availableModels : [], settings.apiType);
    return uniqueStrings([...stored, ...getKnownModelsForProvider(settings.apiType)]).slice(0, 120);
}

function getKnownModelsForProvider(apiType) {
    if (apiType === 'onlysq-imagen') return ['flux', 'grok'];
    if (apiType === 'openai-images') return ['gpt-image-1', 'dall-e-3', 'dall-e-2'];
    if (apiType === 'openai-chat') return ['gpt-image-1', 'grok-2-image', 'gemini-2.5-flash-image-preview', 'nano banana'];
    if (apiType === 'gemini') return ['gemini-2.5-flash-image-preview', 'gemini-2.0-flash-preview-image-generation'];
    if (apiType === 'naistera') return ['nano banana', 'grok', 'grok-pro', 'novelai'];
    return [];
}

function buildDraftModelOptionsHtml(settings) {
    return getDraftModelSuggestions(settings).map(model => `<option value="${escapeHtml(model)}"></option>`).join('');
}

function getDraftModelSuggestions(settings = getSettings()) {
    return filterDraftModelNames(Array.isArray(settings.availableDraftModels) ? settings.availableDraftModels : [], settings.draftConnectionMode);
}

function getDraftModelPlaceholder(mode) {
    if (mode === 'gemini') return 'Имя модели Gemini-compatible';
    if (mode === 'openai-chat') return 'Имя модели OpenAI-compatible';
    return 'используется модель SillyTavern';
}

function getEndpointPlaceholder(apiType) {
    if (apiType === 'onlysq-imagen') return ONLYSQ_IMAGEN_ENDPOINT;
    if (apiType === 'gemini') return 'https://generativelanguage.googleapis.com';
    if (apiType === 'openai-chat' || apiType === 'openai-images') return 'https://api.openai.com/v1';
    if (apiType === 'naistera') return 'https://naistera.org';
    return 'https://api.example.com';
}

function getDraftEndpointPlaceholder(mode) {
    if (mode === 'gemini') return 'https://generativelanguage.googleapis.com';
    if (mode === 'openai-chat') return 'https://api.openai.com/v1';
    return 'не требуется';
}

function getProviderNote(apiType) {
    if (apiType === 'onlysq-imagen') return 'OnlySQ ImaGen: быстрый режим через Flux и другие поддерживаемые модели. Обычно достаточно ключа и модели.';
    if (apiType === 'gemini') return 'Gemini хорошо подходит для референсов и образов. Gemini-compatible endpoint можно указывать базой, например /compatible.';
    if (apiType === 'openai-images') return 'OpenAI Images: генерация по тексту без референсов. OpenAI-compatible endpoint можно указывать как /v1 или просто базовый URL.';
    if (apiType === 'openai-chat') return 'OpenAI chat: режим для прокси, которые умеют возвращать изображения и читать референсы. OpenAI-compatible endpoint можно указывать базовым URL.';
    if (apiType === 'naistera') return 'Naistera использует отдельные поля model и preset ниже.';
    return '';
}

function getDraftConnectionNote(mode) {
    if (mode === 'sillytavern') return 'Используется текущая текстовая модель SillyTavern.';
    if (mode === 'openai-chat') return 'OpenAI-compatible /chat/completions.';
    if (mode === 'gemini') return 'Gemini-compatible generateContent.';
    return '';
}

function updateModelPicker(root = document.getElementById(SETTINGS_ID)) {
    if (!root) return;
    const settings = getSettings();
    const datalist = root.querySelector('#bbcf-model-options');
    if (datalist) datalist.innerHTML = buildModelOptionsHtml(settings);
    const input = root.querySelector('#bbcf-model');
    if (input) {
        input.placeholder = getKnownModelsForProvider(settings.apiType)[0] || 'model';
        if (input.value !== settings.model) input.value = settings.model || '';
    }
}

function buildStyleOptionsHtml(settings, selected) {
    const base = Object.entries(STYLE_PRESETS).map(([key, preset]) => option(key, selected, preset.label)).join('');
    const saved = settings.savedStyles.map(style => option(`saved:${style.id}`, selected, `★ ${style.label}`)).join('');
    return `${base}${saved}`;
}

function buildLayoutOptionsHtml(settings, selected) {
    const base = Object.entries({
        webtoon: 'Webtoon vertical',
        grid: 'Grid',
        cinematic: 'Cinematic',
        manga: 'Manga',
        dramatic: 'Dramatic',
    }).map(([key, label]) => option(key, selected, label)).join('');
    const saved = settings.savedLayouts.map(layout => option(`saved:${layout.id}`, selected, `★ ${layout.label}`)).join('');
    return `${base}${saved}`;
}

function buildStyleExamplesHtml(settings) {
    const saved = settings.savedStyles.map(style => ({ label: `★ ${style.label}`, prompt: style.prompt }));
    const examples = [...Object.values(STYLE_PRESETS).filter(preset => preset.prompt), ...saved].slice(0, 12);
    return `<div class="bbcf-preset-example-group"><strong>Стили</strong>${examples.map(item => `
        <div class="bbcf-preset-example"><span>${escapeHtml(item.label)}</span><p>${escapeHtml(item.prompt)}</p></div>
    `).join('')}</div>`;
}

function buildLayoutExamplesHtml(settings) {
    const saved = settings.savedLayouts.map(layout => ({
        label: `★ ${layout.label}`,
        pattern: layout.pattern,
        intent: layout.intent,
    }));
    const builtin = Object.keys(ASPECT_PATTERNS).map(key => ({
        label: key,
        pattern: ASPECT_PATTERNS[key],
        intent: describeLayoutIntent(key, 1, 4),
    }));
    return `<div class="bbcf-preset-example-group"><strong>Макеты</strong>${[...builtin, ...saved].slice(0, 12).map(item => `
        <div class="bbcf-layout-example">
            <span>${escapeHtml(item.label)}</span>
            <div>${item.pattern.slice(0, 6).map(ratio => `<b>${escapeHtml(ratio)}</b>`).join('')}</div>
            <p>${escapeHtml(item.intent || '')}</p>
        </div>
    `).join('')}</div>`;
}

function saveStyleFromSettings(root) {
    const settings = getSettings();
    const customPrompt = String(root.querySelector('#bbcf-custom-style')?.value || '').trim();
    const savedPrompt = String(root.querySelector('#bbcf-save-style-prompt')?.value || '').trim();
    const selectedStyle = getStylePresetById(settings.stylePreset, settings);
    const prompt = savedPrompt || customPrompt || selectedStyle?.prompt || '';
    if (!prompt) {
        toastr.warning('Добавь описание стиля или выбери готовый стиль.', 'Comic Forge');
        return;
    }
    const label = String(root.querySelector('#bbcf-save-style-name')?.value || '').trim() || `Мой стиль ${settings.savedStyles.length + 1}`;
    const style = { id: makeId('style'), label, prompt };
    settings.savedStyles.unshift(style);
    settings.stylePreset = `saved:${style.id}`;
    saveSettings();
    refreshSettingsUi();
    toastr.success('Стиль сохранён.', 'Comic Forge');
}

function saveLayoutFromSettings(root) {
    const settings = getSettings();
    const label = String(root.querySelector('#bbcf-save-layout-name')?.value || '').trim() || `Мой макет ${settings.savedLayouts.length + 1}`;
    const rawPattern = String(root.querySelector('#bbcf-save-layout-pattern')?.value || '').trim();
    const selectedLayout = getLayoutPresetById(settings.layout, settings);
    const pattern = rawPattern ? normalizeAspectPattern(rawPattern) : normalizeAspectPattern(selectedLayout?.pattern || '');
    const intent = String(root.querySelector('#bbcf-save-layout-intent')?.value || '').trim();
    const layout = { id: makeId('layout'), label, pattern, intent, singleAspect: pattern[0] || '3:4' };
    settings.savedLayouts.unshift(layout);
    settings.layout = `saved:${layout.id}`;
    saveSettings();
    refreshSettingsUi();
    toastr.success('Макет сохранён.', 'Comic Forge');
}

function saveStyleFromDraft(root) {
    const settings = getSettings();
    const customPrompt = String(root.querySelector('#bbcf-draft-custom-style')?.value || '').trim();
    const savedPrompt = String(root.querySelector('#bbcf-draft-save-style-prompt')?.value || '').trim();
    const currentStyle = getStylePresetById(valueOf(root, '#bbcf-draft-style') || settings.stylePreset, settings);
    const prompt = savedPrompt || customPrompt || currentStyle?.prompt || '';
    if (!prompt) {
        toastr.warning('Добавь описание стиля или выбери готовый стиль.', 'Comic Forge');
        return;
    }
    const label = String(root.querySelector('#bbcf-draft-save-style-name')?.value || '').trim() || `Мой стиль ${settings.savedStyles.length + 1}`;
    const style = { id: makeId('style'), label, prompt };
    settings.savedStyles.unshift(style);
    settings.stylePreset = `saved:${style.id}`;
    saveSettings();
    const select = root.querySelector('#bbcf-draft-style');
    if (select) {
        select.innerHTML = buildStyleOptionsHtml(settings, `saved:${style.id}`);
        select.value = `saved:${style.id}`;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    saveDraftFromModal(root);
    toastr.success('Стиль сохранён.', 'Comic Forge');
}

function saveLayoutFromDraft(root) {
    const settings = getSettings();
    const label = String(root.querySelector('#bbcf-draft-save-layout-name')?.value || '').trim() || `Мой макет ${settings.savedLayouts.length + 1}`;
    const rawPattern = String(root.querySelector('#bbcf-draft-save-layout-pattern')?.value || '').trim();
    const selectedLayout = getLayoutPresetById(valueOf(root, '#bbcf-draft-layout') || settings.layout, settings);
    const pattern = rawPattern ? normalizeAspectPattern(rawPattern) : normalizeAspectPattern(selectedLayout?.pattern || '');
    const intent = String(root.querySelector('#bbcf-draft-save-layout-intent')?.value || '').trim() || selectedLayout?.intent || describeLayoutIntent(selectedLayout?.id || settings.layout, 1, 4);
    const layout = { id: makeId('layout'), label, pattern, intent, singleAspect: pattern[0] || '3:4' };
    settings.savedLayouts.unshift(layout);
    settings.layout = `saved:${layout.id}`;
    saveSettings();
    const select = root.querySelector('#bbcf-draft-layout');
    if (select) {
        select.innerHTML = buildLayoutOptionsHtml(settings, `saved:${layout.id}`);
        select.value = `saved:${layout.id}`;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    saveDraftFromModal(root);
    toastr.success('Макет сохранён.', 'Comic Forge');
}

function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const text = String(value || '').trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
    }
    return result;
}

async function loadProviderModels({ button = null, silent = false } = {}) {
    const settings = getSettings();
    const previousHtml = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Подключаю...</span>';
    }
    try {
        if (!settings.apiKey && settings.apiType !== 'naistera') throw new Error('API key не настроен.');
        const models = await fetchProviderModels(settings);
        settings.availableModels = models.length ? models : getKnownModelsForProvider(settings.apiType);
        if (!settings.model && settings.availableModels.length) settings.model = settings.availableModels[0];
        saveSettings();
        updateModelPicker();
        if (!silent) {
            const count = settings.availableModels.length;
            toastr.success(count ? `Подключено. Найдено моделей: ${count}.` : 'Подключено.', 'Comic Forge');
        }
        return settings.availableModels;
    } catch (error) {
        if (!silent) toastr.error(error?.message || String(error), 'Comic Forge');
        throw error;
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = previousHtml;
        }
    }
}

async function loadDraftModels({ button = null, silent = false } = {}) {
    const settings = getSettings();
    const previousHtml = button?.innerHTML;
    if (settings.draftConnectionMode === 'sillytavern') {
        if (!silent) toastr.info('Для этого режима используется модель SillyTavern.', 'Comic Forge');
        return [];
    }
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Подключаю...</span>';
    }
    try {
        const models = await fetchDraftModels(settings);
        settings.availableDraftModels = models;
        if (!settings.draftModel && settings.availableDraftModels.length) settings.draftModel = settings.availableDraftModels[0];
        saveSettings();
        syncDraftConnectionRows();
        if (!silent) {
            const message = settings.availableDraftModels.length
                ? `Черновик подключён. Моделей: ${settings.availableDraftModels.length}.`
                : 'Список моделей недоступен. Модель можно вписать вручную.';
            toastr.success(message, 'Comic Forge');
        }
        return settings.availableDraftModels;
    } catch (error) {
        if (!silent) toastr.error(error?.message || String(error), 'Comic Forge');
        throw error;
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = previousHtml;
        }
    }
}

async function fetchProviderModels(settings) {
    if (settings.apiType === 'naistera') return getKnownModelsForProvider('naistera');
    if (settings.apiType === 'onlysq-imagen') {
        const result = await fetchJson(`${normalizeOnlySqBase(settings.endpoint)}/models`, {
            method: 'GET',
            headers: imageApiHeaders(settings),
        });
        return extractModelNames(result, settings.apiType);
    }
    if (settings.apiType.startsWith('openai')) {
        const result = await fetchJson(`${normalizeOpenAiBase(settings.endpoint)}/models`, {
            method: 'GET',
            headers: imageApiHeaders(settings),
        });
        return extractModelNames(result, settings.apiType);
    }
    if (settings.apiType === 'gemini') {
        const result = await fetchJson(normalizeGeminiModelsUrl(settings.endpoint), {
            method: 'GET',
            headers: geminiApiHeaders(settings),
        });
        return extractModelNames(result, settings.apiType);
    }
    return getKnownModelsForProvider(settings.apiType);
}

async function fetchDraftModels(settings) {
    const endpoint = settings.draftEndpoint || settings.endpoint;
    const apiKey = settings.draftApiKey || settings.apiKey;
    if (!endpoint) throw new Error('Endpoint черновика не настроен.');
    if (!apiKey) throw new Error('API key черновика не настроен.');
    if (settings.draftConnectionMode === 'openai-chat') {
        let result;
        try {
            result = await fetchJson(`${normalizeOpenAiBase(endpoint)}/models`, {
                method: 'GET',
                headers: draftApiHeaders(apiKey),
            });
        } catch (error) {
            if (isUnsupportedModelListError(error)) return [];
            throw error;
        }
        return filterDraftModelNames(extractModelNames(result, ''), settings.draftConnectionMode);
    }
    if (settings.draftConnectionMode === 'gemini') {
        const result = await fetchJson(normalizeGeminiModelsUrl(endpoint), {
            method: 'GET',
            headers: draftGeminiApiHeaders(endpoint, apiKey),
        });
        return filterDraftModelNames(extractModelNames(result, ''), settings.draftConnectionMode);
    }
    return [];
}

function isUnsupportedModelListError(error) {
    return /\bAPI (404|405|501)\b|method not allowed|not found|cannot get|unsupported/i.test(error?.message || '');
}

function extractModelNames(payload, apiType) {
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
            if (candidate) names.push(String(candidate).replace(/^models\//, ''));
            Object.values(value).forEach(visit);
        }
    };
    visit(payload?.data || payload?.models || payload);
    return filterModelNamesForProvider(names, apiType);
}

function filterModelNamesForProvider(names, apiType) {
    const all = uniqueStrings(names);
    if (apiType === 'onlysq-imagen') {
        const imageModels = all.filter(model => /flux|grok|imagen|image/i.test(model));
        return imageModels.length ? imageModels : getKnownModelsForProvider(apiType);
    }
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

function filterDraftModelNames(names, mode) {
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

function updateFloatingButton() {
    const settings = getSettings();
    let button = document.getElementById(FAB_ID);
    if (!settings.enabled || !settings.showFab) {
        button?.remove();
        return;
    }
    const host = findChatButtonHost();
    if (!button) {
        button = document.createElement('button');
        button.id = FAB_ID;
        button.type = 'button';
        button.title = 'BB Comic Forge';
        button.addEventListener('click', openForgeModal);
    }
    if (state.generating) {
        button.title = 'Comic Forge: генерация идёт';
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Comic</span>';
    } else if (state.pendingComic?.html && !state.pendingComic.sent) {
        button.title = 'Comic Forge: комикс готов';
        button.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Comic</span>';
    } else {
        button.title = 'BB Comic Forge';
        button.innerHTML = '<i class="fa-solid fa-book-open"></i><span>Comic</span>';
    }
    button.classList.toggle('bbcf-generating', state.generating);
    button.classList.toggle('bbcf-ready', Boolean(state.pendingComic?.html && !state.pendingComic.sent));
    button.classList.toggle('bbcf-chat-launcher', host !== document.body);
    if (button.parentElement !== host) host.appendChild(button);
}

function findChatButtonHost() {
    return document.querySelector('#leftSendForm')
        || document.querySelector('#rightSendForm')
        || document.querySelector('#send_but_sheld')
        || document.querySelector('#send_form .form_actions')
        || document.querySelector('#send_form')
        || document.querySelector('#form_sheld')
        || document.querySelector('#send_textarea')?.parentElement
        || document.body;
}

function openForgeModal(options = {}) {
    if (!getSettings().enabled) {
        toastr.warning('BB Comic Forge отключен в настройках.', 'Comic Forge');
        return;
    }
    if (state.modal?.isConnected) {
        state.modal.classList.remove('bbcf-minimized');
        state.modalMinimized = false;
        updateFloatingButton();
        return;
    }
    const startMinimized = options?.minimized === true;
    const settings = getSettings();
    const savedDraft = getSavedDraft(settings);
    const root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'bbcf-modal-root';
    root.innerHTML = `
        <div class="bbcf-modal-backdrop" data-bbcf-close></div>
        <div class="bbcf-modal" role="dialog" aria-modal="true">
            <header class="bbcf-modal-header">
                <h3 class="bbcf-modal-title"><i class="fa-solid fa-book-open"></i> BB Comic Forge <span class="bbcf-muted">standalone</span></h3>
                <div class="bbcf-modal-header-actions">
                    <button class="bbcf-modal-action bbcf-modal-minimize" type="button" title="Свернуть кузницу, генерация продолжится" aria-label="Свернуть кузницу" id="bbcf-modal-minimize"><i class="fa-solid fa-window-minimize"></i><span>Свернуть</span></button>
                    <button class="bbcf-modal-action bbcf-modal-dismiss" type="button" title="Закрыть окно кузницы" aria-label="Закрыть кузницу" data-bbcf-close><i class="fa-solid fa-xmark"></i><span>Закрыть</span></button>
                </div>
            </header>
            <div class="bbcf-modal-body">
                <form class="bbcf-form" id="bbcf-draft-form">
                    <div class="bbcf-grid-2">
                        <div class="bbcf-field">
                            <label for="bbcf-draft-mode">Режим генерации</label>
                            <select id="bbcf-draft-mode" class="text_pole">
                                ${option('panels', savedDraft.generationMode, 'Качественно: каждая панель отдельно')}
                                ${option('single', savedDraft.generationMode, 'Экономно: весь комикс одним запросом')}
                            </select>
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-draft-title">Название страницы</label>
                            <input id="bbcf-draft-title" class="text_pole" type="text" value="${escapeHtml(savedDraft.title)}">
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-field">
                            <label for="bbcf-draft-count">Панелей</label>
                            <input id="bbcf-draft-count" class="text_pole" type="number" min="1" max="${MAX_PANELS}" value="${savedDraft.panelCount}">
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-draft-layout">Макет</label>
                            <select id="bbcf-draft-layout" class="text_pole">
                                ${buildLayoutOptionsHtml(settings, savedDraft.layout)}
                            </select>
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-draft-style">Стиль</label>
                            <select id="bbcf-draft-style" class="text_pole">
                                ${buildStyleOptionsHtml(settings, savedDraft.stylePreset)}
                            </select>
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-field">
                            <label for="bbcf-draft-insert-mode">Отправка</label>
                            <select id="bbcf-draft-insert-mode" class="text_pole">
                                ${option('new', savedDraft.insertMode, 'Новым сообщением')}
                                ${option('append_last', savedDraft.insertMode, 'В последнее сообщение')}
                            </select>
                        </div>
                    </div>
                    <details class="bbcf-advanced">
                        <summary><i class="fa-solid fa-palette"></i><span>Заготовки стилей и макетов</span></summary>
                        <div class="bbcf-advanced-body bbcf-preset-examples">
                            ${buildStyleExamplesHtml(settings)}
                            ${buildLayoutExamplesHtml(settings)}
                            <div class="bbcf-preset-save-grid">
                                <div class="bbcf-preset-save-card">
                                    <b>Сохранить стиль</b>
                                    <input id="bbcf-draft-save-style-name" class="text_pole" type="text" placeholder="Название стиля">
                                    <textarea id="bbcf-draft-save-style-prompt" class="text_pole" rows="4" placeholder="Линия, цвет, свет, детализация, настроение."></textarea>
                                    <button class="menu_button" type="button" id="bbcf-draft-save-style"><i class="fa-solid fa-floppy-disk"></i><span>Сохранить стиль</span></button>
                                </div>
                                <div class="bbcf-preset-save-card">
                                    <b>Сохранить макет</b>
                                    <input id="bbcf-draft-save-layout-name" class="text_pole" type="text" placeholder="Название макета">
                                    <input id="bbcf-draft-save-layout-pattern" class="text_pole" type="text" placeholder="9:16, 1:1, 16:9, 3:4">
                                    <input id="bbcf-draft-save-layout-intent" class="text_pole" type="text" placeholder="Коротко: какой ритм у страницы">
                                    <button class="menu_button" type="button" id="bbcf-draft-save-layout"><i class="fa-solid fa-table-cells-large"></i><span>Сохранить макет</span></button>
                                </div>
                            </div>
                        </div>
                    </details>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-scene">Что происходит на странице</label>
                        <textarea id="bbcf-draft-scene" class="text_pole" rows="5" placeholder="Что должно произойти на странице. Можно писать по-русски.">${escapeHtml(savedDraft.scene)}</textarea>
                    </div>
                    <details class="bbcf-advanced">
                        <summary><i class="fa-solid fa-sliders"></i><span>Тонкая настройка панелей</span></summary>
                        <div class="bbcf-advanced-body">
                    <div class="bbcf-field">
                        <label for="bbcf-draft-lock">Описание персонажей</label>
                        <textarea id="bbcf-draft-lock" class="text_pole" rows="4">${escapeHtml(savedDraft.characterLock)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-notes">План панелей, по одной строке</label>
                        <textarea id="bbcf-draft-notes" class="text_pole" rows="5" placeholder="1. Общий план коридора&#10;2. Крупный план лица&#10;3. Комедийный insert">${escapeHtml(savedDraft.panelNotes)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-bubbles">Реплики для модели: panel | type | position | text</label>
                        <textarea id="bbcf-draft-bubbles" class="text_pole" rows="4" placeholder="1|speech|top-left|Ты правда это сказала?&#10;2|thought|bottom-right|Сердце сбилось с ритма">${escapeHtml(savedDraft.bubbles)}</textarea>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-field">
                            <label for="bbcf-draft-fanservice">Фан-сервис панели</label>
                            <input id="bbcf-draft-fanservice" class="text_pole" type="number" min="0" max="${MAX_PANELS}" value="${savedDraft.fanservicePanel}">
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-draft-sfx">SFX: panel | text</label>
                            <textarea id="bbcf-draft-sfx" class="text_pole" rows="2" placeholder="3|БАХ">${escapeHtml(savedDraft.sfx)}</textarea>
                        </div>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-custom-style">Дополнительные инструкции к генерации</label>
                        <textarea id="bbcf-draft-custom-style" class="text_pole" rows="3" placeholder="Разовые правки поверх выбранного стиля: свет, ракурс, темп, материалы.">${escapeHtml(savedDraft.customPrompt)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-negative">Negative Prompt</label>
                        <textarea id="bbcf-draft-negative" class="text_pole" rows="3">${escapeHtml(savedDraft.negativePrompt)}</textarea>
                    </div>
                        </div>
                    </details>
                    <div class="bbcf-toolbar">
                        <button class="menu_button" type="button" id="bbcf-ai-draft"><i class="fa-solid fa-scroll"></i><span>Черновик из чата</span></button>
                        <button class="menu_button bbcf-primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Сгенерировать страницу</span></button>
                    </div>
                </form>
                <div class="bbcf-preview">
                    <div class="bbcf-preview-actions">
                        <button class="menu_button bbcf-primary bbcf-hidden" type="button" id="bbcf-send-to-chat" title="Отправить текущий комикс в чат"><i class="fa-solid fa-paper-plane"></i><span>Отправить в чат</span></button>
                        <button class="menu_button" type="button" id="bbcf-save-page-image" title="Сохранить весь оформленный комикс одним PNG"><i class="fa-solid fa-file-image"></i><span>Сохранить PNG</span></button>
                        <button class="menu_button" type="button" id="bbcf-show-history" title="Показать последние созданные комиксы"><i class="fa-solid fa-images"></i><span>История</span></button>
                        <button class="menu_button bbcf-hidden" type="button" id="bbcf-close-history-preview"><i class="fa-solid fa-arrow-left"></i><span>К текущему превью</span></button>
                        <button class="menu_button" type="button" id="bbcf-clear-preview" title="Очистить текущее превью"><i class="fa-solid fa-eraser"></i><span>Очистить превью</span></button>
                    </div>
                    <div id="bbcf-history-panel" class="bbcf-history bbcf-hidden"></div>
                    <div id="bbcf-progress" class="bbcf-progress"></div>
                    <div id="bbcf-preview-content">
                        <p class="bbcf-hint">Готовая страница появится здесь.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(root);
    state.modal = root;
    root.querySelectorAll('[data-bbcf-close]').forEach(node => node.addEventListener('click', closeForgeModal));
    root.querySelector('#bbcf-modal-minimize')?.addEventListener('click', minimizeForgeModal);
    bindDraftPersistence(root);
    bindComicUtilityActions(root);
    renderComicHistory(root);
    if (state.pendingComic?.html && !state.pendingComic.sent) {
        const preview = root.querySelector('#bbcf-preview-content');
        if (preview) {
            preview.innerHTML = state.pendingComic.html;
            bindComicActions(preview);
            attachForgePreviewPanelControls(root);
        }
    }
    updateSendToChatButton(root);
    root.querySelector('#bbcf-ai-draft')?.addEventListener('click', async () => {
        await fillDraftFromAi(root);
    });
    root.querySelector('#bbcf-draft-save-style')?.addEventListener('click', () => saveStyleFromDraft(root));
    root.querySelector('#bbcf-draft-save-layout')?.addEventListener('click', () => saveLayoutFromDraft(root));
    root.querySelector('#bbcf-draft-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await handleGenerateFromModal(root);
    });
    if (startMinimized) {
        root.classList.add('bbcf-minimized');
        state.modalMinimized = true;
        updateFloatingButton();
    }
}

function ensureForgeModalForAutomation() {
    if (!state.modal?.isConnected) openForgeModal({ minimized: true });
    return state.modal;
}

function closeForgeModal() {
    if (state.generating) {
        toastr.info('Генерация еще идет. Можно свернуть кузницу и вернуться к чату.', 'Comic Forge');
        return;
    }
    if (state.modal?.isConnected) saveDraftFromModal(state.modal);
    state.modal?.remove();
    state.modal = null;
    state.modalMinimized = false;
    updateFloatingButton();
}

function minimizeForgeModal() {
    if (!state.modal?.isConnected) return;
    saveDraftFromModal(state.modal);
    state.modal.classList.add('bbcf-minimized');
    state.modalMinimized = true;
    updateFloatingButton();
}

async function handleGenerateFromModal(root) {
    if (state.generating) return;
    const draft = readDraftFromModal(root);
    if (!draft.scene.trim()) {
        toastr.warning('Опиши сцену для комикса.', 'Comic Forge');
        return;
    }
    try {
        state.generating = true;
        state.pendingComic = null;
        setHistoryPreviewMode(root, false);
        updateSendToChatButton(root);
        updateFloatingButton();
        saveDraftToSettings(draft);
        const html = await generateFromDraft(draft, {
            progressRoot: root.querySelector('#bbcf-progress'),
            previewRoot: root.querySelector('#bbcf-preview-content'),
        });
        state.pendingComic = { draft, html: makeShareHtml(html), sent: false };
        attachForgePreviewPanelControls(root);
        updateSendToChatButton(root);
        updateFloatingButton();
        toastr.success('Комикс готов. Проверь превью и отправь его в чат.', 'Comic Forge');
    } catch (error) {
        console.error('[BB Comic Forge] generation failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
    } finally {
        state.generating = false;
        updateSendToChatButton(root);
        updateFloatingButton();
    }
}

function readDraftFromModal(root) {
    return {
        title: valueOf(root, '#bbcf-draft-title') || 'Comic page',
        generationMode: valueOf(root, '#bbcf-draft-mode') || getSettings().generationMode,
        bubbleMode: 'model',
        insertMode: valueOf(root, '#bbcf-draft-insert-mode') || getSettings().insertMode,
        panelCount: clampInt(valueOf(root, '#bbcf-draft-count'), 1, MAX_PANELS, getSettings().panelCount),
        layout: valueOf(root, '#bbcf-draft-layout') || getSettings().layout,
        stylePreset: valueOf(root, '#bbcf-draft-style') || getSettings().stylePreset,
        scene: valueOf(root, '#bbcf-draft-scene'),
        characterLock: valueOf(root, '#bbcf-draft-lock'),
        panelNotes: valueOf(root, '#bbcf-draft-notes'),
        bubbles: valueOf(root, '#bbcf-draft-bubbles'),
        fanservicePanel: clampInt(valueOf(root, '#bbcf-draft-fanservice'), 0, MAX_PANELS, 0),
        sfx: valueOf(root, '#bbcf-draft-sfx'),
        customPrompt: valueOf(root, '#bbcf-draft-custom-style'),
        negativePrompt: valueOf(root, '#bbcf-draft-negative') || getSettings().negativePrompt,
    };
}

function getSavedDraft(settings = getSettings()) {
    const raw = settings.savedDraft && typeof settings.savedDraft === 'object' ? settings.savedDraft : {};
    return {
        title: String(raw.title || 'Comic page'),
        generationMode: ['panels', 'single'].includes(raw.generationMode) ? raw.generationMode : settings.generationMode,
        bubbleMode: 'model',
        insertMode: ['new', 'append_last'].includes(raw.insertMode) ? raw.insertMode : settings.insertMode,
        panelCount: clampInt(raw.panelCount, 1, MAX_PANELS, settings.panelCount),
        layout: getLayoutPresetById(raw.layout, settings) ? raw.layout : settings.layout,
        stylePreset: getStylePresetById(raw.stylePreset, settings) ? raw.stylePreset : settings.stylePreset,
        scene: String(raw.scene || ''),
        characterLock: String(raw.characterLock ?? settings.characterLock ?? ''),
        panelNotes: String(raw.panelNotes || ''),
        bubbles: String(raw.bubbles || ''),
        fanservicePanel: clampInt(raw.fanservicePanel, 0, MAX_PANELS, 0),
        sfx: String(raw.sfx || ''),
        customPrompt: String(raw.customPrompt ?? raw.customStyle ?? settings.customPrompt ?? settings.customStyle ?? ''),
        negativePrompt: String(raw.negativePrompt || settings.negativePrompt || DEFAULT_NEGATIVE_PROMPT),
    };
}

function saveDraftToSettings(draft) {
    const settings = getSettings();
    settings.savedDraft = {
        title: String(draft.title || 'Comic page'),
        generationMode: ['panels', 'single'].includes(draft.generationMode) ? draft.generationMode : settings.generationMode,
        bubbleMode: 'model',
        insertMode: ['new', 'append_last'].includes(draft.insertMode) ? draft.insertMode : settings.insertMode,
        panelCount: clampInt(draft.panelCount, 1, MAX_PANELS, settings.panelCount),
        layout: draft.layout || settings.layout,
        stylePreset: draft.stylePreset || settings.stylePreset,
        scene: String(draft.scene || ''),
        characterLock: String(draft.characterLock || ''),
        panelNotes: String(draft.panelNotes || ''),
        bubbles: String(draft.bubbles || ''),
        fanservicePanel: clampInt(draft.fanservicePanel, 0, MAX_PANELS, 0),
        sfx: String(draft.sfx || ''),
        customPrompt: String(draft.customPrompt ?? draft.customStyle ?? ''),
        negativePrompt: String(draft.negativePrompt || settings.negativePrompt || DEFAULT_NEGATIVE_PROMPT),
    };
    saveSettings();
}

function saveDraftFromModal(root) {
    if (!root?.isConnected) return;
    try {
        saveDraftToSettings(readDraftFromModal(root));
    } catch (error) {
        console.warn('[BB Comic Forge] draft autosave failed', error);
    }
}

function bindDraftPersistence(root) {
    const form = root.querySelector('#bbcf-draft-form');
    if (!form) return;
    const persist = event => {
        normalizeDraftNumberInput(event?.target);
        saveDraftFromModal(root);
    };
    form.addEventListener('input', persist);
    form.addEventListener('change', persist);
}

function normalizeDraftNumberInput(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'number') return;
    input.value = String(clampNumberInput(input, Number(input.value) || 0));
}

async function fillDraftFromAi(root, { throwErrors = false } = {}) {
    const button = root.querySelector('#bbcf-ai-draft');
    const previousHtml = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Черновик...';
    }
    try {
        const prompt = buildDraftPrompt(root);
        const raw = await runDraftPrompt(prompt);
        const draft = extractJsonObject(raw);
        applyAiDraft(root, draft);
        toastr.success('Черновик комикса собран.', 'Comic Forge');
    } catch (error) {
        console.error('[BB Comic Forge] draft generation failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
        if (throwErrors) throw error;
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = previousHtml;
        }
    }
}

function buildDraftPrompt(root) {
    const settings = getSettings();
    const recentChat = collectRecentChat(settings.contextMessages);
    const panelCount = clampInt(valueOf(root, '#bbcf-draft-count'), 1, MAX_PANELS, settings.panelCount);
    const characterLock = valueOf(root, '#bbcf-draft-lock') || settings.characterLock || '';
    return String(settings.draftPrompt || DEFAULT_DRAFT_PROMPT)
        .replaceAll('{{recent_chat}}', recentChat || 'No recent chat context is available.')
        .replaceAll('{{character_lock}}', characterLock || 'No character lock was provided.')
        .replaceAll('{{panel_count}}', String(panelCount));
}

async function runDraftPrompt(prompt) {
    const settings = getSettings();
    if (settings.draftConnectionMode === 'openai-chat') return runOpenAiDraftPrompt(prompt, settings);
    if (settings.draftConnectionMode === 'gemini') return runGeminiDraftPrompt(prompt, settings);
    return runQuietPrompt(prompt);
}

async function runOpenAiDraftPrompt(prompt, settings) {
    const endpoint = settings.draftEndpoint || settings.endpoint;
    const apiKey = settings.draftApiKey || settings.apiKey;
    const model = settings.draftModel || (settings.draftEndpoint || settings.draftApiKey ? '' : settings.model);
    if (!endpoint) throw new Error('Endpoint черновика не настроен.');
    if (!apiKey) throw new Error('API key черновика не настроен.');
    if (!model) throw new Error('Модель черновика не настроена.');
    const body = {
        model,
        messages: [
            { role: 'system', content: 'Return only valid JSON. No markdown. No commentary.' },
            { role: 'user', content: prompt },
        ],
        temperature: settings.draftTemperature,
        response_format: { type: 'json_object' },
        stream: false,
    };
    let result;
    try {
        result = await fetchJson(`${normalizeOpenAiBase(endpoint)}/chat/completions`, {
            method: 'POST',
            headers: draftApiHeaders(apiKey),
            body: JSON.stringify(body),
        });
    } catch (error) {
        if (!/response_format|json_object/i.test(error?.message || '')) throw error;
        const fallbackBody = { ...body };
        delete fallbackBody.response_format;
        result = await fetchJson(`${normalizeOpenAiBase(endpoint)}/chat/completions`, {
            method: 'POST',
            headers: draftApiHeaders(apiKey),
            body: JSON.stringify(fallbackBody),
        });
    }
    const text = extractTextFromChatResult(result);
    if (!text) throw new Error('API черновика не вернул текст.');
    return text;
}

async function runGeminiDraftPrompt(prompt, settings) {
    const endpoint = settings.draftEndpoint || settings.endpoint;
    const apiKey = settings.draftApiKey || settings.apiKey;
    const model = settings.draftModel || 'gemini-2.5-flash';
    if (!endpoint) throw new Error('Endpoint черновика не настроен.');
    if (!apiKey) throw new Error('API key черновика не настроен.');
    const result = await fetchJson(normalizeGeminiGenerateUrl(endpoint, model), {
        method: 'POST',
        headers: draftGeminiApiHeaders(endpoint, apiKey),
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nReturn only valid JSON. No markdown.` }] }],
            generationConfig: {
                temperature: settings.draftTemperature,
                responseMimeType: 'application/json',
            },
        }),
    });
    const text = extractTextFromGeminiResult(result);
    if (!text) throw new Error('API черновика не вернул текст.');
    return text;
}

async function runQuietPrompt(prompt) {
    const context = SillyTavern.getContext();
    if (typeof context.generateQuietPrompt === 'function') {
        return context.generateQuietPrompt(prompt);
    }
    if (typeof window.generateQuietPrompt === 'function') {
        return window.generateQuietPrompt(prompt);
    }
    throw new Error('generateQuietPrompt не найден в SillyTavern.');
}

function extractJsonObject(raw) {
    const text = String(raw || '').trim();
    const candidates = uniqueStrings([
        text,
        ...extractCodeFenceBodies(text),
        findBalancedJsonObject(text),
        text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
    ].filter(Boolean));
    for (const candidate of candidates) {
        for (const jsonText of [candidate, loosenDraftJson(candidate)]) {
            try {
                const parsed = JSON.parse(jsonText);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            } catch (error) {
                // Try the next candidate; models often wrap valid JSON in extra prose.
            }
        }
    }
    const sample = stripHtmlForError(text).slice(0, 220);
    throw new Error(`Модель не вернула пригодный JSON для черновика. Первые символы ответа: ${sample || 'пусто'}`);
}

function extractCodeFenceBodies(text) {
    const bodies = [];
    const regex = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text))) bodies.push(match[1].trim());
    return bodies;
}

function findBalancedJsonObject(text) {
    const source = String(text || '');
    const start = source.indexOf('{');
    if (start === -1) return '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    return '';
}

function loosenDraftJson(text) {
    return String(text || '')
        .trim()
        .replace(/^\uFEFF/, '')
        .replace(/^```(?:json|JSON)?\s*/, '')
        .replace(/\s*```$/, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, '$1');
}

function applyAiDraft(root, draft) {
    setValue(root, '#bbcf-draft-title', draft.title || 'Comic page');
    setValue(root, '#bbcf-draft-scene', draft.scene || '');
    if (draft.character_lock) setValue(root, '#bbcf-draft-lock', draft.character_lock);
    if (Array.isArray(draft.panel_notes)) {
        setValue(root, '#bbcf-draft-notes', draft.panel_notes.map((note, index) => `${index + 1}. ${note}`).join('\n'));
    }
    if (Array.isArray(draft.bubbles)) {
        const bubbleText = draft.bubbles.map((bubble) => {
            const panel = clampInt(bubble?.panel, 1, MAX_PANELS, 1);
            const type = normalizeBubbleType(bubble?.type);
            const position = normalizeBubblePosition(bubble?.position, 'top-left');
            return `${panel}|${type}|${position}|${bubble?.text || ''}`;
        }).filter(line => line.trim()).join('\n');
        setValue(root, '#bbcf-draft-bubbles', bubbleText);
    }
    if (Array.isArray(draft.sfx)) {
        const sfxText = draft.sfx.map(item => `${clampInt(item?.panel, 1, MAX_PANELS, 1)}|${item?.text || ''}`).join('\n');
        setValue(root, '#bbcf-draft-sfx', sfxText);
    }
    if (draft.fanservice_panel !== undefined) {
        setValue(root, '#bbcf-draft-fanservice', clampInt(draft.fanservice_panel, 0, MAX_PANELS, 0));
    }
}

function setValue(root, selector, value) {
    const input = root.querySelector(selector);
    if (!input) return;
    input.value = String(value ?? '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyDefaultPageSettingsToModal(root) {
    const settings = getSettings();
    setValue(root, '#bbcf-draft-mode', settings.generationMode);
    setValue(root, '#bbcf-draft-count', settings.panelCount);
    setValue(root, '#bbcf-draft-layout', settings.layout);
    setValue(root, '#bbcf-draft-style', settings.stylePreset);
    setValue(root, '#bbcf-draft-insert-mode', settings.insertMode);
    setValue(root, '#bbcf-draft-lock', settings.characterLock);
    setValue(root, '#bbcf-draft-custom-style', settings.customPrompt);
    setValue(root, '#bbcf-draft-negative', settings.negativePrompt);
}

function valueOf(root, selector) {
    return String(root.querySelector(selector)?.value || '');
}

async function generateFromDraft(draft, ui = {}) {
    validateGenerationSettings();
    const settings = getSettings();
    const plans = buildPanelPlans(draft);
    const mode = draft.generationMode || settings.generationMode;
    renderProgress(ui.progressRoot, mode === 'single' ? [{ number: 1, title: draft.title || 'Comic page' }] : plans);
    const html = mode === 'single'
        ? await generateSingleImageComic(draft, plans, ui)
        : await generatePanelComic(draft, plans, ui);
    if (ui.previewRoot) {
        ui.previewRoot.innerHTML = html;
        bindComicActions(ui.previewRoot);
    }
    return html;
}

async function generatePanelComic(draft, plans, ui = {}) {
    const settings = getSettings();
    const generated = [];
    const cooldown = settings.requestCooldownMs || 0;
    const providerCanReadImages = !['openai-images', 'onlysq-imagen'].includes(settings.apiType);
    const previousImageLimit = providerCanReadImages ? clampInt(settings.previousImageCount, 0, MAX_PREVIOUS_CONTEXT_IMAGES, 0) : 0;
    const historyContextPaths = getRecentComicImagePaths(previousImageLimit);
    const currentContextPaths = [];
    const concurrency = clampInt(settings.concurrency, 1, MAX_CONCURRENCY, DEFAULT_SETTINGS.concurrency);
    const useSequentialCooldown = cooldown > 0;
    const useCurrentPageContext = previousImageLimit > 0 && (useSequentialCooldown || concurrency <= 1);
    const worker = async (panel, index = 0) => {
        if (useSequentialCooldown && index > 0) {
            await waitWithProgress(cooldown, label => updateProgress(ui.progressRoot, panel.number, 'waiting', label));
        }
        updateProgress(ui.progressRoot, panel.number, 'running', 'Запрос отправлен');
        const stopTimer = startElapsedProgress(ui.progressRoot, panel.number, 'Генерация');
        try {
            const panelContext = previousImageLimit > 0
                ? uniqueStrings([...(useCurrentPageContext ? currentContextPaths : []), ...historyContextPaths]).slice(0, previousImageLimit)
                : [];
            const dataUrl = await generatePanelImage({ ...panel, previousImagePaths: panelContext }, status => updateProgress(ui.progressRoot, panel.number, 'running', status));
            stopTimer();
            updateProgress(ui.progressRoot, panel.number, 'running', 'Сохранение');
            const imagePath = await saveImageToFile(dataUrl, panel.number);
            if (useCurrentPageContext) {
                currentContextPaths.push(imagePath);
                while (currentContextPaths.length > previousImageLimit) currentContextPaths.shift();
            }
            generated[panel.number - 1] = { ...panel, imagePath };
            updateProgress(ui.progressRoot, panel.number, 'done', 'Готово');
        } catch (error) {
            stopTimer();
            generated[panel.number - 1] = { ...panel, error: error?.message || String(error) };
            updateProgress(ui.progressRoot, panel.number, 'error', error?.message || 'Ошибка');
        }
    };
    if (useSequentialCooldown) {
        for (const [index, panel] of plans.entries()) await worker(panel, index);
    } else {
        await runQueue(plans, concurrency, panel => worker(panel, panel.number - 1), (panel, error) => {
            generated[panel.number - 1] = { ...panel, error: error?.message || String(error) };
            updateProgress(ui.progressRoot, panel.number, 'error', error?.message || 'Ошибка');
        });
    }
    return buildComicHtml(draft, generated.filter(Boolean));
}

async function generateSingleImageComic(draft, plans, ui = {}) {
    const settings = getSettings();
    const providerCanReadImages = !['openai-images', 'onlysq-imagen'].includes(settings.apiType);
    const previousImageLimit = providerCanReadImages ? clampInt(settings.previousImageCount, 0, MAX_PREVIOUS_CONTEXT_IMAGES, 0) : 0;
    const panel = {
        ...buildSinglePagePanel(draft, plans),
        previousImagePaths: getRecentComicImagePaths(previousImageLimit),
    };
    updateProgress(ui.progressRoot, 1, 'running', 'Запрос одной страницей');
    const stopTimer = startElapsedProgress(ui.progressRoot, 1, 'Генерация');
    try {
        const dataUrl = await generatePanelImage(panel, status => updateProgress(ui.progressRoot, 1, 'running', status));
        stopTimer();
        updateProgress(ui.progressRoot, 1, 'running', 'Сохранение');
        const imagePath = await saveImageToFile(dataUrl, 0);
        updateProgress(ui.progressRoot, 1, 'done', 'Готово');
        return buildSingleComicHtml(draft, { ...panel, imagePath });
    } catch (error) {
        stopTimer();
        updateProgress(ui.progressRoot, 1, 'error', error?.message || 'Ошибка');
        return buildSingleComicHtml(draft, { ...panel, error: error?.message || String(error) });
    }
}

function buildPanelPlans(draft) {
    const notes = splitLines(draft.panelNotes);
    const bubbleMap = parseBubbles(draft.bubbles);
    const sfxMap = parseSfx(draft.sfx);
    const stylePrompt = buildStylePrompt(draft.stylePreset, draft.customPrompt ?? draft.customStyle);
    const layout = draft.layout || getSettings().layout;
    const panelCount = clampInt(draft.panelCount, 1, MAX_PANELS, getSettings().panelCount);
    const recentContext = collectRecentChat(getSettings().contextMessages);
    const referenceLock = buildReferencePromptBlock();
    const wardrobeLock = buildWardrobePromptBlock();
    const plans = [];
    for (let index = 0; index < panelCount; index++) {
        const number = index + 1;
        const aspectRatio = getAspectForPanel(layout, index);
        const beat = normalizePanelNote(notes[index]) || DEFAULT_PANEL_BEATS[index % DEFAULT_PANEL_BEATS.length];
        const fanservice = draft.fanservicePanel === number
            ? 'This is the single dedicated fanservice panel for the page. Keep it tasteful and non-explicit, focused on elegant pose, clothing, silhouette, hips, waist, legs, neckline, or graceful body language without nudity or graphic sexual content.'
            : '';
        const panelBubbles = bubbleMap.get(number) || [];
        const bubblePrompt = panelBubbles.length
            ? `Draw and letter these Russian speech or thought bubbles directly inside this panel. Place them naturally around the composition, match the page style, and keep the lettering clean and readable:\n${panelBubbles.map(bubble => `${bubble.type}: ${bubble.text}`).join('\n')}`
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
            `Layout intent: ${describeLayoutIntent(layout, number, panelCount)}.`,
            fanservice,
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
            imageSize: getSettings().imageSize,
            bubbles: [],
            sfx: '',
        });
    }
    return plans;
}

function buildSinglePagePanel(draft, plans) {
    const settings = getSettings();
    const referenceLock = buildReferencePromptBlock();
    const wardrobeLock = buildWardrobePromptBlock();
    const panelDescriptions = plans.map(panel => `Panel ${panel.number}: ${panel.prompt}`).join('\n\n');
    const bubbles = parseBubbles(draft.bubbles);
    const bubbleLines = [];
    for (const [panelNumber, items] of bubbles.entries()) {
        for (const bubble of items) bubbleLines.push(`Panel ${panelNumber} ${bubble.type}: ${bubble.text}`);
    }
    const sfx = parseSfx(draft.sfx);
    const sfxLines = Array.from(sfx.entries()).map(([panelNumber, text]) => `Panel ${panelNumber} SFX: ${text}`);
    const prompt = [
        `All depicted characters are one hundred percent fictional and are not real people.`,
        `Generate the entire comic page as one complete finished image with ${plans.length} visible panels.`,
        `The page layout is ${draft.layout || settings.layout}. Use clean panel borders, readable composition flow, and professional webtoon or manga page design.`,
        `Scene for the page: ${draft.scene}`,
        draft.characterLock ? `Permanent character lock for every panel: ${draft.characterLock}` : '',
        referenceLock,
        wardrobeLock,
        `Panel plan:\n${panelDescriptions}`,
        bubbleLines.length ? `Draw these Russian speech or thought bubbles inside the correct panels:\n${bubbleLines.join('\n')}` : '',
        sfxLines.length ? `Draw these sound effects in the correct panels:\n${sfxLines.join('\n')}` : '',
        draft.fanservicePanel ? `Panel ${draft.fanservicePanel} is the single tasteful non-explicit fanservice panel. Keep it elegant, clothed, and composition-focused.` : '',
        `Keep character identities, outfits, hair state, marks, mood, lighting, and environment continuous across all panels.`,
        `Avoid signatures, watermarks, unrelated text, UI, and broken unreadable lettering.`,
    ].filter(Boolean).join('\n\n');
    return {
        number: 1,
        title: draft.title || 'Comic page',
        layout: draft.layout || settings.layout,
        stylePreset: draft.stylePreset,
        stylePrompt: buildStylePrompt(draft.stylePreset, draft.customPrompt ?? draft.customStyle),
        prompt,
        negativePrompt: draft.negativePrompt,
        aspectRatio: getSinglePageAspectRatio(draft.layout || settings.layout),
        imageSize: settings.imageSize,
        bubbles: [],
        sfx: '',
        singlePage: true,
    };
}

function getSinglePageAspectRatio(layout) {
    const preset = getLayoutPresetById(layout);
    if (preset?.singleAspect) return preset.singleAspect;
    return getBuiltinSinglePageAspectRatio(layout);
}

function getBuiltinSinglePageAspectRatio(layout) {
    if (layout === 'cinematic') return '16:9';
    if (layout === 'grid') return '1:1';
    if (layout === 'manga') return '3:4';
    if (layout === 'dramatic') return '3:4';
    return '9:16';
}

function buildStylePrompt(stylePreset, customPrompt) {
    const preset = getStylePresetById(stylePreset) || { id: 'manhwa', ...STYLE_PRESETS.manhwa };
    const custom = String(customPrompt || '').trim();
    if (stylePreset === 'custom') return custom || STYLE_PRESETS.manhwa.prompt;
    return [preset.prompt, custom].filter(Boolean).join('\n');
}

function normalizePanelNote(line) {
    return String(line || '').replace(/^\s*\d+[.)-]?\s*/, '').trim();
}

function describeLayoutIntent(layout, number, total) {
    const preset = getLayoutPresetById(layout);
    if (preset && !preset.builtin) return preset.intent || 'custom saved comic layout with the saved panel rhythm and clear reading flow';
    if (layout === 'webtoon') return 'vertical webtoon reading flow with spacious composition and clear emotional rhythm';
    if (layout === 'grid') return 'balanced comic grid panel with stable framing and readable action';
    if (layout === 'cinematic') return number === 1 || number === total ? 'wide cinematic anchor shot' : 'supporting cinematic detail shot';
    if (layout === 'manga') return 'manga page rhythm with varied panel energy, sharp eye flow, and bold insert composition';
    if (layout === 'dramatic') return 'dramatic broken-border comic feeling, strong silhouette, diagonal energy, and heightened emotion';
    return 'clean comic panel composition';
}

function getAspectForPanel(layout, index) {
    const preset = getLayoutPresetById(layout);
    const pattern = preset?.pattern || ASPECT_PATTERNS.webtoon;
    return pattern[index % pattern.length] || '1:1';
}

function splitLines(text) {
    return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function parseBubbles(text) {
    const map = new Map();
    let autoIndex = 0;
    for (const line of splitLines(text)) {
        const parts = line.split('|').map(part => part.trim());
        let panel = 1;
        let type = 'speech';
        let position = BUBBLE_POSITIONS[autoIndex % BUBBLE_POSITIONS.length];
        let bubbleText = line;
        if (parts.length >= 4) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeBubbleType(parts[1]);
            position = normalizeBubblePosition(parts[2], position);
            bubbleText = parts.slice(3).join('|').trim();
        } else if (parts.length === 3) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeBubbleType(parts[1]);
            bubbleText = parts[2];
        } else if (parts.length === 2) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            bubbleText = parts[1];
        }
        if (!bubbleText) continue;
        if (!map.has(panel)) map.set(panel, []);
        map.get(panel).push({ type, position, text: bubbleText });
        autoIndex++;
    }
    return map;
}

function parseSfx(text) {
    const map = new Map();
    for (const line of splitLines(text)) {
        const parts = line.split('|').map(part => part.trim());
        if (parts.length >= 2) {
            const panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            map.set(panel, parts.slice(1).join('|'));
        }
    }
    return map;
}

function normalizeBubbleType(value) {
    const type = String(value || '').toLowerCase();
    return ['speech', 'thought', 'shout', 'whisper'].includes(type) ? type : 'speech';
}

function normalizeBubblePosition(value, fallback) {
    const position = String(value || '').toLowerCase();
    return BUBBLE_POSITIONS.includes(position) ? position : fallback;
}

async function runQueue(items, concurrency, worker, onError) {
    let next = 0;
    let firstError = null;
    async function runWorker() {
        while (next < items.length && !firstError) {
            const item = items[next++];
            try {
                await worker(item);
            } catch (error) {
                firstError = error;
                if (typeof onError === 'function') onError(item, error);
            }
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, runWorker);
    await Promise.all(workers);
    if (firstError) throw firstError;
}

function renderProgress(root, plans) {
    if (!root) return;
    root.innerHTML = plans.map(panel => `
        <div class="bbcf-progress-row" data-panel="${panel.number}" data-state="idle">
            <b>Panel ${panel.number}</b>
            <div class="bbcf-progress-bar"><span></span></div>
            <span class="bbcf-progress-label">Ожидает</span>
        </div>
    `).join('');
}

function updateProgress(root, panelNumber, stateName, label) {
    if (!root) return;
    const row = root.querySelector(`.bbcf-progress-row[data-panel="${panelNumber}"]`);
    if (!row) return;
    row.dataset.state = stateName;
    const labelEl = row.querySelector('.bbcf-progress-label');
    if (labelEl) labelEl.textContent = label || stateName;
}

function startElapsedProgress(root, panelNumber, prefix) {
    const startedAt = Date.now();
    const timer = setInterval(() => {
        const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        updateProgress(root, panelNumber, 'running', `${prefix}: ${seconds} sec`);
    }, 1000);
    return () => clearInterval(timer);
}

async function waitWithProgress(ms, onTick) {
    const total = Math.max(0, Number(ms) || 0);
    if (!total) return;
    const startedAt = Date.now();
    while (Date.now() - startedAt < total) {
        const left = Math.ceil((total - (Date.now() - startedAt)) / 1000);
        if (typeof onTick === 'function') onTick(`КД перед запросом: ${left} sec`);
        await delay(Math.min(1000, total - (Date.now() - startedAt)));
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

async function generatePanelImage(panel, onStatus = null) {
    const settings = getSettings();
    if (typeof onStatus === 'function') onStatus('Запрос');
    const references = ['openai-images', 'onlysq-imagen'].includes(settings.apiType) ? [] : await collectReferenceImages(panel.previousImagePaths);
    if (settings.apiType === 'onlysq-imagen') return generateOnlySqImage(panel);
    if (settings.apiType === 'openai-images') return generateOpenAiImage(panel);
    if (settings.apiType === 'openai-chat') return generateOpenAiChatImage(panel, references);
    if (settings.apiType === 'gemini') return generateGeminiImage(panel, references);
    if (settings.apiType === 'naistera') return generateNaisteraImage(panel, references);
    throw new Error(`Unknown API type: ${settings.apiType}`);
}

function validateGenerationSettings() {
    const settings = getSettings();
    if (!settings.endpoint && !['naistera', 'onlysq-imagen'].includes(settings.apiType)) throw new Error('Endpoint не настроен.');
    if (!settings.apiKey) throw new Error('API key не настроен.');
    if (settings.apiType !== 'naistera' && !settings.model) throw new Error('Модель не настроена.');
}

async function collectReferenceImages(previousImagePaths = []) {
    const settings = getSettings();
    const refs = settings.references
        .filter(ref => ref.enabled && ref.path)
        .slice(0, 5);
    const loaded = [];
    for (const ref of refs) {
        try {
            const dataUrl = await fetchUrlAsDataUrl(ref.path);
            const parsed = parseImageDataUrl(dataUrl);
            loaded.push({
                id: ref.id,
                label: ref.label,
                name: ref.name,
                dataUrl,
                base64: parsed.base64Data,
                mimeType: `image/${parsed.subtype}`,
            });
        } catch (error) {
            console.warn('[BB Comic Forge] reference skipped', ref.path, error);
        }
    }
    if (settings.wardrobeEnabled && settings.wardrobeSendImages) {
        loaded.push(...await collectWardrobeReferenceImages());
    }
    const previous = await collectPreviousContextReferenceImages(previousImagePaths);
    const baseLimit = Math.max(0, 5 - previous.length);
    return [...loaded.slice(0, baseLimit), ...previous].slice(0, 5);
}

async function collectWardrobeReferenceImages() {
    const settings = getSettings();
    if (!settings.wardrobeEnabled || !settings.wardrobeSendImages) return [];
    const outfits = getWardrobeActiveEntries(settings).filter(entry => entry.item.path);
    const loaded = [];
    for (const { owner, item } of outfits) {
        try {
            const dataUrl = await fetchUrlAsDataUrl(item.path);
            const parsed = parseImageDataUrl(dataUrl);
            loaded.push({
                id: `wardrobe_${owner.id}_${item.id}`,
                label: `${owner.label} outfit`,
                name: `${owner.label} ${item.name || ''}`.trim(),
                dataUrl,
                base64: parsed.base64Data,
                mimeType: `image/${parsed.subtype}`,
                kind: 'wardrobe',
            });
        } catch (error) {
            console.warn('[BB Comic Forge] wardrobe reference skipped', item, error);
        }
    }
    return loaded;
}

async function collectPreviousContextReferenceImages(paths = []) {
    const uniquePaths = uniqueStrings(paths).slice(0, MAX_PREVIOUS_CONTEXT_IMAGES);
    const loaded = [];
    for (const path of uniquePaths) {
        try {
            const dataUrl = await fetchUrlAsDataUrl(path);
            const parsed = parseImageDataUrl(dataUrl);
            loaded.push({
                id: `previous_${loaded.length + 1}`,
                label: `Previous comic image ${loaded.length + 1}`,
                name: 'previous comic continuity reference',
                dataUrl,
                base64: parsed.base64Data,
                mimeType: `image/${parsed.subtype}`,
                kind: 'previous',
            });
        } catch (error) {
            console.warn('[BB Comic Forge] previous context image skipped', path, error);
        }
    }
    return loaded;
}

function buildReferencePromptBlock() {
    const settings = getSettings();
    const refs = settings.references
        .filter(ref => ref.enabled && (ref.description || ref.name))
        .map(ref => {
            const name = ref.name || ref.label;
            const description = ref.description || 'Use the uploaded reference image as the visual anchor when it is available.';
            return `${ref.label}${name && name !== ref.label ? `, ${name}` : ''}: ${description}`;
        });
    if (!refs.length) return '';
    return `Character and NPC reference notes for text injection. Use these notes even when the current image API cannot read reference images:\n${refs.join('\n')}`;
}

function buildWardrobePromptBlock() {
    const settings = getSettings();
    if (!settings.wardrobeEnabled || !settings.wardrobeSendDescription) return '';
    const outfits = getWardrobeActiveEntries(settings).filter(entry => entry.item.description);
    if (!outfits.length) return '';
    const lines = outfits.map(({ owner, item }) => `${owner.label}, ${item.name}: ${item.description}`);
    return `Wardrobe lock from BB Comic Forge. Keep these outfits unchanged when the matching character or NPC appears:\n${lines.join('\n')}`;
}

function buildFullPrompt(panel) {
    const parts = [
        panel.stylePrompt,
        panel.prompt,
        panel.negativePrompt ? `Negative prompt: ${panel.negativePrompt}` : '',
    ];
    return parts.filter(Boolean).join('\n\n');
}

function buildReferenceInstruction(references) {
    if (!references.length) return '';
    const lines = references.map((ref, index) => {
        const name = ref.name || ref.label || `reference ${index + 1}`;
        if (ref.kind === 'wardrobe') {
            return `Reference image ${index + 1} shows ${name}. Preserve this outfit faithfully when that character appears. Use it as clothing reference only, not pose reference.`;
        }
        if (ref.kind === 'previous') {
            return `Reference image ${index + 1} is a recent Comic Forge output. Use it for continuity of character identity, clothing state, rendering style, lighting, and environment. Do not copy the exact pose or composition unless the current panel asks for it.`;
        }
        return `Reference image ${index + 1} is ${name}. Preserve this character or visual anchor faithfully when it appears in the panel.`;
    });
    return `${lines.join('\n')}\nUse the reference images only for their own subjects. Do not mix identities, clothing, markings, or facial features between characters.`;
}

async function generateOnlySqImage(panel) {
    const settings = getSettings();
    const result = await fetchJson(normalizeOnlySqImagenEndpoint(settings.endpoint), {
        method: 'POST',
        headers: imageApiHeaders(settings),
        body: JSON.stringify({
            model: settings.model || 'flux',
            prompt: buildFullPrompt(panel),
            ratio: panel.aspectRatio || '1:1',
        }),
    });
    const found = extractImageFromOnlySqResponse(result);
    if (!found) throw new Error('OnlySQ response did not contain image data.');
    return /^https?:\/\//i.test(found) ? fetchUrlAsDataUrl(found) : found;
}

async function generateOpenAiImage(panel) {
    const settings = getSettings();
    const url = `${normalizeOpenAiBase(settings.endpoint)}/images/generations`;
    const body = {
        model: settings.model,
        prompt: `${buildFullPrompt(panel)}\n\nAspect ratio target: ${panel.aspectRatio}.`,
        size: settings.openaiSize || '1024x1024',
        quality: settings.openaiQuality || 'standard',
        response_format: 'b64_json',
        n: 1,
    };
    const result = await fetchJson(url, {
        method: 'POST',
        headers: imageApiHeaders(settings),
        body: JSON.stringify(body),
    });
    const image = result?.data?.[0];
    if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
    if (image?.url) return fetchUrlAsDataUrl(image.url);
    throw new Error('OpenAI images response did not contain image data.');
}

async function generateOpenAiChatImage(panel, references = []) {
    const settings = getSettings();
    const url = `${normalizeOpenAiBase(settings.endpoint)}/chat/completions`;
    const fullPrompt = `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}\n\n[aspect_ratio: ${panel.aspectRatio}] [image_size: ${panel.imageSize || settings.imageSize}]`;
    const imageParts = references.map(ref => ({ type: 'image_url', image_url: { url: ref.dataUrl } }));
    const result = await fetchJson(url, {
        method: 'POST',
        headers: imageApiHeaders(settings),
        body: JSON.stringify({
            model: settings.model,
            messages: [{ role: 'user', content: [{ type: 'text', text: fullPrompt }, ...imageParts] }],
            modalities: ['image', 'text'],
            stream: false,
        }),
    });
    const found = extractImageFromChatResponse(result);
    if (!found) throw new Error('OpenAI chat response did not contain image data.');
    return /^https?:\/\//i.test(found) ? fetchUrlAsDataUrl(found) : found;
}

async function generateGeminiImage(panel, references = []) {
    const settings = getSettings();
    const url = normalizeGeminiGenerateUrl(settings.endpoint, settings.model);
    const aspectRatio = settings.aspectRatio === 'auto' ? panel.aspectRatio : settings.aspectRatio;
    const imageSize = VALID_IMAGE_SIZES.includes(panel.imageSize) ? panel.imageSize : settings.imageSize;
    const requestParts = [
        ...references.map(ref => ({ inlineData: { mimeType: ref.mimeType || 'image/jpeg', data: ref.base64 } })),
        { text: `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}` },
    ];
    const body = {
        contents: [{ role: 'user', parts: requestParts }],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio, imageSize },
        },
    };
    const result = await fetchJson(url, {
        method: 'POST',
        headers: geminiApiHeaders(settings),
        body: JSON.stringify(body),
    });
    const parts = result?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        if (part.inlineData?.data) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        if (part.inline_data?.data) return `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`;
    }
    throw new Error('Gemini response did not contain image data.');
}

async function generateNaisteraImage(panel, references = []) {
    const settings = getSettings();
    const endpoint = normalizeNaisteraEndpoint(settings.endpoint);
    const aspectRatio = settings.naisteraAspectRatio === 'auto' ? panel.aspectRatio : settings.naisteraAspectRatio;
    const result = await fetchJson(endpoint, {
        method: 'POST',
        headers: imageApiHeaders(settings),
        body: JSON.stringify({
            prompt: `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}`,
            model: settings.naisteraModel || 'nano banana',
            aspect_ratio: aspectRatio,
            preset: settings.naisteraPreset || undefined,
            reference_images: references.map(ref => ref.dataUrl).slice(0, 5),
            reference_labels: references.map(ref => ref.name || ref.label || 'reference').slice(0, 5),
        }),
    });
    if (result?.data_url) return result.data_url;
    throw new Error('Naistera response did not contain data_url.');
}

function imageApiHeaders(settings) {
    return {
        'Authorization': `Bearer ${settings.apiKey || ''}`,
        'Content-Type': 'application/json',
    };
}

function draftApiHeaders(apiKey) {
    return {
        'Authorization': `Bearer ${apiKey || ''}`,
        'Content-Type': 'application/json',
    };
}

function geminiApiHeaders(settings) {
    const endpoint = String(settings.endpoint || '');
    if (endpoint.includes('generativelanguage.googleapis.com')) {
        return {
            'x-goog-api-key': settings.apiKey || '',
            'Content-Type': 'application/json',
        };
    }
    return imageApiHeaders(settings);
}

function draftGeminiApiHeaders(endpoint, apiKey) {
    if (String(endpoint || '').includes('generativelanguage.googleapis.com')) {
        return {
            'x-goog-api-key': apiKey || '',
            'Content-Type': 'application/json',
        };
    }
    return draftApiHeaders(apiKey);
}

function normalizeOpenAiBase(rawEndpoint) {
    let base = String(rawEndpoint || '').trim().replace(/\/+$/, '');
    base = base.replace(/\/(chat\/completions|images\/generations|models)$/i, '');
    if (/api\.onlysq\.ru\/ai\/openai(?:\/v\d+(?:\.\d+)?)?$/i.test(base)) {
        return base.replace(/\/v\d+(?:\.\d+)?$/i, '');
    }
    if (!/\/v\d+(?:\.\d+)?$/i.test(base)) base += '/v1';
    return base;
}

function normalizeOnlySqImagenEndpoint(rawEndpoint) {
    const raw = String(rawEndpoint || ONLYSQ_IMAGEN_ENDPOINT).trim() || ONLYSQ_IMAGEN_ENDPOINT;
    let base = raw.replace(/\/+$/, '');
    base = base.replace(/\/(openai|v1|v2|models|chat\/completions|images\/generations)$/i, '');
    if (/\/imagen$/i.test(base)) return base;
    if (/\/ai$/i.test(base)) return `${base}/imagen`;
    if (/api\.onlysq\.ru$/i.test(base)) return `${base}/ai/imagen`;
    return `${base}/ai/imagen`;
}

function normalizeOnlySqBase(rawEndpoint) {
    return normalizeOnlySqImagenEndpoint(rawEndpoint).replace(/\/imagen$/i, '');
}

function normalizeGeminiGenerateUrl(rawEndpoint, model) {
    let base = String(rawEndpoint || '').trim().replace(/\/+$/, '');
    if (/:(generateContent|streamGenerateContent)$/i.test(base)) return base;
    base = base.replace(/\/v1beta\/models\/[^/]+$/i, '');
    if (/\/v1beta$/i.test(base)) return `${base}/models/${encodeURIComponent(model)}:generateContent`;
    return `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function normalizeGeminiModelsUrl(rawEndpoint) {
    let base = String(rawEndpoint || 'https://generativelanguage.googleapis.com').trim().replace(/\/+$/, '');
    base = base.replace(/\/v1beta\/models\/[^/]+(?::generateContent|:streamGenerateContent)?$/i, '');
    base = base.replace(/\/v1beta\/models$/i, '');
    if (/\/v1beta$/i.test(base)) return `${base}/models`;
    return `${base}/v1beta/models`;
}

function normalizeNaisteraEndpoint(rawEndpoint) {
    const base = String(rawEndpoint || 'https://naistera.org').trim().replace(/\/+$/, '');
    return /\/api\/generate$/i.test(base) ? base : `${base}/api/generate`;
}

async function fetchJson(url, options) {
    const settings = getSettings();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(formatApiError(response.status, text, url));
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error(`API returned invalid JSON: ${stripHtmlForError(text).slice(0, 220)}`);
        }
    } finally {
        clearTimeout(timeout);
    }
}

function formatApiError(status, body, url = '') {
    const message = stripHtmlForError(body).slice(0, 500) || 'empty response';
    if (status === 404 && /api\.onlysq\.ru/i.test(url) && !/\/ai\/openai/i.test(url)) {
        return `API 404: OnlySQ ImaGen должен идти в ${ONLYSQ_IMAGEN_ENDPOINT}, не в /ai/ как OpenAI Images. Сейчас запрос был: ${url}`;
    }
    if (status === 429) return `API 429: лимит запросов или очередь провайдера. Подожди немного или снизь параллельность до 1. ${message}`;
    return `API ${status}: ${message}`;
}

function stripHtmlForError(value) {
    return String(value || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractImageFromOnlySqResponse(result) {
    const fromValue = value => {
        if (!value) return null;
        if (typeof value === 'string') {
            if (/^data:image\//i.test(value)) return value;
            if (/^https?:\/\//i.test(value)) return value;
            if (/^[A-Za-z0-9+/=\s]{120,}$/.test(value)) return `data:image/png;base64,${value.replace(/\s+/g, '')}`;
            return null;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = fromValue(item);
                if (found) return found;
            }
            return null;
        }
        if (typeof value === 'object') {
            return fromValue(value.b64_json)
                || fromValue(value.base64)
                || fromValue(value.data)
                || fromValue(value.url)
                || fromValue(value.image)
                || fromValue(value.file)
                || fromValue(value.files)
                || fromValue(value.images)
                || fromValue(value.output);
        }
        return null;
    };
    return fromValue(result?.files) || fromValue(result?.data) || fromValue(result);
}

function extractImageFromChatResponse(result) {
    const message = result?.choices?.[0]?.message;
    if (message) {
        if (Array.isArray(message.images) && message.images.length) {
            const image = message.images[0];
            if (image?.image_url?.url) return image.image_url.url;
            if (image?.url) return image.url;
            if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
            if (typeof image === 'string') return image;
        }
        if (Array.isArray(message.content)) {
            for (const part of message.content) {
                if (part?.type === 'image_url' && part.image_url?.url) return part.image_url.url;
                if (part?.type === 'image' && part.source?.data) return `data:${part.source.media_type || 'image/png'};base64,${part.source.data}`;
            }
        }
        if (typeof message.content === 'string') {
            const dataUrl = message.content.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
            if (dataUrl) return dataUrl[0];
            const markdownUrl = message.content.match(/!\[[^\]]*]\((https?:\/\/[^)]+|data:image\/[^)]+)\)/);
            if (markdownUrl) return markdownUrl[1];
            const url = message.content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i);
            if (url) return url[0];
        }
        if (message.image_url?.url) return message.image_url.url;
    }
    if (Array.isArray(result?.data) && result.data.length) {
        if (result.data[0]?.b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;
        if (result.data[0]?.url) return result.data[0].url;
    }
    return null;
}

function extractTextFromChatResult(result) {
    const message = result?.choices?.[0]?.message;
    const content = message?.content ?? result?.choices?.[0]?.text ?? result?.text ?? '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            if (typeof part?.content === 'string') return part.content;
            return '';
        }).filter(Boolean).join('\n');
    }
    return '';
}

function extractTextFromGeminiResult(result) {
    const parts = result?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(part => part.text || '').filter(Boolean).join('\n');
    return text || result?.text || '';
}

async function fetchUrlAsDataUrl(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Image URL fetch failed: ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Image URL conversion failed.'));
        reader.readAsDataURL(blob);
    });
}

function parseImageDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
    if (!match) throw new Error('Image provider returned unsupported image payload.');
    const subtype = match[1].toLowerCase();
    const normalizedFormat = subtype === 'jpg' ? 'jpeg' : subtype;
    return { subtype, normalizedFormat, base64Data: match[2].trim() };
}

async function convertDataUrlToPng(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas 2D unavailable.'));
                return;
            }
            ctx.drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = () => reject(new Error('Failed to decode generated image.'));
        image.src = dataUrl;
    });
}

async function saveImageToFile(dataUrl, panelNumber = 0) {
    const context = SillyTavern.getContext();
    let parsed = parseImageDataUrl(dataUrl);
    if (!UPLOAD_ALLOWED_FORMATS.has(parsed.normalizedFormat)) {
        parsed = parseImageDataUrl(await convertDataUrlToPng(dataUrl));
    }
    const characterName = getCurrentCharacterName() || 'comic_forge';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `bbcf_p${panelNumber || 0}_${timestamp}`;
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            image: parsed.base64Data,
            format: parsed.normalizedFormat,
            ch_name: characterName,
            filename,
        }),
    });
    if (!response.ok) {
        const raw = await response.text().catch(() => '');
        throw new Error(raw || `Upload failed: ${response.status}`);
    }
    const result = await response.json();
    if (!result?.path) throw new Error('Upload response did not contain image path.');
    return result.path;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
        reader.readAsDataURL(file);
    });
}

async function saveReferenceImageToFile(dataUrl, slotId) {
    const context = SillyTavern.getContext();
    let parsed = parseImageDataUrl(dataUrl);
    if (!UPLOAD_ALLOWED_FORMATS.has(parsed.normalizedFormat)) {
        parsed = parseImageDataUrl(await convertDataUrlToPng(dataUrl));
    }
    const safeSlot = String(slotId || 'ref').replace(/[^a-z0-9_-]/gi, '_').slice(0, 24);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            image: parsed.base64Data,
            format: parsed.normalizedFormat,
            ch_name: 'bbcf_refs',
            filename: `bbcf_ref_${safeSlot}_${timestamp}`,
        }),
    });
    if (!response.ok) {
        const raw = await response.text().catch(() => '');
        throw new Error(raw || `Upload failed: ${response.status}`);
    }
    const result = await response.json();
    if (!result?.path) throw new Error('Upload response did not contain image path.');
    return result.path;
}

function buildComicHtml(draft, panels) {
    const pageId = makeId('bbcf-page');
    const safeLayout = getBuiltinLayoutId(draft.layout) || 'webtoon';
    const panelHtml = panels.map(panel => buildPanelHtml(panel, safeLayout)).join('\n');
    return `<comics>
<div class="bbcf-comics-artifact" style="${comicArtifactStyle()}">
<div class="bbcf-comic-page bbcf-layout-${safeLayout}" data-bbcf-page="${escapeHtml(pageId)}" style="${comicPageStyle()}">
  <div class="bbcf-comic-title" style="${comicTitleStyle()}"><strong>${escapeHtml(draft.title || 'Comic page')}</strong></div>
  <div class="bbcf-page-grid" style="${comicGridStyle(safeLayout)}">
${panelHtml}
  </div>
</div>
</div>
</comics>`;
}

function buildSingleComicHtml(draft, panel) {
    const pageId = makeId('bbcf-page');
    const html = buildPanelHtml({ ...panel, number: 1, title: draft.title || panel.title || 'Comic page' }, 'single');
    return `<comics>
<div class="bbcf-comics-artifact" style="${comicArtifactStyle()}">
<div class="bbcf-comic-page bbcf-layout-single" data-bbcf-page="${escapeHtml(pageId)}" style="${comicPageStyle()}">
  <div class="bbcf-comic-title" style="${comicTitleStyle()}"><strong>${escapeHtml(draft.title || 'Comic page')}</strong></div>
  <div class="bbcf-page-grid" style="${comicGridStyle('single')}">
${html}
  </div>
</div>
</div>
</comics>`;
}

function buildPanelHtml(panel, layout = 'webtoon') {
    const instruction = encodeJsonAttr({
        prompt: panel.prompt,
        stylePrompt: panel.stylePrompt,
        negativePrompt: panel.negativePrompt,
        aspectRatio: panel.aspectRatio,
        imageSize: panel.imageSize,
        title: panel.title,
        panelNumber: panel.number,
        singlePage: Boolean(panel.singlePage),
    });
    if (panel.error || !panel.imagePath) {
        return `    <figure class="bbcf-panel bbcf-panel-error" data-bbcf-panel="${panel.number}" data-bbcf-instruction="${instruction}" style="${panelStyle(layout, panel.number)}; min-height:180px; display:grid; place-items:center; border-style:dashed;">
      <div class="bbcf-panel-error-body" style="display:grid; gap:10px; justify-items:center; max-width:92%; padding:16px; color:#f4d6d6; text-align:center;">
        <b>Panel ${panel.number}</b>
        <span style="color:#f0a8a8; font-size:0.84rem; line-height:1.35; overflow-wrap:anywhere;">${escapeHtml(panel.error || 'Панель не сгенерировалась.')}</span>
        <button type="button" class="menu_button bbcf-panel-retry" data-bbcf-regen="1"><i class="fa-solid fa-rotate"></i><span>Повторить</span></button>
      </div>
    </figure>`;
    }
    const bubbles = panel.bubbles.map((bubble, index) => `
      <div class="bbcf-bubble ${escapeHtml(bubble.type)}" data-pos="${escapeHtml(bubble.position)}" style="${bubbleStyle(bubble, index)}">${escapeHtml(bubble.text)}</div>`).join('');
    const sfx = panel.sfx ? `\n      <div class="bbcf-sfx" style="${sfxStyle()}">${escapeHtml(panel.sfx)}</div>` : '';
    return `    <figure class="bbcf-panel" data-bbcf-panel="${panel.number}" style="${panelStyle(layout, panel.number)}">
      <img src="${escapeHtml(panel.imagePath)}" alt="${escapeHtml(panel.title)} panel ${panel.number}" loading="lazy" style="${panelImageStyle()}">
      ${bubbles}${sfx}
    </figure>`;
}

function comicArtifactStyle() {
    return 'display:block; width:100%; max-width:100%; min-width:0; box-sizing:border-box;';
}

function comicPageStyle() {
    return [
        'display:block',
        'width:100%',
        'max-width:760px',
        'margin:28px auto',
        'padding:clamp(10px, 2.4vw, 18px)',
        'border:1px solid rgba(24,18,12,0.22)',
        'border-radius:8px',
        'background:#f1eadc',
        'box-shadow:0 18px 42px rgba(0,0,0,0.32)',
        'box-sizing:border-box',
        'overflow:visible',
    ].join('; ');
}

function comicTitleStyle() {
    return [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'gap:12px',
        'margin:0 0 12px',
        'color:#17120c',
        'font-size:1rem',
        'letter-spacing:0',
        'text-align:center',
        'box-sizing:border-box',
    ].join('; ');
}

function comicGridStyle(layout) {
    const columns = {
        single: '1fr',
        webtoon: '1fr',
        grid: 'repeat(2, minmax(0, 1fr))',
        cinematic: 'repeat(6, minmax(0, 1fr))',
        manga: 'repeat(5, minmax(0, 1fr))',
        dramatic: 'repeat(12, minmax(0, 1fr))',
    }[layout] || '1fr';
    return `display:grid; grid-template-columns:${columns}; gap:8px; align-items:start; width:100%; max-width:100%; min-width:0; box-sizing:border-box;`;
}

function panelStyle(layout, number = 1) {
    const extra = getPanelPlacementStyle(layout, number);
    return [
        'position:relative',
        'display:block',
        'width:100%',
        'min-width:0',
        'min-height:0',
        'max-width:100%',
        'height:auto',
        'aspect-ratio:auto',
        'grid-row:auto',
        'align-self:start',
        'justify-self:stretch',
        'margin:0',
        'overflow:hidden',
        'border:3px solid #15120d',
        'border-radius:4px',
        'background:#fffaf0',
        'isolation:isolate',
        'box-sizing:border-box',
        ...extra,
    ].join('; ');
}

function getPanelPlacementStyle(layout, number = 1) {
    const extra = [];
    const columns = getLayoutColumnCount(layout);
    const span = getPanelColumnSpan(layout, number);
    if (span && columns > 1) {
        extra.push(span >= columns ? 'grid-column:1 / -1' : `grid-column:span ${span}`);
    } else if (layout === 'cinematic') {
        extra.push(number === 1 || number === 4 ? 'grid-column:1 / -1' : 'grid-column:span 3');
    } else if (layout === 'manga') {
        if (number === 1) extra.push('grid-column:span 3');
        else if (number === 4) extra.push('grid-column:1 / -1');
        else extra.push('grid-column:span 2');
    } else if (layout === 'dramatic') {
        extra.push(number === 1 ? 'grid-column:1 / -1' : 'grid-column:span 6');
    }
    return extra;
}

function getPanelLayoutFromElement(figure) {
    const page = figure?.closest?.('.bbcf-comic-page');
    const layoutClass = Array.from(page?.classList || []).find(item => item.startsWith('bbcf-layout-'));
    return layoutClass ? layoutClass.replace('bbcf-layout-', '') : 'webtoon';
}

function getLayoutColumnCount(layout) {
    return {
        grid: 2,
        cinematic: 6,
        manga: 5,
        dramatic: 12,
    }[layout] || 1;
}

function getPanelColumnSpan(layout, number = 1) {
    if (layout === 'grid') return 1;
    if (layout === 'cinematic') return number === 1 || number === 4 ? 6 : 3;
    if (layout === 'manga') {
        if (number === 1) return 3;
        if (number === 4) return 5;
        return 2;
    }
    if (layout === 'dramatic') return number === 1 ? 12 : 6;
    return 0;
}

function panelImageStyle() {
    return 'display:block; width:100%; height:auto; max-width:100%; min-width:0; border:0; object-fit:contain; object-position:center; box-sizing:border-box;';
}

function bubbleStyle(bubble, index) {
    const position = {
        'top-left': 'top:8%; left:5%;',
        'top-right': 'top:8%; right:5%;',
        'bottom-left': 'bottom:9%; left:5%;',
        'bottom-right': 'right:5%; bottom:9%;',
    }[bubble.position] || 'top:8%; left:5%;';
    const type = String(bubble.type || 'speech');
    const typeStyle = type === 'thought'
        ? 'border-radius:34px; border-style:dashed;'
        : type === 'shout'
            ? 'border-radius:8px 20px 8px 20px; background:#fff5b8; transform:rotate(-1deg);'
            : type === 'whisper'
                ? 'background:rgba(235,246,255,0.9); color:#243140; font-weight:600;'
                : '';
    return [
        'position:absolute',
        'z-index:3',
        'max-width:min(76%, 310px)',
        'padding:8px 11px',
        'border:2px solid #0b0d12',
        'border-radius:18px',
        'background:rgba(255,255,255,0.94)',
        'color:#111318',
        'box-shadow:0 5px 0 rgba(0,0,0,0.18)',
        'font:700 0.92rem/1.18 system-ui, sans-serif',
        'letter-spacing:0',
        'box-sizing:border-box',
        position,
        typeStyle,
        bubbleOffsetStyle(index),
    ].filter(Boolean).join('; ');
}

function sfxStyle() {
    return [
        'position:absolute',
        'z-index:2',
        'right:7%',
        'bottom:8%',
        'color:#fff',
        'text-shadow:3px 3px 0 #0b0d12, -2px 2px 0 #ff4f8c',
        'transform:rotate(-8deg)',
        'font:900 2rem/1 system-ui, sans-serif',
        'letter-spacing:0',
    ].join('; ');
}

function bubbleOffsetStyle(index) {
    if (index === 0) return '';
    const shift = Math.min(18, index * 7);
    return `transform: translateY(${shift}px);`;
}

async function insertComicIntoChat(html, mode = 'new', targetMessageId = null) {
    const context = SillyTavern.getContext();
    if (!Array.isArray(context.chat)) throw new Error('Чат не открыт.');
    if (mode === 'append_last' && context.chat.length) {
        const messageId = Number.isInteger(targetMessageId) ? targetMessageId : context.chat.length - 1;
        const message = context.chat[messageId];
        if (message && !message.is_user) {
            message.mes = `${String(message.mes || '').trim()}\n\n${html}`.trim();
            if (message.extra?.display_text) {
                message.extra.display_text = `${String(message.extra.display_text || '').trim()}\n\n${html}`.trim();
            }
            updateMessageBlock(messageId, message);
            cleanupRenderedComics(document.getElementById('chat') || document.body);
            await eventSource.emit(event_types.MESSAGE_UPDATED, messageId);
            await saveCurrentChat(context);
            return messageId;
        }
    }
    const message = {
        name: getCurrentCharacterName() || 'Comic Forge',
        is_user: false,
        is_system: false,
        send_date: new Date().toISOString(),
        mes: html,
        extra: {
            from: MODULE_NAME,
        },
    };
    context.chat.push(message);
    const messageId = context.chat.length - 1;
    await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId);
    addOneMessage(message);
    cleanupRenderedComics(document.getElementById('chat') || document.body);
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId);
    await saveCurrentChat(context);
    return messageId;
}

function rememberComic(draft, html, messageId = null) {
    const settings = getSettings();
    const cleanHtml = makeShareHtml(html);
    const imagePaths = extractImagePathsFromHtml(cleanHtml);
    const record = {
        id: makeId('bbcf-comic'),
        title: String(draft.title || 'Comic page'),
        createdAt: new Date().toISOString(),
        mode: draft.generationMode || settings.generationMode,
        layout: draft.layout || settings.layout,
        imagePaths,
        imageFolder: getCommonImageFolder(imagePaths),
        html: cleanHtml,
        messageId,
    };
    settings.comicHistory = [record, ...(settings.comicHistory || [])].slice(0, MAX_COMIC_HISTORY);
    state.lastComic = record;
    saveSettings();
    return record;
}

function makeShareHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('[data-bbcf-instruction]').forEach(node => {
        if (!node.classList.contains('bbcf-panel-error')) node.removeAttribute('data-bbcf-instruction');
    });
    doc.querySelectorAll('.bbcf-panel-action').forEach(node => node.remove());
    doc.querySelectorAll('.bbcf-comic-title span').forEach(span => {
        const text = span.textContent?.trim() || '';
        if (/^(?:single image|\d+\s+panels?)$/i.test(text)) span.remove();
    });
    return doc.body.innerHTML.trim();
}

function extractImagePathsFromHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return Array.from(doc.querySelectorAll('img'))
        .map(img => img.getAttribute('src') || '')
        .filter(Boolean);
}

function getCommonImageFolder(paths) {
    if (!paths?.length) return '';
    const first = String(paths[0] || '');
    const slash = first.lastIndexOf('/');
    if (slash === -1) return '';
    const folder = first.slice(0, slash);
    return paths.every(path => String(path || '').startsWith(`${folder}/`)) ? folder : '';
}

function getRecentComicImagePaths(count = getSettings().previousImageCount) {
    const max = clampInt(count, 0, MAX_PREVIOUS_CONTEXT_IMAGES, 0);
    if (!max) return [];
    const settings = getSettings();
    const paths = [];
    for (const record of settings.comicHistory || []) {
        const recordPaths = Array.isArray(record.imagePaths) && record.imagePaths.length
            ? record.imagePaths
            : extractImagePathsFromHtml(record.html || '');
        for (const path of recordPaths) {
            if (path && !paths.includes(path)) paths.push(path);
            if (paths.length >= max) return paths;
        }
    }
    return paths;
}

function bindComicUtilityActions(root) {
    root.querySelector('#bbcf-send-to-chat')?.addEventListener('click', async () => {
        await sendPendingComicToChat(root);
    });
    root.querySelector('#bbcf-save-page-image')?.addEventListener('click', async () => {
        await savePreviewPageImage(root);
    });
    root.querySelector('#bbcf-show-history')?.addEventListener('click', () => {
        const panel = root.querySelector('#bbcf-history-panel');
        if (!panel) return;
        panel.classList.toggle('bbcf-hidden');
        renderComicHistory(root);
    });
    root.querySelector('#bbcf-close-history-preview')?.addEventListener('click', () => {
        restoreCurrentPreview(root);
    });
    root.querySelector('#bbcf-clear-preview')?.addEventListener('click', () => {
        clearForgePreview(root);
    });
}

async function sendPendingComicToChat(root, { targetMessageId = null } = {}) {
    if (!state.pendingComic?.html) {
        toastr.info('Сначала сгенерируй комикс в кузнице.', 'Comic Forge');
        return;
    }
    const button = root.querySelector('#bbcf-send-to-chat');
    const previousHtml = button?.innerHTML;
    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Отправляю...</span>';
        }
        const previewHtml = root.querySelector('#bbcf-preview-content')?.innerHTML || state.pendingComic.html;
        const html = makeShareHtml(previewHtml);
        const insertMode = state.pendingComic.draft?.insertMode || getSettings().insertMode;
        const messageId = await insertComicIntoChat(html, insertMode, targetMessageId);
        const record = rememberComic(state.pendingComic.draft || readDraftFromModal(root), html, messageId);
        state.lastComic = record;
        state.pendingComic = { ...state.pendingComic, html, sent: true };
        renderComicHistory(root);
        bindComicActions(document.getElementById('chat') || document.body);
        updateSendToChatButton(root);
        updateFloatingButton();
        toastr.success('Комикс добавлен в чат.', 'Comic Forge');
    } catch (error) {
        console.error('[BB Comic Forge] chat send failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = previousHtml;
        }
    }
}

async function savePreviewPageImage(root) {
    const button = root.querySelector('#bbcf-save-page-image');
    const previousHtml = button?.innerHTML;
    try {
        const page = root.querySelector('#bbcf-preview-content .bbcf-comic-page');
        if (!page) {
            toastr.info('Сначала сгенерируй или открой комикс в превью.', 'Comic Forge');
            return;
        }
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Сохраняю...</span>';
        }
        const dataUrl = await renderComicPageToPng(page);
        const path = await saveImageToFile(dataUrl, 'page');
        showSavedPageImageNotice(root, path);
        toastr.success('Полный комикс сохранён как PNG.', 'Comic Forge');
    } catch (error) {
        console.error('[BB Comic Forge] page export failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = previousHtml;
        }
    }
}

async function renderComicPageToPng(page) {
    await waitForImages(page);
    const rect = page.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(page.scrollWidth || page.offsetWidth || rect.width));
    const height = Math.max(1, Math.ceil(page.scrollHeight || page.offsetHeight || rect.height));
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.bbcf-panel-action, .bbcf-regen-status').forEach(node => node.remove());
    clone.style.margin = '0';
    clone.style.width = `${width}px`;
    clone.style.maxWidth = `${width}px`;
    clone.style.boxShadow = getComputedStyle(page).boxShadow || clone.style.boxShadow;
    await inlineCloneImages(clone);
    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.style.width = `${width}px`;
    wrapper.style.minHeight = `${height}px`;
    wrapper.style.margin = '0';
    wrapper.style.padding = '0';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.background = 'transparent';
    wrapper.appendChild(clone);
    const serialized = new XMLSerializer().serializeToString(wrapper);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
}

async function waitForImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(img => {
        if (img.complete && img.naturalWidth) return Promise.resolve();
        return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });
    }));
}

async function inlineCloneImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    for (const img of images) {
        const src = img.getAttribute('src') || '';
        if (!src || /^data:image\//i.test(src)) continue;
        try {
            img.setAttribute('src', await fetchUrlAsDataUrl(src));
        } catch (error) {
            console.warn('[BB Comic Forge] export image inline failed', src, error);
        }
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Не удалось отрендерить комикс в PNG. Браузер мог заблокировать HTML-to-canvas.'));
        image.src = src;
    });
}

function showSavedPageImageNotice(root, path) {
    const preview = root.querySelector('#bbcf-preview-content');
    if (!preview || !path) return;
    preview.querySelectorAll('.bbcf-export-notice').forEach(node => node.remove());
    const notice = document.createElement('div');
    notice.className = 'bbcf-export-notice';
    notice.innerHTML = `<i class="fa-solid fa-file-image"></i><span>PNG сохранён:</span> <a href="${escapeHtml(path)}" target="_blank" rel="noopener">${escapeHtml(path)}</a>`;
    preview.prepend(notice);
}

function updateSendToChatButton(root) {
    const button = root?.querySelector('#bbcf-send-to-chat');
    if (!button) return;
    const canSend = Boolean(state.pendingComic?.html && !state.pendingComic.sent);
    button.classList.toggle('bbcf-hidden', !canSend);
    button.disabled = state.generating || !canSend;
}

function setHistoryPreviewMode(root, enabled) {
    root?.querySelector('#bbcf-close-history-preview')?.classList.toggle('bbcf-hidden', !enabled);
}

function restoreCurrentPreview(root) {
    const preview = root?.querySelector('#bbcf-preview-content');
    if (!preview) return;
    if (state.pendingComic?.html && !state.pendingComic.sent) {
        preview.innerHTML = state.pendingComic.html;
        bindComicActions(preview);
        attachForgePreviewPanelControls(root);
    } else {
        preview.innerHTML = '<p class="bbcf-hint">Готовая страница появится здесь.</p>';
    }
    setHistoryPreviewMode(root, false);
    updateSendToChatButton(root);
}

function clearForgePreview(root) {
    const preview = root?.querySelector('#bbcf-preview-content');
    if (preview) preview.innerHTML = '<p class="bbcf-hint">Превью очищено.</p>';
    const progress = root?.querySelector('#bbcf-progress');
    if (progress) progress.innerHTML = '';
    state.pendingComic = null;
    setHistoryPreviewMode(root, false);
    updateSendToChatButton(root);
    updateFloatingButton();
}

function attachForgePreviewPanelControls(root) {
    const preview = root?.querySelector('#bbcf-preview-content');
    if (!preview || !state.pendingComic?.html) return;
    preview.querySelectorAll('.bbcf-preview-panel-regen').forEach(button => button.remove());
    const draft = state.pendingComic.draft || readDraftFromModal(root);
    if ((draft.generationMode || getSettings().generationMode) === 'single') return;
    preview.querySelectorAll('.bbcf-panel').forEach(figure => {
        const number = Number(figure.getAttribute('data-bbcf-panel'));
        if (!number || figure.querySelector('.bbcf-preview-panel-regen')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bbcf-panel-action bbcf-preview-panel-regen';
        button.title = 'Перегенерировать в текущем стиле кузницы';
        button.dataset.bbcfPreviewRegen = String(number);
        button.innerHTML = '<i class="fa-solid fa-palette"></i>';
        button.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            await regeneratePreviewPanel(root, number, button);
        });
        figure.appendChild(button);
    });
}

async function regeneratePreviewPanel(root, panelNumber, button) {
    if (state.generating || button?.classList.contains('is-busy')) return;
    const preview = root.querySelector('#bbcf-preview-content');
    const oldFigure = preview?.querySelector(`.bbcf-panel[data-bbcf-panel="${panelNumber}"]`);
    if (!preview || !oldFigure) return;
    const draft = readDraftFromModal(root);
    if ((draft.generationMode || getSettings().generationMode) === 'single') {
        toastr.info('В режиме одной картинки лучше перегенерировать страницу целиком.', 'Comic Forge');
        return;
    }
    try {
        state.generating = true;
        updateFloatingButton();
        button?.classList.add('is-busy');
        saveDraftToSettings(draft);
        const plans = buildPanelPlans(draft);
        const plan = plans.find(panel => panel.number === panelNumber);
        if (!plan) throw new Error(`Panel ${panelNumber} is not in this draft.`);
        plan.previousImagePaths = getRecentComicImagePaths();
        renderProgress(root.querySelector('#bbcf-progress'), [plan]);
        updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'running', 'Запрос отправлен');
        const stopTimer = startElapsedProgress(root.querySelector('#bbcf-progress'), panelNumber, 'Перегенерация');
        let imagePath = '';
        try {
            const dataUrl = await generatePanelImage(plan, status => updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'running', status));
            stopTimer();
            updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'running', 'Сохранение');
            imagePath = await saveImageToFile(dataUrl, panelNumber);
            updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'done', 'Готово');
        } catch (error) {
            stopTimer();
            throw error;
        }
        oldFigure.outerHTML = buildPanelHtml({ ...plan, imagePath }).trim();
        cleanupRenderedComics(preview);
        bindComicActions(preview);
        state.pendingComic = {
            draft,
            html: makeShareHtml(preview.innerHTML),
            sent: false,
        };
        attachForgePreviewPanelControls(root);
        updateSendToChatButton(root);
        updateFloatingButton();
        toastr.success(`Панель ${panelNumber} обновлена в превью.`, 'Comic Forge');
    } catch (error) {
        console.error('[BB Comic Forge] preview panel regeneration failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
    } finally {
        state.generating = false;
        button?.classList.remove('is-busy');
        updateSendToChatButton(root);
        updateFloatingButton();
    }
}

function getActiveComicRecord() {
    return state.lastComic || getSettings().comicHistory?.[0] || null;
}

function renderComicHistory(root) {
    const panel = root.querySelector('#bbcf-history-panel');
    if (!panel) return;
    const history = getSettings().comicHistory || [];
    if (!history.length) {
        panel.innerHTML = '<p class="bbcf-hint">История пуста.</p>';
        return;
    }
    panel.innerHTML = `
        <div class="bbcf-history-header">
            <b>Созданные комиксы</b>
            <button class="menu_button" type="button" data-bbcf-history-clear><i class="fa-solid fa-trash-can"></i><span>Очистить</span></button>
        </div>
        ${history.map(record => `
        <div class="bbcf-history-card" data-bbcf-history-id="${escapeHtml(record.id)}">
            <div class="bbcf-history-thumb">${record.imagePaths?.[0] ? `<img src="${escapeHtml(record.imagePaths[0])}" alt="">` : '<i class="fa-solid fa-image"></i>'}</div>
            <div class="bbcf-history-main">
                <b>${escapeHtml(record.title || 'Comic page')}</b>
                <span>${escapeHtml(formatComicDate(record.createdAt))} · ${escapeHtml(record.mode === 'single' ? 'одним запросом' : 'по панелям')}</span>
                <div class="bbcf-history-actions">
                    <button class="menu_button" type="button" data-bbcf-history-preview><i class="fa-solid fa-eye"></i><span>Показать</span></button>
                    <button class="menu_button" type="button" data-bbcf-history-delete><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        </div>
    `).join('')}`;
    panel.querySelector('[data-bbcf-history-clear]')?.addEventListener('click', () => {
        const settings = getSettings();
        settings.comicHistory = [];
        state.lastComic = null;
        saveSettings();
        renderComicHistory(root);
        toastr.success('История комиксов очищена.', 'Comic Forge');
    });
    panel.querySelectorAll('.bbcf-history-card').forEach(card => {
        const record = history.find(item => item.id === card.dataset.bbcfHistoryId);
        if (!record) return;
        card.querySelector('[data-bbcf-history-preview]')?.addEventListener('click', () => {
            state.lastComic = record;
            const preview = root.querySelector('#bbcf-preview-content');
            if (preview) {
                preview.innerHTML = record.html;
                cleanupRenderedComics(preview);
                bindComicActions(preview);
            }
            setHistoryPreviewMode(root, true);
            updateSendToChatButton(root);
        });
        card.querySelector('[data-bbcf-history-delete]')?.addEventListener('click', () => {
            const settings = getSettings();
            settings.comicHistory = (settings.comicHistory || []).filter(item => item.id !== record.id);
            if (state.lastComic?.id === record.id) state.lastComic = null;
            saveSettings();
            renderComicHistory(root);
            toastr.success('Запись удалена из истории.', 'Comic Forge');
        });
    });
}

function formatComicDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
}

async function copyText(text) {
    const value = String(text || '');
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch (error) {
            console.warn('[BB Comic Forge] navigator clipboard failed, trying fallback', error);
        }
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

function downloadTextFile(filename, text) {
    const blob = new Blob([String(text || '')], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildStandaloneComicDocument(record) {
    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(record.title || 'Comic page')}</title>
</head>
<body>
${record.html || ''}
</body>
</html>`;
}

function safeFilename(value) {
    return String(value || 'comic')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80) || 'comic';
}

async function saveCurrentChat(context = SillyTavern.getContext()) {
    if (typeof context.saveChat === 'function') {
        try {
            await context.saveChat();
            return;
        } catch (error) {
            console.warn('[BB Comic Forge] context.saveChat failed, trying exported saveChat', error);
        }
    }
    await saveChat({ force: true });
}

function bindComicActions(root) {
    if (!root) return;
    root.querySelectorAll('[data-bbcf-regen]').forEach(button => {
        if (button.dataset.bbcfBound === '1') return;
        button.dataset.bbcfBound = '1';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            regeneratePanel(button);
        });
    });
}

function cleanupRenderedComics(root) {
    if (!root) return;
    root.querySelectorAll('.bbcf-comic-title span').forEach(span => {
        const text = span.textContent?.trim() || '';
        if (/^(?:single image|\d+\s+panels?)$/i.test(text)) span.remove();
    });
    root.querySelectorAll('.bbcf-panel-action').forEach(button => button.remove());
    root.querySelectorAll('.bbcf-panel:not(.bbcf-panel-error)[data-bbcf-instruction]').forEach(panel => {
        panel.removeAttribute('data-bbcf-instruction');
    });
}

function installChatObserver() {
    const chat = document.getElementById('chat');
    if (!chat || state.observer) return;
    state.observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    cleanupRenderedComics(node);
                    bindComicActions(node);
                }
            }
        }
    });
    state.observer.observe(chat, { childList: true, subtree: true });
}

async function regeneratePanel(button) {
    const figure = button.closest('.bbcf-panel');
    let img = figure?.querySelector('img');
    if (!figure || button.classList.contains('is-busy')) return;
    let data;
    try {
        data = decodeJsonAttr(figure.dataset.bbcfInstruction || '');
    } catch (error) {
        toastr.error('Не удалось прочитать prompt панели.', 'Comic Forge');
        return;
    }
    const oldOuterHtml = figure.outerHTML;
    const status = document.createElement('div');
    status.className = 'bbcf-regen-status';
    status.textContent = 'Перегенерация панели...';
    figure.appendChild(status);
    button.classList.add('is-busy');
    try {
        const panel = {
            number: Number(data.panelNumber) || Number(figure.dataset.bbcfPanel) || 1,
            prompt: data.prompt,
            stylePrompt: data.stylePrompt,
            negativePrompt: data.negativePrompt,
            aspectRatio: data.aspectRatio || '1:1',
            imageSize: data.imageSize || getSettings().imageSize,
            singlePage: Boolean(data.singlePage),
            previousImagePaths: getRecentComicImagePaths(),
        };
        const dataUrl = await generatePanelImage(panel, text => { status.textContent = text || 'Перегенерация панели...'; });
        status.textContent = 'Сохранение...';
        const newSrc = await saveImageToFile(dataUrl, panel.number);
        if (!img) {
            figure.querySelector('.bbcf-panel-error-body')?.remove();
            img = document.createElement('img');
            img.alt = `${data.title || 'Comic page'} panel ${panel.number}`;
            img.loading = 'lazy';
            figure.prepend(img);
            figure.classList.remove('bbcf-panel-error');
        }
        img.setAttribute('src', newSrc);
        img.setAttribute('style', panelImageStyle());
        figure.setAttribute('style', panelStyle(getPanelLayoutFromElement(figure), panel.number));
        status.remove();
        await replacePanelHtmlInChat(figure, oldOuterHtml);
        const preview = state.modal?.querySelector('#bbcf-preview-content');
        if (preview?.contains(figure)) {
            cleanupRenderedComics(preview);
            bindComicActions(preview);
            state.pendingComic = {
                draft: state.pendingComic?.draft || readDraftFromModal(state.modal),
                html: makeShareHtml(preview.innerHTML),
                sent: false,
            };
            attachForgePreviewPanelControls(state.modal);
            updateSendToChatButton(state.modal);
        }
        toastr.success(`Панель ${panel.number} обновлена.`, 'Comic Forge');
    } catch (error) {
        console.error('[BB Comic Forge] panel regeneration failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
    } finally {
        status.remove();
        button.classList.remove('is-busy');
    }
}

async function replacePanelHtmlInChat(figure, oldOuterHtml) {
    const messageElement = figure.closest('.mes');
    const messageId = Number(messageElement?.getAttribute('mesid'));
    const context = SillyTavern.getContext();
    const message = Number.isInteger(messageId) ? context.chat?.[messageId] : null;
    if (!message) return;
    const newOuterHtml = figure.outerHTML;
    const replace = value => {
        if (typeof value !== 'string') return value;
        const doc = new DOMParser().parseFromString(value, 'text/html');
        const panelNumber = figure.getAttribute('data-bbcf-panel');
        const target = panelNumber
            ? Array.from(doc.querySelectorAll('.bbcf-panel')).find(panel => panel.getAttribute('data-bbcf-panel') === panelNumber)
            : null;
        if (target) {
            target.outerHTML = newOuterHtml;
            return doc.body.innerHTML;
        }
        return oldOuterHtml ? value.split(oldOuterHtml).join(newOuterHtml) : value;
    };
    message.mes = replace(message.mes);
    if (message.extra?.display_text) message.extra.display_text = replace(message.extra.display_text);
    await saveCurrentChat(context);
}

async function testApiSettings() {
    try {
        validateGenerationSettings();
        const models = await loadProviderModels({ button: document.querySelector('#bbcf-test-api'), silent: true });
        const modelText = models.length ? ` Доступно моделей: ${models.length}.` : '';
        toastr.success(`Подключение выглядит рабочим.${modelText}`, 'Comic Forge');
    } catch (error) {
        toastr.error(error?.message || String(error), 'Comic Forge');
    }
}

async function testDraftSettings() {
    try {
        const raw = await runDraftPrompt('Return exactly this JSON object and nothing else: {"ok":true}');
        const parsed = extractJsonObject(raw);
        if (parsed?.ok !== true) throw new Error('Черновик ответил, но JSON-тест не совпал.');
        toastr.success('Черновик отвечает корректным JSON.', 'Comic Forge');
    } catch (error) {
        toastr.error(error?.message || String(error), 'Comic Forge');
    }
}

function collectRecentChat(count) {
    const context = SillyTavern.getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const max = clampInt(count, 0, 20, getSettings().contextMessages);
    if (!max || !chat.length) return '';
    return chat.slice(-max).map(message => {
        const name = message?.name || (message?.is_user ? 'User' : 'Assistant');
        return `${name}: ${stripHtml(message?.mes || '').slice(0, 1200)}`;
    }).join('\n\n').slice(0, 5000);
}

function stripHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

function getCurrentCharacterName() {
    const context = SillyTavern.getContext();
    if (context.characterId !== undefined && context.characters?.[context.characterId]) {
        return context.characters[context.characterId].name || '';
    }
    return context.name2 || '';
}

function getReferenceProfileKey() {
    return getScopedProfileKey();
}

function getWardrobeProfileKey() {
    return getScopedProfileKey();
}

function getLegacyReferenceProfileKey() {
    const context = SillyTavern.getContext();
    const character = context.characterId !== undefined ? context.characters?.[context.characterId] : null;
    const name = character?.name || context.name2 || 'global';
    const id = context.characterId !== undefined ? context.characterId : safeFilename(name).toLowerCase();
    return `character:${id}:${String(name || 'global').trim().toLowerCase()}`;
}

function getScopedProfileKey() {
    const context = SillyTavern.getContext();
    const groupId = context.groupId ?? context.group_id ?? context.selected_group;
    if (groupId !== undefined && groupId !== null && groupId !== '') {
        const group = Array.isArray(context.groups) ? context.groups.find(item => String(item?.id) === String(groupId)) : null;
        return `group:${safeProfilePart(groupId)}:${safeProfilePart(group?.name || context.name2 || 'group')}`;
    }
    const character = context.characterId !== undefined ? context.characters?.[context.characterId] : null;
    if (character) {
        const stableId = character.avatar || character.name || context.characterId;
        return `character:${safeProfilePart(stableId)}:${safeProfilePart(character.name || context.name2 || 'character')}`;
    }
    const chatId = context.chatId
        || context.chat_id
        || context.chatMetadata?.chat_id
        || context.chatMetadata?.file_name
        || context.chatMetadata?.chat_name
        || context.chatMetadata?.name
        || context.name2
        || 'global';
    return `chat:${safeProfilePart(chatId)}`;
}

function safeProfilePart(value) {
    const text = String(value || 'global').trim().toLowerCase();
    return encodeURIComponent(text).replace(/%/g, '').slice(0, 120) || 'global';
}

function makeId(prefix) {
    const random = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g, '');
    return `${prefix}-${Date.now().toString(36)}-${random.slice(0, 8)}`;
}

function encodeJsonAttr(value) {
    const json = JSON.stringify(value);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeJsonAttr(value) {
    const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}
