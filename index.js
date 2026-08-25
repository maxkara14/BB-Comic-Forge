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
import {
    COMIC_PAGE_SELECTOR,
    DRAFT_SYNC_FIELDS,
    DRAFT_SYNC_SELECTORS,
    FAB_ID,
    FAB_WRAPPER_ID,
    MAX_COMIC_HISTORY,
    MAX_CONCURRENCY,
    MAX_PANELS,
    MAX_PREVIOUS_CONTEXT_IMAGES,
    MODAL_ID,
    MODULE_NAME,
    ONLYSQ_IMAGEN_ENDPOINT,
    SETTINGS_ID,
    UPLOAD_ALLOWED_FORMATS,
    VALID_IMAGE_SIZES,
} from './src/core/constants.js';
import { makeId } from './src/core/id.js';
import { clampInt } from './src/core/numbers.js';
import { stripHtmlForError, uniqueStrings } from './src/core/strings.js';
import { extractJsonObject } from './src/draft/parser.js';
import { buildDraftPromptPresetOptionsHtml, getActiveDraftPromptPreset } from './src/draft/view.js';
import { ASPECT_PATTERNS, BUBBLE_POSITIONS, DEFAULT_PANEL_BEATS, STYLE_PRESETS } from './src/presets/builtins.js';
import {
    describeLayoutIntent as resolveLayoutIntent,
    getBuiltinLayoutId,
    getBuiltinSinglePageAspectRatio,
    getLayoutPresetById as resolveLayoutPresetById,
    getStylePresetById as resolveStylePresetById,
} from './src/presets/resolvers.js';
import { buildLayoutExamplesHtml, buildLayoutOptionsHtml, buildStyleExamplesHtml, buildStyleOptionsHtml } from './src/presets/view.js';
import {
    extractModelNames,
    filterDraftModelNames,
    filterModelNamesForProvider,
    getKnownModelsForProvider,
} from './src/providers/models.js';
import { getImageApiLabel } from './src/providers/profiles.js';
import {
    buildDraftConnectionProfileOptionsHtml,
    buildDraftModelOptionsHtml,
    buildImageConnectionProfileOptionsHtml,
    buildModelOptionsHtml,
    getActiveDraftConnectionProfile,
    getActiveImageConnectionProfile,
    getDraftEndpointPlaceholder,
    getDraftModelPlaceholder,
    getEndpointPlaceholder,
    getProviderNote,
} from './src/providers/view.js';
import { DEFAULT_DRAFT_PROMPT, DEFAULT_NEGATIVE_PROMPT, DEFAULT_SETTINGS } from './src/settings/defaults.js';
import { normalizeBaseSettings } from './src/settings/normalize.js';
import {
    normalizeAspectPattern,
    normalizeSavedDraft,
} from './src/settings/normalizers.js';
import { hydrateScopedSettings, persistCharacterLockProfileValue, persistWardrobeProfile } from './src/settings/profiles.js';
import { buildScopedProfileFallbackKeys, buildScopedProfileKey } from './src/settings/scope.js';
import { isDisclosureExpanded, setDisclosureExpanded, upgradeDisclosures } from './src/ui/disclosure.js';
import { decodeJsonAttr, encodeJsonAttr, escapeHtml, option, stripHtml } from './src/ui/html.js';
import { renderForgeHtml } from './src/ui/forge-view.js';
import { updateSettingsDashboard } from './src/ui/settings-dashboard.js';
import { renderSettingsHtml } from './src/ui/settings-view.js';
import {
    REFERENCE_SLOTS,
    WARDROBE_CATEGORIES,
    WARDROBE_CATEGORY_ORDER,
    WARDROBE_SLOTS,
    WARDROBE_TARGETS,
} from './src/wardrobe/config.js';
import {
    normalizeReferences,
    normalizeWardrobeAssignment,
    normalizeWardrobeItems,
} from './src/wardrobe/normalizers.js';
import {
    findWardrobeItem,
    getAllowedWardrobeCategories,
    getFilteredWardrobeItems,
    getWardrobeActiveEntries,
    getWardrobeTagsForOwner,
} from './src/wardrobe/selectors.js';
import { renderWardrobeModalHtml, renderWardrobeShellHtml } from './src/wardrobe/view.js';

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
    let dirty = normalizeBaseSettings(settings, getDraftTavernProfileLabel);
    dirty = hydrateScopedSettings(settings, getScopedProfileKey(), getScopedProfileFallbackKeys) || dirty;
    if (dirty) saveSettings();
    return settings;
}

function persistWardrobeAssignments(settings) {
    persistWardrobeProfile(settings, getWardrobeProfileKey());
}

function persistCharacterLockProfile(settings) {
    persistCharacterLockProfileValue(settings, getCharacterLockProfileKey());
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

function refreshSettingsDashboard(root = document.getElementById(SETTINGS_ID)) {
    if (!root) return;
    const settings = getSettings();
    const dashboard = getSettingsDashboardState(settings);
    updateSettingsDashboard(root, settings, dashboard);
}

function createSettingsUi() {
    if (document.getElementById(SETTINGS_ID)) return;
    const container = document.getElementById('extensions_settings');
    if (!container) return;
    const settings = getSettings();
    const wrapper = document.createElement('div');
    wrapper.id = SETTINGS_ID;
    wrapper.className = 'inline-drawer';
    wrapper.innerHTML = renderSettingsHtml(settings, {
        draftTavernProfileOptionsHtml: buildDraftTavernProfileOptionsHtml(settings),
    });
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

function openWardrobeModal() {
    if (state.wardrobeModal?.isConnected) return;
    const root = document.createElement('div');
    root.className = 'bbcf-wardrobe-modal-root';
    root.innerHTML = renderWardrobeShellHtml();
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
    const visibleItems = getFilteredWardrobeItems(settings, owner.id, state.wardrobeCategory, state.wardrobeTag);
    const tags = getWardrobeTagsForOwner(settings, owner.id);
    if (state.wardrobeTag !== 'all' && !tags.includes(state.wardrobeTag)) state.wardrobeTag = 'all';
    body.innerHTML = renderWardrobeModalHtml({
        settings,
        owner,
        assignment,
        category: state.wardrobeCategory,
        tag: state.wardrobeTag,
        tags,
        editingId: state.wardrobeEditingId,
        tempPath: state.wardrobeTempPath,
        visibleItems,
    });
    bindWardrobeModalEvents(body);
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

function getStylePresetById(styleId, settings = getSettings()) {
    return resolveStylePresetById(styleId, settings);
}

function getLayoutPresetById(layoutId, settings = getSettings()) {
    return resolveLayoutPresetById(layoutId, settings);
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
    const root = document.createElement('div');
    root.id = MODAL_ID;
    root.className = 'bbcf-modal-root';
    root.innerHTML = renderForgeHtml(settings, savedDraft);
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

function buildStylePrompt(stylePreset, customPrompt) {
    const preset = getStylePresetById(stylePreset) || { id: 'manhwa', ...STYLE_PRESETS.manhwa };
    const custom = String(customPrompt || '').trim();
    return [preset.prompt, custom].filter(Boolean).join('\n');
}

function normalizePanelNote(line) {
    return String(line || '').replace(/^\s*\d+[.)-]?\s*/, '').trim();
}

function describeLayoutIntent(layout, number, total) {
    return resolveLayoutIntent(layout, number, total, getSettings());
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
    return buildScopedProfileFallbackKeys(SillyTavern.getContext());
}

function getScopedProfileKey() {
    return buildScopedProfileKey(SillyTavern.getContext());
}
