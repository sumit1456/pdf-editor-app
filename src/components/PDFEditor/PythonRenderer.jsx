import React, { useMemo, useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRendererEngine } from '../engine/WebEngine';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';
import { ReflowEngine } from '../../lib/pdf-extractor/ReflowEngine';
import { MEASURE_CTX, getRealFontString, normalizeFont, getWeightFromFont, GLOBAL_FONT_SCALE } from './reflowUtils';
import { fontFitManager } from '../../utils/FontFitManager';
import { buildWorkerPayload } from './workerUtils';

// Now purely a Single Page Renderer for Python Backend

const getSVGColor = (c, fallback = 'black') => {
    if (!c) return fallback;
    if (typeof c === 'string') return c; // Already a color string
    if (!Array.isArray(c)) return fallback;
    let r = 0, g = 0, b = 0;
    if (c.length === 3) { // RGB
        r = Math.round(c[0] * 255);
        g = Math.round(c[1] * 255);
        b = Math.round(c[2] * 255);
    } else if (c.length === 4) { // CMYK
        r = Math.round(255 * (1 - c[0]) * (1 - c[3]));
        g = Math.round(255 * (1 - c[1]) * (1 - c[3]));
        b = Math.round(255 * (1 - c[2]) * (1 - c[3]));
    } else if (c.length === 1) { // Gray
        r = Math.round(c[0] * 255);
        g = r; b = r;
    } else {
        return fallback;
    }
    return `rgb(${r}, ${g}, ${b})`;
};

// Typographic helpers moved to reflowUtils.js

/**
 * Typographic Helper: Simulate Small-Caps in Preview
 * This allows the preview to accurately match the backend's high-fidelity rendering.
 */
const renderVisualText = (text, isSmallCaps, baseSize) => {
    if (!isSmallCaps || !text) return text;

    // FIDELITY FIX: Manually simulate the backend's 0.75x scaling for Small Caps.
    // This provides much better consistency across browsers than CSS 'small-caps'.
    const chars = text.split('');
    return chars.map((char, i) => {
        const isLower = char === char.toLowerCase() && char !== char.toUpperCase();
        if (!isLower) return char;

        return (
            <tspan
                key={i}
                fontSize={Math.max(1, ((baseSize || 10) / GLOBAL_FONT_SCALE) * 0.75)}
                style={{ textTransform: 'uppercase' }}
            >
                {char.toUpperCase()}
            </tspan>
        );
    });
};

/**
 * Word-Level Styling Helper: Applies individual word styles from nodeEdits in preview
 */
/**
 * Detects if a PDF span is a structural decoration — bullet, emoji, icon, symbol —
 * rather than readable text content. Uses Unicode heuristics instead of a hardcoded
 * character list, so it handles ■■, 🔹, ✅, →, FontAwesome icons, and anything else
 * without needing to be maintained.
 *
 * Rules:
 *   1. PUA range (U+E000–U+F8FF): icon fonts like FontAwesome
 *   2. Short content (≤4 chars) with NO letters from any script: symbols, emoji, arrows
 */
const isStructuralSpan = (span) => {
    const raw = (span?.content || '').trim();
    if (!raw) return true;

    // Rule 1: Private Use Area — FontAwesome, icon fonts etc.
    if (/[\uE000-\uF8FF]/.test(raw)) return true;

    // Rule 2: Short AND contains no letter characters from any common script
    // Covers: •, ■■, →, ✓, ✅, 🔹 (emoji are ≤2 JS chars), –, *, ·, ❖, ▪ …
    if (raw.length <= 4) {
        const hasLetter = /[a-zA-Z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF]/.test(raw);
        if (!hasLetter) return true;
    }

    return false;
};

/**
 * Renders word-level styled text as SVG <tspan> children.
 * @param {string} text - The text content to render
 * @param {object} wordStyles - Per-word style overrides keyed by word index
 * @param {object} safetyStyle - Base/fallback style for this line
 * @param {boolean} isSmallCaps - Whether the line uses small-caps
 * @param {number} baseSize - Fallback font size in pt
 * @param {number} [startOffset=0] - Word index offset into wordStyles.
 *   Use this when rendering only a SUFFIX of the line's content (e.g., the text
 *   after a structural bullet span that was split off and rendered separately).
 *   Without the offset, wordStyles[0] would point to the bullet's style instead
 *   of the first word of the suffix.
 */
const renderWordStyledText = (text, wordStyles, safetyStyle, isSmallCaps, baseSize, startOffset = 0, useOriginalFonts = false) => {
    if (!text) return text;
    
    // Split into words, preserving spaces
    const parts = text.split(/(\s+)/);
    // Start at the offset so we align with the correct wordStyles entries
    let wordCounter = startOffset;
    
    return parts.map((part, i) => {
        const isSpace = /^\s+$/.test(part);
        const style = (!isSpace && wordStyles?.[wordCounter]) ? wordStyles[wordCounter] : {};
        if (!isSpace) wordCounter++;
        
        const spanStyle = { ...safetyStyle, ...style };
        const spanIsSmallCaps = spanStyle.font_variant === 'small-caps' || isSmallCaps;
        const spanSize = (Math.abs(spanStyle.size || baseSize) / GLOBAL_FONT_SCALE);
        const spanColor = getSVGColor(spanStyle.color, 'inherit');
        const spanWeight = getWeightFromFont(spanStyle.font, spanStyle.is_bold);
        const spanItalic = spanStyle.is_italic ? 'italic' : 'normal';
        const spanFamily = normalizeFont(spanStyle.font, spanStyle.googleFont, useOriginalFonts);

        return (
            <tspan
                key={i}
                fontSize={spanSize}
                fill={spanColor}
                fontWeight={spanWeight}
                fontStyle={spanItalic}
                fontFamily={spanFamily}
                style={{
                    fontVariant: spanIsSmallCaps ? 'small-caps' : 'normal',
                    letterSpacing: 'normal'
                }}
            >
                {renderVisualText(part, spanIsSmallCaps, spanSize)}
            </tspan>
        );
    });
};

