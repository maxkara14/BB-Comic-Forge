import { ONLYSQ_IMAGEN_ENDPOINT } from '../core/constants.js';

export function imageApiHeaders(settings) {
    return {
        'Authorization': `Bearer ${settings.apiKey || ''}`,
        'Content-Type': 'application/json',
    };
}

export function draftApiHeaders(apiKey) {
    return {
        'Authorization': `Bearer ${apiKey || ''}`,
        'Content-Type': 'application/json',
    };
}

export function geminiApiHeaders(settings) {
    const endpoint = String(settings.endpoint || '');
    if (endpoint.includes('generativelanguage.googleapis.com')) {
        return {
            'x-goog-api-key': settings.apiKey || '',
            'Content-Type': 'application/json',
        };
    }
    return imageApiHeaders(settings);
}

export function draftGeminiApiHeaders(endpoint, apiKey) {
    if (String(endpoint || '').includes('generativelanguage.googleapis.com')) {
        return {
            'x-goog-api-key': apiKey || '',
            'Content-Type': 'application/json',
        };
    }
    return draftApiHeaders(apiKey);
}

export function normalizeOpenAiBase(rawEndpoint) {
    let base = String(rawEndpoint || '').trim().replace(/\/+$/, '');
    base = base.replace(/\/(chat\/completions|images\/(?:generations|edits)|models)$/i, '');
    if (/api\.onlysq\.ru\/ai\/openai(?:\/v\d+(?:\.\d+)?)?$/i.test(base)) {
        return base.replace(/\/v\d+(?:\.\d+)?$/i, '');
    }
    if (!/\/v\d+(?:\.\d+)?$/i.test(base)) base += '/v1';
    return base;
}

export function normalizeOnlySqImagenEndpoint(rawEndpoint) {
    const raw = String(rawEndpoint || ONLYSQ_IMAGEN_ENDPOINT).trim() || ONLYSQ_IMAGEN_ENDPOINT;
    let base = raw.replace(/\/+$/, '');
    base = base.replace(/\/(openai|v1|v2|models|chat\/completions|images\/generations)$/i, '');
    if (/\/imagen$/i.test(base)) return base;
    if (/\/ai$/i.test(base)) return `${base}/imagen`;
    if (/api\.onlysq\.ru$/i.test(base)) return `${base}/ai/imagen`;
    return `${base}/ai/imagen`;
}

export function normalizeOnlySqBase(rawEndpoint) {
    return normalizeOnlySqImagenEndpoint(rawEndpoint).replace(/\/imagen$/i, '');
}

export function normalizeGeminiGenerateUrl(rawEndpoint, model) {
    let base = String(rawEndpoint || '').trim().replace(/\/+$/, '');
    if (/:(generateContent|streamGenerateContent)$/i.test(base)) return base;
    base = base.replace(/\/v1beta\/models\/[^/]+$/i, '');
    if (/\/v1beta$/i.test(base)) return `${base}/models/${encodeURIComponent(model)}:generateContent`;
    return `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

export function normalizeGeminiModelsUrl(rawEndpoint) {
    let base = String(rawEndpoint || 'https://generativelanguage.googleapis.com').trim().replace(/\/+$/, '');
    base = base.replace(/\/v1beta\/models\/[^/]+(?::generateContent|:streamGenerateContent)?$/i, '');
    base = base.replace(/\/v1beta\/models$/i, '');
    if (/\/v1beta$/i.test(base)) return `${base}/models`;
    return `${base}/v1beta/models`;
}

export function normalizeNaisteraEndpoint(rawEndpoint) {
    const base = String(rawEndpoint || 'https://naistera.org').trim().replace(/\/+$/, '');
    return /\/api\/generate$/i.test(base) ? base : `${base}/api/generate`;
}
