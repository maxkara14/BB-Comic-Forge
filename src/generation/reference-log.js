export function referenceLogDetails(references = []) {
    const counts = { character: 0, style: 0, wardrobe: 0, previous: 0 };
    const images = references.map((ref, index) => {
        const role = ['style', 'wardrobe', 'previous'].includes(ref.kind) ? ref.kind : 'character';
        counts[role]++;
        return { image: index + 1, role };
    });
    return { referenceCount: images.length, counts, images };
}
