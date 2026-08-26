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
import { POPUP_RESULT, POPUP_TYPE, Popup } from '../../../popup.js';
import { ConnectionManagerRequestService } from '../../shared.js';
import {
    DRAFT_SYNC_FIELDS,
    FAB_ID,
    FAB_WRAPPER_ID,
    MAX_CONCURRENCY,
    MAX_PANELS,
    MAX_PREVIOUS_CONTEXT_IMAGES,
    MODAL_ID,
    MODULE_NAME,
    SETTINGS_ID,
} from './src/core/constants.js';
import { clampInt } from './src/core/numbers.js';
import { uniqueStrings } from './src/core/strings.js';
import { splitLines } from './src/comic/syntax.js';
import { createPanelPlans, createSinglePagePanel } from './src/comic/planner.js';
import {
    buildStandaloneComicDocument,
    extractImagePathsFromHtml,
    makeShareHtml,
    safeFilename,
} from './src/comic/artifacts.js';
import { createComicHistoryStore } from './src/comic/history.js';
import { renderComicHistoryHtml } from './src/comic/history-view.js';
import { createComicLightbox } from './src/comic/lightbox.js';
import { createComicPreviewController } from './src/comic/preview.js';
import { createComicActions } from './src/comic/actions.js';
import { createPageExporter, showSavedPageImageNotice } from './src/comic/page-export.js';
import { createComicChatGateway } from './src/comic/chat.js';
import {
    buildComicHtml,
    buildPanelHtml,
    buildSingleComicHtml,
    getPanelLayoutFromElement,
    panelImageStyle,
    panelStyle,
} from './src/comic/render.js';
import { extractJsonObject } from './src/draft/parser.js';
import { getActiveDraftPromptPreset } from './src/draft/view.js';
import {
    renderProgress,
    runQueue,
    startElapsedProgress,
    updateProgress,
    waitWithProgress,
} from './src/generation/progress.js';
import { createReferenceService } from './src/generation/references.js';
import { uploadGeneratedImage } from './src/images/storage.js';
import {
    describeLayoutIntent as resolveLayoutIntent,
    getBuiltinLayoutId,
} from './src/presets/resolvers.js';
import { createPresetSettingsController } from './src/presets/settings.js';
import { getKnownModelsForProvider } from './src/providers/models.js';
import { getImageApiLabel } from './src/providers/profiles.js';
import { createImageProviderGenerator } from './src/providers/image-generation.js';
import { createCancellationError, isAbortError, requestJson, throwIfAborted } from './src/providers/transport.js';
import {
    getActiveDraftConnectionProfile,
    getActiveImageConnectionProfile,
} from './src/providers/view.js';
import { createProviderSettingsController } from './src/providers/settings.js';
import { DEFAULT_SETTINGS } from './src/settings/defaults.js';
import { normalizeBaseSettings } from './src/settings/normalize.js';
import { hydrateScopedSettings, persistCharacterLockProfileValue, persistWardrobeProfile } from './src/settings/profiles.js';
import { buildScopedProfileFallbackKeys, buildScopedProfileKey } from './src/settings/scope.js';
import { isDisclosureExpanded, setDisclosureExpanded, upgradeDisclosures } from './src/ui/disclosure.js';
import { decodeJsonAttr, encodeJsonAttr, escapeHtml, stripHtml } from './src/ui/html.js';
import { renderForgeHtml } from './src/ui/forge-view.js';
import { updateSettingsDashboard } from './src/ui/settings-dashboard.js';
import { renderSettingsHtml } from './src/ui/settings-view.js';
import { getWardrobeActiveEntries } from './src/wardrobe/selectors.js';
import { createWardrobeController } from './src/wardrobe/controller.js';
import { createDraftStateController } from './src/draft/state.js';
import { createAiDraftController } from './src/draft/ai.js';

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

const {
    bindReferenceSettings,
    bindWardrobeRecoveryButtons,
    openWardrobeModal,
    refreshSettingsUi,
    renderWardrobeModal,
} = createWardrobeController({
    createSettingsUi,
    fetchJson,
    getContext: () => SillyTavern.getContext(),
    getReferenceProfileKey,
    getSettings,
    notifyError: message => toastr.error(message, 'Comic Forge'),
    notifyInfo: message => toastr.info(message, 'Comic Forge'),
    notifySuccess: message => toastr.success(message, 'Comic Forge'),
    notifyWarning: message => toastr.warning(message, 'Comic Forge'),
    persistWardrobeAssignments,
    saveSettings,
    saveSettingsImmediately,
    state,
});

