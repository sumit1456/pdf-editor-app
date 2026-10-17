// FontFitWorker.js - Unified Line-level font fitting with binary search
// Calculates a single optimal scale factor for a collection of words
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

// Measure total line width with given scale factor
function measureLine(words, scaleFactor) {
    let totalLineGridWidth = 0;

    words.forEach((word) => {
        const currentSize = (word.size || 12) * scaleFactor;
        const fontString = buildFontString(
            word.weight || (word.is_bold ? '700' : '400'),
            word.is_italic ? 'italic' : 'normal',
            currentSize,
            word.google_font || word.font || 'serif'
        );

        ctx.font = fontString;
        const w = ctx.measureText(word.content || '').width;
        totalLineGridWidth += w;
    });

    return totalLineGridWidth;
}

// Binary search for optimal line-wide scale factor
function findOptimalScale(words, targetWidth) {
    // Fitting may reduce text to keep it inside its PDF box, but it must never
    // enlarge the source text just because the extracted box has spare width.
    const minScale = 0.1;
    const maxScale = 1.0;
    const originalWidth = measureLine(words, 1.0);

    if (originalWidth <= targetWidth) {
        return {
            optimalScale: 1.0,
            actualWidth: parseFloat(originalWidth.toFixed(3)),
            iterations: 0,
            minScaleUsed: minScale,
            maxScaleUsed: maxScale
        };
    }

    let low = minScale;
    let high = maxScale;
    let optimalScale = minScale;
    let iterations = 0;
    const maxIterations = 25;
    const tolerance = 0.005; // 0.5% precision for scale

    while (low <= high && iterations < maxIterations) {
        const mid = (low + high) / 2;
        const midWidth = measureLine(words, mid);

        iterations++;

        if (midWidth <= targetWidth) {
            optimalScale = mid;
            low = mid + tolerance; // Find the largest size that still fits
        } else {
            high = mid - tolerance; // Too big, must shrink
        }

        if (Math.abs(high - low) < tolerance) {
            break;
        }
    }

    const finalWidth = measureLine(words, optimalScale);

    return {
        optimalScale: parseFloat(optimalScale.toFixed(4)),
        actualWidth: parseFloat(finalWidth.toFixed(3)),
        iterations: iterations,
        minScaleUsed: minScale,
        maxScaleUsed: maxScale
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

    if (type === 'fitWords') {
        initCanvas();

        const { words, targetWidth } = data;

        // Find single scale factor for the whole line
        const lineResult = findOptimalScale(words, targetWidth);

        // Map result back to word objects
        const results = words.filter(word => !word.isWhitespace).map((word) => {
            const wordFittedSize = (word.size || 12) * lineResult.optimalScale;
            return {
                id: word.id,
                wordIndex: word.wordIndex,
                content: word.content,
                originalSize: word.size || 12,
                optimalSize: wordFittedSize,
                scale: lineResult.optimalScale,
                fittedWidth: measureLine([word], lineResult.optimalScale),
                fits: true
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
                    overallFits: lineResult.actualWidth <= targetWidth + 1.5, // 1.5px tolerance
                    optimalScale: lineResult.optimalScale
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
        
        // 2. Compare against candidates
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
