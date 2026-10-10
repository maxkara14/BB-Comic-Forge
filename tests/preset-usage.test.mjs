import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

async function loadController(context) {
    const cache = new Map();
    function load(url) {
        if (!cache.has(url.href)) cache.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href }));
        return cache.get(url.href);
    }
    const module = load(new URL('../src/presets/settings.js', import.meta.url));
    await module.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
    await module.evaluate();
    return module.namespace;
}

test('saved item usage counts settings and draft profiles without double-counting the active draft', async () => {
    const api = await loadController(createContext({}));
    const settings = {
        draftPromptPresets: [
            { id: 'target', stylePreset: 'saved:style' },
            { id: 'other', stylePreset: 'saved:style' },
        ],
        stylePreset: 'saved:style',
        savedDraft: { stylePreset: 'saved:style' },
        activeSavedDraftProfileKey: 'active',
        savedDraftProfiles: {
            active: { stylePreset: 'saved:style' },
            another: { stylePreset: 'saved:style' },
        },
    };
    const usage = api.getSavedItemUsage(settings, 'stylePreset', 'saved:style', 'target');
    assert.equal(usage.presets.length, 1);
    assert.equal(usage.presets[0].id, 'other');
    assert.equal(usage.currentSettings, true);
    assert.equal(usage.draftCount, 2);

    settings.draftPromptPresets = [settings.draftPromptPresets[0]];
    settings.stylePreset = 'builtin';
    settings.savedDraftProfiles = {};
    assert.equal(api.getSavedItemUsage(settings, 'stylePreset', 'saved:style', 'target').draftCount, 1);
});

test('direct deletion warns about current settings and saved drafts before changing anything', async () => {
    const messages = [];
    const settings = {
        draftPromptPresets: [],
        savedStyles: [{ id: 'style', label: 'My style', prompt: 'draw' }],
        savedLayouts: [{ id: 'layout', label: 'My layout', pattern: ['a'] }],
        stylePreset: 'saved:style',
        layout: 'saved:layout',
        savedDraft: { stylePreset: 'saved:style', layout: 'saved:layout' },
        activeSavedDraftProfileKey: 'active',
        savedDraftProfiles: { active: { stylePreset: 'saved:style', layout: 'saved:layout' } },
    };
    const api = await loadController(createContext({
        window: { confirm: message => { messages.push(message); return false; } },
    }));
    const handlers = {};
    const root = {
        dataset: {},
        addEventListener: (type, handler) => { handlers[type] = handler; },
    };
    api.createPresetSettingsController({ getSettings: () => settings }).bindPresetDeleteActions(root);
    for (const [attribute, id] of [['data-bbcf-delete-style', 'style'], ['data-bbcf-delete-layout', 'layout']]) {
        handlers.click({
            target: { closest: selector => selector === `[${attribute}]` ? { getAttribute: () => id } : null },
            preventDefault() {},
            stopPropagation() {},
        });
    }
    assert.equal(messages.length, 2);
    for (const message of messages) {
        assert.match(message, /текущие настройки страницы/);
        assert.match(message, /сохранённые черновики: 1/);
        assert.match(message, /связанные наборы и черновики будут обновлены/);
    }
    assert.equal(settings.savedStyles.length, 1);
    assert.equal(settings.savedLayouts.length, 1);
});

