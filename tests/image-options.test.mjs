import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

async function load(path, globals = {}) {
    const context = createContext({ console: { info() {}, warn() {} }, FormData, File, atob, ...globals });
    const cache = new Map();
    function moduleFor(url) {
        if (!cache.has(url.href)) cache.set(url.href, new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href }));
        return cache.get(url.href);
    }
    const module = moduleFor(new URL(path, import.meta.url));
    await module.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier)));
    await module.evaluate();
    return module.namespace;
}

const panel = { aspectRatio: '16:9', imageSize: '1K' };
const reference = { dataUrl: 'data:image/png;base64,aGVsbG8=', name: 'person' };
const base = { apiType: 'openai-images', endpoint: 'https://example.invalid/v1', model: 'alias', openaiSize: '1024x1024', openaiQuality: 'medium', imageSize: '2K', imageAspectRatio: 'auto' };

async function generator(settings, response = { data: [{ b64_json: 'aGVsbG8=' }] }) {
    const calls = [];
    const api = await load('../src/providers/image-generation.js');
    const generate = api.createImageProviderGenerator({
        getSettings: () => settings, buildFullPrompt: () => 'scene', buildReferenceInstruction: refs => refs.length ? 'reference instructions' : '',
        fetchJson: async (url, options) => {
            calls.push({ url, ...options });
            if (typeof response === 'function') return response(calls.at(-1), calls.length);
            if (response instanceof Error) throw response;
            return response;
        },
    });
    return { calls, generate: (refs = [], signal) => generate('openai-images', panel, refs, signal) };
}

test('compatible generation preserves existing fields and does not leak Grok options', async () => {
    const { calls, generate } = await generator({ ...base, openaiQuality: 'standard' });
    assert.equal(await generate(), 'data:image/png;base64,aGVsbG8=');
    const body = JSON.parse(calls[0].body);
    assert.deepEqual(body, { model: 'alias', prompt: 'scene\n\nAspect ratio target: 16:9.', size: '1024x1024', quality: 'standard', response_format: 'b64_json', n: 1 });
});

test('GPT 2.5 generation maps resolution and ratio to size and supports max/xhigh', async () => {
    for (const quality of ['xhigh', 'max']) {
        const { calls, generate } = await generator({ ...base, openaiImageMode: 'gpt-image-2.5', openaiQuality: quality });
        await generate();
        assert.deepEqual(JSON.parse(calls[0].body), { model: 'alias', prompt: 'scene', size: '2048x1152', quality, n: 1 });
    }
});

test('Grok generation uses native fields and detects JPEG base64 output', async () => {
    const { calls, generate } = await generator({ ...base, openaiImageMode: 'grok' }, { data: [{ b64_json: '/9j/aGVsbG8=' }] });
    assert.equal(await generate(), 'data:image/jpeg;base64,/9j/aGVsbG8=');
    assert.deepEqual(JSON.parse(calls[0].body), { model: 'alias', prompt: 'scene', resolution: '2k', aspect_ratio: '16:9', quality: 'medium', response_format: 'b64_json', n: 1 });
    assert.match(calls[0].url, /\/images\/generations$/);
});

test('Grok sends one or all five reference images as JSON edits with instructions', async () => {
    for (const count of [1, 5]) {
        const refs = Array.from({ length: count }, (_, index) => ({ ...reference, dataUrl: `${reference.dataUrl}${index}` }));
        const { calls, generate } = await generator({ ...base, openaiImageMode: 'grok' });
        await generate(refs);
        assert.equal(calls.length, 1);
        assert.match(calls[0].url, /\/images\/edits$/);
        assert.equal(calls[0].headers['Content-Type'], 'application/json');
        const body = JSON.parse(calls[0].body);
        assert.equal(body.prompt, 'reference instructions\n\nscene');
        const images = count === 1 ? [body.image] : body.images;
        assert.deepEqual(images, refs.map(ref => ({ type: 'image_url', url: ref.dataUrl })));
        assert.equal(body.resolution, '2k');
        assert.equal(body.quality, 'medium');
        assert.equal(body.aspect_ratio, '16:9');
    }
});

test('Grok rejects excess or missing references and preserves edits on API failure', async () => {
    const { calls, generate } = await generator({ ...base, openaiImageMode: 'grok' });
    await assert.rejects(generate(Array(6).fill(reference)), /до 5/);
    await assert.rejects(generate([{}]), /не содержит/);
    assert.equal(calls.length, 0);
    const failure = Object.assign(new Error('image edit unsupported'), { apiStatus: 404 });
    const failed = await generator({ ...base, openaiImageMode: 'grok' }, failure);
    await assert.rejects(failed.generate([reference]), /unsupported/);
    assert.equal(failed.calls.length, 1);
});

test('Grok retries DDT image_url validation once with all references and parameters intact', async () => {
    for (const count of [1, 5]) {
        const refs = Array.from({ length: count }, (_, index) => ({ ...reference, dataUrl: `${reference.dataUrl}${index}` }));
        const { calls, generate } = await generator({ ...base, openaiImageMode: 'grok' }, (_call, attempt) => {
            if (attempt === 1) throw Object.assign(new Error('API 400'), {
                apiStatus: 400, apiBody: '{"error":{"message":"images[].image_url is required","type":"image_request_error"}}',
            });
            return { data: [{ b64_json: 'aGVsbG8=' }] };
        });
        assert.equal(await generate(refs), 'data:image/png;base64,aGVsbG8=');
        assert.equal(calls.length, 2);
        assert.equal(calls[0].url, calls[1].url);
        assert.match(calls[1].url, /\/images\/edits$/);
        const native = JSON.parse(calls[0].body);
        const proxy = JSON.parse(calls[1].body);
        const { image, images, ...options } = native;
        assert.deepEqual(proxy, { ...options, images: refs.map(ref => ({ image_url: ref.dataUrl })) });
        assert.equal(calls[1].headers['Content-Type'], 'application/json');
    }
});

