import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

const response = { title: 'Revised page', scene: 'Final fight', panel_notes: ['Close-up of the final fight'], bubbles: [], inserts: [], sfx: [] };
async function harness({ reply = async () => JSON.stringify(response), mode = 'sillytavern' } = {}) {
    const controls = new Map(), prompts = [], notices = [], requests = [];
    let settings, scope = 'chat-a', chat = [], busy = false, controller, saves = 0;
    class Control {
        constructor(id) { this.id = id; this.value = ''; this.hidden = ['bbcf-draft-revision','bbcf-draft-clear-undo','bbcf-draft-revise-cancel'].includes(id); this.disabled = false; this.events = new Map(); this.innerHTML = id; this.type = 'text'; }
        addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(fn); }
        emit(name, event = {}) { if (name === 'click' && this.disabled) return; return Promise.all((this.events.get(name) || []).map(fn => fn({ type: name, target: this, ...event }))); }
        dispatchEvent(event) { this.emit(event.type); form.emit(event.type, { target: this }); }
        matches(selector) { return selector === '#' + this.id; }
        setAttribute(name, value) { this[name] = value; }
        focus() { this.focused = true; }
    }
    const root = { isConnected: true, querySelector(selector) {
        if (!controls.has(selector)) controls.set(selector, new Control(selector.slice(1)));
        return controls.get(selector);
    } };
    const form = root.querySelector('#bbcf-draft-form');
    const sandbox = createContext({
        HTMLElement: Control, HTMLInputElement: Control, structuredClone,
        Event: class { constructor(type) { this.type = type; } },
        console: { info() {}, warn() {}, error() {} }, window: {},
    });
    const cache = new Map();
    function load(url) {
        if (!cache.has(url.href)) cache.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context: sandbox, identifier: url.href }));
        return cache.get(url.href);
    }
    async function module(file) {
        const item = load(new URL('../src/' + file, import.meta.url));
        if (item.status === 'unlinked') await item.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
        if (item.status === 'linked') await item.evaluate();
        return item.namespace;
    }
    const aiModule = await module('draft/ai.js');
    const defaults = cache.get(new URL('../src/settings/defaults.js', import.meta.url).href).namespace.DEFAULT_SETTINGS;
    settings = structuredClone(defaults);
    Object.assign(settings, { draftConnectionMode: mode, draftEndpoint: 'https://example.invalid/v1', draftApiKey: 'test-key', draftModel: 'test-model', defaultBubbles: 'Default bubble', defaultInserts: 'Default insert' });
    const stateModule = await module('draft/state.js');
    const draftState = stateModule.createDraftStateController({
        state: { modal: root, generating: false }, getSettings: () => settings,
        getSavedDraftProfileKey: () => scope, saveSettings: () => saves++,
        refreshForgeWorkflowSummary() {}, syncPresetUi() {},
        valueOf: (target, selector) => target.querySelector(selector).value,
        setValueSilent: (target, selector, value) => { target.querySelector(selector).value = String(value ?? ''); },
        getLayoutPresetById: () => ({}), getStylePresetById: () => ({}),
        hasCommittedNumberInput: () => true, clampNumberInput: input => Number(input.value),
    });
    const initial = { title: 'My comic', scene: 'Conversation at the start', panelCount: 2, panelNotes: '1. Conversation\n2. Walk', bubbles: '1|speech|top-left|Alex|Hello', inserts: '2|detail|bottom-left|hand', sfx: '2|STEP', characterLock: 'Silver hair', customPrompt: 'Watercolour', negativePrompt: 'No logos', stylePreset: 'manga', layout: 'vertical', generationMode: 'single' };
    draftState.applySavedDraftToModal(root, initial);
    draftState.saveDraftFromModal(root, { replaceManualFields: ['characterLock','customPrompt','layout','stylePreset','panelCount','generationMode','negativePrompt','panelNotes','bubbles','inserts','sfx'] });
    draftState.bindDraftPersistence(root);
    const ai = aiModule.createAiDraftController({
        getSettings: () => settings, getContext: () => ({ chat, generateQuietPrompt: async ({ quietPrompt }) => { prompts.push(quietPrompt); return reply(); } }),
        getSavedDraftProfileKey: () => scope, readDraftFromModal: draftState.readDraftFromModal,
        collectRecentChat: () => 'First: a conversation. Last: a fight.', substituteParams: text => text === '{{persona}}' ? 'My persona' : '',
        getSupportedTavernDraftProfiles: () => [{ id: 'profile' }],
        ConnectionManagerRequestService: { sendRequest: async (...args) => { requests.push(args); prompts.push(args[1][1].content); return reply(); } },
        fetchJson: async (url, init) => {
            const body = JSON.parse(init.body); requests.push({ url, body });
            prompts.push(body.messages?.[1]?.content || body.contents[0].parts[0].text);
            const text = await reply();
            return mode === 'gemini' ? { candidates: [{ content: { parts: [{ text }] } }] } : { choices: [{ message: { content: text } }] };
        },
        saveDraftFromModal: draftState.saveDraftFromModal, refreshForgeWorkflowSummary() {},
        notifySuccess: message => notices.push({ success: message }), notifyError: message => notices.push({ error: message }),
    });
    const actionsModule = await module('draft/actions.js');
    const actions = actionsModule.createDraftActionsController({
        runAiDraft: async (target, options) => { controller = new AbortController(); busy = true; try { return await ai.fillDraftFromAi(target, { ...options, signal: controller.signal }); } finally { busy = false; } },
        cancelAiDraft: () => controller.abort(), isBusy: () => busy,
        getScopeKey: () => scope, getSavedDraft: draftState.getSavedDraft,
        saveDraftFromModal: draftState.saveDraftFromModal, refreshForgeWorkflowSummary() {},
    });
    actions.bind(root);
    return { settings, root, ai, actions, draftState, initial, prompts, notices, requests,
        input: id => root.querySelector('#bbcf-' + id), get saves() { return saves; },
        switchChat() { scope = 'chat-b'; chat = []; }, setBusy(value) { busy = value; actions.updateBusy(root); },
    };
}

