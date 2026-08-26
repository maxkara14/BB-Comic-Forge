export function createComicLightbox({ state, Popup, POPUP_TYPE }) {
    function openComicLightbox(page) {
        if (!page) return;
        void state.lightboxPopup?.completeCancelled?.();
        state.lightboxPopup = null;
        document.body.classList.add('bbcf-lightbox-open');

        const root = document.createElement('div');
        root.id = 'bbcf-comic-lightbox';
        root.className = 'bbcf-comic-lightbox';
        root.innerHTML = `
            <div class="bbcf-comic-lightbox-shell">
                <header class="bbcf-comic-lightbox-toolbar">
                    <strong><i class="fa-solid fa-book-open"></i> Просмотр комикса</strong>
                    <div class="bbcf-comic-lightbox-controls">
                        <button type="button" title="Уменьшить" aria-label="Уменьшить" data-bbcf-lightbox-zoom="-1"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                        <button type="button" title="Сбросить масштаб" aria-label="Сбросить масштаб" data-bbcf-lightbox-reset><i class="fa-solid fa-rotate-left"></i></button>
                        <button type="button" title="Увеличить" aria-label="Увеличить" data-bbcf-lightbox-zoom="1"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                        <button type="button" title="Закрыть" aria-label="Закрыть" data-bbcf-lightbox-close><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </header>
                <div class="bbcf-comic-lightbox-scroll">
                    <div class="bbcf-comic-lightbox-stage"></div>
                </div>
            </div>
        `;

        const stage = root.querySelector('.bbcf-comic-lightbox-stage');
        const scroll = root.querySelector('.bbcf-comic-lightbox-scroll');
        const clone = page.cloneNode(true);
        clone.classList.add('bbcf-lightbox-page');
        clone.querySelectorAll('.bbcf-panel-action, .bbcf-comic-action').forEach(node => node.remove());
        clone.querySelectorAll('[data-bbcf-instruction]').forEach(node => node.removeAttribute('data-bbcf-instruction'));
        clone.querySelectorAll('img').forEach(img => {
            img.draggable = false;
        });
        stage.appendChild(clone);

        const popup = new Popup(root, POPUP_TYPE.DISPLAY, '', {
            large: true,
            transparent: true,
            animation: 'fast',
            onClose: () => {
                if (state.lightboxPopup === popup) {
                    state.lightboxPopup = null;
                    document.body.classList.remove('bbcf-lightbox-open');
                    document.removeEventListener('keydown', onKeyDown);
                }
            },
        });
        state.lightboxPopup = popup;
        popup.dlg.classList.add('bbcf-comic-popup-dialog');
        popup.dlg.addEventListener('click', event => {
            if (event.target === popup.dlg) close(event);
        });
        void popup.show();

        const measuredWidth = page.getBoundingClientRect().width || 760;
        const viewportFitWidth = Math.max(280, Math.min(760, (scroll.clientWidth || window.innerWidth || 760) - 32));
        const baseWidth = Math.max(280, Math.min(900, Math.max(measuredWidth, viewportFitWidth)));
        const minZoom = 0.65;
        const maxZoom = 4;
        let zoom = 1;
        let contentWidth = baseWidth;
        const canCloseAt = Date.now() + 650;
        const getScrollCenter = () => {
            const rect = scroll.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };
        const updateZoom = (center = getScrollCenter()) => {
            const previousWidth = contentWidth || baseWidth;
            const previousHeight = clone.getBoundingClientRect().height || scroll.scrollHeight || 1;
            const rect = scroll.getBoundingClientRect();
            const offsetX = center.x - rect.left;
            const offsetY = center.y - rect.top;
            const ratioX = previousWidth ? (scroll.scrollLeft + offsetX) / previousWidth : 0.5;
            const ratioY = previousHeight ? (scroll.scrollTop + offsetY) / previousHeight : 0.5;
            const width = Math.round(baseWidth * zoom);
            contentWidth = width;
            clone.style.setProperty('--bbcf-lightbox-page-width', `${width}px`);
            stage.style.width = `${Math.max(width, scroll.clientWidth)}px`;
            requestAnimationFrame(() => {
                const nextHeight = clone.getBoundingClientRect().height || scroll.scrollHeight || 1;
                scroll.scrollLeft = Math.max(0, ratioX * width - offsetX);
                scroll.scrollTop = Math.max(0, ratioY * nextHeight - offsetY);
            });
        };
        const setZoom = (nextZoom, center = getScrollCenter()) => {
            if (!Number.isFinite(nextZoom)) return;
            zoom = Math.max(minZoom, Math.min(maxZoom, Number(nextZoom.toFixed(2))));
            updateZoom(center);
        };
        const close = (event = null, force = false) => {
            if (!force && Date.now() < canCloseAt) {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                return;
            }
            void popup.completeCancelled();
        };
        const onKeyDown = event => {
            if (event.key === 'Escape') close(event, true);
        };

        root.querySelectorAll('[data-bbcf-lightbox-close]').forEach(button => button.addEventListener('click', event => close(event)));
        root.querySelector('[data-bbcf-lightbox-reset]')?.addEventListener('click', () => {
            setZoom(1);
        });
        root.querySelectorAll('[data-bbcf-lightbox-zoom]').forEach(button => {
            button.addEventListener('click', () => {
                setZoom(zoom + Number(button.dataset.bbcfLightboxZoom) * 0.25);
            });
        });
        installComicLightboxGestures({ scroll, setZoom, getZoom: () => zoom });
        document.addEventListener('keydown', onKeyDown);
        updateZoom();
    }

    return { openComicLightbox };
}

