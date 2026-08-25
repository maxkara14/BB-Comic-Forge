import {
    addOneMessage,
    eventSource,
    event_types,
    saveChat,
    saveSettings as saveSillyTavernSettings,
    substituteParams,
    updateMessageBlock,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { POPUP_TYPE, Popup } from '../../../popup.js';
import { ConnectionManagerRequestService } from '../../shared.js';
import { isDisclosureExpanded, setDisclosureExpanded, upgradeDisclosures } from './src/ui/disclosure.js';

const MODULE_NAME = 'BB-Comic-Forge';
const SETTINGS_ID = 'bbcf-settings';
const FAB_ID = 'bbcf-open-fab';
const FAB_WRAPPER_ID = 'bbcf-open-wrapper';
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
const IMAGE_API_TYPES = ['onlysq-imagen', 'openai-images', 'openai-chat', 'gemini', 'naistera'];
const OPENAI_IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'];
const OPENAI_IMAGE_QUALITIES = ['standard', 'hd', 'high', 'medium', 'low'];
const COMIC_PAGE_SELECTOR = '.bbcf-comic-page, .custom-bbcf-comic-page, [data-bbcf-page]';
const DRAFT_SYNC_FIELDS = ['generationMode', 'insertMode', 'panelCount', 'layout', 'stylePreset', 'characterLock', 'panelNotes', 'bubbles', 'inserts', 'sfx', 'customPrompt', 'negativePrompt'];
const DRAFT_SYNC_SELECTORS = {
    generationMode: '#bbcf-draft-mode',
    insertMode: '#bbcf-draft-insert-mode',
    panelCount: '#bbcf-draft-count',
    layout: '#bbcf-draft-layout',
    stylePreset: '#bbcf-draft-style',
    characterLock: '#bbcf-draft-lock',
    panelNotes: '#bbcf-draft-notes',
    bubbles: '#bbcf-draft-bubbles',
    inserts: '#bbcf-draft-inserts',
    sfx: '#bbcf-draft-sfx',
    customPrompt: '#bbcf-draft-custom-style',
    negativePrompt: '#bbcf-draft-negative',
};

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
};

const DEFAULT_NEGATIVE_PROMPT = 'low quality, blurry, noisy, jpeg artifacts, bad anatomy, extra limbs, malformed hands, unreadable text, fake letters, watermark, logo, signature, cluttered panel, broken face, inconsistent character design';
const DRAFT_CAST_DIALOGUE_RULES = [
    '- Before writing JSON, identify every story-active participant from the recent chat.',
    '- Include every story-active participant in character_lock with stable visible continuity details.',
    '- Every panel note must explicitly name every character visible in that panel; do not rely only on pronouns or generic labels.',
    '- Each story-active participant must appear in at least one panel unless they are intentionally off-panel; if off-panel, state that clearly in scene or the relevant panel note.',
    '- Do not force every participant into every panel. Preserve close-ups, reaction shots, detail shots, and readable composition.',
    '- Every speech or thought bubble must include a "speaker" field using the character name from character_lock.',
    '- The speaker field is metadata for composition and must never be repeated inside the visible bubble text.',
    '- When multiple bubbles are used, they must form one coherent exchange anchored in the latest roleplay beat, not isolated generic phrases.',
    '- Each later bubble must respond to, clarify, challenge, or advance an earlier line or visible action.',
].join('\n');
const DEFAULT_DRAFT_PROMPT = `<task>
Create a compact but visually specific comic page draft from the roleplay context.
</task>

<context>
Recent chat:
{{recent_chat}}

Existing character lock:
{{character_lock}}

User persona:
{{user_persona}}

Current character card:
{{character_context}}
</context>

<rules>
- Output only valid JSON, no markdown.
- The comic page must continue the current story with continuity.
- Use {{panel_count}} panels.
- Keep the draft detailed enough for image generation, but not bloated.
- Write scene as 1 to 2 compact sentences.
- Write character_lock as 1 compact paragraph.
- Write each panel note as 1 complete but compact sentence.
- Visual descriptions may be in English for better image generation.
- Bubble text, SFX, signs, labels, and any visible text inside inserts must be in Russian only.
- Do not include translations, bilingual text, or parenthetical explanations for Russian phrases.
- Preserve known character appearance, outfit, injuries, accessories, species traits, powers, weapons, and relationship continuity from the context.
- character_lock must focus on stable visible traits: hair, eyes, face, body type, outfit, accessories, injuries, species traits, weapons, and other important continuity details.
- Put current emotion, pose, interaction, and relationship tension in scene and panel_notes rather than treating them as permanent character traits.
- If an appearance detail is unknown, do not invent a precise new design; describe only what is known and keep the rest consistent with the context.
- scene must include location, atmosphere, lighting, emotional tone, the main story beat, and who is present.
- Each panel note must include camera or framing, explicitly named visible characters, action, expression or body language, and one important background or prop detail.
- Do not include panel numbers or labels like "panel 1:" inside panel_notes. The array order already defines the panel number.
- Use comic-friendly visual storytelling appropriate to the selected style when useful: establishing shots, close-ups, reaction shots, dramatic pauses, expressive body language, symbolic details, impact frames, and visual timing.
- Bubble text must be in Russian, usually 4 to 12 words per bubble; allow up to 16 only for plot-critical clarity.
- Use up to 4 bubbles total.
- If the recent context contains dialogue, preserve its intent and turn it into a coherent exchange.
- Do not invent dialogue merely to fill a bubble quota.
${DRAFT_CAST_DIALOGUE_RULES}
- Use 1 to 2 overlay inserts when they improve storytelling.
- When inserts are used, include at least 1 detail insert focused on something important inside a panel: hands, lips, eyes, weapons, objects, symbols, clues, impact contact, clothing detail, or a decisive action emphasis.
- Use a chibi insert only when it fits the scene tone. If used, base it on the user persona or the current character as a tiny comedic reaction to the situation, plot beat, or emotional moment.
- For serious, tense, or tragic scenes, prefer a reaction or detail insert instead of forcing a chibi gag.
- Insert descriptions may be in English, but any quoted visible text inside the image must be Russian only.
- Place inserts only where they improve readability and do not overcrowd the panel.
- Do not write explicit sexual content.
</rules>

<format>
{
  "title": "short page title",
  "scene": "compact visual summary: location, lighting, mood, main story beat, and who is present",
  "character_lock": "compact stable visual notes for important participants: appearance, outfit, injuries, accessories, and continuity details",
  "panel_notes": [
    "Wide establishing shot of the named characters entering a rain-soaked station, guarded posture, cold fluorescent lighting, abandoned luggage near the platform edge",
    "Tight reaction shot on the named speaker turning toward their companion, restrained fear in their eyes, one hand gripping a damaged radio"
  ],
  "bubbles": [
    { "panel": 1, "type": "speech", "position": "top-left", "speaker": "Character name", "text": "Русская реплика здесь" }
  ],
  "sfx": [
    { "panel": 1, "text": "БАХ" }
  ],
  "inserts": [
    { "panel": 1, "type": "detail", "position": "bottom-left", "text": "small bordered close-up of tense fingers gripping black fabric" }
  ]
}
</format>`;

