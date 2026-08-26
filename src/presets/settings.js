// Centralizes current preset editing so import/export can build on one UI controller later.
import { DRAFT_SYNC_FIELDS, MAX_PANELS, SETTINGS_ID } from '../core/constants.js';
import { makeId } from '../core/id.js';
import { clampInt } from '../core/numbers.js';
import { getLayoutPresetById as resolveLayoutPresetById, getStylePresetById as resolveStylePresetById } from './resolvers.js';
import {
    buildPresetDetailsHtml,
    buildPresetLibraryCardsHtml,
    buildPresetLibraryHtml,
} from './library-view.js';
import { buildLayoutExamplesHtml, buildLayoutOptionsHtml, buildStyleExamplesHtml, buildStyleOptionsHtml } from './view.js';
import { DEFAULT_DRAFT_PROMPT, DEFAULT_SETTINGS } from '../settings/defaults.js';
import { normalizeAspectPattern } from '../settings/normalizers.js';
import { escapeHtml } from '../ui/html.js';
import {
    createPortablePreset,
    getPortablePresetFilename,
    normalizePortablePreset,
    PORTABLE_PRESET_VERSION,
} from './portable.js';

const PORTABLE_DRAFT_FIELDS = [
    'generationMode',
    'insertMode',
    'panelCount',
    'layout',
    'stylePreset',
    'customPrompt',
    'negativePrompt',
];

