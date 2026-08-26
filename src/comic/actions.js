import { COMIC_PAGE_SELECTOR } from '../core/constants.js';

export function createComicActions(dependencies) {
    const {
        state,
        openComicLightbox,
        regeneratePanel,
        regeneratePreviewPanel,
    } = dependencies;

    function bindComicActions(root) {
        if (!root) return;
        const chatMessages = new Set();
        getComicPages(root).forEach(page => {
            page.classList.add('bbcf-comic-page');
            page.style.position = 'relative';
            const chatMessage = page.closest('#chat .mes');
            if (chatMessage) {
                chatMessages.add(chatMessage);
                return;
            }
            if (page.querySelector('.bbcf-comic-zoom')) return;
            page.appendChild(createComicZoomButton(() => openComicLightbox(page)));
        });
        chatMessages.forEach(bindChatComicMessageButton);
        root.querySelectorAll('[data-bbcf-regen]').forEach(button => {
            if (button.dataset.bbcfBound === '1') return;
            button.dataset.bbcfBound = '1';
            button.addEventListener('click', async event => {
                event.preventDefault();
                event.stopPropagation();
                const forgeRoot = state.modal?.isConnected && state.modal.contains(button) ? state.modal : null;
                const preview = forgeRoot?.querySelector('#bbcf-preview-content');
                if (preview?.contains(button)) {
                    const panelNumber = Number(button.closest('.bbcf-panel')?.getAttribute('data-bbcf-panel'));
                    if (panelNumber) {
                        await regeneratePreviewPanel(forgeRoot, panelNumber, button);
                        return;
                    }
                }
                regeneratePanel(button);
            });
        });
    }

    function createComicZoomButton(onOpen) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bbcf-comic-action bbcf-comic-zoom';
        button.title = 'Открыть комикс крупнее';
        button.setAttribute('aria-label', 'Открыть комикс крупнее');
        button.innerHTML = '<svg class="bbcf-comic-zoom-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="5.5"></circle><path d="M15 15l5 5"></path><path d="M10.5 7.5v6"></path><path d="M7.5 10.5h6"></path></svg>';
        bindTouchSafeAction(button, onOpen);
        return button;
    }

    function bindChatComicMessageButton(chatMessage) {
        const actions = chatMessage.querySelector('.mes_buttons');
        if (!actions || actions.querySelector('.bbcf-message-comic-zoom')) return;
        const button = document.createElement('div');
        button.className = 'mes_button bbcf-message-comic-zoom';
        button.title = 'Открыть комикс крупнее';
        button.setAttribute('aria-label', 'Открыть комикс крупнее');
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        button.innerHTML = '<svg class="bbcf-message-comic-zoom-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="5.5"></circle><path d="M15 15l5 5"></path><path d="M10.5 7.5v6"></path><path d="M7.5 10.5h6"></path></svg>';
        const open = event => {
            event.preventDefault();
            event.stopPropagation();
            const page = getComicPages(chatMessage)[0];
            if (page) openComicLightbox(page);
        };
        bindTouchSafeAction(button, open);
        button.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            open(event);
        });
        const extraButtons = actions.querySelector('.extraMesButtons');
        if (extraButtons?.nextSibling) {
            actions.insertBefore(button, extraButtons.nextSibling);
        } else {
            actions.appendChild(button);
        }
    }

    function bindTouchSafeAction(element, handler) {
        if (!element || typeof handler !== 'function') return;
        let suppressClickUntil = 0;
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            suppressClickUntil = Date.now() + 450;
            handler(event);
        };

        element.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'mouse') event.stopPropagation();
        }, { passive: true });
        element.addEventListener('touchstart', event => {
            event.stopPropagation();
        }, { passive: true });
        element.addEventListener('pointerup', event => {
            if (event.pointerType === 'mouse') return;
            if (Date.now() < suppressClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            activate(event);
        });
        element.addEventListener('touchend', event => {
            if (Date.now() < suppressClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            activate(event);
        }, { passive: false });
        element.addEventListener('click', event => {
            if (Date.now() < suppressClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            activate(event);
        });
    }

    function getComicPages(root) {
        const pages = [];
        if (root.matches?.(COMIC_PAGE_SELECTOR)) pages.push(root);
        root.querySelectorAll?.(COMIC_PAGE_SELECTOR).forEach(page => {
            if (!pages.includes(page)) pages.push(page);
        });
        return pages;
    }

    function scheduleComicActionRefresh(root = null) {
        [0, 80, 250].forEach(delay => {
            setTimeout(() => {
                const target = root || document.getElementById('chat');
                if (!target?.isConnected) return;
                cleanupRenderedComics(target);
                bindComicActions(target);
            }, delay);
        });
    }

    function cleanupRenderedComics(root) {
        if (!root) return;
        root.querySelectorAll('.bbcf-comic-title span, .custom-bbcf-comic-title span').forEach(span => {
            const text = span.textContent?.trim() || '';
            if (/^(?:single image|\d+\s+panels?)$/i.test(text)) span.remove();
        });
        root.querySelectorAll('.bbcf-panel-action').forEach(button => button.remove());
        root.querySelectorAll('.bbcf-comic-action').forEach(button => button.remove());
        root.querySelectorAll('.bbcf-message-comic-zoom').forEach(button => button.remove());
        root.querySelectorAll('.bbcf-panel:not(.bbcf-panel-error)[data-bbcf-instruction], .custom-bbcf-panel:not(.custom-bbcf-panel-error)[data-bbcf-instruction]').forEach(panel => {
            panel.removeAttribute('data-bbcf-instruction');
        });
    }

    function installChatObserver() {
        const chat = document.getElementById('chat');
        if (!chat || state.observer) return;
        state.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        cleanupRenderedComics(node);
                        bindComicActions(node);
                    }
                }
            }
        });
        state.observer.observe(chat, { childList: true, subtree: true });
    }

    return {
        bindComicActions,
        cleanupRenderedComics,
        installChatObserver,
        scheduleComicActionRefresh,
    };
}
