export const REFERENCE_SLOTS = [
    { id: 'char', label: '{{char}}' },
    { id: 'user', label: '{{user}}' },
    { id: 'npc1', label: 'NPC 1' },
    { id: 'npc2', label: 'NPC 2' },
    { id: 'npc3', label: 'NPC 3' },
    { id: 'npc4', label: 'NPC 4' },
];

export const WARDROBE_SLOTS = REFERENCE_SLOTS.map(slot => ({
    ...slot,
    label: `${slot.label} outfit`,
}));

export const WARDROBE_CATEGORIES = {
    full: 'Комплект',
    top: 'Верх',
    bottom: 'Низ',
    shoes: 'Обувь',
    accessories: 'Аксессуары',
    hair: 'Причёска',
};

export const WARDROBE_CATEGORY_ORDER = Object.keys(WARDROBE_CATEGORIES);

export const WARDROBE_TARGETS = {
    all: 'Для всех',
    char: '{{char}}',
    user: '{{user}}',
    npc: 'NPC',
};

export const WARDROBE_MODE_CATEGORIES = {
    full: ['full', 'accessories', 'hair'],
    parts: ['top', 'bottom', 'shoes', 'accessories', 'hair'],
};
