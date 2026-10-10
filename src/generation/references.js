import { MAX_PREVIOUS_CONTEXT_IMAGES } from '../core/constants.js';
import { uniqueStrings } from '../core/strings.js';
import { fetchUrlAsDataUrl } from '../images/browser.js';
import { parseImageDataUrl } from '../providers/responses.js';
import { isAbortError, throwIfAborted } from '../providers/transport.js';
import { normalizeStyleReferences } from '../wardrobe/normalizers.js';

export function createReferenceService(dependencies) {
    const { getSettings, getWardrobeActiveEntries } = dependencies;

    async function collectReferenceImages(previousImagePaths = [], signal = null) {
        const settings = getSettings();
        const refs = [...settings.references, ...normalizeStyleReferences(settings.styleReferences)]
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
                    kind: ref.kind,
                    description: ref.description,
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
                const description = ref.description || 'Use the uploaded reference image as the character appearance anchor when it is available.';
                return `${ref.label}${name && name !== ref.label ? `, ${name}` : ''}: ${description}`;
            });
        if (!refs.length) return '';
        return `Character and NPC appearance notes only. Preserve identity, facial features, hair, eyes, body proportions and distinctive markings; do not derive rendering style, clothing, poses or scene content from character references. Use the requested comic style and separate wardrobe instructions. Use these notes even when the current image API cannot read reference images:\n${refs.join('\n')}`;
    }

    function buildWardrobePromptBlock() {
        const settings = getSettings();
        if (!settings.wardrobeEnabled || !settings.wardrobeSendDescription) return '';
        const outfits = getWardrobeActiveEntries(settings).filter(entry => entry.item.description);
        if (!outfits.length) return '';
        const lines = outfits.map(({ owner, item }) => `${owner.label}, ${item.name}: ${item.description}`);
        return `Wardrobe lock from BB Comic Forge. Keep these outfits unchanged when the matching character or NPC appears. These notes specify clothing, accessories, colors, materials and fit only, not character identity, body features, rendering style, poses or scene content. Render the outfits in the requested comic style:\n${lines.join('\n')}`;
    }

    function buildFullPrompt(panel) {
        const styleNotes = normalizeStyleReferences(getSettings().styleReferences)
            .filter(ref => ref.enabled && ref.description)
            .map(ref => `${ref.name || ref.label}: ${ref.description}`);
        const parts = [
            panel.stylePrompt,
            styleNotes.length ? `Rendering style notes (not character appearance or story content):\n${styleNotes.join('\n')}` : '',
            panel.prompt,
            panel.negativePrompt ? `Negative prompt: ${panel.negativePrompt}` : '',
        ];
        return parts.filter(Boolean).join('\n\n');
    }

    function buildReferenceInstruction(references) {
        if (!references.length) return '';
        const lines = references.map((ref, index) => {
            const name = ref.name || ref.label || `reference ${index + 1}`;
            if (ref.kind === 'style') {
                return `Reference image ${index + 1} (${name}) is an ARTISTIC STYLE REFERENCE ONLY. Apply its linework, color treatment, shading and texture to the requested comic. Do not copy its characters, faces, outfits, objects, poses, panel layout, story, lettering or dialogue. Preserve the requested cast, scene and layout; take identity from character references and clothing from wardrobe references.${ref.description ? ` Style focus: ${ref.description}` : ''}`;
            }
            if (ref.kind === 'wardrobe') {
                return `Reference image ${index + 1} shows ${name}. Use it as clothing reference only: copy the outfit, accessories, garment colors, materials, patterns and fit faithfully when that character appears. Do not copy the depicted person's identity, face, hair, body features, pose, background, composition or rendering style. Render the outfit in the requested comic style; take appearance from character references.`;
            }
            if (ref.kind === 'previous') {
                return `Reference image ${index + 1} is a recent Comic Forge output. Use it for continuity of character identity, clothing state, lighting, and environment. Render this continuity in the currently requested comic style. Do not copy the exact pose or composition unless the current panel asks for it.`;
            }
            return `Reference image ${index + 1} is ${name}. Use it as a CHARACTER APPEARANCE REFERENCE ONLY: copy identity, facial features, hair, eyes, body proportions and distinctive markings faithfully when this character appears. Do not copy clothing, accessories, pose, background, composition, lettering or rendering style. Take outfits from wardrobe references or the current draft and redraw the character in the requested comic style.`;
        });
        const separation = references.some(ref => ref.kind === 'style')
            ? 'Keep reference roles separate: character images supply identity, wardrobe images supply outfits, style images supply rendering only. Style examples govern rendering when their look differs from character or previous-comic references; retain character identity and current continuity.'
            : 'Keep reference roles separate: character images supply appearance only and wardrobe images supply clothing only. The current comic style instructions govern rendering; never infer rendering style from character or wardrobe images.';
        return `${lines.join('\n')}\n${separation} Do not mix identities, clothing, markings, or facial features between characters.`;
    }

    return {
        buildFullPrompt,
        buildReferenceInstruction,
        buildReferencePromptBlock,
        buildWardrobePromptBlock,
        collectReferenceImages,
    };
}
