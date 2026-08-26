import { MAX_PANELS } from '../core/constants.js';
import { clampInt } from '../core/numbers.js';
import {
    normalizeBubblePosition,
    normalizeBubbleType,
    normalizeInsertPosition,
    normalizeInsertType,
} from '../comic/syntax.js';
import { extractJsonObject } from './parser.js';
import { DEFAULT_DRAFT_PROMPT } from '../settings/defaults.js';
import {
    draftApiHeaders,
    draftGeminiApiHeaders,
    normalizeGeminiGenerateUrl,
    normalizeOpenAiBase,
} from '../providers/request.js';
import { extractTextFromChatResult, extractTextFromGeminiResult } from '../providers/responses.js';
import { createCancellationError, isAbortError, throwIfAborted } from '../providers/transport.js';

export function createAiDraftController(dependencies) {
    const {
        ConnectionManagerRequestService,
        collectRecentChat,
        fetchJson,
        getContext,
        getSettings,
        getSupportedTavernDraftProfiles,
        notifyError,
        notifySuccess,
        refreshForgeWorkflowSummary,
        saveDraftFromModal,
        substituteParams,
    } = dependencies;

    async function fillDraftFromAi(root, { throwErrors = false, signal = null } = {}) {
        const button = root.querySelector('#bbcf-ai-draft');
        const previousHtml = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Черновик...';
        }
        try {
            throwIfAborted(signal);
            const prompt = buildDraftPrompt(root);
            const raw = await runDraftPrompt(prompt, signal);
            throwIfAborted(signal);
            const draft = extractJsonObject(raw);
            applyAiDraft(root, draft);
            saveDraftFromModal(root);
            refreshForgeWorkflowSummary(root);
            notifySuccess('Черновик комикса собран.');
        } catch (error) {
            if (isAbortError(error)) {
                console.info('[BB Comic Forge] draft generation cancelled');
            } else {
                console.error('[BB Comic Forge] draft generation failed', error);
                notifyError(error?.message || String(error));
            }
            if (throwErrors) throw error;
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = previousHtml;
            }
        }
    }

    function buildDraftPrompt(root) {
        const settings = getSettings();
        const recentChat = collectRecentChat(settings.contextMessages);
        const panelCount = clampInt(valueOf(root, '#bbcf-draft-count'), 1, MAX_PANELS, settings.panelCount);
        const characterLock = valueOf(root, '#bbcf-draft-lock') || settings.characterLock || '';
        const userPersona = resolveMacroText('{{persona}}') || 'No user persona description is available.';
        const characterContext = buildCharacterMacroContext() || 'No character card context is available.';
        return String(settings.draftPrompt || DEFAULT_DRAFT_PROMPT)
            .replaceAll('{{recent_chat}}', recentChat || 'No recent chat context is available.')
            .replaceAll('{{character_lock}}', characterLock || 'No character lock was provided.')
            .replaceAll('{{user_persona}}', userPersona)
            .replaceAll('{{character_context}}', characterContext)
            .replaceAll('{{panel_count}}', String(panelCount));
    }

    function buildCharacterMacroContext() {
        const lines = [
            ['Name', resolveMacroText('{{char}}')],
            ['Description', resolveMacroText('{{description}}')],
            ['Personality', resolveMacroText('{{personality}}')],
            ['Scenario', resolveMacroText('{{scenario}}')],
        ];
        return lines
            .filter(([, value]) => value)
            .map(([label, value]) => `${label}: ${value}`)
            .join('\n');
    }

    function resolveMacroText(text) {
        try {
            const result = substituteParams(String(text || ''));
            const resolved = String(result || '').replace(/\r/g, '').trim();
            return /\{\{[^}]+\}\}/.test(resolved) ? '' : resolved;
        } catch (error) {
            console.warn('[BB Comic Forge] macro substitution failed', error);
            return '';
        }
    }

    async function runDraftPrompt(prompt, signal = null) {
        const settings = getSettings();
        if (settings.draftConnectionMode === 'openai-chat') return runOpenAiDraftPrompt(prompt, settings, signal);
        if (settings.draftConnectionMode === 'gemini') return runGeminiDraftPrompt(prompt, settings, signal);
        if (settings.draftTavernProfileId) return runTavernProfileDraftPrompt(prompt, settings, signal);
        throwIfAborted(signal);
        const result = await runQuietPrompt(prompt);
        throwIfAborted(signal);
        return result;
    }

    async function runTavernProfileDraftPrompt(prompt, settings, signal = null) {
        const profileId = String(settings.draftTavernProfileId || '').trim();
        const profile = getSupportedTavernDraftProfiles().find(item => item.id === profileId);
        if (!profile) throw new Error('Профиль SillyTavern для черновика не найден или не поддерживается Connection Manager.');

        try {
            throwIfAborted(signal);
            const response = await ConnectionManagerRequestService.sendRequest(
                profile.id,
                [
                    { role: 'system', content: 'Return only valid JSON. No markdown. No commentary.' },
                    { role: 'user', content: prompt },
                ],
                // Leave max_tokens unset; reasoning models can spend tokens before producing content.
                undefined,
                { stream: false, signal, extractData: true, includePreset: true, includeInstruct: true },
                { temperature: settings.draftTemperature },
            );
            throwIfAborted(signal);
            const text = typeof response === 'string' ? response : response?.content;
            if (!text) throw new Error('Профиль SillyTavern не вернул текст черновика.');
            return text;
        } catch (error) {
            if (isAbortError(error) || isAbortError(error?.cause)) throw createCancellationError();
            const cause = error?.cause;
            throw new Error(cause?.message || error?.message || String(error));
        }
    }

    async function runOpenAiDraftPrompt(prompt, settings, signal = null) {
        const endpoint = settings.draftEndpoint || settings.endpoint;
        const apiKey = settings.draftApiKey || settings.apiKey;
        const model = settings.draftModel || (settings.draftEndpoint || settings.draftApiKey ? '' : settings.model);
        if (!endpoint) throw new Error('Endpoint черновика не настроен.');
        if (!apiKey) throw new Error('API key черновика не настроен.');
        if (!model) throw new Error('Модель черновика не настроена.');
        const body = {
            model,
            messages: [
                { role: 'system', content: 'Return only valid JSON. No markdown. No commentary.' },
                { role: 'user', content: prompt },
            ],
            temperature: settings.draftTemperature,
            response_format: { type: 'json_object' },
            stream: false,
        };
        let result;
        try {
            result = await fetchJson(`${normalizeOpenAiBase(endpoint)}/chat/completions`, {
                method: 'POST',
                headers: draftApiHeaders(apiKey),
                body: JSON.stringify(body),
                signal,
            });
        } catch (error) {
            if (!/response_format|json_object/i.test(error?.message || '')) throw error;
            const fallbackBody = { ...body };
            delete fallbackBody.response_format;
            result = await fetchJson(`${normalizeOpenAiBase(endpoint)}/chat/completions`, {
                method: 'POST',
                headers: draftApiHeaders(apiKey),
                body: JSON.stringify(fallbackBody),
                signal,
            });
        }
        const text = extractTextFromChatResult(result);
        if (!text) throw new Error('API черновика не вернул текст.');
        return text;
    }

    async function runGeminiDraftPrompt(prompt, settings, signal = null) {
        const endpoint = settings.draftEndpoint || settings.endpoint;
        const apiKey = settings.draftApiKey || settings.apiKey;
        const model = settings.draftModel || 'gemini-2.5-flash';
        if (!endpoint) throw new Error('Endpoint черновика не настроен.');
        if (!apiKey) throw new Error('API key черновика не настроен.');
        const result = await fetchJson(normalizeGeminiGenerateUrl(endpoint, model), {
            method: 'POST',
            headers: draftGeminiApiHeaders(endpoint, apiKey),
            signal,
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nReturn only valid JSON. No markdown.` }] }],
                generationConfig: {
                    temperature: settings.draftTemperature,
                    responseMimeType: 'application/json',
                },
            }),
        });
        const text = extractTextFromGeminiResult(result);
        if (!text) throw new Error('API черновика не вернул текст.');
        return text;
    }

    async function runQuietPrompt(prompt) {
        const context = getContext();
        if (typeof context.generateQuietPrompt === 'function') {
            return context.generateQuietPrompt({ quietPrompt: prompt });
        }
        if (typeof window.generateQuietPrompt === 'function') {
            return window.generateQuietPrompt({ quietPrompt: prompt });
        }
        throw new Error('generateQuietPrompt не найден в SillyTavern.');
    }

    function applyAiDraft(root, draft) {
        setValue(root, '#bbcf-draft-title', draft.title || 'Comic page');
        setValue(root, '#bbcf-draft-scene', draft.scene || '');
        const characterLock = getDraftTextField(draft, [
            'character_lock',
            'characterLock',
            'character_description',
            'characterDescription',
            'characters',
            'character_notes',
            'characterNotes',
        ]);
        if (characterLock) setValue(root, '#bbcf-draft-lock', characterLock);
        if (Array.isArray(draft.panel_notes)) {
            setValue(root, '#bbcf-draft-notes', draft.panel_notes.map((note, index) => `${index + 1}. ${note}`).join('\n'));
        }
        if (Array.isArray(draft.bubbles)) {
            const bubbleText = draft.bubbles.map((bubble) => {
                const panel = clampInt(bubble?.panel, 1, MAX_PANELS, 1);
                const type = normalizeBubbleType(bubble?.type);
                const position = normalizeBubblePosition(bubble?.position, 'top-left');
                const speaker = String(bubble?.speaker || '').trim();
                const text = String(bubble?.text || '').trim();
                return speaker
                    ? `${panel}|${type}|${position}|${speaker}|${text}`
                    : `${panel}|${type}|${position}|${text}`;
            }).filter(line => line.trim()).join('\n');
            setValue(root, '#bbcf-draft-bubbles', bubbleText);
        }
        if (Array.isArray(draft.sfx)) {
            const sfxText = draft.sfx.map(item => `${clampInt(item?.panel, 1, MAX_PANELS, 1)}|${item?.text || ''}`).join('\n');
            setValue(root, '#bbcf-draft-sfx', sfxText);
        }
        const inserts = draftToInsertLines(draft.inserts);
        if (inserts) setValue(root, '#bbcf-draft-inserts', inserts);
    }

    function draftToInsertLines(value) {
        if (Array.isArray(value)) {
            return value.map(item => {
                if (item && typeof item === 'object') {
                    const panel = clampInt(item.panel, 1, MAX_PANELS, 1);
                    const type = normalizeInsertType(item.type);
                    const position = normalizeInsertPosition(item.position, 'bottom-right');
                    const text = String(item.text || item.prompt || item.description || '').trim();
                    return text ? `${panel}|${type}|${position}|${text}` : '';
                }
                return String(item || '').trim();
            }).filter(Boolean).join('\n');
        }
        if (value && typeof value === 'object') return draftToInsertLines([value]);
        return String(value || '').trim();
    }

    function getDraftTextField(draft, keys) {
        for (const key of keys) {
            const value = draft?.[key];
            if (Array.isArray(value)) {
                const text = value.map(item => {
                    if (item && typeof item === 'object') {
                        return [item.name, item.description || item.prompt || item.notes].filter(Boolean).join(': ');
                    }
                    return String(item || '');
                }).filter(Boolean).join('\n');
                if (text.trim()) return text.trim();
            } else if (value && typeof value === 'object') {
                const text = Object.entries(value)
                    .map(([name, description]) => `${name}: ${typeof description === 'string' ? description : JSON.stringify(description)}`)
                    .join('\n');
                if (text.trim()) return text.trim();
            } else {
                const text = String(value || '').trim();
                if (text) return text;
            }
        }
        return '';
    }

    function setValue(root, selector, value) {
        const input = root.querySelector(selector);
        if (!input) return;
        input.value = String(value ?? '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function valueOf(root, selector) {
        return String(root?.querySelector?.(selector)?.value || '');
    }

    return {
        fillDraftFromAi,
        runDraftPrompt,
    };
}
