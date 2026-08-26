import { throwIfAborted } from '../providers/transport.js';

export async function fetchUrlAsDataUrl(url, signal = null) {
    throwIfAborted(signal);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Image URL fetch failed: ${response.status}`);
    const blob = await response.blob();
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Image URL conversion failed.'));
        reader.readAsDataURL(blob);
    });
}

export async function convertDataUrlToPng(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas 2D unavailable.'));
                return;
            }
            ctx.drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = () => reject(new Error('Failed to decode generated image.'));
        image.src = dataUrl;
    });
}

export function getImageFileFromPasteEvent(event) {
    const files = Array.from(event?.clipboardData?.files || []);
    const file = files.find(item => item?.type?.startsWith('image/'));
    if (file) return file;
    const item = Array.from(event?.clipboardData?.items || []).find(entry => entry?.type?.startsWith('image/'));
    return item?.getAsFile?.() || null;
}

export async function readClipboardImageFile() {
    if (typeof navigator.clipboard?.read !== 'function') {
        throw new Error('Браузер не умеет читать картинки из буфера. Нажми Ctrl+V на карточке референса.');
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
        const type = item.types.find(value => value.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        return new File([blob], `bbcf_clipboard.${extension}`, { type });
    }
    throw new Error('В буфере не найдено изображение.');
}

export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
        reader.readAsDataURL(file);
    });
}
