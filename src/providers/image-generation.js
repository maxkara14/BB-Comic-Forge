import { VALID_IMAGE_SIZES } from '../core/constants.js';
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

export function createImageProviderGenerator(dependencies) {
    const { getSettings, fetchJson, buildFullPrompt, buildReferenceInstruction } = dependencies;

    async function generateOpenAiImage(panel, references = [], signal = null) {
        const settings = getSettings();
        const baseUrl = normalizeOpenAiBase(settings.endpoint);
        if (references.length) {
            try {
                return await generateOpenAiImageEdit(panel, references, signal);
            } catch (error) {
                if (!isOpenAiImageEditUnsupported(error)) throw error;
                console.warn('[BB Comic Forge] OpenAI Images edit endpoint is unavailable; retrying with text-only references.', {
                    editEndpoint: `${baseUrl}/images/edits`,
                    fallbackEndpoint: `${baseUrl}/images/generations`,
                    referenceCount: references.length,
                });
            }
        }
        const url = `${baseUrl}/images/generations`;
        const body = {
            model: settings.model,
            prompt: `${buildFullPrompt(panel)}\n\nAspect ratio target: ${panel.aspectRatio}.`,
            size: settings.openaiSize || '1024x1024',
            quality: settings.openaiQuality || 'standard',
            response_format: 'b64_json',
            n: 1,
        };
        logOpenAiImageRoute(url, 'generation', 0);
        const result = await fetchJson(url, {
            method: 'POST',
            headers: imageApiHeaders(settings),
            body: JSON.stringify(body),
            signal,
        });
        return extractOpenAiImageResult(result, signal);
    }

    async function generateOpenAiImageEdit(panel, references, signal = null) {
        const settings = getSettings();
        const url = `${normalizeOpenAiBase(settings.endpoint)}/images/edits`;
        const formData = new FormData();
        const prompt = [
            buildReferenceInstruction(references),
            buildFullPrompt(panel),
            `Aspect ratio target: ${panel.aspectRatio}.`,
        ].filter(Boolean).join('\n\n');
        formData.append('model', settings.model);
        formData.append('prompt', prompt);
        formData.append('size', settings.openaiSize || '1024x1024');
        formData.append('quality', settings.openaiQuality || 'standard');
        formData.append('n', '1');
        const imageField = references.length > 1 ? 'image[]' : 'image';
        for (let index = 0; index < references.length; index++) {
            throwIfAborted(signal);
            const file = await referenceToImageFile(references[index], index);
            formData.append(imageField, file, file.name);
        }
        logOpenAiImageRoute(url, 'edit', references.length);
        const result = await fetchJson(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${settings.apiKey || ''}` },
            body: formData,
            signal,
        });
        return extractOpenAiImageResult(result, signal);
    }

    function logOpenAiImageRoute(endpoint, mode, referenceCount) {
        console.info('[BB Comic Forge] OpenAI Images request', { endpoint, mode, referenceCount });
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
        if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
        if (image?.url) return fetchUrlAsDataUrl(image.url, signal);
        throw new Error('OpenAI images response did not contain image data.');
    }

    async function generateOpenAiChatImage(panel, references = [], signal = null) {
        const settings = getSettings();
        const url = `${normalizeOpenAiBase(settings.endpoint)}/chat/completions`;
        const fullPrompt = `${buildReferenceInstruction(references)}\n\n${buildFullPrompt(panel)}\n\n[aspect_ratio: ${panel.aspectRatio}] [image_size: ${panel.imageSize || settings.imageSize}]`;
        const imageParts = references.map(ref => ({ type: 'image_url', image_url: { url: ref.dataUrl } }));
        const result = await fetchJson(url, {
            method: 'POST',
            headers: imageApiHeaders(settings),
            signal,
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: 'user', content: [{ type: 'text', text: fullPrompt }, ...imageParts] }],
                modalities: ['image', 'text'],
                stream: false,
            }),
        });
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
        const result = await fetchJson(url, {
            method: 'POST',
            headers: geminiApiHeaders(settings),
            signal,
            body: JSON.stringify(body),
        });
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
        const result = await fetchJson(endpoint, {
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
        });
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
