import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

const dataUrl = 'data:image/png;base64,aGVsbG8=';
const dom = { createElement: () => ({ set textContent(value) { this.innerHTML = String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'); } }) };
class Reader {
    readAsDataURL(blob) { this.result = blob.dataUrl || dataUrl; this.onloadend(); }
}
async function load(file, globals = {}) {
    const context = createContext({ console: { info() {}, warn() {}, error() {} }, document: dom, FileReader: Reader, File, FormData, atob, structuredClone, ...globals });
    const modules = new Map();
    function moduleFor(url) {
        if (!modules.has(url.href)) modules.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href }));
        return modules.get(url.href);
    }
    const module = moduleFor(new URL('../src/' + file, import.meta.url));
    await module.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier)));
    await module.evaluate();
    return module.namespace;
}

test('style reference normalization is separate from character slots and preserves opt-outs', async () => {
    const { normalizeStyleReferences, normalizeReferences } = await load('wardrobe/normalizers.js');
    const input = [{ id: 'style_1', enabled: false, path: '/page.png', name: ' Color ink ' }, { id: 'char', path: '/person.png' }];
    const styles = normalizeStyleReferences(input);
    assert.equal(styles.length, 3);
    assert.equal(styles[0].kind, 'style');
    assert.equal(styles[0].enabled, false);
    assert.equal(styles[0].name, 'Color ink');
    assert.equal(styles[1].path, '');
    assert.ok(normalizeReferences(input).every(ref => ref.kind !== 'style'));
    assert.equal(normalizeStyleReferences(null).length, 3);
});

test('collection keeps image roles and numbering after disabled or failed references', async () => {
    const { createReferenceService } = await load('generation/references.js', { fetch: async url => ({ ok: url !== '/missing', status: 404, blob: async () => ({ dataUrl }) }) });
    const settings = { references: [{ id: 'char', name: 'Alex', enabled: true, path: '/person' }], styleReferences: [
        { id: 'style_1', enabled: false, path: '/disabled' }, { id: 'style_2', path: '/missing' },
        { id: 'style_3', path: '/style', description: 'Colored ink' },
    ], wardrobeEnabled: true, wardrobeSendImages: true };
    const service = createReferenceService({ getSettings: () => settings, getWardrobeActiveEntries: () => [{ owner: { id: 'char', label: 'Alex' }, item: { id: 'coat', path: '/coat', name: 'coat' } }] });
    const refs = await service.collectReferenceImages(['/previous']);
    assert.deepEqual(Array.from(refs, ref => ref.kind || 'character'), ['character', 'style', 'wardrobe', 'previous']);
    const text = service.buildReferenceInstruction(refs);
    assert.match(text, /Reference image 2 .*ARTISTIC STYLE REFERENCE ONLY/);
    assert.match(text, /Reference image 3 .*clothing reference only/);
    assert.match(text, /Reference image 4 is a recent Comic Forge output/);
    assert.match(text, /Do not copy its characters.*panel layout.*dialogue/);
    assert.match(service.buildFullPrompt({ stylePrompt: 'Manga', prompt: 'Scene' }), /Rendering style notes.*\n.*Colored ink/);
    settings.styleReferences[2].enabled = false;
    assert.equal(service.buildFullPrompt({ prompt: 'Scene' }), 'Scene');
});

test('Gemini receives all images with matching role instructions through existing generateContent API', async () => {
    const { createReferenceService } = await load('generation/references.js');
    const settings = { endpoint: 'https://example.invalid/v1beta', model: 'gemini-nano-banana-2.1', apiKey: 'test', aspectRatio: 'auto', imageSize: '2K', styleReferences: [] };
    const service = createReferenceService({ getSettings: () => settings });
    const calls = [];
    const { createImageProviderGenerator } = await load('providers/image-generation.js');
    const generate = createImageProviderGenerator({ getSettings: () => settings, ...service, fetchJson: async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] } }] };
    } });
    const refs = [{ name: 'Alex', mimeType: 'image/png', base64: 'one' }, { name: 'Ink page', kind: 'style', mimeType: 'image/jpeg', base64: 'two' }];
    assert.equal(await generate('gemini', { prompt: 'New scene', aspectRatio: '3:4' }, refs), dataUrl);
    assert.match(calls[0].url, /gemini-nano-banana-2\.1:generateContent/);
    const parts = calls[0].body.contents[0].parts;
    assert.deepEqual(parts.slice(0, 2).map(part => part.inlineData.data), ['one', 'two']);
    assert.match(parts[2].text, /Reference image 2 .*ARTISTIC STYLE REFERENCE ONLY/);
    assert.deepEqual(calls[0].body.generationConfig.imageConfig, { aspectRatio: '3:4', imageSize: '2K' });
});

