export function buildScopedProfileFallbackKeys(context = {}) {
    const keys = [];
    const groupId = context.groupId ?? context.group_id ?? context.selected_group;
    const group = groupId !== undefined && groupId !== null && groupId !== ''
        ? (Array.isArray(context.groups) ? context.groups.find(item => String(item?.id) === String(groupId)) : null)
        : null;
    const character = context.characterId !== undefined ? context.characters?.[context.characterId] : null;
    if (groupId !== undefined && groupId !== null && groupId !== '') {
        keys.push(`group:${safeProfilePart(groupId)}:${safeProfilePart(group?.name || context.name2 || 'group')}`);
    }
    if (character) {
        const stableId = character.avatar || character.name || context.characterId;
        keys.push(`character:${safeProfilePart(stableId)}:${safeProfilePart(character.name || context.name2 || 'character')}`);
    }
    keys.push(`chat:${safeProfilePart(context.name2 || 'global')}`);
    keys.push('legacy:unscoped');
    return [...new Set(keys)];
}

export function buildScopedProfileKey(context = {}) {
    const groupId = context.groupId ?? context.group_id ?? context.selected_group;
    const group = groupId !== undefined && groupId !== null && groupId !== ''
        ? (Array.isArray(context.groups) ? context.groups.find(item => String(item?.id) === String(groupId)) : null)
        : null;
    const character = context.characterId !== undefined ? context.characters?.[context.characterId] : null;
    const chatId = context.chatId
        || context.chat_id
        || context.chatMetadata?.chat_id
        || context.chatMetadata?.file_name
        || context.chatMetadata?.chat_name
        || context.chatMetadata?.name;
    if (chatId !== undefined && chatId !== null && chatId !== '') {
        const ownerId = groupId !== undefined && groupId !== null && groupId !== ''
            ? `group:${groupId}`
            : `character:${character?.avatar || character?.name || context.characterId || context.name2 || 'global'}`;
        const ownerName = group?.name || character?.name || context.name2 || 'chat';
        return `chat:${safeProfilePart(ownerId)}:${safeProfilePart(ownerName)}:${safeProfilePart(chatId)}`;
    }
    if (groupId !== undefined && groupId !== null && groupId !== '') {
        return `group:${safeProfilePart(groupId)}:${safeProfilePart(group?.name || context.name2 || 'group')}`;
    }
    if (character) {
        const stableId = character.avatar || character.name || context.characterId;
        return `character:${safeProfilePart(stableId)}:${safeProfilePart(character.name || context.name2 || 'character')}`;
    }
    return `chat:global:${safeProfilePart(context.name2 || 'global')}`;
}

export function safeProfilePart(value) {
    const text = String(value || 'global').trim().toLowerCase();
    return encodeURIComponent(text).replace(/%/g, '').slice(0, 120) || 'global';
}
