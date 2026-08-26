import { MAX_PREVIOUS_CONTEXT_IMAGES } from '../core/constants.js';
import { uniqueStrings } from '../core/strings.js';
import { fetchUrlAsDataUrl } from '../images/browser.js';
import { parseImageDataUrl } from '../providers/responses.js';
import { isAbortError, throwIfAborted } from '../providers/transport.js';

export function createReferenceService(dependencies) {
    const { getSettings, getWardrobeActiveEntries } = dependencies;

    async function collectReferenceImages(previousImagePaths = [], signal = null) {
        const settings = getSettings();
        const refs = settings.references
            .filter(ref => ref.enabled && ref.path);
        const loaded = [];
        for (const ref of refs) {
            throwIfAborted(signal);
            try {
                const dataUrl = await fetchUrlAsDataUrl(ref.path, signal);
                const parsed = parseImageDataUrl(dataUrl);
                loaded.push({
                    id: ref.id,
                    label: ref.label,
                    name: ref.name,
                    dataUrl,
                    base64: parsed.base64Data,
                    mimeType: `image/${parsed.subtype}`,
                });
            } catch (error) {
                if (isAbortError(error)) throw error;
                console.warn('[BB Comic Forge] reference skipped', ref.path, error);
            }
        }
        if (settings.wardrobeEnabled && settings.wardrobeSendImages) {
            loaded.push(...await collectWardrobeReferenceImages(signal));
        }
        const previous = await collectPreviousContextReferenceImages(previousImagePaths, signal);
        return [...loaded, ...previous];
    }

    async function collectWardrobeReferenceImages(signal = null) {
        const settings = getSettings();
        if (!settings.wardrobeEnabled || !settings.wardrobeSendImages) return [];
        const outfits = getWardrobeActiveEntries(settings).filter(entry => entry.item.path);
        const loaded = [];
        for (const { owner, item } of outfits) {
            throwIfAborted(signal);
            try {
                const dataUrl = await fetchUrlAsDataUrl(item.path, signal);
                const parsed = parseImageDataUrl(dataUrl);
                loaded.push({
                    id: `wardrobe_${owner.id}_${item.id}`,
                    label: `${owner.label} outfit`,
                    name: `${owner.label} ${item.name || ''}`.trim(),
                    dataUrl,
                    base64: parsed.base64Data,
                    mimeType: `image/${parsed.subtype}`,
                    kind: 'wardrobe',
                });
            } catch (error) {
                if (isAbortError(error)) throw error;
                console.warn('[BB Comic Forge] wardrobe reference skipped', item, error);
            }
        }
        return loaded;
    }

    async function collectPreviousContextReferenceImages(paths = [], signal = null) {
        const uniquePaths = uniqueStrings(paths).slice(0, MAX_PREVIOUS_CONTEXT_IMAGES);
        const loaded = [];
        for (const path of uniquePaths) {
            throwIfAborted(signal);
            try {
                const dataUrl = await fetchUrlAsDataUrl(path, signal);
                const parsed = parseImageDataUrl(dataUrl);
                loaded.push({
                    id: `previous_${loaded.length + 1}`,
                    label: `Previous comic image ${loaded.length + 1}`,
                    name: 'previous comic continuity reference',
                    dataUrl,
                    base64: parsed.base64Data,
                    mimeType: `image/${parsed.subtype}`,
                    kind: 'previous',
                });
            } catch (error) {
                if (isAbortError(error)) throw error;
                console.warn('[BB Comic Forge] previous context image skipped', path, error);
            }
        }
        return loaded;
    }

    function buildReferencePromptBlock() {
        const settings = getSettings();
        const refs = settings.references
            .filter(ref => ref.enabled && (ref.description || ref.name))
            .map(ref => {
                const name = ref.name || ref.label;
                const description = ref.description || 'Use the uploaded reference image as the visual anchor when it is available.';
                return `${ref.label}${name && name !== ref.label ? `, ${name}` : ''}: ${description}`;
            });
        if (!refs.length) return '';
        return `Character and NPC reference notes for text injection. Use these notes even when the current image API cannot read reference images:\n${refs.join('\n')}`;
    }

    function buildWardrobePromptBlock() {
        const settings = getSettings();
        if (!settings.wardrobeEnabled || !settings.wardrobeSendDescription) return '';
        const outfits = getWardrobeActiveEntries(settings).filter(entry => entry.item.description);
        if (!outfits.length) return '';
        const lines = outfits.map(({ owner, item }) => `${owner.label}, ${item.name}: ${item.description}`);
        return `Wardrobe lock from BB Comic Forge. Keep these outfits unchanged when the matching character or NPC appears:\n${lines.join('\n')}`;
    }

    function buildFullPrompt(panel) {
        const parts = [
            panel.stylePrompt,
            panel.prompt,
            panel.negativePrompt ? `Negative prompt: ${panel.negativePrompt}` : '',
        ];
        return parts.filter(Boolean).join('\n\n');
    }

    function buildReferenceInstruction(references) {
        if (!references.length) return '';
        const lines = references.map((ref, index) => {
            const name = ref.name || ref.label || `reference ${index + 1}`;
            if (ref.kind === 'wardrobe') {
                return `Reference image ${index + 1} shows ${name}. Preserve this outfit faithfully when that character appears. Use it as clothing reference only, not pose reference.`;
            }
            if (ref.kind === 'previous') {
                return `Reference image ${index + 1} is a recent Comic Forge output. Use it for continuity of character identity, clothing state, rendering style, lighting, and environment. Do not copy the exact pose or composition unless the current panel asks for it.`;
            }
            return `Reference image ${index + 1} is ${name}. Preserve this character or visual anchor faithfully when it appears in the panel.`;
        });
        return `${lines.join('\n')}\nUse the reference images only for their own subjects. Do not mix identities, clothing, markings, or facial features between characters.`;
    }

    return {
        buildFullPrompt,
        buildReferenceInstruction,
        buildReferencePromptBlock,
        buildWardrobePromptBlock,
        collectReferenceImages,
    };
}