test('reference UI saves edits, clipboard and upload, synchronizes both surfaces and preserves character profiles', async () => {
    class Control {
        constructor() { this.value = ''; this.checked = true; this.events = new Map(); this.innerHTML = ''; this.classList = { toggle() {}, remove() {} }; }
        addEventListener(name, fn) { this.events.set(name, fn); }
        emit(name, event = {}) { return this.events.get(name)?.({ target: this, currentTarget: this, ...event }); }
        removeAttribute() {}
    }
    function card() {
        const controls = new Map();
        return { getAttribute: () => 'style_1', events: new Map(), addEventListener(name, fn) { this.events.set(name, fn); },
            querySelector(selector) { if (!controls.has(selector)) controls.set(selector, new Control()); return controls.get(selector); }, querySelectorAll: () => [],
        };
    }
    const first = card(), second = card(), cards = [first, second];
    const root = { querySelectorAll: () => [first] };
    const settings = { styleReferences: [], references: [{ id: 'char', path: '/person' }], referenceProfiles: { chat: [{ id: 'char', path: '/person' }] } };
    const before = JSON.stringify(settings.referenceProfiles);
    const uploads = [], errors = [];
    let saved = 0, fail = false;
    const { createWardrobeController } = await load('wardrobe/controller.js', {
        document: { ...dom, querySelectorAll: () => cards }, navigator: { clipboard: { read: async () => [{ types: ['image/png'], getType: async () => new Blob(['test'], { type: 'image/png' }) }] } },
        fetch: async (_url, options) => { if (fail) throw new Error('upload failed'); uploads.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ path: '/uploaded.png' }) }; },
    });
    createWardrobeController({ getSettings: () => settings, getReferenceProfileKey: () => 'chat', getContext: () => ({ getRequestHeaders: () => ({}) }), saveSettings: () => saved++, saveSettingsImmediately: async () => saved++, notifySuccess() {}, notifyInfo() {}, notifyError: message => errors.push(message) }).bindReferenceSettings(root);
    first.querySelector('.bbcf-ref-description').value = 'Fine ink';
    await first.querySelector('.bbcf-ref-description').emit('input');
    assert.equal(settings.styleReferences[0].description, 'Fine ink');
    assert.equal(second.querySelector('.bbcf-ref-description').value, 'Fine ink');
    assert.equal(first.querySelector('[data-bbcf-style-status]').textContent, 'Текстовое описание');
    first.querySelector('.bbcf-ref-name').value = 'Color ink';
    await first.querySelector('.bbcf-ref-name').emit('input');
    assert.equal(first.querySelector('[data-bbcf-style-name]').textContent, 'Color ink');
    assert.equal(second.querySelector('[data-bbcf-style-name]').textContent, 'Color ink');
    await first.querySelector('.bbcf-ref-paste').emit('click');
    assert.equal(settings.styleReferences[0].path, '/uploaded.png');
    assert.match(uploads[0].filename, /bbcf_ref_style_1/);
    assert.match(second.querySelector('.bbcf-ref-thumb').innerHTML, /uploaded.png/);
    first.querySelector('.bbcf-ref-enabled').checked = false;
    await first.querySelector('.bbcf-ref-enabled').emit('change');
    assert.equal(second.querySelector('.bbcf-ref-enabled').checked, false);
    await first.querySelector('.bbcf-ref-clear').emit('click');
    assert.equal(settings.styleReferences[0].path, '');
    assert.equal(first.querySelector('[data-bbcf-style-status]').textContent, 'Текстовое описание');
    const file = first.querySelector('.bbcf-ref-file'); file.files = [new File(['test'], 'page.png', { type: 'image/png' })];
    await file.emit('change');
    assert.equal(settings.styleReferences[0].path, '/uploaded.png');
    fail = true; await file.emit('change');
    assert.equal(settings.styleReferences[0].path, '/uploaded.png');
    assert.equal(errors.length, 1);
    assert.ok(saved >= 5);
    assert.equal(JSON.stringify(settings.referenceProfiles), before);
    assert.equal(settings.references[0].path, '/person');
});

