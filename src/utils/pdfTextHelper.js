/**
 * PDF Text Helper Service
 * Handles text measurement and scaling calculations for the PDF Editor.
 */
import { mapPdfFontFamily } from './fontFamilyMapper';

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

export function normalizeFont(fontName, googleFont, forceOriginal = false) {
    return mapPdfFontFamily(fontName, googleFont, { forceOriginal });
}

/**
 * Resolves CSS variables to real font strings for canvas measurement.
 */
export function getRealFontString(fontName, googleFont, weight, size, style) {
    let family = normalizeFont(fontName, googleFont);

    if (family.includes('var(--serif-latex)')) family = '"Source Serif 4", "Times New Roman", serif';
    else if (family.includes('var(--mono-code)')) family = '"Roboto Mono", "Courier New", monospace';
    else if (family.includes('var(--sans-modern)')) family = '"Inter", Arial, sans-serif';
    else if (family.includes('var(--serif-academic)')) family = '"Merriweather", serif';
    else if (family.includes('var(--serif-high-contrast)')) family = '"Playfair Display", serif';
    else if (family.includes('var(--sans-geometric)')) family = '"Poppins", sans-serif';
    else if (family.includes('var(--sans-readable)')) family = '"Open Sans", sans-serif';

    return `${style} ${weight} ${size}px ${family}`;
}

const MOJIBAKE_REPAIRS = [
    ['â€¢', '•'], ['Â·', '·'], ['â—', '●'], ['â–ª', '▪'], ['â–«', '▫'],
    ['â– ', '■'], ['â–¡', '□'], ['â€“', '–'], ['â€”', '—'], ['âœ“', '✓'],
    ['âœ”', '✔'], ['âœ•', '✕'], ['âœ–', '✖'], ['â†’', '→']
];

const DINGBAT_GLYPHS = Object.freeze({
    // Must stay in parity with python-backend/server.py:ZAPFDINGBATS_MAP.
    I: '■', l: '●', m: '●', '#': '★', '\u0014': '✔', G: '●', H: '■',
    n: '▪', o: '□', F: '➤', E: '➢', y: '➡', P: '✓', Q: '✔', R: '✕',
    S: '✖', u: '♦', v: '❖', '(': '☎', '8': '✉', '<': '✈'
});

const FONT_AWESOME_GLYPHS = Object.freeze({
    '\u0083': '\uf095', // phone
    '#': '\uf0e0',       // envelope
    '\u00a7': '\uf09b', // GitHub
    '\u00ef': '\uf08c', // LinkedIn
    '\u00d0': '\uf121'  // code
});

export const isFontAwesomeFont = (fontName = '') =>
    /font\s*awesome|fontawesome|fa[-_ ](solid|regular|brands)/i.test(fontName);

export const isFontAwesomeBrandFont = (fontName = '') =>
    isFontAwesomeFont(fontName) && /brands/i.test(fontName);

export const getPdfGlyphFontWeight = (fontName, isBold = false, text = '') =>
    isFontAwesomeFont(fontName) && hasPrivateUseGlyph(text)
        ? (isFontAwesomeBrandFont(fontName) ? '400' : '900')
        : (isBold ? '700' : '400');

export const hasPrivateUseGlyph = (text = '') => /[\uE000-\uF8FF]/u.test(text);

export function normalizePdfSymbols(text, fontName = '') {
    if (!text) return text;

    let normalized = text.replaceAll('\u00ad', '-');
    for (const [broken, repaired] of MOJIBAKE_REPAIRS) {
        normalized = normalized.replaceAll(broken, repaired);
    }

    const font = fontName.toLowerCase().replace(/^[A-Z]{6}\+/, '');
    if (isFontAwesomeFont(font)) {
        return Array.from(normalized, char => FONT_AWESOME_GLYPHS[char] || char).join('');
    }

    if (/zapf|dingbat|wingdings|webdings|(^|\s)symbol($|\s)/i.test(font)) {
        return Array.from(normalized, char => DINGBAT_GLYPHS[char] || char).join('');
    }

    // Keep normal Unicode punctuation and private-use glyphs intact. Their
    // appearance depends on the source font, so generic substitutions distort it.
    return normalized;
}

/** Backwards-compatible name used by the renderers and measurement helpers. */
export const mapContentToIcons = normalizePdfSymbols;

export function getPdfGlyphFontFamily(text, fontName, googleFont, forceOriginal = false) {
    if (isFontAwesomeFont(fontName) && hasPrivateUseGlyph(text)) {
        return isFontAwesomeBrandFont(fontName)
            ? '"Font Awesome 6 Brands", "Font Awesome 6 Free", sans-serif'
            : '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif';
    }
    // The normalized Dingbats text is Unicode now; using ZapfDingbats as the
    // browser font reinterprets that Unicode codepoint as an encoded glyph and
    // can turn circles/squares into bars or tiny fallback marks.
    if (/zapf|dingbat|wingdings|webdings|(^|\\s)symbol($|\\s)/i.test(fontName || '') && !hasPrivateUseGlyph(text)) {
        return '"Inter", "Noto Sans Symbols", "Segoe UI Symbol", sans-serif';
    }
    if (hasPrivateUseGlyph(text) && fontName) return normalizeFont(fontName, googleFont, true);
    return normalizeFont(fontName, googleFont, forceOriginal);
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
        const isIcon = isFontAwesomeFont(item.font) && hasPrivateUseGlyph(mappedText);
        const iconWeight = getPdfGlyphFontWeight(item.font, item.is_bold, mappedText);

        const fontString = isIcon
            ? `normal ${iconWeight} ${size}px ${getPdfGlyphFontFamily(mappedText, item.font, item.google_font)}`
            : hasPrivateUseGlyph(mappedText)
                ? `${style} ${weight} ${size}px ${getPdfGlyphFontFamily(mappedText, item.font, item.google_font)}`
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