const mapContent = (text) => {
    if (!text) return text;
    return text
        .replace(/\u00ad/g, '-') // Soft hyphen
        .replace(/\u25cf/g, '●') // Circle bullet
        .replace(/\u2022/g, '•').replace(/\u2217/g, '*').replace(/\u22c6/g, '*')
        .replace(/\u2013/g, '–').replace(/\u2014/g, '—')
        .replace(/\u0083/g, '\uf095').replace(/\u00a7/g, '\uf09b')
        .replace(/\u00ef/g, '\uf08c').replace(/\u00d0/g, '\uf121');
};

const PythonRenderer = React.memo(({ page, pageIndex, activeNodeId, selectedWordIndices = [], fontsKey, fonts, nodeEdits, onUpdate, onSelect, onDoubleClick, scale, onMove, isDragEnabled, onCalibrated, showAllBboxes, useOriginalFonts, onScaleUpdate, onBatchUpdate, isFittingConfirmed }) => {
    // console.log("[PythonRenderer] Mounting for Page", pageIndex + 1, "useOriginalFonts:", useOriginalFonts);

    const containerRef = useRef(null);
    const engineRef = useRef(null);
    // Reflow Engine was removed as it broke bounding box logic
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [isReady, setIsReady] = useState(false);
    const [metricRatio, setMetricRatio] = useState(1.0); // Backend already applies 1.33x scaling to result.json

    // --- DRAG ENGINE ---
    const itemRefs = useRef(new Map());


    const dragRef = useRef({
        draggingId: null,
        startX: 0,
        startY: 0,
        itemStartX: 0,
        itemStartY: 0,
        node: null
    });


    const handlePointerDown = useCallback((e, id, initialX, initialY) => {
        if (e.buttons !== 1) return;

        const node = itemRefs.current.get(id);
        if (!node) return;

        dragRef.current = {
            draggingId: id,
            startX: e.clientX,
            startY: e.clientY,
            itemStartX: initialX,
            itemStartY: initialY,
            node: node
        };

        node.setPointerCapture(e.pointerId);
        if (onSelect) onSelect(id);
    }, [onSelect]);

    const handlePointerMove = useCallback((e) => {
        if (!dragRef.current.draggingId) return;
        const { startX, startY, node } = dragRef.current;

        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;

        node.style.transform = `translate(${dx}px, ${dy}px)`;
    }, [scale]);

    const handlePointerUp = useCallback((e) => {
        if (!dragRef.current.draggingId) return;
        const { draggingId, startX, startY, itemStartX, itemStartY, node } = dragRef.current;

        node.releasePointerCapture(e.pointerId);

        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;

        node.style.transform = '';

        if (onMove && (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1)) {
            onMove(draggingId, itemStartX + dx, itemStartY + dy);
        }

        dragRef.current.draggingId = null;
    }, [onMove, scale]);

    // --- DOM RENDER CAPTURE ---
    const captureRender = useCallback(() => {
        const data = [];
        const paperWrapper = containerRef.current?.closest('.page-paper-wrapper');
        if (!paperWrapper) {
            console.error("DOM CAPTURE: Page wrapper not found");
            return;
        }
        const wrapperRect = paperWrapper.getBoundingClientRect();

        itemRefs.current.forEach((el, id) => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            // Try to find the actual text element inside the <g>
            const textEl = el.querySelector('text') || el;
            const textRect = textEl.getBoundingClientRect();
            const style = window.getComputedStyle(textEl);

            data.push({
                id: id,
                content: el.textContent,
                // Coordinates relative to the page paper (in PDF points, divided by scale)
                x: (textRect.left - wrapperRect.left) / scale,
                y: (textRect.top - wrapperRect.top) / scale,
                width: textRect.width / scale,
                height: textRect.height / scale,
                // Bounding boxes in pixels (for absolute layout debugging)
                pixelBbox: [
                    textRect.left - wrapperRect.left,
                    textRect.top - wrapperRect.top,
                    textRect.right - wrapperRect.left,
                    textRect.bottom - wrapperRect.top
                ],
                // Computed Styles
                computedStyle: {
                    fontFamily: style.fontFamily,
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    fontStyle: style.fontStyle,
                    fill: style.fill,
                    color: style.color
                }
            });
        });

        const captureData = {
            pageIndex,
            scale,
            capturedAt: new Date().toISOString(),
            numItems: data.length,
            items: data
        };

        console.log("DOM_CAPTURE_RESULTS:", captureData);

        // Download as JSON
        const blob = new Blob([JSON.stringify(captureData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `render_capture_page_${pageIndex + 1}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [pageIndex, scale]);

    // --- METRIC CALIBRATION BRIDGE ---
    useEffect(() => {
        if (!page || !fontsKey) return;

        const calibrate = async () => {
            const allItems = page.items || [];
            const textItems = allItems.filter(it => it.type === 'text' && it.content && it.content.length > 10).slice(0, 5);

            if (textItems.length === 0) {
                setMetricRatio(1.0);
                return;
            }

            try {
                const ratios = await Promise.all(textItems.map(async (item) => {
                    const font = normalizeFont(item.font, item.google_font, useOriginalFonts);
                    const weight = getWeightFromFont(item.font, item.is_bold);
                    const fontStyle = item.is_italic ? 'italic' : 'normal';
                    const fontStr = `${fontStyle} ${weight} ${item.size}px "${font}", sans-serif`;

                    let resultW = 0;
                    /* Worker based measurement removed */

                    if (resultW === 0) {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        ctx.font = fontStr;
                        resultW = ctx.measureText(item.content).width;
                    }

                    if (resultW > 0) {
                        const pdfWidth = item.width || (item.bbox[2] - item.bbox[0]);
                        return resultW / pdfWidth;
                    }
                    return null;
                }));

                const validRatios = ratios.filter(r => r !== null);
                if (validRatios.length > 0) {
                    const avgRatio = validRatios.reduce((a, b) => a + b, 0) / validRatios.length;
                    setMetricRatio(avgRatio);
                    if (onCalibrated) onCalibrated(avgRatio);
                }
            } catch (err) {
                setMetricRatio(1.0);
            }
        };

        const timer = setTimeout(calibrate, 500);
        return () => clearTimeout(timer);
    }, [page, fontsKey, useOriginalFonts, onCalibrated]);


    useEffect(() => {
        if (!containerRef.current) return;

        const measureAndInit = async () => {
            const rect = containerRef.current.getBoundingClientRect();
            const w = rect.width || 800;
            const h = rect.height || 1000;

            setViewportSize({ width: w, height: h });

            const engine = new PixiRendererEngine(containerRef.current, {
                width: w,
                height: h,
                backgroundColor: 0x000000,
                backgroundAlpha: 0,
                antialias: true,
                resolution: window.devicePixelRatio || 3
            });

            const ok = await engine.initialize();
            if (ok) {
                engineRef.current = engine;
                setIsReady(true);
            }
        };

        measureAndInit();

        const observer = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                if (width > 0) setViewportSize({ width, height });
            }
        });
        observer.observe(containerRef.current);

        return () => {
            observer.disconnect();
            if (engineRef.current) {
                engineRef.current.destroy();
                engineRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!engineRef.current || !page) return;

        const baseWidth = (page && page.width) || 595.28;
        const baseHeight = (page && page.height) || 841.89;

        const scaledWidth = baseWidth * scale;
        const scaledHeight = baseHeight * scale;

        const engine = engineRef.current;
        if (engine.app && engine.app.renderer) {
            engine.app.renderer.resize(scaledWidth, scaledHeight);
        }
    }, [page, scale]);

    const renderActivePage = useCallback(async () => {
        if (!engineRef.current || !isReady || !page) return;

        const engine = engineRef.current;
        const stage = engine.app.stage;

        if (!engineRef.current.worldContainer) {
            engineRef.current.worldContainer = new PIXI.Container();
            stage.addChild(engineRef.current.worldContainer);
        }

        const worldContainer = engineRef.current.worldContainer;
        worldContainer.removeChildren();

        worldContainer.scale.set(scale);
        worldContainer.x = 0;
        worldContainer.y = 0;

        const nodes = [];
        let currentPath = [];
        let lastPoint = { x: 0, y: 0 };

        const parseColor = (c) => {
            if (!c) return 0x000000;
            if (Array.isArray(c)) {
                let r = 0, g = 0, b = 0;
                if (c.length === 3) {
                    r = Math.round(c[0] * 255);
                    g = Math.round(c[1] * 255);
                    b = Math.round(c[2] * 255);
                } else if (c.length === 4) {
                    r = Math.round(255 * (1 - c[0]) * (1 - c[3]));
                    g = Math.round(255 * (1 - c[1]) * (1 - c[3]));
                    b = Math.round(255 * (1 - c[2]) * (1 - c[3]));
                } else if (c.length === 1) {
                    r = Math.round(c[0] * 255);
                    g = r; b = r;
                }
                return (r << 16) + (g << 8) + b;
            }
            return 0x000000;
        };

        const flushPath = (isFill, color) => {
            if (currentPath.length > 0) {
                const pathNode = {
                    type: 'pdf_path',
                    items: [{
                        type: 'path',
                        segments: [...currentPath],
                        [isFill ? 'fill_color' : 'stroke_color']: parseColor(color)
                    }],
                    height: 0
                };
                if (isFill) pathNode.items[0].fill_color = parseColor(color);
                else {
                    pathNode.items[0].stroke_color = parseColor(color);
                    pathNode.items[0].stroke_width = 1;
                }
                nodes.push(pathNode);
                currentPath = [];
            }
        };

        const bgItems = page.bg_items || (page.items || []).filter(it => it.type !== 'text');

        bgItems.forEach((item, index) => {
            if (item.type === 'image') {
                nodes.push({
                    id: item.id || `img-${index}`,
                    type: 'image',
                    src: item.data.startsWith('data:') ? item.data : `data:image/png;base64,${item.data}`,
                    x: item.x,
                    y: item.y,
                    width: item.width,
                    height: item.height,
                    styles: { opacity: 1 }
                });
            }
            else if (item.type === 'path_move') {
                currentPath.push({ type: 'm', x: item.x, y: item.y });
                lastPoint = { x: item.x, y: item.y };
            } else if (item.type === 'path_line') {
                currentPath.push({ type: 'l', pts: [[lastPoint.x, lastPoint.y], [item.x, item.y]] });
                lastPoint = { x: item.x, y: item.y };
            } else if (item.type === 'path_curve') {
                currentPath.push({
                    type: 'c', pts: [
                        [lastPoint.x, lastPoint.y],
                        [item.pts[0], item.pts[1]],
                        [item.pts[2], item.pts[3]],
                        [item.pts[4], item.pts[5]]
                    ]
                });
                lastPoint = { x: item.pts[4], y: item.pts[5] };
            } else if (item.op === 're') {
                const [rx, ry, rw, rh] = item.pts;
                currentPath.push({ type: 're', pts: [[rx, ry, rw, rh]] });
            } else if (item.type === 'paint') {
                if (currentPath.length > 0) {
                    const pathItem = { type: 'path', segments: [...currentPath] };
                    if (item.fill) pathItem.fill_color = parseColor(item.fill);
                    if (item.stroke) {
                        pathItem.stroke_color = parseColor(item.stroke);
                        pathItem.stroke_width = item.stroke_width || 1;
                    }
                    nodes.push({ id: `path-${index}`, type: 'pdf_path', x: 0, y: 0, items: [pathItem], height: 0 });
                    currentPath = [];
                }
            }
            else if (item.type === 'fill' || item.type === 'eofill') flushPath(true, item.color);
            else if (item.type === 'stroke') flushPath(false, item.color);
            else if (item.type === 'pdf_path') {
                const clonedPath = JSON.parse(JSON.stringify(item));
                if (clonedPath.items) {
                    clonedPath.items.forEach(pi => {
                        if (Array.isArray(pi.fill_color)) pi.fill_color = parseColor(pi.fill_color);
                        if (Array.isArray(pi.stroke_color)) pi.stroke_color = parseColor(pi.stroke_color);
                        if (pi.stroke_color !== undefined) pi.stroke_width = Math.max(0.8, pi.stroke_width || 1);
                    });
                }
                nodes.push(clonedPath);
            }
            else if (item.type === 'path' && item.segments) {
                nodes.push({ id: item.id || `path-${index}`, type: 'pdf_path', items: [item], height: 0 });
            }
        });

        engine.worldContainer = worldContainer;
        await engine.render({ nodes }, { targetContainer: worldContainer });
        engine.app.render();
    }, [isReady, page, scale, viewportSize]);

    const fontStyles = useMemo(() => {
        if (!fonts || fonts.length === 0) return '';
        return fonts.map(f => `
            @font-face {
                font-family: "${f.name}";
                src: url(data:application/font-woff;base64,${f.data});
            }
        `).join('\n');
    }, [fonts]);

    useEffect(() => {
        if (!fontStyles) return;
        const styleId = `dynamic-fonts-${fontsKey || 'global'}`;
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = fontStyles;
        document.head.appendChild(style);
        // [Debug] Log when PDF fonts are injected
        console.log("[PythonRenderer] PDF Fonts Rendered & Injected into DOM");
        return () => {
            const el = document.getElementById(styleId);
            if (el) document.head.removeChild(el);
        };
    }, [fontStyles, fontsKey]);

    const textItems = useMemo(() => {
        if (!page || !page.items) return [];
        return page.items.filter(it => it.type === 'text');
    }, [page]);

    useEffect(() => {
        renderActivePage();
    }, [renderActivePage]);

    useEffect(() => {
        const handleResize = () => {
            if (!containerRef.current) return;
            const workspace = document.querySelector('.preview-stage');
            if (workspace) {
                const rect = workspace.getBoundingClientRect();
                setViewportSize({ width: rect.width, height: rect.height });
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const PT_TO_PX = 100;

    const baseWidth = (page && page.width) ? page.width : A4_WIDTH * PT_TO_PX;
    const baseHeight = (page && page.height) ? page.height : A4_HEIGHT * PT_TO_PX;

    const scaledStyleWidth = baseWidth * scale;
    const scaledStyleHeight = baseHeight * scale;

    return (
        <div className="webgl-single-page" style={{ width: 'auto', height: 'auto', position: 'relative', background: 'transparent', padding: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: scaledStyleWidth + 'px', margin: '0 auto 15px auto', padding: '0 10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Capture DOM debug button removed */}
                </div>
                <div style={{ background: '#f8f9fa', padding: '4px 10px', borderRadius: '6px', color: '#666', fontSize: '0.75rem', border: '1px solid #dee2e6', fontWeight: '600' }}>
                    Page {pageIndex + 1}
                </div>
            </div>
            <div
                className="page-paper-wrapper"
                style={{
                    position: 'relative', width: scaledStyleWidth + 'px', height: scaledStyleHeight + 'px',
                    backgroundColor: 'white', border: '1px solid #dee2e6', margin: '0 auto', marginBottom: '100px',
                    boxShadow: '0 0 0 6px #efefef, 0 10px 40px rgba(0,0,0,0.08)'
                }}
            >
                <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: scaledStyleWidth + 'px', height: scaledStyleHeight + 'px', pointerEvents: 'none', zIndex: 1 }} />
                <svg
                    viewBox={`0 0 ${baseWidth} ${baseHeight}`}
                    textRendering="geometricPrecision"
                    shapeRendering="geometricPrecision"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10, overflow: 'visible' }}
                >
                    {page && (page.blocks ? (
                        <BlockLayer
                            blocks={page.blocks}
                            isFirstPage={pageIndex === 0}
                            nodeEdits={nodeEdits || {}} pageIndex={pageIndex} activeNodeId={activeNodeId}
                            selectedWordIndices={selectedWordIndices} fontsKey={fontsKey} fontStyles={fontStyles} metricRatio={metricRatio}
                            onDoubleClick={onDoubleClick} onSelect={onSelect}
                            itemRefs={itemRefs} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} isDragEnabled={isDragEnabled}
                            showAllBboxes={showAllBboxes} useOriginalFonts={useOriginalFonts} onScaleUpdate={onScaleUpdate} onBatchUpdate={onBatchUpdate}
                            isFittingConfirmed={isFittingConfirmed}
                        />
                    ) : null)}
                </svg>
            </div>
        </div>
    );
}, (prev, next) => {
    if (!prev || !next) return false;
    return prev.page === next.page &&
        prev.pageIndex === next.pageIndex &&
        prev.scale === next.scale &&
        prev.nodeEdits === next.nodeEdits &&
        prev.activeNodeId === next.activeNodeId &&
        prev.selectedWordIndices === next.selectedWordIndices &&
        prev.fontsKey === next.fontsKey &&
        prev.isDragEnabled === next.isDragEnabled &&
        prev.showAllBboxes === next.showAllBboxes &&
        prev.useOriginalFonts === next.useOriginalFonts &&
        prev.isFittingConfirmed === next.isFittingConfirmed
});

export default PythonRenderer;

// Typographic tools moved to reflowUtils.js

function EditableTextLayer({ items, nodeEdits, activeNodeId, height, pageIndex, fontsKey, fonts, fontStyles, metricRatio, onDoubleClick, isFitMode, workerRef, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, useOriginalFonts }) {
    return (
        <g className="text-layer" key={fontsKey}>
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {items.map((item, i) => (
                <EditableTextItem
                    key={item.id || i} item={item} index={i} edit={nodeEdits[item.id] || {}} pageIndex={pageIndex}
                    activeNodeId={activeNodeId} fonts={fonts} metricRatio={metricRatio} isFitMode={isFitMode}
                    onDoubleClick={onDoubleClick} workerRef={workerRef} itemRef={(el) => itemRefs.current.set(item.id || i, el)}
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} isDragEnabled={isDragEnabled}
                    useOriginalFonts={useOriginalFonts}
                />
            ))}
        </g>
    );
}

function EditableTextItem({ item, index, edit, pageIndex, activeNodeId, fonts, metricRatio, onDoubleClick, itemRef, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, useOriginalFonts }) {
    const isModified = !!edit.isModified;
    const content = edit.content !== undefined ? edit.content : item.content;
    const [x0, y0, x1, y1] = edit.bbox || item.bbox || [0, 0, 0, 0];
    const rectW = x1 - x0;
    const color = getSVGColor(item.color, 'black');
    const baselineY = edit.origin ? edit.origin[1] : (item.origin ? item.origin[1] : (item.bbox ? item.bbox[1] : 0));
    const startX = edit.origin ? edit.origin[0] : (item.origin ? item.origin[0] : (item.bbox ? item.bbox[0] : 0));
    const rectY = y0 - 3;
    const rectH = y1 - y0;
    const sStyle = edit.safetyStyle || { size: item.size, font: item.font, googleFont: item.google_font, is_bold: item.is_bold, is_italic: item.is_italic, font_variant: item.font_variant || 'normal' };
    const OPTICAL_HEIGHT_FACTOR = 1.0;
    const weight = (sStyle.font_variant === 'small-caps' || (sStyle.font || '').toLowerCase().includes('cmcsc')) ? '500' : (sStyle.is_bold ? '700' : '400');
    const style = sStyle.is_italic ? 'italic' : 'normal';
    const matchingFont = fonts && fonts.find(f => {
        const norm = f.name.toLowerCase().replace(/[_-]/g, ' ');
        return norm.includes((sStyle.font || '').toLowerCase()) || ((sStyle.googleFont || sStyle.google_font) && norm.includes((sStyle.googleFont || sStyle.google_font).toLowerCase()));
    });
    let measureFamily = matchingFont ? `'${matchingFont.name}'` : normalizeFont(sStyle.font, sStyle.googleFont || sStyle.google_font, useOriginalFonts);
    if (measureFamily.includes('var(')) {
        measureFamily = getRealFontString(sStyle.font, sStyle.googleFont, weight, sStyle.size, style, useOriginalFonts).split(' px ')[1] || 'serif';
    }
    MEASURE_CTX.font = `${style} ${weight} ${sStyle.size}px ${measureFamily}`;
    const measuredWidth = MEASURE_CTX.measureText(content || "").width;

    // Fitting and scaling logic removed as per user request to simplify engine
    const fittingScale = 1.0;
    const finalFittedFontSize = (sStyle.size || item.size) * OPTICAL_HEIGHT_FACTOR;

    if (item.type !== 'text' || !item.bbox) return null;
    if (content === "" && isModified) return null;

    const renderWeight = (matchingFont && /bold|medium|semibold|black|heavy/i.test(matchingFont.name)) ? 'normal' : (sStyle.is_bold ? '700' : '400');

    return (
        <g key={item.id || index} ref={itemRef} id={`item-debug-${item.id || index}`}>
            {activeNodeId === (item.id || index) && (
                <rect x={x0} y={y0} width={rectW} height={y1 - y0} fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.8" strokeDasharray="4 2" pointerEvents="none" />
            )}
            <rect
                x={x0} y={rectY} width={rectW} height={rectH} fill="transparent" cursor="move" pointerEvents="all"
                onPointerDown={(e) => isDragEnabled && onPointerDown(e, item.id || index, startX, baselineY)}
                onPointerMove={isDragEnabled ? onPointerMove : undefined} onPointerUp={isDragEnabled ? onPointerUp : undefined}
                onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onDoubleClick(pageIndex, index, item, e.target.getBoundingClientRect(), { safetyStyle: sStyle }); }}
            />
            <text
                fontSize={Math.max(1, Math.abs((sStyle.size || item.size) * OPTICAL_HEIGHT_FACTOR))} fontFamily={measureFamily}
                fontWeight={renderWeight} fontStyle={style} fill={getSVGColor(sStyle.color, color)}
                dominantBaseline="alphabetic"
                direction={item.direction || 'ltr'}
                style={{
                    userSelect: 'none',
                    pointerEvents: 'none',
                    transform: 'none',
                    transformOrigin: `${startX}px ${baselineY}px`
                }}
            >
                {isModified ? (
                    <tspan x={startX} y={baselineY}>{renderVisualText(content, (item.font_variant === 'small-caps'), finalFittedFontSize)}</tspan>
                ) : (
                    (item.items || [item]).map((span, si) => {
                        const spanX = span.origin ? span.origin[0] : (span.x || item.x);
                        const prevX1 = si > 0 ? (item.items[si - 1].bbox ? item.items[si - 1].bbox[2] : item.items[si - 1].x + 10) : -1;
                        const forceX = si === 0 || (Math.abs(spanX - prevX1) > 0.1);
                        const spanIsSmallCaps = span.font_variant === 'small-caps' || (span.font || '').toLowerCase().includes('cmcsc');
                        const spanSize = span.size; // Natural size, scale is on parent
                        return (
                                <tspan key={si} x={forceX ? spanX : undefined} y={span.origin ? span.origin[1] : (span.y || item.y)} fontSize={Math.max(1, Math.abs(spanSize))} fill={getSVGColor(span.color, color)} fontWeight={spanIsSmallCaps ? '500' : (span.is_bold ? '700' : '400')} fontStyle={span.is_italic ? 'italic' : undefined} fontFamily={span.font ? normalizeFont(span.font, span.google_font, useOriginalFonts) : undefined} xmlSpace="preserve" style={{ fontVariant: spanIsSmallCaps ? 'small-caps' : 'normal' }}>
                                {renderVisualText(span.content, spanIsSmallCaps, spanSize)}
                            </tspan>
                        );
                    })
                )}
            </text>
            {item.uri && (
                <rect x={x0} y={rectY} width={rectW} height={rectH} fill="transparent" cursor="pointer" pointerEvents="all" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(item.uri, '_blank'); }} />
            )}
        </g>
    );
}

const BlockLayer = React.memo(({ blocks, isFirstPage, nodeEdits, pageIndex, activeNodeId, selectedWordIndices, fontsKey, fontStyles, metricRatio, onDoubleClick, onSelect, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, showAllBboxes, useOriginalFonts, onScaleUpdate, onBatchUpdate, isFittingConfirmed }) => {
    // console.log("[BlockLayer] Rendering blocks:", blocks?.length, "useOriginalFonts:", useOriginalFonts);
    return (
        <g className="block-layer" key={fontsKey}>
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {blocks.map((block, bi) => (
                <SemanticBlock
                    key={block.id || bi}
                    isFirstBlock={isFirstPage && bi === 0}
                    block={block} 
                    edit={nodeEdits[block.id]}
                    nodeEdits={nodeEdits}
                    pageIndex={pageIndex} activeNodeId={activeNodeId}
                    selectedWordIndices={selectedWordIndices}
                    metricRatio={metricRatio} onDoubleClick={onDoubleClick}
                    onSelect={onSelect}
                    itemRefs={itemRefs} onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                    isDragEnabled={isDragEnabled} showAllBboxes={showAllBboxes}
                    useOriginalFonts={useOriginalFonts}
                    onScaleUpdate={onScaleUpdate}
                    onBatchUpdate={onBatchUpdate}
                    isFittingConfirmed={isFittingConfirmed}
                />
            ))}
        </g>
    );
}, (prev, next) => {
    return prev.blocks === next.blocks &&
           prev.nodeEdits === next.nodeEdits &&
           prev.activeNodeId === next.activeNodeId &&
           prev.fontsKey === next.fontsKey &&
           prev.fontStyles === next.fontStyles &&
           prev.metricRatio === next.metricRatio &&
           prev.useOriginalFonts === next.useOriginalFonts &&
           prev.showAllBboxes === next.showAllBboxes &&
           prev.isFittingConfirmed === next.isFittingConfirmed;
});



const SemanticBlock = React.memo(({ isFirstBlock, block, edit, nodeEdits, pageIndex, activeNodeId, selectedWordIndices, metricRatio, onDoubleClick, onSelect, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, showAllBboxes, useOriginalFonts, onScaleUpdate, onBatchUpdate, isFittingConfirmed }) => {
    // console.log("[SemanticBlock] block:", block.id, "useOriginalFonts:", useOriginalFonts);
    const lines = useMemo(() => {
        return block.lines || [];
    }, [block]);

    return (
        <g className={`semantic-block ${block.type}`} id={`block-${block.id}`}>
            {lines.map((line, li) => (
                <g key={li} className="line-row">
                    {line.items && line.items.length > 0 && (
                        <LineRenderer
                            key={line.id || li}
                            isFirstLine={isFirstBlock && li === 0}
                            line={line} 
                            edit={nodeEdits[line.id]} 
                            pageIndex={pageIndex} activeNodeId={activeNodeId}
                            selectedWordIndices={selectedWordIndices}
                            metricRatio={metricRatio} onDoubleClick={onDoubleClick} onSelect={onSelect}
                            onScaleUpdate={onScaleUpdate}
                            itemRef={(el) => itemRefs.current.set(line.id, el)}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            isDragEnabled={isDragEnabled}
                            showAllBboxes={showAllBboxes}
                            useOriginalFonts={useOriginalFonts}
                            onBatchUpdate={onBatchUpdate}
                            isFittingConfirmed={isFittingConfirmed}
                        />
                    )}
                </g>
            ))}
        </g>
    );
});

const LineRenderer = React.memo(({ isFirstLine, line, edit, pageIndex, activeNodeId, selectedWordIndices, metricRatio, onDoubleClick, onSelect, itemRef, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, showAllBboxes, useOriginalFonts, onScaleUpdate, onBatchUpdate, isFittingConfirmed }) => {
    const isActive = activeNodeId === line.id;
    const targetId = line.id;

    const currentEdit = edit || {};
    const isModified = !!currentEdit.isModified;
    const content = currentEdit.content !== undefined ? currentEdit.content : line.content;
    const firstItem = line.items?.[0] || {};
    const initialStartX = currentEdit.origin ? currentEdit.origin[0] : (firstItem?.origin ? firstItem.origin[0] : (firstItem?.bbox ? firstItem.bbox[0] : 0));
    const baselineY = currentEdit.origin ? currentEdit.origin[1] : (firstItem?.origin ? firstItem.origin[1] : (firstItem?.bbox ? firstItem.bbox[1] : 0));
    const isSmallCaps = (firstItem?.font_variant === 'small-caps') || (firstItem?.font || '').toLowerCase().includes('cmcsc');

    // Pick the best representative style item for the line.
    const styleItem = useMemo(() => {
        if (!line.items || line.items.length === 0) return {};
        const startIdx = (isStructuralSpan(line.items[0]) && line.items.length > 1) ? 1 : 0;
        for (let i = startIdx; i < line.items.length; i++) {
            const it = line.items[i];
            if (!it.content || it.content.trim().length === 0) continue;
            if (it.color) {
                const [r, g, b] = it.color;
                const isGray = Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05;
                const brightness = (r + g + b) / 3;
                const isLightGray = isGray && brightness > 0.75;
                if (!isLightGray) return it;
            } else {
                return it;
            }
        }
        for (let i = startIdx; i < line.items.length; i++) {
            if (line.items[i].content && line.items[i].content.trim().length > 0) return line.items[i];
        }
        return line.items[0] || {};
    }, [line]);

    const { calibratedFontSize: baseFontSize, legacyFittingRatio, dynamicPdfWidth: finalPdfWidth, targetBrowserWidth } = useMemo(() => {
        const baseSize = Math.abs(styleItem.size || line.size || 10);
        let totalWidth = 0;

        line.items.forEach((item) => {
            const itemText = item.content || '';
            if (!itemText) return;
            const itemWeight = item.is_bold ? '700' : '400';
            const itemStyle = item.is_italic ? 'italic' : 'normal';
            let itemFamily = normalizeFont(item.font, item.google_font, useOriginalFonts);
            const itemSize = Math.abs(item.size || baseSize) / GLOBAL_FONT_SCALE; // Apply Reduction
            const mappedText = mapContent(itemText);
            if (/[\uf000-\uf999]/.test(mappedText)) {
                itemFamily = '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif';
                MEASURE_CTX.font = `normal 900 ${itemSize}px ${itemFamily}`;
            } else {
                MEASURE_CTX.font = `${itemStyle} ${itemWeight} ${itemSize}px ${itemFamily}`;
            }
            totalWidth += MEASURE_CTX.measureText(itemText).width;
        });

        const measuredWidth = totalWidth;
        const targetWidth = line.width || (line.bbox ? line.bbox[2] - line.bbox[0] : 50);
        let currentTextWidth = measuredWidth;

        if (isModified) {
            const sStyle = currentEdit.safetyStyle || styleItem;
            MEASURE_CTX.font = getRealFontString(
                sStyle.font || styleItem.font,
                sStyle.googleFont || sStyle.google_font || styleItem.google_font,
                getWeightFromFont(sStyle.font || styleItem.font, sStyle.is_bold !== undefined ? sStyle.is_bold : styleItem.is_bold),
                sStyle.size || styleItem.size,
                (sStyle.is_italic !== undefined ? sStyle.is_italic : styleItem.is_italic) ? 'italic' : 'normal',
                useOriginalFonts
            );
            currentTextWidth = MEASURE_CTX.measureText(content || '').width;
        }

        const browserTargetForBaseline = targetWidth * (metricRatio || 1.0);
        let baselineRatio = 1.0;
        if (measuredWidth > browserTargetForBaseline && browserTargetForBaseline > 0) {
            baselineRatio = browserTargetForBaseline / measuredWidth;
        }

        const dynamicPdfW = (currentTextWidth / (metricRatio || 1.0)) * baselineRatio;
        // [FitV4] Red boxes should show the TARGET bounding box from the PDF
        const finalPdfW = targetWidth; // Always show the target container

        return {
            calibratedFontSize: baseSize,
            legacyFittingRatio: baselineRatio,
            dynamicPdfWidth: finalPdfW,
            targetBrowserWidth: currentTextWidth
        };
    }, [line.id, line.width, line.items, styleItem, isModified, metricRatio, currentEdit.safetyStyle, content, useOriginalFonts]);

    useEffect(() => {
        if (isActive && onScaleUpdate) onScaleUpdate(legacyFittingRatio);
    }, [isActive, legacyFittingRatio, onScaleUpdate]);

    const fittingInFlight = useRef(false);

    // [FitV4] High-Fidelity Binary Font Fitting
    useEffect(() => {
        if (!isFittingConfirmed) return;
        
        if (edit?.isFitted) {
            // console.log(`[FitV4] Line ${line.id} already fitted, skipping.`);
            return;
        }
        
        if (fittingInFlight.current) {
            // console.log(`[FitV4] Line ${line.id} fit in flight, skipping.`);
            return;
        }

        const targetWidth = line.width || (line.bbox ? line.bbox[2] - line.bbox[0] : 0);
        if (targetWidth <= 0) return;

        console.log(`[FitV4] Triggering fit for line: ${line.id} (Confirmed: ${isFittingConfirmed})`);

        fittingInFlight.current = true;
        const payload = buildWorkerPayload(line, edit || {}, useOriginalFonts);
        if (!payload || !payload.words) {
            fittingInFlight.current = false;
            return;
        }
        
        // Use a small delay to avoid overwhelming the worker during rapid page loads
        const timer = setTimeout(() => {
            console.log(`[FitV4] Sending ${line.id} to worker...`);
            fontFitManager.fitTextToBbox(payload.words, targetWidth, (results, summary) => {
                console.log(`[FitV4] Worker results for ${line.id}:`, { results: results?.length, scale: summary?.optimalScale });
                if (results && results.length > 0 && summary && onBatchUpdate) {
                    onBatchUpdate([{
                        lineId: line.id,
                        results: results, // Pass full per-word results
                        size: results[0].optimalSize,
                        scale: summary.optimalScale
                    }]);
                }
                fittingInFlight.current = false;
            }, (err) => {
                console.error(`[FitV4] Worker error for ${line.id}:`, err);
                fittingInFlight.current = false;
            });
        }, 50);

        return () => clearTimeout(timer);
    }, [line.id, line.content, useOriginalFonts, onBatchUpdate, edit?.isFitted, isFittingConfirmed, targetBrowserWidth, finalPdfWidth]);

    const finalFontSize = (baseFontSize / GLOBAL_FONT_SCALE); // Apply Reduction

    return (
        <g className="line-group" ref={itemRef} style={{ cursor: isDragEnabled ? 'move' : 'default' }}
            onPointerDown={(e) => isDragEnabled && onPointerDown(e, line.id, initialStartX, baselineY)}
            onPointerMove={isDragEnabled ? onPointerMove : undefined}
            onPointerUp={isDragEnabled ? onPointerUp : undefined}
            onDoubleClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                onDoubleClick(pageIndex, line.id, styleItem, e.currentTarget.getBoundingClientRect(), {
                    safetyStyle: { size: styleItem.size || line.size, font: styleItem.font, color: styleItem.color, is_bold: styleItem.is_bold, is_italic: styleItem.is_italic, font_variant: styleItem.font_variant || 'normal', uri: line.uri }
                });
            }}
            onClick={(e) => {
                if (!isDragEnabled && onSelect) {
                    e.stopPropagation();
                    onSelect(targetId);
                }
            }}
        >
            {(isActive || showAllBboxes) && <rect x={currentEdit.bbox ? currentEdit.bbox[0] : line.x0} y={currentEdit.bbox ? currentEdit.bbox[1] : (line.y - (line.height || line.size || 10))} width={finalPdfWidth} height={line.height || line.size || 12} fill="none" stroke={isActive ? "#2563eb" : "#dc2626"} strokeWidth="2" opacity={isActive ? 1 : 0.8} strokeDasharray={isActive ? "4 2" : "3 1"} pointerEvents="none" style={{ animation: isActive ? 'blink 2s infinite' : 'none' }} />}
            <rect x={(currentEdit.bbox ? currentEdit.bbox[0] : line.x0) - 5} y={(currentEdit.bbox ? currentEdit.bbox[1] : (line.y - (line.height || line.size || 10))) - 4} width={Math.max(50, finalPdfWidth + 10)} height={(line.height || line.size || 12) + 8} fill="transparent" pointerEvents="all" />
            <text
                x={initialStartX} y={baselineY}
                fontSize={Math.max(1, Math.abs(finalFontSize))}
                fontFamily={normalizeFont(currentEdit.safetyStyle?.font || styleItem.font, currentEdit.safetyStyle?.googleFont || currentEdit.safetyStyle?.google_font || styleItem.google_font, useOriginalFonts)}
                fill={getSVGColor(currentEdit.safetyStyle?.color || styleItem.color, 'black')}
                fontStyle={(currentEdit.safetyStyle?.is_italic !== undefined ? currentEdit.safetyStyle.is_italic : styleItem.is_italic) ? 'italic' : 'normal'}
                dominantBaseline="alphabetic" xmlSpace="preserve"
                direction={line.direction || 'ltr'}
                style={{
                    userSelect: 'none',
                    pointerEvents: 'none',
                    whiteSpace: 'pre',
                    letterSpacing: 'normal',
                    transition: 'font-size 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: 'none',
                    transformOrigin: `${initialStartX}px ${baselineY}px`,
                    opacity: 1
                }}
            >
                {isModified ? (
                    (() => {
                        const hasSafetyStyle = currentEdit.safetyStyle && Object.keys(currentEdit.safetyStyle).length > 0;
                        const activeStyle = hasSafetyStyle ? currentEdit.safetyStyle : styleItem;
                        const safeSize = activeStyle.size || styleItem.size || line.size;
                        const activeSmallCaps = (activeStyle.font_variant || 'normal') === 'small-caps' || isSmallCaps;
                        const safeBSize = safeSize;

                        const firstSpan = line.items[0];
                        const bulletTextRaw = firstSpan ? mapContent(firstSpan.content) : '';
                        const bulletTextTrimmed = bulletTextRaw.trim();

                        const isIconBullet = /[\uE000-\uF8FF]/.test(bulletTextRaw);
                        const isBulletItem = firstSpan && isStructuralSpan(firstSpan);
                        const currentContentStr = mapContent(content);

                        const bulletWordCount = bulletTextTrimmed.split(/\s+/).filter(Boolean).length;

                        if (isBulletItem && currentContentStr.trimStart().startsWith(bulletTextTrimmed) && line.items.length > 1) {
                            const bulletIndex = currentContentStr.indexOf(bulletTextTrimmed);
                            const afterBulletContent = currentContentStr.substring(bulletIndex + bulletTextTrimmed.length);
                            const bulletForceX = firstSpan.origin ? firstSpan.origin[0] : firstSpan.bbox[0];
                            const textForceX = line.items[1].origin ? line.items[1].origin[0] : line.items[1].bbox[0];
                            const bulletFontFamily = isIconBullet ? '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif' : normalizeFont(firstSpan.font, firstSpan.google_font, useOriginalFonts);
                            const bulletFontWeight = isIconBullet ? '900' : (firstSpan.is_bold ? '700' : '400');

                            return (
                                <>
                                    <tspan
                                        x={bulletForceX} y={baselineY}
                                        fontFamily={bulletFontFamily}
                                        fontWeight={bulletFontWeight}
                                        fontStyle={firstSpan.is_italic ? 'italic' : 'normal'}
                                        fontSize={Math.max(1, Math.abs(((firstSpan.size || safeSize) / GLOBAL_FONT_SCALE)))}
                                        fill={getSVGColor(firstSpan.color, 'black')}
                                    >
                                        {renderVisualText(bulletTextTrimmed, false, firstSpan.size)}
                                    </tspan>
                                    <tspan
                                        x={textForceX} y={baselineY}
                                        fontStyle='normal'
                                        style={{ fontVariant: activeSmallCaps ? 'small-caps' : 'normal' }}
                                    >
                                        {renderWordStyledText(afterBulletContent.replace(/^\s+/, ''), currentEdit.wordStyles || {}, activeStyle, activeSmallCaps, safeBSize, bulletWordCount, useOriginalFonts)}
                                    </tspan>
                                </>
                            );
                        }

                        return <tspan x={initialStartX} y={baselineY} style={{ fontVariant: activeSmallCaps ? 'small-caps' : 'normal' }}>
                            {renderWordStyledText(currentContentStr, currentEdit.wordStyles || {}, activeStyle, activeSmallCaps, safeBSize, 0, useOriginalFonts)}
                        </tspan>;
                    })()
                ) : (
                    line.items.map((span, si) => {
                        const isOriginalSmallCaps = (span.font_variant === 'small-caps') || (span.font || '').toLowerCase().includes('cmcsc');
                        const spanX = span.origin ? span.origin[0] : span.bbox[0];
                        const prevX1 = si > 0 ? (line.items[si - 1].bbox ? line.items[si - 1].bbox[2] : 0) : -1;
                        const forceX = si === 0 || Math.abs(spanX - prevX1) > 0.5 ? spanX : undefined;
                        const mapped = mapContent(span.content);
                        const isIcon = /[\uf000-\uf999]/.test(mapped);

                        if (span.path_data) {
                            return null; // Rendered as <path> sibling below
                        }

                        return (
                            <tspan
                                key={si}
                                x={forceX}
                                y={span.origin ? span.origin[1] : baselineY}
                                fontSize={Math.max(1, Math.abs((span.size / GLOBAL_FONT_SCALE)))}
                                fontWeight={isIcon ? '900' : (span.is_bold ? '700' : '400')}
                                fontStyle={span.is_italic ? 'italic' : 'normal'}
                                fontFamily={isIcon ? '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif' : normalizeFont(span.font, span.google_font, useOriginalFonts)}
                                fill={getSVGColor(span.color, 'black')}
                                xmlSpace="preserve"
                                style={{ fontFeatureSettings: isOriginalSmallCaps ? '"smcp"' : 'normal', fontVariant: isOriginalSmallCaps ? 'small-caps' : 'normal' }}>
                                {renderVisualText(mapped, isOriginalSmallCaps, (span.size / GLOBAL_FONT_SCALE))}
                            </tspan>
                        );
                    })
                )}
            </text>
            {/* Render any paths that were skipped inside the <text> block because they aren't valid children */}
            {line.items.map((span, si) => {
                if (!span.path_data || isModified) return null;
                const spanX = span.origin ? span.origin[0] : span.bbox[0];
                const spanY = span.origin ? span.origin[1] : baselineY;
                const spanSize = span.size / GLOBAL_FONT_SCALE;
                const pathScale = spanSize / 1000;
                return (
                    <path
                        key={`vector-${si}`}
                        d={span.path_data}
                        fill={getSVGColor(span.color, 'black')}
                        transform={`translate(${spanX}, ${spanY}) scale(${pathScale}, ${-pathScale})`}
                        pointerEvents="none"
                    />
                );
            })}
            {isActive && <line x1={currentEdit.bbox ? currentEdit.bbox[0] : line.x0} y1={currentEdit.bbox ? currentEdit.bbox[3] : (line.bbox ? line.bbox[3] : line.y)} x2={(currentEdit.bbox ? currentEdit.bbox[0] : line.x0) + (currentEdit.bbox ? (currentEdit.bbox[2] - currentEdit.bbox[0]) : (line.width || line.x1 - line.x0 || 50))} y2={currentEdit.bbox ? currentEdit.bbox[3] : (line.bbox ? line.bbox[3] : line.y)} stroke="#f6763bff" strokeWidth="1.5" opacity="0.8" pointerEvents="none" />}
        </g>
    );
});

export { LineRenderer };