test('clear and undo include character descriptions while preserving settings and later prompt edits', async () => {
    const h = await harness(), before = h.draftState.readDraftFromModal(h.root);
    const originalManual = Array.from(h.draftState.getSavedDraft().manualFields);
    await h.input('draft-clear').emit('click');
    const empty = h.draftState.getSavedDraft();
    for (const key of ['scene', 'characterLock', 'panelNotes', 'bubbles', 'inserts', 'sfx']) assert.equal(empty[key], '');
    for (const key of ['title','stylePreset','layout','customPrompt','negativePrompt','panelCount']) assert.equal(empty[key], before[key]);
    assert.equal(h.input('draft-clear-undo').hidden, false);
    h.input('draft-custom-style').value = 'Updated prompt';
    await h.input('draft-custom-style').emit('input');
    await h.input('draft-form').emit('input', { target: h.input('draft-custom-style') });
    await h.input('draft-clear-undo').emit('click');
    const restored = h.draftState.getSavedDraft();
    for (const key of ['scene', 'characterLock', 'panelNotes', 'bubbles', 'inserts', 'sfx']) assert.equal(restored[key], before[key]);
    assert.equal(restored.customPrompt, 'Updated prompt');
    assert.deepEqual(Array.from(restored.manualFields).sort(), originalManual.sort());
    assert.equal(h.prompts.length, 0);
});

test('a character-only draft is cleared and manual character edits invalidate undo', async () => {
    const h = await harness();
    for (const id of ['draft-scene', 'draft-notes', 'draft-bubbles', 'draft-inserts', 'draft-sfx']) h.input(id).value = '';
    await h.input('draft-clear').emit('click');
    assert.equal(h.draftState.getSavedDraft().characterLock, '');
    assert.equal(h.input('draft-clear-undo').hidden, false);
    h.input('draft-lock').value = 'New character';
    await h.input('draft-lock').emit('input');
    await h.input('draft-form').emit('input', { target: h.input('draft-lock') });
    assert.equal(h.input('draft-clear-undo').hidden, true);
    await h.input('draft-clear-undo').emit('click');
    assert.equal(h.draftState.getSavedDraft().characterLock, 'New character');
});

test('manual scene edits and a different chat cannot restore an old cleared draft', async () => {
    const h = await harness();
    await h.input('draft-clear').emit('click');
    h.input('draft-scene').value = 'New scene';
    await h.input('draft-form').emit('input', { target: h.input('draft-scene') });
    assert.equal(h.input('draft-clear-undo').hidden, true);
    await h.input('draft-clear-undo').emit('click');
    assert.equal(h.input('draft-scene').value, 'New scene');
    await h.input('draft-clear').emit('click');
    h.switchChat(); await h.input('draft-clear-undo').emit('click');
    assert.equal(h.input('draft-scene').value, '');
});

test('undo restores default synchronization as well as cleared field values', async () => {
    const h = await harness();
    h.settings.savedDraft.manualFields = [];
    h.settings.savedDraftProfiles['chat-a'].manualFields = [];
    h.draftState.applySavedDraftToModal(h.root, h.draftState.getSavedDraft());
    const before = h.draftState.getSavedDraft();
    await h.input('draft-clear').emit('click');
    assert.equal(h.draftState.getSavedDraft().bubbles, '');
    await h.input('draft-clear-undo').emit('click');
    assert.equal(h.draftState.getSavedDraft().bubbles, before.bubbles);
    assert.deepEqual(Array.from(h.draftState.getSavedDraft().manualFields), []);
});

