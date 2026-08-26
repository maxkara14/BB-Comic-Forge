import { ONLYSQ_IMAGEN_ENDPOINT } from '../core/constants.js';
import { stripHtmlForError } from '../core/strings.js';

export async function requestJson(url, options = {}, timeoutMs = 0) {
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, timeoutMs);
    const { signal, cleanup } = combineAbortSignals(options.signal, timeoutController.signal);
    const { signal: _signal, ...fetchOptions } = options;
    try {
        const response = await fetch(url, { ...fetchOptions, signal });
        const text = await response.text();
        if (!response.ok) {
            const error = new Error(formatApiError(response.status, text, url));
            error.apiStatus = response.status;
            error.apiBody = text;
            throw error;
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error(`API returned invalid JSON: ${stripHtmlForError(text).slice(0, 220)}`);
        }
    } catch (error) {
        if (isAbortError(error)) {
            if (timedOut && !options.signal?.aborted) throw new Error('API request timed out.');
            throw createCancellationError();
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        cleanup();
    }
}

function combineAbortSignals(...signals) {
    const active = signals.filter(Boolean);
    if (!active.length) return { signal: undefined, cleanup: () => {} };
    if (active.length === 1) return { signal: active[0], cleanup: () => {} };
    const controller = new AbortController();
    const listeners = [];
    const abortFrom = source => {
        if (controller.signal.aborted) return;
        try {
            controller.abort(source.reason);
        } catch (error) {
            controller.abort();
        }
    };
    for (const source of active) {
        if (source.aborted) {
            abortFrom(source);
            break;
        }
        const listener = () => abortFrom(source);
        source.addEventListener('abort', listener, { once: true });
        listeners.push([source, listener]);
    }
    return {
        signal: controller.signal,
        cleanup: () => listeners.forEach(([source, listener]) => source.removeEventListener('abort', listener)),
    };
}

export function createCancellationError(message = 'Генерация отменена.') {
    const error = new Error(message);
    error.name = 'AbortError';
    error.bbcfCancelled = true;
    return error;
}

export function isAbortError(error) {
    return Boolean(error?.bbcfCancelled || error?.name === 'AbortError');
}

export function throwIfAborted(signal) {
    if (signal?.aborted) throw createCancellationError();
}

function formatApiError(status, body, url = '') {
    const message = stripHtmlForError(body).slice(0, 500) || 'empty response';
    if (status === 404 && /api\.onlysq\.ru/i.test(url) && !/\/ai\/openai/i.test(url)) {
        return `API 404: OnlySQ ImaGen должен идти в ${ONLYSQ_IMAGEN_ENDPOINT}, не в /ai/ как OpenAI Images. Сейчас запрос был: ${url}`;
    }
    if (status === 429) return `API 429: лимит запросов или очередь провайдера. Подожди немного или снизь параллельность до 1. ${message}`;
    return `API ${status}: ${message}`;
}
