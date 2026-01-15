/**
 * ReflowEngine.js
 * Implements the Greedy Line Breaking algorithm using harvested PDF font metrics.
 */

export class ReflowEngine {
    constructor(fonts) {
        this.fonts = fonts; // Array of {name, metrics: {widths, ascender, descender}}
    }

    /**
     * Re-calculates lines for a semantic block based on new text content.
     */
    reflowBlock(block, newText) {
        const fontName = block.style.font;
        const fontSize = block.style.size;
        const fontData = this.fonts.find(f => f.name === fontName);

        if (!fontData || !fontData.metrics) {
            console.warn(`[ReflowEngine] No metrics found for font: ${fontName}. Falling back to estimate.`);
            return this._estimateReflow(block, newText);
        }

        const metrics = fontData.metrics;
        const maxWidth = block.bbox[2] - block.bbox[0];
        const indentX = block.indentX;
        const textX = block.textX || indentX; // Secondary indent for wrapped lines

        const words = newText.split(/(\s+)/); // Keep whitespace
        const newLines = [];
        let currentLineText = "";
        let currentLineWidth = 0;
        let currentY = block.lines[0].y; // Start at original first line Y
        const lineHeight = fontSize * 1.2; // Strategy-based vertical spacing

        const getCharWidth = (char) => {
            const w100 = metrics.widths[char] || metrics.widths[' '] || 50;
            return (w100 / 100) * fontSize;
        };

        const getWordWidth = (word) => {
            return word.split('').reduce((acc, char) => acc + getCharWidth(char), 0);
        };

        for (let word of words) {
            const wordWidth = getWordWidth(word);
            const isMarkerLine = newLines.length === 0 && block.type === 'list-item';
            const availableWidth = isMarkerLine ? (block.bbox[2] - textX) : (block.bbox[2] - textX);

            // Check if word fits on current line
            if (currentLineWidth + wordWidth > availableWidth && currentLineText !== "") {
                // Flush line
                newLines.push({
                    content: currentLineText.trimEnd(),
                    y: currentY,
                    items: this._createItemsFromLine(currentLineText.trimEnd(), textX, currentY, block.style)
                });

                currentLineText = word.trimStart(); // Start new line (strip leading space of break)
                currentLineWidth = getWordWidth(word.trimStart());
                currentY += lineHeight;
            } else {
                currentLineText += word;
                currentLineWidth += wordWidth;
            }
        }

        // Flush final line
        if (currentLineText) {
            newLines.push({
                content: currentLineText,
                y: currentY,
                items: this._createItemsFromLine(currentLineText, (newLines.length === 0 ? indentX : textX), currentY, block.style)
            });
        }

        return newLines;
    }

    _createItemsFromLine(text, startX, y, style) {
        // Creates a single text item/fragment for the new line
        // Future: Handle mixed styles within block
        return [{
            id: `reflow-${Math.random().toString(36).substr(2, 9)}`,
            type: 'text',
            content: text,
            origin: [startX, y],
            bbox: [startX, y - style.size, startX + 100, y], // Estimated X1, will be refined by renderer
            size: style.size,
            font: style.font
        }];
    }

    _estimateReflow(block, newText) {
        // Fallback using average character width (approx 0.5 of font size for serif/sans)
        console.log("[ReflowEngine] Using Estimation Fallback for block:", block.id);

        const fontSize = block.style.size;
        const avgCharWidth = fontSize * 0.5;
        const maxWidth = block.bbox[2] - block.bbox[0];
        const indentX = block.indentX;
        const textX = block.textX || indentX;

        const words = newText.split(/(\s+)/);
        const newLines = [];
        let currentLineText = "";
        let currentLineWidth = 0;
        let currentY = (block.lines[0] && block.lines[0].y) || block.bbox[1] + fontSize;
        const lineHeight = fontSize * 1.25;

        for (let word of words) {
            const wordWidth = word.length * avgCharWidth;
            const availableWidth = (newLines.length === 0) ? (block.bbox[2] - indentX) : (block.bbox[2] - textX);

            if (currentLineWidth + wordWidth > availableWidth && currentLineText !== "") {
                newLines.push({
                    content: currentLineText.trimEnd(),
                    y: currentY,
                    items: this._createItemsFromLine(currentLineText.trimEnd(), (newLines.length === 0 ? indentX : textX), currentY, block.style)
                });
                currentLineText = word.trimStart();
                currentLineWidth = word.trimStart().length * avgCharWidth;
                currentY += lineHeight;
            } else {
                currentLineText += word;
                currentLineWidth += wordWidth;
            }
        }

        if (currentLineText) {
            newLines.push({
                content: currentLineText,
                y: currentY,
                items: this._createItemsFromLine(currentLineText, (newLines.length === 0 ? indentX : textX), currentY, block.style)
            });
        }

        return newLines;
    }
}
