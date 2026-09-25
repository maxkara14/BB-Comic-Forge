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
