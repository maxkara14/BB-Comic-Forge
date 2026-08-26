import { MAX_COMIC_HISTORY } from '../core/constants.js';
import { makeId } from '../core/id.js';
import { extractImagePathsFromHtml, getCommonImageFolder, makeShareHtml } from './artifacts.js';

export function createComicHistoryStore(dependencies) {
    const {
        state,
        getSettings,
        getScopedProfileKey,
        saveSettings,
    } = dependencies;

    function rememberComic(draft, html, options = {}) {
        const settings = getSettings();
        const profileKey = getScopedProfileKey();
        const cleanHtml = makeShareHtml(html);
        const imagePaths = extractImagePathsFromHtml(cleanHtml);
        const {
            historyId = '',
            messageId = null,
            savedPngPath = '',
            source = '',
        } = options && typeof options === 'object' ? options : { messageId: options };
        const existingHistory = Array.isArray(settings.comicHistory) ? settings.comicHistory : [];
        const existing = historyId ? existingHistory.find(record => record?.id === historyId) : null;
        const nextSavedPngPath = savedPngPath || existing?.savedPngPath || '';
        const nextMessageId = messageId ?? existing?.messageId ?? null;
        const record = {
            id: existing?.id || historyId || makeId('bbcf-comic'),
            profileKey,
            title: String(draft.title || existing?.title || 'Comic page'),
            createdAt: existing?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            mode: draft.generationMode || draft.mode || existing?.mode || settings.generationMode,
            layout: draft.layout || existing?.layout || settings.layout,
            imagePaths,
            imageFolder: getCommonImageFolder(imagePaths),
            html: cleanHtml,
            messageId: nextMessageId,
            savedPngPath: nextSavedPngPath,
            source: getComicHistorySource({ ...existing, messageId: nextMessageId, savedPngPath: nextSavedPngPath, source }),
        };
        settings.comicHistory = [record, ...existingHistory.filter(item => item?.id !== record.id)].slice(0, MAX_COMIC_HISTORY);
        state.lastComic = record;
        saveSettings();
        return record;
    }

    function getActiveComicRecord() {
        if (isComicRecordForCurrentScope(state.lastComic)) return state.lastComic;
        return getScopedComicHistory()[0] || null;
    }

    function getScopedComicHistory(settings = getSettings()) {
        return (settings.comicHistory || []).filter(isComicRecordForCurrentScope);
    }

    function isComicRecordForCurrentScope(record) {
        return Boolean(record && record.profileKey && record.profileKey === getScopedProfileKey());
    }

    return {
        getActiveComicRecord,
        getScopedComicHistory,
        isComicRecordForCurrentScope,
        rememberComic,
    };
}

export function getComicHistorySource(record) {
    if (record?.messageId !== null && record?.messageId !== undefined && record?.savedPngPath) return 'chat-png';
    if (record?.messageId !== null && record?.messageId !== undefined) return 'chat';
    if (record?.savedPngPath) return 'png';
    return record?.source || 'saved';
}

export function getComicHistorySourceLabel(record) {
    const source = getComicHistorySource(record);
    if (source === 'chat-png') return 'Чат + PNG';
    if (source === 'chat') return 'Чат';
    if (source === 'png') return 'PNG';
    return 'Сохранено';
}

export function getComicHistoryThumbnail(record) {
    return record?.savedPngPath || record?.imagePaths?.[0] || '';
}

export function formatComicDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
}
