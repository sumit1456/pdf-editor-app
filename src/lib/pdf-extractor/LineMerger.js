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
    // First, exact matches by content and rounded position
    const seen = new Set();
    textItems = textItems.filter(item => {
        const key = `${item.content}-${Math.round(item.bbox?.[0] || 0)}-${Math.round(item.bbox?.[1] || 0)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Second, aggressive overlap detection (Substrings at similar positions)
    // Sort by content length (longest first) so we keep the most complete fragments
    textItems.sort((a, b) => (b.content?.length || 0) - (a.content?.length || 0));

    const finalItems = [];
    textItems.forEach(item => {
        const isDuplicate = finalItems.some(existing => {
            // Check if item's bbox is mostly contained within existing
            const [ix0, iy0, ix1, iy1] = item.bbox;
            const [ex0, ey0, ex1, ey1] = existing.bbox;

            // Check vertical overlap (tolerance 3px)
            const vOverlap = Math.abs(iy0 - ey0) < 3 && Math.abs(iy1 - ey1) < 3;
            // Check if item is a substring of existing
            const isSubstring = existing.content.includes(item.content);

            // Intersection percentage
            const interX0 = Math.max(ix0, ex0);
            const interX1 = Math.min(ix1, ex1);
            const interWidth = Math.max(0, interX1 - interX0);
            const itemWidth = ix1 - ix0;
            const coverage = itemWidth > 0 ? interWidth / itemWidth : 1;

            return vOverlap && isSubstring && coverage > 0.8;
        });

        if (!isDuplicate) {
            finalItems.push(item);
        }
    });
    textItems = finalItems;

    // 1. Group by Baseline (Y) - The source of truth for a visual "row"
    const groupsMap = new Map(); // Key: Rounded baseline Y

    textItems.forEach(item => {
        const y = item.origin ? item.origin[1] : item.bbox[1];
        const roundedY = Math.round(y * 2) / 2; // 0.5px precision to group slightly jittery baselines

        // Find existing group with similar Y (tolerance 2px)
        let groupKey = roundedY;
        for (const existingY of groupsMap.keys()) {
            if (Math.abs(existingY - y) < 2) {
                groupKey = existingY;
                break;
            }
        }

        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
                y: y,
                items: []
            });
        }
        groupsMap.get(groupKey).items.push(item);
    });

    const groups = Array.from(groupsMap.values());
    const lines = [];

    // 2. Process each horizontal group with STYLE-AWARE merging
    groups.forEach(group => {
        // Sort items in group by X (left to right)
        group.items.sort((a, b) => {
            const ax = a.origin ? a.origin[0] : a.bbox[0];
            const bx = b.origin ? b.origin[0] : b.bbox[0];
            return ax - bx;
        });

        if (group.items.length === 0) return;

        let currentSubGroup = [];

        const flushLine = () => {
            if (currentSubGroup.length === 0) return;
            const first = currentSubGroup[0];
            const line = {
                // Combine original ID with geometric data to ensure uniqueness if we split a backend line
                id: (first.line_id || first.id || "line") + `-${Math.round(first.x)}-${Math.round(first.y)}`,
                content: currentSubGroup.map(it => it.content).join(""),
                x: first.x,
                y: first.y,
                bbox: [...first.bbox],
                origin: first.origin ? [...first.origin] : null,
                font: first.font,
                size: first.size,
                color: first.color,
                is_bold: first.is_bold,
                is_italic: first.is_italic,
                type: 'text',
                items: [...currentSubGroup]
            };

            // Calculate total bbox for the sub-group
            currentSubGroup.forEach(it => {
                line.bbox[0] = Math.min(line.bbox[0], it.bbox[0]);
                line.bbox[1] = Math.min(line.bbox[1], it.bbox[1]);
                line.bbox[2] = Math.max(line.bbox[2], it.bbox[2]);
                line.bbox[3] = Math.max(line.bbox[3], it.bbox[3]);
            });
            line.width = line.bbox[2] - line.bbox[0];
            line.height = line.bbox[3] - line.bbox[1];

            lines.push(line);
            currentSubGroup = [];
        };

        group.items.forEach((item, idx) => {
            if (idx === 0) {
                currentSubGroup.push(item);
            } else {
                const prev = group.items[idx - 1];
                const styleChanged = item.font !== prev.font ||
                    Math.abs(item.size - prev.size) > 0.1 ||
                    item.is_bold !== prev.is_bold ||
                    item.is_italic !== prev.is_italic;

                // Also split on significant horizontal gaps (> 25px) to keep columns distinct
                const currentX = item.origin ? item.origin[0] : item.bbox[0];
                const prevX1 = prev.bbox[2];
                const isGap = (currentX - prevX1) > 25;

                if (styleChanged || isGap) {
                    flushLine();
                }
                currentSubGroup.push(item);
            }
        });

        flushLine();
    });

    const sortedLines = lines.sort((a, b) => {
        const ay = a.origin ? a.origin[1] : a.bbox[1];
        const by = b.origin ? b.origin[1] : b.bbox[1];
        return by - ay; // Highest PDF Y = Visual Top (Original logic)
    });

    // Return combined list: Other items (bg) + Merged Lines
    return [...otherItems, ...sortedLines];
};
