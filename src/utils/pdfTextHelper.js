/**
 * PDF Text Helper Service
 * Handles text measurement and scaling calculations for the PDF Editor.
 */

const MEASURE_CANVAS = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const MEASURE_CTX = MEASURE_CANVAS ? MEASURE_CANVAS.getContext('2d') : null;

/**
 * Normalizes font names to system/web-safe equivalents.
 */
export function getWeightFromFont(fontName, isBoldFlag) {
    if (!fontName) return isBoldFlag ? '700' : '400';
    const lower = fontName.toLowerCase();

    if (lower.includes('black') || lower.includes('heavy')) return '900';
    if (lower.includes('extrabold') || lower.includes('ultrabold')) return '800';
    if (lower.includes('bold')) return '700';
    if (lower.includes('semibold') || lower.includes('demibold')) return '600';
    if (lower.includes('medium')) return '500';
    if (lower.includes('light')) return '300';
    if (lower.includes('thin') || lower.includes('hairline')) return '100';

    return isBoldFlag ? '700' : '400';
}

export function normalizeFont(fontName, googleFont) {
    if (googleFont) return `'${googleFont}', sans-serif`;

    const font = (fontName || '').toLowerCase();
    if (font.includes('serif')) return 'serif';
    if (font.includes('mono')) return 'monospace';
    if (font.includes('sans')) return 'sans-serif';

    // LaTeX Fallbacks
    if (font.includes('cmr')) return 'var(--serif-latex)';
    if (font.includes('cmtt')) return 'var(--mono-code)';
    if (font.includes('cmss')) return 'var(--sans-modern)';

    return 'serif';
}

/**
 * Resolves CSS variables to real font strings for canvas measurement.
 */
export function getRealFontString(fontName, googleFont, weight, size, style) {
    let family = normalizeFont(fontName, googleFont);

    if (family.includes('var(--serif-latex)')) family = "'Source Serif 4', serif";
    else if (family.includes('var(--mono-code)')) family = "'Roboto Mono', monospace";
    else if (family.includes('var(--sans-modern)')) family = "'Inter', sans-serif";
    else if (family.includes('var(--serif-academic)')) family = "'Merriweather', serif";
    else if (family.includes('var(--serif-high-contrast)')) family = "'Playfair Display', serif";
    else if (family.includes('var(--sans-geometric)')) family = "'Poppins', sans-serif";
    else if (family.includes('var(--sans-readable)')) family = "'Open Sans', sans-serif";

    return `${style} ${weight} ${size}px ${family}`;
}

/**
 * Maps special characters and icons based on font context.
 */
export function mapContentToIcons(text, fontName) {
    if (!text) return text;
    const lowerFont = (fontName || '').toLowerCase();

    let mapped = text
        .replace(/\u2022/g, '•')  // Bullet
        .replace(/\u2217/g, '*')  // Mathematical Asterisk
        .replace(/\u22c6/g, '*')  // Star bullet
        .replace(/\u2013/g, '–')  // En-dash
        .replace(/\u2014/g, '—'); // Em-dash

    mapped = mapped
        .replace(/\u0083/g, '\uf095') // Phone
        .replace(/\u00a7/g, '\uf09b') // Github
        .replace(/\u00ef/g, '\uf08c') // LinkedIn
        .replace(/\u00d0/g, '\uf121'); // Code

    return mapped;
}

/**
 * Measures the width of a line of text spans.
 */
export function measureLineWidth(items, baseSize) {
    if (!MEASURE_CTX) return 0;

    let totalWidth = 0;
    items.forEach((item) => {
        const itemText = item.content || '';
        if (!itemText) return;

        const weight = item.is_bold ? '700' : '400';
        const style = item.is_italic ? 'italic' : 'normal';
        const size = Math.abs(item.size || baseSize);

        const mappedText = mapContentToIcons(itemText, item.font);
        const isIcon = /[\uf000-\uf999]/.test(mappedText);

        const fontString = isIcon
            ? `normal 900 ${size}px "Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif`
            : getRealFontString(item.font, item.google_font, weight, size, style);

        MEASURE_CTX.font = fontString;
        totalWidth += MEASURE_CTX.measureText(itemText).width;
    });

    return totalWidth;
}

/**
 * Calculates a fitting ratio for a line of text given a target width.
 */
export function calculateFitRatio(measuredWidth, targetWidth, options = {}) {
    if (measuredWidth <= 0 || targetWidth <= 0) return 1.0;

    const {
        minScale = 0.75,
        maxScale = 1.1,
        safetyCushion = 0.5
    } = options;

    const effectiveTarget = Math.max(1, targetWidth - safetyCushion);
    const ratio = effectiveTarget / measuredWidth;

    // Apply clamping policy
    return Math.min(maxScale, Math.max(minScale, ratio));
}
