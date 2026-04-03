import { getWeightFromFont, normalizeFont } from './reflowUtils';

/**
 * Builds a high-fidelity word-wise payload for the FontFitWorker.
 * This MUST exactly match the rendering logic in renderWordStyledText and PythonRenderer
 * to ensure the worker measures what the browser draws.
 */
export const buildWorkerPayload = (line, edit, useOriginalFonts = false) => {
    if (!line) return null;
    
    const content = edit?.content || line.content || '';
    const wordStyles = edit?.wordStyles || {};
    
    // Base styles (safety fallbacks)
    const safetyStyle = edit?.safetyStyle || {};
    const baseSize = Math.abs(safetyStyle.size || line.size || 16);
    
    const parts = content.split(/(\s+)/);
    
    let wordCounter = 0;
    const wordList = parts.map((part, i) => {
        const isSpace = /^\s+$/.test(part);
        const style = (!isSpace && wordStyles[wordCounter]) ? wordStyles[wordCounter] : {};
        if (!isSpace) wordCounter++;
        
        const activeStyle = { ...safetyStyle, ...style };
        
        return {
            id: `p-${i}`,
            content: part,
            font: normalizeFont(activeStyle.font || line.font, activeStyle.googleFont || line.google_font, useOriginalFonts),
            size: Math.abs(activeStyle.size || baseSize),
            weight: getWeightFromFont(activeStyle.font || line.font, activeStyle.is_bold ?? line.is_bold),
            is_italic: activeStyle.is_italic ?? line.is_italic
        };
    });
    
    return {
        words: wordList,
        targetWidth: line.width,
        originalId: line.id
    };
};
