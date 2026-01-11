/**
 * Utility to merge individual PDF text fragments into coherent lines.
 * Uses geometric proximity (Baseline Y and Horizontal X) to group items.
 */
export const mergeFragmentsIntoLines = (items) => {
    if (!items || items.length === 0) return [];

    const otherItems = items.filter(item => item.type !== 'text');
    let textItems = items.filter(item => item.type === 'text');
    if (textItems.length === 0) return items;

    // 0. De-duplication (PDF Shadow/Bold fragments)
    const seen = new Set();
    textItems = textItems.filter(item => {
        const key = `${item.content}-${Math.round(item.bbox?.[0] || 0)}-${Math.round(item.bbox?.[1] || 0)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // 1. Group by Baseline (Y)
    // We allow a small tolerance (2px) for baseline drift
    const groups = [];
    textItems.forEach(item => {
        const y = item.origin ? item.origin[1] : item.bbox[1];
        let foundGroup = groups.find(g => Math.abs(g.y - y) < 2);

        if (foundGroup) {
            foundGroup.items.push(item);
        } else {
            groups.push({ y, items: [item] });
        }
    });

    const lines = [];

    // 2. Process each baseline group
    groups.forEach(group => {
        // Sort items in group by X (left to right)
        group.items.sort((a, b) => {
            const ax = a.origin ? a.origin[0] : a.bbox[0];
            const bx = b.origin ? b.origin[0] : b.bbox[0];
            return ax - bx;
        });

        // 3. Sub-group by horizontal proximity (identify columns/breaks)
        let currentLine = null;

        group.items.forEach(item => {
            const x = item.origin ? item.origin[0] : item.bbox[0];
            const w = item.bbox[2] - item.bbox[0];

            if (!currentLine) {
                currentLine = {
                    id: item.id || `line-${item.origin?.[0] || 0}-${item.origin?.[1] || 0}`,
                    content: item.content,
                    bbox: [...item.bbox],
                    origin: item.origin ? [...item.origin] : null,
                    font: item.font,
                    size: item.size,
                    color: item.color,
                    matrix: item.matrix ? [...item.matrix] : null,
                    is_bold: item.is_bold,
                    is_italic: item.is_italic,
                    type: 'text',
                    items: [item] // Keep track of original fragments
                };
            } else {
                const prevItem = currentLine.items[currentLine.items.length - 1];
                const prevX1 = prevItem.bbox[2];
                const gap = x - prevX1;

                // If gap is too large (more than 3 spaces worth of font size), trigger a new line
                const threshold = Math.abs(currentLine.size) * 0.5;

                if (gap > threshold) {
                    lines.push(currentLine);
                    currentLine = {
                        id: item.id || `line-${item.origin?.[0] || 0}-${item.origin?.[1] || 0}`,
                        content: item.content,
                        bbox: [...item.bbox],
                        origin: item.origin ? [...item.origin] : null,
                        font: item.font,
                        size: item.size,
                        color: item.color,
                        matrix: item.matrix ? [...item.matrix] : null,
                        is_bold: item.is_bold,
                        is_italic: item.is_italic,
                        type: 'text',
                        items: [item]
                    };
                } else {
                    // Merge into current line
                    currentLine.content += (gap > 1 ? " " : "") + item.content;
                    currentLine.bbox[2] = Math.max(currentLine.bbox[2], item.bbox[2]);
                    currentLine.bbox[3] = Math.max(currentLine.bbox[3], item.bbox[3]);
                    currentLine.items.push(item);
                }
            }
        });

        if (currentLine) lines.push(currentLine);
    });

    const sortedLines = lines.sort((a, b) => b.bbox[1] - a.bbox[1]); // Descending Y = Top-to-Bottom

    // Return combined list: Other items (bg) + Merged Lines
    return [...otherItems, ...sortedLines];
};
