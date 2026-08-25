export function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const text = String(value || '').trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
    }
    return result;
}
