export const DEFAULT_NEGATIVE_PROMPT = 'low quality, blurry, noisy, jpeg artifacts, bad anatomy, extra limbs, malformed hands, unreadable text, fake letters, watermark, logo, signature, cluttered panel, broken face, inconsistent character design';

export const DRAFT_CAST_DIALOGUE_RULES = [
    '- Before writing JSON, identify every story-active participant from the recent chat.',
    '- Include every story-active participant in character_lock with stable visible continuity details.',
    '- Every panel note must explicitly name every character visible in that panel; do not rely only on pronouns or generic labels.',
    '- Each story-active participant must appear in at least one panel unless they are intentionally off-panel; if off-panel, state that clearly in scene or the relevant panel note.',
    '- Do not force every participant into every panel. Preserve close-ups, reaction shots, detail shots, and readable composition.',
    '- Every speech or thought bubble must include a "speaker" field using the character name from character_lock.',
    '- The speaker field is metadata for composition and must never be repeated inside the visible bubble text.',
    '- When multiple bubbles are used, they must form one coherent exchange anchored in the latest roleplay beat, not isolated generic phrases.',
    '- Each later bubble must respond to, clarify, challenge, or advance an earlier line or visible action.',
].join('\n');

export const DEFAULT_DRAFT_PROMPT = `<task>
Create a compact but visually specific comic page draft from the roleplay context.
</task>

<context>
Recent chat:
{{recent_chat}}

Existing character lock:
{{character_lock}}

User persona:
{{user_persona}}

Current character card:
{{character_context}}
</context>

<rules>
- Output only valid JSON, no markdown.
- The comic page must continue the current story with continuity.
- Use {{panel_count}} panels.
- Keep the draft detailed enough for image generation, but not bloated.
- Write scene as 1 to 2 compact sentences.
- Write character_lock as 1 compact paragraph.
- Write each panel note as 1 complete but compact sentence.
- Visual descriptions may be in English for better image generation.
- Bubble text, SFX, signs, labels, and any visible text inside inserts must be in Russian only.
- Do not include translations, bilingual text, or parenthetical explanations for Russian phrases.
- Preserve known character appearance, outfit, injuries, accessories, species traits, powers, weapons, and relationship continuity from the context.
- character_lock must focus on stable visible traits: hair, eyes, face, body type, outfit, accessories, injuries, species traits, weapons, and other important continuity details.
- Put current emotion, pose, interaction, and relationship tension in scene and panel_notes rather than treating them as permanent character traits.
- If an appearance detail is unknown, do not invent a precise new design; describe only what is known and keep the rest consistent with the context.
- scene must include location, atmosphere, lighting, emotional tone, the main story beat, and who is present.
- Each panel note must include camera or framing, explicitly named visible characters, action, expression or body language, and one important background or prop detail.
- Do not include panel numbers or labels like "panel 1:" inside panel_notes. The array order already defines the panel number.
- Use comic-friendly visual storytelling appropriate to the selected style when useful: establishing shots, close-ups, reaction shots, dramatic pauses, expressive body language, symbolic details, impact frames, and visual timing.
- Bubble text must be in Russian, usually 4 to 12 words per bubble; allow up to 16 only for plot-critical clarity.
- Use up to 4 bubbles total.
- If the recent context contains dialogue, preserve its intent and turn it into a coherent exchange.
- Do not invent dialogue merely to fill a bubble quota.
${DRAFT_CAST_DIALOGUE_RULES}
- Use 1 to 2 overlay inserts when they improve storytelling.
- When inserts are used, include at least 1 detail insert focused on something important inside a panel: hands, lips, eyes, weapons, objects, symbols, clues, impact contact, clothing detail, or a decisive action emphasis.
- Use a chibi insert only when it fits the scene tone. If used, base it on the user persona or the current character as a tiny comedic reaction to the situation, plot beat, or emotional moment.
- For serious, tense, or tragic scenes, prefer a reaction or detail insert instead of forcing a chibi gag.
- Insert descriptions may be in English, but any quoted visible text inside the image must be Russian only.
- Place inserts only where they improve readability and do not overcrowd the panel.
- Do not write explicit sexual content.
</rules>

<format>
{
  "title": "short page title",
  "scene": "compact visual summary: location, lighting, mood, main story beat, and who is present",
  "character_lock": "compact stable visual notes for important participants: appearance, outfit, injuries, accessories, and continuity details",
  "panel_notes": [
    "Wide establishing shot of the named characters entering a rain-soaked station, guarded posture, cold fluorescent lighting, abandoned luggage near the platform edge",
    "Tight reaction shot on the named speaker turning toward their companion, restrained fear in their eyes, one hand gripping a damaged radio"
  ],
  "bubbles": [
    { "panel": 1, "type": "speech", "position": "top-left", "speaker": "Character name", "text": "Русская реплика здесь" }
  ],
  "sfx": [
    { "panel": 1, "text": "БАХ" }
  ],
  "inserts": [
    { "panel": 1, "type": "detail", "position": "bottom-left", "text": "small bordered close-up of tense fingers gripping black fabric" }
  ]
}
</format>`;

export const DEFAULT_SETTINGS = {
    schemaVersion: 4,
    enabled: true,
    showFab: true,
    apiType: 'onlysq-imagen',
    endpoint: '',
    apiKey: '',
    model: '',
    availableModels: [],
    imageConnectionProfiles: [],
    activeImageConnectionProfileId: '',
    openaiSize: '1024x1024',
    openaiQuality: 'standard',
    aspectRatio: 'auto',
    imageSize: '1K',
    naisteraModel: 'nano banana',
    naisteraAspectRatio: 'auto',
    naisteraPreset: 'digital',
    timeoutMs: 180000,
    concurrency: 1,
    requestCooldownMs: 0,
    generationMode: 'panels',
    autoMode: false,
    bubbleMode: 'model',
    insertMode: 'new',
    panelCount: 4,
    layout: 'webtoon',
    stylePreset: 'manhwa',
    customPrompt: '',
    savedStyles: [],
    savedLayouts: [],
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    characterLock: '',
    defaultPanelNotes: '',
    defaultBubbles: '',
    defaultInserts: '',
    defaultSfx: '',
    contextMessages: 4,
    injectChatContextToImagePrompt: false,
    previousImageCount: 0,
    draftPrompt: DEFAULT_DRAFT_PROMPT,
    draftConnectionMode: 'sillytavern',
    draftEndpoint: '',
    draftApiKey: '',
    draftModel: '',
    availableDraftModels: [],
    draftTemperature: 0.35,
    draftTavernProfileId: '',
    draftConnectionProfiles: [],
    activeDraftConnectionProfileId: '',
    draftPromptPresets: [],
    activeDraftPromptPresetId: '',
    references: [],
    referenceProfiles: {},
    activeReferenceProfileKey: '',
    referencesMigratedToProfiles: false,
    wardrobeEnabled: true,
    wardrobeSendDescription: true,
    wardrobeSendImages: true,
    wardrobe: [],
    wardrobeItems: [],
    wardrobeAssignments: {},
    wardrobeProfiles: {},
    activeWardrobeProfileKey: '',
    wardrobeMigratedToProfiles: false,
    characterLockProfiles: {},
    activeCharacterLockProfileKey: '',
    savedDraftProfiles: {},
    activeSavedDraftProfileKey: '',
    savedDraft: null,
    comicHistory: [],
};