const {
    buildFullPrompt,
    buildReferenceInstruction,
    buildReferencePromptBlock,
    buildWardrobePromptBlock,
    collectReferenceImages,
} = createReferenceService({
    getSettings,
    getWardrobeActiveEntries,
});

const {
    bindPresetLibraryActions,
    bindPresetDeleteActions,
    getLayoutPresetById,
    getStylePresetById,
    saveLayoutFromDraft,
    saveLayoutFromSettings,
    saveStyleFromDraft,
    saveStyleFromSettings,
    syncDraftPromptPresetUi,
    syncPresetUi,
} = createPresetSettingsController({
    describeLayoutIntent,
    getSavedDraftProfileKey,
    getSettings,
    Popup,
    POPUP_RESULT,
    POPUP_TYPE,
    notifySuccess: message => toastr.success(message, 'Comic Forge'),
    notifyWarning: message => toastr.warning(message, 'Comic Forge'),
    persistCharacterLockProfile,
    refreshForgeWorkflowSummary,
    refreshSettingsDashboard,
    saveDraftFromModal: (...args) => saveDraftFromModal(...args),
    saveSettings,
    setSettingsControlValue,
    setValueSilent,
    state,
    syncDefaultDraftFields: (...args) => syncDefaultDraftFields(...args),
    updateSelectOptions,
    valueOf,
});

const {
    applySavedDraftToModal,
    bindDraftPersistence,
    getSavedDraft,
    readDraftFromModal,
    saveDraftFromModal,
    saveDraftToSettings,
    syncDefaultDraftField,
    syncDefaultDraftFields,
} = createDraftStateController({
    state,
    clampNumberInput,
    getLayoutPresetById,
    getSavedDraftProfileKey,
    getSettings,
    getStylePresetById,
    hasCommittedNumberInput,
    refreshForgeWorkflowSummary,
    saveSettings,
    setValueSilent,
    syncPresetUi,
    valueOf,
});

const {
    applyDraftConnectionProfile,
    applyImageConnectionProfile,
    buildDraftTavernProfileOptionsHtml,
    deleteDraftConnectionProfile,
    deleteImageConnectionProfile,
    getDraftConnectionNote,
    getDraftTavernProfileLabel,
    getSupportedTavernDraftProfiles,
    loadDraftModels,
    loadProviderModels,
    saveDraftConnectionProfile,
    saveImageConnectionProfile,
    syncDraftConnectionProfileUi,
    syncDraftConnectionRows,
    syncImageConnectionProfileUi,
    syncProviderRows,
    updateModelPicker,
} = createProviderSettingsController({
    ConnectionManagerRequestService,
    fetchJson,
    getContext: () => SillyTavern.getContext(),
    getSettings,
    notifyError: message => toastr.error(message, 'Comic Forge'),
    notifyInfo: message => toastr.info(message, 'Comic Forge'),
    notifySuccess: message => toastr.success(message, 'Comic Forge'),
    refreshSettingsDashboard,
    saveSettings,
    setSettingsControlValue,
    updateSelectOptions,
});

const {
    fillDraftFromAi,
    runDraftPrompt,
} = createAiDraftController({
    ConnectionManagerRequestService,
    collectRecentChat,
    fetchJson,
    getContext: () => SillyTavern.getContext(),
    getSettings,
    getSupportedTavernDraftProfiles,
    notifyError: message => toastr.error(message, 'Comic Forge'),
    notifySuccess: message => toastr.success(message, 'Comic Forge'),
    refreshForgeWorkflowSummary,
    saveDraftFromModal,
    substituteParams,
});

const {
    getActiveComicRecord,
    getScopedComicHistory,
    isComicRecordForCurrentScope,
    rememberComic,
} = createComicHistoryStore({
    state,
    getSettings,
    getScopedProfileKey,
    saveSettings,
});

const { openComicLightbox } = createComicLightbox({ state, Popup, POPUP_TYPE });

const {
    bindComicActions,
    cleanupRenderedComics,
    installChatObserver,
    scheduleComicActionRefresh,
} = createComicActions({
    state,
    openComicLightbox,
    regeneratePanel,
    regeneratePreviewPanel,
});

const {
    attachForgePreviewPanelControls,
    clearForgePreview,
    isHistoryPreviewMode,
    restoreCurrentPreview,
    setHistoryPreviewMode,
} = createComicPreviewController({
    state,
    bindComicActions,
    cancelActiveGeneration,
    cleanupRenderedComics,
    getSettings,
    notifyInfo: message => toastr.info(message, 'Comic Forge'),
    readDraftFromModal,
    regeneratePreviewPanel,
    updateFloatingButton,
    updateSendToChatButton,
});

