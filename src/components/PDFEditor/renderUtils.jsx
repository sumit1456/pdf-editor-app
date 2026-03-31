import React from 'react';
import { getWeightFromFont, normalizeFont } from './reflowUtils';

export const getSVGColor = (c, fallback = 'black') => {
    if (!c) return fallback;
    if (typeof c === 'string') return c; // Already a color string
    if (!Array.isArray(c)) return fallback;
    let r = 0, g = 0, b = 0;
    if (c.length === 3) { // RGB
        r = Math.round(c[0] * 255);
        g = Math.round(c[1] * 255);
        b = Math.round(c[2] * 255);
    } else if (c.length === 4) { // CMYK
        r = Math.round(255 * (1 - c[0]) * (1 - c[3]));
        g = Math.round(255 * (1 - c[1]) * (1 - c[3]));
        b = Math.round(255 * (1 - c[2]) * (1 - c[3]));
    } else if (c.length === 1) { // Gray
        r = Math.round(c[0] * 255);
        g = r; b = r;
    } else {
        return fallback;
    }
    return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Typographic Helper: Simulate Small-Caps in Preview
 * This allows the preview to accurately match the backend's high-fidelity rendering.
 */
export const renderVisualText = (text, isSmallCaps, baseSize) => {
    if (!isSmallCaps || !text) return text;

    // FIDELITY FIX: Manually simulate the backend's 0.75x scaling for Small Caps.
    // This provides much better consistency across browsers than CSS 'small-caps'.
    const chars = text.split('');
    return chars.map((char, i) => {
        const isLower = char === char.toLowerCase() && char !== char.toUpperCase();
        if (!isLower) return char;

        return (
            <tspan
                key={i}
                fontSize={Math.max(1, (baseSize || 10) * 0.75)}
                style={{ textTransform: 'uppercase' }}
            >
                {char.toUpperCase()}
            </tspan>
        );
    });
};

/**
 * Detects if a PDF span is a structural decoration — bullet, emoji, icon, symbol —
 * rather than readable text content. Uses Unicode heuristics instead of a hardcoded
 * character list, so it handles ■■, 🔹, ✅, →, FontAwesome icons, and anything else
 * without needing to be maintained.
 *
 * Rules:
 *   1. PUA range (U+E000–U+F8FF): icon fonts like FontAwesome
 *   2. Short content (≤4 chars) with NO letters from any script: symbols, emoji, arrows
 */
export const isStructuralSpan = (span) => {
    const raw = (span?.content || '').trim();
    if (!raw) return true;

    // Rule 1: Private Use Area — FontAwesome, icon fonts etc.
    if (/[\uE000-\uF8FF]/.test(raw)) return true;

    // Rule 2: Short AND contains no letter characters from any common script
    // Covers: •, ■■, →, ✓, ✅, 🔹 (emoji are ≤2 JS chars), –, *, ·, ❖, ▪ …
    if (raw.length <= 4) {
        const hasLetter = /[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF]/.test(raw);
        if (!hasLetter) return true;
    }

    return false;
};

/**
 * Renders word-level styled text as SVG <tspan> children.
 * @param {string} text - The text content to render
 * @param {object} wordStyles - Per-word style overrides keyed by word index
 * @param {object} safetyStyle - Base/fallback style for this line
 * @param {boolean} isSmallCaps - Whether the line uses small-caps
 * @param {number} baseSize - Fallback font size in pt
 * @param {number} [startOffset=0] - Word index offset into wordStyles.
 *   Use this when rendering only a SUFFIX of the line's content (e.g., the text
 *   after a structural bullet span that was split off and rendered separately).
 *   Without the offset, wordStyles[0] would point to the bullet's style instead
 *   of the first word of the suffix.
 */
export const renderWordStyledText = (text, wordStyles, safetyStyle, isSmallCaps, baseSize, startOffset = 0) => {
    if (!text) return text;

    // Split into words, preserving spaces
    const parts = text.split(/(\s+)/);
    // Start at the offset so we align with the correct wordStyles entries
    let wordCounter = startOffset;

    return parts.map((part, i) => {
        const isSpace = /^\s+$/.test(part);
        const style = (!isSpace && wordStyles?.[wordCounter]) ? wordStyles[wordCounter] : {};
        if (!isSpace) wordCounter++;

        const spanStyle = { ...safetyStyle, ...style };
        const spanIsSmallCaps = spanStyle.font_variant === 'small-caps' || isSmallCaps;
        const spanSize = Math.abs(spanStyle.size || baseSize);
        const spanColor = getSVGColor(spanStyle.color, 'inherit');
        const spanWeight = getWeightFromFont(spanStyle.font, spanStyle.is_bold);
        const spanItalic = spanStyle.is_italic ? 'italic' : 'normal';
        const spanFamily = normalizeFont(spanStyle.font, spanStyle.googleFont);

        return (
            <tspan
                key={i}
                fontSize={spanSize}
                fill={spanColor}
                fontWeight={spanWeight}
                fontStyle={spanItalic}
                fontFamily={spanFamily.replace(/'/g, "")}
                style={{
                    fontVariant: spanIsSmallCaps ? 'small-caps' : 'normal',
                    letterSpacing: 'normal'
                }}
            >
                {renderVisualText(part, spanIsSmallCaps, spanSize)}
            </tspan>
        );
    });
};

export const mapContent = (text) => {
    if (!text) return text;
    return text
        .replace(/\u00ad/g, '-') // Soft hyphen
        .replace(/\u25cf/g, '●') // Circle bullet
        .replace(/\u2022/g, '•').replace(/\u2217/g, '*').replace(/\u22c6/g, '*')
        .replace(/\u2013/g, '–').replace(/\u2014/g, '—')
        .replace(/\u0083/g, '\uf095').replace(/\u00a7/g, '\uf09b')
        .replace(/\u00ef/g, '\uf08c').replace(/\u00d0/g, '\uf121');
};
