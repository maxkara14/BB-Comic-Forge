import { DRAFT_SYNC_FIELDS, DRAFT_SYNC_SELECTORS, MAX_PANELS } from '../core/constants.js';
import { clampInt } from '../core/numbers.js';
import { uniqueStrings } from '../core/strings.js';
import { DEFAULT_NEGATIVE_PROMPT, DEFAULT_SETTINGS } from '../settings/defaults.js';
import { normalizeSavedDraft } from '../settings/normalizers.js';

export function createDraftStateController(dependencies) {
    const {
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
    } = dependencies;

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

    return {
        applySavedDraftToModal,
        bindDraftPersistence,
        getSavedDraft,
        readDraftFromModal,
        saveDraftFromModal,
        saveDraftToSettings,
        syncDefaultDraftField,
        syncDefaultDraftFields,
    };
}
