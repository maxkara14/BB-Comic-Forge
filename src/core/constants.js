export const MODULE_NAME = 'BB-Comic-Forge';
export const SETTINGS_ID = 'bbcf-settings';
export const FAB_ID = 'bbcf-open-fab';
export const FAB_WRAPPER_ID = 'bbcf-open-wrapper';
export const MODAL_ID = 'bbcf-modal-root';
export const MAX_PANELS = 6;
export const UPLOAD_ALLOWED_FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
export const VALID_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const VALID_IMAGE_SIZES = ['1K', '2K', '4K'];
export const MAX_COMIC_HISTORY = 24;
export const MAX_PREVIOUS_CONTEXT_IMAGES = 3;
export const MAX_CONCURRENCY = 6;
export const DRAFT_CONNECTION_MODES = ['sillytavern', 'openai-chat', 'gemini'];
export const IMAGE_API_TYPES = ['openai-images', 'openai-chat', 'gemini', 'naistera'];
export const OPENAI_IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'];
export const OPENAI_IMAGE_QUALITIES = ['standard', 'hd', 'high', 'medium', 'low'];
export const COMIC_PAGE_SELECTOR = '.bbcf-comic-page, .custom-bbcf-comic-page, [data-bbcf-page]';
export const DRAFT_SYNC_FIELDS = ['generationMode', 'insertMode', 'panelCount', 'layout', 'stylePreset', 'characterLock', 'panelNotes', 'bubbles', 'inserts', 'sfx', 'customPrompt', 'negativePrompt'];
export const DRAFT_SYNC_SELECTORS = {
    generationMode: '#bbcf-draft-mode',
    insertMode: '#bbcf-draft-insert-mode',
    panelCount: '#bbcf-draft-count',
    layout: '#bbcf-draft-layout',
    stylePreset: '#bbcf-draft-style',
    characterLock: '#bbcf-draft-lock',
    panelNotes: '#bbcf-draft-notes',
    bubbles: '#bbcf-draft-bubbles',
    inserts: '#bbcf-draft-inserts',
    sfx: '#bbcf-draft-sfx',
    customPrompt: '#bbcf-draft-custom-style',
    negativePrompt: '#bbcf-draft-negative',
};
