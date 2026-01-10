/**
 * Detects bold/italic from PDF font names.
 */
const getFontMetadata = (fontName) => {
    const name = (fontName || '').toLowerCase();
    let fontWeight = 'normal';
    if (name.includes('bold') || name.includes('700') || name.includes('800') || name.includes('black') || name.includes('heavy') || name.includes('semibold') || name.includes('medium')) {
        fontWeight = (name.includes('medium') || name.includes('semibold')) ? '500' : 'bold';
    }
    let fontStyle = 'normal';
    if (name.includes('italic') || name.includes('oblique') || name.includes('-it')) {
        fontStyle = 'italic';
    }
    return { fontWeight, fontStyle };
};

export class TextProcessor {
    constructor(viewportHeight, scaleX = 1.0, scaleY = 1.0) {
        this.viewportHeight = viewportHeight;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
    }

    /**
     * Maps each PDF item directly to a TextLine fragment.
     * Absolute fragment mode for pixel-perfect positioning.
     */
    processItems(items, textContent) {
        const fragments = items.map((item, index) => {
            const originalFontSize = Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2) || 12;
            const fontSize = originalFontSize * this.scaleY;
            const x = item.transform[4] * this.scaleX;
            const baselineY = item.transform[5];

            // Apply Y-flip and scaling
            const y = (this.viewportHeight - baselineY - (originalFontSize * 0.82)) * this.scaleY;

            const meta = getFontMetadata(item.fontName);

            return {
                id: `frag_${index}`,
                type: 'TextLine',
                text: item.str,
                box: {
                    x,
                    y,
                    w: item.width * this.scaleX,
                    h: fontSize
                },
                style: {
                    fontFamily: item.fontName,
                    fallbackFamily: (textContent?.styles && textContent.styles[item.fontName]?.fontFamily) || 'sans-serif',
                    fontSize,
                    color: '#000000',
                    ...meta,
                    textAlign: 'left'
                }
            };
        }).filter(f => f.text.length > 0);

        // Bundle into blocks
        const blocks = [];
        const CHUNK_SIZE = 10;
        for (let i = 0; i < fragments.length; i += CHUNK_SIZE) {
            const chunk = fragments.slice(i, i + CHUNK_SIZE);
            const x = Math.min(...chunk.map(c => c.box.x));
            const y = Math.min(...chunk.map(c => c.box.y));
            const maxX = Math.max(...chunk.map(c => c.box.x + c.box.w));
            const maxY = Math.max(...chunk.map(c => c.box.y + c.box.h));

            blocks.push({
                id: `block_${i}`,
                type: 'TextBlock',
                box: { x, y, w: maxX - x, h: maxY - y },
                children: chunk
            });
        }

        return blocks;
    }

    /**
     * Refines text metrics based on DOM measurement if needed.
     */
    refineMetrics(lineNodes) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        return lineNodes.map(block => {
            const refinedChildren = block.children.map(line => {
                const fontStack = `"${line.style.fontFamily}", "${line.style.fallbackFamily}", sans-serif`;
                ctx.font = `${line.style.fontStyle} ${line.style.fontWeight} ${line.style.fontSize}px ${fontStack}`;

                const glyphs = [];
                let currentOffset = 0;
                for (let i = 0; i < line.text.length; i++) {
                    const char = line.text[i];
                    const charWidth = ctx.measureText(char).width;
                    glyphs.push({ char, x: currentOffset, w: charWidth });
                    currentOffset += charWidth;
                }

                return {
                    ...line,
                    glyphs,
                    box: { ...line.box, w: currentOffset }
                };
            });

            return {
                ...block,
                children: refinedChildren
            };
        });
    }
}
