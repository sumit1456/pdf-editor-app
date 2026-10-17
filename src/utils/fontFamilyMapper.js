const FALLBACKS = {
    sans: ', Inter, Arial, sans-serif',
    serif: ', "Times New Roman", serif',
    mono: ', "Courier New", monospace',
    cursive: ', cursive'
};

const FAMILIES = [
    ['source serif 4', 'Source Serif 4', 'serif'],
    ['libre baskerville', 'Libre Baskerville', 'serif'],
    ['playfair display', 'Playfair Display', 'serif'],
    ['merriweather', 'Merriweather', 'serif'],
    ['crimson pro', 'Crimson Pro', 'serif'],
    ['lora', 'Lora', 'serif'],
    ['pt serif', 'PT Serif', 'serif'],
    ['times new roman', 'Source Serif 4', 'serif'],
    ['times', 'Source Serif 4', 'serif'],
    ['liberation serif', 'Source Serif 4', 'serif'],
    ['computer modern', 'Source Serif 4', 'serif'],
    ['latin modern roman', 'Source Serif 4', 'serif'],
    ['roboto mono', 'Roboto Mono', 'mono'],
    ['jetbrains mono', 'JetBrains Mono', 'mono'],
    ['fira code', 'Fira Code', 'mono'],
    ['courier new', 'Courier New', 'mono'],
    ['courier', 'Courier New', 'mono'],
    ['consolas', 'Roboto Mono', 'mono'],
    ['open sans', 'Open Sans', 'sans'],
    ['pt sans', 'PT Sans', 'sans'],
    ['montserrat', 'Montserrat', 'sans'],
    ['poppins', 'Poppins', 'sans'],
    ['roboto', 'Roboto', 'sans'],
    ['inter', 'Inter', 'sans'],
    ['calibri', 'Inter', 'sans'],
    ['arial', 'Inter', 'sans'],
    ['helvetica', 'Inter', 'sans'],
    ['aptos', 'Inter', 'sans'],
    ['verdana', 'Inter', 'sans'],
    ['tahoma', 'Inter', 'sans'],
    ['ubuntu', 'Ubuntu', 'sans'],
    ['oswald', 'Oswald', 'sans'],
    ['dancing script', 'Dancing Script', 'cursive'],
    ['orbitron', 'Orbitron', 'sans']
];

/**
 * Resolve PDF and web font names consistently across browser renderers.
 * PDF subset prefixes (ABCDEF+) are transport metadata, not part of a family.
 * Unknown names are preserved so embedded/custom faces can still be selected.
 */
export function cleanPdfFontName(fontName = '') {
    if (fontName === null || fontName === undefined) return '';
    return String(fontName)
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/^[A-Z]{6}\+/, '')
        .replace(/\s+/g, ' ');
}

export function mapPdfFontFamily(fontName, googleFont, { forceOriginal = false, cssVariables = false } = {}) {
    const original = cleanPdfFontName(fontName);
    if (forceOriginal && original) return `"${original}"${FALLBACKS.sans}`;
    // A subset-prefixed PDF font is the closest available representation of
    // the source face. Keep its family name so an embedded @font-face can match.
    if (/^[A-Z]{6}\+/.test(String(fontName || '')) && original) {
        return `"${original}"${FALLBACKS.sans}`;
    }

    const requested = cleanPdfFontName(googleFont) || original;
    const lower = requested.toLowerCase().replace(/[_-]/g, ' ');
    const match = FAMILIES.find(([needle]) => lower.includes(needle));
    if (match) {
        const [, family, kind] = match;
        if (cssVariables) {
            if (kind === 'mono') return "var(--mono-code)" + FALLBACKS.mono;
            if (kind === 'serif') return "var(--serif-latex)" + FALLBACKS.serif;
            if (family === 'Merriweather') return "var(--serif-academic)" + FALLBACKS.serif;
            if (family === 'Playfair Display') return "var(--serif-high-contrast)" + FALLBACKS.serif;
            if (family === 'Poppins') return "var(--sans-geometric)" + FALLBACKS.sans;
            if (family === 'Open Sans') return "var(--sans-readable)" + FALLBACKS.sans;
        }
        return `"${family}"${FALLBACKS[kind]}`;
    }

    if (!requested) return `"Source Serif 4"${FALLBACKS.serif}`;
    if (/mono|courier|consolas|console|cmtt/i.test(lower)) {
        return cssVariables ? `var(--mono-code)${FALLBACKS.mono}` : `"Roboto Mono"${FALLBACKS.mono}`;
    }
    if (/serif|roman|cmr|sfrm|nimbus|georgia|palatino|baskerville|cambria|garamond|libertine|antiqua|didot/i.test(lower)) {
        return cssVariables ? `var(--serif-latex)${FALLBACKS.serif}` : `"Source Serif 4"${FALLBACKS.serif}`;
    }

    // Preserve the extracted family name (including unknown embedded font names).
    return `"${original || requested}"${FALLBACKS.sans}`;
}
