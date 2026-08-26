import { MODULE_NAME } from '../core/constants.js';
import { makeShareHtml } from './artifacts.js';

export function createComicChatGateway(dependencies) {
    const {
        state,
        addOneMessage,
        cleanupRenderedComics,
        eventSource,
        eventTypes,
        getContext,
        getCurrentCharacterName,
        getSettings,
        notifyError,
        notifyInfo,
        notifySuccess,
        readDraftFromModal,
        rememberComic,
        renderComicHistory,
        saveChat,
        scheduleComicActionRefresh,
        updateFloatingButton,
        updateMessageBlock,
        updateSendToChatButton,
    } = dependencies;

    async function insertComicIntoChat(html, mode = 'new', targetMessageId = null) {
        const context = getContext();
        if (!Array.isArray(context.chat)) throw new Error('Чат не открыт.');
        if (mode === 'append_last' && context.chat.length) {
            const messageId = Number.isInteger(targetMessageId) ? targetMessageId : findLastCharacterMessageId(context.chat);
            const message = context.chat[messageId];
            if (message && !message.is_user) {
                message.mes = `${String(message.mes || '').trim()}\n\n${html}`.trim();
                if (message.extra?.display_text) {
                    message.extra.display_text = `${String(message.extra.display_text || '').trim()}\n\n${html}`.trim();
                }
                updateMessageBlock(messageId, message);
                cleanupRenderedComics(document.getElementById('chat') || document.body);
                await eventSource.emit(eventTypes.MESSAGE_UPDATED, messageId);
                await saveCurrentChat(context);
                return messageId;
            }
        }
        const message = {
            name: getCurrentCharacterName() || 'Comic Forge',
            is_user: false,
            is_system: false,
            send_date: new Date().toISOString(),
            mes: html,
            extra: {
                from: MODULE_NAME,
            },
        };
        context.chat.push(message);
        const messageId = context.chat.length - 1;
        await eventSource.emit(eventTypes.MESSAGE_RECEIVED, messageId);
        addOneMessage(message);
        cleanupRenderedComics(document.getElementById('chat') || document.body);
        await eventSource.emit(eventTypes.CHARACTER_MESSAGE_RENDERED, messageId);
        await saveCurrentChat(context);
        return messageId;
    }

    function findLastCharacterMessageId(chat) {
        if (!Array.isArray(chat)) return -1;
        for (let index = chat.length - 1; index >= 0; index--) {
            const message = chat[index];
            if (message && !message.is_user) return index;
        }
        return chat.length - 1;
    }

    async function sendPendingComicToChat(root, { targetMessageId = null } = {}) {
        if (!state.pendingComic?.html) {
            notifyInfo('Сначала сгенерируй комикс в кузнице.');
            return;
        }
        const button = root.querySelector('#bbcf-send-to-chat');
        const previousHtml = button?.innerHTML;
        try {
            if (button) {
                button.disabled = true;
                button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Отправляю...</span>';
            }
            const previewHtml = root.querySelector('#bbcf-preview-content')?.innerHTML || state.pendingComic.html;
            const html = makeShareHtml(previewHtml);
            const currentDraft = readDraftFromModal(root);
            const pendingDraft = state.pendingComic.draft || {};
            const insertMode = currentDraft.insertMode || pendingDraft.insertMode || getSettings().insertMode;
            const historyDraft = state.pendingComic.fromHistory
                ? { ...pendingDraft, generationMode: pendingDraft.generationMode || pendingDraft.mode, insertMode }
                : { ...pendingDraft, ...currentDraft, insertMode };
            const messageId = await insertComicIntoChat(html, insertMode, targetMessageId);
            const record = rememberComic(historyDraft, html, {
                historyId: state.pendingComic.historyId,
                messageId,
            });
            state.lastComic = record;
            state.pendingComic = { ...state.pendingComic, html, sent: true, historyId: record.id };
            renderComicHistory(root);
            scheduleComicActionRefresh();
            updateSendToChatButton(root);
            updateFloatingButton();
            notifySuccess('Комикс добавлен в чат.');
        } catch (error) {
            console.error('[BB Comic Forge] chat send failed', error);
            notifyError(error?.message || String(error));
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = previousHtml;
            }
        }
    }

    async function saveCurrentChat(context = getContext()) {
        if (typeof context.saveChat === 'function') {
            try {
                await context.saveChat();
                return;
            } catch (error) {
                console.warn('[BB Comic Forge] context.saveChat failed, trying exported saveChat', error);
            }
        }
        await saveChat({ force: true });
    }

    async function replacePanelHtmlInChat(figure, oldOuterHtml) {
        const messageElement = figure.closest('.mes');
        const messageId = Number(messageElement?.getAttribute('mesid'));
        const context = getContext();
        const message = Number.isInteger(messageId) ? context.chat?.[messageId] : null;
        if (!message) return;
        const newOuterHtml = figure.outerHTML;
        const replace = value => {
            if (typeof value !== 'string') return value;
            const doc = new DOMParser().parseFromString(value, 'text/html');
            const panelNumber = figure.getAttribute('data-bbcf-panel');
            const target = panelNumber
                ? Array.from(doc.querySelectorAll('.bbcf-panel')).find(panel => panel.getAttribute('data-bbcf-panel') === panelNumber)
                : null;
            if (target) {
                target.outerHTML = newOuterHtml;
                return doc.body.innerHTML;
            }
            return oldOuterHtml ? value.split(oldOuterHtml).join(newOuterHtml) : value;
        };
        message.mes = replace(message.mes);
        if (message.extra?.display_text) message.extra.display_text = replace(message.extra.display_text);
        await saveCurrentChat(context);
    }

    return {
        replacePanelHtmlInChat,
        sendPendingComicToChat,
    };
}
