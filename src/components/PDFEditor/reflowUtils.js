/**
 * SHARED TYPOGRAPHIC UTILITIES
 * Decoupled from React components to avoid Vite Fast Refresh issues.
 */

export const MEASURE_CANVAS = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
export const MEASURE_CTX = MEASURE_CANVAS ? MEASURE_CANVAS.getContext('2d') : null;

/**
 * Normalizes font names to CSS-safe families, prioritizing Google Fonts.
 */
const SYMBOL_FALLBACK = ", 'Noto Sans', 'Noto Sans Symbols', 'Noto Sans Symbols 2', 'Noto Sans Arabic', 'Noto Sans Hebrew', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif";

export const normalizeFont = (fontName, googleFont, forceOriginal = false) => {
    if (forceOriginal && fontName) return fontName;
    if (googleFont) {
        const gf = googleFont.toLowerCase();
        if (gf.includes('inter')) return "'Inter'" + SYMBOL_FALLBACK;
        if (gf.includes('source serif')) return "'Source Serif 4'" + SYMBOL_FALLBACK;
        if (gf.includes('roboto')) return "'Roboto'" + SYMBOL_FALLBACK;
        if (gf.includes('open sans')) return "'Open Sans'" + SYMBOL_FALLBACK;
        if (gf.includes('montserrat')) return "'Montserrat'" + SYMBOL_FALLBACK;
        if (gf.includes('lora')) return "'Lora'" + SYMBOL_FALLBACK;
        if (gf.includes('merriweather')) return "'Merriweather'" + SYMBOL_FALLBACK;
        if (gf.includes('libre baskerville')) return "'Libre Baskerville'" + SYMBOL_FALLBACK;
        if (gf.includes('playfair display')) return "'Playfair Display'" + SYMBOL_FALLBACK;
        if (gf.includes('oswald')) return "'Oswald'" + SYMBOL_FALLBACK;
        if (gf.includes('roboto mono')) return "'Roboto Mono'" + SYMBOL_FALLBACK;
        if (gf.includes('jetbrains mono')) return "'JetBrains Mono'" + SYMBOL_FALLBACK;
        if (gf.includes('fira code')) return "'Fira Code'" + SYMBOL_FALLBACK;
        if (gf.includes('poppins')) return "'Poppins'" + SYMBOL_FALLBACK;
        if (gf.includes('crimson pro')) return "'Crimson Pro'" + SYMBOL_FALLBACK;
        if (gf.includes('dancing script')) return "'Dancing Script'" + SYMBOL_FALLBACK;
        if (gf.includes('orbitron')) return "'Orbitron'" + SYMBOL_FALLBACK;
        if (gf.includes('pt serif')) return "'PT Serif'" + SYMBOL_FALLBACK;
        if (gf.includes('pt sans')) return "'PT Sans'" + SYMBOL_FALLBACK;
        if (gf.includes('ubuntu')) return "'Ubuntu'" + SYMBOL_FALLBACK;
    }

    if (!fontName) return "'Source Serif 4'" + SYMBOL_FALLBACK;
    const name = fontName.toLowerCase();

    if (name === 'inter') return "'Inter'" + SYMBOL_FALLBACK;
    if (name === 'roboto') return "'Roboto'" + SYMBOL_FALLBACK;
    if (name === 'open sans') return "'Open Sans'" + SYMBOL_FALLBACK;
    if (name.includes('montserrat')) return "'Montserrat'" + SYMBOL_FALLBACK;
    if (name.includes('lora')) return "'Lora'" + SYMBOL_FALLBACK;
    if (name.includes('merriweather')) return "'Merriweather'" + SYMBOL_FALLBACK;
    if (name.includes('libre baskerville')) return "'Libre Baskerville'" + SYMBOL_FALLBACK;
    if (name.includes('playfair display')) return "'Playfair Display'" + SYMBOL_FALLBACK;
    if (name === 'oswald') return "'Oswald'" + SYMBOL_FALLBACK;
    if (name === 'roboto mono') return "'Roboto Mono'" + SYMBOL_FALLBACK;
    if (name === 'jetbrains mono') return "'JetBrains Mono'" + SYMBOL_FALLBACK;
    if (name === 'fira code') return "'Fira Code'" + SYMBOL_FALLBACK;
    if (name === 'source serif 4') return "'Source Serif 4'" + SYMBOL_FALLBACK;
    if (name === 'poppins') return "'Poppins'" + SYMBOL_FALLBACK;

    if (name.includes('mono') || name.includes('courier') || name.includes('consolas') || name.includes('lucida console')) {
        return 'var(--mono-code)' + SYMBOL_FALLBACK;
    }

    if (
        name.includes('times') || name.includes('serif') || name.includes('roman') ||
        name.includes('cm') || name.includes('sfrm') || name.includes('nimbus') ||
        name.includes('georgia') || name.includes('palatino') || name.includes('minion') ||
        name.includes('baskerville') || name.includes('cambria') || name.includes('garamond') ||
        name.includes('libertine') || name.includes('antiqua') || name.includes('didot')
    ) {
        if (name.includes('merriweather')) return 'var(--serif-academic)' + SYMBOL_FALLBACK;
        if (name.includes('playfair')) return 'var(--serif-high-contrast)' + SYMBOL_FALLBACK;
        return "var(--serif-latex)" + SYMBOL_FALLBACK;
    }

    if (
        name.includes('inter') || name.includes('poppins') || name.includes('sans') ||
        name.includes('arial') || name.includes('helvetica') || name.includes('calibri') ||
        name.includes('verdana') || name.includes('tahoma') || name.includes('ubuntu') ||
        name.includes('geometric') || name.includes('modern')
    ) {
        if (name.includes('poppins')) return 'var(--sans-geometric)' + SYMBOL_FALLBACK;
        if (name.includes('open') && name.includes('sans')) return 'var(--sans-readable)' + SYMBOL_FALLBACK;
        return 'var(--sans-modern)' + SYMBOL_FALLBACK;
    }

    return 'var(--sans-modern)' + SYMBOL_FALLBACK;
};

export const GLOBAL_FONT_SCALE = 1;

/**
 * Returns a CSS font string for canvas measurements, resolving design tokens.
 */
export function getRealFontString(fontName, googleFont, weight, size, style, forceOriginal = false) {
    let family = normalizeFont(fontName, googleFont, forceOriginal);
    if (family.includes('var(--serif-latex)')) family = "'Source Serif 4'" + SYMBOL_FALLBACK;
    else if (family.includes('var(--mono-code)')) family = "'Roboto Mono'" + SYMBOL_FALLBACK;
    else if (family.includes('var(--sans-modern)')) family = "'Inter'" + SYMBOL_FALLBACK;
    else if (family.includes('var(--serif-academic)')) family = "'Merriweather'" + SYMBOL_FALLBACK;
    else if (family.includes('var(--serif-high-contrast)')) family = "'Playfair Display'" + SYMBOL_FALLBACK;
    else if (family.includes('var(--sans-geometric)')) family = "'Poppins'" + SYMBOL_FALLBACK;
    else if (family.includes('var(--sans-readable)')) family = "'Open Sans'" + SYMBOL_FALLBACK;

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
