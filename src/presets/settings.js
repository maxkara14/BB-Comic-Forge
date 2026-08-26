// Centralizes current preset editing so import/export can build on one UI controller later.
import { DRAFT_SYNC_FIELDS, MAX_PANELS, SETTINGS_ID } from '../core/constants.js';
import { makeId } from '../core/id.js';
import { clampInt } from '../core/numbers.js';
import { buildDraftPromptPresetOptionsHtml, getActiveDraftPromptPreset } from '../draft/view.js';
import { getLayoutPresetById as resolveLayoutPresetById, getStylePresetById as resolveStylePresetById } from './resolvers.js';
import { buildLayoutExamplesHtml, buildLayoutOptionsHtml, buildStyleExamplesHtml, buildStyleOptionsHtml } from './view.js';
import { DEFAULT_DRAFT_PROMPT, DEFAULT_SETTINGS } from '../settings/defaults.js';
import { normalizeAspectPattern } from '../settings/normalizers.js';

export function createPresetSettingsController(dependencies) {
    const {
        describeLayoutIntent,
        getSavedDraftProfileKey,
        getSettings,
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
        notifySuccess('Набор черновика применён.');
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
        notifySuccess(existingIndex >= 0 ? 'Набор черновика обновлён.' : 'Набор черновика сохранён.');
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
        notifySuccess('Набор черновика удалён.');
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

    return {
        applyDraftPromptPreset,
        bindPresetDeleteActions,
        deleteDraftPromptPreset,
        getLayoutPresetById,
        getStylePresetById,
        saveDraftPromptPreset,
        saveLayoutFromDraft,
        saveLayoutFromSettings,
        saveStyleFromDraft,
        saveStyleFromSettings,
        syncDraftPromptPresetUi,
        syncPresetUi,
    };
}