const { savePreviewPageImage } = createPageExporter({
    state,
    isHistoryPreviewMode,
    notifyError: message => toastr.error(message, 'Comic Forge'),
    notifyInfo: message => toastr.info(message, 'Comic Forge'),
    notifySuccess: message => toastr.success(message, 'Comic Forge'),
    readDraftFromModal,
    rememberComic,
    renderComicHistory,
    saveImageToFile,
});

const {
    replacePanelHtmlInChat,
    sendPendingComicToChat,
} = createComicChatGateway({
    state,
    addOneMessage,
    cleanupRenderedComics,
    eventSource,
    eventTypes: event_types,
    getContext: () => SillyTavern.getContext(),
    getCurrentCharacterName,
    getSettings,
    notifyError: message => toastr.error(message, 'Comic Forge'),
    notifyInfo: message => toastr.info(message, 'Comic Forge'),
    notifySuccess: message => toastr.success(message, 'Comic Forge'),
    readDraftFromModal,
    rememberComic,
    renderComicHistory,
    saveChat,
    scheduleComicActionRefresh,
    updateFloatingButton,
    updateMessageBlock,
    updateSendToChatButton,
});

const generateProviderImage = createImageProviderGenerator({
    getSettings,
    fetchJson,
    buildFullPrompt,
    buildReferenceInstruction,
});

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
    syncDraftPromptPresetUi();
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
    bindPresetLibraryActions(root, { source: 'settings' });
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
    syncDraftPromptPresetUi();
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

function updateSelectOptions(select, html, value) {
    if (!select) return;
    select.innerHTML = html;
    select.value = value || '';
    if (select.value !== value && select.options.length) select.selectedIndex = 0;
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
    const draftPresetLabel = getActiveDraftPromptPreset(settings)?.label || '';
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
    bindPresetLibraryActions(root, { source: 'forge' });
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
    const settings = getSettings();
    return createPanelPlans(draft, getComicPlanningContext(settings));
}

function buildSinglePagePanel(draft, plans) {
    const settings = getSettings();
    return createSinglePagePanel(draft, plans, getComicPlanningContext(settings));
}

function getComicPlanningContext(settings) {
    return {
        settings,
        recentContext: settings.injectChatContextToImagePrompt
            ? collectRecentChat(settings.contextMessages)
            : '',
        referenceLock: buildReferencePromptBlock(),
        wardrobeLock: buildWardrobePromptBlock(),
        resolveStylePreset: styleId => getStylePresetById(styleId, settings),
        resolveLayoutPreset: layoutId => getLayoutPresetById(layoutId, settings),
        resolveLayoutIntent: (layout, number, total) => resolveLayoutIntent(layout, number, total, settings),
    };
}

function describeLayoutIntent(layout, number, total) {
    return resolveLayoutIntent(layout, number, total, getSettings());
}

async function generatePanelImage(panel, onStatus = null, signal = null) {
    const settings = getSettings();
    throwIfAborted(signal);
    if (typeof onStatus === 'function') onStatus('Запрос');
    const references = settings.apiType === 'onlysq-imagen' ? [] : await collectReferenceImages(panel.previousImagePaths, signal);
    throwIfAborted(signal);
    return generateProviderImage(settings.apiType, panel, references, signal);
}

function validateGenerationSettings() {
    const settings = getSettings();
    if (!settings.endpoint && !['naistera', 'onlysq-imagen'].includes(settings.apiType)) throw new Error('Endpoint не настроен.');
    if (!settings.apiKey) throw new Error('API key не настроен.');
    if (settings.apiType !== 'naistera' && !settings.model) throw new Error('Модель не настроена.');
}

async function fetchJson(url, options = {}) {
    return requestJson(url, options, getSettings().timeoutMs);
}

async function saveImageToFile(dataUrl, panelNumber = 0, signal = null) {
    return uploadGeneratedImage(dataUrl, panelNumber, signal, {
        getContext: () => SillyTavern.getContext(),
        getCharacterName: () => getCurrentCharacterName(),
    });
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

function updateSendToChatButton(root) {
    const button = root?.querySelector('#bbcf-send-to-chat');
    if (!button) return;
    const canSend = Boolean(state.pendingComic?.html && !state.pendingComic.sent);
    button.classList.toggle('bbcf-hidden', !canSend);
    button.disabled = state.generating || !canSend;
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
function renderComicHistory(root) {
    const panel = root.querySelector('#bbcf-history-panel');
    if (!panel) return;
    const history = getScopedComicHistory();
    panel.innerHTML = renderComicHistoryHtml(history);
    if (!history.length) return;
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
