import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

async function harness() {
    const settings = { imageConnectionProfiles: [], activeImageConnectionProfileId: '', apiType: 'openai-images', endpoint: 'https://example.invalid', apiKey: 'test-key', model: 'gpt-image-1', availableModels: [] };
    const dialogs = { name: 'First', confirm: true };
    const controls = new Map();
    const root = { querySelector: id => {
        if (!controls.has(id)) controls.set(id, { value: '', disabled: false });
        return controls.get(id);
    } };
    const context = createContext({
        crypto: { randomUUID: () => String(Math.random()) },
        document: { getElementById: () => root, activeElement: null, createElement: () => ({ textContent: '', get innerHTML() { return this.textContent.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); } }) },
        window: { prompt: () => dialogs.name, confirm: () => dialogs.confirm },
    });
    const cache = new Map();
    function load(url) {
        const id = url.href;
        if (!cache.has(id)) cache.set(id, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: id }));
        return cache.get(id);
    }
    const module = load(new URL('../src/providers/settings.js', import.meta.url));
    await module.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
    await module.evaluate();
    const api = module.namespace.createProviderSettingsController({
        getSettings: () => settings, saveSettings() {}, notifySuccess() {},
        updateSelectOptions: (input, _html, value) => { input.value = value; },
    });
    return { settings, dialogs, controls, root, api };
}

test('image profiles create a copy, update only the selected ID and preserve connection on deletion', async () => {
    const { settings, dialogs, root, api } = await harness();
    api.saveImageConnectionProfile(root);
    assert.equal(settings.imageConnectionProfiles.length, 0);
    api.saveImageConnectionProfile(root, { asNew: true });
    const first = settings.activeImageConnectionProfileId;
    settings.model = 'changed'; api.saveImageConnectionProfile(root);
    assert.equal(settings.imageConnectionProfiles.length, 1);
    assert.equal(settings.imageConnectionProfiles[0].model, 'changed');
    dialogs.name = 'Second'; api.saveImageConnectionProfile(root, { asNew: true });
    assert.equal(settings.imageConnectionProfiles.length, 2);
    assert.notEqual(settings.activeImageConnectionProfileId, first);
    dialogs.confirm = false; api.deleteImageConnectionProfile(root);
    assert.equal(settings.imageConnectionProfiles.length, 2);
    dialogs.confirm = true; api.deleteImageConnectionProfile(root);
    assert.equal(settings.imageConnectionProfiles.length, 1);
    assert.equal(settings.imageConnectionProfiles[0].id, first);
    assert.equal(settings.apiKey, 'test-key');
    assert.equal(settings.model, 'changed');
    assert.equal(root.querySelector('#bbcf-save-image-connection-profile').disabled, true);
    assert.equal(root.querySelector('#bbcf-delete-image-connection-profile').disabled, true);
});

test('cancelled or blank new profile leaves existing selection and data intact', async () => {
    const { settings, dialogs, root, api } = await harness();
    api.saveImageConnectionProfile(root, { asNew: true });
    const before = JSON.stringify(settings);
    for (const name of [null, '', '   ']) {
        dialogs.name = name; api.saveImageConnectionProfile(root, { asNew: true });
        assert.equal(JSON.stringify(settings), before);
    }
});

test('new and update buttons are registered separately', () => {
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(source, /#bbcf-new-image-connection-profile'\)\?\.addEventListener\('click', \(\) => saveImageConnectionProfile\(root, \{ asNew: true \}\)\)/);
    assert.match(source, /#bbcf-new-draft-connection-profile'\)\?\.addEventListener\('click', \(\) => saveDraftConnectionProfile\(root, \{ asNew: true \}\)\)/);
    const template = readFileSync(new URL('../src/ui/settings-view.js', import.meta.url), 'utf8');
    for (const caption of ['Обновить выбранный', 'Сохранить как новый…', 'Удалить профиль…']) assert.ok(template.includes(caption));
});

test('draft profiles separate create/update/delete and preserve Tavern and external connection fields', async () => {
    const { settings, dialogs, root, api } = await harness();
    Object.assign(settings, { draftConnectionProfiles: [], activeDraftConnectionProfileId: '', draftConnectionMode: 'sillytavern', draftTavernProfileId: 'tavern-a', draftEndpoint: 'https://draft.invalid', draftApiKey: 'draft-key', draftModel: 'text-model', availableDraftModels: [], draftTemperature: 0.7 });
    api.saveDraftConnectionProfile(root);
    assert.equal(settings.draftConnectionProfiles.length, 0);
    api.saveDraftConnectionProfile(root, { asNew: true });
    const first = settings.activeDraftConnectionProfileId;
    assert.equal(settings.draftConnectionProfiles[0].draftTavernProfileId, 'tavern-a');
    settings.draftTavernProfileId = 'tavern-b'; api.saveDraftConnectionProfile(root);
    assert.equal(settings.draftConnectionProfiles.length, 1);
    assert.equal(settings.draftConnectionProfiles[0].id, first);
    assert.equal(settings.draftConnectionProfiles[0].draftTavernProfileId, 'tavern-b');
    const before = JSON.stringify(settings);
    for (const name of [null, '', '   ']) {
        dialogs.name = name; api.saveDraftConnectionProfile(root, { asNew: true });
        assert.equal(JSON.stringify(settings), before);
    }
    dialogs.name = 'Second'; api.saveDraftConnectionProfile(root, { asNew: true });
    assert.equal(settings.draftConnectionProfiles.length, 2);
    assert.notEqual(settings.activeDraftConnectionProfileId, first);
    const snapshot = settings.draftConnectionProfiles[0];
    for (const key of ['draftConnectionMode','draftTavernProfileId','draftEndpoint','draftApiKey','draftModel','draftTemperature']) assert.equal(snapshot[key], settings[key]);
    dialogs.confirm = false; api.deleteDraftConnectionProfile(root);
    assert.equal(settings.draftConnectionProfiles.length, 2);
    dialogs.confirm = true; api.deleteDraftConnectionProfile(root);
    assert.equal(settings.draftConnectionProfiles.length, 1);
    assert.equal(settings.draftConnectionProfiles[0].id, first);
    assert.equal(settings.draftTavernProfileId, 'tavern-b');
    assert.equal(settings.draftApiKey, 'draft-key');
    assert.equal(root.querySelector('#bbcf-save-draft-connection-profile').disabled, true);
    assert.equal(root.querySelector('#bbcf-delete-draft-connection-profile').disabled, true);
});
