/**
 * Matrix double-multiplication for PDF coordinate transformations.
 * [a, b, c, d, tx, ty]
 */
export const multiplyMatrices = (m1, m2) => {
    const res = [
        (m1[0] || 0) * (m2[0] || 0) + (m1[2] || 0) * (m2[1] || 0),
        (m1[1] || 0) * (m2[0] || 0) + (m1[3] || 0) * (m2[1] || 0),
        (m1[0] || 0) * (m2[2] || 0) + (m1[2] || 0) * (m2[3] || 0),
        (m1[1] || 0) * (m2[2] || 0) + (m1[3] || 0) * (m2[3] || 0),
        (m1[0] || 0) * (m2[4] || 0) + (m1[2] || 0) * (m2[5] || 0) + (m1[4] || 0),
        (m1[1] || 0) * (m2[4] || 0) + (m1[3] || 0) * (m2[5] || 0) + (m1[5] || 0)
    ];
    return res.map(v => isNaN(v) ? 0 : v);
};

/**
 * Applies a transformation matrix to a point (x, y) and converts to Web coordinates.
 */
export const applyTransform = (x, y, ctm, viewportHeight, scaleX = 1.0, scaleY = 1.0) => {
    const lx = parseFloat(x) || 0;
    const ly = parseFloat(y) || 0;

    const tx = lx * (ctm[0] || 0) + ly * (ctm[2] || 0) + (ctm[4] || 0);
    const ty = lx * (ctm[1] || 0) + ly * (ctm[3] || 0) + (ctm[5] || 0);

    let resX = tx * scaleX;
    let resY = (viewportHeight - ty) * scaleY;

    if (isNaN(resX)) resX = 0;
    if (isNaN(resY)) resY = 0;

    return { x: resX, y: resY };
};

/**
 * Robust color component sanitization.
 */
export const sanitizeColorComps = (args) => {
    return Array.from(args || []).map(c => {
        const n = parseFloat(c);
        return isNaN(n) ? 0 : n;
    });
};

/**
 * Converts PDF color components to Hex.
 */
export const compsToHex = (comps) => {
    let hex = '#000000';
    try {
        if (comps.length === 1) { // Gray
            const h = Math.round(Math.max(0, Math.min(1, comps[0])) * 255).toString(16).padStart(2, '0');
            hex = `#${h}${h}${h}`;
        } else if (comps.length === 3) { // RGB
            hex = `#${comps.map(c => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
        } else if (comps.length === 4) { // CMYK (Approx)
            const k = comps[3];
            const r = Math.round(255 * (1 - comps[0]) * (1 - k));
            const g = Math.round(255 * (1 - comps[1]) * (1 - k));
            const b = Math.round(255 * (1 - comps[2]) * (1 - k));
            hex = `#${Math.max(0, Math.min(255, r)).toString(16).padStart(2, '0')}${Math.max(0, Math.min(255, g)).toString(16).padStart(2, '0')}${Math.max(0, Math.min(255, b)).toString(16).padStart(2, '0')}`;
        }
    } catch (e) {
        hex = '#000000';
    }
    return hex;
};

/**
 * Utility to download a file from a string or object.
 */
export const downloadJSON = (data, filename = 'scene-graph.json') => {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
