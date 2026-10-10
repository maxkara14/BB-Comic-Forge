import { VALID_IMAGE_SIZES } from '../core/constants.js';
import { buildImageRequestOptions, getImageParameterMode } from './image-options.js';
import { convertDataUrlToPng, fetchUrlAsDataUrl } from '../images/browser.js';
import {
    geminiApiHeaders,
    imageApiHeaders,
    normalizeGeminiGenerateUrl,
    normalizeNaisteraEndpoint,
    normalizeOpenAiBase,
} from './request.js';
import {
    extractImageFromChatResponse,
    parseImageDataUrl,
} from './responses.js';
import { throwIfAborted } from './transport.js';
import { referenceLogDetails } from '../generation/reference-log.js';

export function createImageProviderGenerator(dependencies) {
    const { getSettings, fetchJson, buildFullPrompt, buildReferenceInstruction } = dependencies;

    async function requestImage(url, options, apiType, mode, panel, references = []) {
        throwIfAborted(options.signal);
        const details = { apiType, mode, panel: panel.number, ...referenceLogDetails(references) };
        console.info('[BB Comic Forge] Image request', details);
        try {
            const result = await fetchJson(url, options);
            console.info('[BB Comic Forge] Image response received', details);
            return result;
        } catch (error) {
            console.warn('[BB Comic Forge] Image request failed', { ...details, apiStatus: Number(error?.apiStatus) || null });
            throw error;
        }
    }

    async function generateOpenAiImage(panel, references = [], signal = null) {
        const settings = getSettings();
        const baseUrl = normalizeOpenAiBase(settings.endpoint);
        if (getImageParameterMode(settings) === 'grok') return generateGrokImage(panel, references, signal);
        if (references.length) {
            try {
                return await generateOpenAiImageEdit(panel, references, signal);
            } catch (error) {
                if (!isOpenAiImageEditUnsupported(error)) throw error;
                console.warn('[BB Comic Forge] OpenAI Images edit endpoint is unavailable; retrying with text-only references.', {
                    apiType: 'openai-images', mode: 'text-only-fallback', panel: panel.number,
                    omittedReferences: referenceLogDetails(references),
                });
            }
        }
        const url = `${baseUrl}/images/generations`;
        const body = {
            model: settings.model,
            prompt: ['compatible', 'gpt-image'].includes(getImageParameterMode(settings)) ? `${buildFullPrompt(panel)}\n\nAspect ratio target: ${panel.aspectRatio}.` : buildFullPrompt(panel),
            ...buildImageRequestOptions(settings, panel),
            n: 1,
        };
        const result = await requestImage(url, {
            method: 'POST',
            headers: imageApiHeaders(settings),
            body: JSON.stringify(body),
            signal,
        }, 'openai-images', 'generation', panel);
        return extractOpenAiImageResult(result, signal);
    }

    async function generateOpenAiImageEdit(panel, references, signal = null) {
        const settings = getSettings();
        const url = `${normalizeOpenAiBase(settings.endpoint)}/images/edits`;
        if (getImageParameterMode(settings) !== 'compatible' && references.length > 16) throw new Error('GPT Image принимает до 16 референсов. Уменьшите количество изображений.');
        const formData = new FormData();
        const prompt = [
            buildReferenceInstruction(references),
            buildFullPrompt(panel),
            ['compatible', 'gpt-image'].includes(getImageParameterMode(settings)) ? `Aspect ratio target: ${panel.aspectRatio}.` : '',
        ].filter(Boolean).join('\n\n');
        formData.append('model', settings.model);
        formData.append('prompt', prompt);
        const options = buildImageRequestOptions(settings, panel);
        formData.append('size', options.size);
        formData.append('quality', options.quality);
        formData.append('n', '1');
        const imageField = references.length > 1 ? 'image[]' : 'image';
        for (let index = 0; index < references.length; index++) {
            throwIfAborted(signal);
            const file = await referenceToImageFile(references[index], index);
            formData.append(imageField, file, file.name);
        }
        const result = await requestImage(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${settings.apiKey || ''}` },
            body: formData,
            signal,
        }, 'openai-images', 'edit', panel, references);
        return extractOpenAiImageResult(result, signal);
    }

    async function generateGrokImage(panel, references, signal) {
        throwIfAborted(signal);
        if (references.length > 5) throw new Error('Grok принимает до 5 референсов, включая одежду и предыдущие панели. Уменьшите количество изображений.');
        const settings = getSettings();
        const body = {
            model: settings.model,
            prompt: [buildReferenceInstruction(references), buildFullPrompt(panel)].filter(Boolean).join('\n\n'),
            ...buildImageRequestOptions(settings, panel),
            n: 1,
        };
        const images = references.map(reference => {
            if (!reference.dataUrl) throw new Error('Референс Grok не содержит изображения.');
            return { type: 'image_url', url: reference.dataUrl };
        });
        if (images.length === 1) body.image = images[0];
        else if (images.length) body.images = images;
        const url = `${normalizeOpenAiBase(settings.endpoint)}/images/${images.length ? 'edits' : 'generations'}`;
        const request = (payload, mode) => requestImage(url, {
            method: 'POST', headers: imageApiHeaders(settings), body: JSON.stringify(payload), signal,
        }, 'openai-images', mode, panel, references);
        let result;
        try {
            result = await request(body, images.length ? 'grok-edit' : 'grok-generation');
        } catch (error) {
            const details = `${error?.apiBody || ''} ${error?.message || ''}`;
            const requiresImageUrl = /images(?:\[\]|\[\d+\])\.image_url\b[^\r\n]*?(?:required|missing)/i.test(details);
            if (!images.length || Number(error?.apiStatus) !== 400 || !requiresImageUrl) throw error;
            throwIfAborted(signal);
            const { image: _image, images: _images, ...options } = body;
            result = await request({ ...options, images: images.map(image => ({ image_url: image.url })) }, 'grok-edit-image-url');
        }
        return extractOpenAiImageResult(result, signal);
    }

    function isOpenAiImageEditUnsupported(error) {
        const status = Number(error?.apiStatus);
        if ([404, 405, 501].includes(status)) return true;
        if (status !== 400) return false;
        const details = `${error?.apiBody || ''} ${error?.message || ''}`.toLowerCase();
        const unsupportedEditPatterns = [
            /(?:unsupported|not supported|unknown|not found|unavailable|no route|cannot post).*?(?:images\/edits|image edit(?:ing)?|image input|endpoint|route)/i,
            /(?:images\/edits|image edit(?:ing)?|image input|endpoint|route).*?(?:unsupported|not supported|unknown|not found|unavailable|no route)/i,
            /model.*?(?:does not|doesn't|is not).*?support(?:ed)?.*?(?:edit|image input)/i,
        ];
        return unsupportedEditPatterns.some(pattern => pattern.test(details));
    }

    async function referenceToImageFile(reference, index) {
        let dataUrl = reference.dataUrl;
        let parsed = parseImageDataUrl(dataUrl);
        if (!['png', 'jpeg', 'webp'].includes(parsed.normalizedFormat)) {
            dataUrl = await convertDataUrlToPng(dataUrl);
            parsed = parseImageDataUrl(dataUrl);
        }
        const binary = atob(parsed.base64Data.replace(/\s+/g, ''));
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const extension = parsed.normalizedFormat === 'jpeg' ? 'jpg' : parsed.normalizedFormat;
        return new File([bytes], `bbcf_reference_${index + 1}.${extension}`, { type: `image/${parsed.normalizedFormat}` });
    }

    function extractOpenAiImageResult(result, signal = null) {
        const image = result?.data?.[0];
        if (image?.b64_json) {
            const mimeType = image.b64_json.startsWith('/9j/') ? 'image/jpeg' : image.b64_json.startsWith('UklG') ? 'image/webp' : 'image/png';
            return `data:${mimeType};base64,${image.b64_json}`;
        }
        if (image?.url) return fetchUrlAsDataUrl(image.url, signal);
        throw new Error('OpenAI images response did not contain image data.');
    }

    async function generateOpenAiChatImage(panel, references = [], signal = null) {
        const settings = getSettings();
        const url = `${normalizeOpenAiBase(settings.endpoint)}/chat/completions`;
        const fullPrompt = `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}\n\n[aspect_ratio: ${panel.aspectRatio}] [image_size: ${panel.imageSize || settings.imageSize}]`;
        const imageParts = references.map(ref => ({ type: 'image_url', image_url: { url: ref.dataUrl } }));
        const result = await requestImage(url, {
            method: 'POST',
            headers: imageApiHeaders(settings),
            signal,
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: 'user', content: [{ type: 'text', text: fullPrompt }, ...imageParts] }],
                modalities: ['image', 'text'],
                stream: false,
            }),
        }, 'openai-chat', 'chat/completions', panel, references);
        const found = extractImageFromChatResponse(result);
        if (!found) throw new Error('OpenAI chat response did not contain image data.');
        return /^https?:\/\//i.test(found) ? fetchUrlAsDataUrl(found, signal) : found;
    }

    async function generateGeminiImage(panel, references = [], signal = null) {
        const settings = getSettings();
        const url = normalizeGeminiGenerateUrl(settings.endpoint, settings.model);
        const aspectRatio = settings.aspectRatio === 'auto' ? panel.aspectRatio : settings.aspectRatio;
        const imageSize = VALID_IMAGE_SIZES.includes(panel.imageSize) ? panel.imageSize : settings.imageSize;
        const requestParts = [
            ...references.map(ref => ({ inlineData: { mimeType: ref.mimeType || 'image/jpeg', data: ref.base64 } })),
            { text: `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}` },
        ];
        const body = {
            contents: [{ role: 'user', parts: requestParts }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: { aspectRatio, imageSize },
            },
        };
        const result = await requestImage(url, {
            method: 'POST',
            headers: geminiApiHeaders(settings),
            signal,
            body: JSON.stringify(body),
        }, 'gemini', 'generateContent', panel, references);
        const parts = result?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.data) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            if (part.inline_data?.data) return `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`;
        }
        throw new Error('Gemini response did not contain image data.');
    }

    async function generateNaisteraImage(panel, references = [], signal = null) {
        const settings = getSettings();
        const endpoint = normalizeNaisteraEndpoint(settings.endpoint);
        const aspectRatio = settings.naisteraAspectRatio === 'auto' ? panel.aspectRatio : settings.naisteraAspectRatio;
        const result = await requestImage(endpoint, {
            method: 'POST',
            headers: imageApiHeaders(settings),
            signal,
            body: JSON.stringify({
                prompt: `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}`,
                model: settings.naisteraModel || 'nano banana',
                aspect_ratio: aspectRatio,
                preset: settings.naisteraPreset || undefined,
                reference_images: references.map(ref => ref.dataUrl),
                reference_labels: references.map(ref => ref.name || ref.label || 'reference'),
            }),
        }, 'naistera', 'reference_images', panel, references);
        if (result?.data_url) return result.data_url;
        throw new Error('Naistera response did not contain data_url.');
    }

    return function generateProviderImage(apiType, panel, references = [], signal = null) {
        if (apiType === 'openai-images') return generateOpenAiImage(panel, references, signal);
        if (apiType === 'openai-chat') return generateOpenAiChatImage(panel, references, signal);
        if (apiType === 'gemini') return generateGeminiImage(panel, references, signal);
        if (apiType === 'naistera') return generateNaisteraImage(panel, references, signal);
        throw new Error(`Unknown API type: ${apiType}`);
    };
}
