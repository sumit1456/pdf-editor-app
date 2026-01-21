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
            type: 'result',
            width: width,
            id: id
        });
    }
};
