import { MAX_COMIC_HISTORY } from '../core/constants.js';
import {
    hasAnyWardrobeAssignment,
    hasReferenceProfileData,
    normalizeReferences,
    normalizeWardrobeAssignments,
} from '../wardrobe/normalizers.js';
import { findProfileSeed, hasOwn, normalizeSavedDraft } from './normalizers.js';

const LEGACY_UNSCOPED_PROFILE_KEY = 'legacy:unscoped';

export function hydrateScopedSettings(settings, profileKey, getFallbackKeys = () => []) {
    let dirty = false;
    if (!settings.characterLockProfiles || typeof settings.characterLockProfiles !== 'object' || Array.isArray(settings.characterLockProfiles)) {
        settings.characterLockProfiles = {};
        dirty = true;
    }
    if (settings.activeCharacterLockProfileKey !== profileKey) {
        settings.activeCharacterLockProfileKey = profileKey;
        dirty = true;
    }
    settings.characterLock = String(settings.characterLockProfiles[profileKey] || '');
    if (!settings.wardrobeProfiles || typeof settings.wardrobeProfiles !== 'object' || Array.isArray(settings.wardrobeProfiles)) {
        settings.wardrobeProfiles = {};
        dirty = true;
    }
    const legacyWardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeAssignments);
    const hasLegacyWardrobeAssignments = hasAnyWardrobeAssignment(legacyWardrobeAssignments);
    if (!settings.wardrobeMigratedToProfiles && hasLegacyWardrobeAssignments && !settings.wardrobeProfiles[LEGACY_UNSCOPED_PROFILE_KEY]) {
        settings.wardrobeProfiles[LEGACY_UNSCOPED_PROFILE_KEY] = structuredClone(legacyWardrobeAssignments);
        dirty = true;
    }
    if (!settings.wardrobeMigratedToProfiles) {
        settings.wardrobeMigratedToProfiles = true;
        dirty = true;
    }
    if (settings.activeWardrobeProfileKey !== profileKey) {
        settings.activeWardrobeProfileKey = profileKey;
        dirty = true;
    }
    const hasActiveWardrobeProfile = hasOwn(settings.wardrobeProfiles, profileKey);
    let wardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeProfiles[profileKey] || {});
    if (!hasActiveWardrobeProfile && !hasAnyWardrobeAssignment(wardrobeAssignments)) {
        const seed = findProfileSeed(settings.wardrobeProfiles, getFallbackKeys(), hasAnyWardrobeAssignment);
        if (seed) {
            wardrobeAssignments = normalizeWardrobeAssignments(seed.value);
            settings.wardrobeProfiles[profileKey] = structuredClone(wardrobeAssignments);
            dirty = true;
            console.info('[BB Comic Forge] restored wardrobe assignment profile from', seed.key);
        }
    }
    settings.wardrobeAssignments = wardrobeAssignments;
    if (settings.savedDraft && typeof settings.savedDraft !== 'object') {
        settings.savedDraft = null;
        dirty = true;
    }
    if (!settings.savedDraftProfiles || typeof settings.savedDraftProfiles !== 'object' || Array.isArray(settings.savedDraftProfiles)) {
        settings.savedDraftProfiles = {};
        dirty = true;
    }
    if (settings.activeSavedDraftProfileKey !== profileKey) {
        settings.activeSavedDraftProfileKey = profileKey;
        dirty = true;
    }
    settings.savedDraft = normalizeSavedDraft(settings.savedDraftProfiles[profileKey]);
    if (!Array.isArray(settings.comicHistory)) {
        settings.comicHistory = [];
        dirty = true;
    } else if (settings.comicHistory.length > MAX_COMIC_HISTORY) {
        settings.comicHistory = settings.comicHistory.slice(0, MAX_COMIC_HISTORY);
        dirty = true;
    }
    if (!settings.referenceProfiles || typeof settings.referenceProfiles !== 'object' || Array.isArray(settings.referenceProfiles)) {
        settings.referenceProfiles = {};
        dirty = true;
    }
    const existingReferences = normalizeReferences(settings.references);
    const hasLegacyReferences = existingReferences.some(ref => ref.path || ref.name || ref.description);
    if (!settings.referencesMigratedToProfiles && hasLegacyReferences && !settings.referenceProfiles[LEGACY_UNSCOPED_PROFILE_KEY]) {
        settings.referenceProfiles[LEGACY_UNSCOPED_PROFILE_KEY] = structuredClone(existingReferences);
        dirty = true;
    }
    if (!settings.referencesMigratedToProfiles) {
        settings.referencesMigratedToProfiles = true;
        dirty = true;
    }
    if (settings.activeReferenceProfileKey !== profileKey) {
        settings.activeReferenceProfileKey = profileKey;
        dirty = true;
    }
    const hasActiveReferenceProfile = hasOwn(settings.referenceProfiles, profileKey);
    let references = normalizeReferences(settings.referenceProfiles[profileKey] || []);
    if (!hasActiveReferenceProfile && !hasReferenceProfileData(references)) {
        const seed = findProfileSeed(settings.referenceProfiles, getFallbackKeys(), hasReferenceProfileData);
        if (seed) {
            references = normalizeReferences(seed.value);
            settings.referenceProfiles[profileKey] = structuredClone(references);
            dirty = true;
            console.info('[BB Comic Forge] restored reference profile from', seed.key);
        }
    }
    settings.references = references;
    return dirty;
}

export function persistWardrobeProfile(settings, profileKey) {
    if (!settings) return;
    if (!settings.wardrobeProfiles || typeof settings.wardrobeProfiles !== 'object' || Array.isArray(settings.wardrobeProfiles)) {
        settings.wardrobeProfiles = {};
    }
    settings.wardrobeAssignments = normalizeWardrobeAssignments(settings.wardrobeAssignments);
    settings.wardrobeProfiles[profileKey] = structuredClone(settings.wardrobeAssignments);
    settings.activeWardrobeProfileKey = profileKey;
}

export function persistCharacterLockProfileValue(settings, profileKey) {
    if (!settings) return;
    if (!settings.characterLockProfiles || typeof settings.characterLockProfiles !== 'object' || Array.isArray(settings.characterLockProfiles)) {
        settings.characterLockProfiles = {};
    }
    const value = String(settings.characterLock || '');
    if (value) settings.characterLockProfiles[profileKey] = value;
    else delete settings.characterLockProfiles[profileKey];
    settings.activeCharacterLockProfileKey = profileKey;
}