test('UI output escapes style names and descriptions and keeps references in their settings section', async () => {
    const { buildStyleReferenceSettingsHtml } = await load('wardrobe/view.js');
    const html = buildStyleReferenceSettingsHtml({ styleReferences: [{ id: 'style_1', name: '<script>', description: '<img>', path: '/page.png' }] });
    assert.match(html, /&lt;script>/);
    assert.match(html, /&lt;img>/);
    assert.ok(!html.includes('<script>'));
    assert.match(html, /data-bbcf-ref="style_3"/);
    assert.equal((html.match(/<details class="bbcf-ref-card bbcf-style-ref"/g) || []).length, 3);
    assert.ok(!/<details[^>]+\sopen[\s>]/.test(html));
    assert.match(readFileSync(new URL('../index.js', import.meta.url), 'utf8'), /bindPresetDeleteActions\(root\);\s*bindReferenceSettings\(root\)/);
    const settingsView = readFileSync(new URL('../src/ui/settings-view.js', import.meta.url), 'utf8');
    const referenceSection = settingsView.split('id="bbcf-reference-settings"')[1].split('id="bbcf-page-settings"')[0];
    assert.match(referenceSection, /buildStyleReferenceSettingsHtml\(settings\)/);
    assert.equal((settingsView.match(/\$\{buildStyleReferenceSettingsHtml\(settings\)\}/g) || []).length, 1);
    assert.ok(!readFileSync(new URL('../src/ui/forge-view.js', import.meta.url), 'utf8').includes('buildStyleReferenceSettingsHtml'));

});


test('appearance and wardrobe never supply rendering style, with and without a style image', async () => {
    const { createReferenceService } = await load('generation/references.js');
    const settings = { references: [{ label: 'Alex', enabled: true, description: 'Red hair' }], wardrobeEnabled: true, wardrobeSendDescription: true };
    const service = createReferenceService({ getSettings: () => settings, getWardrobeActiveEntries: () => [{ owner: { label: 'Alex' }, item: { name: 'coat', description: 'Blue wool coat' } }] });
    const refs = [{ name: 'Alex' }, { name: 'Coat', kind: 'wardrobe' }, { kind: 'previous' }];
    for (const includeStyle of [false, true]) {
        const text = service.buildReferenceInstruction(includeStyle ? [...refs, { kind: 'style', name: 'Ink page' }] : refs);
        assert.match(text, /Reference image 1 .*CHARACTER APPEARANCE REFERENCE ONLY.*Do not copy clothing.*rendering style/);
        assert.match(text, /Reference image 2 .*clothing reference only.*Do not copy.*identity.*rendering style/);
        assert.match(text, /Reference image 3 .*currently requested comic style/);
        if (includeStyle) assert.match(text, /Reference image 4 .*ARTISTIC STYLE REFERENCE ONLY.*Do not copy its characters, faces, outfits/);
        else assert.match(text, /never infer rendering style from character or wardrobe images/);
    }
    assert.match(service.buildReferencePromptBlock(), /appearance notes only.*do not derive rendering style, clothing/);
    assert.match(service.buildWardrobePromptBlock(), /clothing, accessories.*not character identity.*rendering style/);
});


test('reference headings style upgraded disclosure buttons and interactive style cards stay native', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    assert.match(css, /\.bbcf-reference-group > :is\(summary, \.bbcf-disclosure-toggle\) \{[^}]*display: flex;[^}]*gap: 8px/);
    const view = readFileSync(new URL('../src/wardrobe/view.js', import.meta.url), 'utf8');
    assert.match(view, /bbcf-style-ref" data-bbcf-native-details/);
    const disclosure = readFileSync(new URL('../src/ui/disclosure.js', import.meta.url), 'utf8');
    assert.match(disclosure, /if \(details.hasAttribute\('data-bbcf-native-details'\)\) continue/);
});
