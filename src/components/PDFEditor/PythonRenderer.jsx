import React, { useMemo, useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRendererEngine } from '../engine/WebEngine';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';
import { ReflowEngine } from '../../lib/pdf-extractor/ReflowEngine';
import { MEASURE_CTX, getRealFontString, normalizeFont, getWeightFromFont } from './reflowUtils';

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
                fontSize={Math.max(1, (baseSize || 10) * 0.75)}
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
const renderWordStyledText = (text, wordStyles, safetyStyle, isSmallCaps, baseSize) => {
    if (!text) return text;

    // Split into words, preserving spaces
    const parts = text.split(/(\s+)/);
    let wordCounter = 0;

    return parts.map((part, i) => {
        const isSpace = /^\s+$/.test(part);
        const style = (!isSpace && wordStyles?.[wordCounter]) ? wordStyles[wordCounter] : {};
        if (!isSpace) wordCounter++;

        const spanStyle = { ...safetyStyle, ...style };
        const spanIsSmallCaps = spanStyle.font_variant === 'small-caps' || isSmallCaps;
        const spanSize = Math.abs(spanStyle.size || baseSize);
        const spanColor = getSVGColor(spanStyle.color, 'inherit');
        const spanWeight = getWeightFromFont(spanStyle.font, spanStyle.is_bold);
        const spanItalic = spanStyle.is_italic ? 'italic' : 'normal';
        const spanFamily = normalizeFont(spanStyle.font, spanStyle.googleFont);

        return (
            <tspan
                key={i}
                fontSize={spanSize}
                fill={spanColor}
                fontWeight={spanWeight}
                fontStyle={spanItalic}
                fontFamily={spanFamily.replace(/'/g, "")}
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

const PythonRenderer = React.memo(({ page, pageIndex, activeNodeId, selectedWordIndices = [], fontsKey, fonts, nodeEdits, onUpdate, onSelect, onDoubleClick, scale, isFitMode, isFitModeV2, onFitUpdate, onFitUpdateBatch, isReflowEnabled, onMove, isDragEnabled, onCalibrated, showAllBboxes, onScaleUpdate }) => {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    // Reflow Engine was removed as it broke bounding box logic
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [isReady, setIsReady] = useState(false);
    const [metricRatio, setMetricRatio] = useState(1.0);

    // --- DRAG ENGINE ---
    const itemRefs = useRef(new Map());
    const workerRef = useRef(null);

    // Initialize MeasureWorker on mount
    useEffect(() => {
        if (!workerRef.current) {
            console.log("[PythonRenderer] Initializing MeasureWorker for Page", pageIndex + 1);
            workerRef.current = new Worker('/workers/MeasureWorker.js');
            workerRef.current.postMessage({ type: 'init' });
        }
        return () => {
            if (workerRef.current) {
                console.log("[PythonRenderer] Terminating MeasureWorker for Page", pageIndex + 1);
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    const dragRef = useRef({
        draggingId: null,
        startX: 0,
        startY: 0,
        itemStartX: 0,
        itemStartY: 0,
        node: null
    });

    // --- BATCH FIT V3 COORDINATION ---
    const onFitUpdateBatchRef = useRef(onFitUpdateBatch);
    useLayoutEffect(() => {
        onFitUpdateBatchRef.current = onFitUpdateBatch;
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
                    const font = normalizeFont(item.font, item.google_font).replace(/'/g, "");
                    const weight = getWeightFromFont(item.font, item.is_bold);
                    const fontStyle = item.is_italic ? 'italic' : 'normal';
                    const fontStr = `${fontStyle} ${weight} ${item.size}px "${font}", sans-serif`;

                    let resultW = 0;
                    try {
                        if (workerRef.current) {
                            const measure = (type = 'measure', params = {}) => new Promise((resolve) => {
                                const handler = (e) => {
                                    if (e.data.type === 'measureResult' || e.data.type === 'measureFitResult') {
                                        workerRef.current.removeEventListener('message', handler);
                                        resolve(e.data);
                                    }
                                };
                                workerRef.current.addEventListener('message', handler);
                                workerRef.current.postMessage({ type, ...params, font: fontStr, text: item.content });
                                setTimeout(() => resolve(null), 1000);
                            });

                            const data = await measure('measure');
                            resultW = data ? data.width : 0;
                        }
                    } catch (e) {
                        resultW = 0;
                    }

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
    }, [page, fontsKey]);


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
    const PT_TO_PX = 1.333333;

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
                            blocks={page.blocks} nodeEdits={nodeEdits || {}} pageIndex={pageIndex} activeNodeId={activeNodeId}
                            selectedWordIndices={selectedWordIndices} fontsKey={fontsKey} fontStyles={fontStyles} metricRatio={metricRatio}
                            onDoubleClick={onDoubleClick} onSelect={onSelect} isFitMode={isFitMode} isFitModeV2={isFitModeV2} onFitUpdate={onFitUpdate} isReflowEnabled={isReflowEnabled} workerRef={workerRef}
                            itemRefs={itemRefs} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} isDragEnabled={isDragEnabled}
                            showAllBboxes={showAllBboxes} onScaleUpdate={onScaleUpdate}
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
        prev.isFitMode === next.isFitMode &&
        prev.isFitModeV2 === next.isFitModeV2 &&
        prev.onFitUpdate === next.onFitUpdate &&
        prev.isReflowEnabled === next.isReflowEnabled &&
        prev.showAllBboxes === next.showAllBboxes;
});

export default PythonRenderer;

// Typographic tools moved to reflowUtils.js

function EditableTextLayer({ items, nodeEdits, activeNodeId, height, pageIndex, fontsKey, fonts, fontStyles, metricRatio, onDoubleClick, isFitMode, workerRef, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled }) {
    return (
        <g className="text-layer" key={fontsKey}>
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {items.map((item, i) => (
                <EditableTextItem
                    key={item.id || i} item={item} index={i} edit={nodeEdits[item.id] || {}} pageIndex={pageIndex}
                    activeNodeId={activeNodeId} fonts={fonts} metricRatio={metricRatio} isFitMode={isFitMode}
                    onDoubleClick={onDoubleClick} workerRef={workerRef} itemRef={(el) => itemRefs.current.set(item.id || i, el)}
                    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} isDragEnabled={isDragEnabled}
                />
            ))}
        </g>
    );
}

function EditableTextItem({ item, index, edit, pageIndex, activeNodeId, fonts, metricRatio, isFitMode, onDoubleClick, workerRef, itemRef, onPointerDown, onPointerMove, onPointerUp, isDragEnabled }) {
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
    let measureFamily = matchingFont ? `'${matchingFont.name}'` : normalizeFont(sStyle.font, sStyle.googleFont || sStyle.google_font);
    if (measureFamily.includes('var(')) {
        measureFamily = getRealFontString(sStyle.font, sStyle.googleFont, weight, sStyle.size, style).split(' px ')[1] || 'serif';
    }
    MEASURE_CTX.font = `${style} ${weight} ${sStyle.size}px ${measureFamily}`;
    const measuredWidth = MEASURE_CTX.measureText(content || "").width;

    const { finalFittedFontSize, fittingScale, currentPdfWidth: finalCurrentPdfWidth, targetWidth: finalTargetWidth } = useMemo(() => {
        // CSS SCALE FIT MODE: Instead of adjusting font size, we scale the entire text element horizontally
        const targetWidth = rectW;
        const currentPdfWidth = measuredWidth / (metricRatio || 1.0);
        const isBullet = /^[\u2022\u25E6\u25A0\u2023\u25B8\u2043\u2219\xB7\xD7\xBB\-\u2013\u2014]/.test(content.trim()) || (content.trim().length === 1 && !/[a-zA-Z0-9]/.test(content.trim()));

        let fittingScale = (isFitMode && !isBullet && currentPdfWidth > 0 && Math.abs(currentPdfWidth - targetWidth) > 1.0)
            ? (targetWidth / currentPdfWidth)
            : 1.0;

        // LESS RESTRICTIVE CONSTRAINT: Allow slight scaling up (stretch) to perfectly fill bounding box
        if (fittingScale > 1.05) fittingScale = 1.05;

        return {
            finalFittedFontSize: (sStyle.size || item.size) * OPTICAL_HEIGHT_FACTOR,
            fittingScale,
            currentPdfWidth,
            targetWidth
        };
    }, [isFitMode, rectW, measuredWidth, metricRatio, content, sStyle, item]);

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
                fontSize={Math.max(1, Math.abs(finalFittedFontSize))} fontFamily={measureFamily.replace(/'/g, "")}
                fontWeight={renderWeight} fontStyle={style} fill={getSVGColor(sStyle.color, color)}
                dominantBaseline="alphabetic"
                style={{
                    userSelect: 'none',
                    pointerEvents: 'none',
                    transform: fittingScale !== 1.0 ? `scale(${fittingScale}, 1)` : 'none',
                    transformOrigin: `${startX}px ${baselineY}px`
                }}
                data-fit-measured-width={finalCurrentPdfWidth}
                data-fit-target-width={finalTargetWidth}
                data-fit-scale={fittingScale}
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
                            <tspan key={si} x={forceX ? spanX : undefined} y={span.origin ? span.origin[1] : (span.y || item.y)} fontSize={Math.max(1, Math.abs(spanSize))} fill={getSVGColor(span.color, color)} fontWeight={spanIsSmallCaps ? '500' : (span.is_bold ? '700' : '400')} fontStyle={span.is_italic ? 'italic' : undefined} fontFamily={span.font ? normalizeFont(span.font, span.google_font) : undefined} xmlSpace="preserve" style={{ fontVariant: spanIsSmallCaps ? 'small-caps' : 'normal' }}>
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

function BlockLayer({ blocks, nodeEdits, pageIndex, activeNodeId, selectedWordIndices, fontsKey, fontStyles, metricRatio, onDoubleClick, onSelect, isFitMode, isFitModeV2, onFitUpdate, onFitUpdateBatch, isReflowEnabled, workerRef, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, showAllBboxes, onScaleUpdate }) {
    return (
        <g className="block-layer" key={fontsKey}>
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {blocks.map((block, bi) => (
                <SemanticBlock key={block.id || bi} block={block} nodeEdits={nodeEdits} pageIndex={pageIndex} activeNodeId={activeNodeId} selectedWordIndices={selectedWordIndices} metricRatio={metricRatio} onDoubleClick={onDoubleClick} onSelect={onSelect} isFitMode={isFitMode} isFitModeV2={isFitModeV2} onFitUpdate={onFitUpdate} isReflowEnabled={isReflowEnabled} workerRef={workerRef} itemRefs={itemRefs} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} isDragEnabled={isDragEnabled} showAllBboxes={showAllBboxes} onScaleUpdate={onScaleUpdate} />
            ))}
        </g>
    );
}

function BlockContainer({ block, edit, nodeEdits, pageIndex, activeNodeId, metricRatio, onDoubleClick, onSelect, isFitMode, isFitModeV2, workerRef, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, showAllBboxes, onScaleUpdate }) {
    const isList = block.type === 'list_item';
    const bbox = block.bbox || [0, 0, 100, 100];
    const width = bbox[2] - bbox[0];
    const height = bbox[3] - bbox[1];

    // Calculate dynamic line-height from original PDF metrics
    const lineHeightRatio = useMemo(() => {
        if (block.lines.length < 2) return 1.4;
        const deltaY = block.lines[1].y - block.lines[0].y;
        const fontSize = block.lines[0].size || 10;
        return (deltaY / fontSize).toFixed(2);
    }, [block.lines]);

    // Aggregate text with style retention
    const displayContent = edit.content !== undefined ? edit.content : null;

    const renderContent = () => {
        if (displayContent !== null) {
            return displayContent;
        }

        return block.lines.map((line, li) => (
            <span key={li} style={{ display: 'block' }}>
                {(line.fragments || []).map((frag, fi) => (
                    <span
                        key={fi}
                        style={{
                            fontWeight: frag.is_bold ? 'bold' : 'normal',
                            fontStyle: frag.is_italic ? 'italic' : 'normal',
                            color: frag.color ? `rgb(${frag.color.join(',')})` : 'inherit',
                            fontSize: frag.size ? `${frag.size}px` : 'inherit'
                        }}
                    >
                        {frag.text}
                    </span>
                ))}
                {li < block.lines.length - 1 ? ' ' : ''}
            </span>
        ));
    };

    const styleItem = block.lines[0]?.items[0] || {};
    const baseFontSize = Math.abs(styleItem.size || block.style?.size || 10);
    const fontFamily = normalizeFont(styleItem.font || block.style?.font || 'Source Serif 4', styleItem.googleFont);

    // Fit Mode Scaling for Block
    const fittingScale = useMemo(() => {
        if (!isFitMode) return 1.0;

        const measureFamily = fontFamily;
        MEASURE_CTX.font = `${styleItem.is_italic ? 'italic' : 'normal'} ${getWeightFromFont(styleItem.font, styleItem.is_bold)} ${baseFontSize}px ${measureFamily}`;

        let maxWidth = 0;

        if (displayContent !== null) {
            // Measure the edited content (as a single block or split by lines)
            const lines = displayContent.split('\n');
            lines.forEach(lineContent => {
                const measured = MEASURE_CTX.measureText(lineContent).width;
                const pdfMeasured = measured / (metricRatio || 1.0);
                if (pdfMeasured > maxWidth) maxWidth = pdfMeasured;
            });
        } else {
            // Measure original lines
            block.lines.forEach(line => {
                const lineContent = line.content || "";
                const measured = MEASURE_CTX.measureText(lineContent).width;
                const pdfMeasured = measured / (metricRatio || 1.0);
                if (pdfMeasured > maxWidth) maxWidth = pdfMeasured;
            });
        }

        const targetWidth = width;
        if (maxWidth > targetWidth + 1.0) {
            return Math.min(1.0, targetWidth / maxWidth);
        }
        return 1.0;
    }, [block.lines, displayContent, isFitMode, width, metricRatio, baseFontSize, fontFamily, styleItem]);

    const isBlockActive = activeNodeId === `block-reflow-${block.id}` || block.lines.some(l => l.id === activeNodeId);
    useEffect(() => {
        if (isBlockActive && onScaleUpdate) {
            onScaleUpdate(fittingScale);
        }
    }, [isBlockActive, fittingScale, onScaleUpdate]);

    return (
        <foreignObject
            x={bbox[0] - 5}
            y={bbox[1] - (baseFontSize * 0.8)} // Align top of container with cap height
            width={width + 60}
            height={height + 200}
            className={`block-container ${block.type}`}
            style={{ pointerEvents: 'none' }}
        >
            <div
                xmlns="http://www.w3.org/1999/xhtml"
                style={{
                    fontFamily: fontFamily,
                    fontSize: `${baseFontSize}px`,
                    color: styleItem.color ? `rgb(${styleItem.color.join(',')})` : 'black',
                    lineHeight: lineHeightRatio,
                    width: `${width}px`,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    outline: 'none',
                    minHeight: '1em',
                    padding: '4px',
                    border: '1px dashed rgba(59, 130, 246, 0.4)',
                    backgroundColor: 'rgba(59, 130, 246, 0.02)',
                    borderRadius: '2px',
                    pointerEvents: 'auto',
                    textAlign: block.is_right_aligned ? 'right' : 'left',
                    transform: fittingScale !== 1.0 ? `scale(${fittingScale}, 1)` : 'none',
                    transformOrigin: 'left top'
                }}
                contentEditable={isDragEnabled}
                suppressContentEditableWarning={true}
                onDoubleClick={(e) => onDoubleClick(e, `block-reflow-${block.id}`)}
                onClick={(e) => {
                    if (!isDragEnabled && onSelect) {
                        e.stopPropagation();
                        onSelect(`block-reflow-${block.id}`);
                    }
                }}
            >
                {isList ? (
                    <ul style={{ margin: 0, paddingLeft: '1.2em', listStyleType: 'disc' }}>
                        <li>{renderContent()}</li>
                    </ul>
                ) : (
                    renderContent()
                )}
            </div>
        </foreignObject>
    );
}

function SemanticBlock({ block, nodeEdits, pageIndex, activeNodeId, selectedWordIndices, metricRatio, onDoubleClick, onSelect, isFitMode, isFitModeV2, onFitUpdate, isReflowEnabled, workerRef, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, showAllBboxes, onScaleUpdate }) {
    const edit = nodeEdits[block.id] || {};
    const isModified = !!edit.isModified;
    const lines = useMemo(() => {
        return block.lines || [];
    }, [block]);

    const isBlockActive = activeNodeId === `block-reflow-${block.id}` || lines.some(l => l.id === activeNodeId);

    // Determine if this block should use the new BlockContainer rendering
    const containerTypes = ['paragraph', 'list_item', 'heading', 'metadata_row', 'caption', 'code_block'];
    const shouldUseContainer = isReflowEnabled && containerTypes.includes(block.type);

    // --- V2 FIT MODE: Block-level uniform scale ---
    // V2 computes ONE scale for the entire block by measuring only the REPRESENTATIVE line:
    //   - For paragraphs: the first line (the widest line that sets the paragraph's bbox width)
    //   - For list_items: the first line that has is_bullet_start=true (ignore continuation lines)
    //   - For all other types: the first line
    // All lines in the block then share that single scale so typography stays uniform.
    const v2ForcedScale = useMemo(() => {
        if (!isFitModeV2 || lines.length === 0) return undefined;

        // Pick representative line: for list_item blocks, use the bullet-start line
        let repLine = lines[0];
        if (block.type === 'list_item') {
            repLine = lines.find(l => l.is_bullet_start) || lines[0];
        }

        const edit = nodeEdits[repLine.id] || {};
        const sStyle = edit.safetyStyle || repLine.items?.[0] || {};
        const baseSize = Math.abs(sStyle.size || repLine.size || 10);
        const content = edit.content !== undefined ? edit.content : (repLine.content || '');

        const measureFamily = normalizeFont(
            sStyle.font || repLine.items?.[0]?.font,
            sStyle.googleFont || repLine.items?.[0]?.google_font
        );
        MEASURE_CTX.font = `${sStyle.is_italic ? 'italic' : 'normal'} ${getWeightFromFont(sStyle.font || repLine.items?.[0]?.font, sStyle.is_bold)} ${baseSize}px ${measureFamily}`;
        const measuredWidth = MEASURE_CTX.measureText(content).width;
        const currentPdfWidth = measuredWidth / (metricRatio || 1.0);

        const targetWidth = repLine.width || (repLine.bbox ? repLine.bbox[2] - repLine.bbox[0] : (block.bbox ? block.bbox[2] - block.bbox[0] : 50));

        if (currentPdfWidth > 0 && Math.abs(currentPdfWidth - targetWidth) > 1.0) {
            const scale = targetWidth / currentPdfWidth;
            return Math.min(1.0, scale); // Never scale up
        }
        return 1.0;
    }, [isFitModeV2, lines, block, nodeEdits, metricRatio]);

    return (
        <g className={`semantic-block ${block.type}`} id={`block-${block.id}`}>
            {isReflowEnabled && isBlockActive && block.bbox && (
                <rect
                    x={block.bbox[0] - 2}
                    y={block.bbox[1] - 2}
                    width={block.bbox[2] - block.bbox[0] + 4}
                    height={block.bbox[3] - block.bbox[1] + 4}
                    fill="none"
                    stroke="var(--brand-primary, #3b82f6)"
                    strokeWidth="2"
                    opacity="0.8"
                    pointerEvents="none"
                />
            )}
            {shouldUseContainer ? (
                <BlockContainer
                    block={block} edit={edit} nodeEdits={nodeEdits}
                    pageIndex={pageIndex} activeNodeId={activeNodeId}
                    metricRatio={metricRatio} onDoubleClick={onDoubleClick} onSelect={onSelect}
                    isFitMode={isFitMode} isFitModeV2={isFitModeV2} onFitUpdate={onFitUpdate}
                    workerRef={workerRef}
                    itemRefs={itemRefs} onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                    isDragEnabled={isDragEnabled}
                    showAllBboxes={showAllBboxes}
                    onScaleUpdate={onScaleUpdate}
                />
            ) : (
                lines.map((line, li) => (
                    <g key={li} className="line-row">
                        {line.items && line.items.length > 0 && (
                            <LineRenderer
                                key={line.id || li}
                                line={line} block={block} nodeEdits={nodeEdits}
                                pageIndex={pageIndex} activeNodeId={activeNodeId}
                                selectedWordIndices={selectedWordIndices}
                                metricRatio={metricRatio} onDoubleClick={onDoubleClick} onSelect={onSelect}
                                isFitMode={isFitMode}
                                isFitModeV2={isFitModeV2}
                                onFitUpdate={onFitUpdate}
                                forcedScale={v2ForcedScale}
                                isReflowEnabled={isReflowEnabled}
                                workerRef={workerRef}
                                itemRef={(el) => itemRefs.current.set(line.id, el)}
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                isDragEnabled={isDragEnabled}
                                showAllBboxes={showAllBboxes}
                                onScaleUpdate={onScaleUpdate}
                            />
                        )}
                    </g>
                ))
            )}
        </g>
    );
}

function LineRenderer({ line, block, nodeEdits, pageIndex, activeNodeId, selectedWordIndices, metricRatio, onDoubleClick, onSelect, isFitMode, isFitModeV2, onFitUpdate, forcedScale, isReflowEnabled, workerRef, itemRef, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, showAllBboxes, onFitUpdateBatch, onScaleUpdate }) {
    const targetId = (isReflowEnabled && line.blockId) ? `block-reflow-${line.blockId}` : line.id;
    const isActive = activeNodeId === targetId;

    // --- ASYNC WORKER FITTING (Exact legacy copy) ---
    const [workerFontSize, setWorkerFontSize] = useState(null);

    useEffect(() => {
        if (!isFitMode || !workerRef?.current || !line) {
            setWorkerFontSize(null);
            return;
        }

        const edit = nodeEdits[line.id] || {};
        const content = edit.content !== undefined ? edit.content : line.content || "";

        const runWorkerFit = () => {
            const sStyle = edit.safetyStyle || styleItem;
            const fontStr = getRealFontString(
                sStyle.font || styleItem.font,
                sStyle.googleFont || sStyle.google_font || styleItem.google_font,
                getWeightFromFont(sStyle.font || styleItem.font, sStyle.is_bold !== undefined ? sStyle.is_bold : styleItem.is_bold),
                sStyle.size || styleItem.size,
                (sStyle.is_italic !== undefined ? sStyle.is_italic : styleItem.is_italic) ? 'italic' : 'normal'
            );

            const targetWidth = line.width || (line.bbox ? line.bbox[2] - line.bbox[0] : 50);
            const browserTarget = targetWidth * (metricRatio || 1.0);

            const handler = (e) => {
                if (e.data.type === 'measureFitResult' && e.data.id === line.id) {
                    workerRef.current.removeEventListener('message', handler);
                    setWorkerFontSize(e.data.fontSize);

                    // 🔧 MODIFICATION: Use existing handler instead of direct update
                    if (onFitUpdateBatch) {
                        onFitUpdateBatch({
                            [line.id]: {
                                fontSize: e.data.fontSize,
                                font: sStyle.font || styleItem.font,
                                is_bold: sStyle.is_bold !== undefined ? sStyle.is_bold : styleItem.is_bold,
                                is_italic: sStyle.is_italic !== undefined ? sStyle.is_italic : styleItem.is_italic
                            }
                        });
                    }
                }
            };
            workerRef.current.addEventListener('message', handler);
            workerRef.current.postMessage({
                type: 'measureFit',
                fontBase: fontStr,
                text: content,
                targetWidth: browserTarget,
                id: line.id
            });
        };

        // DECOUPLED BINARY FOR NOW: Disabling worker execution to rely purely on CSS scaling
        // runWorkerFit();
    }, [isFitMode, line, line.width, metricRatio, workerRef, nodeEdits, onFitUpdateBatch]);

    // Pick the best representative style item for the line (skip pure-gray chars)
    const styleItem = useMemo(() => {
        if (!line.items || line.items.length === 0) return {};
        for (const it of line.items) {
            if (it.content && it.content.trim().length > 0 && it.color) {
                const [r, g, b] = it.color;
                const isGray = Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05;
                if (!isGray || r > 0.4 || g > 0.4 || b > 0.4) return it;
            }
        }
        return line.items[0] || {};
    }, [line]);

    const edit = nodeEdits[line.id] || {};
    const isModified = !!edit.isModified;
    const content = (isReflowEnabled && line.blockId) ? line.content : (edit.content !== undefined ? edit.content : line.content);
    const firstItem = line.items?.[0] || {};
    const initialStartX = edit.origin ? edit.origin[0] : (firstItem?.origin ? firstItem.origin[0] : (firstItem?.bbox ? firstItem.bbox[0] : 0));
    const baselineY = edit.origin ? edit.origin[1] : (firstItem?.origin ? firstItem.origin[1] : (firstItem?.bbox ? firstItem.bbox[1] : 0));
    const isSmallCaps = (firstItem?.font_variant === 'small-caps') || (firstItem?.font || '').toLowerCase().includes('cmcsc');
    // --- LEGACY FONT SIZE CALCULATION (Exact copy) ---
    const { calibratedFontSize: finalFontSize, fittingRatio: finalFittingRatio, dynamicPdfWidth: finalPdfWidth, targetBrowserWidth, chosenWeight: finalWeight } = useMemo(() => {
        const baseSize = Math.abs(styleItem.size || line.size || 10);

        // --- MULTI-SPAN MEASUREMENT ENGINE ---
        let totalWidth = 0;
        let measureFontSummary = "";

        line.items.forEach((item, idx) => {
            const itemText = item.content || '';
            if (!itemText) return;

            const itemWeight = item.is_bold ? '700' : '400';
            const itemStyle = item.is_italic ? 'italic' : 'normal';
            let itemFamily = normalizeFont(item.font, item.google_font);
            const itemSize = Math.abs(item.size || baseSize);

            // Icon Detection (PUA Ranges)
            const mappedText = mapContent(itemText);
            const isItemIcon = /[\uf000-\uf999]/.test(mappedText);

            let mWeight = itemWeight;
            let mStyle = itemStyle;
            if (isItemIcon) {
                itemFamily = '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif';
                mWeight = '900';
                mStyle = 'normal';
            }

            MEASURE_CTX.font = `${mStyle} ${mWeight} ${itemSize}px ${itemFamily}`;
            const itemWidth = MEASURE_CTX.measureText(itemText).width;
            totalWidth += itemWidth;

            if (idx === 0 || isItemIcon) {
                measureFontSummary = `${mStyle} ${mWeight} ${itemSize}px ${itemFamily.substring(0, 20)}...`;
            }
        });

        const measuredWidth = totalWidth;
        const targetWidth = line.width || (line.bbox ? line.bbox[2] - line.bbox[0] : 50);

        // --- HYBRID ENGINE: GROWTH + SCALING ---
        let currentTextWidth = measuredWidth;

        if (isModified) {
            const sStyle = edit.safetyStyle || styleItem;
            const fontStr = getRealFontString(
                sStyle.font || styleItem.font,
                sStyle.googleFont || sStyle.google_font || styleItem.google_font,
                getWeightFromFont(sStyle.font || styleItem.font, sStyle.is_bold !== undefined ? sStyle.is_bold : styleItem.is_bold),
                sStyle.size || styleItem.size,
                (sStyle.is_italic !== undefined ? sStyle.is_italic : styleItem.is_italic) ? 'italic' : 'normal'
            );
            MEASURE_CTX.font = fontStr;
            currentTextWidth = MEASURE_CTX.measureText(content || '').width;
        }

        // Calculate the baseline calibration scale of the original unedited text
        const browserTargetForBaseline = targetWidth * (metricRatio || 1.0);
        let baselineRatio = 1.0;
        if (measuredWidth > browserTargetForBaseline && browserTargetForBaseline > 0) {
            baselineRatio = browserTargetForBaseline / measuredWidth;
        }

        const dynamicPdfW = (currentTextWidth / (metricRatio || 1.0)) * baselineRatio;
        
        // ALLOW expansion in all modes when editing, so the text isn't statically squished when adding new words.
        const finalPdfW = isModified ? Math.max(targetWidth, dynamicPdfW) : targetWidth;

        // --- HYBRID SCALING (Relative to DYNAMIC BBOX) ---
        const safetyCushion = 0.5;
        const effectiveDynamicTarget = Math.max(1, finalPdfW - safetyCushion);

        let chosenWeight = getWeightFromFont(edit.safetyStyle?.font || styleItem.font, edit.safetyStyle?.is_bold !== undefined ? edit.safetyStyle?.is_bold : styleItem.is_bold);

        // Retain the baseline optical look so we don't 'pop' to 1.0x
        let ratio = baselineRatio; 

        if (currentTextWidth > 0 && isModified) {
            const currentBrowserTarget = effectiveDynamicTarget * (metricRatio || 1.0);
            if (currentTextWidth > currentBrowserTarget) {
               ratio = currentBrowserTarget / currentTextWidth;
            }
        }

        // LESS RESTRICTIVE SCALING: Allow up to 1.05 and down to 0.4
        const maxRatio = isFitMode ? 1.05 : 1.25;
        const safeRatio = Math.min(maxRatio, Math.max(0.4, ratio));

        // Use worker result if available and we are in fit mode
        let fontSizeResult;
        // DECOUPLED BINARY FOR NOW
        // if (isFitMode && workerFontSize) {
        //     fontSizeResult = workerFontSize;
        // } else {
            fontSizeResult = baseSize * safeRatio;
        // }

        return {
            calibratedFontSize: fontSizeResult,
            fittingRatio: safeRatio,
            dynamicPdfWidth: finalPdfW,
            targetBrowserWidth: currentTextWidth,
            chosenWeight: chosenWeight
        };
    }, [line, styleItem, isModified, metricRatio, isFitMode, edit.safetyStyle, workerFontSize, content]);

    // Update HUD with scale value for the actively selected line
    useEffect(() => {
        if (isActive && onScaleUpdate) {
            onScaleUpdate(finalFittingRatio);
        }
    }, [isActive, finalFittingRatio, onScaleUpdate]);

    // BBox Debug console log removed

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
            {/* DEBUG: Red Bounding Box for ALL text - Show when showAllBboxes is true */}
            {(isActive || showAllBboxes) && <rect x={edit.bbox ? edit.bbox[0] : line.x0} y={edit.bbox ? edit.bbox[1] : (line.y - (line.height || line.size || 10))} width={finalPdfWidth} height={line.height || line.size || 12} fill="none" stroke={isActive ? "#2563eb" : "#dc2626"} strokeWidth="2" opacity={isActive ? 1 : 0.8} strokeDasharray={isActive ? "4 2" : "3 1"} pointerEvents="none" style={{ animation: isActive ? 'blink 2s infinite' : 'none' }} />}
            <rect x={(edit.bbox ? edit.bbox[0] : line.x0) - 5} y={(edit.bbox ? edit.bbox[1] : (line.y - (line.height || line.size || 10))) - 4} width={Math.max(50, finalPdfWidth + 10)} height={(line.height || line.size || 12) + 8} fill="transparent" pointerEvents="all" />
            <text
                x={initialStartX} y={baselineY}
                fontSize={Math.max(1, Math.abs(finalFontSize))}
                fontFamily={normalizeFont(edit.safetyStyle?.font || styleItem.font, edit.safetyStyle?.googleFont || edit.safetyStyle?.google_font || styleItem.google_font)}
                fill={getSVGColor(edit.safetyStyle?.color || styleItem.color, 'black')}
                fontStyle={(edit.safetyStyle?.is_italic !== undefined ? edit.safetyStyle.is_italic : styleItem.is_italic) ? 'italic' : 'normal'}
                fontWeight={finalWeight}
                dominantBaseline="alphabetic" xmlSpace="preserve"
                style={{
                    userSelect: 'none',
                    pointerEvents: 'none',
                    whiteSpace: 'pre',
                    letterSpacing: 'normal',
                    transform: finalFittingRatio !== 1.0 ? `scale(${finalFittingRatio}, 1)` : 'none',
                    transformOrigin: `${initialStartX}px ${baselineY}px`
                }}
                data-fit-measured-width={finalPdfWidth}
                data-fit-target-width={targetBrowserWidth}
                data-fit-scale={finalFittingRatio}
            >
                {isModified ? (
                    (() => {
                        const hasSafetyStyle = edit.safetyStyle && Object.keys(edit.safetyStyle).length > 0;
                        const activeStyle = hasSafetyStyle ? edit.safetyStyle : styleItem;
                        const safeSize = activeStyle.size || styleItem.size || line.size;
                        const activeSmallCaps = (activeStyle.font_variant || 'normal') === 'small-caps' || isSmallCaps;
                        const safeBSize = safeSize; // No internal scaling, scale is on parent
                        return <tspan x={initialStartX} y={baselineY} style={{ fontVariant: activeSmallCaps ? 'small-caps' : 'normal' }}>
                            {renderWordStyledText(mapContent(content), edit.wordStyles || {}, activeStyle, activeSmallCaps, safeBSize)}
                        </tspan>;
                    })()
                ) : (
                    line.items.map((span, si) => {
                        const isOriginalSmallCaps = (span.font_variant === 'small-caps') || (span.font || '').toLowerCase().includes('cmcsc');
                        const spanX = span.origin ? span.origin[0] : span.bbox[0];
                        // Only force an explicit x if there's a meaningful gap from the previous span
                        const prevX1 = si > 0 ? (line.items[si - 1].bbox ? line.items[si - 1].bbox[2] : 0) : -1;
                        const forceX = si === 0 || Math.abs(spanX - prevX1) > 0.5 ? spanX : undefined;
                        const mapped = mapContent(span.content);
                        const isIcon = /[\uf000-\uf999]/.test(mapped);

                        if (['■', '●', '•', '➢', '➤', '▪', '□'].includes(mapped.trim())) {
                            // console.log(`[Bullet Render] spanX=${spanX.toFixed(2)}, baselineY=${baselineY.toFixed(2)}, char='${mapped}', font='${span.font}', isSmallCaps=${isOriginalSmallCaps}`);
                        }

                        return (
                            <tspan
                                key={si}
                                x={forceX}
                                y={span.origin ? span.origin[1] : baselineY}
                                fontSize={Math.max(1, Math.abs(span.size))}
                                fontWeight={isIcon ? '900' : (span.is_bold ? '700' : '400')}
                                fontStyle={span.is_italic ? 'italic' : 'normal'}
                                fontFamily={isIcon ? '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif' : normalizeFont(span.font, span.google_font)}
                                fill={getSVGColor(span.color, 'black')}
                                xmlSpace="preserve"
                                style={{ fontFeatureSettings: isOriginalSmallCaps ? '"smcp"' : 'normal', fontVariant: isOriginalSmallCaps ? 'small-caps' : 'normal' }}>
                                {renderVisualText(mapped, isOriginalSmallCaps, span.size)}
                            </tspan>
                        );
                    })
                )}
            </text>
            {isActive && <line x1={edit.bbox ? edit.bbox[0] : line.x0} y1={edit.bbox ? edit.bbox[3] : (line.bbox ? line.bbox[3] : line.y)} x2={(edit.bbox ? edit.bbox[0] : line.x0) + (edit.bbox ? (edit.bbox[2] - edit.bbox[0]) : (line.width || line.x1 - line.x0 || 50))} y2={edit.bbox ? edit.bbox[3] : (line.bbox ? line.bbox[3] : line.y)} stroke="#f6763bff" strokeWidth="1.5" opacity="0.8" pointerEvents="none" />}
        </g>
    );
}

export { LineRenderer };