test('Grok does not retry unrelated errors or repeat a failed image_url retry', async () => {
    for (const [apiStatus, message, expectedCalls] of [
        [400, 'quality is invalid', 1],
        [401, 'images[].image_url is required', 1],
        [400, 'images[].image_url is required', 2],
    ]) {
        const error = Object.assign(new Error(message), { apiStatus });
        const { calls, generate } = await generator({ ...base, openaiImageMode: 'grok' }, error);
        await assert.rejects(generate([reference]), failure => failure === error);
        assert.equal(calls.length, expectedCalls);
    }
    const error = Object.assign(new Error('images[].image_url is required'), { apiStatus: 400 });
    const noRefs = await generator({ ...base, openaiImageMode: 'grok' }, error);
    await assert.rejects(noRefs.generate());
    assert.equal(noRefs.calls.length, 1);
});

test('Grok honours cancellation before image_url retry', async () => {
    const controller = new AbortController();
    const { calls, generate } = await generator({ ...base, openaiImageMode: 'grok' }, () => {
        controller.abort();
        throw Object.assign(new Error('images[].image_url is required'), { apiStatus: 400 });
    });
    await assert.rejects(generate([reference], controller.signal));
    assert.equal(calls.length, 1);
});

test('GPT edits preserve files and apply same size and quality as generation', async () => {
    const { calls, generate } = await generator({ ...base, openaiImageMode: 'gpt-image-2.5', openaiQuality: 'max' });
    await generate([reference, reference]);
    assert.match(calls[0].url, /\/images\/edits$/);
    assert.ok(calls[0].body instanceof FormData);
    assert.equal(calls[0].body.get('size'), '2048x1152');
    assert.equal(calls[0].body.get('quality'), 'max');
    assert.equal(calls[0].body.getAll('image[]').length, 2);
    assert.equal(await calls[0].body.getAll('image[]')[0].text(), 'hello');
    assert.match(calls[0].body.get('prompt'), /reference instructions/);
    assert.equal(calls[0].headers['Content-Type'], undefined);
});

test('invalid size, ratio, quality and aborted Grok requests make no API call', async () => {
    const cases = [
        { openaiImageMode: 'gpt-image-2', openaiQuality: 'max' },
        { openaiImageMode: 'gpt-image-2', openaiCustomSize: '2047x1152' },
        { openaiImageMode: 'gpt-image-2', openaiCustomSize: '4096x4096' },
        { openaiImageMode: 'gpt-image-2', openaiCustomSize: '3840x3840' },
        { openaiImageMode: 'grok', imageSize: '4K' },
        { openaiImageMode: 'grok', imageAspectRatio: '4:5' },
    ];
    for (const overrides of cases) {
        const { calls, generate } = await generator({ ...base, ...overrides });
        await assert.rejects(generate());
        assert.equal(calls.length, 0);
    }
    const { calls, generate } = await generator({ ...base, openaiImageMode: 'grok' });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(generate([], controller.signal));
    assert.equal(calls.length, 0);
});

test('GPT exact dimensions override presets and validate size boundaries', async () => {
    const api = await load('../src/providers/image-options.js');
    for (const size of ['1024x1024', '2560x1440', '3840x2160', '2160x3840', '2048x2048']) {
        assert.equal(api.buildImageRequestOptions({ ...base, openaiImageMode: 'gpt-image-2', openaiCustomSize: size }, panel).size, size);
    }
    for (const size of ['512x512', '0x1024', '3840x1024', '4000x2000']) {
        assert.throws(() => api.buildImageRequestOptions({ ...base, openaiImageMode: 'gpt-image-2', openaiCustomSize: size }, panel));
    }
});

test('all offered GPT ratios produce valid 1K sizes above the API pixel minimum', async () => {
    const api = await load('../src/providers/image-options.js');
    for (const ratio of api.IMAGE_ASPECT_RATIOS) {
        const [w, h] = ratio.split(':').map(Number);
        if (Math.max(w, h) / Math.min(w, h) > 3) continue;
        const result = api.buildImageRequestOptions({ ...base, openaiImageMode: 'gpt-image-2', imageSize: '1K', imageAspectRatio: ratio }, panel);
        const [width, height] = result.size.split('x').map(Number);
        assert.ok(width * height >= 655360, `${ratio}: ${result.size}`);
        assert.equal(width % 16, 0);
        assert.equal(height % 16, 0);
    }
});

test('profiles normalize legacy data and retain new image parameters', async () => {
    const api = await load('../src/providers/profiles.js');
    const [legacy, modern, grok] = api.normalizeImageConnectionProfiles([
        { id: 'old', label: 'old', openaiQuality: 'hd' },
        { ...base, id: 'new', label: 'new', openaiImageMode: 'gpt-image-2.5', openaiQuality: 'max', openaiCustomSize: '2560x1440', imageAspectRatio: '3:2' },
        { ...base, id: 'grok', label: 'grok', openaiImageMode: 'grok', openaiQuality: 'high', imageSize: '4K' },
    ]);
    assert.equal(legacy.openaiImageMode, 'compatible');
    assert.equal(legacy.openaiQuality, 'hd');
    for (const [key, value] of Object.entries({ openaiImageMode: 'gpt-image-2.5', openaiQuality: 'max', openaiCustomSize: '2560x1440', imageAspectRatio: '3:2', imageSize: '2K' })) assert.equal(modern[key], value);
    assert.equal(grok.openaiQuality, 'auto');
    assert.equal(grok.imageSize, '2K');
});