export function createPresetSettingsController(dependencies) {
    const {
        describeLayoutIntent,
        getSavedDraftProfileKey,
        getSettings,
        Popup,
        POPUP_RESULT,
        POPUP_TYPE,
        notifySuccess,
        notifyWarning,
        persistCharacterLockProfile,
        refreshForgeWorkflowSummary,
        refreshSettingsDashboard,
        saveDraftFromModal,
        saveSettings,
        setSettingsControlValue,
        setValueSilent,
        state,
        syncDefaultDraftFields,
        updateSelectOptions,
        valueOf,
    } = dependencies;

    function syncDraftPromptPresetUi() {
        const settings = getSettings();
        const settingsRoot = document.getElementById(SETTINGS_ID);
        const modalRoot = state.modal?.isConnected ? state.modal : null;
        refreshSettingsDashboard(settingsRoot);
        refreshForgeWorkflowSummary(modalRoot);
    }

    function applyDraftPromptPreset(root, { source = 'settings', notify = true, presetId = '' } = {}) {
        const settings = getSettings();
        const selectedId = String(presetId || '');
        const preset = settings.draftPromptPresets.find(item => item.id === selectedId);
        if (!preset) {
            settings.activeDraftPromptPresetId = '';
            saveSettings();
            syncDraftPromptPresetUi();
            refreshForgeWorkflowSummary(root);
            return;
        }
        settings.activeDraftPromptPresetId = preset.id;
        settings.draftPrompt = preset.draftPrompt;
        const portableOnly = preset.kind === 'comic';
        setSettingsControlValue(document.getElementById(SETTINGS_ID), '#bbcf-draft-prompt', settings.draftPrompt);
        if (source === 'forge') {
            setValueSilent(root, '#bbcf-draft-mode', preset.generationMode);
            setValueSilent(root, '#bbcf-draft-insert-mode', preset.insertMode);
            setValueSilent(root, '#bbcf-draft-count', preset.panelCount);
            syncPresetUi({ styleValue: preset.stylePreset, layoutValue: preset.layout });
            setValueSilent(root, '#bbcf-draft-layout', preset.layout);
            setValueSilent(root, '#bbcf-draft-style', preset.stylePreset);
            if (!portableOnly) {
                setValueSilent(root, '#bbcf-draft-lock', preset.characterLock);
                setValueSilent(root, '#bbcf-draft-notes', preset.panelNotes);
                setValueSilent(root, '#bbcf-draft-bubbles', preset.bubbles);
                setValueSilent(root, '#bbcf-draft-inserts', preset.inserts);
                setValueSilent(root, '#bbcf-draft-sfx', preset.sfx);
            }
            setValueSilent(root, '#bbcf-draft-custom-style', preset.customPrompt);
            setValueSilent(root, '#bbcf-draft-negative', preset.negativePrompt);
            saveSettings();
            saveDraftFromModal(root, { manualFields: portableOnly ? PORTABLE_DRAFT_FIELDS : DRAFT_SYNC_FIELDS });
        } else {
            settings.generationMode = preset.generationMode;
            settings.insertMode = preset.insertMode;
            settings.panelCount = preset.panelCount;
            settings.layout = preset.layout;
            settings.stylePreset = preset.stylePreset;
            if (!portableOnly) {
                settings.characterLock = preset.characterLock;
                settings.defaultPanelNotes = preset.panelNotes;
                settings.defaultBubbles = preset.bubbles;
                settings.defaultInserts = preset.inserts;
                settings.defaultSfx = preset.sfx;
                persistCharacterLockProfile(settings);
            }
            settings.customPrompt = preset.customPrompt;
            settings.negativePrompt = preset.negativePrompt;
            saveSettings();
            setSettingsControlValue(root, '#bbcf-generation-mode', settings.generationMode);
            setSettingsControlValue(root, '#bbcf-insert-mode', settings.insertMode);
            setSettingsControlValue(root, '#bbcf-panel-count', settings.panelCount);
            syncPresetUi({ styleValue: settings.stylePreset, layoutValue: settings.layout });
            setSettingsControlValue(root, '#bbcf-layout', settings.layout);
            setSettingsControlValue(root, '#bbcf-style-preset', settings.stylePreset);
            if (!portableOnly) {
                setSettingsControlValue(root, '#bbcf-character-lock', settings.characterLock);
                setSettingsControlValue(root, '#bbcf-default-panel-notes', settings.defaultPanelNotes);
                setSettingsControlValue(root, '#bbcf-default-bubbles', settings.defaultBubbles);
                setSettingsControlValue(root, '#bbcf-default-inserts', settings.defaultInserts);
                setSettingsControlValue(root, '#bbcf-default-sfx', settings.defaultSfx);
            }
            setSettingsControlValue(root, '#bbcf-custom-style', settings.customPrompt);
            setSettingsControlValue(root, '#bbcf-negative', settings.negativePrompt);
            syncDefaultDraftFields(portableOnly ? PORTABLE_DRAFT_FIELDS : DRAFT_SYNC_FIELDS);
        }
        syncDraftPromptPresetUi();
        refreshForgeWorkflowSummary(state.modal);
        if (notify) notifySuccess('Набор черновика применён.');
    }

    async function createDraftPromptPresetFromCurrent(root, { source = 'settings' } = {}) {
        const settings = getSettings();
        const suggestedName = `Мой пресет ${settings.draftPromptPresets.length + 1}`;
        const value = await Popup.show.input('Новый пресет', 'Сохраним текущий стиль, макет и правила генерации. Сцена и персонажи в набор не войдут.', suggestedName, {
            okButton: 'Сохранить',
            cancelButton: 'Отмена',
        });
        if (value === null) return null;
        const label = String(value || suggestedName).trim() || suggestedName;
        const forge = source === 'forge';
        const read = (selector, fallback = '') => String(root?.querySelector(selector)?.value ?? fallback);
        const preset = {
            id: makeId('draft-prompt'),
            label,
            kind: 'comic',
            description: '',
            author: '',
            tags: [],
            recommendations: getCurrentRecommendations(settings),
            portableVersion: PORTABLE_PRESET_VERSION,
            importedAt: '',
            draftPrompt: forge ? String(settings.draftPrompt || DEFAULT_DRAFT_PROMPT) : read('#bbcf-draft-prompt', settings.draftPrompt || DEFAULT_DRAFT_PROMPT),
            generationMode: read(forge ? '#bbcf-draft-mode' : '#bbcf-generation-mode', settings.generationMode),
            insertMode: read(forge ? '#bbcf-draft-insert-mode' : '#bbcf-insert-mode', settings.insertMode),
            panelCount: clampInt(read(forge ? '#bbcf-draft-count' : '#bbcf-panel-count', settings.panelCount), 1, MAX_PANELS, settings.panelCount),
            layout: read(forge ? '#bbcf-draft-layout' : '#bbcf-layout', settings.layout),
            stylePreset: read(forge ? '#bbcf-draft-style' : '#bbcf-style-preset', settings.stylePreset),
            characterLock: '',
            panelNotes: '',
            bubbles: '',
            inserts: '',
            sfx: '',
            customPrompt: read(forge ? '#bbcf-draft-custom-style' : '#bbcf-custom-style', settings.customPrompt),
            negativePrompt: read(forge ? '#bbcf-draft-negative' : '#bbcf-negative', settings.negativePrompt),
        };
        settings.draftPromptPresets.unshift(preset);
        settings.activeDraftPromptPresetId = preset.id;
        saveSettings();
        syncDraftPromptPresetUi();
        notifySuccess('Пресет сохранён в библиотеке.');
        return preset;
    }

    async function renameDraftPromptPreset(presetId) {
        const settings = getSettings();
        const preset = settings.draftPromptPresets.find(item => item.id === presetId);
        if (!preset) return false;
        const value = await Popup.show.input('Переименовать пресет', '', preset.label, {
            okButton: 'Сохранить',
            cancelButton: 'Отмена',
        });
        if (value === null) return false;
        const label = String(value || '').trim();
        if (!label) {
            notifyWarning('Название пресета не может быть пустым.');
            return false;
        }
        preset.label = label;
        saveSettings();
        syncDraftPromptPresetUi();
        notifySuccess('Пресет переименован.');
        return true;
    }

    function duplicateDraftPromptPreset(presetId) {
        const settings = getSettings();
        const sourcePreset = settings.draftPromptPresets.find(item => item.id === presetId);
        if (!sourcePreset) return null;
        const preset = structuredClone(sourcePreset);
        preset.id = makeId('draft-prompt');
        preset.label = `${sourcePreset.label} — копия`;
        preset.importedAt = '';
        settings.draftPromptPresets.unshift(preset);
        saveSettings();
        syncDraftPromptPresetUi();
        notifySuccess('Копия пресета создана.');
        return preset;
    }

    function updateDraftPromptPresetFromCurrent(presetId, root, source) {
        const settings = getSettings();
        const preset = settings.draftPromptPresets.find(item => item.id === presetId);
        if (!preset) return false;
        const forge = source === 'forge';
        const read = (selector, fallback = '') => String(root?.querySelector(selector)?.value ?? fallback);
        preset.draftPrompt = forge ? String(settings.draftPrompt || DEFAULT_DRAFT_PROMPT) : read('#bbcf-draft-prompt', settings.draftPrompt || DEFAULT_DRAFT_PROMPT);
        preset.generationMode = read(forge ? '#bbcf-draft-mode' : '#bbcf-generation-mode', settings.generationMode);
        preset.insertMode = read(forge ? '#bbcf-draft-insert-mode' : '#bbcf-insert-mode', settings.insertMode);
        preset.panelCount = clampInt(read(forge ? '#bbcf-draft-count' : '#bbcf-panel-count', settings.panelCount), 1, MAX_PANELS, settings.panelCount);
        preset.layout = read(forge ? '#bbcf-draft-layout' : '#bbcf-layout', settings.layout);
        preset.stylePreset = read(forge ? '#bbcf-draft-style' : '#bbcf-style-preset', settings.stylePreset);
        preset.customPrompt = read(forge ? '#bbcf-draft-custom-style' : '#bbcf-custom-style', settings.customPrompt);
        preset.negativePrompt = read(forge ? '#bbcf-draft-negative' : '#bbcf-negative', settings.negativePrompt);
        preset.recommendations = getCurrentRecommendations(settings);
        if (preset.kind !== 'comic') {
            preset.characterLock = forge ? read('#bbcf-draft-lock') : String(settings.characterLock || '');
            preset.panelNotes = forge ? read('#bbcf-draft-notes') : String(settings.defaultPanelNotes || '');
            preset.bubbles = forge ? read('#bbcf-draft-bubbles') : String(settings.defaultBubbles || '');
            preset.inserts = forge ? read('#bbcf-draft-inserts') : String(settings.defaultInserts || '');
            preset.sfx = forge ? read('#bbcf-draft-sfx') : String(settings.defaultSfx || '');
        }
        saveSettings();
        syncDraftPromptPresetUi();
        notifySuccess('Пресет обновлён текущими настройками.');
        return true;
    }

    function deleteDraftPromptPreset(presetId = '') {
        const settings = getSettings();
        const selectedId = String(presetId || settings.activeDraftPromptPresetId || '');
        const preset = settings.draftPromptPresets.find(item => item.id === selectedId);
        if (!preset) return false;
        if (!window.confirm(`Удалить набор черновика "${preset.label}"?`)) return;
        settings.draftPromptPresets = settings.draftPromptPresets.filter(item => item.id !== selectedId);
        if (settings.activeDraftPromptPresetId === selectedId) settings.activeDraftPromptPresetId = '';
        saveSettings();
        syncDraftPromptPresetUi();
        notifySuccess('Пресет удалён.');
        return true;
    }

    function getStylePresetById(styleId, settings = getSettings()) {
        return resolveStylePresetById(styleId, settings);
    }

    function getLayoutPresetById(layoutId, settings = getSettings()) {
        return resolveLayoutPresetById(layoutId, settings);
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
        notifySuccess('Стиль удален.');
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
        notifySuccess('Макет удален.');
    }

    function saveStyleFromSettings(root) {
        const settings = getSettings();
        const customPrompt = String(root.querySelector('#bbcf-custom-style')?.value || '').trim();
        const savedPrompt = String(root.querySelector('#bbcf-save-style-prompt')?.value || '').trim();
        const selectedStyle = getStylePresetById(settings.stylePreset, settings);
        const prompt = savedPrompt || customPrompt || selectedStyle?.prompt || '';
        if (!prompt) {
            notifyWarning('Добавь описание стиля или выбери готовый стиль.');
            return;
        }
        const label = String(root.querySelector('#bbcf-save-style-name')?.value || '').trim() || `Мой стиль ${settings.savedStyles.length + 1}`;
        const style = { id: makeId('style'), label, prompt };
        settings.savedStyles.unshift(style);
        settings.stylePreset = `saved:${style.id}`;
        saveSettings();
        syncPresetUi({ styleValue: `saved:${style.id}` });
        notifySuccess('Стиль сохранён.');
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
        notifySuccess('Макет сохранён.');
    }

    function saveStyleFromDraft(root) {
        const settings = getSettings();
        const customPrompt = String(root.querySelector('#bbcf-draft-custom-style')?.value || '').trim();
        const savedPrompt = String(root.querySelector('#bbcf-draft-save-style-prompt')?.value || '').trim();
        const currentStyle = getStylePresetById(valueOf(root, '#bbcf-draft-style') || settings.stylePreset, settings);
        const prompt = savedPrompt || customPrompt || currentStyle?.prompt || '';
        if (!prompt) {
            notifyWarning('Добавь описание стиля или выбери готовый стиль.');
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
        notifySuccess('Стиль сохранён.');
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
        notifySuccess('Макет сохранён.');
    }

    function bindPresetLibraryActions(root, { source = 'settings' } = {}) {
        if (!root || root.dataset.bbcfPresetLibraryBound === '1') return;
        root.dataset.bbcfPresetLibraryBound = '1';
        root.addEventListener('click', async event => {
            const openButton = event.target.closest?.('[data-bbcf-open-preset-library]');
            if (!openButton) return;
            event.preventDefault();
            try {
                await openPresetLibrary(root, source);
            } catch (error) {
                reportPresetError('preset action failed', error);
            }
        });
    }

    async function openPresetLibrary(root, source) {
        let filter = 'all';
        let query = '';
        const content = document.createElement('div');
        content.innerHTML = buildPresetLibraryHtml(getSettings(), { filter, query });
        const popup = new Popup(content, POPUP_TYPE.DISPLAY, '', {
            large: true,
            leftAlign: true,
            allowVerticalScrolling: true,
        });
        const refreshCards = () => {
            const grid = content.querySelector('.bbcf-preset-library-grid');
            if (grid) grid.innerHTML = buildPresetLibraryCardsHtml(getSettings(), { filter, query });
            content.querySelectorAll('[data-bbcf-library-filter]').forEach(button => {
                const active = button.dataset.bbcfLibraryFilter === filter;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });
        };
        content.addEventListener('input', event => {
            if (!event.target.matches?.('[data-bbcf-library-search]')) return;
            query = event.target.value;
            refreshCards();
        });
        content.addEventListener('change', async event => {
            if (!event.target.matches?.('[data-bbcf-library-import-file]')) return;
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
                const outcome = await importPortablePresetFile(file, root, source);
                if (!outcome) return;
                if (outcome.applied) {
                    await popup.completeAffirmative();
                    return;
                }
                filter = 'imported';
                query = '';
                const search = content.querySelector('[data-bbcf-library-search]');
                if (search) search.value = '';
                refreshCards();
            } catch (error) {
                reportPresetError('preset import failed', error);
            }
        });
        content.addEventListener('click', async event => {
            const filterButton = event.target.closest?.('[data-bbcf-library-filter]');
            if (filterButton) {
                filter = filterButton.dataset.bbcfLibraryFilter || 'all';
                refreshCards();
                return;
            }
            if (event.target.closest?.('[data-bbcf-library-import]')) {
                content.querySelector('[data-bbcf-library-import-file]')?.click();
                return;
            }
            if (event.target.closest?.('[data-bbcf-library-create]')) {
                try {
                    const created = await createDraftPromptPresetFromCurrent(root, { source });
                    if (created) {
                        filter = 'mine';
                        query = '';
                        const search = content.querySelector('[data-bbcf-library-search]');
                        if (search) search.value = '';
                        refreshCards();
                    }
                } catch (error) {
                    reportPresetError('preset create failed', error);
                }
                return;
            }
            const actionButton = event.target.closest?.('[data-bbcf-library-action]');
            if (!actionButton) return;
            const action = actionButton.dataset.bbcfLibraryAction;
            const presetId = actionButton.dataset.presetId;
            event.target.closest?.('details')?.removeAttribute('open');
            try {
                if (action === 'apply') {
                    applyDraftPromptPreset(root, { source, presetId });
                    refreshCards();
                    await popup.completeAffirmative();
                } else if (action === 'view') {
                    await showDraftPromptPresetDetails(presetId);
                } else if (action === 'update') {
                    if (updateDraftPromptPresetFromCurrent(presetId, root, source)) refreshCards();
                } else if (action === 'rename') {
                    if (await renameDraftPromptPreset(presetId)) refreshCards();
                } else if (action === 'duplicate') {
                    if (duplicateDraftPromptPreset(presetId)) refreshCards();
                } else if (action === 'export') {
                    exportPortablePreset(root, source, presetId);
                } else if (action === 'delete') {
                    if (deleteDraftPromptPreset(presetId)) refreshCards();
                }
            } catch (error) {
                reportPresetError(`preset ${action} failed`, error);
            }
        });
        await popup.show();
    }

    async function showDraftPromptPresetDetails(presetId) {
        const settings = getSettings();
        const preset = settings.draftPromptPresets.find(item => item.id === presetId);
        if (!preset) return;
        const content = document.createElement('div');
        content.innerHTML = buildPresetDetailsHtml(settings, preset);
        const popup = new Popup(content, POPUP_TYPE.DISPLAY, '', {
            wider: true,
            leftAlign: true,
            allowVerticalScrolling: true,
        });
        await popup.show();
    }

    function reportPresetError(context, error) {
        console.error(`[BB Comic Forge] ${context}`, error);
        notifyWarning(error?.message || String(error));
    }

    function exportPortablePreset(root, source, presetId = '') {
        const preset = collectPortablePreset(root, source, presetId);
        const blob = new Blob([`${JSON.stringify(preset, null, 2)}\n`], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = getPortablePresetFilename(preset);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        notifySuccess('Пресет экспортирован.');
    }

    function collectPortablePreset(root, source, presetId = '') {
        const settings = getSettings();
        const forge = source === 'forge';
        const read = (selector, fallback = '') => String(root?.querySelector(selector)?.value ?? fallback);
        const requestedPreset = settings.draftPromptPresets.find(item => item.id === presetId);
        if (presetId && !requestedPreset) throw new Error('Пресет больше не существует. Обнови библиотеку.');
        const selectedPreset = requestedPreset
            || settings.draftPromptPresets.find(item => item.id === settings.activeDraftPromptPresetId);
        const stored = requestedPreset || null;
        const styleId = stored?.stylePreset || read(forge ? '#bbcf-draft-style' : '#bbcf-style-preset', settings.stylePreset);
        const layoutId = stored?.layout || read(forge ? '#bbcf-draft-layout' : '#bbcf-layout', settings.layout);
        const style = getStylePresetById(styleId, settings);
        const layout = getLayoutPresetById(layoutId, settings);
        if (!style?.prompt) throw new Error('Выбранный стиль не содержит prompt.');
        if (!layout?.pattern?.length) throw new Error('Выбранный макет не содержит панелей.');
        const recommendations = stored?.recommendations && Object.values(stored.recommendations).some(Boolean)
            ? stored.recommendations
            : getCurrentRecommendations(settings);
        return createPortablePreset({
            metadata: {
                name: selectedPreset?.label || style.label || 'Comic Forge Preset',
                description: selectedPreset?.description || '',
                author: selectedPreset?.author || '',
                tags: selectedPreset?.tags || [],
            },
            recipe: {
                generationMode: stored?.generationMode || read(forge ? '#bbcf-draft-mode' : '#bbcf-generation-mode', settings.generationMode),
                insertMode: stored?.insertMode || read(forge ? '#bbcf-draft-insert-mode' : '#bbcf-insert-mode', settings.insertMode),
                panelCount: stored?.panelCount || read(forge ? '#bbcf-draft-count' : '#bbcf-panel-count', settings.panelCount),
                draftPrompt: stored?.draftPrompt || (forge ? settings.draftPrompt : read('#bbcf-draft-prompt', settings.draftPrompt)),
                customPrompt: stored ? stored.customPrompt : read(forge ? '#bbcf-draft-custom-style' : '#bbcf-custom-style', settings.customPrompt),
                negativePrompt: stored ? stored.negativePrompt : read(forge ? '#bbcf-draft-negative' : '#bbcf-negative', settings.negativePrompt),
            },
            style: {
                name: style.label || 'Comic style',
                prompt: style.prompt,
            },
            layout: {
                name: layout.label || layout.id || 'Comic layout',
                pattern: layout.pattern,
                intent: layout.intent || '',
                singleAspect: layout.singleAspect || layout.pattern[0] || '3:4',
            },
            recommendations,
        });
    }

    function getCurrentRecommendations(settings) {
        return {
            apiType: settings.apiType,
            model: settings.apiType === 'naistera' ? settings.naisteraModel : settings.model,
            size: settings.apiType === 'openai-images' ? settings.openaiSize : (settings.imageSize || settings.aspectRatio),
            quality: settings.apiType === 'openai-images' ? settings.openaiQuality : '',
        };
    }

    async function importPortablePresetFile(file, root, source) {
        if (file.size > 1024 * 1024) throw new Error('Файл пресета больше 1 МБ.');
        let raw;
        try {
            raw = JSON.parse(await file.text());
        } catch (error) {
            throw new Error('Не удалось прочитать JSON пресета.');
        }
        const portable = normalizePortablePreset(raw);
        const result = await showPortablePresetPreview(portable);
        if (result !== POPUP_RESULT.AFFIRMATIVE && result !== POPUP_RESULT.CUSTOM1) return null;
        const imported = installPortablePreset(portable);
        const apply = result === POPUP_RESULT.AFFIRMATIVE;
        if (apply) {
            const settings = getSettings();
            settings.activeDraftPromptPresetId = imported.id;
            saveSettings();
        }
        syncPresetUi();
        syncDraftPromptPresetUi();
        if (apply) {
            applyDraftPromptPreset(root, { source, notify: false, presetId: imported.id });
            notifySuccess('Пресет импортирован и применён.');
        } else {
            notifySuccess('Пресет импортирован. Он доступен в списке наборов.');
        }
        return { preset: imported, applied: apply };
    }

    function installPortablePreset(portable) {
        const settings = getSettings();
        const styleId = makeId('style');
        const layoutId = makeId('layout');
        const preset = {
            id: makeId('draft-prompt'),
            label: portable.metadata.name,
            kind: 'comic',
            description: portable.metadata.description,
            author: portable.metadata.author,
            tags: portable.metadata.tags,
            recommendations: portable.recommendations,
            portableVersion: portable.version,
            importedAt: new Date().toISOString(),
            draftPrompt: portable.recipe.draftPrompt,
            generationMode: portable.recipe.generationMode,
            insertMode: portable.recipe.insertMode,
            panelCount: portable.recipe.panelCount,
            layout: `saved:${layoutId}`,
            stylePreset: `saved:${styleId}`,
            characterLock: '',
            panelNotes: '',
            bubbles: '',
            inserts: '',
            sfx: '',
            customPrompt: portable.recipe.customPrompt,
            negativePrompt: portable.recipe.negativePrompt,
        };
        settings.savedStyles.unshift({ id: styleId, label: portable.style.name, prompt: portable.style.prompt });
        settings.savedLayouts.unshift({
            id: layoutId,
            label: portable.layout.name,
            pattern: portable.layout.pattern,
            intent: portable.layout.intent,
            singleAspect: portable.layout.singleAspect,
        });
        settings.draftPromptPresets.unshift(preset);
        saveSettings();
        return preset;
    }

    async function showPortablePresetPreview(preset) {
        const recommendations = [
            preset.recommendations.apiType,
            preset.recommendations.model,
            preset.recommendations.size,
            preset.recommendations.quality,
        ].filter(Boolean).join(' · ');
        const content = document.createElement('div');
        content.className = 'bbcf-preset-import-preview';
        content.innerHTML = `
            <h3>Импорт пресета</h3>
            <strong class="bbcf-preset-import-title">${escapeHtml(preset.metadata.name)}</strong>
            ${preset.metadata.author ? `<p>Автор: ${escapeHtml(preset.metadata.author)}</p>` : ''}
            ${preset.metadata.description ? `<p>${escapeHtml(preset.metadata.description)}</p>` : ''}
            <div class="bbcf-preset-import-list">
                <span><i class="fa-solid fa-check"></i> AI-промпт черновика</span>
                <span><i class="fa-solid fa-check"></i> Стиль: ${escapeHtml(preset.style.name)}</span>
                <span><i class="fa-solid fa-check"></i> Макет: ${escapeHtml(preset.layout.name)}</span>
                <span><i class="fa-solid fa-check"></i> Дополнительные инструкции</span>
                <span><i class="fa-solid fa-check"></i> Negative prompt</span>
                <span><i class="fa-solid fa-check"></i> ${preset.recipe.generationMode === 'single' ? 'Экономный режим' : 'Генерация по панелям'} · ${preset.recipe.panelCount} пан.</span>
            </div>
            ${recommendations ? `<p class="bbcf-preset-recommendation"><b>Рекомендация:</b> ${escapeHtml(recommendations)}</p>` : ''}
            <p class="bbcf-muted">Текущее подключение, API key, персонажи, референсы и содержимое сцены не изменятся.</p>
        `;
        const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
            okButton: 'Импорт и применить',
            cancelButton: 'Отмена',
            wider: true,
            leftAlign: true,
            allowVerticalScrolling: true,
            customButtons: [{
                text: 'Только импорт',
                result: POPUP_RESULT.CUSTOM1,
                icon: 'fa-download',
            }],
        });
        return popup.show();
    }

    return {
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
    };
}
