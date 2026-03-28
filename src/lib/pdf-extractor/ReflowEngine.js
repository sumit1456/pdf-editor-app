/**
 * ReflowEngine.js
 * Implements paragraph-level reflow logic when toggled ON.
 */

export class ReflowEngine {
    constructor(fonts) {
        this.fonts = fonts || [];
    }

    /**
     * Re-calculates lines for a semantic block based on new text content.
     */
    reflowBlock(block, newText) {
        const blockId = block.id || 'anonymous';
        const fontName = block.style?.font;
        const fontSize = block.style?.size || 12;
        const fontData = this.fonts.find(f => f.name === fontName);

        // Fallback for missing metrics
        if (!fontData || !fontData.metrics) {
            return this._estimateReflow(block, newText);
        }

        const metrics = fontData.metrics;
        const maxWidth = block.bbox ? (block.bbox[2] - block.bbox[0]) : 500;
        const indentX = block.indentX !== undefined ? block.indentX : (block.bbox ? block.bbox[0] : 0);
        const textX = block.textX !== undefined ? block.textX : indentX;

        const words = newText.split(/(\s+)/);
        const newLines = [];
        let currentLineText = "";
        let currentLineWidth = 0;
        let currentY = (block.lines && block.lines[0]) ? block.lines[0].y : (block.bbox ? block.bbox[1] : 0);
        const lineHeight = fontSize * 1.2;

        const getCharWidth = (char) => {
            const w = metrics.widths[char] || metrics.widths[' '] || 500;
            // PDF font widths are usually per 1000 units
            return (w / 1000) * fontSize;
        };

        const getWordWidth = (word) => {
            return word.split('').reduce((acc, char) => acc + getCharWidth(char), 0);
        };

        for (let word of words) {
            if (!word) continue;
            const wordWidth = getWordWidth(word);
            
            // On the first line, we use the remaining width from indentX
            // On subsequent lines, we use the remaining width from textX (for list indents, etc.)
            const currentLineIndent = (newLines.length === 0) ? indentX : textX;
            const availableWidth = block.bbox ? (block.bbox[2] - currentLineIndent) : (300 - currentLineIndent);
            
            console.error(`[Reflow Debug] Word: "${word}" Width: ${wordWidth.toFixed(2)} / Avail: ${availableWidth.toFixed(2)} / LineW: ${currentLineWidth.toFixed(2)}`);

            if (currentLineWidth + wordWidth > availableWidth && currentLineText !== "") {
                // Flush current line
                const lineItems = this._createItemsFromLine(currentLineText.trimEnd(), currentLineIndent, currentY, block.style, blockId);
                const boxWidth = block.bbox ? (block.bbox[2] - block.bbox[0]) : 300;
                newLines.push({
                    content: currentLineText.trimEnd(),
                    y: currentY,
                    id: `reflow-${blockId}-${newLines.length}`,
                    blockId: blockId,
                    items: lineItems,
                    bbox: [lineItems[0].bbox[0], lineItems[0].bbox[1], lineItems[0].bbox[0] + boxWidth, lineItems[0].bbox[3]]
                });
                
                // Start new line
                currentLineText = word.trimStart();
                currentLineWidth = getWordWidth(currentLineText);
                currentY += lineHeight;
            } else {
                currentLineText += word;
                currentLineWidth += wordWidth;
            }
        }

        // Flush final line
        if (currentLineText) {
            const currentLineIndent = (newLines.length === 0) ? indentX : textX;
            const lineItems = this._createItemsFromLine(currentLineText, currentLineIndent, currentY, block.style, blockId);
            const boxWidth = block.bbox ? (block.bbox[2] - block.bbox[0]) : 300;
            newLines.push({
                content: currentLineText,
                y: currentY,
                id: `reflow-${blockId}-${newLines.length}`,
                blockId: blockId,
                items: lineItems,
                bbox: [lineItems[0].bbox[0], lineItems[0].bbox[1], lineItems[0].bbox[0] + boxWidth, lineItems[0].bbox[3]]
            });
        }

        return newLines;
    }

    _createItemsFromLine(text, startX, y, style, blockId) {
        return [{
            id: `reflow-item-${Math.random().toString(36).substr(2, 9)}`,
            blockId: blockId,
            type: 'text',
            content: text,
            origin: [startX, y],
            bbox: [startX, y - (style?.size || 12), startX + (style?.maxWidth || 300), y], // Use block width
            size: style?.size || 12,
            font: style?.font
        }];
    }

    _estimateReflow(block, newText) {
        // Fallback using average character width (approx 0.5 * fontSize)
        const fontSize = block.style?.size || 12;
        const avgCharWidth = fontSize * 0.5;
        
        const maxWidth = block.bbox ? (block.bbox[2] - block.bbox[0]) : 500;
        const indentX = block.indentX !== undefined ? block.indentX : (block.bbox ? block.bbox[0] : 0);
        const textX = block.textX !== undefined ? block.textX : indentX;

        const words = newText.split(/(\s+)/);
        const newLines = [];
        let currentLineText = "";
        let currentLineWidth = 0;
        let currentY = (block.lines && block.lines[0]) ? block.lines[0].y : (block.bbox ? block.bbox[1] : 0);
        const lineHeight = fontSize * 1.2;

        const getWordWidth = (word) => word.length * avgCharWidth;

        for (let word of words) {
            if (!word) continue;
            const wordWidth = getWordWidth(word);
            const availableWidth = (maxWidth > 0 ? maxWidth : 300) - (currentLineIndent - indentX);
            
            if (word.trim()) console.error(`[Reflow Est Debug] Word: "${word}" Width: ${wordWidth.toFixed(2)} / Avail: ${availableWidth.toFixed(2)}`);

            if (currentLineWidth + wordWidth > availableWidth && currentLineText !== "") {
                const lineItems = this._createItemsFromLine(currentLineText.trimEnd(), currentLineIndent, currentY, block.style, block.id);
                newLines.push({
                    content: currentLineText.trimEnd(),
                    y: currentY,
                    id: `reflow-est-${block.id}-${newLines.length}`,
                    blockId: block.id,
                    items: lineItems,
                    bbox: lineItems[0].bbox
                });
                currentLineText = word.trimStart();
                currentLineWidth = getWordWidth(currentLineText);
                currentY += lineHeight;
            } else {
                currentLineText += word;
                currentLineWidth += wordWidth;
            }
        }
        if (currentLineText) {
            const currentLineIndent = (newLines.length === 0) ? indentX : textX;
            const lineItems = this._createItemsFromLine(currentLineText, currentLineIndent, currentY, block.style, block.id);
            newLines.push({ 
                content: currentLineText, 
                y: currentY, 
                id: `reflow-est-${block.id}-${newLines.length}`, 
                blockId: block.id, 
                items: lineItems,
                bbox: lineItems[0].bbox
            });
        }
        return newLines;
    }
}
