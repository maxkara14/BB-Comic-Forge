export function extractImageFromOnlySqResponse(result) {
    const fromValue = value => {
        if (!value) return null;
        if (typeof value === 'string') {
            if (/^data:image\//i.test(value)) return value;
            if (/^https?:\/\//i.test(value)) return value;
            if (/^[A-Za-z0-9+/=\s]{120,}$/.test(value)) return `data:image/png;base64,${value.replace(/\s+/g, '')}`;
            return null;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const found = fromValue(item);
                if (found) return found;
            }
            return null;
        }
        if (typeof value === 'object') {
            return fromValue(value.b64_json)
                || fromValue(value.base64)
                || fromValue(value.data)
                || fromValue(value.url)
                || fromValue(value.image)
                || fromValue(value.file)
                || fromValue(value.files)
                || fromValue(value.images)
                || fromValue(value.output);
        }
        return null;
    };
    return fromValue(result?.files) || fromValue(result?.data) || fromValue(result);
}

export function extractImageFromChatResponse(result) {
    const message = result?.choices?.[0]?.message;
    if (message) {
        if (Array.isArray(message.images) && message.images.length) {
            const image = message.images[0];
            if (image?.image_url?.url) return image.image_url.url;
            if (image?.url) return image.url;
            if (image?.b64_json) return `data:image/png;base64,${image.b64_json}`;
            if (typeof image === 'string') return image;
        }
        if (Array.isArray(message.content)) {
            for (const part of message.content) {
                if (part?.type === 'image_url' && part.image_url?.url) return part.image_url.url;
                if (part?.type === 'image' && part.source?.data) return `data:${part.source.media_type || 'image/png'};base64,${part.source.data}`;
            }
        }
        if (typeof message.content === 'string') {
            const dataUrl = message.content.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
            if (dataUrl) return dataUrl[0];
            const markdownUrl = message.content.match(/!\[[^\]]*]\((https?:\/\/[^)]+|data:image\/[^)]+)\)/);
            if (markdownUrl) return markdownUrl[1];
            const url = message.content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i);
            if (url) return url[0];
        }
        if (message.image_url?.url) return message.image_url.url;
    }
    if (Array.isArray(result?.data) && result.data.length) {
        if (result.data[0]?.b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;
        if (result.data[0]?.url) return result.data[0].url;
    }
    return null;
}

export function extractTextFromChatResult(result) {
    const message = result?.choices?.[0]?.message;
    const content = message?.content ?? result?.choices?.[0]?.text ?? result?.text ?? '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            if (typeof part?.content === 'string') return part.content;
            return '';
        }).filter(Boolean).join('\n');
    }
    return '';
}

export function extractTextFromGeminiResult(result) {
    const parts = result?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(part => part.text || '').filter(Boolean).join('\n');
    return text || result?.text || '';
}

export function parseImageDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
    if (!match) throw new Error('Image provider returned unsupported image payload.');
    const subtype = match[1].toLowerCase();
    const normalizedFormat = subtype === 'jpg' ? 'jpeg' : subtype;
    return { subtype, normalizedFormat, base64Data: match[2].trim() };
}