function installComicLightboxGestures({ scroll, setZoom, getZoom }) {
    if (!scroll) return;
    const pointers = new Map();
    let gesture = null;
    let tap = null;
    let lastTap = { time: 0, x: 0, y: 0 };

    const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const getCenter = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const getPointerPair = () => Array.from(pointers.values()).slice(0, 2);
    const startPinch = () => {
        const [a, b] = getPointerPair();
        if (!a || !b) return;
        gesture = {
            type: 'pinch',
            startDistance: Math.max(1, getDistance(a, b)),
            startZoom: getZoom(),
        };
    };

    scroll.addEventListener('pointerdown', event => {
        if (event.target?.closest?.('.bbcf-comic-lightbox-toolbar')) return;
        event.preventDefault();
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try {
            scroll.setPointerCapture(event.pointerId);
        } catch {
            // Some mobile browsers can refuse pointer capture during synthetic taps.
        }
        tap = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        if (pointers.size >= 2) {
            startPinch();
        } else {
            gesture = { type: 'pan', lastX: event.clientX, lastY: event.clientY };
            scroll.classList.add('is-dragging');
        }
    });

    scroll.addEventListener('pointermove', event => {
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        event.preventDefault();
        const current = { x: event.clientX, y: event.clientY };
        pointers.set(event.pointerId, current);
        if (tap?.id === event.pointerId && getDistance(tap, current) > 8) tap.moved = true;

        if (pointers.size >= 2) {
            const [a, b] = getPointerPair();
            if (!a || !b) return;
            if (gesture?.type !== 'pinch') startPinch();
            const distance = Math.max(1, getDistance(a, b));
            const nextZoom = gesture.startZoom * (distance / gesture.startDistance);
            setZoom(nextZoom, getCenter(a, b));
            return;
        }

        if (gesture?.type === 'pan') {
            scroll.scrollLeft -= current.x - gesture.lastX;
            scroll.scrollTop -= current.y - gesture.lastY;
            gesture.lastX = current.x;
            gesture.lastY = current.y;
        }
    });

    const finishPointer = event => {
        const current = pointers.get(event.pointerId);
        if (!current) return;
        const wasTap = tap?.id === event.pointerId && !tap.moved && getDistance(tap, current) <= 10;
        pointers.delete(event.pointerId);
        try {
            scroll.releasePointerCapture(event.pointerId);
        } catch {
            // Pointer capture may already be gone after browser gesture cancellation.
        }

        if (wasTap && pointers.size === 0) {
            const now = Date.now();
            const closeToLastTap = getDistance(lastTap, current) <= 34;
            if (now - lastTap.time <= 320 && closeToLastTap) {
                event.preventDefault();
                setZoom(getZoom() > 1.1 ? 1 : 2, current);
                lastTap = { time: 0, x: 0, y: 0 };
            } else {
                lastTap = { time: now, x: current.x, y: current.y };
            }
        }

        if (pointers.size >= 2) {
            startPinch();
        } else if (pointers.size === 1) {
            const [remaining] = pointers.values();
            gesture = { type: 'pan', lastX: remaining.x, lastY: remaining.y };
        } else {
            gesture = null;
            tap = null;
            scroll.classList.remove('is-dragging');
        }
    };

    scroll.addEventListener('pointerup', finishPointer);
    scroll.addEventListener('pointercancel', finishPointer);
    scroll.addEventListener('wheel', event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const direction = event.deltaY > 0 ? -1 : 1;
        setZoom(getZoom() + direction * 0.18, { x: event.clientX, y: event.clientY });
    }, { passive: false });
}
