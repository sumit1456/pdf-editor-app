// Build a valid Canvas font string
function buildFontString(weight, style, size, family) {
    const fWeight = weight || '400';
    const fStyle = style || 'normal';
    // Remove "pt" or "px" suffix if mixed type, add explicitly
    const fontStr = `${fStyle} ${fWeight} ${size}${typeof size === 'number' ? 'px' : ''} "${family}"`;
    return fontStr;
}

// Initialize a persistent hidden canvas for ultra-fast metric measurements in the DOM
let _offCanvas = null;
let _ctx = null;
function getCtx() {
    if (!_ctx) {
        _offCanvas = document.createElement('canvas');
        _ctx = _offCanvas.getContext('2d');
    }
    return _ctx;
}

// Measure total line width exactly as the Worker did, but using DOM Fonts
function measureLine(words, targetBaseSize, originalBaseSize) {
    let totalLineGridWidth = 0;
    const ctx = getCtx();

    words.forEach((word) => {
        // Stagger mixed font sizes if necessary
        const testSize = originalBaseSize > 0 ? targetBaseSize * (word.size / originalBaseSize) : targetBaseSize;
        const fontString = buildFontString(
            word.weight || (word.is_bold ? '700' : '400'),
            word.is_italic ? 'italic' : 'normal',
            testSize,
            word.google_font || word.font || 'serif'
        );

        ctx.font = fontString;
        const w = ctx.measureText(word.content || '').width;
        totalLineGridWidth += w;
    });

    return totalLineGridWidth;
}

// Synchronous DOM-based replacement for the binary search
export function fitLineToBbox(words, targetWidth) {
    if (!words || words.length === 0 || targetWidth <= 0) return null;

    const baseSize = words[0]?.size || 12;

    // Search strictly bounded, never exceeding the original size to prevent PDF absolute kerning issues
    let low = Math.max(0.1, baseSize - 2);
    let high = baseSize;
    let optimalSize = baseSize;
    let iterations = 0;

    const maxIterations = 100;
    const tolerance = 0.05;

    while (low <= high && iterations < maxIterations) {
        const midSize = (low + high) / 2;
        const midWidth = measureLine(words, midSize, baseSize);

        iterations++;

        if (midWidth <= targetWidth) {
            optimalSize = midSize;

            if (targetWidth - midWidth <= tolerance) {
                break;
            }

            low = midSize + 0.005;
        } else {
            high = midSize - 0.005;
        }
    }

    const initialWidth = measureLine(words, baseSize, baseSize);
    const finalWidth = measureLine(words, optimalSize, baseSize);

    // Compute the adjusted words array directly
    const results = words.map((word) => {
        const wordFittedSize = baseSize > 0 ? optimalSize * (word.size / baseSize) : optimalSize;
        return {
            id: word.id,
            content: word.content,
            originalSize: word.size || 12,
            optimalSize: wordFittedSize,
            fits: true
        };
    });

    const fullText = words.map(w => w.content).join('');

    console.log(`
[DOM FontFitEngine 🎯]
-------------------------------------------
Content:             "${fullText}"
BBox Target Width:    ${targetWidth.toFixed(2)}px
Old Text Width:       ${initialWidth.toFixed(2)}px
New Text Width:       ${finalWidth.toFixed(2)}px
Old Font Size:        ${baseSize.toFixed(2)}pt
New Font Size:        ${optimalSize.toFixed(2)}pt
`);

    return {
        results,
        summary: {
            optimalScale: optimalSize / baseSize
        }
    };
}
