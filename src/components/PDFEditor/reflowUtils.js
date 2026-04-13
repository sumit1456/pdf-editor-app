/**
 * SHARED TYPOGRAPHIC UTILITIES
 * Decoupled from React components to avoid Vite Fast Refresh issues.
 */

export const MEASURE_CANVAS = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
export const MEASURE_CTX = MEASURE_CANVAS ? MEASURE_CANVAS.getContext('2d') : null;

/**
 * Normalizes font names to CSS-safe families, prioritizing Google Fonts.
 */
export const normalizeFont = (fontName, googleFont, forceOriginal = false) => {
    if (forceOriginal && fontName) return fontName;
    if (googleFont) {
        const gf = googleFont.toLowerCase();
        if (gf.includes('inter')) return "'Inter', sans-serif";
        if (gf.includes('source serif')) return "'Source Serif 4', serif";
        if (gf.includes('roboto')) return "'Roboto', sans-serif";
        if (gf.includes('open sans')) return "'Open Sans', sans-serif";
        if (gf.includes('montserrat')) return "'Montserrat', sans-serif";
        if (gf.includes('lora')) return "'Lora', serif";
        if (gf.includes('merriweather')) return "'Merriweather', serif";
        if (gf.includes('libre baskerville')) return "'Libre Baskerville', serif";
        if (gf.includes('playfair display')) return "'Playfair Display', serif";
        if (gf.includes('oswald')) return "'Oswald', sans-serif";
        if (gf.includes('roboto mono')) return "'Roboto Mono', monospace";
        if (gf.includes('jetbrains mono')) return "'JetBrains Mono', monospace";
        if (gf.includes('fira code')) return "'Fira Code', monospace";
        if (gf.includes('poppins')) return "'Poppins', sans-serif";
        if (gf.includes('crimson pro')) return "'Crimson Pro', serif";
        if (gf.includes('dancing script')) return "'Dancing Script', cursive";
        if (gf.includes('orbitron')) return "'Orbitron', sans-serif";
        if (gf.includes('pt serif')) return "'PT Serif', serif";
        if (gf.includes('pt sans')) return "'PT Sans', sans-serif";
        if (gf.includes('ubuntu')) return "'Ubuntu', sans-serif";
    }

    if (!fontName) return "'Source Serif 4', serif";
    const name = fontName.toLowerCase();

    if (name === 'inter') return "'Inter', sans-serif";
    if (name === 'roboto') return "'Roboto', sans-serif";
    if (name === 'open sans') return "'Open Sans', sans-serif";
    if (name.includes('montserrat')) return "'Montserrat', sans-serif";
    if (name.includes('lora')) return "'Lora', serif";
    if (name.includes('merriweather')) return "'Merriweather', serif";
    if (name.includes('libre baskerville')) return "'Libre Baskerville', serif";
    if (name.includes('playfair display')) return "'Playfair Display', serif";
    if (name === 'oswald') return "'Oswald', sans-serif";
    if (name === 'roboto mono') return "'Roboto Mono', monospace";
    if (name === 'jetbrains mono') return "'JetBrains Mono', monospace";
    if (name === 'fira code') return "'Fira Code', monospace";
    if (name === 'source serif 4') return "'Source Serif 4', serif";
    if (name === 'poppins') return "'Poppins', sans-serif";

    if (name.includes('mono') || name.includes('courier') || name.includes('consolas') || name.includes('lucida console')) {
        return 'var(--mono-code)';
    }

    if (
        name.includes('times') || name.includes('serif') || name.includes('roman') ||
        name.includes('cm') || name.includes('sfrm') || name.includes('nimbus') ||
        name.includes('georgia') || name.includes('palatino') || name.includes('minion') ||
        name.includes('baskerville') || name.includes('cambria') || name.includes('garamond') ||
        name.includes('libertine') || name.includes('antiqua') || name.includes('didot')
    ) {
        if (name.includes('merriweather')) return 'var(--serif-academic)';
        if (name.includes('playfair')) return 'var(--serif-high-contrast)';
        return "var(--serif-latex)";
    }

    if (
        name.includes('inter') || name.includes('poppins') || name.includes('sans') ||
        name.includes('arial') || name.includes('helvetica') || name.includes('calibri') ||
        name.includes('verdana') || name.includes('tahoma') || name.includes('ubuntu') ||
        name.includes('geometric') || name.includes('modern')
    ) {
        if (name.includes('poppins')) return 'var(--sans-geometric)';
        if (name.includes('open') && name.includes('sans')) return 'var(--sans-readable)';
        return 'var(--sans-modern)';
    }

    return 'var(--sans-modern)';
};

export const GLOBAL_FONT_SCALE = 1;

/**
 * Returns a CSS font string for canvas measurements, resolving design tokens.
 */
export function getRealFontString(fontName, googleFont, weight, size, style, forceOriginal = false) {
    let family = normalizeFont(fontName, googleFont, forceOriginal);
    if (family.includes('var(--serif-latex)')) family = "'Source Serif 4', serif";
    else if (family.includes('var(--mono-code)')) family = "'Roboto Mono', monospace";
    else if (family.includes('var(--sans-modern)')) family = "'Inter', sans-serif";
    else if (family.includes('var(--serif-academic)')) family = "'Merriweather', serif";
    else if (family.includes('var(--serif-high-contrast)')) family = "'Playfair Display', serif";
    else if (family.includes('var(--sans-geometric)')) family = "'Poppins', sans-serif";
    else if (family.includes('var(--sans-readable)')) family = "'Open Sans', sans-serif";

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
