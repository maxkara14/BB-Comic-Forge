import { REFERENCE_SLOTS, WARDROBE_MODE_CATEGORIES } from './config.js';
import { normalizeWardrobeAssignment } from './normalizers.js';

export function findWardrobeItem(settings, id) {
    if (!id) return null;
    return settings.wardrobeItems.find(item => item.id === id) || null;
}

export function getFilteredWardrobeItems(settings, ownerId, category = 'all', selectedTag = 'all') {
    const ownerTarget = getTargetForOwner(ownerId);
    return settings.wardrobeItems
        .filter(item => getAllowedWardrobeCategories(settings.wardrobeAssignments?.[ownerId]?.mode || 'full').includes(item.category))
        .filter(item => category === 'all' || item.category === category)
        .filter(item => selectedTag === 'all' || (item.tags || []).includes(selectedTag))
        .filter(item => item.target === 'all' || item.target === ownerTarget)
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.createdAt || 0) - (a.createdAt || 0));
}

export function getWardrobeTagsForOwner(settings, ownerId) {
    const ownerTarget = getTargetForOwner(ownerId);
    const allowed = getAllowedWardrobeCategories(settings.wardrobeAssignments?.[ownerId]?.mode || 'full');
    const tags = new Set();
    for (const item of settings.wardrobeItems) {
        if (!allowed.includes(item.category)) continue;
        if (item.target !== 'all' && item.target !== ownerTarget) continue;
        for (const tag of item.tags || []) tags.add(tag);
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

export function getAllowedWardrobeCategories(mode) {
    return WARDROBE_MODE_CATEGORIES[mode === 'parts' ? 'parts' : 'full'];
}

export function getWardrobeCategoryIcon(category) {
    if (category === 'full') return 'fa-user';
    if (category === 'top') return 'fa-shirt';
    if (category === 'bottom') return 'fa-table-cells-large';
    if (category === 'shoes') return 'fa-shoe-prints';
    if (category === 'accessories') return 'fa-gem';
    if (category === 'hair') return 'fa-scissors';
    return 'fa-shirt';
}

export function getTargetForOwner(ownerId) {
    if (ownerId === 'char') return 'char';
    if (ownerId === 'user') return 'user';
    return 'npc';
}

export function getWardrobeActiveItems(settings, ownerId) {
    const assignment = settings.wardrobeAssignments?.[ownerId] || normalizeWardrobeAssignment();
    const categories = assignment.mode === 'parts'
        ? ['top', 'bottom', 'shoes', 'accessories', 'hair']
        : ['full', 'accessories', 'hair'];
    return categories
        .map(category => findWardrobeItem(settings, assignment[category]))
        .filter(Boolean);
}

export function getWardrobeActiveEntries(settings) {
    const entries = [];
    for (const owner of REFERENCE_SLOTS) {
        for (const item of getWardrobeActiveItems(settings, owner.id)) {
            entries.push({ owner, item });
        }
    }
    return entries;
}
