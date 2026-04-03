// FontFitWorker.js - Unified Line-level font fitting with binary search
// Calculates a single optimal font size for a collection of words
const GLOBAL_FONT_SCALE = 1.15;

let canvas, ctx;

// Initialize canvas for text measurement
function initCanvas() {
    if (!canvas) {
        canvas = new OffscreenCanvas(3000, 200); // Larger width for 1000px targets
        ctx = canvas.getContext('2d');
    }
}

// Build font string for canvas
function buildFontString(weight, style, size, family) {
    const normalizedWeight = weight || '400';
    const normalizedStyle = style || 'normal';
    const normalizedFamily = family || 'serif';
    const adjustedSize = (size || 16) / GLOBAL_FONT_SCALE;
    return `${normalizedStyle} ${normalizedWeight} ${adjustedSize}px ${normalizedFamily}`;
}

// Measure total line width with given font size
function measureLine(words, fontSize) {
    let totalLineGridWidth = 0;

    words.forEach((word, index) => {
        const fontString = buildFontString(
            word.weight || '400',
            word.is_italic ? 'italic' : 'normal',
            fontSize,
            word.google_font || word.font || 'serif'
        );

        ctx.font = fontString;
        const w = ctx.measureText(word.content || '').width;
        totalLineGridWidth += w;

        // Gap logic removed: Payload is now responsible for explicit space parts if needed.
    });

    return totalLineGridWidth;
}

// Binary search for optimal line-wide font size
function findOptimalLineSize(words, targetWidth) {
    // Range for search: allow growing significantly or shrinking
    let low = 1;
    let high = 100; // Max cap to prevent 1000px line from becoming huge
    let optimalSize = 12;
    let iterations = 0;
    const maxIterations = 30;
    const tolerance = 0.05; // High precision for smoothness

    while (low <= high && iterations < maxIterations) {
        const mid = (low + high) / 2;
        const midWidth = measureLine(words, mid);

        iterations++;

        // Debug first word's progress as a proxy
        self.postMessage({
            type: 'debugLog',
            data: {
                jobId: self.currentJobId,
                wordId: 'LINE',
                iteration: iterations,
                size: mid,
                width: midWidth,
                target: targetWidth,
                fits: midWidth <= targetWidth
            }
        });

        if (midWidth <= targetWidth) {
            optimalSize = mid;
            low = mid + tolerance; // Try larger size to fill gap
        } else {
            high = mid - tolerance; // Too big, try smaller
        }

        if (Math.abs(high - low) < tolerance) {
            break;
        }
    }

    const finalWidth = measureLine(words, optimalSize);

    return {
        optimalSize: parseFloat(optimalSize.toFixed(3)),
        actualWidth: parseFloat(finalWidth.toFixed(3)),
        iterations: iterations
    };
}

// Main message handler
self.onmessage = function (e) {
    const { type, data, jobId } = e.data;

    if (jobId) self.currentJobId = jobId;

    if (type === 'init') {
        initCanvas();
        self.postMessage({ type: 'ready' });
        return;
    }

    if (type === 'fitWords') { // Using the same type name but with new Line-Level logic
        initCanvas();

        const { words, targetWidth } = data;

        self.postMessage({
            type: 'progress',
            message: `Line Fitting Mode: Scaling ${words.length} words to ${targetWidth}px...`
        });

        // Find single size for the whole line
        const lineResult = findOptimalLineSize(words, targetWidth);

        // Map result back to word objects for the test page consistent structure
        const results = words.map((word, index) => {
            const wordWidth = measureLine([word], lineResult.optimalSize);
            return {
                id: word.id,
                content: word.content,
                originalSize: word.size || 12,
                optimalSize: lineResult.optimalSize,
                usedFont: word.google_font || word.font,
                originalWidth: measureLine([word], word.size || 12),
                fittedWidth: wordWidth,
                scale: lineResult.optimalSize / (word.size || 12),
                iterations: lineResult.iterations,
                targetWidth: targetWidth,
                fits: true // Line as whole fits
            };
        });

        // Final summary
        self.postMessage({
            type: 'complete',
            data: {
                jobId: jobId,
                results: results,
                summary: {
                    totalWords: words.length,
                    totalFittedWidth: lineResult.actualWidth,
                    targetWidth: targetWidth,
                    totalIterations: lineResult.iterations,
                    overallFits: lineResult.actualWidth <= targetWidth + 1, // Tolerance
                    fontScale: lineResult.optimalSize / (words[0]?.size || 12)
                }
            }
        });

        return;
    }

    if (type === 'matchFont') {
        initCanvas();
        const { originalFont, text, candidates, size, isBold, isItalic } = data;
        
        const weight = isBold ? '700' : '400';
        const style = isItalic ? 'italic' : 'normal';
        const fontSize = (size || 16) / GLOBAL_FONT_SCALE; // Apply Global Reduction
        
        // 1. Measure Original
        ctx.font = `${style} ${weight} ${fontSize}px "${originalFont}", sans-serif`;
        const originalWidth = ctx.measureText(text).width;
        
        let bestMatch = null;
        let minDiff = Infinity;
        let bestWidth = 0;
        
        // 2. Compara against candidates
        candidates.forEach(candidate => {
            ctx.font = `${style} ${weight} ${fontSize}px "${candidate}", sans-serif`;
            const candidateWidth = ctx.measureText(text).width;
            const diff = Math.abs(originalWidth - candidateWidth);
            
            if (diff < minDiff) {
                minDiff = diff;
                bestMatch = candidate;
                bestWidth = candidateWidth;
            }
        });
        
        const errorRatio = originalWidth > 0 ? minDiff / originalWidth : 0;
        
        self.postMessage({
            type: 'complete',
            data: {
                jobId: jobId,
                bestMatch,
                originalWidth,
                bestWidth,
                errorRatio
            }
        });
        return;
    }

    // Unknown message type
    self.postMessage({
        type: 'error',
        message: `Unknown message type: ${type}`
    });
};
