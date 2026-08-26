import { fetchUrlAsDataUrl } from '../images/browser.js';
import { escapeHtml } from '../ui/html.js';
import { makeShareHtml } from './artifacts.js';

export function createPageExporter(dependencies) {
    const {
        state,
        isHistoryPreviewMode,
        notifyError,
        notifyInfo,
        notifySuccess,
        readDraftFromModal,
        rememberComic,
        renderComicHistory,
        saveImageToFile,
    } = dependencies;

    async function savePreviewPageImage(root) {
        const button = root.querySelector('#bbcf-save-page-image');
        const previousHtml = button?.innerHTML;
        try {
            const page = root.querySelector('#bbcf-preview-content .bbcf-comic-page');
            if (!page) {
                notifyInfo('Сначала сгенерируй или открой комикс в превью.');
                return;
            }
            if (button) {
                button.disabled = true;
                button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Сохраняю...</span>';
            }
            const dataUrl = await renderComicPageToPng(page);
            const path = await saveImageToFile(dataUrl, 'page');
            const previewHtml = root.querySelector('#bbcf-preview-content')?.innerHTML || state.pendingComic?.html || state.lastComic?.html || '';
            const html = makeShareHtml(previewHtml);
            const savingHistoryPreview = isHistoryPreviewMode(root);
            const historyId = savingHistoryPreview
                ? (state.lastComic?.id || '')
                : (state.pendingComic?.historyId || '');
            const draft = savingHistoryPreview
                ? (state.lastComic || readDraftFromModal(root))
                : (state.pendingComic?.draft || readDraftFromModal(root));
            const record = rememberComic(draft, html, {
                historyId,
                savedPngPath: path,
            });
            if (!savingHistoryPreview && state.pendingComic?.html) {
                state.pendingComic = {
                    ...state.pendingComic,
                    draft,
                    html,
                    historyId: record.id,
                    savedPngPath: path,
                };
            }
            renderComicHistory(root);
            showSavedPageImageNotice(root, path);
            notifySuccess('Полный комикс сохранён как PNG.');
        } catch (error) {
            console.error('[BB Comic Forge] page export failed', error);
            notifyError(error?.message || String(error));
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = previousHtml;
            }
        }
    }

    return { savePreviewPageImage };
}

export async function renderComicPageToPng(page) {
    await waitForImages(page);
    const rect = page.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(page.scrollWidth || page.offsetWidth || rect.width));
    const height = Math.max(1, Math.ceil(page.scrollHeight || page.offsetHeight || rect.height));
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.bbcf-panel-action, .bbcf-regen-status').forEach(node => node.remove());
    clone.style.margin = '0';
    clone.style.width = `${width}px`;
    clone.style.maxWidth = `${width}px`;
    clone.style.boxShadow = getComputedStyle(page).boxShadow || clone.style.boxShadow;
    await inlineCloneImages(clone);
    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.style.width = `${width}px`;
    wrapper.style.minHeight = `${height}px`;
    wrapper.style.margin = '0';
    wrapper.style.padding = '0';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.background = 'transparent';
    wrapper.appendChild(clone);
    const serialized = new XMLSerializer().serializeToString(wrapper);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/png');
}

async function waitForImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(img => {
        if (img.complete && img.naturalWidth) return Promise.resolve();
        return new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });
    }));
}

async function inlineCloneImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    for (const img of images) {
        const src = img.getAttribute('src') || '';
        if (!src || /^data:image\//i.test(src)) continue;
        try {
            img.setAttribute('src', await fetchUrlAsDataUrl(src));
        } catch (error) {
            console.warn('[BB Comic Forge] export image inline failed', src, error);
        }
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Не удалось отрендерить комикс в PNG. Браузер мог заблокировать HTML-to-canvas.'));
        image.src = src;
    });
}

export function showSavedPageImageNotice(root, path) {
    const preview = root.querySelector('#bbcf-preview-content');
    if (!preview || !path) return;
    preview.querySelectorAll('.bbcf-export-notice').forEach(node => node.remove());
    const notice = document.createElement('div');
    notice.className = 'bbcf-export-notice';
    notice.innerHTML = `<i class="fa-solid fa-file-image"></i><span>PNG сохранён:</span> <a href="${escapeHtml(path)}" target="_blank" rel="noopener">${escapeHtml(path)}</a>`;
    preview.prepend(notice);
}
