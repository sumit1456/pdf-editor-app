/**
 * MeasureWorker.js - Multi-Span Proportional Font Fitting
 */
let canvas = null;
let ctx = null;

const normalizeFont = (fontName, googleFont) => {
    if (googleFont) return `"${googleFont}", serif`;
    const fn = (fontName || '').toLowerCase();
    if (fn.includes('symbol') || fn.includes('cmsy')) return 'Symbol, "Apple Symbols", "Segoe UI Symbol", serif';
    if (fn.includes('zapf') || fn.includes('dingbat')) return 'ZapfDingbats, "Apple Color Emoji", "Segoe UI Emoji", serif';
    return '"Source Serif 4", serif';
};

/**
 * Detect structural/decorative spans (bullets, icons, symbols) so we skip them
 * when looking for the representative body-text span.
 * Mirrors the isStructuralSpan() heuristic in PythonRenderer.
 */
const isStructuralSpan = (span) => {
    const raw = (span?.content || '').trim();
    if (!raw) return true;
    // Private Use Area — FontAwesome, icon fonts etc.
    if (/[\uE000-\uF8FF]/.test(raw)) return true;
    // Short content with no letter characters → symbol / emoji / bullet
    if (raw.length <= 4) {
        const hasLetter = /[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF]/.test(raw);
        if (!hasLetter) return true;
    }
    return false;
};

/**
 * Find the representative body-text span, mirroring LineRenderer's styleItem logic.
 * This is the span whose .size should be used when reporting `fontSize` back to the renderer,
 * so that LineRenderer can derive the correct scale via (workerFontSize / styleItem.size).
 */
const findRepresentativeSpan = (spans) => {
    const startIdx = (isStructuralSpan(spans[0]) && spans.length > 1) ? 1 : 0;
    for (let i = startIdx; i < spans.length; i++) {
        const s = spans[i];
        if (!s.content || s.content.trim().length === 0) continue;
        if (s.color) {
            const [r, g, b] = s.color;
            const isGray = Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05;
            const brightness = (r + g + b) / 3;
            if (isGray && brightness > 0.75) continue; // light grey separator, skip
        }
        return s;
    }
    // Fallback: first non-whitespace span
    for (let i = startIdx; i < spans.length; i++) {
        if (spans[i].content && spans[i].content.trim().length > 0) return spans[i];
    }
    return spans[0];
};

self.onmessage = function (e) {
    const { type, font, text, id, items, targetWidth } = e.data;

    if (type === 'init') {
        canvas = new OffscreenCanvas(100, 100);
        ctx = canvas.getContext('2d');
        return;
    }

    if (type === 'measureFit') {
        if (!ctx) {
            canvas = new OffscreenCanvas(100, 100);
            ctx = canvas.getContext('2d');
        }

        const effectiveTarget = targetWidth;
        const spans = items || [];

        if (spans.length === 0) {
            self.postMessage({ type: 'measureFitResult', fontSize: 12, scale: 1.0, width: 0, id });
            return;
        }

        // Multi-span measurement: scale ALL spans proportionally
        const getWidthAtScale = (scale) => {
            let total = 0;
            spans.forEach(s => {
                const style = s.is_italic ? 'italic' : 'normal';
                const weight = s.is_bold ? '700' : '400';
                const size = (s.size || 12) * scale;
                const family = normalizeFont(s.font, s.google_font);
                ctx.font = `${style} ${weight} ${size}px ${family}`;
                total += ctx.measureText(s.content || '').width;
            });
            return total;
        };

        // Binary Search for optimal scale factor
        // Allow up to 20% shrink and 15% growth to stay within bbox without
        // causing vertical overlap.
        let minScale = 0.8;
        let maxScale = 1.15;
        let optimalScale = 1.0;

        const initialWidth = getWidthAtScale(1.0);

        if (initialWidth <= effectiveTarget) {
            // Text fits at scale=1 → only look upward for a tighter fill
            minScale = 1.0;
        } else {
            // Text overflows → only shrink
            maxScale = 1.0;
        }

        for (let i = 0; i < 100; i++) {
            const mid = (minScale + maxScale) / 2;
            const currentW = getWidthAtScale(mid);
            if (currentW <= effectiveTarget) {
                optimalScale = mid;
                minScale = mid;
            } else {
                maxScale = mid;
            }
            if (maxScale - minScale < 0.001) break;
        }

        const finalWidth = getWidthAtScale(optimalScale);

        // ── KEY FIX ──────────────────────────────────────────────────────────
        // Report fontSize based on the REPRESENTATIVE body-text span (same heuristic
        // as LineRenderer's styleItem), NOT spans[0] which is often a bullet/icon.
        // This ensures LineRenderer can safely recover scale = workerFontSize / styleItem.size
        // without any cross-size contamination.
        const repSpan = findRepresentativeSpan(spans);
        const repBaseSize = repSpan?.size || 12;

        self.postMessage({
            type: 'measureFitResult',
            fontSize: repBaseSize * optimalScale,  // aligned with styleItem in LineRenderer
            scale: optimalScale,                   // raw scale, can be used directly
            width: finalWidth,
            id,
            fullFont: `Multi-Span Scale: ${optimalScale.toFixed(3)} | repSpan: ${(repSpan?.content || '').substring(0, 10)} @${repBaseSize}pt`
        });
    }
};
