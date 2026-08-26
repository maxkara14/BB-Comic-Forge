export function createComicPreviewController(dependencies) {
    const {
        state,
        bindComicActions,
        cancelActiveGeneration,
        cleanupRenderedComics,
        getSettings,
        makeShareHtml,
        notifyInfo,
        readDraftFromModal,
        regeneratePreviewPanel,
        updateFloatingButton,
        updateSendToChatButton,
    } = dependencies;

    function setHistoryPreviewMode(root, enabled) {
        root?.querySelector('#bbcf-close-history-preview')?.classList.toggle('bbcf-hidden', !enabled);
    }

    function isHistoryPreviewMode(root) {
        const button = root?.querySelector('#bbcf-close-history-preview');
        return Boolean(button && !button.classList.contains('bbcf-hidden'));
    }

    function restoreCurrentPreview(root) {
        const preview = root?.querySelector('#bbcf-preview-content');
        if (!preview) return;
        const pending = isHistoryPreviewMode(root) ? state.historyPreviewPreviousPendingComic : state.pendingComic;
        state.pendingComic = pending || null;
        state.historyPreviewPreviousPendingComic = null;
        if (pending?.html && !pending.sent) {
            preview.innerHTML = pending.html;
            bindComicActions(preview);
            attachForgePreviewPanelControls(root);
        } else {
            preview.innerHTML = '<p class="bbcf-hint">Готовая страница появится здесь.</p>';
        }
        setHistoryPreviewMode(root, false);
        updateSendToChatButton(root);
        updateFloatingButton();
    }

    function clearForgePreview(root) {
        if (state.generating) {
            const shouldCancel = window.confirm('Генерация уже идет. Отменить ее и очистить превью?');
            if (!shouldCancel) return;
            cancelActiveGeneration();
        }
        const preview = root?.querySelector('#bbcf-preview-content');
        if (preview) preview.innerHTML = '<p class="bbcf-hint">Превью очищено.</p>';
        const progress = root?.querySelector('#bbcf-progress');
        if (progress) progress.innerHTML = '';
        state.pendingComic = null;
        state.historyPreviewPreviousPendingComic = null;
        setHistoryPreviewMode(root, false);
        updateSendToChatButton(root);
        updateFloatingButton();
    }

    function attachForgePreviewPanelControls(root) {
        const preview = root?.querySelector('#bbcf-preview-content');
        if (!preview || !state.pendingComic?.html) return;
        preview.querySelectorAll('.bbcf-preview-panel-regen').forEach(button => button.remove());
        preview.querySelectorAll('.bbcf-preview-panel-delete').forEach(button => button.remove());
        const draft = state.pendingComic.draft || readDraftFromModal(root);
        if ((draft.generationMode || getSettings().generationMode) === 'single') return;
        preview.querySelectorAll('.bbcf-panel').forEach(figure => {
            const number = Number(figure.getAttribute('data-bbcf-panel'));
            if (!number) return;
            if (!figure.querySelector('.bbcf-preview-panel-regen')) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'bbcf-panel-action bbcf-preview-panel-regen';
                button.title = 'Перегенерировать в текущем стиле кузницы';
                button.dataset.bbcfPreviewRegen = String(number);
                button.innerHTML = '<i class="fa-solid fa-palette"></i>';
                button.addEventListener('click', async event => {
                    event.preventDefault();
                    event.stopPropagation();
                    await regeneratePreviewPanel(root, number, button);
                });
                figure.appendChild(button);
            }
            if (figure.querySelector('.bbcf-preview-panel-delete')) return;
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'bbcf-panel-action bbcf-preview-panel-delete';
            deleteButton.title = 'Удалить панель из текущего превью';
            deleteButton.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
            deleteButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                deletePreviewPanel(root, number);
            });
            figure.appendChild(deleteButton);
        });
    }

    function deletePreviewPanel(root, panelNumber) {
        if (state.generating) {
            notifyInfo('Дождись окончания генерации или отмени её перед удалением панели.');
            return;
        }
        const preview = root?.querySelector('#bbcf-preview-content');
        const figure = preview?.querySelector(`.bbcf-panel[data-bbcf-panel="${panelNumber}"]`);
        if (!preview || !figure) return;
        if (!window.confirm(`Удалить панель ${panelNumber} из текущего превью?`)) return;
        figure.remove();
        const remainingPanels = Array.from(preview.querySelectorAll('.bbcf-panel'));
        if (!remainingPanels.length) {
            preview.innerHTML = '<p class="bbcf-hint">Все панели удалены из превью.</p>';
            state.pendingComic = null;
        } else {
            cleanupRenderedComics(preview);
            bindComicActions(preview);
            state.pendingComic = {
                draft: state.pendingComic?.draft || readDraftFromModal(root),
                html: makeShareHtml(preview.innerHTML),
                sent: false,
            };
            attachForgePreviewPanelControls(root);
        }
        updateSendToChatButton(root);
        updateFloatingButton();
        notifyInfo(`Панель ${panelNumber} удалена из текущего превью.`);
    }

    return {
        attachForgePreviewPanelControls,
        clearForgePreview,
        isHistoryPreviewMode,
        restoreCurrentPreview,
        setHistoryPreviewMode,
    };
}
