// Centralizes current preset editing so import/export can build on one UI controller later.
import { DRAFT_SYNC_FIELDS, MAX_PANELS, SETTINGS_ID } from '../core/constants.js';
import { makeId } from '../core/id.js';
import { clampInt } from '../core/numbers.js';
import { buildDraftPromptPresetOptionsHtml, getActiveDraftPromptPreset } from '../draft/view.js';
import { getLayoutPresetById as resolveLayoutPresetById, getStylePresetById as resolveStylePresetById } from './resolvers.js';
import { buildLayoutExamplesHtml, buildLayoutOptionsHtml, buildStyleExamplesHtml, buildStyleOptionsHtml } from './view.js';
import { DEFAULT_DRAFT_PROMPT, DEFAULT_SETTINGS } from '../settings/defaults.js';
import { normalizeAspectPattern } from '../settings/normalizers.js';
import { escapeHtml } from '../ui/html.js';
import {
    createPortablePreset,
    getPortablePresetFilename,
    normalizePortablePreset,
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

    function applyDraftPromptPreset(root, { source = 'settings', notify = true } = {}) {
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
        syncDraftPromptPresetUi({ forceName: true });
        refreshForgeWorkflowSummary(state.modal);
        if (notify) notifySuccess('Набор черновика применён.');
    }

    function saveDraftPromptPreset(root, { source = 'settings' } = {}) {
        const settings = getSettings();
        const nameSelector = source === 'forge' ? '#bbcf-forge-draft-prompt-preset-name' : '#bbcf-draft-prompt-preset-name';
        const selectedId = settings.activeDraftPromptPresetId || String(root?.querySelector(source === 'forge' ? '#bbcf-forge-draft-prompt-preset' : '#bbcf-draft-prompt-preset')?.value || '');
        const existingIndex = settings.draftPromptPresets.findIndex(preset => preset.id === selectedId);
        const existing = existingIndex >= 0 ? settings.draftPromptPresets[existingIndex] : null;
        const label = String(root?.querySelector(nameSelector)?.value || '').trim()
            || (existing ? existing.label : `Набор черновика ${settings.draftPromptPresets.length + 1}`);
        const preset = {
            id: existing?.id || makeId('draft-prompt'),
            label,
            kind: existing?.kind || 'snapshot',
            description: existing?.description || '',
            author: existing?.author || '',
            tags: existing?.tags || [],
            recommendations: existing?.recommendations || {},
            importedAt: existing?.importedAt || '',
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

    function bindPortablePresetActions(root, { source = 'settings' } = {}) {
        if (!root) return;
        const prefix = source === 'forge' ? '#bbcf-forge' : '#bbcf';
        const exportButton = root.querySelector(`${prefix}-export-comic-preset`);
        const importButton = root.querySelector(`${prefix}-import-comic-preset`);
        const fileInput = root.querySelector(`${prefix}-import-comic-preset-file`);
        exportButton?.addEventListener('click', () => {
            try {
                exportPortablePreset(root, source);
            } catch (error) {
                console.error('[BB Comic Forge] preset export failed', error);
                notifyWarning(error?.message || String(error));
            }
        });
        importButton?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            fileInput.value = '';
            if (!file) return;
            try {
                await importPortablePresetFile(file, root, source);
            } catch (error) {
                console.error('[BB Comic Forge] preset import failed', error);
                notifyWarning(error?.message || String(error));
            }
        });
    }

    function exportPortablePreset(root, source) {
        const preset = collectPortablePreset(root, source);
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

    function collectPortablePreset(root, source) {
        const settings = getSettings();
        const forge = source === 'forge';
        const read = (selector, fallback = '') => String(root?.querySelector(selector)?.value ?? fallback);
        const styleId = read(forge ? '#bbcf-draft-style' : '#bbcf-style-preset', settings.stylePreset);
        const layoutId = read(forge ? '#bbcf-draft-layout' : '#bbcf-layout', settings.layout);
        const style = getStylePresetById(styleId, settings);
        const layout = getLayoutPresetById(layoutId, settings);
        if (!style?.prompt) throw new Error('Выбранный стиль не содержит prompt.');
        if (!layout?.pattern?.length) throw new Error('Выбранный макет не содержит панелей.');
        const presetSelect = root?.querySelector(forge ? '#bbcf-forge-draft-prompt-preset' : '#bbcf-draft-prompt-preset');
        const selectedPreset = settings.draftPromptPresets.find(item => item.id === presetSelect?.value)
            || settings.draftPromptPresets.find(item => item.id === settings.activeDraftPromptPresetId);
        const typedName = read(forge ? '#bbcf-forge-draft-prompt-preset-name' : '#bbcf-draft-prompt-preset-name').trim();
        return createPortablePreset({
            metadata: {
                name: typedName || selectedPreset?.label || style.label || 'Comic Forge Preset',
                description: selectedPreset?.description || '',
                author: selectedPreset?.author || '',
                tags: selectedPreset?.tags || [],
            },
            recipe: {
                generationMode: read(forge ? '#bbcf-draft-mode' : '#bbcf-generation-mode', settings.generationMode),
                insertMode: read(forge ? '#bbcf-draft-insert-mode' : '#bbcf-insert-mode', settings.insertMode),
                panelCount: read(forge ? '#bbcf-draft-count' : '#bbcf-panel-count', settings.panelCount),
                draftPrompt: forge ? settings.draftPrompt : read('#bbcf-draft-prompt', settings.draftPrompt),
                customPrompt: read(forge ? '#bbcf-draft-custom-style' : '#bbcf-custom-style', settings.customPrompt),
                negativePrompt: read(forge ? '#bbcf-draft-negative' : '#bbcf-negative', settings.negativePrompt),
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
            recommendations: {
                apiType: settings.apiType,
                model: settings.apiType === 'naistera' ? settings.naisteraModel : settings.model,
                size: settings.apiType === 'openai-images' ? settings.openaiSize : (settings.imageSize || settings.aspectRatio),
                quality: settings.apiType === 'openai-images' ? settings.openaiQuality : '',
            },
        });
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
        if (result !== POPUP_RESULT.AFFIRMATIVE && result !== POPUP_RESULT.CUSTOM1) return;
        const imported = installPortablePreset(portable);
        const apply = result === POPUP_RESULT.AFFIRMATIVE;
        if (apply) {
            const settings = getSettings();
            settings.activeDraftPromptPresetId = imported.id;
            saveSettings();
        }
        syncPresetUi();
        syncDraftPromptPresetUi({ forceName: true });
        if (apply) {
            const selector = source === 'forge' ? '#bbcf-forge-draft-prompt-preset' : '#bbcf-draft-prompt-preset';
            const select = root?.querySelector(selector);
            if (select) select.value = imported.id;
            applyDraftPromptPreset(root, { source, notify: false });
            notifySuccess('Пресет импортирован и применён.');
        } else {
            notifySuccess('Пресет импортирован. Он доступен в списке наборов.');
        }
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
        applyDraftPromptPreset,
        bindPortablePresetActions,
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
