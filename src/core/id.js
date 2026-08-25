export function makeId(prefix) {
    const random = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g, '');
    return `${prefix}-${Date.now().toString(36)}-${random.slice(0, 8)}`;
}