const DEFAULT_SETTINGS = {
    schemaVersion: 4,
    enabled: true,
    showFab: true,
    apiType: 'onlysq-imagen',
    endpoint: '',
    apiKey: '',
    model: '',
    availableModels: [],
    imageConnectionProfiles: [],
    activeImageConnectionProfileId: '',
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
    defaultPanelNotes: '',
    defaultBubbles: '',
    defaultInserts: '',
    defaultSfx: '',
    contextMessages: 4,
    injectChatContextToImagePrompt: false,
    previousImageCount: 0,
    draftPrompt: DEFAULT_DRAFT_PROMPT,
    draftConnectionMode: 'sillytavern',
    draftEndpoint: '',
    draftApiKey: '',
    draftModel: '',
    availableDraftModels: [],
    draftTemperature: 0.35,
    draftTavernProfileId: '',
    draftConnectionProfiles: [],
    activeDraftConnectionProfileId: '',
    draftPromptPresets: [],
    activeDraftPromptPresetId: '',
    references: [],
    referenceProfiles: {},
    activeReferenceProfileKey: '',
    referencesMigratedToProfiles: false,
    wardrobeEnabled: true,
    wardrobeSendDescription: true,
    wardrobeSendImages: true,
    wardrobe: [],
    wardrobeItems: [],
    wardrobeAssignments: {},
    wardrobeProfiles: {},
    activeWardrobeProfileKey: '',
    wardrobeMigratedToProfiles: false,
    characterLockProfiles: {},
    activeCharacterLockProfileKey: '',
    savedDraftProfiles: {},
    activeSavedDraftProfileKey: '',
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
    lastAutoTriggerKey: null,
    generationAbortController: null,
    generationCancelRequested: false,
    generationCancelNotified: false,
    generationRunId: 0,
    lastComic: null,
    pendingComic: null,
    lightboxPopup: null,
    historyPreviewPreviousPendingComic: null,
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
    context.eventSource?.on?.(event_types.CHARACTER_MESSAGE_RENDERED, (messageId, type) => {
        setTimeout(() => handleCharacterMessageRendered(messageId, type), 0);
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
    scheduleComicActionRefresh();
    installChatObserver();
}

function handleCharacterMessageRendered(messageId, type = '') {
    cleanupRenderedComics(document.getElementById('chat') || document.body);
    scheduleComicActionRefresh();
    void runAutoComicAfterMessage(messageId, type);
}

function handleContextChanged() {
    getSettings();
    state.lastAutoTriggerKey = null;
    refreshSettingsUi();
    refreshModalForCurrentContext();
    if (state.wardrobeModal?.isConnected) renderWardrobeModal();
}

function refreshModalForCurrentContext() {
    if (!state.modal?.isConnected || state.generating) return;
    applySavedDraftToModal(state.modal, getSavedDraft());
    state.pendingComic = null;
    const preview = state.modal.querySelector('#bbcf-preview-content');
    if (preview) preview.innerHTML = '<p class="bbcf-hint">Готовая страница появится здесь.</p>';
    updateSendToChatButton(state.modal);
}

async function runAutoComicAfterMessage(rawMessageId, renderType = '') {
    const settings = getSettings();
    if (!settings.enabled || !settings.autoMode || state.autoRunning || state.generating) return;
    if (renderType === 'first_message') return;
    const messageId = resolveMessageId(rawMessageId);
    if (!Number.isInteger(messageId)) return;
    const context = SillyTavern.getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const message = chat[messageId] || null;
    if (!message || message.is_user || message.is_system || message.extra?.from === MODULE_NAME) return;
    if (!hasUserMessageBefore(chat, messageId)) return;
    const triggerKey = getAutoTriggerKey(messageId, message, renderType);
    if (state.lastAutoTriggerKey === triggerKey) return;
    state.lastAutoMessageId = messageId;
    state.lastAutoTriggerKey = triggerKey;
    state.autoRunning = true;
    state.generating = true;
    const controller = startGenerationSession();
    updateFloatingButton();
    toastr.info('Comic Forge: авто-генерация комикса запущена.', 'Comic Forge');
    let root = null;
    try {
        root = ensureForgeModalForAutomation();
        applyDefaultPageSettingsToModal(root);
        renderProgress(root.querySelector('#bbcf-progress'), [{ number: 1, title: 'Черновик' }]);
        updateProgress(root.querySelector('#bbcf-progress'), 1, 'running', 'Черновик из чата');
        await fillDraftFromAi(root, { throwErrors: true, signal: controller.signal });
        throwIfAborted(controller.signal);
        const draft = readDraftFromModal(root);
        if (!draft.scene.trim()) throw new Error('AI-черновик не заполнил сцену.');
        state.generating = false;
        finishGenerationSession(controller);
        await handleGenerateFromModal(root);
        if (state.pendingComic?.html && !state.pendingComic.sent) {
            await sendPendingComicToChat(root, { targetMessageId: messageId });
        }
    } catch (error) {
        if (isAbortError(error) || state.generationCancelRequested) {
            console.info('[BB Comic Forge] auto comic cancelled');
        } else {
            console.error('[BB Comic Forge] auto comic failed', error);
            toastr.error(error?.message || String(error), 'Comic Forge');
        }
        state.generating = false;
    } finally {
        finishGenerationSession(controller);
        state.autoRunning = false;
        updateFloatingButton();
    }
}

function hasUserMessageBefore(chat, messageId) {
    for (let index = 0; index < messageId; index++) {
        const message = chat[index];
        if (message?.is_user && !message?.is_system) return true;
    }
    return false;
}

function getAutoTriggerKey(messageId, message, renderType = '') {
    return [
        messageId,
        renderType || '',
        message?.swipe_id ?? '',
        message?.send_date || '',
        message?.gen_finished || '',
        hashText(String(message?.mes || '')),
    ].join('|');
}

function hashText(text) {
    let hash = 0;
    for (let index = 0; index < text.length; index++) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return `${text.length}:${hash}`;
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
    if (!IMAGE_API_TYPES.includes(settings.apiType)) settings.apiType = DEFAULT_SETTINGS.apiType;
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
    settings.draftConnectionProfiles = normalizeDraftConnectionProfiles(settings.draftConnectionProfiles);
    if (!settings.draftConnectionProfiles.some(profile => profile.id === settings.activeDraftConnectionProfileId)) {
        settings.activeDraftConnectionProfileId = '';
    }
    settings.draftPromptPresets = normalizeDraftPromptPresets(settings.draftPromptPresets);
    if (!settings.draftPromptPresets.some(preset => preset.id === settings.activeDraftPromptPresetId)) {
        settings.activeDraftPromptPresetId = '';
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
    if (!settings.characterLockProfiles || typeof settings.characterLockProfiles !== 'object' || Array.isArray(settings.characterLockProfiles)) {
        settings.characterLockProfiles = {};
        dirty = true;
    }
    const characterLockProfileKey = getCharacterLockProfileKey();
    if (settings.activeCharacterLockProfileKey !== characterLockProfileKey) {
        settings.activeCharacterLockProfileKey = characterLockProfileKey;
        dirty = true;
    }
    settings.characterLock = String(settings.characterLockProfiles[characterLockProfileKey] || '');
    if (!settings.wardrobeProfiles || typeof settings.wardrobeProfiles !== 'object' || Array.isArray(settings.wardrobeProfiles)) {
        settings.wardrobeProfiles = {};
        dirty = true;
    }
    const wardrobeProfileKey = getWardrobeProfileKey();
    const unscopedWardrobeProfileKey = 'legacy:unscoped';
    const legacyWardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeAssignments);
    const hasLegacyWardrobeAssignments = hasAnyWardrobeAssignment(legacyWardrobeAssignments);
    if (!settings.wardrobeMigratedToProfiles && hasLegacyWardrobeAssignments && !settings.wardrobeProfiles[unscopedWardrobeProfileKey]) {
        settings.wardrobeProfiles[unscopedWardrobeProfileKey] = structuredClone(legacyWardrobeAssignments);
        dirty = true;
    }
    if (!settings.wardrobeMigratedToProfiles) {
        settings.wardrobeMigratedToProfiles = true;
        dirty = true;
    }
    if (settings.activeWardrobeProfileKey !== wardrobeProfileKey) {
        settings.activeWardrobeProfileKey = wardrobeProfileKey;
        dirty = true;
    }
    const hasActiveWardrobeProfile = hasOwn(settings.wardrobeProfiles, wardrobeProfileKey);
    let wardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeProfiles[wardrobeProfileKey] || {});
    if (!hasActiveWardrobeProfile && !hasAnyWardrobeAssignment(wardrobeAssignments)) {
        const seed = findProfileSeed(settings.wardrobeProfiles, getScopedProfileFallbackKeys(), hasAnyWardrobeAssignment);
        if (seed) {
            wardrobeAssignments = normalizeWardrobeAssignments(seed.value);
            settings.wardrobeProfiles[wardrobeProfileKey] = structuredClone(wardrobeAssignments);
            dirty = true;
            console.info('[BB Comic Forge] restored wardrobe assignment profile from', seed.key);
        }
    }
    settings.wardrobeAssignments = wardrobeAssignments;
    if (settings.savedDraft && typeof settings.savedDraft !== 'object') {
        settings.savedDraft = null;
        dirty = true;
    }
    if (!settings.savedDraftProfiles || typeof settings.savedDraftProfiles !== 'object' || Array.isArray(settings.savedDraftProfiles)) {
        settings.savedDraftProfiles = {};
        dirty = true;
    }
    const savedDraftProfileKey = getSavedDraftProfileKey();
    if (settings.activeSavedDraftProfileKey !== savedDraftProfileKey) {
        settings.activeSavedDraftProfileKey = savedDraftProfileKey;
        dirty = true;
    }
    settings.savedDraft = normalizeSavedDraft(settings.savedDraftProfiles[savedDraftProfileKey]);
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
    const unscopedReferenceProfileKey = 'legacy:unscoped';
    const existingReferences = normalizeReferences(settings.references);
    const hasLegacyReferences = existingReferences.some(ref => ref.path || ref.name || ref.description);
    if (!settings.referencesMigratedToProfiles && hasLegacyReferences && !settings.referenceProfiles[unscopedReferenceProfileKey]) {
        settings.referenceProfiles[unscopedReferenceProfileKey] = structuredClone(existingReferences);
        dirty = true;
    }
    if (!settings.referencesMigratedToProfiles) {
        settings.referencesMigratedToProfiles = true;
        dirty = true;
    }
    if (settings.activeReferenceProfileKey !== referenceProfileKey) {
        settings.activeReferenceProfileKey = referenceProfileKey;
        dirty = true;
    }
    const hasActiveReferenceProfile = hasOwn(settings.referenceProfiles, referenceProfileKey);
    let references = normalizeReferences(settings.referenceProfiles[referenceProfileKey] || []);
    if (!hasActiveReferenceProfile && !hasReferenceProfileData(references)) {
        const seed = findProfileSeed(settings.referenceProfiles, getScopedProfileFallbackKeys(), hasReferenceProfileData);
        if (seed) {
            references = normalizeReferences(seed.value);
            settings.referenceProfiles[referenceProfileKey] = structuredClone(references);
            dirty = true;
            console.info('[BB Comic Forge] restored reference profile from', seed.key);
        }
    }
    settings.references = references;
    if (dirty) saveSettings();
    return settings;
}

function migrateDraftPrompt(value) {
    const insertExample = `"inserts": [
    { "panel": 3, "type": "detail", "position": "bottom-left", "text": "small bordered close-up of tense fingers gripping fabric" },
    { "panel": 4, "type": "chibi", "position": "bottom-right", "text": "tiny angry chibi reaction sticker holding a sign" }
    ]`;
    const oldInsertRules = [
        '- Add 0 to 2 overlay inserts only when they clearly improve the page.',
        '- Use detail inserts for important hands, lips, eyes, weapons, objects, symbols, or action emphasis.',
        '- Use chibi inserts only for comic, embarrassed, jealous, startled, or exaggerated reactions.',
        '- Do not add inserts to calm/simple pages or already crowded panels.',
    ].join('\n');
    const newInsertRules = [
        '- Add at least 2 overlay inserts total.',
        '- Include exactly 1 chibi insert for the whole comic page: use the user persona or the current character as a tiny comedic reaction that summarizes the situation, plot beat, or emotional moment.',
        '- Include at least 1 detail insert focused on something important inside a panel: hands, lips, eyes, weapons, objects, symbols, clues, impact contact, or a decisive action emphasis.',
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
    if (prompt.includes(oldInsertRules)) {
        prompt = prompt.replace(oldInsertRules, newInsertRules);
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

function hasReferenceProfileData(rawReferences) {
    return normalizeReferences(rawReferences).some(ref =>
        ref.enabled === false
        || ref.path
        || ref.name
        || ref.description);
}

function findProfileSeed(profiles, fallbackKeys, hasData) {
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return null;
    for (const key of fallbackKeys) {
        if (!key || !hasOwn(profiles, key)) continue;
        const value = profiles[key];
        if (hasData(value)) return { key, value };
    }
    return null;
}

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function normalizeSavedStyles(rawStyles) {
    const styles = Array.isArray(rawStyles) ? rawStyles : [];
    return styles
        .filter(style => style && typeof style === 'object')
        .map(style => ({
            id: String(style.id || makeId('style')),
            label: String(style.label || style.name || 'Мой стиль').trim(),
            prompt: getSavedStylePrompt(style),
        }))
        .filter(style => style.id && (style.label || style.prompt));
}

function getSavedStylePrompt(style) {
    return String(
        style?.prompt
        ?? style?.customPrompt
        ?? style?.customStyle
        ?? style?.description
        ?? style?.text
        ?? style?.value
        ?? ''
    ).trim();
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

function normalizeDraftConnectionProfiles(rawProfiles) {
    const profiles = Array.isArray(rawProfiles) ? rawProfiles : [];
    return profiles
        .filter(profile => profile && typeof profile === 'object')
        .map(profile => {
            const mode = DRAFT_CONNECTION_MODES.includes(profile.draftConnectionMode) ? profile.draftConnectionMode : DEFAULT_SETTINGS.draftConnectionMode;
            const availableDraftModels = filterDraftModelNames(Array.isArray(profile.availableDraftModels) ? profile.availableDraftModels : [], mode);
            return {
                id: String(profile.id || makeId('draft-connection')),
                label: String(profile.label || profile.name || getDraftConnectionProfileFallbackLabel(profile, mode)).trim(),
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

function normalizeImageConnectionProfiles(rawProfiles) {
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

function getImageConnectionProfileFallbackLabel(profile = {}, apiType = DEFAULT_SETTINGS.apiType) {
    const model = String(profile.model || profile.naisteraModel || '').trim();
    if (model) return model;
    return getImageApiLabel(apiType);
}

function getImageApiLabel(apiType) {
    if (apiType === 'onlysq-imagen') return 'OnlySQ ImaGen';
    if (apiType === 'openai-images') return 'OpenAI Images';
    if (apiType === 'openai-chat') return 'OpenAI Chat Images';
    if (apiType === 'gemini') return 'Gemini';
    if (apiType === 'naistera') return 'Naistera';
    return 'Image API';
}

function getDraftConnectionProfileFallbackLabel(profile = {}, mode = DEFAULT_SETTINGS.draftConnectionMode) {
    const model = String(profile.draftModel || '').trim();
    if (model) return model;
    if (mode === 'sillytavern') return getDraftTavernProfileLabel(profile.draftTavernProfileId || profile.tavernProfileId) || 'SillyTavern';
    if (mode === 'gemini') return 'Gemini draft';
    return 'OpenAI draft';
}

function normalizeDraftPromptPresets(rawPresets) {
    const presets = Array.isArray(rawPresets) ? rawPresets : [];
    return presets
        .filter(preset => preset && typeof preset === 'object')
        .map(preset => ({
            id: String(preset.id || makeId('draft-prompt')),
            label: String(preset.label || preset.name || 'Мой набор черновика').trim(),
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

function normalizeAspectPattern(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,;|]+/);
    const pattern = raw.map(item => String(item || '').trim()).filter(item => VALID_ASPECT_RATIOS.includes(item));
    return pattern.length ? pattern.slice(0, MAX_PANELS) : ['2:3', '1:1', '16:9', '3:4'];
}

function normalizeSavedDraft(rawDraft) {
    return rawDraft && typeof rawDraft === 'object' && !Array.isArray(rawDraft)
        ? structuredClone(rawDraft)
        : null;
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

function persistCharacterLockProfile(settings) {
    if (!settings) return;
    const profileKey = getCharacterLockProfileKey();
    if (!settings.characterLockProfiles || typeof settings.characterLockProfiles !== 'object' || Array.isArray(settings.characterLockProfiles)) {
        settings.characterLockProfiles = {};
    }
    const value = String(settings.characterLock || '');
    if (value) settings.characterLockProfiles[profileKey] = value;
    else delete settings.characterLockProfiles[profileKey];
    settings.activeCharacterLockProfileKey = profileKey;
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

let immediateSettingsSavePromise = Promise.resolve();

function saveSettingsImmediately() {
    immediateSettingsSavePromise = immediateSettingsSavePromise
        .catch(() => undefined)
        .then(() => saveSillyTavernSettings());
    return immediateSettingsSavePromise;
}

function clampInt(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(number)));
}

function getSettingsDashboardState(settings = getSettings()) {
    const imageProfile = getActiveImageConnectionProfile(settings);
    const draftProfile = getActiveDraftConnectionProfile(settings);
    const draftPreset = getActiveDraftPromptPreset(settings);
    const style = getStylePresetById(settings.stylePreset, settings);
    const layout = getLayoutPresetById(settings.layout, settings);
    const enabledReferences = settings.references.filter(reference => reference.enabled && reference.path).length;
    const activeWardrobe = settings.wardrobeEnabled ? getWardrobeActiveEntries(settings).length : 0;
    const imageNeedsModel = settings.apiType !== 'naistera';
    const imageReady = Boolean(settings.apiKey
        && (!imageNeedsModel || settings.model)
        && (settings.endpoint || ['onlysq-imagen', 'naistera'].includes(settings.apiType)));
    const selectedTavernDraftProfileExists = !settings.draftTavernProfileId
        || getSupportedTavernDraftProfiles().some(profile => profile.id === settings.draftTavernProfileId);
    const draftReady = settings.draftConnectionMode === 'sillytavern'
        ? selectedTavernDraftProfileExists
        : Boolean(settings.draftModel && settings.draftEndpoint && (settings.draftApiKey || settings.apiKey));
    return {
        imageReady,
        imageTitle: imageProfile?.label || settings.model || getImageApiLabel(settings.apiType),
        imageMeta: [getImageApiLabel(settings.apiType), settings.model].filter(Boolean).join(' · '),
        draftReady,
        draftTitle: draftProfile?.label || (settings.draftConnectionMode === 'sillytavern' ? 'Текущая модель SillyTavern' : settings.draftModel || 'AI-черновик'),
        draftMeta: getDraftConnectionNote(settings.draftConnectionMode),
        recipeTitle: draftPreset?.label || style?.label || 'Текущие настройки страницы',
        recipeMeta: [
            style?.label,
            layout?.label || settings.layout,
            `${settings.panelCount} пан.`,
            settings.generationMode === 'single' ? 'экономно' : 'по панелям',
        ].filter(Boolean).join(' · '),
        referenceTitle: enabledReferences || activeWardrobe ? `${enabledReferences} реф. · ${activeWardrobe} вещей` : 'Референсы не добавлены',
        referenceMeta: activeWardrobe ? 'Персонажи и активный гардероб' : 'Персонажи и гардероб',
    };
}

function setDashboardCardState(root, key, { ready = true, title = '', meta = '' } = {}) {
    const card = root?.querySelector(`[data-bbcf-dashboard-card="${key}"]`);
    if (!card) return;
    card.classList.toggle('is-ready', ready);
    card.classList.toggle('needs-attention', !ready);
    const titleNode = card.querySelector('[data-bbcf-dashboard-title]');
    const metaNode = card.querySelector('[data-bbcf-dashboard-meta]');
    const statusNode = card.querySelector('[data-bbcf-dashboard-status]');
    if (titleNode) titleNode.textContent = title;
    if (metaNode) metaNode.textContent = meta;
    if (statusNode) {
        statusNode.className = `bbcf-status-chip ${ready ? 'is-ready' : 'needs-attention'}`;
        statusNode.innerHTML = ready
            ? '<i class="fa-solid fa-check"></i><span>Готово</span>'
            : '<i class="fa-solid fa-circle-exclamation"></i><span>Настроить</span>';
    }
}

function refreshSettingsDashboard(root = document.getElementById(SETTINGS_ID)) {
    if (!root) return;
    const settings = getSettings();
    const dashboard = getSettingsDashboardState(settings);
    setDashboardCardState(root, 'images', {
        ready: dashboard.imageReady,
        title: dashboard.imageTitle,
        meta: dashboard.imageMeta,
    });
    setDashboardCardState(root, 'draft', {
        ready: dashboard.draftReady,
        title: dashboard.draftTitle,
        meta: dashboard.draftMeta,
    });
    setDashboardCardState(root, 'recipe', {
        title: dashboard.recipeTitle,
        meta: dashboard.recipeMeta,
    });
    setDashboardCardState(root, 'references', {
        title: dashboard.referenceTitle,
        meta: dashboard.referenceMeta,
    });
    const pageMeta = root.querySelector('#bbcf-page-settings-meta');
    if (pageMeta) pageMeta.textContent = dashboard.recipeMeta;
    const referenceMeta = root.querySelector('#bbcf-reference-settings-meta');
    if (referenceMeta) referenceMeta.textContent = dashboard.referenceTitle;
    const imageMeta = root.querySelector('#bbcf-image-settings-meta');
    if (imageMeta) imageMeta.textContent = dashboard.imageTitle;
    const draftMeta = root.querySelector('#bbcf-draft-settings-meta');
    if (draftMeta) draftMeta.textContent = dashboard.draftTitle;
    const enabledLabel = root.querySelector('[data-bbcf-enabled-label]');
    if (enabledLabel) enabledLabel.textContent = settings.enabled ? 'Включено' : 'Выключено';
    const dashboardTitle = root.querySelector('[data-bbcf-dashboard-heading]');
    if (dashboardTitle) dashboardTitle.textContent = dashboard.imageReady && dashboard.draftReady
        ? 'Готово к работе'
        : 'Заверши настройку';
}

function createSettingsUi() {
    if (document.getElementById(SETTINGS_ID)) return;
    const container = document.getElementById('extensions_settings');
    if (!container) return;
    const settings = getSettings();
    const activeImageConnectionProfile = getActiveImageConnectionProfile(settings);
    const activeDraftConnectionProfile = getActiveDraftConnectionProfile(settings);
    const activeDraftPromptPreset = getActiveDraftPromptPreset(settings);
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
                <section class="bbcf-section bbcf-dashboard">
                    <div class="bbcf-dashboard-heading">
                        <div>
                            <span class="bbcf-eyebrow">Быстрый запуск</span>
                            <h4 class="bbcf-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i><span data-bbcf-dashboard-heading>Готово к работе</span></h4>
                        </div>
                        <label class="bbcf-toggle-pill"><input type="checkbox" id="bbcf-enabled" ${settings.enabled ? 'checked' : ''}><span data-bbcf-enabled-label>${settings.enabled ? 'Включено' : 'Выключено'}</span></label>
                    </div>
                    <div class="bbcf-dashboard-grid">
                        <button class="bbcf-dashboard-card" type="button" data-bbcf-dashboard-card="images" data-bbcf-open-settings="bbcf-image-settings">
                            <span class="bbcf-dashboard-icon"><i class="fa-solid fa-image"></i></span>
                            <span class="bbcf-dashboard-copy"><strong data-bbcf-dashboard-title>Генерация изображений</strong><small data-bbcf-dashboard-meta></small></span>
                            <span data-bbcf-dashboard-status></span>
                            <i class="fa-solid fa-chevron-right bbcf-dashboard-arrow"></i>
                        </button>
                        <button class="bbcf-dashboard-card" type="button" data-bbcf-dashboard-card="draft" data-bbcf-open-settings="bbcf-draft-settings">
                            <span class="bbcf-dashboard-icon"><i class="fa-solid fa-scroll"></i></span>
                            <span class="bbcf-dashboard-copy"><strong data-bbcf-dashboard-title>AI-черновик</strong><small data-bbcf-dashboard-meta></small></span>
                            <span data-bbcf-dashboard-status></span>
                            <i class="fa-solid fa-chevron-right bbcf-dashboard-arrow"></i>
                        </button>
                        <button class="bbcf-dashboard-card" type="button" data-bbcf-dashboard-card="recipe" data-bbcf-open-settings="bbcf-page-settings">
                            <span class="bbcf-dashboard-icon"><i class="fa-solid fa-palette"></i></span>
                            <span class="bbcf-dashboard-copy"><strong data-bbcf-dashboard-title>Настройки страницы</strong><small data-bbcf-dashboard-meta></small></span>
                            <i class="fa-solid fa-chevron-right bbcf-dashboard-arrow"></i>
                        </button>
                        <button class="bbcf-dashboard-card" type="button" data-bbcf-dashboard-card="references" data-bbcf-open-settings="bbcf-reference-settings">
                            <span class="bbcf-dashboard-icon"><i class="fa-solid fa-user-group"></i></span>
                            <span class="bbcf-dashboard-copy"><strong data-bbcf-dashboard-title>Персонажи и гардероб</strong><small data-bbcf-dashboard-meta></small></span>
                            <i class="fa-solid fa-chevron-right bbcf-dashboard-arrow"></i>
                        </button>
                    </div>
                    <button class="menu_button bbcf-primary bbcf-dashboard-open" type="button" id="bbcf-open-modal"><i class="fa-solid fa-book-open"></i><span>Открыть кузницу</span></button>
                    <details class="bbcf-dashboard-preferences">
                        <summary><i class="fa-solid fa-sliders"></i><span>Поведение расширения</span></summary>
                        <div class="bbcf-dashboard-preferences-body">
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-show-fab" ${settings.showFab ? 'checked' : ''}> <span>Показывать плавающую кнопку</span></label>
                            <label class="checkbox_label"><input type="checkbox" id="bbcf-auto-mode" ${settings.autoMode ? 'checked' : ''}> <span>Автоматически после ответа бота</span></label>
                        </div>
                    </details>
                </section>

                <details class="bbcf-section bbcf-settings-details" id="bbcf-image-settings">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-plug"></i><span>Генерация изображений</span><small id="bbcf-image-settings-meta"></small></summary>
                    <p class="bbcf-hint bbcf-provider-note" id="bbcf-provider-note"></p>
                    <div class="bbcf-compact-tools">
                        <div class="bbcf-row">
                            <label for="bbcf-image-connection-profile">Профиль подключения</label>
                            <select id="bbcf-image-connection-profile" class="text_pole">
                                ${buildImageConnectionProfileOptionsHtml(settings)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-image-connection-profile-name">Название профиля</label>
                            <input id="bbcf-image-connection-profile-name" class="text_pole" type="text" value="${escapeHtml(activeImageConnectionProfile?.label || '')}" placeholder="Например: Nano Banana refs">
                        </div>
                        <div class="bbcf-compact-actions">
                            <button class="menu_button" type="button" id="bbcf-save-image-connection-profile"><i class="fa-solid fa-bookmark"></i><span>Сохранить</span></button>
                            <button class="menu_button bbcf-danger" type="button" id="bbcf-delete-image-connection-profile" ${activeImageConnectionProfile ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span>Удалить</span></button>
                        </div>
                    </div>
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
                </details>

                <details class="bbcf-section bbcf-settings-details" id="bbcf-draft-settings">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-scroll"></i><span>AI-черновик</span><small id="bbcf-draft-settings-meta"></small></summary>
                    <p class="bbcf-hint bbcf-draft-connection-note" id="bbcf-draft-connection-note"></p>
                    <div class="bbcf-compact-tools">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-connection-profile">Профиль подключения</label>
                            <select id="bbcf-draft-connection-profile" class="text_pole">
                                ${buildDraftConnectionProfileOptionsHtml(settings)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-draft-connection-profile-name">Название профиля</label>
                            <input id="bbcf-draft-connection-profile-name" class="text_pole" type="text" value="${escapeHtml(activeDraftConnectionProfile?.label || '')}" placeholder="Например: OnlySQ draft proxy">
                        </div>
                        <div class="bbcf-compact-actions">
                            <button class="menu_button" type="button" id="bbcf-save-draft-connection-profile"><i class="fa-solid fa-bookmark"></i><span>Сохранить</span></button>
                            <button class="menu_button bbcf-danger" type="button" id="bbcf-delete-draft-connection-profile" ${activeDraftConnectionProfile ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span>Удалить</span></button>
                        </div>
                    </div>
                    <div class="bbcf-grid-2">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-connection-mode">Кто пишет черновик</label>
                            <select id="bbcf-draft-connection-mode" class="text_pole">
                                ${option('sillytavern', settings.draftConnectionMode, 'Текущая модель SillyTavern')}
                                ${option('openai-chat', settings.draftConnectionMode, 'Отдельный OpenAI-compatible chat')}
                                ${option('gemini', settings.draftConnectionMode, 'Отдельный Gemini-compatible')}
                            </select>
                        </div>
                        <div class="bbcf-row bbcf-draft-tavern-profile-row">
                            <label for="bbcf-draft-tavern-profile">Профиль SillyTavern</label>
                            <select id="bbcf-draft-tavern-profile" class="text_pole">
                                ${buildDraftTavernProfileOptionsHtml(settings)}
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
                </details>

                <details class="bbcf-section bbcf-settings-details" id="bbcf-reference-settings">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-user-group"></i><span>Персонажи и гардероб</span><small id="bbcf-reference-settings-meta"></small></summary>
                    <div class="bbcf-ref-grid">
                        ${buildReferenceSettingsHtml(settings)}
                    </div>
                    <div class="bbcf-wardrobe-panel">
                        <div class="bbcf-wardrobe-head">
                            <div>
                                <h5><i class="fa-solid fa-shirt"></i> Гардероб</h5>
                            </div>
                            <div class="bbcf-wardrobe-head-actions">
                                <button class="menu_button" type="button" data-bbcf-wardrobe-recover title="Найти гардеробные картинки без записи в библиотеке"><i class="fa-solid fa-rotate-left"></i><span>Восстановить</span></button>
                                <button class="menu_button bbcf-primary" type="button" id="bbcf-open-wardrobe"><i class="fa-solid fa-door-open"></i><span>Открыть</span></button>
                            </div>
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
                </details>

                <details class="bbcf-section bbcf-settings-details" id="bbcf-page-settings">
                    <summary class="bbcf-section-title"><i class="fa-solid fa-table-cells-large"></i><span>Страница и тонкая настройка</span><small id="bbcf-page-settings-meta"></small></summary>
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
                    <label class="checkbox_label bbcf-settings-checkbox">
                        <input type="checkbox" id="bbcf-inject-chat-context-image" ${settings.injectChatContextToImagePrompt ? 'checked' : ''}>
                        <span>Добавлять контекст сообщений в prompt изображения</span>
                    </label>
                    <div class="bbcf-grid-2">
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
                    </div>
                    <details class="bbcf-preset-help">
                        <summary><i class="fa-solid fa-palette"></i><span>Примеры и сохранение</span></summary>
                        <div class="bbcf-preset-examples" data-bbcf-preset-list>
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
                    <div class="bbcf-compact-tools">
                        <div class="bbcf-row">
                            <label for="bbcf-draft-prompt-preset">Набор черновика</label>
                            <select id="bbcf-draft-prompt-preset" class="text_pole">
                                ${buildDraftPromptPresetOptionsHtml(settings)}
                            </select>
                        </div>
                        <div class="bbcf-row">
                            <label for="bbcf-draft-prompt-preset-name">Название набора</label>
                            <input id="bbcf-draft-prompt-preset-name" class="text_pole" type="text" value="${escapeHtml(activeDraftPromptPreset?.label || '')}" placeholder="Например: динамичный вебтун">
                        </div>
                        <div class="bbcf-compact-actions">
                            <button class="menu_button" type="button" id="bbcf-save-draft-prompt-preset"><i class="fa-solid fa-bookmark"></i><span>Сохранить</span></button>
                            <button class="menu_button bbcf-danger" type="button" id="bbcf-delete-draft-prompt-preset" ${activeDraftPromptPreset ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span>Удалить</span></button>
                        </div>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-custom-style">Дополнительные инструкции к генерации</label>
                        <textarea id="bbcf-custom-style" class="text_pole" rows="3" placeholder="Разовые правки поверх выбранного стиля: свет, ракурс, темп, материалы.">${escapeHtml(settings.customPrompt)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-character-lock">Описание персонажей</label>
                        <textarea id="bbcf-character-lock" class="text_pole" rows="4" placeholder="Описание персонажей, одежды, особенностей и текущего состояния.">${escapeHtml(settings.characterLock)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-default-panel-notes">План панелей по умолчанию</label>
                        <textarea id="bbcf-default-panel-notes" class="text_pole" rows="4" placeholder="1. Общий план&#10;2. Реакция героя&#10;3. Деталь или вставка">${escapeHtml(settings.defaultPanelNotes)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-default-bubbles">Реплики по умолчанию: panel | type | position | speaker | text</label>
                        <textarea id="bbcf-default-bubbles" class="text_pole" rows="3" placeholder="1|speech|top-left|Dr. Miyamoto|Ты правда это сказала?">${escapeHtml(settings.defaultBubbles)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-default-inserts">Вставки по умолчанию: panel | type | position | text</label>
                        <textarea id="bbcf-default-inserts" class="text_pole" rows="3" placeholder="3|detail|bottom-left|крупный план руки">${escapeHtml(settings.defaultInserts)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-default-sfx">SFX по умолчанию: panel | text</label>
                        <textarea id="bbcf-default-sfx" class="text_pole" rows="2" placeholder="3|БАХ">${escapeHtml(settings.defaultSfx)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-negative">Negative Prompt</label>
                        <textarea id="bbcf-negative" class="text_pole" rows="3">${escapeHtml(settings.negativePrompt)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-prompt">Промпт AI-черновика</label>
                        <textarea id="bbcf-draft-prompt" class="text_pole" rows="6">${escapeHtml(settings.draftPrompt)}</textarea>
                    </div>
                    <div class="bbcf-toolbar">
                        <button class="menu_button" type="button" id="bbcf-reset-page-defaults"><i class="fa-solid fa-rotate-left"></i><span>Вернуть настройки по умолчанию</span></button>
                    </div>
                </details>
            </div>
        </div>
    `;
    container.appendChild(wrapper);
    upgradeDisclosures(wrapper);
    bindSettingsUi(wrapper);
    syncProviderRows();
    syncImageConnectionProfileUi(wrapper);
    syncDraftConnectionRows();
    syncDraftConnectionProfileUi(wrapper);
    syncDraftPromptPresetUi({ forceName: true });
    refreshSettingsDashboard(wrapper);
}

function bindSettingsUi(root) {
    root.querySelector('#bbcf-open-modal')?.addEventListener('click', openForgeModal);
    root.querySelectorAll('[data-bbcf-open-settings]').forEach(button => {
        const section = root.querySelector(`#${button.dataset.bbcfOpenSettings}`);
        if (!section?.classList.contains('bbcf-disclosure')) return;
        const syncExpandedState = () => button.setAttribute('aria-expanded', String(isDisclosureExpanded(section)));
        button.setAttribute('aria-controls', section.id);
        syncExpandedState();
        section.addEventListener('bbcf:toggle', syncExpandedState);
        button.addEventListener('click', () => {
            const shouldOpen = !isDisclosureExpanded(section);
            button.setAttribute('aria-expanded', String(shouldOpen));
            setDisclosureExpanded(section, shouldOpen);
            if (shouldOpen) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
    root.addEventListener('change', () => setTimeout(() => refreshSettingsDashboard(root), 0));
    root.querySelector('#bbcf-test-api')?.addEventListener('click', testApiSettings);
    root.querySelector('#bbcf-load-models')?.addEventListener('click', () => loadProviderModels({ button: root.querySelector('#bbcf-load-models') }));
    root.querySelector('#bbcf-load-draft-models')?.addEventListener('click', () => loadDraftModels({ button: root.querySelector('#bbcf-load-draft-models') }));
    root.querySelector('#bbcf-test-draft-api')?.addEventListener('click', testDraftSettings);
    root.querySelector('#bbcf-open-wardrobe')?.addEventListener('click', openWardrobeModal);
    bindWardrobeRecoveryButtons(root);
    root.querySelector('#bbcf-image-connection-profile')?.addEventListener('change', () => applyImageConnectionProfile(root));
    root.querySelector('#bbcf-save-image-connection-profile')?.addEventListener('click', () => saveImageConnectionProfile(root));
    root.querySelector('#bbcf-delete-image-connection-profile')?.addEventListener('click', () => deleteImageConnectionProfile(root));
    root.querySelector('#bbcf-draft-connection-profile')?.addEventListener('change', () => applyDraftConnectionProfile(root));
    root.querySelector('#bbcf-save-draft-connection-profile')?.addEventListener('click', () => saveDraftConnectionProfile(root));
    root.querySelector('#bbcf-delete-draft-connection-profile')?.addEventListener('click', () => deleteDraftConnectionProfile(root));
    root.querySelector('#bbcf-draft-prompt-preset')?.addEventListener('change', () => applyDraftPromptPreset(root, { source: 'settings' }));
    root.querySelector('#bbcf-save-draft-prompt-preset')?.addEventListener('click', () => saveDraftPromptPreset(root, { source: 'settings' }));
    root.querySelector('#bbcf-delete-draft-prompt-preset')?.addEventListener('click', () => deleteDraftPromptPreset(root));
    bindPresetDeleteActions(root);
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
        syncImageConnectionProfileUi(root);
    });
    bindSettingInput(root, '#bbcf-draft-connection-mode', 'draftConnectionMode', 'value', () => {
        const settings = getSettings();
        settings.availableDraftModels = [];
        if (settings.draftConnectionMode === 'sillytavern') settings.draftModel = '';
        saveSettings();
        syncDraftConnectionRows();
        syncDraftConnectionProfileUi(root);
    });
    bindSettingInput(root, '#bbcf-draft-endpoint', 'draftEndpoint');
    bindSettingInput(root, '#bbcf-draft-api-key', 'draftApiKey');
    bindSettingInput(root, '#bbcf-draft-model', 'draftModel');
    bindSettingInput(root, '#bbcf-draft-temperature', 'draftTemperature');
    bindSettingInput(root, '#bbcf-draft-tavern-profile', 'draftTavernProfileId', 'value', () => syncDraftConnectionRows());
    bindSettingInput(root, '#bbcf-endpoint', 'endpoint');
    bindSettingInput(root, '#bbcf-api-key', 'apiKey');
    bindSettingInput(root, '#bbcf-model', 'model');
    bindSettingInput(root, '#bbcf-openai-size', 'openaiSize');
    bindSettingInput(root, '#bbcf-openai-quality', 'openaiQuality');
    bindSettingInput(root, '#bbcf-image-size', 'imageSize');
    bindSettingInput(root, '#bbcf-naistera-model', 'naisteraModel');
    bindSettingInput(root, '#bbcf-naistera-preset', 'naisteraPreset');
    bindSettingInput(root, '#bbcf-timeout', 'timeoutMs', 'seconds');
    bindSettingInput(root, '#bbcf-generation-mode', 'generationMode', 'value', () => syncDefaultDraftField('generationMode'));
    bindSettingInput(root, '#bbcf-insert-mode', 'insertMode', 'value', () => syncDefaultDraftField('insertMode'));
    bindSettingInput(root, '#bbcf-cooldown', 'requestCooldownMs', 'cooldownSeconds');
    bindSettingInput(root, '#bbcf-panel-count', 'panelCount', 'int', () => syncDefaultDraftField('panelCount'));
    bindSettingInput(root, '#bbcf-concurrency', 'concurrency', 'int');
    bindSettingInput(root, '#bbcf-context-messages', 'contextMessages', 'int');
    bindSettingInput(root, '#bbcf-inject-chat-context-image', 'injectChatContextToImagePrompt', 'checked');
    bindSettingInput(root, '#bbcf-previous-image-count', 'previousImageCount', 'int');
    bindSettingInput(root, '#bbcf-layout', 'layout', 'value', () => syncDefaultDraftField('layout'));
    bindSettingInput(root, '#bbcf-style-preset', 'stylePreset', 'value', () => syncDefaultDraftField('stylePreset'));
    bindSettingInput(root, '#bbcf-custom-style', 'customPrompt', 'value', () => {
        syncDefaultDraftField('customPrompt');
    });
    root.querySelector('#bbcf-save-style')?.addEventListener('click', () => saveStyleFromSettings(root));
    root.querySelector('#bbcf-save-layout')?.addEventListener('click', () => saveLayoutFromSettings(root));
    root.querySelector('#bbcf-reset-page-defaults')?.addEventListener('click', () => resetDefaultPageSettings(root));
    bindSettingInput(root, '#bbcf-character-lock', 'characterLock', 'value', () => syncDefaultDraftField('characterLock'));
    bindSettingInput(root, '#bbcf-default-panel-notes', 'defaultPanelNotes', 'value', () => syncDefaultDraftField('panelNotes'));
    bindSettingInput(root, '#bbcf-default-bubbles', 'defaultBubbles', 'value', () => syncDefaultDraftField('bubbles'));
    bindSettingInput(root, '#bbcf-default-inserts', 'defaultInserts', 'value', () => syncDefaultDraftField('inserts'));
    bindSettingInput(root, '#bbcf-default-sfx', 'defaultSfx', 'value', () => syncDefaultDraftField('sfx'));
    bindSettingInput(root, '#bbcf-negative', 'negativePrompt', 'value', () => {
        syncDefaultDraftField('negativePrompt');
    });
    bindSettingInput(root, '#bbcf-draft-prompt', 'draftPrompt');
}

function resetDefaultPageSettings(root) {
    if (!window.confirm('Вернуть настройки страницы по умолчанию? API, модели, референсы, гардероб и история не изменятся.')) return;
    const settings = getSettings();
    const defaults = DEFAULT_SETTINGS;
    settings.generationMode = defaults.generationMode;
    settings.insertMode = defaults.insertMode;
    settings.panelCount = defaults.panelCount;
    settings.concurrency = defaults.concurrency;
    settings.requestCooldownMs = defaults.requestCooldownMs;
    settings.contextMessages = defaults.contextMessages;
    settings.injectChatContextToImagePrompt = defaults.injectChatContextToImagePrompt;
    settings.previousImageCount = defaults.previousImageCount;
    settings.layout = defaults.layout;
    settings.stylePreset = defaults.stylePreset;
    settings.characterLock = defaults.characterLock;
    settings.customPrompt = defaults.customPrompt;
    settings.negativePrompt = defaults.negativePrompt;
    settings.defaultPanelNotes = defaults.defaultPanelNotes;
    settings.defaultBubbles = defaults.defaultBubbles;
    settings.defaultInserts = defaults.defaultInserts;
    settings.defaultSfx = defaults.defaultSfx;
    settings.draftPrompt = defaults.draftPrompt;
    settings.activeDraftPromptPresetId = '';
    setSettingsControlValue(root, '#bbcf-generation-mode', settings.generationMode);
    setSettingsControlValue(root, '#bbcf-insert-mode', settings.insertMode);
    setSettingsControlValue(root, '#bbcf-panel-count', settings.panelCount);
    setSettingsControlValue(root, '#bbcf-concurrency', settings.concurrency);
    setSettingsControlValue(root, '#bbcf-cooldown', Math.round(settings.requestCooldownMs / 1000));
    setSettingsControlValue(root, '#bbcf-context-messages', settings.contextMessages);
    setSettingsControlValue(root, '#bbcf-inject-chat-context-image', settings.injectChatContextToImagePrompt);
    setSettingsControlValue(root, '#bbcf-previous-image-count', settings.previousImageCount);
    setSettingsControlValue(root, '#bbcf-layout', settings.layout);
    setSettingsControlValue(root, '#bbcf-style-preset', settings.stylePreset);
    setSettingsControlValue(root, '#bbcf-character-lock', settings.characterLock);
    setSettingsControlValue(root, '#bbcf-custom-style', settings.customPrompt);
    setSettingsControlValue(root, '#bbcf-default-panel-notes', settings.defaultPanelNotes);
    setSettingsControlValue(root, '#bbcf-default-bubbles', settings.defaultBubbles);
    setSettingsControlValue(root, '#bbcf-default-inserts', settings.defaultInserts);
    setSettingsControlValue(root, '#bbcf-default-sfx', settings.defaultSfx);
    setSettingsControlValue(root, '#bbcf-negative', settings.negativePrompt);
    setSettingsControlValue(root, '#bbcf-draft-prompt', settings.draftPrompt);
    persistCharacterLockProfile(settings);
    saveSettings();
    syncDraftPromptPresetUi({ forceName: true });
    syncDefaultDraftFields(DRAFT_SYNC_FIELDS);
    toastr.success('Настройки страницы по умолчанию восстановлены.', 'Comic Forge');
}

function setSettingsControlValue(root, selector, value) {
    const input = root?.querySelector?.(selector);
    if (!input) return;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        input.checked = Boolean(value);
        return;
    }
    input.value = String(value ?? '');
}

function buildReferenceSettingsHtml(settings) {
    return settings.references.map(ref => `
        <div class="bbcf-ref-card" data-bbcf-ref="${escapeHtml(ref.id)}" tabindex="0">
            <div class="bbcf-ref-thumb ${ref.path ? 'has-image' : ''}">
                ${ref.path ? `<img src="${escapeHtml(ref.path)}" alt="${escapeHtml(ref.label)}" data-bbcf-ref-image>` : '<i class="fa-solid fa-user"></i>'}
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
                    <button class="menu_button bbcf-ref-paste" type="button" title="Вставить изображение из буфера"><i class="fa-solid fa-paste"></i><span>Вставить</span></button>
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
                <div class="bbcf-wardrobe-library-actions">
                    <button type="button" class="menu_button" data-bbcf-wardrobe-recover title="Найти гардеробные картинки без записи в библиотеке"><i class="fa-solid fa-rotate-left"></i><span>Восстановить</span></button>
                    <button type="button" class="menu_button bbcf-primary" id="bbcf-wardrobe-new"><i class="fa-solid fa-plus"></i><span>Новая вещь</span></button>
                </div>
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
                <div class="bbcf-wardrobe-editor-image-actions">
                    <button class="menu_button" type="button" id="bbcf-wardrobe-editor-upload"><i class="fa-solid fa-upload"></i><span>Картинка</span></button>
                    <button class="menu_button" type="button" id="bbcf-wardrobe-editor-paste" title="Вставить изображение из буфера"><i class="fa-solid fa-paste"></i><span>Вставить</span></button>
                </div>
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
        bindReferenceImageFallbacks(card);
        const id = card.getAttribute('data-bbcf-ref');
        if (!id) return;
        const fileInput = card.querySelector('.bbcf-ref-file');
        card.querySelector('.bbcf-ref-upload')?.addEventListener('click', () => fileInput?.click());
        card.querySelector('.bbcf-ref-paste')?.addEventListener('click', async event => {
            await pasteReferenceImageFromClipboard(id, card, event.currentTarget);
        });
        card.addEventListener('paste', async event => {
            const file = getImageFileFromPasteEvent(event);
            if (!file) return;
            event.preventDefault();
            try {
                await saveReferenceImageFile(file, id, card);
            } catch (error) {
                console.error('[BB Comic Forge] reference paste failed', error);
                toastr.error(error?.message || String(error), 'Comic Forge');
            }
        });
        fileInput?.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const path = await saveReferenceImageToFile(dataUrl, id);
                const ref = updateReference(id, { path }, { immediate: true });
                syncReferenceCard(card, ref);
                toastr.success('Референс сохранен.', 'Comic Forge');
            } catch (error) {
                console.error('[BB Comic Forge] reference upload failed', error);
                toastr.error(error?.message || String(error), 'Comic Forge');
            } finally {
                fileInput.value = '';
            }
        });
        card.querySelector('.bbcf-ref-clear')?.addEventListener('click', () => {
            const ref = updateReference(id, { path: '' }, { immediate: true });
            syncReferenceCard(card, ref);
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

async function pasteReferenceImageFromClipboard(id, card, button = null) {
    try {
        await withBusyButton(button, '<i class="fa-solid fa-spinner fa-spin"></i><span>Вставляю...</span>', async () => {
            const file = await readClipboardImageFile();
            await saveReferenceImageFile(file, id, card);
        });
    } catch (error) {
        console.error('[BB Comic Forge] reference paste failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
    }
}

async function saveReferenceImageFile(file, id, card) {
    const dataUrl = await readFileAsDataUrl(file);
    const path = await saveReferenceImageToFile(dataUrl, id);
    const ref = updateReference(id, { path }, { immediate: true });
    syncReferenceCard(card, ref);
    toastr.success('Референс сохранён.', 'Comic Forge');
    return path;
}

function syncReferenceCard(card, ref) {
    if (!card || !ref) return;
    const thumb = card.querySelector('.bbcf-ref-thumb');
    if (thumb) {
        thumb.classList.toggle('has-image', Boolean(ref.path));
        thumb.classList.remove('is-broken');
        thumb.removeAttribute('title');
        thumb.innerHTML = ref.path
            ? `<img src="${escapeHtml(ref.path)}" alt="${escapeHtml(ref.label)}" data-bbcf-ref-image>`
            : '<i class="fa-solid fa-user"></i>';
        bindReferenceImageFallbacks(card);
    }
    const clearButton = card.querySelector('.bbcf-ref-clear');
    if (clearButton) clearButton.disabled = !ref.path;
}

function bindReferenceImageFallbacks(root) {
    root.querySelectorAll('[data-bbcf-ref-image]').forEach(image => {
        if (image.dataset.bbcfErrorBound) return;
        image.dataset.bbcfErrorBound = '1';
        image.addEventListener('error', () => showBrokenReferenceThumb(image), { once: true });
        if (image.complete && !image.naturalWidth) showBrokenReferenceThumb(image);
    });
}

function showBrokenReferenceThumb(image) {
    const thumb = image.closest('.bbcf-ref-thumb');
    if (!thumb) return;
    thumb.classList.remove('has-image');
    thumb.classList.add('is-broken');
    thumb.title = 'Файл референса не найден в хранилище SillyTavern.';
    thumb.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
}

function bindWardrobeRecoveryButtons(root) {
    root.querySelectorAll('[data-bbcf-wardrobe-recover]').forEach(button => {
        button.addEventListener('click', () => recoverWardrobeReferenceFiles(button));
    });
}

async function recoverWardrobeReferenceFiles(button = null) {
    try {
        await withBusyButton(button, '<i class="fa-solid fa-spinner fa-spin"></i><span>Ищу...</span>', async () => {
            const settings = getSettings();
            const storedPaths = await listStoredReferenceImagePaths();
            const knownPaths = getKnownStoredReferencePaths(settings);
            const orphanWardrobePaths = storedPaths
                .map(normalizeStoredImagePath)
                .filter(path => isWardrobeUploadPath(path) && !knownPaths.has(path));
            const imported = orphanWardrobePaths.map(path => buildRecoveredWardrobeItem(path));

            if (imported.length) {
                settings.wardrobeItems = normalizeWardrobeItems([...imported, ...settings.wardrobeItems]);
                await saveSettingsImmediately();
                refreshSettingsUi();
                if (state.wardrobeModal?.isConnected) renderWardrobeModal();
                toastr.success(`Восстановлено вещей: ${imported.length}.`, 'Comic Forge');
            } else {
                toastr.info('Новых гардеробных картинок не найдено.', 'Comic Forge');
            }

            const brokenPaths = getBrokenStoredReferencePaths(settings, storedPaths);
            const brokenWardrobePaths = getBrokenWardrobeReferencePaths(settings, storedPaths);
            if (brokenPaths.length) {
                console.warn('[BB Comic Forge] stored reference paths point to missing files', brokenPaths);
            }
            if (brokenWardrobePaths.length) {
                toastr.warning(`В гардеробе есть битые ссылки на файлы: ${brokenWardrobePaths.length}. Их можно вернуть только из бэкапа user/images.`, 'Comic Forge');
            }
        });
    } catch (error) {
        console.error('[BB Comic Forge] wardrobe recovery failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
    }
}

async function listStoredReferenceImagePaths() {
    const context = SillyTavern.getContext();
    const response = await fetch('/api/images/list', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            folder: 'bbcf_refs',
            sortField: 'date',
            sortOrder: 'desc',
        }),
    });
    if (!response.ok) {
        const raw = await response.text().catch(() => '');
        throw new Error(raw || `Reference image scan failed: ${response.status}`);
    }
    const files = await response.json();
    return (Array.isArray(files) ? files : [])
        .map(file => normalizeStoredImagePath(`/user/images/bbcf_refs/${file}`))
        .filter(isBbcfReferencePath);
}

function getKnownStoredReferencePaths(settings = getSettings()) {
    const paths = new Set();
    const addPath = value => {
        const path = normalizeStoredImagePath(value);
        if (path) paths.add(path);
    };
    normalizeReferences(settings.references).forEach(ref => addPath(ref.path));
    Object.values(settings.referenceProfiles || {}).forEach(profile => {
        normalizeReferences(profile).forEach(ref => addPath(ref.path));
    });
    normalizeWardrobeItems(settings.wardrobeItems).forEach(item => addPath(item.path));
    return paths;
}

function getBrokenStoredReferencePaths(settings, storedPaths) {
    const available = new Set(storedPaths.map(normalizeStoredImagePath));
    return [...getKnownStoredReferencePaths(settings)]
        .filter(path => isBbcfReferencePath(path) && !available.has(path));
}

function getBrokenWardrobeReferencePaths(settings, storedPaths) {
    const available = new Set(storedPaths.map(normalizeStoredImagePath));
    return normalizeWardrobeItems(settings.wardrobeItems)
        .map(item => normalizeStoredImagePath(item.path))
        .filter(path => isBbcfReferencePath(path) && !available.has(path));
}

function buildRecoveredWardrobeItem(path) {
    const createdAt = parseBbcfUploadTimestamp(path) || Date.now();
    const date = new Date(createdAt);
    const label = Number.isFinite(date.getTime())
        ? date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
        : '';
    return {
        id: makeId('wardrobe-item'),
        name: label ? `Восстановленный образ ${label}` : 'Восстановленный образ',
        description: '',
        path,
        category: 'full',
        target: 'all',
        tags: ['восстановлено'],
        favorite: false,
        createdAt,
    };
}

function parseBbcfUploadTimestamp(path) {
    const fileName = String(path || '').split('/').pop() || '';
    const match = fileName.match(/bbcf_ref_[a-z0-9_]+_(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/i);
    if (!match) return 0;
    const timestamp = Date.parse(`${match[1]}:${match[2]}:${match[3]}.${match[4]}Z`);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeStoredImagePath(path) {
    const normalized = String(path || '').trim().replace(/\\/g, '/');
    if (!normalized) return '';
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function isBbcfReferencePath(path) {
    return /^\/user\/images\/bbcf_refs\/[^/]+$/i.test(normalizeStoredImagePath(path));
}

function isWardrobeUploadPath(path) {
    return /^\/user\/images\/bbcf_refs\/bbcf_ref_wardrobe_item_/i.test(normalizeStoredImagePath(path));
}

function bindWardrobeModalEvents(root) {
    bindWardrobeRecoveryButtons(root);
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
    form.querySelector('#bbcf-wardrobe-editor-paste')?.addEventListener('click', async event => {
        await pasteWardrobeEditorImageFromClipboard(event.currentTarget);
    });
    form.addEventListener('paste', async event => {
        const file = getImageFileFromPasteEvent(event);
        if (!file) return;
        event.preventDefault();
        try {
            await saveWardrobeEditorImageFile(file);
        } catch (error) {
            console.error('[BB Comic Forge] wardrobe paste failed', error);
            toastr.error(error?.message || String(error), 'Comic Forge');
        }
    });
    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            const path = await saveReferenceImageToFile(dataUrl, 'wardrobe_item');
            if (state.wardrobeEditingId && state.wardrobeEditingId !== 'new') {
                updateWardrobeItem(state.wardrobeEditingId, { path }, { immediate: true });
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

async function pasteWardrobeEditorImageFromClipboard(button = null) {
    try {
        await withBusyButton(button, '<i class="fa-solid fa-spinner fa-spin"></i><span>Вставляю...</span>', async () => {
            const file = await readClipboardImageFile();
            await saveWardrobeEditorImageFile(file);
        });
    } catch (error) {
        console.error('[BB Comic Forge] wardrobe paste failed', error);
        toastr.error(error?.message || String(error), 'Comic Forge');
    }
}

async function saveWardrobeEditorImageFile(file) {
    const dataUrl = await readFileAsDataUrl(file);
    const path = await saveReferenceImageToFile(dataUrl, 'wardrobe_item');
    if (state.wardrobeEditingId && state.wardrobeEditingId !== 'new') {
        updateWardrobeItem(state.wardrobeEditingId, { path }, { immediate: true });
    } else {
        state.wardrobeTempPath = path;
    }
    renderWardrobeModal();
    return path;
}

function updateReference(id, patch, options = {}) {
    const settings = getSettings();
    const ref = settings.references.find(item => item.id === id);
    if (!ref) return null;
    Object.assign(ref, patch);
    settings.referenceProfiles[getReferenceProfileKey()] = structuredClone(settings.references);
    if (options.immediate) void saveSettingsImmediately();
    else saveSettings();
    return ref;
}

function updateWardrobeItem(id, patch, options = {}) {
    const settings = getSettings();
    const item = settings.wardrobeItems.find(entry => entry.id === id);
    if (!item) return;
    Object.assign(item, patch);
    if (options.immediate) void saveSettingsImmediately();
    else saveSettings();
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
    void saveSettingsImmediately();
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
        if (key === 'characterLock') persistCharacterLockProfile(settings);
        const normalized = getSettings();
        if (mode === 'int') input.value = String(normalized[key]);
        else if (mode === 'seconds') input.value = String(Math.round(normalized[key] / 1000));
        else if (mode === 'cooldownSeconds') input.value = String(Math.round(normalized[key] / 1000));
        saveSettings();
        if (typeof after === 'function') after();
    });
    input.addEventListener('input', () => {
        let shouldRunAfter = false;
        if (mode === 'int') {
            if (!hasCommittedNumberInput(input)) return;
            const settings = getSettings();
            settings[key] = clampNumberInput(input, Number(input.value));
            saveSettings();
            shouldRunAfter = true;
        } else if (mode === 'seconds' || mode === 'cooldownSeconds') {
            if (!hasCommittedNumberInput(input)) return;
            const settings = getSettings();
            const seconds = clampNumberInput(input, Number(input.value) || (mode === 'seconds' ? 180 : 0));
            settings[key] = seconds * 1000;
            saveSettings();
            shouldRunAfter = true;
        } else if (input.tagName === 'TEXTAREA' || input.type === 'text' || input.type === 'password') {
            const settings = getSettings();
            settings[key] = input.value;
            saveSettings();
        }
        if (shouldRunAfter && typeof after === 'function') after();
    });
}

function hasCommittedNumberInput(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'number') return true;
    const raw = String(input.value || '').trim();
    return raw !== '' && Number.isFinite(Number(raw));
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
    refreshSettingsDashboard(root);
}

function syncImageConnectionProfileUi(root = document.getElementById(SETTINGS_ID), { forceName = false } = {}) {
    if (!root) return;
    const settings = getSettings();
    const active = getActiveImageConnectionProfile(settings);
    updateSelectOptions(root.querySelector('#bbcf-image-connection-profile'), buildImageConnectionProfileOptionsHtml(settings), settings.activeImageConnectionProfileId);
    const name = root.querySelector('#bbcf-image-connection-profile-name');
    if (name && document.activeElement !== name && (forceName || !name.value.trim())) name.value = active?.label || '';
    const deleteButton = root.querySelector('#bbcf-delete-image-connection-profile');
    if (deleteButton) deleteButton.disabled = !active;
}

function applyImageConnectionProfile(root = document.getElementById(SETTINGS_ID)) {
    const settings = getSettings();
    const selectedId = String(root?.querySelector('#bbcf-image-connection-profile')?.value || '');
    const profile = settings.imageConnectionProfiles.find(item => item.id === selectedId);
    if (!profile) {
        settings.activeImageConnectionProfileId = '';
        saveSettings();
        syncImageConnectionProfileUi(root, { forceName: true });
        return;
    }

    applyImageConnectionProfileToSettings(settings, profile);
    settings.activeImageConnectionProfileId = profile.id;
    saveSettings();
    setImageConnectionControls(root, settings);
    syncProviderRows();
    syncImageConnectionProfileUi(root, { forceName: true });
    toastr.success('Профиль генерации картинок применён.', 'Comic Forge');
}

function saveImageConnectionProfile(root = document.getElementById(SETTINGS_ID)) {
    const settings = getSettings();
    const selectedId = settings.activeImageConnectionProfileId || String(root?.querySelector('#bbcf-image-connection-profile')?.value || '');
    const existingIndex = settings.imageConnectionProfiles.findIndex(profile => profile.id === selectedId);
    const label = String(root?.querySelector('#bbcf-image-connection-profile-name')?.value || '').trim()
        || (existingIndex >= 0 ? settings.imageConnectionProfiles[existingIndex].label : `Профиль картинок ${settings.imageConnectionProfiles.length + 1}`);
    const profile = {
        ...buildImageConnectionProfileSnapshot(settings),
        id: existingIndex >= 0 ? settings.imageConnectionProfiles[existingIndex].id : makeId('image-connection'),
        label,
    };
    if (existingIndex >= 0) settings.imageConnectionProfiles[existingIndex] = profile;
    else settings.imageConnectionProfiles.unshift(profile);
    settings.activeImageConnectionProfileId = profile.id;
    saveSettings();
    syncImageConnectionProfileUi(root, { forceName: true });
    toastr.success(existingIndex >= 0 ? 'Профиль генерации картинок обновлён.' : 'Профиль генерации картинок сохранён.', 'Comic Forge');
}

function deleteImageConnectionProfile(root = document.getElementById(SETTINGS_ID)) {
    const settings = getSettings();
    const selectedId = settings.activeImageConnectionProfileId || String(root?.querySelector('#bbcf-image-connection-profile')?.value || '');
    const profile = settings.imageConnectionProfiles.find(item => item.id === selectedId);
    if (!profile) return;
    if (!window.confirm(`Удалить профиль генерации картинок "${profile.label}"?`)) return;
    settings.imageConnectionProfiles = settings.imageConnectionProfiles.filter(item => item.id !== selectedId);
    settings.activeImageConnectionProfileId = '';
    saveSettings();
    syncImageConnectionProfileUi(root, { forceName: true });
    toastr.success('Профиль генерации картинок удалён.', 'Comic Forge');
}

function buildImageConnectionProfileSnapshot(settings) {
    return {
        apiType: settings.apiType,
        endpoint: settings.endpoint,
        apiKey: settings.apiKey,
        model: settings.model,
        availableModels: filterModelNamesForProvider(settings.availableModels, settings.apiType),
        openaiSize: settings.openaiSize,
        openaiQuality: settings.openaiQuality,
        aspectRatio: settings.aspectRatio,
        imageSize: settings.imageSize,
        naisteraModel: settings.naisteraModel,
        naisteraAspectRatio: settings.naisteraAspectRatio,
        naisteraPreset: settings.naisteraPreset,
    };
}

function applyImageConnectionProfileToSettings(settings, profile) {
    settings.apiType = profile.apiType;
    settings.endpoint = profile.endpoint;
    settings.apiKey = profile.apiKey;
    settings.model = profile.model;
    settings.availableModels = filterModelNamesForProvider(profile.availableModels, profile.apiType);
    settings.openaiSize = profile.openaiSize;
    settings.openaiQuality = profile.openaiQuality;
    settings.aspectRatio = profile.aspectRatio;
    settings.imageSize = profile.imageSize;
    settings.naisteraModel = profile.naisteraModel;
    settings.naisteraAspectRatio = profile.naisteraAspectRatio;
    settings.naisteraPreset = profile.naisteraPreset;
}

function setImageConnectionControls(root, settings) {
    setSettingsControlValue(root, '#bbcf-api-type', settings.apiType);
    setSettingsControlValue(root, '#bbcf-endpoint', settings.endpoint);
    setSettingsControlValue(root, '#bbcf-api-key', settings.apiKey);
    setSettingsControlValue(root, '#bbcf-model', settings.model);
    setSettingsControlValue(root, '#bbcf-openai-size', settings.openaiSize);
    setSettingsControlValue(root, '#bbcf-openai-quality', settings.openaiQuality);
    setSettingsControlValue(root, '#bbcf-image-size', settings.imageSize);
    setSettingsControlValue(root, '#bbcf-naistera-model', settings.naisteraModel);
    setSettingsControlValue(root, '#bbcf-naistera-preset', settings.naisteraPreset);
}

function syncDraftConnectionRows() {
    const settings = getSettings();
    const root = document.getElementById(SETTINGS_ID);
    if (!root) return;
    const external = settings.draftConnectionMode !== 'sillytavern';
    root.querySelectorAll('.bbcf-draft-connection-row').forEach(node => node.classList.toggle('bbcf-hidden', !external));
    root.querySelectorAll('.bbcf-draft-tavern-profile-row').forEach(node => node.classList.toggle('bbcf-hidden', external));
    const endpoint = root.querySelector('#bbcf-draft-endpoint');
    if (endpoint) endpoint.placeholder = getDraftEndpointPlaceholder(settings.draftConnectionMode);
    const model = root.querySelector('#bbcf-draft-model');
    if (model) model.placeholder = getDraftModelPlaceholder(settings.draftConnectionMode);
    const datalist = root.querySelector('#bbcf-draft-model-options');
    if (datalist) datalist.innerHTML = buildDraftModelOptionsHtml(settings);
    updateSelectOptions(root.querySelector('#bbcf-draft-tavern-profile'), buildDraftTavernProfileOptionsHtml(settings), settings.draftTavernProfileId);
    const note = root.querySelector('#bbcf-draft-connection-note');
    if (note) note.textContent = getDraftConnectionNote(settings.draftConnectionMode);
    refreshSettingsDashboard(root);
}

function syncDraftConnectionProfileUi(root = document.getElementById(SETTINGS_ID), { forceName = false } = {}) {
    if (!root) return;
    const settings = getSettings();
    const active = getActiveDraftConnectionProfile(settings);
    updateSelectOptions(root.querySelector('#bbcf-draft-connection-profile'), buildDraftConnectionProfileOptionsHtml(settings), settings.activeDraftConnectionProfileId);
    const name = root.querySelector('#bbcf-draft-connection-profile-name');
    if (name && document.activeElement !== name && (forceName || !name.value.trim())) name.value = active?.label || '';
    const deleteButton = root.querySelector('#bbcf-delete-draft-connection-profile');
    if (deleteButton) deleteButton.disabled = !active;
}

function applyDraftConnectionProfile(root = document.getElementById(SETTINGS_ID)) {
    const settings = getSettings();
    const selectedId = String(root?.querySelector('#bbcf-draft-connection-profile')?.value || '');
    const profile = settings.draftConnectionProfiles.find(item => item.id === selectedId);
    if (!profile) {
        settings.activeDraftConnectionProfileId = '';
        saveSettings();
        syncDraftConnectionProfileUi(root, { forceName: true });
        return;
    }
    settings.draftConnectionMode = profile.draftConnectionMode;
    settings.draftEndpoint = profile.draftEndpoint;
    settings.draftApiKey = profile.draftApiKey;
    settings.draftModel = profile.draftModel;
    settings.availableDraftModels = filterDraftModelNames(profile.availableDraftModels, profile.draftConnectionMode);
    settings.draftTemperature = profile.draftTemperature;
    settings.draftTavernProfileId = profile.draftTavernProfileId || '';
    settings.activeDraftConnectionProfileId = profile.id;
    saveSettings();
    setSettingsControlValue(root, '#bbcf-draft-connection-mode', settings.draftConnectionMode);
    setSettingsControlValue(root, '#bbcf-draft-endpoint', settings.draftEndpoint);
    setSettingsControlValue(root, '#bbcf-draft-api-key', settings.draftApiKey);
    setSettingsControlValue(root, '#bbcf-draft-model', settings.draftModel);
    setSettingsControlValue(root, '#bbcf-draft-temperature', settings.draftTemperature);
    setSettingsControlValue(root, '#bbcf-draft-tavern-profile', settings.draftTavernProfileId);
    syncDraftConnectionRows();
    syncDraftConnectionProfileUi(root, { forceName: true });
    toastr.success('Профиль подключения применён.', 'Comic Forge');
}

function saveDraftConnectionProfile(root = document.getElementById(SETTINGS_ID)) {
    const settings = getSettings();
    const selectedId = settings.activeDraftConnectionProfileId || String(root?.querySelector('#bbcf-draft-connection-profile')?.value || '');
    const existingIndex = settings.draftConnectionProfiles.findIndex(profile => profile.id === selectedId);
    const label = String(root?.querySelector('#bbcf-draft-connection-profile-name')?.value || '').trim()
        || (existingIndex >= 0 ? settings.draftConnectionProfiles[existingIndex].label : `Профиль черновика ${settings.draftConnectionProfiles.length + 1}`);
    const profile = {
        id: existingIndex >= 0 ? settings.draftConnectionProfiles[existingIndex].id : makeId('draft-connection'),
        label,
        draftConnectionMode: settings.draftConnectionMode,
        draftEndpoint: settings.draftEndpoint,
        draftApiKey: settings.draftApiKey,
        draftModel: settings.draftModel,
        availableDraftModels: filterDraftModelNames(settings.availableDraftModels, settings.draftConnectionMode),
        draftTemperature: settings.draftTemperature,
        draftTavernProfileId: settings.draftTavernProfileId,
    };
    if (existingIndex >= 0) settings.draftConnectionProfiles[existingIndex] = profile;
    else settings.draftConnectionProfiles.unshift(profile);
    settings.activeDraftConnectionProfileId = profile.id;
    saveSettings();
    syncDraftConnectionProfileUi(root, { forceName: true });
    toastr.success(existingIndex >= 0 ? 'Профиль подключения обновлён.' : 'Профиль подключения сохранён.', 'Comic Forge');
}

function deleteDraftConnectionProfile(root = document.getElementById(SETTINGS_ID)) {
    const settings = getSettings();
    const selectedId = settings.activeDraftConnectionProfileId || String(root?.querySelector('#bbcf-draft-connection-profile')?.value || '');
    const profile = settings.draftConnectionProfiles.find(item => item.id === selectedId);
    if (!profile) return;
    if (!window.confirm(`Удалить профиль подключения "${profile.label}"?`)) return;
    settings.draftConnectionProfiles = settings.draftConnectionProfiles.filter(item => item.id !== selectedId);
    settings.activeDraftConnectionProfileId = '';
    saveSettings();
    syncDraftConnectionProfileUi(root, { forceName: true });
    toastr.success('Профиль подключения удалён.', 'Comic Forge');
}

function syncDraftPromptPresetUi({ forceName = false } = {}) {
    const settings = getSettings();
    const active = getActiveDraftPromptPreset(settings);
    const settingsRoot = document.getElementById(SETTINGS_ID);
    const modalRoot = state.modal?.isConnected ? state.modal : null;
    const targets = [
        { root: settingsRoot, select: '#bbcf-draft-prompt-preset', name: '#bbcf-draft-prompt-preset-name', del: '#bbcf-delete-draft-prompt-preset' },
        { root: modalRoot, select: '#bbcf-forge-draft-prompt-preset', name: '#bbcf-forge-draft-prompt-preset-name', del: '#bbcf-forge-delete-draft-prompt-preset' },
    ];
    for (const target of targets) {
        if (!target.root) continue;
        updateSelectOptions(target.root.querySelector(target.select), buildDraftPromptPresetOptionsHtml(settings), settings.activeDraftPromptPresetId);
        const name = target.root.querySelector(target.name);
        if (name && document.activeElement !== name && (forceName || !name.value.trim())) name.value = active?.label || '';
        const deleteButton = target.root.querySelector(target.del);
        if (deleteButton) deleteButton.disabled = !active;
    }
    refreshSettingsDashboard(settingsRoot);
    refreshForgeWorkflowSummary(modalRoot);
}

function applyDraftPromptPreset(root, { source = 'settings' } = {}) {
    const settings = getSettings();
    const selectSelector = source === 'forge' ? '#bbcf-forge-draft-prompt-preset' : '#bbcf-draft-prompt-preset';
    const selectedId = String(root?.querySelector(selectSelector)?.value || '');
    const preset = settings.draftPromptPresets.find(item => item.id === selectedId);
    if (!preset) {
        settings.activeDraftPromptPresetId = '';
        saveSettings();
        syncDraftPromptPresetUi({ forceName: true });
        refreshForgeWorkflowSummary(root);
        return;
    }
    settings.activeDraftPromptPresetId = preset.id;
    settings.draftPrompt = preset.draftPrompt;
    setSettingsControlValue(document.getElementById(SETTINGS_ID), '#bbcf-draft-prompt', settings.draftPrompt);
    if (source === 'forge') {
        setValueSilent(root, '#bbcf-draft-mode', preset.generationMode);
        setValueSilent(root, '#bbcf-draft-insert-mode', preset.insertMode);
        setValueSilent(root, '#bbcf-draft-count', preset.panelCount);
        syncPresetUi({ styleValue: preset.stylePreset, layoutValue: preset.layout });
        setValueSilent(root, '#bbcf-draft-layout', preset.layout);
        setValueSilent(root, '#bbcf-draft-style', preset.stylePreset);
        setValueSilent(root, '#bbcf-draft-lock', preset.characterLock);
        setValueSilent(root, '#bbcf-draft-notes', preset.panelNotes);
        setValueSilent(root, '#bbcf-draft-bubbles', preset.bubbles);
        setValueSilent(root, '#bbcf-draft-inserts', preset.inserts);
        setValueSilent(root, '#bbcf-draft-sfx', preset.sfx);
        setValueSilent(root, '#bbcf-draft-custom-style', preset.customPrompt);
        setValueSilent(root, '#bbcf-draft-negative', preset.negativePrompt);
        saveSettings();
        saveDraftFromModal(root, { manualFields: DRAFT_SYNC_FIELDS });
    } else {
        settings.generationMode = preset.generationMode;
        settings.insertMode = preset.insertMode;
        settings.panelCount = preset.panelCount;
        settings.layout = preset.layout;
        settings.stylePreset = preset.stylePreset;
        settings.characterLock = preset.characterLock;
        settings.defaultPanelNotes = preset.panelNotes;
        settings.defaultBubbles = preset.bubbles;
        settings.defaultInserts = preset.inserts;
        settings.defaultSfx = preset.sfx;
        settings.customPrompt = preset.customPrompt;
        settings.negativePrompt = preset.negativePrompt;
        persistCharacterLockProfile(settings);
        saveSettings();
        setSettingsControlValue(root, '#bbcf-generation-mode', settings.generationMode);
        setSettingsControlValue(root, '#bbcf-insert-mode', settings.insertMode);
        setSettingsControlValue(root, '#bbcf-panel-count', settings.panelCount);
        syncPresetUi({ styleValue: settings.stylePreset, layoutValue: settings.layout });
        setSettingsControlValue(root, '#bbcf-layout', settings.layout);
        setSettingsControlValue(root, '#bbcf-style-preset', settings.stylePreset);
        setSettingsControlValue(root, '#bbcf-character-lock', settings.characterLock);
        setSettingsControlValue(root, '#bbcf-default-panel-notes', settings.defaultPanelNotes);
        setSettingsControlValue(root, '#bbcf-default-bubbles', settings.defaultBubbles);
        setSettingsControlValue(root, '#bbcf-default-inserts', settings.defaultInserts);
        setSettingsControlValue(root, '#bbcf-default-sfx', settings.defaultSfx);
        setSettingsControlValue(root, '#bbcf-custom-style', settings.customPrompt);
        setSettingsControlValue(root, '#bbcf-negative', settings.negativePrompt);
        syncDefaultDraftFields(DRAFT_SYNC_FIELDS);
    }
    syncDraftPromptPresetUi({ forceName: true });
    refreshForgeWorkflowSummary(state.modal);
    toastr.success('Набор черновика применён.', 'Comic Forge');
}

function saveDraftPromptPreset(root, { source = 'settings' } = {}) {
    const settings = getSettings();
    const nameSelector = source === 'forge' ? '#bbcf-forge-draft-prompt-preset-name' : '#bbcf-draft-prompt-preset-name';
    const selectedId = settings.activeDraftPromptPresetId || String(root?.querySelector(source === 'forge' ? '#bbcf-forge-draft-prompt-preset' : '#bbcf-draft-prompt-preset')?.value || '');
    const existingIndex = settings.draftPromptPresets.findIndex(preset => preset.id === selectedId);
    const label = String(root?.querySelector(nameSelector)?.value || '').trim()
        || (existingIndex >= 0 ? settings.draftPromptPresets[existingIndex].label : `Набор черновика ${settings.draftPromptPresets.length + 1}`);
    const preset = {
        id: existingIndex >= 0 ? settings.draftPromptPresets[existingIndex].id : makeId('draft-prompt'),
        label,
        draftPrompt: String(settings.draftPrompt || DEFAULT_DRAFT_PROMPT),
        generationMode: source === 'forge' ? valueOf(root, '#bbcf-draft-mode') : settings.generationMode,
        insertMode: source === 'forge' ? valueOf(root, '#bbcf-draft-insert-mode') : settings.insertMode,
        panelCount: source === 'forge' ? clampInt(valueOf(root, '#bbcf-draft-count'), 1, MAX_PANELS, settings.panelCount) : settings.panelCount,
        layout: source === 'forge' ? valueOf(root, '#bbcf-draft-layout') : settings.layout,
        stylePreset: source === 'forge' ? valueOf(root, '#bbcf-draft-style') : settings.stylePreset,
        characterLock: source === 'forge' ? valueOf(root, '#bbcf-draft-lock') : settings.characterLock,
        panelNotes: source === 'forge' ? valueOf(root, '#bbcf-draft-notes') : settings.defaultPanelNotes,
        bubbles: source === 'forge' ? valueOf(root, '#bbcf-draft-bubbles') : settings.defaultBubbles,
        inserts: source === 'forge' ? valueOf(root, '#bbcf-draft-inserts') : settings.defaultInserts,
        sfx: source === 'forge' ? valueOf(root, '#bbcf-draft-sfx') : settings.defaultSfx,
        customPrompt: source === 'forge' ? valueOf(root, '#bbcf-draft-custom-style') : String(settings.customPrompt || ''),
        negativePrompt: source === 'forge' ? valueOf(root, '#bbcf-draft-negative') : String(settings.negativePrompt || ''),
    };
    if (existingIndex >= 0) settings.draftPromptPresets[existingIndex] = preset;
    else settings.draftPromptPresets.unshift(preset);
    settings.activeDraftPromptPresetId = preset.id;
    saveSettings();
    syncDraftPromptPresetUi({ forceName: true });
    toastr.success(existingIndex >= 0 ? 'Набор черновика обновлён.' : 'Набор черновика сохранён.', 'Comic Forge');
}

function deleteDraftPromptPreset(root = null) {
    const settings = getSettings();
    const selectedId = settings.activeDraftPromptPresetId
        || String(root?.querySelector('#bbcf-draft-prompt-preset, #bbcf-forge-draft-prompt-preset')?.value || '');
    const preset = settings.draftPromptPresets.find(item => item.id === selectedId);
    if (!preset) return;
    if (!window.confirm(`Удалить набор черновика "${preset.label}"?`)) return;
    settings.draftPromptPresets = settings.draftPromptPresets.filter(item => item.id !== selectedId);
    settings.activeDraftPromptPresetId = '';
    saveSettings();
    syncDraftPromptPresetUi({ forceName: true });
    toastr.success('Набор черновика удалён.', 'Comic Forge');
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

function buildDraftConnectionProfileOptionsHtml(settings, selected = settings.activeDraftConnectionProfileId) {
    const current = option('', selected, 'Текущие настройки');
    const saved = settings.draftConnectionProfiles.map(profile => option(profile.id, selected, profile.label)).join('');
    return `${current}${saved}`;
}

function buildImageConnectionProfileOptionsHtml(settings, selected = settings.activeImageConnectionProfileId) {
    const current = option('', selected, 'Текущие настройки');
    const saved = settings.imageConnectionProfiles.map(profile => option(profile.id, selected, profile.label)).join('');
    return `${current}${saved}`;
}

function buildDraftTavernProfileOptionsHtml(settings, selected = settings.draftTavernProfileId) {
    const profiles = getSupportedTavernDraftProfiles();
    const current = option('', selected, 'Текущий профиль SillyTavern');
    const missing = selected && !profiles.some(profile => profile.id === selected)
        ? option(selected, selected, `Недоступный профиль: ${getDraftTavernProfileLabel(selected) || selected}`)
        : '';
    const saved = profiles.map(profile => option(profile.id, selected, profile.name || profile.id)).join('');
    return `${current}${missing}${saved}`;
}

function getSupportedTavernDraftProfiles() {
    try {
        return ConnectionManagerRequestService.getSupportedProfiles();
    } catch (error) {
        return [];
    }
}

function getDraftTavernProfileLabel(profileId) {
    const id = String(profileId || '');
    if (!id) return '';
    try {
        const profile = SillyTavern.getContext()?.extensionSettings?.connectionManager?.profiles?.find(item => item.id === id);
        return profile?.name || '';
    } catch (error) {
        return '';
    }
}

function getActiveDraftConnectionProfile(settings = getSettings()) {
    return settings.draftConnectionProfiles.find(profile => profile.id === settings.activeDraftConnectionProfileId) || null;
}

function getActiveImageConnectionProfile(settings = getSettings()) {
    return settings.imageConnectionProfiles.find(profile => profile.id === settings.activeImageConnectionProfileId) || null;
}

function buildDraftPromptPresetOptionsHtml(settings, selected = settings.activeDraftPromptPresetId) {
    const current = option('', selected, 'Текущий черновик');
    const saved = settings.draftPromptPresets.map(preset => option(preset.id, selected, preset.label)).join('');
    return `${current}${saved}`;
}

function getActiveDraftPromptPreset(settings = getSettings()) {
    return settings.draftPromptPresets.find(preset => preset.id === settings.activeDraftPromptPresetId) || null;
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
    if (apiType === 'openai-images') return 'OpenAI Images: без референсов используется /images/generations. С включёнными референсами Comic Forge пробует /images/edits; если источник его не поддерживает, запрос повторяется без файлов — только с текстовыми описаниями референсов. Endpoint можно указывать как /v1 или просто базовый URL.';
    if (apiType === 'openai-chat') return 'OpenAI chat: режим для прокси, которые умеют возвращать изображения и читать референсы. OpenAI-compatible endpoint можно указывать базовым URL.';
    if (apiType === 'naistera') return 'Naistera использует отдельные поля model и preset ниже.';
    return '';
}

function getDraftConnectionNote(mode) {
    if (mode === 'sillytavern') {
        const profileId = getSettings().draftTavernProfileId;
        const profile = profileId ? getSupportedTavernDraftProfiles().find(item => item.id === profileId) : null;
        if (profile) return `Используется сохранённый профиль SillyTavern: ${profile.name || profile.id}.`;
        if (profileId) return 'Выбранный профиль SillyTavern недоступен или не поддерживает текстовую генерацию.';
        return 'Используется текущая текстовая модель SillyTavern.';
    }
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
    const builtin = Object.values(STYLE_PRESETS)
        .filter(preset => preset.prompt)
        .map(preset => ({ label: preset.label, prompt: preset.prompt, savedId: '' }));
    const saved = settings.savedStyles.map(style => ({ label: `★ ${style.label}`, prompt: style.prompt, savedId: style.id }));
    const examples = [...builtin, ...saved];
    return `<div class="bbcf-preset-example-group"><strong>Стили</strong>${examples.map(item => `
        <div class="bbcf-preset-example">
            <div class="bbcf-preset-example-top">
                <span>${escapeHtml(item.label)}</span>
                ${item.savedId ? `<button class="menu_button bbcf-icon-button bbcf-danger" type="button" title="Удалить стиль" aria-label="Удалить стиль" data-bbcf-delete-style="${escapeHtml(item.savedId)}"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            </div>
            <p>${escapeHtml(item.prompt)}</p>
        </div>
    `).join('')}</div>`;
}

function buildLayoutExamplesHtml(settings) {
    const saved = settings.savedLayouts.map(layout => ({
        label: `★ ${layout.label}`,
        pattern: layout.pattern,
        intent: layout.intent,
        savedId: layout.id,
    }));
    const builtin = Object.keys(ASPECT_PATTERNS).map(key => ({
        label: key,
        pattern: ASPECT_PATTERNS[key],
        intent: describeLayoutIntent(key, 1, 4),
        savedId: '',
    }));
    return `<div class="bbcf-preset-example-group"><strong>Макеты</strong>${[...builtin, ...saved].map(item => `
        <div class="bbcf-layout-example">
            <div class="bbcf-preset-example-top">
                <span>${escapeHtml(item.label)}</span>
                ${item.savedId ? `<button class="menu_button bbcf-icon-button bbcf-danger" type="button" title="Удалить макет" aria-label="Удалить макет" data-bbcf-delete-layout="${escapeHtml(item.savedId)}"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            </div>
            <div class="bbcf-layout-pattern">${item.pattern.slice(0, 6).map(ratio => `<b>${escapeHtml(ratio)}</b>`).join('')}</div>
            <p>${escapeHtml(item.intent || '')}</p>
        </div>
    `).join('')}</div>`;
}

function bindPresetDeleteActions(root) {
    if (!root || root.dataset.bbcfPresetDeleteBound === '1') return;
    root.dataset.bbcfPresetDeleteBound = '1';
    root.addEventListener('click', event => {
        const styleButton = event.target.closest?.('[data-bbcf-delete-style]');
        if (styleButton) {
            event.preventDefault();
            event.stopPropagation();
            deleteSavedStyle(styleButton.getAttribute('data-bbcf-delete-style'));
            return;
        }
        const layoutButton = event.target.closest?.('[data-bbcf-delete-layout]');
        if (layoutButton) {
            event.preventDefault();
            event.stopPropagation();
            deleteSavedLayout(layoutButton.getAttribute('data-bbcf-delete-layout'));
        }
    });
}

function syncPresetUi({ styleValue = null, layoutValue = null } = {}) {
    const settings = getSettings();
    const settingsRoot = document.getElementById(SETTINGS_ID);
    const draftRoot = state.modal?.isConnected ? state.modal : null;
    const selectedStyle = getStylePresetById(styleValue, settings) ? styleValue : settings.stylePreset;
    const selectedLayout = getLayoutPresetById(layoutValue, settings) ? layoutValue : settings.layout;
    updateSelectOptions(settingsRoot?.querySelector('#bbcf-style-preset'), buildStyleOptionsHtml(settings, selectedStyle), selectedStyle);
    updateSelectOptions(settingsRoot?.querySelector('#bbcf-layout'), buildLayoutOptionsHtml(settings, selectedLayout), selectedLayout);
    const draftStyle = getStylePresetById(valueOf(draftRoot, '#bbcf-draft-style'), settings) ? valueOf(draftRoot, '#bbcf-draft-style') : selectedStyle;
    const draftLayout = getLayoutPresetById(valueOf(draftRoot, '#bbcf-draft-layout'), settings) ? valueOf(draftRoot, '#bbcf-draft-layout') : selectedLayout;
    updateSelectOptions(draftRoot?.querySelector('#bbcf-draft-style'), buildStyleOptionsHtml(settings, draftStyle), draftStyle);
    updateSelectOptions(draftRoot?.querySelector('#bbcf-draft-layout'), buildLayoutOptionsHtml(settings, draftLayout), draftLayout);
    for (const root of [settingsRoot, draftRoot].filter(Boolean)) {
        const list = root.querySelector('[data-bbcf-preset-list]');
        if (list) list.innerHTML = `${buildStyleExamplesHtml(settings)}${buildLayoutExamplesHtml(settings)}`;
    }
    refreshSettingsDashboard(settingsRoot);
    refreshForgeWorkflowSummary(draftRoot);
}

function updateSelectOptions(select, html, value) {
    if (!select) return;
    select.innerHTML = html;
    select.value = value || '';
    if (select.value !== value && select.options.length) select.selectedIndex = 0;
}

function deleteSavedStyle(id) {
    const savedId = String(id || '').trim();
    if (!savedId) return;
    const settings = getSettings();
    const style = settings.savedStyles.find(item => item.id === savedId);
    if (!style) return;
    if (!window.confirm(`Удалить сохраненный стиль "${style.label}"?`)) return;
    settings.savedStyles = settings.savedStyles.filter(item => item.id !== savedId);
    const deletedValue = `saved:${savedId}`;
    if (settings.stylePreset === deletedValue) settings.stylePreset = DEFAULT_SETTINGS.stylePreset;
    if (settings.savedDraft?.stylePreset === deletedValue) settings.savedDraft.stylePreset = settings.stylePreset;
    if (settings.savedDraft) settings.savedDraftProfiles[getSavedDraftProfileKey()] = structuredClone(settings.savedDraft);
    saveSettings();
    syncPresetUi();
    saveDraftFromModal(state.modal);
    toastr.success('Стиль удален.', 'Comic Forge');
}

function deleteSavedLayout(id) {
    const savedId = String(id || '').trim();
    if (!savedId) return;
    const settings = getSettings();
    const layout = settings.savedLayouts.find(item => item.id === savedId);
    if (!layout) return;
    if (!window.confirm(`Удалить сохраненный макет "${layout.label}"?`)) return;
    settings.savedLayouts = settings.savedLayouts.filter(item => item.id !== savedId);
    const deletedValue = `saved:${savedId}`;
    if (settings.layout === deletedValue) settings.layout = DEFAULT_SETTINGS.layout;
    if (settings.savedDraft?.layout === deletedValue) settings.savedDraft.layout = settings.layout;
    if (settings.savedDraft) settings.savedDraftProfiles[getSavedDraftProfileKey()] = structuredClone(settings.savedDraft);
    saveSettings();
    syncPresetUi();
    saveDraftFromModal(state.modal);
    toastr.success('Макет удален.', 'Comic Forge');
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
    syncPresetUi({ styleValue: `saved:${style.id}` });
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
    syncPresetUi({ layoutValue: `saved:${layout.id}` });
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
    syncPresetUi({ styleValue: `saved:${style.id}` });
    const select = root.querySelector('#bbcf-draft-style');
    if (select) {
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
    syncPresetUi({ layoutValue: `saved:${layout.id}` });
    const select = root.querySelector('#bbcf-draft-layout');
    if (select) {
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
        syncDraftConnectionProfileUi();
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
    let wrapper = document.getElementById(FAB_WRAPPER_ID);
    if (!settings.enabled || !settings.showFab) {
        button?.remove();
        wrapper?.remove();
        return;
    }
    const host = findChatButtonHost();
    const useChatLauncher = host !== document.body;
    if (useChatLauncher && !wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = FAB_WRAPPER_ID;
    } else if (!useChatLauncher && wrapper) {
        wrapper.remove();
        wrapper = null;
    }
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
    button.classList.toggle('bbcf-chat-launcher', useChatLauncher);
    placeChatLauncherButton(button, host, wrapper);
}

function findChatButtonHost() {
    return document.getElementById('options_button')?.parentElement
        || document.getElementById('send_form')?.parentElement
        || document.body;
}

function placeChatLauncherButton(button, host, wrapper = null) {
    const launcher = wrapper || button;
    if (wrapper && button.parentElement !== wrapper) {
        wrapper.appendChild(button);
    }

    const optionsButton = document.getElementById('options_button');
    if (optionsButton?.parentElement === host) {
        const next = optionsButton.nextSibling;
        if (launcher.parentElement !== host || launcher.previousSibling !== optionsButton) {
            host.insertBefore(launcher, next);
        }
        return;
    }
    const sendForm = document.getElementById('send_form');
    if (sendForm?.parentElement === host) {
        if (launcher.parentElement !== host || launcher.nextSibling !== sendForm) {
            host.insertBefore(launcher, sendForm);
        }
        return;
    }
    if (launcher.parentElement !== host) host.appendChild(launcher);
}

function getSelectedControlLabel(root, selector, fallback = '') {
    const select = root?.querySelector(selector);
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
}

function refreshForgeWorkflowSummary(root = state.modal) {
    if (!root?.isConnected) return;
    const settings = getSettings();
    const panelCount = clampInt(valueOf(root, '#bbcf-draft-count'), 1, MAX_PANELS, settings.panelCount);
    const generationMode = valueOf(root, '#bbcf-draft-mode') === 'single' ? 'экономно' : 'по панелям';
    const layoutLabel = getSelectedControlLabel(root, '#bbcf-draft-layout', settings.layout);
    const styleLabel = getSelectedControlLabel(root, '#bbcf-draft-style', getStylePresetById(settings.stylePreset, settings)?.label || 'Стиль');
    const selectedDraftPreset = root.querySelector('#bbcf-forge-draft-prompt-preset');
    const draftPresetLabel = selectedDraftPreset?.value ? getSelectedControlLabel(root, '#bbcf-forge-draft-prompt-preset') : '';
    const recipeTitle = root.querySelector('#bbcf-forge-recipe-title');
    const recipeMeta = root.querySelector('#bbcf-forge-recipe-meta');
    if (recipeTitle) recipeTitle.textContent = draftPresetLabel || styleLabel || 'Текущие настройки';
    if (recipeMeta) recipeMeta.textContent = `${layoutLabel} · ${panelCount} пан. · ${generationMode}`;
    const pageSummary = root.querySelector('#bbcf-forge-page-summary');
    if (pageSummary) pageSummary.textContent = `${styleLabel} · ${layoutLabel} · ${panelCount} пан. · ${generationMode}`;

    const characterText = valueOf(root, '#bbcf-draft-lock').trim();
    const referenceCount = settings.references.filter(reference => reference.enabled && reference.path).length;
    const wardrobeCount = settings.wardrobeEnabled ? getWardrobeActiveEntries(settings).length : 0;
    const characterSummary = root.querySelector('#bbcf-forge-character-summary');
    if (characterSummary) {
        const parts = [characterText ? 'описание заполнено' : 'описание не заполнено'];
        if (referenceCount) parts.push(`${referenceCount} реф.`);
        if (wardrobeCount) parts.push(`${wardrobeCount} вещей`);
        characterSummary.textContent = parts.join(' · ');
    }

    const panelLines = splitLines(valueOf(root, '#bbcf-draft-notes')).length;
    const bubbleLines = splitLines(valueOf(root, '#bbcf-draft-bubbles')).length;
    const insertLines = splitLines(valueOf(root, '#bbcf-draft-inserts')).length;
    const sfxLines = splitLines(valueOf(root, '#bbcf-draft-sfx')).length;
    const panelSummary = root.querySelector('#bbcf-forge-panel-summary');
    if (panelSummary) {
        const parts = [panelLines ? `${panelLines} пан.` : 'план не заполнен'];
        if (bubbleLines) parts.push(`${bubbleLines} репл.`);
        if (insertLines) parts.push(`${insertLines} встав.`);
        if (sfxLines) parts.push(`${sfxLines} SFX`);
        panelSummary.textContent = parts.join(' · ');
    }

    const customPrompt = valueOf(root, '#bbcf-draft-custom-style').trim();
    const negativePrompt = valueOf(root, '#bbcf-draft-negative').trim();
    const tuningSummary = root.querySelector('#bbcf-forge-tuning-summary');
    if (tuningSummary) {
        const parts = [draftPresetLabel || 'текущий черновик'];
        if (customPrompt) parts.push('есть доп. инструкции');
        if (negativePrompt) parts.push('есть negative prompt');
        tuningSummary.textContent = parts.join(' · ');
    }

    const sceneReady = Boolean(valueOf(root, '#bbcf-draft-scene').trim());
    const ready = root.querySelector('.bbcf-generate-ready');
    if (ready) {
        ready.classList.toggle('needs-attention', !sceneReady);
        ready.innerHTML = sceneReady
            ? '<i class="fa-solid fa-circle-check"></i><span>Черновик сохраняется автоматически</span>'
            : '<i class="fa-solid fa-circle-exclamation"></i><span>Добавь сцену или создай черновик из чата</span>';
    }
}

function setForgeMobileView(root, view = 'editor') {
    if (!root?.isConnected) return;
    const nextView = view === 'preview' ? 'preview' : 'editor';
    root.dataset.mobileView = nextView;
    root.querySelectorAll('[data-bbcf-mobile-view]').forEach(button => {
        const isActive = button.dataset.bbcfMobileView === nextView;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });
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
    const activeDraftPromptPreset = getActiveDraftPromptPreset(settings);
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
            <div class="bbcf-mobile-view-tabs" role="tablist" aria-label="Раздел кузницы">
                <button type="button" class="is-active" role="tab" aria-selected="true" aria-controls="bbcf-draft-form" data-bbcf-mobile-view="editor"><i class="fa-solid fa-pen-to-square"></i><span>Редактор</span></button>
                <button type="button" role="tab" aria-selected="false" aria-controls="bbcf-preview-panel" data-bbcf-mobile-view="preview"><i class="fa-solid fa-image"></i><span>Превью</span></button>
            </div>
            <div class="bbcf-modal-body">
                <form class="bbcf-form" id="bbcf-draft-form">
                    <div class="bbcf-form-content">
                    <section class="bbcf-recipe-bar">
                        <div class="bbcf-recipe-icon"><i class="fa-solid fa-palette"></i></div>
                        <div class="bbcf-recipe-copy">
                            <span class="bbcf-eyebrow">Текущий рецепт</span>
                            <strong id="bbcf-forge-recipe-title">${escapeHtml(activeDraftPromptPreset?.label || getStylePresetById(savedDraft.stylePreset, settings)?.label || 'Текущие настройки')}</strong>
                            <small id="bbcf-forge-recipe-meta"></small>
                        </div>
                        <span class="bbcf-status-chip is-ready"><i class="fa-solid fa-check"></i><span>Готово</span></span>
                    </section>
                    <details class="bbcf-workflow-card bbcf-workflow-page" open>
                        <summary>
                            <span class="bbcf-workflow-number">1</span>
                            <span class="bbcf-workflow-heading"><strong>Страница</strong><small id="bbcf-forge-page-summary"></small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
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
                            <div class="bbcf-preset-list" data-bbcf-preset-list>
                                ${buildStyleExamplesHtml(settings)}
                                ${buildLayoutExamplesHtml(settings)}
                            </div>
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
                        </div>
                    </details>
                    <details class="bbcf-workflow-card bbcf-workflow-scene" open>
                        <summary>
                            <span class="bbcf-workflow-number">2</span>
                            <span class="bbcf-workflow-heading"><strong>Сцена</strong><small>Опиши вручную или собери из текущего чата</small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-field bbcf-scene-field">
                        <label for="bbcf-draft-scene">Что происходит на странице</label>
                        <textarea id="bbcf-draft-scene" class="text_pole" rows="5" placeholder="Что должно произойти на странице. Можно писать по-русски.">${escapeHtml(savedDraft.scene)}</textarea>
                    </div>
                            <button class="menu_button bbcf-ai-draft-action" type="button" id="bbcf-ai-draft"><i class="fa-solid fa-scroll"></i><span>Черновик из чата</span></button>
                        </div>
                    </details>
                    <div class="bbcf-workflow-stack">
                    <details class="bbcf-workflow-card">
                        <summary>
                            <span class="bbcf-workflow-number">3</span>
                            <span class="bbcf-workflow-heading"><strong>Персонажи</strong><small id="bbcf-forge-character-summary"></small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-field">
                        <label for="bbcf-draft-lock">Описание персонажей</label>
                        <textarea id="bbcf-draft-lock" class="text_pole" rows="4">${escapeHtml(savedDraft.characterLock)}</textarea>
                    </div>
                        </div>
                    </details>
                    <details class="bbcf-workflow-card" open>
                        <summary>
                            <span class="bbcf-workflow-number">4</span>
                            <span class="bbcf-workflow-heading"><strong>Панели и текст</strong><small id="bbcf-forge-panel-summary"></small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-field">
                        <label for="bbcf-draft-notes">План панелей, по одной строке</label>
                        <textarea id="bbcf-draft-notes" class="text_pole" rows="5" placeholder="1. Общий план коридора&#10;2. Крупный план лица&#10;3. Комедийный insert">${escapeHtml(savedDraft.panelNotes)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-bubbles">Реплики для модели: panel | type | position | speaker | text</label>
                        <textarea id="bbcf-draft-bubbles" class="text_pole" rows="4" placeholder="1|speech|top-left|Dr. Miyamoto|Ты правда это сказала?&#10;2|thought|bottom-right|Akiko|Сердце сбилось с ритма">${escapeHtml(savedDraft.bubbles)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-inserts">Вставки: panel | type | position | text</label>
                        <textarea id="bbcf-draft-inserts" class="text_pole" rows="3" placeholder="3|detail|bottom-left|крупный план руки на плече&#10;4|chibi|bottom-right|маленькая сердитая чиби-реакция с табличкой">${escapeHtml(savedDraft.inserts)}</textarea>
                    </div>
                    <div class="bbcf-field">
                        <label for="bbcf-draft-sfx">SFX: panel | text</label>
                        <textarea id="bbcf-draft-sfx" class="text_pole" rows="2" placeholder="3|БАХ">${escapeHtml(savedDraft.sfx)}</textarea>
                    </div>
                        </div>
                    </details>
                    <details class="bbcf-workflow-card">
                        <summary>
                            <span class="bbcf-workflow-number"><i class="fa-solid fa-sliders"></i></span>
                            <span class="bbcf-workflow-heading"><strong>Тонкая настройка</strong><small id="bbcf-forge-tuning-summary"></small></span>
                        </summary>
                        <div class="bbcf-workflow-body">
                    <div class="bbcf-compact-tools">
                        <div class="bbcf-field">
                            <label for="bbcf-forge-draft-prompt-preset">Набор черновика</label>
                            <select id="bbcf-forge-draft-prompt-preset" class="text_pole">
                                ${buildDraftPromptPresetOptionsHtml(settings)}
                            </select>
                        </div>
                        <div class="bbcf-field">
                            <label for="bbcf-forge-draft-prompt-preset-name">Название набора</label>
                            <input id="bbcf-forge-draft-prompt-preset-name" class="text_pole" type="text" value="${escapeHtml(activeDraftPromptPreset?.label || '')}" placeholder="Например: нежная акварель">
                        </div>
                        <div class="bbcf-compact-actions">
                            <button class="menu_button" type="button" id="bbcf-forge-save-draft-prompt-preset"><i class="fa-solid fa-bookmark"></i><span>Сохранить</span></button>
                            <button class="menu_button bbcf-danger" type="button" id="bbcf-forge-delete-draft-prompt-preset" ${activeDraftPromptPreset ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span>Удалить</span></button>
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
                    </div>
                    </div>
                    <div class="bbcf-toolbar bbcf-generate-toolbar">
                        <span class="bbcf-generate-ready"><i class="fa-solid fa-circle-check"></i><span>Черновик сохраняется автоматически</span></span>
                        <button class="menu_button bbcf-primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Сгенерировать страницу</span></button>
                    </div>
                </form>
                <div class="bbcf-preview" id="bbcf-preview-panel">
                    <div class="bbcf-preview-actions">
                        <button class="menu_button bbcf-primary bbcf-hidden" type="button" id="bbcf-send-to-chat" title="Отправить текущий комикс в чат"><i class="fa-solid fa-paper-plane"></i><span>Отправить в чат</span></button>
                        <button class="menu_button" type="button" id="bbcf-save-page-image" title="Сохранить весь оформленный комикс одним PNG"><i class="fa-solid fa-file-image"></i><span>Сохранить PNG</span></button>
                        <button class="menu_button" type="button" id="bbcf-show-history" title="Показать последние созданные комиксы"><i class="fa-solid fa-images"></i><span>История</span></button>
                        <button class="menu_button bbcf-hidden" type="button" id="bbcf-close-history-preview"><i class="fa-solid fa-arrow-left"></i><span>К текущему превью</span></button>
                        <button class="menu_button" type="button" id="bbcf-clear-preview" title="Очистить текущее превью"><i class="fa-solid fa-eraser"></i><span>Очистить превью</span></button>
                    </div>
                    <details class="bbcf-final-prompt" id="bbcf-final-prompt-details">
                        <summary><i class="fa-solid fa-terminal"></i><span>Prompt изображения</span></summary>
                        <div class="bbcf-final-prompt-body">
                            <div class="bbcf-final-prompt-actions">
                                <button class="menu_button" type="button" id="bbcf-refresh-final-prompt"><i class="fa-solid fa-rotate"></i><span>Обновить</span></button>
                                <button class="menu_button" type="button" id="bbcf-copy-final-prompt"><i class="fa-solid fa-copy"></i><span>Копировать всё</span></button>
                            </div>
                            <div class="bbcf-final-prompt-note">Показывает текстовый prompt image-запроса. Референс-картинки прикладываются отдельно, если провайдер их поддерживает.</div>
                            <div id="bbcf-final-prompt-list" class="bbcf-final-prompt-list">
                                <pre class="bbcf-final-prompt-placeholder">Открой блок, чтобы собрать prompt изображения из текущего черновика.</pre>
                            </div>
                        </div>
                    </details>
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
    upgradeDisclosures(root);
    root.querySelectorAll('[data-bbcf-close]').forEach(node => node.addEventListener('click', closeForgeModal));
    root.querySelector('#bbcf-modal-minimize')?.addEventListener('click', minimizeForgeModal);
    root.querySelectorAll('[data-bbcf-mobile-view]').forEach(button => button.addEventListener('click', () => setForgeMobileView(root, button.dataset.bbcfMobileView)));
    bindDraftPersistence(root);
    bindComicUtilityActions(root);
    bindFinalPromptPreview(root);
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
        refreshForgeWorkflowSummary(root);
    });
    root.querySelector('#bbcf-draft-save-style')?.addEventListener('click', () => saveStyleFromDraft(root));
    root.querySelector('#bbcf-draft-save-layout')?.addEventListener('click', () => saveLayoutFromDraft(root));
    root.querySelector('#bbcf-forge-draft-prompt-preset')?.addEventListener('change', () => applyDraftPromptPreset(root, { source: 'forge' }));
    root.querySelector('#bbcf-forge-save-draft-prompt-preset')?.addEventListener('click', () => saveDraftPromptPreset(root, { source: 'forge' }));
    root.querySelector('#bbcf-forge-delete-draft-prompt-preset')?.addEventListener('click', () => deleteDraftPromptPreset(root));
    bindPresetDeleteActions(root);
    root.querySelector('#bbcf-draft-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await handleGenerateFromModal(root);
    });
    root.querySelector('#bbcf-draft-form')?.addEventListener('input', () => refreshForgeWorkflowSummary(root));
    root.querySelector('#bbcf-draft-form')?.addEventListener('change', () => refreshForgeWorkflowSummary(root));
    syncDraftPromptPresetUi();
    refreshForgeWorkflowSummary(root);
    setForgeMobileView(root, 'editor');
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
        const shouldCancel = window.confirm('Генерация уже идет. Закрыть кузницу и отменить ее? Если нужно оставить генерацию в фоне, нажми "Отмена" и сверни окно.');
        if (!shouldCancel) return;
        cancelActiveGeneration();
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

function startGenerationSession() {
    const controller = new AbortController();
    controller.bbcfRunId = ++state.generationRunId;
    state.generationAbortController = controller;
    state.generationCancelRequested = false;
    state.generationCancelNotified = false;
    return controller;
}

function finishGenerationSession(controller) {
    if (state.generationAbortController !== controller) return;
    state.generationAbortController = null;
    state.generationCancelRequested = false;
    state.generationCancelNotified = false;
}

function cancelActiveGeneration() {
    state.generationCancelRequested = true;
    if (!state.generationCancelNotified) {
        toastr.warning('Генерация отменена.', 'Comic Forge');
        state.generationCancelNotified = true;
    }
    const controller = state.generationAbortController;
    if (controller && !controller.signal.aborted) {
        controller.abort(createCancellationError());
    }
}

function throwIfGenerationStale(controller) {
    throwIfAborted(controller?.signal);
    if (!controller || state.generationAbortController !== controller) throw createCancellationError();
}

async function handleGenerateFromModal(root) {
    if (state.generating) return;
    const draft = readDraftFromModal(root);
    if (!draft.scene.trim()) {
        toastr.warning('Опиши сцену для комикса.', 'Comic Forge');
        return;
    }
    const controller = startGenerationSession();
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
            signal: controller.signal,
        });
        throwIfGenerationStale(controller);
        state.pendingComic = { draft, html: makeShareHtml(html), sent: false };
        attachForgePreviewPanelControls(root);
        updateSendToChatButton(root);
        updateFloatingButton();
        toastr.success('Комикс готов. Проверь превью и отправь его в чат.', 'Comic Forge');
        setForgeMobileView(root, 'preview');
    } catch (error) {
        if (isAbortError(error) || state.generationCancelRequested) {
            console.info('[BB Comic Forge] generation cancelled');
            if (!state.generationCancelNotified && root?.isConnected) {
                toastr.info('Генерация отменена.', 'Comic Forge');
                state.generationCancelNotified = true;
            }
        } else {
            console.error('[BB Comic Forge] generation failed', error);
            toastr.error(error?.message || String(error), 'Comic Forge');
        }
    } finally {
        finishGenerationSession(controller);
        state.generating = false;
        updateSendToChatButton(root);
        updateFloatingButton();
    }
}

function getDraftDefaultValue(field, settings = getSettings()) {
    if (field === 'panelCount') return clampInt(settings.panelCount, 1, MAX_PANELS, DEFAULT_SETTINGS.panelCount);
    if (field === 'generationMode') return ['panels', 'single'].includes(settings.generationMode) ? settings.generationMode : DEFAULT_SETTINGS.generationMode;
    if (field === 'insertMode') return ['new', 'append_last'].includes(settings.insertMode) ? settings.insertMode : DEFAULT_SETTINGS.insertMode;
    if (field === 'layout') return getLayoutPresetById(settings.layout, settings) ? settings.layout : DEFAULT_SETTINGS.layout;
    if (field === 'stylePreset') return getStylePresetById(settings.stylePreset, settings) ? settings.stylePreset : DEFAULT_SETTINGS.stylePreset;
    if (field === 'characterLock') return String(settings.characterLock || '');
    if (field === 'panelNotes') return String(settings.defaultPanelNotes || '');
    if (field === 'bubbles') return String(settings.defaultBubbles || '');
    if (field === 'inserts') return String(settings.defaultInserts || '');
    if (field === 'sfx') return String(settings.defaultSfx || '');
    if (field === 'customPrompt') return String(settings.customPrompt || '');
    if (field === 'negativePrompt') return String(settings.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT);
    return settings[field];
}

function normalizeDraftSyncValue(field, value, settings = getSettings()) {
    if (field === 'panelCount') return String(clampInt(value, 1, MAX_PANELS, getDraftDefaultValue(field, settings)));
    return String(value ?? '');
}

function draftSyncValuesEqual(field, value, defaultValue, settings = getSettings()) {
    return normalizeDraftSyncValue(field, value, settings) === normalizeDraftSyncValue(field, defaultValue, settings);
}

function inferDraftManualFields(rawDraft, settings = getSettings()) {
    if (!rawDraft || typeof rawDraft !== 'object') return [];
    return DRAFT_SYNC_FIELDS.filter(field =>
        Object.hasOwn(rawDraft, field)
        && !draftSyncValuesEqual(field, rawDraft[field], getDraftDefaultValue(field, settings), settings));
}

function getDraftManualFields(rawDraft, settings = getSettings()) {
    const rawFields = Array.isArray(rawDraft?.manualFields) ? rawDraft.manualFields : null;
    const fields = rawFields || inferDraftManualFields(rawDraft, settings);
    return uniqueStrings(fields).filter(field => DRAFT_SYNC_FIELDS.includes(field));
}

function getDraftSyncFieldForInput(input) {
    if (!(input instanceof HTMLElement)) return '';
    return Object.entries(DRAFT_SYNC_SELECTORS).find(([, selector]) => input.matches(selector))?.[0] || '';
}

function setDraftFieldControlValue(root, field, value) {
    const selector = DRAFT_SYNC_SELECTORS[field];
    if (!selector) return;
    setValueSilent(root, selector, value);
}

function syncDefaultDraftField(field) {
    syncDefaultDraftFields([field]);
}

function syncDefaultDraftFields(fields = DRAFT_SYNC_FIELDS) {
    const root = state.modal?.isConnected ? state.modal : null;
    if (!root || state.generating) return;
    const settings = getSettings();
    const manualFields = new Set(getDraftManualFields(settings.savedDraft || {}, settings));
    let changed = false;
    for (const field of fields) {
        if (!DRAFT_SYNC_FIELDS.includes(field) || manualFields.has(field)) continue;
        setDraftFieldControlValue(root, field, getDraftDefaultValue(field, settings));
        changed = true;
    }
    if (changed) saveDraftFromModal(root);
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
        inserts: valueOf(root, '#bbcf-draft-inserts'),
        sfx: valueOf(root, '#bbcf-draft-sfx'),
        customPrompt: valueOf(root, '#bbcf-draft-custom-style'),
        negativePrompt: valueOf(root, '#bbcf-draft-negative'),
    };
}

function getSavedDraft(settings = getSettings()) {
    const raw = settings.savedDraft && typeof settings.savedDraft === 'object' ? settings.savedDraft : {};
    const manualFields = getDraftManualFields(raw, settings);
    const manual = new Set(manualFields);
    const synced = field => manual.has(field) ? raw[field] : getDraftDefaultValue(field, settings);
    return {
        title: String(raw.title || 'Comic page'),
        generationMode: ['panels', 'single'].includes(synced('generationMode')) ? synced('generationMode') : settings.generationMode,
        bubbleMode: 'model',
        insertMode: ['new', 'append_last'].includes(synced('insertMode')) ? synced('insertMode') : settings.insertMode,
        panelCount: clampInt(synced('panelCount'), 1, MAX_PANELS, settings.panelCount),
        layout: getLayoutPresetById(synced('layout'), settings) ? synced('layout') : settings.layout,
        stylePreset: getStylePresetById(synced('stylePreset'), settings) ? synced('stylePreset') : settings.stylePreset,
        scene: String(raw.scene || ''),
        characterLock: String(synced('characterLock') ?? settings.characterLock ?? ''),
        panelNotes: String(synced('panelNotes') || ''),
        bubbles: String(synced('bubbles') || ''),
        inserts: String(synced('inserts') || ''),
        sfx: String(synced('sfx') || ''),
        customPrompt: String(manual.has('customPrompt') ? (raw.customPrompt ?? raw.customStyle ?? '') : settings.customPrompt ?? settings.customStyle ?? ''),
        negativePrompt: String(manual.has('negativePrompt') ? (raw.negativePrompt ?? '') : settings.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT),
        manualFields,
    };
}

function applySavedDraftToModal(root, draft) {
    if (!root?.isConnected || !draft) return;
    setValueSilent(root, '#bbcf-draft-title', draft.title || 'Comic page');
    setValueSilent(root, '#bbcf-draft-mode', draft.generationMode || getSettings().generationMode);
    setValueSilent(root, '#bbcf-draft-insert-mode', draft.insertMode || getSettings().insertMode);
    setValueSilent(root, '#bbcf-draft-count', draft.panelCount || getSettings().panelCount);
    syncPresetUi({ styleValue: draft.stylePreset, layoutValue: draft.layout });
    setValueSilent(root, '#bbcf-draft-layout', draft.layout || getSettings().layout);
    setValueSilent(root, '#bbcf-draft-style', draft.stylePreset || getSettings().stylePreset);
    setValueSilent(root, '#bbcf-draft-scene', draft.scene || '');
    setValueSilent(root, '#bbcf-draft-lock', draft.characterLock || '');
    setValueSilent(root, '#bbcf-draft-notes', draft.panelNotes || '');
    setValueSilent(root, '#bbcf-draft-bubbles', draft.bubbles || '');
    setValueSilent(root, '#bbcf-draft-inserts', draft.inserts || '');
    setValueSilent(root, '#bbcf-draft-sfx', draft.sfx || '');
    setValueSilent(root, '#bbcf-draft-custom-style', draft.customPrompt || '');
    setValueSilent(root, '#bbcf-draft-negative', draft.negativePrompt ?? getSettings().negativePrompt);
    refreshForgeWorkflowSummary(root);
}

function saveDraftToSettings(draft, { manualField = '', manualFields = [], replaceManualFields = null } = {}) {
    const settings = getSettings();
    const profileKey = getSavedDraftProfileKey();
    const previousDraft = normalizeSavedDraft(settings.savedDraftProfiles?.[profileKey] || settings.savedDraft) || {};
    const nextManualFields = new Set(Array.isArray(replaceManualFields) ? replaceManualFields : getDraftManualFields(previousDraft, settings));
    for (const field of [manualField, ...manualFields]) {
        if (DRAFT_SYNC_FIELDS.includes(field)) nextManualFields.add(field);
    }
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
        inserts: String(draft.inserts || ''),
        sfx: String(draft.sfx || ''),
        customPrompt: String(draft.customPrompt ?? draft.customStyle ?? ''),
        negativePrompt: String(draft.negativePrompt ?? ''),
        manualFields: [...nextManualFields],
    };
    settings.savedDraftProfiles[profileKey] = structuredClone(settings.savedDraft);
    settings.activeSavedDraftProfileKey = profileKey;
    saveSettings();
}

function saveDraftFromModal(root, options = {}) {
    if (!root?.isConnected) return;
    try {
        saveDraftToSettings(readDraftFromModal(root), options);
    } catch (error) {
        console.warn('[BB Comic Forge] draft autosave failed', error);
    }
}

function bindDraftPersistence(root) {
    const form = root.querySelector('#bbcf-draft-form');
    if (!form) return;
    const persist = event => {
        if (event?.type === 'input' && !hasCommittedNumberInput(event?.target)) return;
        if (event?.type === 'change') normalizeDraftNumberInput(event?.target);
        const manualField = getDraftSyncFieldForInput(event?.target);
        saveDraftFromModal(root, { manualField });
    };
    form.addEventListener('input', persist);
    form.addEventListener('change', persist);
}

function normalizeDraftNumberInput(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'number') return;
    input.value = String(clampNumberInput(input, Number(input.value) || 0));
}

async function fillDraftFromAi(root, { throwErrors = false, signal = null } = {}) {
    const button = root.querySelector('#bbcf-ai-draft');
    const previousHtml = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Черновик...';
    }
    try {
        throwIfAborted(signal);
        const prompt = buildDraftPrompt(root);
        const raw = await runDraftPrompt(prompt, signal);
        throwIfAborted(signal);
        const draft = extractJsonObject(raw);
        applyAiDraft(root, draft);
        saveDraftFromModal(root);
        refreshForgeWorkflowSummary(root);
        toastr.success('Черновик комикса собран.', 'Comic Forge');
    } catch (error) {
        if (isAbortError(error)) {
            console.info('[BB Comic Forge] draft generation cancelled');
        } else {
            console.error('[BB Comic Forge] draft generation failed', error);
            toastr.error(error?.message || String(error), 'Comic Forge');
        }
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
    const userPersona = resolveMacroText('{{persona}}') || 'No user persona description is available.';
    const characterContext = buildCharacterMacroContext() || 'No character card context is available.';
    return String(settings.draftPrompt || DEFAULT_DRAFT_PROMPT)
        .replaceAll('{{recent_chat}}', recentChat || 'No recent chat context is available.')
        .replaceAll('{{character_lock}}', characterLock || 'No character lock was provided.')
        .replaceAll('{{user_persona}}', userPersona)
        .replaceAll('{{character_context}}', characterContext)
        .replaceAll('{{panel_count}}', String(panelCount));
}

function buildCharacterMacroContext() {
    const lines = [
        ['Name', resolveMacroText('{{char}}')],
        ['Description', resolveMacroText('{{description}}')],
        ['Personality', resolveMacroText('{{personality}}')],
        ['Scenario', resolveMacroText('{{scenario}}')],
    ];
    return lines
        .filter(([, value]) => value)
        .map(([label, value]) => `${label}: ${value}`)
        .join('\n');
}

function resolveMacroText(text) {
    try {
        const result = substituteParams(String(text || ''));
        const resolved = String(result || '').replace(/\r/g, '').trim();
        return /\{\{[^}]+\}\}/.test(resolved) ? '' : resolved;
    } catch (error) {
        console.warn('[BB Comic Forge] macro substitution failed', error);
        return '';
    }
}

async function runDraftPrompt(prompt, signal = null) {
    const settings = getSettings();
    if (settings.draftConnectionMode === 'openai-chat') return runOpenAiDraftPrompt(prompt, settings, signal);
    if (settings.draftConnectionMode === 'gemini') return runGeminiDraftPrompt(prompt, settings, signal);
    if (settings.draftTavernProfileId) return runTavernProfileDraftPrompt(prompt, settings, signal);
    throwIfAborted(signal);
    const result = await runQuietPrompt(prompt);
    throwIfAborted(signal);
    return result;
}

async function runTavernProfileDraftPrompt(prompt, settings, signal = null) {
    const profileId = String(settings.draftTavernProfileId || '').trim();
    const profile = getSupportedTavernDraftProfiles().find(item => item.id === profileId);
    if (!profile) throw new Error('Профиль SillyTavern для черновика не найден или не поддерживается Connection Manager.');

    try {
        throwIfAborted(signal);
        const response = await ConnectionManagerRequestService.sendRequest(
            profile.id,
            [
                { role: 'system', content: 'Return only valid JSON. No markdown. No commentary.' },
                { role: 'user', content: prompt },
            ],
            // Leave max_tokens unset; reasoning models can spend tokens before producing content.
            undefined,
            { stream: false, signal, extractData: true, includePreset: true, includeInstruct: true },
            { temperature: settings.draftTemperature },
        );
        throwIfAborted(signal);
        const text = typeof response === 'string' ? response : response?.content;
        if (!text) throw new Error('Профиль SillyTavern не вернул текст черновика.');
        return text;
    } catch (error) {
        if (isAbortError(error) || isAbortError(error?.cause)) throw createCancellationError();
        const cause = error?.cause;
        throw new Error(cause?.message || error?.message || String(error));
    }
}

async function runOpenAiDraftPrompt(prompt, settings, signal = null) {
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
            signal,
        });
    } catch (error) {
        if (!/response_format|json_object/i.test(error?.message || '')) throw error;
        const fallbackBody = { ...body };
        delete fallbackBody.response_format;
        result = await fetchJson(`${normalizeOpenAiBase(endpoint)}/chat/completions`, {
            method: 'POST',
            headers: draftApiHeaders(apiKey),
            body: JSON.stringify(fallbackBody),
            signal,
        });
    }
    const text = extractTextFromChatResult(result);
    if (!text) throw new Error('API черновика не вернул текст.');
    return text;
}

async function runGeminiDraftPrompt(prompt, settings, signal = null) {
    const endpoint = settings.draftEndpoint || settings.endpoint;
    const apiKey = settings.draftApiKey || settings.apiKey;
    const model = settings.draftModel || 'gemini-2.5-flash';
    if (!endpoint) throw new Error('Endpoint черновика не настроен.');
    if (!apiKey) throw new Error('API key черновика не настроен.');
    const result = await fetchJson(normalizeGeminiGenerateUrl(endpoint, model), {
        method: 'POST',
        headers: draftGeminiApiHeaders(endpoint, apiKey),
        signal,
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
        return context.generateQuietPrompt({ quietPrompt: prompt });
    }
    if (typeof window.generateQuietPrompt === 'function') {
        return window.generateQuietPrompt({ quietPrompt: prompt });
    }
    throw new Error('generateQuietPrompt не найден в SillyTavern.');
}

function extractJsonObject(raw) {
    const text = String(raw || '').trim();
    const candidates = uniqueStrings([
        text,
        ...extractCodeFenceBodies(text),
        findBalancedJsonObject(text),
        repairTruncatedJsonObject(text),
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

function repairTruncatedJsonObject(text) {
    const source = String(text || '');
    const start = source.indexOf('{');
    if (start === -1) return '';
    let out = '';
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index++) {
        const char = source[index];
        out += char;
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            stack.push('}');
        } else if (char === '[') {
            stack.push(']');
        } else if (char === '}' || char === ']') {
            const expected = stack[stack.length - 1];
            if (char === expected) stack.pop();
            if (!stack.length) return out;
        }
    }
    if (!out || !stack.length) return '';
    if (inString) out += '"';
    out = out.replace(/,\s*$/, '');
    while (stack.length) out += stack.pop();
    return out;
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
    const characterLock = getDraftTextField(draft, [
        'character_lock',
        'characterLock',
        'character_description',
        'characterDescription',
        'characters',
        'character_notes',
        'characterNotes',
    ]);
    if (characterLock) setValue(root, '#bbcf-draft-lock', characterLock);
    if (Array.isArray(draft.panel_notes)) {
        setValue(root, '#bbcf-draft-notes', draft.panel_notes.map((note, index) => `${index + 1}. ${note}`).join('\n'));
    }
    if (Array.isArray(draft.bubbles)) {
        const bubbleText = draft.bubbles.map((bubble) => {
            const panel = clampInt(bubble?.panel, 1, MAX_PANELS, 1);
            const type = normalizeBubbleType(bubble?.type);
            const position = normalizeBubblePosition(bubble?.position, 'top-left');
            const speaker = String(bubble?.speaker || '').trim();
            const text = String(bubble?.text || '').trim();
            return speaker
                ? `${panel}|${type}|${position}|${speaker}|${text}`
                : `${panel}|${type}|${position}|${text}`;
        }).filter(line => line.trim()).join('\n');
        setValue(root, '#bbcf-draft-bubbles', bubbleText);
    }
    if (Array.isArray(draft.sfx)) {
        const sfxText = draft.sfx.map(item => `${clampInt(item?.panel, 1, MAX_PANELS, 1)}|${item?.text || ''}`).join('\n');
        setValue(root, '#bbcf-draft-sfx', sfxText);
    }
    const inserts = draftToInsertLines(draft.inserts);
    if (inserts) setValue(root, '#bbcf-draft-inserts', inserts);
}

function draftToInsertLines(value) {
    if (Array.isArray(value)) {
        return value.map(item => {
            if (item && typeof item === 'object') {
                const panel = clampInt(item.panel, 1, MAX_PANELS, 1);
                const type = normalizeInsertType(item.type);
                const position = normalizeInsertPosition(item.position, 'bottom-right');
                const text = String(item.text || item.prompt || item.description || '').trim();
                return text ? `${panel}|${type}|${position}|${text}` : '';
            }
            return String(item || '').trim();
        }).filter(Boolean).join('\n');
    }
    if (value && typeof value === 'object') return draftToInsertLines([value]);
    return String(value || '').trim();
}

function getDraftTextField(draft, keys) {
    for (const key of keys) {
        const value = draft?.[key];
        if (Array.isArray(value)) {
            const text = value.map(item => {
                if (item && typeof item === 'object') {
                    return [item.name, item.description || item.prompt || item.notes].filter(Boolean).join(': ');
                }
                return String(item || '');
            }).filter(Boolean).join('\n');
            if (text.trim()) return text.trim();
        } else if (value && typeof value === 'object') {
            const text = Object.entries(value)
                .map(([name, description]) => `${name}: ${typeof description === 'string' ? description : JSON.stringify(description)}`)
                .join('\n');
            if (text.trim()) return text.trim();
        } else {
            const text = String(value || '').trim();
            if (text) return text;
        }
    }
    return '';
}

function setValue(root, selector, value) {
    const input = root.querySelector(selector);
    if (!input) return;
    input.value = String(value ?? '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setValueSilent(root, selector, value) {
    const input = root?.querySelector?.(selector);
    if (!input) return;
    input.value = String(value ?? '');
}

function applyDefaultPageSettingsToModal(root) {
    const settings = getSettings();
    setValueSilent(root, '#bbcf-draft-mode', settings.generationMode);
    setValueSilent(root, '#bbcf-draft-count', settings.panelCount);
    setValueSilent(root, '#bbcf-draft-layout', settings.layout);
    setValueSilent(root, '#bbcf-draft-style', settings.stylePreset);
    setValueSilent(root, '#bbcf-draft-insert-mode', settings.insertMode);
    setValueSilent(root, '#bbcf-draft-lock', settings.characterLock);
    setValueSilent(root, '#bbcf-draft-notes', settings.defaultPanelNotes);
    setValueSilent(root, '#bbcf-draft-bubbles', settings.defaultBubbles);
    setValueSilent(root, '#bbcf-draft-inserts', settings.defaultInserts);
    setValueSilent(root, '#bbcf-draft-sfx', settings.defaultSfx);
    setValueSilent(root, '#bbcf-draft-custom-style', settings.customPrompt);
    setValueSilent(root, '#bbcf-draft-negative', settings.negativePrompt);
    saveDraftFromModal(root, { replaceManualFields: [] });
}

function valueOf(root, selector) {
    return String(root?.querySelector?.(selector)?.value || '');
}

async function generateFromDraft(draft, ui = {}) {
    validateGenerationSettings();
    throwIfAborted(ui.signal);
    const settings = getSettings();
    const plans = buildPanelPlans(draft);
    const mode = draft.generationMode || settings.generationMode;
    renderProgress(ui.progressRoot, mode === 'single' ? [{ number: 1, title: draft.title || 'Comic page' }] : plans);
    const html = mode === 'single'
        ? await generateSingleImageComic(draft, plans, ui)
        : await generatePanelComic(draft, plans, ui);
    throwIfAborted(ui.signal);
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
    const chatContextPaths = getRecentChatImagePaths(previousImageLimit);
    const concurrency = clampInt(settings.concurrency, 1, MAX_CONCURRENCY, DEFAULT_SETTINGS.concurrency);
    const useSequentialCooldown = cooldown > 0;
    const worker = async (panel, index = 0) => {
        throwIfAborted(ui.signal);
        if (useSequentialCooldown && index > 0) {
            await waitWithProgress(cooldown, label => updateProgress(ui.progressRoot, panel.number, 'waiting', label), ui.signal);
        }
        throwIfAborted(ui.signal);
        updateProgress(ui.progressRoot, panel.number, 'running', 'Запрос отправлен');
        const stopTimer = startElapsedProgress(ui.progressRoot, panel.number, 'Генерация');
        try {
            const dataUrl = await generatePanelImage({ ...panel, previousImagePaths: chatContextPaths }, status => updateProgress(ui.progressRoot, panel.number, 'running', status), ui.signal);
            stopTimer();
            throwIfAborted(ui.signal);
            updateProgress(ui.progressRoot, panel.number, 'running', 'Сохранение');
            const imagePath = await saveImageToFile(dataUrl, panel.number, ui.signal);
            generated[panel.number - 1] = { ...panel, imagePath };
            updateProgress(ui.progressRoot, panel.number, 'done', 'Готово');
        } catch (error) {
            stopTimer();
            if (isAbortError(error)) {
                updateProgress(ui.progressRoot, panel.number, 'error', 'Отменено');
                throw error;
            }
            generated[panel.number - 1] = { ...panel, error: error?.message || String(error) };
            updateProgress(ui.progressRoot, panel.number, 'error', error?.message || 'Ошибка');
        }
    };
    if (useSequentialCooldown) {
        for (const [index, panel] of plans.entries()) await worker(panel, index);
    } else {
        await runQueue(plans, concurrency, panel => worker(panel, panel.number - 1), (panel, error) => {
            if (isAbortError(error)) return;
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
        previousImagePaths: getRecentChatImagePaths(previousImageLimit),
    };
    updateProgress(ui.progressRoot, 1, 'running', 'Запрос одной страницей');
    const stopTimer = startElapsedProgress(ui.progressRoot, 1, 'Генерация');
    try {
        throwIfAborted(ui.signal);
        const dataUrl = await generatePanelImage(panel, status => updateProgress(ui.progressRoot, 1, 'running', status), ui.signal);
        stopTimer();
        throwIfAborted(ui.signal);
        updateProgress(ui.progressRoot, 1, 'running', 'Сохранение');
        const imagePath = await saveImageToFile(dataUrl, 0, ui.signal);
        updateProgress(ui.progressRoot, 1, 'done', 'Готово');
        return buildSingleComicHtml(draft, { ...panel, imagePath });
    } catch (error) {
        stopTimer();
        if (isAbortError(error)) {
            updateProgress(ui.progressRoot, 1, 'error', 'Отменено');
            throw error;
        }
        updateProgress(ui.progressRoot, 1, 'error', error?.message || 'Ошибка');
        return buildSingleComicHtml(draft, { ...panel, error: error?.message || String(error) });
    }
}

function buildPanelPlans(draft) {
    const notes = splitLines(draft.panelNotes);
    const bubbleMap = parseBubbles(draft.bubbles);
    const sfxMap = parseSfx(draft.sfx);
    const insertMap = parseInserts(draft.inserts);
    const stylePrompt = buildStylePrompt(draft.stylePreset, draft.customPrompt ?? draft.customStyle);
    const layout = draft.layout || getSettings().layout;
    const panelCount = clampInt(draft.panelCount, 1, MAX_PANELS, getSettings().panelCount);
    const recentContext = getSettings().injectChatContextToImagePrompt
        ? collectRecentChat(getSettings().contextMessages)
        : '';
    const referenceLock = buildReferencePromptBlock();
    const wardrobeLock = buildWardrobePromptBlock();
    const plans = [];
    for (let index = 0; index < panelCount; index++) {
        const number = index + 1;
        const aspectRatio = getAspectForPanel(layout, index);
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
            `Layout intent: ${describeLayoutIntent(layout, number, panelCount)}.`,
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
    const recentContext = settings.injectChatContextToImagePrompt
        ? collectRecentChat(settings.contextMessages)
        : '';
    const panelDescriptions = buildSinglePagePanelPlan(draft, plans);
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

function buildSinglePagePanelPlan(draft, plans) {
    const notes = splitLines(draft.panelNotes);
    const layout = draft.layout || getSettings().layout;
    const total = plans.length || clampInt(draft.panelCount, 1, MAX_PANELS, getSettings().panelCount);

    return Array.from({ length: total }, (_, index) => {
        const number = index + 1;
        const beat = normalizePanelNote(notes[index]) || DEFAULT_PANEL_BEATS[index % DEFAULT_PANEL_BEATS.length];
        const layoutIntent = describeLayoutIntent(layout, number, total);
        return `Panel ${number}: ${beat}\nLayout intent: ${layoutIntent}.`;
    }).join('\n\n');
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
        let speaker = '';
        let bubbleText = line;
        if (parts.length >= 5) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeBubbleType(parts[1]);
            position = normalizeBubblePosition(parts[2], position);
            speaker = parts[3];
            bubbleText = parts.slice(4).join('|').trim();
        } else if (parts.length >= 4) {
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
        map.get(panel).push({ type, position, speaker, text: bubbleText });
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

function parseInserts(text) {
    const map = new Map();
    for (const line of splitLines(text).slice(0, 2)) {
        const parts = line.split('|').map(part => part.trim());
        let panel = 1;
        let type = 'detail';
        let position = 'bottom-right';
        let insertText = line;
        if (parts.length >= 4) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeInsertType(parts[1]);
            position = normalizeInsertPosition(parts[2], position);
            insertText = parts.slice(3).join('|').trim();
        } else if (parts.length === 3) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            type = normalizeInsertType(parts[1]);
            insertText = parts[2];
        } else if (parts.length === 2) {
            panel = clampInt(parts[0], 1, MAX_PANELS, 1);
            insertText = parts[1];
        }
        if (!insertText) continue;
        if (!map.has(panel)) map.set(panel, []);
        map.get(panel).push({ type, position, text: insertText });
    }
    return map;
}

function buildPanelInsertPrompt(inserts) {
    if (!inserts?.length) return '';
    const lines = inserts.map(insert =>
        `- ${insert.type} insert at ${insert.position}: ${insert.text}`).join('\n');
    return [
        `Integrate these small manga/webtoon overlay cut-in inserts inside this panel composition:`,
        lines,
        `Each insert must be a small bordered mini-panel or sticker drawn as part of the same image, matching the panel's style, lighting, linework, and color.`,
        `Use detail inserts for close-ups of hands, lips, eyes, weapons, blood, objects, or symbols; use chibi inserts only for comic or exaggerated reactions.`,
    ].join('\n');
}

function normalizeBubbleType(value) {
    const type = String(value || '').toLowerCase();
    return ['speech', 'thought', 'shout', 'whisper'].includes(type) ? type : 'speech';
}

function normalizeInsertType(value) {
    const type = String(value || '').toLowerCase().trim();
    if (['chibi', 'reaction', 'sticker', 'gag', 'чиби', 'реакция', 'стикер'].includes(type)) return 'chibi';
    if (['emotion', 'face', 'eyes', 'эмоция', 'лицо', 'глаза'].includes(type)) return 'emotion';
    if (['action', 'impact', 'motion', 'акция', 'действие', 'удар'].includes(type)) return 'action';
    return 'detail';
}

function normalizeInsertPosition(value, fallback = 'bottom-right') {
    const position = String(value || '').toLowerCase().trim().replace(/[\s_]+/g, '-');
    const aliases = {
        'сверху-слева': 'top-left',
        'слева-сверху': 'top-left',
        'сверху-справа': 'top-right',
        'справа-сверху': 'top-right',
        'снизу-слева': 'bottom-left',
        'слева-снизу': 'bottom-left',
        'снизу-справа': 'bottom-right',
        'справа-снизу': 'bottom-right',
        'центр': 'center',
        'по-центру': 'center',
    };
    if (aliases[position]) return aliases[position];
    return ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(position) ? position : fallback;
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

async function waitWithProgress(ms, onTick, signal = null) {
    const total = Math.max(0, Number(ms) || 0);
    if (!total) return;
    const startedAt = Date.now();
    while (Date.now() - startedAt < total) {
        throwIfAborted(signal);
        const left = Math.ceil((total - (Date.now() - startedAt)) / 1000);
        if (typeof onTick === 'function') onTick(`КД перед запросом: ${left} sec`);
        await delay(Math.min(1000, total - (Date.now() - startedAt)), signal);
    }
}

function delay(ms, signal = null) {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener?.('abort', onAbort);
            resolve();
        }, Math.max(0, ms));
        const onAbort = () => {
            clearTimeout(timer);
            reject(createCancellationError());
        };
        signal?.addEventListener?.('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
    });
}

async function generatePanelImage(panel, onStatus = null, signal = null) {
    const settings = getSettings();
    throwIfAborted(signal);
    if (typeof onStatus === 'function') onStatus('Запрос');
    const references = settings.apiType === 'onlysq-imagen' ? [] : await collectReferenceImages(panel.previousImagePaths, signal);
    throwIfAborted(signal);
    if (settings.apiType === 'onlysq-imagen') return generateOnlySqImage(panel, signal);
    if (settings.apiType === 'openai-images') return generateOpenAiImage(panel, references, signal);
    if (settings.apiType === 'openai-chat') return generateOpenAiChatImage(panel, references, signal);
    if (settings.apiType === 'gemini') return generateGeminiImage(panel, references, signal);
    if (settings.apiType === 'naistera') return generateNaisteraImage(panel, references, signal);
    throw new Error(`Unknown API type: ${settings.apiType}`);
}

function validateGenerationSettings() {
    const settings = getSettings();
    if (!settings.endpoint && !['naistera', 'onlysq-imagen'].includes(settings.apiType)) throw new Error('Endpoint не настроен.');
    if (!settings.apiKey) throw new Error('API key не настроен.');
    if (settings.apiType !== 'naistera' && !settings.model) throw new Error('Модель не настроена.');
}

async function collectReferenceImages(previousImagePaths = [], signal = null) {
    const settings = getSettings();
    const refs = settings.references
        .filter(ref => ref.enabled && ref.path);
    const loaded = [];
    for (const ref of refs) {
        throwIfAborted(signal);
        try {
            const dataUrl = await fetchUrlAsDataUrl(ref.path, signal);
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
            if (isAbortError(error)) throw error;
            console.warn('[BB Comic Forge] reference skipped', ref.path, error);
        }
    }
    if (settings.wardrobeEnabled && settings.wardrobeSendImages) {
        loaded.push(...await collectWardrobeReferenceImages(signal));
    }
    const previous = await collectPreviousContextReferenceImages(previousImagePaths, signal);
    return [...loaded, ...previous];
}

async function collectWardrobeReferenceImages(signal = null) {
    const settings = getSettings();
    if (!settings.wardrobeEnabled || !settings.wardrobeSendImages) return [];
    const outfits = getWardrobeActiveEntries(settings).filter(entry => entry.item.path);
    const loaded = [];
    for (const { owner, item } of outfits) {
        throwIfAborted(signal);
        try {
            const dataUrl = await fetchUrlAsDataUrl(item.path, signal);
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
            if (isAbortError(error)) throw error;
            console.warn('[BB Comic Forge] wardrobe reference skipped', item, error);
        }
    }
    return loaded;
}

async function collectPreviousContextReferenceImages(paths = [], signal = null) {
    const uniquePaths = uniqueStrings(paths).slice(0, MAX_PREVIOUS_CONTEXT_IMAGES);
    const loaded = [];
    for (const path of uniquePaths) {
        throwIfAborted(signal);
        try {
            const dataUrl = await fetchUrlAsDataUrl(path, signal);
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
            if (isAbortError(error)) throw error;
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

async function generateOnlySqImage(panel, signal = null) {
    const settings = getSettings();
    const result = await fetchJson(normalizeOnlySqImagenEndpoint(settings.endpoint), {
        method: 'POST',
        headers: imageApiHeaders(settings),
        signal,
        body: JSON.stringify({
            model: settings.model || 'flux',
            prompt: buildFullPrompt(panel),
            ratio: panel.aspectRatio || '1:1',
        }),
    });
    const found = extractImageFromOnlySqResponse(result);
    if (!found) throw new Error('OnlySQ response did not contain image data.');
    return /^https?:\/\//i.test(found) ? fetchUrlAsDataUrl(found, signal) : found;
}

async function generateOpenAiImage(panel, references = [], signal = null) {
    const settings = getSettings();
    const baseUrl = normalizeOpenAiBase(settings.endpoint);
    if (references.length) {
        try {
            return await generateOpenAiImageEdit(panel, references, signal);
        } catch (error) {
            if (!isOpenAiImageEditUnsupported(error)) throw error;
            console.warn('[BB Comic Forge] OpenAI Images edit endpoint is unavailable; retrying with text-only references.', {
                editEndpoint: `${baseUrl}/images/edits`,
                fallbackEndpoint: `${baseUrl}/images/generations`,
                referenceCount: references.length,
            });
        }
    }
    const url = `${baseUrl}/images/generations`;
    const body = {
        model: settings.model,
        prompt: `${buildFullPrompt(panel)}\n\nAspect ratio target: ${panel.aspectRatio}.`,
        size: settings.openaiSize || '1024x1024',
        quality: settings.openaiQuality || 'standard',
        response_format: 'b64_json',
        n: 1,
    };
    logOpenAiImageRoute(url, 'generation', 0);
    const result = await fetchJson(url, {
        method: 'POST',
        headers: imageApiHeaders(settings),
        body: JSON.stringify(body),
        signal,
    });
    return extractOpenAiImageResult(result, signal);
}

async function generateOpenAiImageEdit(panel, references, signal = null) {
    const settings = getSettings();
    const url = `${normalizeOpenAiBase(settings.endpoint)}/images/edits`;
    const formData = new FormData();
    const prompt = [
        buildReferenceInstruction(references),
        buildFullPrompt(panel),
        `Aspect ratio target: ${panel.aspectRatio}.`,
    ].filter(Boolean).join('\n\n');
    formData.append('model', settings.model);
    formData.append('prompt', prompt);
    formData.append('size', settings.openaiSize || '1024x1024');
    formData.append('quality', settings.openaiQuality || 'standard');
    formData.append('n', '1');
    const imageField = references.length > 1 ? 'image[]' : 'image';
    for (let index = 0; index < references.length; index++) {
        throwIfAborted(signal);
        const file = await referenceToImageFile(references[index], index);
        formData.append(imageField, file, file.name);
    }
    logOpenAiImageRoute(url, 'edit', references.length);
    const result = await fetchJson(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${settings.apiKey || ''}` },
        body: formData,
        signal,
    });
    return extractOpenAiImageResult(result, signal);
}

function logOpenAiImageRoute(endpoint, mode, referenceCount) {
    console.info('[BB Comic Forge] OpenAI Images request', { endpoint, mode, referenceCount });
}

function isOpenAiImageEditUnsupported(error) {
    const status = Number(error?.apiStatus);
    if ([404, 405, 501].includes(status)) return true;
    if (status !== 400) return false;
    const details = `${error?.apiBody || ''} ${error?.message || ''}`.toLowerCase();
    const unsupportedEditPatterns = [
        /(?:unsupported|not supported|unknown|not found|unavailable|no route|cannot post).*?(?:images\/edits|image edit(?:ing)?|image input|endpoint|route)/i,
        /(?:images\/edits|image edit(?:ing)?|image input|endpoint|route).*?(?:unsupported|not supported|unknown|not found|unavailable|no route)/i,
        /model.*?(?:does not|doesn't|is not).*?support(?:ed)?.*?(?:edit|image input)/i,
    ];
    return unsupportedEditPatterns.some(pattern => pattern.test(details));
}

async function referenceToImageFile(reference, index) {
    let dataUrl = reference.dataUrl;
    let parsed = parseImageDataUrl(dataUrl);
    if (!['png', 'jpeg', 'webp'].includes(parsed.normalizedFormat)) {
        dataUrl = await convertDataUrlToPng(dataUrl);
        parsed = parseImageDataUrl(dataUrl);
    }
    const binary = atob(parsed.base64Data.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const extension = parsed.normalizedFormat === 'jpeg' ? 'jpg' : parsed.normalizedFormat;
    return new File([bytes], `bbcf_reference_${index + 1}.${extension}`, { type: `image/${parsed.normalizedFormat}` });
}

function extractOpenAiImageResult(result, signal = null) {
    const image = result?.data?.[0];
    if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
    if (image?.url) return fetchUrlAsDataUrl(image.url, signal);
    throw new Error('OpenAI images response did not contain image data.');
}

async function generateOpenAiChatImage(panel, references = [], signal = null) {
    const settings = getSettings();
    const url = `${normalizeOpenAiBase(settings.endpoint)}/chat/completions`;
    const fullPrompt = `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}\n\n[aspect_ratio: ${panel.aspectRatio}] [image_size: ${panel.imageSize || settings.imageSize}]`;
    const imageParts = references.map(ref => ({ type: 'image_url', image_url: { url: ref.dataUrl } }));
    const result = await fetchJson(url, {
        method: 'POST',
        headers: imageApiHeaders(settings),
        signal,
        body: JSON.stringify({
            model: settings.model,
            messages: [{ role: 'user', content: [{ type: 'text', text: fullPrompt }, ...imageParts] }],
            modalities: ['image', 'text'],
            stream: false,
        }),
    });
    const found = extractImageFromChatResponse(result);
    if (!found) throw new Error('OpenAI chat response did not contain image data.');
    return /^https?:\/\//i.test(found) ? fetchUrlAsDataUrl(found, signal) : found;
}

async function generateGeminiImage(panel, references = [], signal = null) {
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
        signal,
        body: JSON.stringify(body),
    });
    const parts = result?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        if (part.inlineData?.data) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        if (part.inline_data?.data) return `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`;
    }
    throw new Error('Gemini response did not contain image data.');
}

async function generateNaisteraImage(panel, references = [], signal = null) {
    const settings = getSettings();
    const endpoint = normalizeNaisteraEndpoint(settings.endpoint);
    const aspectRatio = settings.naisteraAspectRatio === 'auto' ? panel.aspectRatio : settings.naisteraAspectRatio;
    const result = await fetchJson(endpoint, {
        method: 'POST',
        headers: imageApiHeaders(settings),
        signal,
        body: JSON.stringify({
            prompt: `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}`,
            model: settings.naisteraModel || 'nano banana',
            aspect_ratio: aspectRatio,
            preset: settings.naisteraPreset || undefined,
            reference_images: references.map(ref => ref.dataUrl),
            reference_labels: references.map(ref => ref.name || ref.label || 'reference'),
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
    base = base.replace(/\/(chat\/completions|images\/(?:generations|edits)|models)$/i, '');
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

async function fetchJson(url, options = {}) {
    const settings = getSettings();
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, settings.timeoutMs);
    const { signal, cleanup } = combineAbortSignals(options.signal, timeoutController.signal);
    const { signal: _signal, ...fetchOptions } = options;
    try {
        const response = await fetch(url, { ...fetchOptions, signal });
        const text = await response.text();
        if (!response.ok) {
            const error = new Error(formatApiError(response.status, text, url));
            error.apiStatus = response.status;
            error.apiBody = text;
            throw error;
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error(`API returned invalid JSON: ${stripHtmlForError(text).slice(0, 220)}`);
        }
    } catch (error) {
        if (isAbortError(error)) {
            if (timedOut && !options.signal?.aborted) throw new Error('API request timed out.');
            throw createCancellationError();
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        cleanup();
    }
}

function combineAbortSignals(...signals) {
    const active = signals.filter(Boolean);
    if (!active.length) return { signal: undefined, cleanup: () => {} };
    if (active.length === 1) return { signal: active[0], cleanup: () => {} };
    const controller = new AbortController();
    const listeners = [];
    const abortFrom = source => {
        if (controller.signal.aborted) return;
        try {
            controller.abort(source.reason);
        } catch (error) {
            controller.abort();
        }
    };
    for (const source of active) {
        if (source.aborted) {
            abortFrom(source);
            break;
        }
        const listener = () => abortFrom(source);
        source.addEventListener('abort', listener, { once: true });
        listeners.push([source, listener]);
    }
    return {
        signal: controller.signal,
        cleanup: () => listeners.forEach(([source, listener]) => source.removeEventListener('abort', listener)),
    };
}

function createCancellationError(message = 'Генерация отменена.') {
    const error = new Error(message);
    error.name = 'AbortError';
    error.bbcfCancelled = true;
    return error;
}

function isAbortError(error) {
    return Boolean(error?.bbcfCancelled || error?.name === 'AbortError');
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw createCancellationError();
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

async function fetchUrlAsDataUrl(url, signal = null) {
    throwIfAborted(signal);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Image URL fetch failed: ${response.status}`);
    const blob = await response.blob();
    throwIfAborted(signal);
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

async function saveImageToFile(dataUrl, panelNumber = 0, signal = null) {
    throwIfAborted(signal);
    const context = SillyTavern.getContext();
    let parsed = parseImageDataUrl(dataUrl);
    if (!UPLOAD_ALLOWED_FORMATS.has(parsed.normalizedFormat)) {
        parsed = parseImageDataUrl(await convertDataUrlToPng(dataUrl));
    }
    throwIfAborted(signal);
    const characterName = getCurrentCharacterName() || 'comic_forge';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `bbcf_p${panelNumber || 0}_${timestamp}`;
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        signal,
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

async function withBusyButton(button, busyHtml, task) {
    const previousHtml = button?.innerHTML;
    const previousDisabled = button?.disabled;
    if (button) {
        button.disabled = true;
        button.innerHTML = busyHtml;
    }
    try {
        return await task();
    } finally {
        if (button) {
            button.disabled = previousDisabled;
            button.innerHTML = previousHtml;
        }
    }
}

function getImageFileFromPasteEvent(event) {
    const files = Array.from(event?.clipboardData?.files || []);
    const file = files.find(item => item?.type?.startsWith('image/'));
    if (file) return file;
    const item = Array.from(event?.clipboardData?.items || []).find(entry => entry?.type?.startsWith('image/'));
    return item?.getAsFile?.() || null;
}

async function readClipboardImageFile() {
    if (typeof navigator.clipboard?.read !== 'function') {
        throw new Error('Браузер не умеет читать картинки из буфера. Нажми Ctrl+V на карточке референса.');
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
        const type = item.types.find(value => value.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        return new File([blob], `bbcf_clipboard.${extension}`, { type });
    }
    throw new Error('В буфере не найдено изображение.');
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
    return 'display:block !important; width:100% !important; height:auto !important; max-width:none !important; max-height:none !important; min-width:100% !important; min-height:0; margin:0 !important; padding:0 !important; border:0; object-fit:contain !important; object-position:center !important; box-sizing:border-box;';
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
        const messageId = Number.isInteger(targetMessageId) ? targetMessageId : findLastCharacterMessageId(context.chat);
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

function findLastCharacterMessageId(chat) {
    if (!Array.isArray(chat)) return -1;
    for (let index = chat.length - 1; index >= 0; index--) {
        const message = chat[index];
        if (message && !message.is_user) return index;
    }
    return chat.length - 1;
}

function rememberComic(draft, html, options = {}) {
    const settings = getSettings();
    const profileKey = getScopedProfileKey();
    const cleanHtml = makeShareHtml(html);
    const imagePaths = extractImagePathsFromHtml(cleanHtml);
    const {
        historyId = '',
        messageId = null,
        savedPngPath = '',
        source = '',
    } = options && typeof options === 'object' ? options : { messageId: options };
    const existingHistory = Array.isArray(settings.comicHistory) ? settings.comicHistory : [];
    const existing = historyId ? existingHistory.find(record => record?.id === historyId) : null;
    const nextSavedPngPath = savedPngPath || existing?.savedPngPath || '';
    const nextMessageId = messageId ?? existing?.messageId ?? null;
    const record = {
        id: existing?.id || historyId || makeId('bbcf-comic'),
        profileKey,
        title: String(draft.title || existing?.title || 'Comic page'),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode: draft.generationMode || draft.mode || existing?.mode || settings.generationMode,
        layout: draft.layout || existing?.layout || settings.layout,
        imagePaths,
        imageFolder: getCommonImageFolder(imagePaths),
        html: cleanHtml,
        messageId: nextMessageId,
        savedPngPath: nextSavedPngPath,
        source: getComicHistorySource({ ...existing, messageId: nextMessageId, savedPngPath: nextSavedPngPath, source }),
    };
    settings.comicHistory = [record, ...existingHistory.filter(item => item?.id !== record.id)].slice(0, MAX_COMIC_HISTORY);
    state.lastComic = record;
    saveSettings();
    return record;
}

function getComicHistorySource(record) {
    if (record?.messageId !== null && record?.messageId !== undefined && record?.savedPngPath) return 'chat-png';
    if (record?.messageId !== null && record?.messageId !== undefined) return 'chat';
    if (record?.savedPngPath) return 'png';
    return record?.source || 'saved';
}

function getComicHistorySourceLabel(record) {
    const source = getComicHistorySource(record);
    if (source === 'chat-png') return 'Чат + PNG';
    if (source === 'chat') return 'Чат';
    if (source === 'png') return 'PNG';
    return 'Сохранено';
}

function getComicHistoryThumbnail(record) {
    return record?.savedPngPath || record?.imagePaths?.[0] || '';
}

function makeShareHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('[data-bbcf-instruction]').forEach(node => {
        if (!node.classList.contains('bbcf-panel-error')) node.removeAttribute('data-bbcf-instruction');
    });
    doc.querySelectorAll('.bbcf-export-notice').forEach(node => node.remove());
    doc.querySelectorAll('.bbcf-panel-action').forEach(node => node.remove());
    doc.querySelectorAll('.bbcf-comic-action').forEach(node => node.remove());
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

function getRecentChatImagePaths(count = getSettings().previousImageCount) {
    const max = clampInt(count, 0, MAX_PREVIOUS_CONTEXT_IMAGES, 0);
    if (!max) return [];
    const context = SillyTavern.getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const paths = [];
    for (let index = chat.length - 1; index >= 0; index--) {
        for (const path of extractImagePathsFromMessage(chat[index])) {
            if (path && !paths.includes(path)) paths.push(path);
            if (paths.length >= max) return paths;
        }
    }
    return paths;
}

function extractImagePathsFromMessage(message) {
    if (!message || typeof message !== 'object') return [];
    const paths = [
        ...extractImagePathsFromHtml(message.mes || ''),
        ...extractImagePathsFromHtml(message.extra?.display_text || ''),
        ...extractMarkdownImagePaths(message.mes || ''),
        ...extractMarkdownImagePaths(message.extra?.display_text || ''),
        ...extractMediaImagePaths(message.extra?.media),
    ];
    return uniqueStrings(paths.filter(isUsableImagePath));
}

function extractMarkdownImagePaths(text) {
    const paths = [];
    const regex = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match;
    while ((match = regex.exec(String(text || '')))) paths.push(match[1]);
    return paths;
}

function extractMediaImagePaths(media) {
    if (!Array.isArray(media)) return [];
    return media
        .filter(item => String(item?.type || '').toLowerCase() === 'image')
        .map(item => item.url || item.path || item.src)
        .filter(Boolean);
}

function isUsableImagePath(path) {
    const value = String(path || '').trim();
    if (!value) return false;
    return /^data:image\//i.test(value)
        || /^https?:\/\//i.test(value)
        || /^\/?user\/images\//i.test(value)
        || /\.(?:png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(value);
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

function bindFinalPromptPreview(root) {
    const disclosure = root.querySelector('#bbcf-final-prompt-details');
    updateFinalPromptCopyAllVisibility(root);
    disclosure?.addEventListener('bbcf:toggle', () => {
        if (isDisclosureExpanded(disclosure)) renderFinalPromptPreview(root);
    });

    root.querySelector('#bbcf-draft-mode')?.addEventListener('change', () => {
        updateFinalPromptCopyAllVisibility(root);
        if (isDisclosureExpanded(disclosure)) renderFinalPromptPreview(root);
    });

    root.querySelector('#bbcf-refresh-final-prompt')?.addEventListener('click', () => {
        renderFinalPromptPreview(root);
    });

    root.querySelector('#bbcf-copy-final-prompt')?.addEventListener('click', async () => {
        const items = renderFinalPromptPreview(root);
        const text = joinFinalPromptPreviewItems(items);
        if (!text) return;
        await copyText(text);
        toastr.success('Prompt изображения скопирован.', 'Comic Forge');
    });

    root.querySelector('#bbcf-final-prompt-list')?.addEventListener('click', async (event) => {
        const button = event.target?.closest?.('[data-bbcf-copy-image-prompt]');
        if (!button) return;
        const items = root.bbcfFinalPromptItems || renderFinalPromptPreview(root);
        const index = Number(button.getAttribute('data-bbcf-copy-image-prompt'));
        const item = items[index];
        if (!item?.text) return;
        await copyText(item.text);
        toastr.success(`${item.label} скопирован.`, 'Comic Forge');
    });
}

function updateFinalPromptCopyAllVisibility(root, draft = readDraftFromModal(root)) {
    const button = root?.querySelector('#bbcf-copy-final-prompt');
    if (!button) return;
    button.classList.toggle('bbcf-hidden', draft.generationMode === 'single');
}

function renderFinalPromptPreview(root) {
    const list = root?.querySelector('#bbcf-final-prompt-list');
    if (!list) return [];

    try {
        updateFinalPromptCopyAllVisibility(root);
        const items = buildFinalPromptPreviewItems(root);
        root.bbcfFinalPromptItems = items;
        if (!items.length) {
            list.innerHTML = '<pre class="bbcf-final-prompt-placeholder">Prompt изображения пустой.</pre>';
            return items;
        }
        list.innerHTML = items.map((item, index) => `
            <article class="bbcf-final-prompt-card">
                <div class="bbcf-final-prompt-card-head">
                    <b>${escapeHtml(item.label)}</b>
                    <button class="menu_button" type="button" data-bbcf-copy-image-prompt="${index}"><i class="fa-solid fa-copy"></i><span>Копировать</span></button>
                </div>
                <pre>${escapeHtml(item.text)}</pre>
            </article>
        `).join('');
        return items;
    } catch (error) {
        console.warn('[BB Comic Forge] final prompt preview failed', error);
        list.innerHTML = `<pre class="bbcf-final-prompt-placeholder">Не удалось собрать prompt изображения: ${escapeHtml(error?.message || String(error))}</pre>`;
        return [];
    }
}

function buildFinalPromptPreviewItems(root) {
    const draft = readDraftFromModal(root);
    const settings = getSettings();
    const plans = buildPanelPlans(draft);
    const prompts = draft.generationMode === 'single'
        ? [buildSinglePagePanel(draft, plans)]
        : plans;

    return prompts.map(panel => ({
        label: panel.singlePage ? 'Страница целиком' : `Панель ${panel.number}`,
        text: buildProviderPromptPreview(panel, settings),
    }));
}

function joinFinalPromptPreviewItems(items = []) {
    if (!items.length) return '';
    if (items.length === 1) return items[0].text || '';
    return items
        .map(item => `### ${item.label}\n${item.text || ''}`)
        .join('\n\n---\n\n');
}

function buildProviderPromptPreview(panel, settings) {
    const prompt = buildFullPrompt(panel);
    if (settings.apiType === 'openai-images') {
        return `${prompt}\n\nAspect ratio target: ${panel.aspectRatio}.`;
    }
    if (settings.apiType === 'openai-chat') {
        return `${prompt}\n\n[aspect_ratio: ${panel.aspectRatio}] [image_size: ${panel.imageSize || settings.imageSize}]`;
    }
    return prompt;
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
        const currentDraft = readDraftFromModal(root);
        const pendingDraft = state.pendingComic.draft || {};
        const insertMode = currentDraft.insertMode || pendingDraft.insertMode || getSettings().insertMode;
        const historyDraft = state.pendingComic.fromHistory
            ? { ...pendingDraft, generationMode: pendingDraft.generationMode || pendingDraft.mode, insertMode }
            : { ...pendingDraft, ...currentDraft, insertMode };
        const messageId = await insertComicIntoChat(html, insertMode, targetMessageId);
        const record = rememberComic(historyDraft, html, {
            historyId: state.pendingComic.historyId,
            messageId,
        });
        state.lastComic = record;
        state.pendingComic = { ...state.pendingComic, html, sent: true, historyId: record.id };
        renderComicHistory(root);
        scheduleComicActionRefresh();
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
        const previewHtml = root.querySelector('#bbcf-preview-content')?.innerHTML || state.pendingComic?.html || state.lastComic?.html || '';
        const html = makeShareHtml(previewHtml);
        const savingHistoryPreview = isHistoryPreviewMode(root);
        const historyId = savingHistoryPreview
            ? (state.lastComic?.id || '')
            : (state.pendingComic?.historyId || '');
        const draft = savingHistoryPreview
            ? (state.lastComic || readDraftFromModal(root))
            : (state.pendingComic?.draft || readDraftFromModal(root));
        const record = rememberComic(draft, html, {
            historyId,
            savedPngPath: path,
        });
        if (!savingHistoryPreview && state.pendingComic?.html) {
            state.pendingComic = {
                ...state.pendingComic,
                draft,
                html,
                historyId: record.id,
                savedPngPath: path,
            };
        }
        renderComicHistory(root);
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

function isHistoryPreviewMode(root) {
    const button = root?.querySelector('#bbcf-close-history-preview');
    return Boolean(button && !button.classList.contains('bbcf-hidden'));
}

function restoreCurrentPreview(root) {
    const preview = root?.querySelector('#bbcf-preview-content');
    if (!preview) return;
    const pending = isHistoryPreviewMode(root) ? state.historyPreviewPreviousPendingComic : state.pendingComic;
    state.pendingComic = pending || null;
    state.historyPreviewPreviousPendingComic = null;
    if (pending?.html && !pending.sent) {
        preview.innerHTML = pending.html;
        bindComicActions(preview);
        attachForgePreviewPanelControls(root);
    } else {
        preview.innerHTML = '<p class="bbcf-hint">Готовая страница появится здесь.</p>';
    }
    setHistoryPreviewMode(root, false);
    updateSendToChatButton(root);
    updateFloatingButton();
}

function clearForgePreview(root) {
    if (state.generating) {
        const shouldCancel = window.confirm('Генерация уже идет. Отменить ее и очистить превью?');
        if (!shouldCancel) return;
        cancelActiveGeneration();
    }
    const preview = root?.querySelector('#bbcf-preview-content');
    if (preview) preview.innerHTML = '<p class="bbcf-hint">Превью очищено.</p>';
    const progress = root?.querySelector('#bbcf-progress');
    if (progress) progress.innerHTML = '';
    state.pendingComic = null;
    state.historyPreviewPreviousPendingComic = null;
    setHistoryPreviewMode(root, false);
    updateSendToChatButton(root);
    updateFloatingButton();
}

function attachForgePreviewPanelControls(root) {
    const preview = root?.querySelector('#bbcf-preview-content');
    if (!preview || !state.pendingComic?.html) return;
    preview.querySelectorAll('.bbcf-preview-panel-regen').forEach(button => button.remove());
    preview.querySelectorAll('.bbcf-preview-panel-delete').forEach(button => button.remove());
    const draft = state.pendingComic.draft || readDraftFromModal(root);
    if ((draft.generationMode || getSettings().generationMode) === 'single') return;
    preview.querySelectorAll('.bbcf-panel').forEach(figure => {
        const number = Number(figure.getAttribute('data-bbcf-panel'));
        if (!number) return;
        if (!figure.querySelector('.bbcf-preview-panel-regen')) {
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
        }
        if (figure.querySelector('.bbcf-preview-panel-delete')) return;
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'bbcf-panel-action bbcf-preview-panel-delete';
        deleteButton.title = 'Удалить панель из текущего превью';
        deleteButton.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        deleteButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            deletePreviewPanel(root, number);
        });
        figure.appendChild(deleteButton);
    });
}

function deletePreviewPanel(root, panelNumber) {
    if (state.generating) {
        toastr.info('Дождись окончания генерации или отмени её перед удалением панели.', 'Comic Forge');
        return;
    }
    const preview = root?.querySelector('#bbcf-preview-content');
    const figure = preview?.querySelector(`.bbcf-panel[data-bbcf-panel="${panelNumber}"]`);
    if (!preview || !figure) return;
    if (!window.confirm(`Удалить панель ${panelNumber} из текущего превью?`)) return;
    figure.remove();
    const remainingPanels = Array.from(preview.querySelectorAll('.bbcf-panel'));
    if (!remainingPanels.length) {
        preview.innerHTML = '<p class="bbcf-hint">Все панели удалены из превью.</p>';
        state.pendingComic = null;
    } else {
        cleanupRenderedComics(preview);
        bindComicActions(preview);
        state.pendingComic = {
            draft: state.pendingComic?.draft || readDraftFromModal(root),
            html: makeShareHtml(preview.innerHTML),
            sent: false,
        };
        attachForgePreviewPanelControls(root);
    }
    updateSendToChatButton(root);
    updateFloatingButton();
    toastr.info(`Панель ${panelNumber} удалена из текущего превью.`, 'Comic Forge');
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
    const controller = startGenerationSession();
    try {
        state.generating = true;
        updateFloatingButton();
        button?.classList.add('is-busy');
        saveDraftToSettings(draft);
        const plans = buildPanelPlans(draft);
        const plan = plans.find(panel => panel.number === panelNumber);
        if (!plan) throw new Error(`Panel ${panelNumber} is not in this draft.`);
        plan.previousImagePaths = getRecentChatImagePaths();
        renderProgress(root.querySelector('#bbcf-progress'), [plan]);
        updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'running', 'Запрос отправлен');
        const stopTimer = startElapsedProgress(root.querySelector('#bbcf-progress'), panelNumber, 'Перегенерация');
        let imagePath = '';
        try {
            const dataUrl = await generatePanelImage(plan, status => updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'running', status), controller.signal);
            stopTimer();
            throwIfGenerationStale(controller);
            updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'running', 'Сохранение');
            imagePath = await saveImageToFile(dataUrl, panelNumber, controller.signal);
            throwIfGenerationStale(controller);
            updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'done', 'Готово');
        } catch (error) {
            stopTimer();
            throw error;
        }
        throwIfGenerationStale(controller);
        if (!root?.isConnected || !preview?.isConnected || !oldFigure?.isConnected) throw createCancellationError();
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
        if (isAbortError(error) || state.generationCancelRequested) {
            updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'error', 'Отменено');
            console.info('[BB Comic Forge] preview panel regeneration cancelled');
            if (!state.generationCancelNotified && root?.isConnected) {
                toastr.info('Генерация отменена.', 'Comic Forge');
                state.generationCancelNotified = true;
            }
        } else {
            updateProgress(root.querySelector('#bbcf-progress'), panelNumber, 'error', error?.message || 'Ошибка');
            console.error('[BB Comic Forge] preview panel regeneration failed', error);
            toastr.error(error?.message || String(error), 'Comic Forge');
        }
    } finally {
        finishGenerationSession(controller);
        state.generating = false;
        button?.classList.remove('is-busy');
        updateSendToChatButton(root);
        updateFloatingButton();
    }
}

function getActiveComicRecord() {
    if (isComicRecordForCurrentScope(state.lastComic)) return state.lastComic;
    return getScopedComicHistory()[0] || null;
}

function renderComicHistory(root) {
    const panel = root.querySelector('#bbcf-history-panel');
    if (!panel) return;
    const history = getScopedComicHistory();
    if (!history.length) {
        panel.innerHTML = '<p class="bbcf-hint">История пуста.</p>';
        return;
    }
    panel.innerHTML = `
        <div class="bbcf-history-header">
            <b>Созданные комиксы</b>
            <button class="menu_button" type="button" data-bbcf-history-clear><i class="fa-solid fa-trash-can"></i><span>Очистить</span></button>
        </div>
        ${history.map(record => {
            const thumbnail = getComicHistoryThumbnail(record);
            const sourceLabel = getComicHistorySourceLabel(record);
            return `
        <div class="bbcf-history-card" data-bbcf-history-id="${escapeHtml(record.id)}">
            <div class="bbcf-history-thumb">${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="">` : '<i class="fa-solid fa-image"></i>'}</div>
            <div class="bbcf-history-main">
                <b>${escapeHtml(record.title || 'Comic page')}</b>
                <span>${escapeHtml(formatComicDate(record.createdAt))} · ${escapeHtml(record.mode === 'single' ? 'одним запросом' : 'по панелям')} · ${escapeHtml(sourceLabel)}</span>
                <div class="bbcf-history-actions">
                    <button class="menu_button" type="button" data-bbcf-history-preview><i class="fa-solid fa-eye"></i><span>Показать</span></button>
                    <button class="menu_button" type="button" data-bbcf-history-delete><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        </div>
    `;
        }).join('')}`;
    panel.querySelector('[data-bbcf-history-clear]')?.addEventListener('click', () => {
        const settings = getSettings();
        const profileKey = getScopedProfileKey();
        settings.comicHistory = (settings.comicHistory || []).filter(record => record?.profileKey !== profileKey);
        state.lastComic = null;
        saveSettings();
        if (isHistoryPreviewMode(root)) {
            restoreCurrentPreview(root);
        }
        renderComicHistory(root);
        toastr.success('История комиксов очищена.', 'Comic Forge');
    });
    panel.querySelectorAll('.bbcf-history-card').forEach(card => {
        const record = history.find(item => item.id === card.dataset.bbcfHistoryId);
        if (!record) return;
        card.querySelector('[data-bbcf-history-preview]')?.addEventListener('click', () => {
            state.lastComic = record;
            if (!isHistoryPreviewMode(root)) {
                state.historyPreviewPreviousPendingComic = state.pendingComic;
            }
            state.pendingComic = {
                draft: record,
                html: makeShareHtml(record.html),
                sent: false,
                historyId: record.id,
                savedPngPath: record.savedPngPath || '',
                fromHistory: true,
            };
            const preview = root.querySelector('#bbcf-preview-content');
            if (preview) {
                preview.innerHTML = state.pendingComic.html;
                cleanupRenderedComics(preview);
                bindComicActions(preview);
                if (record.savedPngPath) showSavedPageImageNotice(root, record.savedPngPath);
            }
            setHistoryPreviewMode(root, true);
            updateSendToChatButton(root);
            updateFloatingButton();
        });
        card.querySelector('[data-bbcf-history-delete]')?.addEventListener('click', () => {
            const settings = getSettings();
            settings.comicHistory = (settings.comicHistory || []).filter(item => item.id !== record.id);
            if (state.lastComic?.id === record.id) state.lastComic = null;
            if (state.pendingComic?.fromHistory && state.pendingComic.historyId === record.id) {
                restoreCurrentPreview(root);
            }
            saveSettings();
            renderComicHistory(root);
            toastr.success('Запись удалена из истории.', 'Comic Forge');
        });
    });
}

function getScopedComicHistory(settings = getSettings()) {
    return (settings.comicHistory || []).filter(isComicRecordForCurrentScope);
}

function isComicRecordForCurrentScope(record) {
    return Boolean(record && record.profileKey && record.profileKey === getScopedProfileKey());
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
    const chatMessages = new Set();
    getComicPages(root).forEach(page => {
        page.classList.add('bbcf-comic-page');
        page.style.position = 'relative';
        const chatMessage = page.closest('#chat .mes');
        if (chatMessage) {
            chatMessages.add(chatMessage);
            return;
        }
        if (page.querySelector('.bbcf-comic-zoom')) return;
        page.appendChild(createComicZoomButton(() => openComicLightbox(page)));
    });
    chatMessages.forEach(bindChatComicMessageButton);
    root.querySelectorAll('[data-bbcf-regen]').forEach(button => {
        if (button.dataset.bbcfBound === '1') return;
        button.dataset.bbcfBound = '1';
        button.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            const forgeRoot = state.modal?.isConnected && state.modal.contains(button) ? state.modal : null;
            const preview = forgeRoot?.querySelector('#bbcf-preview-content');
            if (preview?.contains(button)) {
                const panelNumber = Number(button.closest('.bbcf-panel')?.getAttribute('data-bbcf-panel'));
                if (panelNumber) {
                    await regeneratePreviewPanel(forgeRoot, panelNumber, button);
                    return;
                }
            }
            regeneratePanel(button);
        });
    });
}

function createComicZoomButton(onOpen) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bbcf-comic-action bbcf-comic-zoom';
    button.title = 'Открыть комикс крупнее';
    button.setAttribute('aria-label', 'Открыть комикс крупнее');
    button.innerHTML = '<svg class="bbcf-comic-zoom-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="5.5"></circle><path d="M15 15l5 5"></path><path d="M10.5 7.5v6"></path><path d="M7.5 10.5h6"></path></svg>';
    bindTouchSafeAction(button, onOpen);
    return button;
}

function bindChatComicMessageButton(chatMessage) {
    const actions = chatMessage.querySelector('.mes_buttons');
    if (!actions || actions.querySelector('.bbcf-message-comic-zoom')) return;
    const button = document.createElement('div');
    button.className = 'mes_button bbcf-message-comic-zoom';
    button.title = 'Открыть комикс крупнее';
    button.setAttribute('aria-label', 'Открыть комикс крупнее');
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    button.innerHTML = '<svg class="bbcf-message-comic-zoom-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="5.5"></circle><path d="M15 15l5 5"></path><path d="M10.5 7.5v6"></path><path d="M7.5 10.5h6"></path></svg>';
    const open = event => {
        event.preventDefault();
        event.stopPropagation();
        const page = getComicPages(chatMessage)[0];
        if (page) openComicLightbox(page);
    };
    bindTouchSafeAction(button, open);
    button.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        open(event);
    });
    const extraButtons = actions.querySelector('.extraMesButtons');
    if (extraButtons?.nextSibling) {
        actions.insertBefore(button, extraButtons.nextSibling);
    } else {
        actions.appendChild(button);
    }
}

function bindTouchSafeAction(element, handler) {
    if (!element || typeof handler !== 'function') return;
    let suppressClickUntil = 0;
    const activate = event => {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil = Date.now() + 450;
        handler(event);
    };

    element.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse') event.stopPropagation();
    }, { passive: true });
    element.addEventListener('touchstart', event => {
        event.stopPropagation();
    }, { passive: true });
    element.addEventListener('pointerup', event => {
        if (event.pointerType === 'mouse') return;
        if (Date.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        activate(event);
    });
    element.addEventListener('touchend', event => {
        if (Date.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        activate(event);
    }, { passive: false });
    element.addEventListener('click', event => {
        if (Date.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        activate(event);
    });
}

function getComicPages(root) {
    const pages = [];
    if (root.matches?.(COMIC_PAGE_SELECTOR)) pages.push(root);
    root.querySelectorAll?.(COMIC_PAGE_SELECTOR).forEach(page => {
        if (!pages.includes(page)) pages.push(page);
    });
    return pages;
}

function scheduleComicActionRefresh(root = null) {
    [0, 80, 250].forEach(delay => {
        setTimeout(() => {
            const target = root || document.getElementById('chat');
            if (!target?.isConnected) return;
            cleanupRenderedComics(target);
            bindComicActions(target);
        }, delay);
    });
}

function openComicLightbox(page) {
    if (!page) return;
    void state.lightboxPopup?.completeCancelled?.();
    state.lightboxPopup = null;
    document.body.classList.add('bbcf-lightbox-open');

    const root = document.createElement('div');
    root.id = 'bbcf-comic-lightbox';
    root.className = 'bbcf-comic-lightbox';
    root.innerHTML = `
        <div class="bbcf-comic-lightbox-shell">
            <header class="bbcf-comic-lightbox-toolbar">
                <strong><i class="fa-solid fa-book-open"></i> Просмотр комикса</strong>
                <div class="bbcf-comic-lightbox-controls">
                    <button type="button" title="Уменьшить" aria-label="Уменьшить" data-bbcf-lightbox-zoom="-1"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                    <button type="button" title="Сбросить масштаб" aria-label="Сбросить масштаб" data-bbcf-lightbox-reset><i class="fa-solid fa-rotate-left"></i></button>
                    <button type="button" title="Увеличить" aria-label="Увеличить" data-bbcf-lightbox-zoom="1"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                    <button type="button" title="Закрыть" aria-label="Закрыть" data-bbcf-lightbox-close><i class="fa-solid fa-xmark"></i></button>
                </div>
            </header>
            <div class="bbcf-comic-lightbox-scroll">
                <div class="bbcf-comic-lightbox-stage"></div>
            </div>
        </div>
    `;

    const stage = root.querySelector('.bbcf-comic-lightbox-stage');
    const scroll = root.querySelector('.bbcf-comic-lightbox-scroll');
    const clone = page.cloneNode(true);
    clone.classList.add('bbcf-lightbox-page');
    clone.querySelectorAll('.bbcf-panel-action, .bbcf-comic-action').forEach(node => node.remove());
    clone.querySelectorAll('[data-bbcf-instruction]').forEach(node => node.removeAttribute('data-bbcf-instruction'));
    clone.querySelectorAll('img').forEach(img => {
        img.draggable = false;
    });
    stage.appendChild(clone);

    const popup = new Popup(root, POPUP_TYPE.DISPLAY, '', {
        large: true,
        transparent: true,
        animation: 'fast',
        onClose: () => {
            if (state.lightboxPopup === popup) {
                state.lightboxPopup = null;
                document.body.classList.remove('bbcf-lightbox-open');
                document.removeEventListener('keydown', onKeyDown);
            }
        },
    });
    state.lightboxPopup = popup;
    popup.dlg.classList.add('bbcf-comic-popup-dialog');
    popup.dlg.addEventListener('click', event => {
        if (event.target === popup.dlg) close(event);
    });
    void popup.show();

    const measuredWidth = page.getBoundingClientRect().width || 760;
    const viewportFitWidth = Math.max(280, Math.min(760, (scroll.clientWidth || window.innerWidth || 760) - 32));
    const baseWidth = Math.max(280, Math.min(900, Math.max(measuredWidth, viewportFitWidth)));
    const minZoom = 0.65;
    const maxZoom = 4;
    let zoom = 1;
    let contentWidth = baseWidth;
    const canCloseAt = Date.now() + 650;
    const getScrollCenter = () => {
        const rect = scroll.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const updateZoom = (center = getScrollCenter()) => {
        const previousWidth = contentWidth || baseWidth;
        const previousHeight = clone.getBoundingClientRect().height || scroll.scrollHeight || 1;
        const rect = scroll.getBoundingClientRect();
        const offsetX = center.x - rect.left;
        const offsetY = center.y - rect.top;
        const ratioX = previousWidth ? (scroll.scrollLeft + offsetX) / previousWidth : 0.5;
        const ratioY = previousHeight ? (scroll.scrollTop + offsetY) / previousHeight : 0.5;
        const width = Math.round(baseWidth * zoom);
        contentWidth = width;
        clone.style.setProperty('--bbcf-lightbox-page-width', `${width}px`);
        stage.style.width = `${Math.max(width, scroll.clientWidth)}px`;
        requestAnimationFrame(() => {
            const nextHeight = clone.getBoundingClientRect().height || scroll.scrollHeight || 1;
            scroll.scrollLeft = Math.max(0, ratioX * width - offsetX);
            scroll.scrollTop = Math.max(0, ratioY * nextHeight - offsetY);
        });
    };
    const setZoom = (nextZoom, center = getScrollCenter()) => {
        if (!Number.isFinite(nextZoom)) return;
        zoom = Math.max(minZoom, Math.min(maxZoom, Number(nextZoom.toFixed(2))));
        updateZoom(center);
    };
    const close = (event = null, force = false) => {
        if (!force && Date.now() < canCloseAt) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            return;
        }
        void popup.completeCancelled();
    };
    const onKeyDown = event => {
        if (event.key === 'Escape') close(event, true);
    };

    root.querySelectorAll('[data-bbcf-lightbox-close]').forEach(button => button.addEventListener('click', event => close(event)));
    root.querySelector('[data-bbcf-lightbox-reset]')?.addEventListener('click', () => {
        setZoom(1);
    });
    root.querySelectorAll('[data-bbcf-lightbox-zoom]').forEach(button => {
        button.addEventListener('click', () => {
            setZoom(zoom + Number(button.dataset.bbcfLightboxZoom) * 0.25);
        });
    });
    installComicLightboxGestures({ scroll, setZoom, getZoom: () => zoom });
    document.addEventListener('keydown', onKeyDown);
    updateZoom();
}

function installComicLightboxGestures({ scroll, setZoom, getZoom }) {
    if (!scroll) return;
    const pointers = new Map();
    let gesture = null;
    let tap = null;
    let lastTap = { time: 0, x: 0, y: 0 };

    const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const getCenter = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const getPointerPair = () => Array.from(pointers.values()).slice(0, 2);
    const startPinch = () => {
        const [a, b] = getPointerPair();
        if (!a || !b) return;
        gesture = {
            type: 'pinch',
            startDistance: Math.max(1, getDistance(a, b)),
            startZoom: getZoom(),
        };
    };

    scroll.addEventListener('pointerdown', event => {
        if (event.target?.closest?.('.bbcf-comic-lightbox-toolbar')) return;
        event.preventDefault();
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try {
            scroll.setPointerCapture(event.pointerId);
        } catch {
            // Some mobile browsers can refuse pointer capture during synthetic taps.
        }
        tap = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        if (pointers.size >= 2) {
            startPinch();
        } else {
            gesture = { type: 'pan', lastX: event.clientX, lastY: event.clientY };
            scroll.classList.add('is-dragging');
        }
    });

    scroll.addEventListener('pointermove', event => {
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        event.preventDefault();
        const current = { x: event.clientX, y: event.clientY };
        pointers.set(event.pointerId, current);
        if (tap?.id === event.pointerId && getDistance(tap, current) > 8) tap.moved = true;

        if (pointers.size >= 2) {
            const [a, b] = getPointerPair();
            if (!a || !b) return;
            if (gesture?.type !== 'pinch') startPinch();
            const distance = Math.max(1, getDistance(a, b));
            const nextZoom = gesture.startZoom * (distance / gesture.startDistance);
            setZoom(nextZoom, getCenter(a, b));
            return;
        }

        if (gesture?.type === 'pan') {
            scroll.scrollLeft -= current.x - gesture.lastX;
            scroll.scrollTop -= current.y - gesture.lastY;
            gesture.lastX = current.x;
            gesture.lastY = current.y;
        }
    });

    const finishPointer = event => {
        const current = pointers.get(event.pointerId);
        if (!current) return;
        const wasTap = tap?.id === event.pointerId && !tap.moved && getDistance(tap, current) <= 10;
        pointers.delete(event.pointerId);
        try {
            scroll.releasePointerCapture(event.pointerId);
        } catch {
            // Pointer capture may already be gone after browser gesture cancellation.
        }

        if (wasTap && pointers.size === 0) {
            const now = Date.now();
            const closeToLastTap = getDistance(lastTap, current) <= 34;
            if (now - lastTap.time <= 320 && closeToLastTap) {
                event.preventDefault();
                setZoom(getZoom() > 1.1 ? 1 : 2, current);
                lastTap = { time: 0, x: 0, y: 0 };
            } else {
                lastTap = { time: now, x: current.x, y: current.y };
            }
        }

        if (pointers.size >= 2) {
            startPinch();
        } else if (pointers.size === 1) {
            const [remaining] = pointers.values();
            gesture = { type: 'pan', lastX: remaining.x, lastY: remaining.y };
        } else {
            gesture = null;
            tap = null;
            scroll.classList.remove('is-dragging');
        }
    };

    scroll.addEventListener('pointerup', finishPointer);
    scroll.addEventListener('pointercancel', finishPointer);
    scroll.addEventListener('wheel', event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const direction = event.deltaY > 0 ? -1 : 1;
        setZoom(getZoom() + direction * 0.18, { x: event.clientX, y: event.clientY });
    }, { passive: false });
}

function cleanupRenderedComics(root) {
    if (!root) return;
    root.querySelectorAll('.bbcf-comic-title span, .custom-bbcf-comic-title span').forEach(span => {
        const text = span.textContent?.trim() || '';
        if (/^(?:single image|\d+\s+panels?)$/i.test(text)) span.remove();
    });
    root.querySelectorAll('.bbcf-panel-action').forEach(button => button.remove());
    root.querySelectorAll('.bbcf-comic-action').forEach(button => button.remove());
    root.querySelectorAll('.bbcf-message-comic-zoom').forEach(button => button.remove());
    root.querySelectorAll('.bbcf-panel:not(.bbcf-panel-error)[data-bbcf-instruction], .custom-bbcf-panel:not(.custom-bbcf-panel-error)[data-bbcf-instruction]').forEach(panel => {
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
            previousImagePaths: getRecentChatImagePaths(),
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

function getCharacterLockProfileKey() {
    return getScopedProfileKey();
}

function getSavedDraftProfileKey() {
    return getScopedProfileKey();
}

function getScopedProfileFallbackKeys() {
    const context = SillyTavern.getContext();
    const keys = [];
    const groupId = context.groupId ?? context.group_id ?? context.selected_group;
    const group = groupId !== undefined && groupId !== null && groupId !== ''
        ? (Array.isArray(context.groups) ? context.groups.find(item => String(item?.id) === String(groupId)) : null)
        : null;
    const character = context.characterId !== undefined ? context.characters?.[context.characterId] : null;
    if (groupId !== undefined && groupId !== null && groupId !== '') {
        keys.push(`group:${safeProfilePart(groupId)}:${safeProfilePart(group?.name || context.name2 || 'group')}`);
    }
    if (character) {
        const stableId = character.avatar || character.name || context.characterId;
        keys.push(`character:${safeProfilePart(stableId)}:${safeProfilePart(character.name || context.name2 || 'character')}`);
    }
    keys.push(`chat:${safeProfilePart(context.name2 || 'global')}`);
    keys.push('legacy:unscoped');
    return [...new Set(keys)];
}

function getScopedProfileKey() {
    const context = SillyTavern.getContext();
    const groupId = context.groupId ?? context.group_id ?? context.selected_group;
    const group = groupId !== undefined && groupId !== null && groupId !== ''
        ? (Array.isArray(context.groups) ? context.groups.find(item => String(item?.id) === String(groupId)) : null)
        : null;
    const character = context.characterId !== undefined ? context.characters?.[context.characterId] : null;
    const chatId = context.chatId
        || context.chat_id
        || context.chatMetadata?.chat_id
        || context.chatMetadata?.file_name
        || context.chatMetadata?.chat_name
        || context.chatMetadata?.name;
    if (chatId !== undefined && chatId !== null && chatId !== '') {
        const ownerId = groupId !== undefined && groupId !== null && groupId !== ''
            ? `group:${groupId}`
            : `character:${character?.avatar || character?.name || context.characterId || context.name2 || 'global'}`;
        const ownerName = group?.name || character?.name || context.name2 || 'chat';
        return `chat:${safeProfilePart(ownerId)}:${safeProfilePart(ownerName)}:${safeProfilePart(chatId)}`;
    }
    if (groupId !== undefined && groupId !== null && groupId !== '') {
        return `group:${safeProfilePart(groupId)}:${safeProfilePart(group?.name || context.name2 || 'group')}`;
    }
    if (character) {
        const stableId = character.avatar || character.name || context.characterId;
        return `character:${safeProfilePart(stableId)}:${safeProfilePart(character.name || context.name2 || 'character')}`;
    }
    return `chat:global:${safeProfilePart(context.name2 || 'global')}`;
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
