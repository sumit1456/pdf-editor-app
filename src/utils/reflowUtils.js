export function calculateReflow(blockLines, fullText, targetWidth, baseStyle) {
    if (typeof window === 'undefined') return blockLines;
    if (!window.__canvas_reflow) {
        window.__canvas_reflow = document.createElement('canvas').getContext('2d');
    }
    const ctx = window.__canvas_reflow;
    
    let family = baseStyle.font || 'Source Serif 4';
    if (family.includes('var(--serif-latex)')) family = "'Source Serif 4', serif";
    else if (family.includes('var(--mono-code)')) family = "'Roboto Mono', monospace";
    else if (family.includes('var(--sans-modern)')) family = "'Inter', sans-serif";
    
    const sizePx = baseStyle.size * (96 / 72);
    const weight = baseStyle.is_bold ? '700' : '400';
    ctx.font = `${weight} ${sizePx}px ${family}, sans-serif`;

    const words = fullText.split(/(\s+)/); // keep spaces to rebuild string easily
    const wrappedLines = [];
    let currentLineWrapped = "";
    
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word.trim() === '') {
            currentLineWrapped += word;
            continue;
        }

        const testLine = currentLineWrapped + word;
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width > targetWidth && currentLineWrapped.trim().length > 0) {
            wrappedLines.push(currentLineWrapped.replace(/\s+$/, '')); // push line, trim trailing space
            currentLineWrapped = word;
        } else {
            currentLineWrapped += word;
        }
    }
    
    if (currentLineWrapped.trim().length > 0 || currentLineWrapped.length > 0) {
        wrappedLines.push(currentLineWrapped.replace(/\s+$/, '')); // trim trailing
    }

    // Now map these strings back to layout nodes.
    // We try to re-use the exact same exact IDs to maintain React input focus!
    const templateItem = blockLines[0]; // grab the first line to use as a template
    const lineHeightPt = baseStyle.size * 1.25; // Standard 1.25 line height factor
    const startY = templateItem.y || (templateItem.bbox && templateItem.bbox[1]) || 0;

    return wrappedLines.map((lineContent, index) => {
        // Reuse existing line ID if possible to prevent focus loss
        const existingLine = blockLines[index];
        const newId = existingLine ? existingLine.id : `${templateItem.block_id}-reflow-chunk-${Date.now()}-${index}`;
        
        const newY = startY + (index * lineHeightPt);
        
        return {
            ...(existingLine || templateItem), 
            id: newId,
            content: lineContent,
            y: newY,
            bbox: [
                templateItem.bbox ? templateItem.bbox[0] : templateItem.x0,
                newY - (baseStyle.size * 0.8), // arbitrary ascender padding for visual bbox
                (templateItem.bbox ? templateItem.bbox[0] : templateItem.x0) + ctx.measureText(lineContent).width * (72/96), 
                newY + (baseStyle.size * 0.2)
            ]
        };
    });
}