test('revision includes current draft, context and request across all text connections, clearing removed inserts', async () => {
    for (const mode of ['sillytavern', 'openai-chat', 'gemini', 'profile']) {
        const h = await harness({ mode });
        if (mode === 'profile') h.settings.draftTavernProfileId = 'profile';
        await h.input('draft-revise').emit('click');
        h.input('draft-revision-text').value = 'Use the fight at the end; remove dialogue and inserts';
        await h.input('draft-revise-apply').emit('click');
        assert.equal(h.prompts.length, 1);
        for (const text of ['First: a conversation. Last: a fight.', 'Conversation at the start', 'Use the fight at the end', 'COMPLETE updated draft']) assert.ok(h.prompts[0].includes(text));
        assert.equal(h.input('draft-scene').value, 'Final fight');
        assert.equal(h.input('draft-inserts').value, '');
        assert.equal(h.input('draft-bubbles').value, '');
        assert.equal(h.input('draft-sfx').value, '');
        assert.equal(h.input('draft-lock').value, 'Silver hair');
        assert.equal(h.input('draft-revision').hidden, true);
        assert.equal(h.draftState.getSavedDraft().scene, 'Final fight');
        assert.ok(h.requests.every(request => !request.url || !request.url.includes('/images/')));
    }
});

test('failed or incomplete correction preserves the draft and the revision request', async () => {
    for (const reply of [async () => { throw new Error('provider failed'); }, async () => '{}', async () => 'not JSON', async () => JSON.stringify({ ...response, bubbles: [null] })]) {
        const h = await harness({ reply }), before = JSON.stringify(h.draftState.readDraftFromModal(h.root));
        await h.input('draft-revise').emit('click');
        h.input('draft-revision-text').value = 'Focus on the end';
        await h.input('draft-revise-apply').emit('click');
        assert.equal(JSON.stringify(h.draftState.readDraftFromModal(h.root)), before);
        assert.equal(h.input('draft-revision-text').value, 'Focus on the end');
        assert.equal(h.input('draft-revision').hidden, false);
        assert.ok(h.notices.some(notice => notice.error));
    }
});

test('cancel releases a stalled revision and its late response cannot overwrite the draft', async () => {
    let finish;
    const h = await harness({ reply: () => new Promise(resolve => { finish = resolve; }) });
    h.input('draft-revision-text').value = 'Focus on the fight';
    const run = h.input('draft-revise-apply').emit('click');
    assert.equal(h.input('draft-clear').disabled, true);
    assert.equal(h.input('draft-revise-cancel').hidden, false);
    await h.input('draft-revise-cancel').emit('click');
    await run;
    assert.equal(h.input('draft-clear').disabled, false);
    finish(JSON.stringify(response));
    await Promise.resolve();
    assert.equal(h.input('draft-scene').value, h.initial.scene);
    assert.equal(h.notices.length, 0);
});

test('changed scope, closed modal and manual edits reject late draft results', async () => {
    for (const change of [h => h.switchChat(), h => { h.root.isConnected = false; }, h => { h.input('draft-scene').value = 'Manual scene'; }]) {
        let finish;
        const h = await harness({ reply: () => new Promise(resolve => { finish = resolve; }) });
        const run = h.ai.fillDraftFromAi(h.root, { instruction: 'Focus on the fight' });
        change(h); finish(JSON.stringify(response));
        assert.equal(await run, false);
        assert.notEqual(h.input('draft-scene').value, 'Final fight');
    }
});

test('blank revision and busy actions make no requests; ordinary draft assembly still works', async () => {
    const h = await harness();
    h.input('draft-revision-text').value = '   ';
    await h.input('draft-revise-apply').emit('click');
    h.setBusy(true);
    await h.input('draft-clear').emit('click');
    await h.input('ai-draft').emit('click');
    assert.equal(h.prompts.length, 0);
    assert.equal(h.input('draft-scene').value, h.initial.scene);
    h.setBusy(false);
    await h.input('ai-draft').emit('click');
    assert.equal(h.input('draft-scene').value, 'Final fight');
    assert.equal(h.prompts.length, 1);
    assert.ok(!h.prompts[0].includes('User revision request:'));
});

test('Forge registers draft actions and revision controls use explicit non-submit buttons', () => {
    const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(index, /draftActions\.bind\(root\)/);
    assert.match(index, /signal: controller\.signal/);
    const view = readFileSync(new URL('../src/ui/forge-view.js', import.meta.url), 'utf8');
    for (const id of ['bbcf-draft-revise','bbcf-draft-clear','bbcf-draft-revise-apply','bbcf-draft-clear-undo']) assert.match(view, new RegExp(`type="button" id="${id}"`));
});
