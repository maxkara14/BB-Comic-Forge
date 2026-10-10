// Explicit profile modes keep vendor-specific parameters away from compatible proxies.
import { OPENAI_IMAGE_QUALITIES, VALID_ASPECT_RATIOS } from '../core/constants.js';

export const IMAGE_PARAMETER_MODES = ['compatible', 'gpt-image', 'gpt-image-2', 'gpt-image-2.5', 'grok'];
export const GROK_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20', '21:9', '5:2'];
export const IMAGE_ASPECT_RATIOS = [...new Set([...VALID_ASPECT_RATIOS, ...GROK_ASPECT_RATIOS])];

export function getImageParameterMode(settings) {
    return IMAGE_PARAMETER_MODES.includes(settings.openaiImageMode) ? settings.openaiImageMode : 'compatible';
}

export function getImageQualityOptions(settings) {
    const mode = getImageParameterMode(settings);
    if (mode === 'compatible') return OPENAI_IMAGE_QUALITIES.filter(value => !['xhigh', 'max'].includes(value));
    if (mode === 'grok') return ['auto', 'low', 'medium'];
    return mode === 'gpt-image-2.5' ? ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] : ['auto', 'low', 'medium', 'high'];
}

export function normalizeImageParameterSettings(settings) {
    settings.openaiImageMode = getImageParameterMode(settings);
    if (!IMAGE_ASPECT_RATIOS.includes(settings.imageAspectRatio) && settings.imageAspectRatio !== 'auto') settings.imageAspectRatio = 'auto';
    if (settings.openaiImageMode === 'grok' && !GROK_ASPECT_RATIOS.includes(settings.imageAspectRatio)) settings.imageAspectRatio = 'auto';
    settings.openaiCustomSize = String(settings.openaiCustomSize || '').trim().slice(0, 32);
    if (!getImageQualityOptions(settings).includes(settings.openaiQuality)) settings.openaiQuality = settings.openaiImageMode === 'compatible' ? 'standard' : 'auto';
    if (settings.apiType === 'openai-images' && settings.openaiImageMode === 'grok' && settings.imageSize === '4K') settings.imageSize = '2K';
    if (settings.openaiImageMode === 'gpt-image' && !['1024x1024', '1536x1024', '1024x1536', 'auto'].includes(settings.openaiSize)) settings.openaiSize = '1024x1024';
    return settings;
}

export function buildImageRequestOptions(settings, panel = {}) {
    const mode = getImageParameterMode(settings);
    const quality = settings.openaiQuality || (mode === 'compatible' ? 'standard' : 'auto');
    if (!getImageQualityOptions(settings).includes(quality)) throw new Error(`Качество ${quality} не поддерживается режимом ${mode}. Проверьте настройки подключения.`);
    if (mode === 'compatible') return { size: settings.openaiSize || '1024x1024', quality, response_format: 'b64_json' };
    if (mode === 'gpt-image') return { size: settings.openaiSize || '1024x1024', quality };
    const aspectRatio = settings.imageAspectRatio && settings.imageAspectRatio !== 'auto' ? settings.imageAspectRatio : (panel.aspectRatio || '1:1');
    const resolution = settings.imageSize || '1K';
    if (mode === 'grok') {
        if (!['1K', '2K'].includes(resolution)) throw new Error('Grok поддерживает только разрешения 1K и 2K.');
        if (!GROK_ASPECT_RATIOS.includes(aspectRatio) && aspectRatio !== 'auto') throw new Error(`Grok не поддерживает пропорции ${aspectRatio}. Выберите пропорции в настройках подключения.`);
        return { resolution: resolution.toLowerCase(), aspect_ratio: aspectRatio, quality, response_format: 'b64_json' };
    }
    let size = String(settings.openaiCustomSize || '').trim();
    if (!size) {
        const edge = { '1K': 1024, '2K': 2048, '4K': 3840 }[resolution];
        const [widthRatio, heightRatio] = String(aspectRatio === 'auto' ? '1:1' : aspectRatio).split(':').map(Number);
        if (!edge || !(widthRatio > 0 && heightRatio > 0)) throw new Error('Некорректное разрешение или пропорции GPT Image.');
        let scale = Math.max(edge / Math.max(widthRatio, heightRatio), Math.sqrt(655360 / (widthRatio * heightRatio)));
        let width = Math.round(widthRatio * scale / 16) * 16;
        let height = Math.round(heightRatio * scale / 16) * 16;
        if (width * height < 655360) {
            scale += 16 / Math.max(widthRatio, heightRatio);
            width = Math.round(widthRatio * scale / 16) * 16;
            height = Math.round(heightRatio * scale / 16) * 16;
        }
        size = `${width}x${height}`;
    }
    const match = /^(\d+)x(\d+)$/.exec(size);
    const width = Number(match?.[1]);
    const height = Number(match?.[2]);
    const pixels = width * height;
    if (!match || !width || !height || width % 16 || height % 16 || Math.max(width, height) > 3840 || Math.max(width, height) / Math.min(width, height) > 3 || pixels < 655360 || pixels > 8294400) {
        throw new Error(`Размер ${size} не поддерживается GPT Image: стороны кратны 16, до 3840 px, пропорции до 3:1, от 655360 до 8294400 пикселей. Выберите другое разрешение или точный размер.`);
    }
    return { size, quality };
}
