// Keeps connection profiles and model discovery together while presets remain independent.
import { SETTINGS_ID } from '../core/constants.js';
import { makeId } from '../core/id.js';
import {
    extractModelNames,
    filterDraftModelNames,
    filterModelNamesForProvider,
    getKnownModelsForProvider,
} from './models.js';
import {
    draftApiHeaders,
    draftGeminiApiHeaders,
    geminiApiHeaders,
    imageApiHeaders,
    normalizeGeminiModelsUrl,
    normalizeOpenAiBase,
} from './request.js';
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
} from './view.js';
import { option } from '../ui/html.js';

export function createProviderSettingsController(dependencies) {
    const {
        ConnectionManagerRequestService,
        fetchJson,
        getContext,
        getSettings,
        notifyError,
        notifyInfo,
        notifySuccess,
        refreshSettingsDashboard,
        saveSettings,
        setSettingsControlValue,
        updateSelectOptions,
    } = dependencies;

    function syncProviderRows() {
        const settings = getSettings();
        const root = document.getElementById(SETTINGS_ID);
        if (!root) return;
        root.querySelectorAll('.bbcf-openai-row').forEach(node => node.classList.toggle('bbcf-hidden', settings.apiType !== 'openai-images'));
        root.querySelectorAll('.bbcf-naistera-row').forEach(node => node.classList.toggle('bbcf-hidden', settings.apiType !== 'naistera'));
        root.querySelectorAll('.bbcf-image-size-row').forEach(node => node.classList.toggle('bbcf-hidden', ['openai-images', 'naistera'].includes(settings.apiType)));
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
        notifySuccess('Профиль генерации картинок применён.');
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
        notifySuccess(existingIndex >= 0 ? 'Профиль генерации картинок обновлён.' : 'Профиль генерации картинок сохранён.');
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
        notifySuccess('Профиль генерации картинок удалён.');
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
        notifySuccess('Профиль подключения применён.');
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
        notifySuccess(existingIndex >= 0 ? 'Профиль подключения обновлён.' : 'Профиль подключения сохранён.');
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
        notifySuccess('Профиль подключения удалён.');
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
            const profile = getContext()?.extensionSettings?.connectionManager?.profiles?.find(item => item.id === id);
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
                notifySuccess(count ? `Подключено. Найдено моделей: ${count}.` : 'Подключено.');
            }
            return settings.availableModels;
        } catch (error) {
            if (!silent) notifyError(error?.message || String(error));
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
            if (!silent) notifyInfo('Для этого режима используется модель SillyTavern.');
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
                notifySuccess(message);
            }
            return settings.availableDraftModels;
        } catch (error) {
            if (!silent) notifyError(error?.message || String(error));
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

    return {
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
    };
}
