import { makeId } from '../core/id.js';
import { REFERENCE_SLOTS } from './config.js';
import { normalizeWardrobeAssignment } from './normalizers.js';

export function migrateLegacyWardrobe(settings) {
    const migrated = [];
    for (const slot of settings.wardrobe || []) {
        if (!slot?.path && !slot?.description && !slot?.name) continue;
        const id = makeId(`wardrobe-${slot.id || 'item'}`);
        migrated.push({
            id,
            name: String(slot.name || slot.label || 'Образ').trim(),
            description: String(slot.description || '').trim(),
            path: String(slot.path || '').trim(),
            category: 'full',
            target: slot.id === 'char' || slot.id === 'user' ? slot.id : slot.id?.startsWith('npc') ? 'npc' : 'all',
            tags: [],
            favorite: false,
            createdAt: Date.now(),
        });
        if (slot.enabled && settings.wardrobeAssignments?.[slot.id] !== undefined) {
            settings.wardrobeAssignments[slot.id] = normalizeWardrobeAssignment({ mode: 'full', full: id });
        } else if (slot.enabled && REFERENCE_SLOTS.some(owner => owner.id === slot.id)) {
            settings.wardrobeAssignments[slot.id] = normalizeWardrobeAssignment({ mode: 'full', full: id });
        }
    }
    if (migrated.length) {
        settings.wardrobeItems = [...(Array.isArray(settings.wardrobeItems) ? settings.wardrobeItems : []), ...migrated];
    }
}
