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
    // Determine the safe range for the scale factor based on +/- 5pt constraint
    // The most restrictive word determines the global range.
    let minScale = 0.1;
    let maxScale = 1.0; // [FitV4] Cap at 100% - we only want to fix overflows, never expand beyond original

    words.forEach(word => {
        const size = word.size || 12;
        // Limit: |size * scale - size| <= 5
        // scale_min = (size - 5) / size
        // scale_max = (size + 5) / size
        const sMin = Math.max(0.1, (size - 5) / size);
        const sMax = Math.min(1.0, (size + 5) / size);
        
        if (sMin > minScale) minScale = sMin;
        if (sMax < maxScale) maxScale = sMax;
    });

    let low = minScale;
    let high = maxScale;
    let optimalScale = 1.0;
    let iterations = 0;
    const maxIterations = 25;
    const tolerance = 0.005; // 0.5% precision for scale

    while (low <= high && iterations < maxIterations) {
        const mid = (low + high) / 2;
        const midWidth = measureLine(words, mid);

        iterations++;

        if (midWidth <= targetWidth) {
            optimalScale = mid;
            low = mid + tolerance; // Try growing more to fill width
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
        const results = words.map((word) => {
            const wordFittedSize = (word.size || 12) * lineResult.optimalScale;
            return {
                id: word.id,
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
