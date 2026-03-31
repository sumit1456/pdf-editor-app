/**
 * lineRenderUtils.js
 * SHARED UTILITIES FOR TEXT RENDERING
 * Provides color resolution, content mapping, and visual text formatting.
 */

/**
 * Resolves various color formats (PDF integer, RGB array, CSS string) to SVG-safe strings.
 */
export function getSVGColor(color, fallback = 'black') {
    if (!color && color !== 0) return fallback;

    // Handle PyMuPDF integer color (e.g. 16711680 for red)
    if (typeof color === 'number') {
        const r = (color >> 16) & 255;
        const g = (color >> 8) & 255;
        const b = color & 255;
        return `rgb(${r},${g},${b})`;
    }

    // Handle RGB Array [r, g, b] (0.0 to 1.0 or 0 to 255)
    if (Array.isArray(color)) {
        if (color.length === 3 || color.length === 4) {
            const isFloat = color.some(c => c > 0 && c <= 1.0);
            const r = Math.round(isFloat ? color[0] * 255 : color[0]);
            const g = Math.round(isFloat ? color[1] * 255 : color[1]);
            const b = Math.round(isFloat ? color[2] * 255 : color[2]);
            return `rgb(${r},${g},${b})`;
        }
    }

    if (typeof color === 'string') return color;
    return fallback;
}

/**
 * Maps special characters and identifies structural spans.
 */
export function mapContent(text) {
    if (!text) return '';
    return text
        .replace(/\u2022/g, '•')
        .replace(/\u2217/g, '∗')
        .replace(/\u22c6/g, '⋆')
        .replace(/\u2013/g, '–')
        .replace(/\u2014/g, '—');
}

/**
 * Determines if a span is "structural" (e.g. a bullet point or marker).
 */
export function isStructuralSpan(span) {
    if (!span || !span.text && !span.content) return false;
    const content = (span.text || span.content || '').trim();
    // Common bullet patterns
    const isBullet = /^[\u2022\u25E6\u25A0\u2023\u25B8\u2043\u2219\xB7\xD7\xBB\-\u2013\u2014]/.test(content);
    const isNumber = /^\d+[\.\)]\s*$/.test(content);
    return isBullet || isNumber;
}

/**
 * Renders text with optional small-caps or other visual modifications.
 */
export function renderVisualText(text, isSmallCaps = false, size = 10) {
    if (!text) return '';
    if (isSmallCaps) {
        // Simple small-caps mapping if font doesn't support it natively
        return text.toUpperCase();
    }
    return text;
}

/**
 * Renders text with word-level styling (used for editing transitions).
 */
export function renderWordStyledText(text, wordStyles = {}, baseStyle = {}, isSmallCaps = false, baseSize = 10, skipWords = 0) {
    if (!text) return '';
    const words = text.split(/(\s+)/);
    let wordCounter = 0;

    return words.map((word, i) => {
        if (!word.trim()) return word; // Preserve whitespace
        
        const currentWordIdx = wordCounter + skipWords;
        const style = wordStyles[currentWordIdx] || baseStyle;
        wordCounter++;

        const isModified = !!wordStyles[currentWordIdx];
        if (!isModified && !isSmallCaps) return word;

        return (
            <tspan 
                key={i}
                fontWeight={style.is_bold ? '700' : '400'}
                fontStyle={style.is_italic ? 'italic' : 'normal'}
                fontSize={style.size || baseSize}
            >
                {isSmallCaps ? word.toUpperCase() : word}
            </tspan>
        );
    });
}
