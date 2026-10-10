import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

async function harness({ fetchJson = async () => ({ data: [] }) } = {}) {
    const settings = { imageConnectionProfiles: [], activeImageConnectionProfileId: '', apiType: 'openai-images', endpoint: 'https://example.invalid', apiKey: 'test-key', model: 'gpt-image-1', availableModels: [] };
    const dialogs = { name: 'First', confirm: true };
    const controls = new Map();
    const rows = new Map();
    const stats = { saves: 0 };
    const root = { querySelectorAll: selector => {
        if (!rows.has(selector)) {
            const row = { hidden: false };
            row.classList = { toggle: (_name, hidden) => { row.hidden = hidden; } };
            rows.set(selector, row);
        }
        return [rows.get(selector)];
    }, querySelector: id => {
        if (!controls.has(id)) controls.set(id, {
            value: '', disabled: false, innerHTML: '', events: {},
            attributes: {},
            select() { this.selected = true; },
            setAttribute(name, value) { this.attributes[name] = value; },
            removeAttribute(name) { delete this.attributes[name]; },
            querySelector() { return null; },
            contains(node) { return node.parent === this; },
            addEventListener(name, handler) { this.events[name] = handler; },
            get options() { return [...this.innerHTML.matchAll(/<option value="([^"]*)"/g)].map(match => ({ value: match[1] })); },
        });
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
        getSettings: () => settings, saveSettings() { stats.saves++; }, notifySuccess() {}, notifyError() {}, fetchJson,
        updateSelectOptions: (input, html, value) => { input.value = value; input.innerHTML = html; },
        setSettingsControlValue: (target, selector, value) => { target.querySelector(selector).value = value; },
        refreshSettingsDashboard() {},
    });
    return { settings, dialogs, controls, root, rows, api, stats, document: context.document };
}

test('one model field searches the full list and commits only a choice or Enter', async () => {
    const { settings, root, api, stats } = await harness();
    settings.availableModels = Array.from({ length: 160 }, (_, index) => `image-model-${index}`);
    api.bindImageModelPicker(root);
    api.updateModelPicker(root);
    const input = root.querySelector('#bbcf-model');
    const list = root.querySelector('#bbcf-model-options');
    const key = value => input.events.keydown({ key: value, preventDefault() {}, stopPropagation() {} });
    input.events.focus();
    assert.equal(input.selected, true);
    assert.equal(list.hidden, false);
    assert.match(list.innerHTML, /image-model-159/);
    input.value = 'MODEL-159';
    input.events.input();
    assert.equal(settings.model, 'gpt-image-1');
    assert.equal(input.value, 'MODEL-159');
    assert.equal(stats.saves, 0);
    assert.match(list.innerHTML, /image-model-159/);
    assert.doesNotMatch(list.innerHTML, /image-model-158/);
    key('ArrowDown');
    key('Enter');
    assert.equal(settings.model, 'image-model-159');
    assert.equal(input.value, 'image-model-159');
    assert.equal(stats.saves, 1);
    assert.equal(list.hidden, true);
    input.value = 'no-such-model';
    input.events.input();
    assert.match(list.innerHTML, /Нет совпадений/);
    assert.equal(settings.model, 'image-model-159');
    key('Escape');
    assert.equal(input.value, 'image-model-159');
    assert.equal(stats.saves, 1);
    input.value = '  my-custom-alias  ';
    input.events.input();
    key('Enter');
    assert.equal(settings.model, 'my-custom-alias');
    assert.equal(input.value, 'my-custom-alias');
    assert.match(list.innerHTML, /my-custom-alias/);
    input.value = 'currently-typing';
    input.events.input();
    api.updateModelPicker(root);
    assert.equal(input.value, 'currently-typing');
    input.events.blur();
    assert.equal(input.value, 'my-custom-alias');
    assert.equal(settings.model, 'my-custom-alias');
    assert.equal(stats.saves, 2);
    input.value = '   ';
    input.events.input();
    key('Enter');
    assert.equal(settings.model, 'my-custom-alias');
    assert.equal(stats.saves, 2);
    input.events.focus();
    key('ArrowUp');
    assert.equal(input.attributes['aria-activedescendant'], 'bbcf-model-option-160');
    key('Enter');
    assert.equal(settings.model, 'image-model-159');
});

test('model suggestion pointer selection survives focus handling and model labels are escaped', async () => {
    const { settings, root, api, stats } = await harness();
    settings.availableModels = ['image-<script>'];
    api.bindImageModelPicker(root);
    const input = root.querySelector('#bbcf-model');
    const list = root.querySelector('#bbcf-model-options');
    input.events.focus();
    assert.match(list.innerHTML, /image-&lt;script&gt;/);
    let prevented = false;
    list.events.mousedown({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    const option = { parent: list, dataset: { bbcfModelIndex: '1' } };
    list.events.click({ target: { closest: () => option } });
    assert.equal(settings.model, 'image-<script>');
    assert.equal(input.value, 'image-<script>');
    assert.equal(list.hidden, true);
    assert.equal(stats.saves, 1);
});

test('late model discovery cannot overwrite another connection or manual model input', async () => {
    let resolveModels;
    const { settings, api, stats } = await harness({ fetchJson: () => new Promise(resolve => { resolveModels = resolve; }) });
    const pending = api.loadProviderModels({ silent: true });
    settings.endpoint = 'https://other.invalid';
    settings.model = 'manual-choice';
    settings.availableModels = ['image-other'];
    resolveModels({ data: [{ id: 'image-old' }] });
    assert.deepEqual(Array.from(await pending), []);
    assert.deepEqual(settings.availableModels, ['image-other']);
    assert.equal(settings.model, 'manual-choice');
    assert.equal(stats.saves, 0);
    const second = api.loadProviderModels({ silent: true });
    settings.model = 'custom-image-alias';
    resolveModels({ data: [{ id: 'image-new' }] });
    await second;
    assert.equal(settings.model, 'custom-image-alias');
    assert.equal(settings.availableModels[0], 'image-new');
});

test('profile save and apply retain parameters and update model-specific controls', async () => {
    const { settings, dialogs, root, rows, api } = await harness();
    Object.assign(settings, { openaiImageMode: 'gpt-image-2.5', openaiQuality: 'max', imageSize: '4K', imageAspectRatio: '16:9', openaiCustomSize: '2560x1440', openaiSize: '1024x1024' });
    api.saveImageConnectionProfile(root, { asNew: true });
    const gptId = settings.activeImageConnectionProfileId;
    Object.assign(settings, { openaiImageMode: 'grok', openaiQuality: 'medium', imageSize: '2K', imageAspectRatio: '3:2', openaiCustomSize: '' });
    dialogs.name = 'Grok';
    api.saveImageConnectionProfile(root, { asNew: true });
    const grokId = settings.activeImageConnectionProfileId;
    root.querySelector('#bbcf-image-connection-profile').value = gptId;
    api.applyImageConnectionProfile(root);
    assert.equal(settings.openaiImageMode, 'gpt-image-2.5');
    assert.equal(settings.openaiQuality, 'max');
    assert.equal(settings.imageSize, '4K');
    assert.equal(settings.imageAspectRatio, '16:9');
    assert.equal(settings.openaiCustomSize, '2560x1440');
    assert.match(root.querySelector('#bbcf-openai-quality').innerHTML, /xhigh/);
    assert.match(root.querySelector('#bbcf-openai-quality').innerHTML, /max/);
    assert.equal(rows.get('.bbcf-custom-size-row').hidden, false);
    root.querySelector('#bbcf-image-connection-profile').value = grokId;
    api.applyImageConnectionProfile(root);
    assert.equal(settings.openaiImageMode, 'grok');
    assert.equal(settings.openaiQuality, 'medium');
    assert.equal(settings.imageSize, '2K');
    assert.equal(settings.imageAspectRatio, '3:2');
    assert.doesNotMatch(root.querySelector('#bbcf-openai-quality').innerHTML, /xhigh|max|high/);
    assert.doesNotMatch(root.querySelector('#bbcf-image-resolution').innerHTML, /4K/);
    assert.equal(rows.get('.bbcf-custom-size-row').hidden, true);
    assert.equal(rows.get('.bbcf-openai-size-row').hidden, true);
    assert.equal(rows.get('.bbcf-image-parameters-row').hidden, false);
    settings.apiType = 'gemini';
    api.syncProviderRows();
    assert.equal(rows.get('.bbcf-image-parameters-row').hidden, true);
    assert.equal(rows.get('.bbcf-image-size-row').hidden, false);
});

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
    assert.doesNotMatch(source, /bindSettingInput\(root, '#bbcf-model'/);
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
