export const STYLE_PRESETS = {
    manhwa: {
        label: 'Premium manhwa',
        prompt: 'Premium Korean manhwa and webtoon illustration, crisp expressive line art, elegant cinematic color grading, refined faces, clean anatomy, rich fabric rendering, controlled detail, dynamic panel-ready composition, professional vertical comic production quality.',
    },
    manga: {
        label: 'Black ink manga',
        prompt: 'High quality manga illustration, confident black ink linework, screentone shading, dramatic composition, expressive eyes, clean readable silhouettes, speed lines and impact shapes where appropriate, professional printed comic finish.',
    },
    donghua: {
        label: 'Donghua fantasy',
        prompt: 'High-end donghua fantasy key art, graceful movement, luminous atmosphere, elegant costumes, soft volumetric light, painterly yet clean rendering, expressive cinematic framing, romantic color contrast.',
    },
    cinematic: {
        label: 'Cinematic anime',
        prompt: 'Cinematic anime film still, dramatic camera language, emotional close-ups, polished character acting, controlled depth, natural lighting, rich but uncluttered background detail, production art quality.',
    },
    chibi: {
        label: 'Comedy chibi',
        prompt: 'Expressive comedy chibi manga style, exaggerated reactions, clean cartoon deformation, bold shapes, playful impact symbols, readable silhouettes, polished comic gag insert quality.',
    },
};

export const DEFAULT_PANEL_BEATS = [
    'Opening establishing panel. Show the location clearly, the emotional weather of the scene, and the characters entering the moment with readable body language.',
    'Interaction panel. Focus on the key exchange between the characters, eye lines, hand placement, posture tension, and the immediate emotional conflict.',
    'Extreme close-up insert. Focus on a face, hand, symbolic object, or emotional micro-expression that reveals what is not being said.',
    'Dynamic reaction panel. Include movement, stylized emphasis lines, sparks, sweat drops, petals, or comedic distortion if the tone calls for it.',
    'Quiet aftermath panel. Show the emotional result of the moment with negative space, lingering gaze, and environmental continuity.',
    'Final hook panel. End with a visually memorable beat that invites the next page.',
];

export const ASPECT_PATTERNS = {
    webtoon: ['9:16', '2:3', '16:9', '1:1', '2:3', '9:16'],
    grid: ['1:1', '1:1', '1:1', '1:1', '1:1', '1:1'],
    cinematic: ['16:9', '3:2', '3:2', '16:9', '1:1', '21:9'],
    manga: ['2:3', '1:1', '3:4', '16:9', '1:1', '2:3'],
    dramatic: ['16:9', '2:3', '1:1', '3:2', '9:16', '16:9'],
};

export const BUBBLE_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
