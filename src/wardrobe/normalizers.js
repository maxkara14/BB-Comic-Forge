import { makeId } from '../core/id.js';
import {
    REFERENCE_SLOTS,
    WARDROBE_CATEGORIES,
    WARDROBE_CATEGORY_ORDER,
    WARDROBE_TARGETS,
} from './config.js';

export function normalizeReferences(rawReferences) {
    const byId = new Map(Array.isArray(rawReferences) ? rawReferences.map(ref => [ref?.id, ref]) : []);
    return REFERENCE_SLOTS.map(slot => {
        const ref = byId.get(slot.id) || {};
        return {
            id: slot.id,
            label: slot.label,
            enabled: ref.enabled !== false,
            name: String(ref.name || '').trim(),
            description: String(ref.description || '').trim(),
            path: String(ref.path || '').trim(),
        };
    });
}

export function hasReferenceProfileData(rawReferences) {
    return normalizeReferences(rawReferences).some(ref =>
        ref.enabled === false
        || ref.path
        || ref.name
        || ref.description);
}

export function normalizeWardrobeItems(rawItems) {
    const items = Array.isArray(rawItems) ? rawItems : [];
    return items
        .filter(item => item && typeof item === 'object')
        .map(item => ({
            id: String(item.id || makeId('wardrobe-item')),
            name: String(item.name || 'Новый образ').trim(),
            description: String(item.description || '').trim(),
            path: String(item.path || item.imagePath || '').trim(),
            category: WARDROBE_CATEGORIES[item.category] ? item.category : 'full',
            target: WARDROBE_TARGETS[item.target] ? item.target : 'all',
            tags: Array.isArray(item.tags) ? item.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8) : [],
            favorite: Boolean(item.favorite),
            createdAt: Number(item.createdAt || Date.now()),
        }));
}

export function normalizeWardrobeAssignments(rawAssignments) {
    const normalized = {};
    for (const owner of REFERENCE_SLOTS) {
        normalized[owner.id] = normalizeWardrobeAssignment(rawAssignments?.[owner.id]);
    }
    return normalized;
}

export function normalizeWardrobeAssignment(rawAssignment = {}) {
    return {
        mode: rawAssignment.mode === 'parts' ? 'parts' : 'full',
        full: String(rawAssignment.full || ''),
        top: String(rawAssignment.top || ''),
        bottom: String(rawAssignment.bottom || ''),
        shoes: String(rawAssignment.shoes || ''),
        accessories: String(rawAssignment.accessories || ''),
        hair: String(rawAssignment.hair || ''),
    };
}

export function hasAnyWardrobeAssignment(assignments) {
    return Object.values(assignments || {}).some(assignment =>
        WARDROBE_CATEGORY_ORDER.some(category => String(assignment?.[category] || '').trim()));
}
