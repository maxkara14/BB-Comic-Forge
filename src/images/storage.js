import { UPLOAD_ALLOWED_FORMATS } from '../core/constants.js';
import { parseImageDataUrl } from '../providers/responses.js';
import { throwIfAborted } from '../providers/transport.js';
import { convertDataUrlToPng } from './browser.js';

export async function uploadGeneratedImage(dataUrl, panelNumber = 0, signal = null, dependencies = {}) {
    throwIfAborted(signal);
    const context = dependencies.getContext();
    let parsed = parseImageDataUrl(dataUrl);
    if (!UPLOAD_ALLOWED_FORMATS.has(parsed.normalizedFormat)) {
        parsed = parseImageDataUrl(await convertDataUrlToPng(dataUrl));
    }
    throwIfAborted(signal);
    const characterName = dependencies.getCharacterName() || 'comic_forge';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `bbcf_p${panelNumber || 0}_${timestamp}`;
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        signal,
        body: JSON.stringify({
            image: parsed.base64Data,
            format: parsed.normalizedFormat,
            ch_name: characterName,
            filename,
        }),
    });
    if (!response.ok) {
        const raw = await response.text().catch(() => '');
        throw new Error(raw || `Upload failed: ${response.status}`);
    }
    const result = await response.json();
    if (!result?.path) throw new Error('Upload response did not contain image path.');
    return result.path;
}

export async function uploadReferenceImage(dataUrl, slotId, dependencies = {}) {
    const context = dependencies.getContext();
    let parsed = parseImageDataUrl(dataUrl);
    if (!UPLOAD_ALLOWED_FORMATS.has(parsed.normalizedFormat)) {
        parsed = parseImageDataUrl(await convertDataUrlToPng(dataUrl));
    }
    const safeSlot = String(slotId || 'ref').replace(/[^a-z0-9_-]/gi, '_').slice(0, 24);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const response = await fetch('/api/images/upload', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            image: parsed.base64Data,
            format: parsed.normalizedFormat,
            ch_name: 'bbcf_refs',
            filename: `bbcf_ref_${safeSlot}_${timestamp}`,
        }),
    });
    if (!response.ok) {
        const raw = await response.text().catch(() => '');
        throw new Error(raw || `Upload failed: ${response.status}`);
    }
    const result = await response.json();
    if (!result?.path) throw new Error('Upload response did not contain image path.');
    return result.path;
}
