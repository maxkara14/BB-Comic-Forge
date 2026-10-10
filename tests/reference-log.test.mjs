import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

const encoded = 'aGVsbG8=';
const dataUrl = `data:image/png;base64,${encoded}`;
const references = [undefined, 'style', 'wardrobe', 'previous'].map((kind, index) => ({
    kind, name: 'PRIVATE_NAME', path: '/PRIVATE_PATH', description: 'PRIVATE_DESCRIPTION',
    dataUrl, base64: encoded, mimeType: 'image/png', id: `ref_${index}`,
}));
const panel = { number: 2, aspectRatio: '3:4', imageSize: '2K' };
const settings = { endpoint: 'https://example.invalid/v1?PRIVATE_QUERY', apiKey: 'PRIVATE_KEY', model: 'test', imageSize: '2K', imageAspectRatio: 'auto', aspectRatio: 'auto', styleReferences: [] };
const response = { data: [{ b64_json: encoded }], data_url: dataUrl,
    choices: [{ message: { images: [{ image_url: { url: dataUrl } }] } }],
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: encoded } }] } }],
};

async function harness(file, extra = {}) {
    const logs = [];
    const context = createContext({ FormData, File, atob,
        console: { info: (message, details) => logs.push({ message, details }), warn: (message, details) => logs.push({ message, details }) }, ...extra });
    const cache = new Map();
    function moduleFor(url) {
        if (!cache.has(url.href)) cache.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href }));
        return cache.get(url.href);
    }
    const module = moduleFor(new URL('../src/' + file, import.meta.url));
    await module.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier)));
    await module.evaluate();
    return { api: module.namespace, logs };
}

function assertSafe(logs) {
    const text = JSON.stringify(logs);
    for (const secret of ['PRIVATE_', encoded, 'data:image', 'Authorization', 'Bearer']) assert.ok(!text.includes(secret), secret);
}

for (const [apiType, mode] of [['gemini', 'generateContent'], ['openai-chat', 'chat/completions'], ['openai-images', 'edit'], ['grok', 'grok-edit'], ['naistera', 'reference_images']]) {
    test(`${apiType} logs ordered reference roles matching the submitted images`, async () => {
        const { api, logs } = await harness('providers/image-generation.js');
        const calls = [];
        const generate = api.createImageProviderGenerator({ getSettings: () => ({ ...settings, openaiImageMode: apiType === 'grok' ? 'grok' : 'compatible' }),
            buildFullPrompt: () => 'PRIVATE_PROMPT', buildReferenceInstruction: () => 'PRIVATE_INSTRUCTIONS',
            fetchJson: async (url, options) => { calls.push(options); return response; },
        });
        assert.equal(await generate(apiType === 'grok' ? 'openai-images' : apiType, panel, references), dataUrl);
        const request = logs.find(log => log.message.endsWith('Image request')).details;
        assert.equal(request.mode, mode);
        assert.equal(request.panel, 2);
        assert.equal(request.referenceCount, 4);
        assert.deepEqual(JSON.parse(JSON.stringify(request.counts)), { character: 1, style: 1, wardrobe: 1, previous: 1 });
        assert.deepEqual(Array.from(request.images, item => item.role), ['character', 'style', 'wardrobe', 'previous']);
        assert.deepEqual(Array.from(request.images, item => item.image), [1, 2, 3, 4]);
        const body = calls[0].body instanceof FormData ? calls[0].body : JSON.parse(calls[0].body);
        const sent = apiType === 'gemini' ? body.contents[0].parts.filter(part => part.inlineData)
            : apiType === 'openai-chat' ? body.messages[0].content.filter(part => part.image_url)
                : apiType === 'openai-images' ? body.getAll('image[]')
                    : apiType === 'grok' ? body.images : body.reference_images;
        assert.equal(sent.length, request.referenceCount);
        assert.ok(logs.some(log => log.message.endsWith('Image response received')));
        assertSafe(logs);
    });
}

test('OpenAI unsupported edits log omitted roles and a subsequent zero-image generation', async () => {
    const { api, logs } = await harness('providers/image-generation.js');
    let count = 0;
    const generate = api.createImageProviderGenerator({ getSettings: () => settings, buildFullPrompt: () => 'scene', buildReferenceInstruction: () => 'roles',
        fetchJson: async () => { if (++count === 1) throw Object.assign(new Error('PRIVATE_ERROR'), { apiStatus: 404 }); return response; },
    });
    await generate('openai-images', panel, references);
    const requests = logs.filter(log => log.message.endsWith('Image request'));
    assert.deepEqual(requests.map(log => log.details.referenceCount), [4, 0]);
    const fallback = logs.find(log => log.details?.mode === 'text-only-fallback').details;
    assert.equal(fallback.omittedReferences.counts.style, 1);
    assert.equal(logs.find(log => log.message.endsWith('Image request failed')).details.apiStatus, 404);
    assertSafe(logs);
});

test('Grok proxy format retry logs both attempts without losing image roles', async () => {
    const { api, logs } = await harness('providers/image-generation.js');
    let count = 0;
    const generate = api.createImageProviderGenerator({ getSettings: () => ({ ...settings, openaiImageMode: 'grok' }), buildFullPrompt: () => 'scene', buildReferenceInstruction: () => 'roles',
        fetchJson: async () => { if (++count === 1) throw Object.assign(new Error('images[].image_url is required PRIVATE_ERROR'), { apiStatus: 400 }); return response; },
    });
    await generate('openai-images', panel, references);
    const requests = logs.filter(log => log.message.endsWith('Image request'));
    assert.deepEqual(requests.map(log => log.details.mode), ['grok-edit', 'grok-edit-image-url']);
    assert.ok(requests.every(log => log.details.counts.style === 1 && log.details.referenceCount === 4));
    assertSafe(logs);
});

test('failed reference loading logs its role and excludes it from loaded images', async () => {
    class Reader { readAsDataURL() { this.result = dataUrl; this.onloadend(); } }
    const { api, logs } = await harness('generation/references.js', { FileReader: Reader, fetch: async url => ({ ok: url === '/ok', status: 404, blob: async () => ({}) }) });
    const service = api.createReferenceService({ getSettings: () => ({ references: [{ enabled: true, path: '/ok' }], styleReferences: [{ id: 'style_1', path: '/PRIVATE_PATH' }] }) });
    const loaded = await service.collectReferenceImages();
    assert.equal(loaded.length, 1);
    assert.equal(logs.find(log => log.message.endsWith('Reference image skipped')).details.counts.style, 1);
    const summary = logs.find(log => log.message.endsWith('Reference images loaded')).details;
    assert.equal(summary.referenceCount, 1);
    assert.equal(summary.counts.style, 0);
    assertSafe(logs);
});
