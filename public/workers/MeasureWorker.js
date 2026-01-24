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

        const { targetWidth, overflowCharLimit = 3 } = e.data;
        ctx.font = font;
        const fullWidth = ctx.measureText(text).width;

        // Estimate avg char width
        const avgCharWidth = fullWidth / Math.max(1, text.length);
        const overflowTolerance = avgCharWidth * overflowCharLimit;

        let fittingRatio = 1.0;
        // Aggressive: if overflow exceeds tolerance, shrink to fit EXACT targetWidth
        if (fullWidth > (targetWidth + overflowTolerance)) {
            fittingRatio = targetWidth / fullWidth;
        }

        self.postMessage({
            type: 'measureFitResult',
            fittingRatio: fittingRatio,
            width: fullWidth,
            id: id
        });
    }
};