async function deletionHarness(answer, { builtin = false } = {}) {
    const value = builtin ? { stylePreset: 'manhwa', layout: 'webtoon' } : { stylePreset: 'saved:style', layout: 'saved:layout' };
    const settings = {
        draftPromptPresets: [
            { id: 'target', label: '<img src=x onerror=alert(1)>', ...value, panelCount: 3 },
            { id: 'other', label: 'Other preset', ...value, panelCount: 3 },
        ],
        savedStyles: [{ id: 'style', label: 'Shared style', prompt: 'draw' }, { id: 'unrelated', label: 'Shared style', prompt: 'draw' }],
        savedLayouts: [{ id: 'layout', label: 'Shared layout', pattern: ['1:1'] }, { id: 'unrelated', label: 'Shared layout', pattern: ['1:1'] }],
        ...value, activeDraftPromptPresetId: 'target',
        savedDraft: { ...value, scene: 'Keep this scene', bubbles: 'Keep this dialogue' },
        activeSavedDraftProfileKey: 'active',
        savedDraftProfiles: { active: { ...value, scene: 'Keep this scene' }, another: { ...value, scene: 'Another scene' } },
    };
    const popups = [], warnings = [], saved = [];
    const element = () => ({ dataset: {}, handlers: {}, style: { setProperty() {} },
        set textContent(text) { this.innerHTML = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener(type, handler) { this.handlers[type] = handler; } });
    const results = { AFFIRMATIVE: 1, NEGATIVE: 0, CANCELLED: null, CUSTOM1: 1001 };
    const types = { DISPLAY: 4, CONFIRM: 2 };
    class Popup {
        constructor(content, type, input, options) {
            Object.assign(this, { content, type, options, dlg: { classList: { add() {} }, style: { setProperty() {} } } });
            popups.push(this);
        }
        async show() { return this.type === types.CONFIRM ? (typeof answer === 'function' ? answer(settings) : answer) : undefined; }
    }
    const api = await loadController(createContext({ console, document: { createElement: element, getElementById: () => null } }));
    const noop = () => {};
    const getSettings = () => {
        // Production normalization recreates preset records on each settings read.
        settings.draftPromptPresets = settings.draftPromptPresets.map(item => ({ ...item }));
        return settings;
    };
    const controller = api.createPresetSettingsController({ getSettings, Popup, POPUP_RESULT: results, POPUP_TYPE: types,
        state: { modal: null }, saveSettings: () => saved.push(true), saveDraftFromModal: noop,
        refreshSettingsDashboard: noop, refreshForgeWorkflowSummary: noop, updateSelectOptions: noop,
        valueOf: () => '', notifySuccess: noop, notifyWarning: text => warnings.push(text),
    });
    const root = element();
    controller.bindPresetLibraryActions(root);
    await root.handlers.click({ target: { closest: selector => selector === '[data-bbcf-open-preset-library]' ? {} : null }, preventDefault() {} });
    const library = popups[0];
    return { settings, popups, warnings, saved, async remove() {
        await library.content.handlers.click({ target: { closest: selector => selector === '[data-bbcf-library-action]'
            ? { dataset: { bbcfLibraryAction: 'delete', presetId: 'target' } } : null }, preventDefault() {} });
    } };
}

test('preset deletion offers both explicit choices and explains shared use without exposing HTML', async () => {
    const h = await deletionHarness(null);
    const before = JSON.stringify(h.settings);
    await h.remove();
    const popup = h.popups[1];
    assert.equal(popup.options.okButton, 'Удалить только пресет');
    assert.equal(popup.options.cancelButton, 'Отмена');
    assert.equal(popup.options.defaultResult, null);
    assert.equal(popup.options.customButtons[0].result, 1001);
    assert.match(popup.content, /Other preset/);
    assert.match(popup.content, /текущие настройки страницы/);
    assert.match(popup.content, /сохранённые черновики: 2/);
    assert.match(popup.content, /переключатся на стандартные/);
    assert.ok(!popup.content.includes('<img'));
    assert.match(popup.content, /&lt;img/);
    assert.equal(JSON.stringify(h.settings), before);
    assert.equal(h.saved.length, 0);
});

test('deleting only the preset preserves shared assets and every other setting', async () => {
    const h = await deletionHarness(1);
    const before = structuredClone(h.settings);
    await h.remove();
    before.draftPromptPresets.shift();
    before.activeDraftPromptPresetId = '';
    assert.equal(JSON.stringify(h.settings), JSON.stringify(before));
    assert.equal(h.saved.length, 1);
});

test('explicit combined deletion resets shared references and preserves story content and unrelated duplicate labels', async () => {
    const h = await deletionHarness(1001);
    await h.remove();
    assert.deepEqual(h.settings.savedStyles.map(item => item.id), ['unrelated']);
    assert.deepEqual(h.settings.savedLayouts.map(item => item.id), ['unrelated']);
    assert.equal(h.settings.draftPromptPresets.length, 1);
    for (const item of [h.settings, h.settings.savedDraft, ...Object.values(h.settings.savedDraftProfiles), ...h.settings.draftPromptPresets]) {
        assert.ok(!item.stylePreset.startsWith('saved:'));
        assert.ok(!item.layout.startsWith('saved:'));
    }
    assert.equal(h.settings.savedDraft.scene, 'Keep this scene');
    assert.equal(h.settings.savedDraft.bubbles, 'Keep this dialogue');
    assert.equal(h.settings.savedDraftProfiles.another.scene, 'Another scene');
    assert.equal(h.settings.activeDraftPromptPresetId, '');
    assert.equal(h.saved.length, 1);
});

test('builtin-only presets have no combined deletion option', async () => {
    const h = await deletionHarness(1, { builtin: true });
    await h.remove();
    assert.equal(h.popups[1].options.customButtons.length, 0);
    assert.match(h.popups[1].content, /Встроенные элементы останутся/);
    assert.equal(h.settings.savedStyles.length, 2);
    assert.equal(h.settings.savedLayouts.length, 2);
});

test('a preset changed while deletion is pending cannot delete its former linked assets', async () => {
    const h = await deletionHarness(settings => { settings.draftPromptPresets[0].layout = 'webtoon'; return 1001; });
    await h.remove();
    assert.equal(h.settings.draftPromptPresets.length, 2);
    assert.equal(h.settings.savedStyles.length, 2);
    assert.equal(h.settings.savedLayouts.length, 2);
    assert.equal(h.saved.length, 0);
    assert.equal(h.warnings.length, 1);
});
