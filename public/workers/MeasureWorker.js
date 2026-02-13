/**
 * MeasureWorker.js - Off-thread text measurement
 */
let canvas = null;
let ctx = null;

self.onmessage = function (e) {
    const { type, font, text, id } = e.data;

    if (type === 'init') {
        canvas = new OffscreenCanvas(100, 100);
        ctx = canvas.getContext('2d');
        return;
    }

    if (type === 'measure') {
        if (!ctx) {
            canvas = new OffscreenCanvas(100, 100);
            ctx = canvas.getContext('2d');
        }

        ctx.font = font;
        const width = ctx.measureText(text).width;

        self.postMessage({
            type: 'measureResult',
            width: width,
            id: id
        });
    }

    if (type === 'measureFit') {
        if (!ctx) {
            canvas = new OffscreenCanvas(100, 100);
            ctx = canvas.getContext('2d');
        }

        const { targetWidth, fontBase, text, id } = e.data;

        // --- SAFETY MARGIN ---
        // Ensure we target a slightly smaller width to guarantee zero overflow
        const effectiveTarget = Math.max(1, targetWidth - 0.5);

        // Parse the font string to modify the size
        // Expected format: "italic 700 12px Inter, sans-serif"
        const fontParts = fontBase.split(' ');
        let sizeIdx = fontParts.findIndex(p => p.includes('px'));
        if (sizeIdx === -1) {
            // Fallback if no px found
            self.postMessage({ type: 'measureFitResult', fontSize: 12, width: 0, id });
            return;
        }

        const baseSize = parseFloat(fontParts[sizeIdx]);
        const fontPrefix = fontParts.slice(0, sizeIdx).join(' ');
        const fontSuffix = fontParts.slice(sizeIdx + 1).join(' ');

        const getWidthAtSize = (sz) => {
            ctx.font = `${fontPrefix} ${sz}px ${fontSuffix}`;
            return ctx.measureText(text).width;
        };

        // Binary Search for optimal font size
        let minSize = 1;
        let maxSize = baseSize; // We NEVER want to grow larger than baseSize in fit mode
        let optimalSize = baseSize;

        // Initial check: if already fits, we might not need to shrink
        let initialWidth = getWidthAtSize(baseSize);
        if (initialWidth <= effectiveTarget) {
            optimalSize = baseSize;
        } else {
            // CRITICAL FIX: Initialize optimalSize to minSize in case the loop doesn't find a fit
            optimalSize = minSize;

            // Binary search to find the largest size that fits
            // 20 iterations = ~0.0001px precision for 1-100 range
            for (let i = 0; i < 20; i++) {
                let mid = (minSize + maxSize) / 2;
                if (getWidthAtSize(mid) <= effectiveTarget) {
                    optimalSize = mid;
                    minSize = mid;
                } else {
                    maxSize = mid;
                }
            }
        }

        self.postMessage({
            type: 'measureFitResult',
            fontSize: optimalSize,
            width: getWidthAtSize(optimalSize),
            id: id
        });
    }
};
