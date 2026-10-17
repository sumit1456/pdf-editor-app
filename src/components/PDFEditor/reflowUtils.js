/**
 * SHARED TYPOGRAPHIC UTILITIES
 * Decoupled from React components to avoid Vite Fast Refresh issues.
 */
import { mapPdfFontFamily } from '../../utils/fontFamilyMapper';

export const MEASURE_CANVAS = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
export const MEASURE_CTX = MEASURE_CANVAS ? MEASURE_CANVAS.getContext('2d') : null;

/**
 * Normalizes font names to CSS-safe families, prioritizing Google Fonts.
 */
export const normalizeFont = (fontName, googleFont, forceOriginal = false) => {
    return mapPdfFontFamily(fontName, googleFont, { forceOriginal, cssVariables: true });
};

export const resolveFontFamily = (fontName, googleFont, forceOriginal = false) =>
    mapPdfFontFamily(fontName, googleFont, { forceOriginal, cssVariables: true });

export const GLOBAL_FONT_SCALE = 1;

/**
 * Returns a CSS font string for canvas measurements, resolving design tokens.
 */
export function getRealFontString(fontName, googleFont, weight, size, style, forceOriginal = false) {
    let family = normalizeFont(fontName, googleFont, forceOriginal);
    if (family.includes('var(--serif-latex)')) family = '"Source Serif 4", "Times New Roman", serif';
    else if (family.includes('var(--mono-code)')) family = '"Roboto Mono", "Courier New", monospace';
    else if (family.includes('var(--sans-modern)')) family = '"Inter", Arial, sans-serif';
    else if (family.includes('var(--serif-academic)')) family = '"Merriweather", serif';
    else if (family.includes('var(--serif-high-contrast)')) family = '"Playfair Display", serif';
    else if (family.includes('var(--sans-geometric)')) family = '"Poppins", sans-serif';
    else if (family.includes('var(--sans-readable)')) family = '"Open Sans", sans-serif';

    // Apply Global Reduction
    const adjustedSize = size / GLOBAL_FONT_SCALE;
    return `${style} ${weight} ${adjustedSize}px ${family}`;
}

export const getWeightFromFont = (font, isBold) => {
    if (isBold) return '700';
    if (!font) return '400';
    const name = font.toLowerCase().replace(/[_-]/g, "");
    if (name.includes('black') || name.includes('heavy')) return '900';
    if (name.includes('extrabold') || name.includes('ultrabold')) return '800';
    if (name.includes('bold')) return '700';
    if (name.includes('semibold') || name.includes('demibold') || name.includes('demi')) return '600';
    if (name.includes('medium')) return '500';
    if (name.includes('regular') || name.includes('book')) return '400';
    if (name.includes('light')) return '300';
    if (name.includes('extralight') || name.includes('thin')) return '200';
    return '400';
};
