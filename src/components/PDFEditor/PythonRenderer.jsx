import React, { useMemo, useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRendererEngine } from '../engine/WebEngine';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';

// Now purely a Single Page Renderer for Python Backend
export default function PythonRenderer({ page, pageIndex, fontsKey, onUpdate, onSelect }) {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [camera, setCamera] = useState({ scale: 0.5, x: 0, y: 0 }); // Start very safe
    const [canvasHeight, setCanvasHeight] = useState(1000);
    const [isReady, setIsReady] = useState(false);


    // CSS Scaling Handles Camera now

    // 1. Initialize Engine
    useEffect(() => {
        if (!containerRef.current) return;

        const measureAndInit = async () => {
            const rect = containerRef.current.getBoundingClientRect();
            // Initial size is viewport size, but we will resize it dynamically
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

        // Add Resize Observer for responsiveness
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

    // 2. Resize Canvas to Page size (1:1)
    useEffect(() => {
        if (!engineRef.current || !page) return;

        const A4_WIDTH = 793.70; // 595.28 * 1.333
        const A4_HEIGHT = 1122.52; // 841.89 * 1.333
        const renderWidth = page.width || A4_WIDTH;
        const renderHeight = page.height || A4_HEIGHT;

        // Resize the renderer canvas to exact page dimensions
        const engine = engineRef.current;
        if (engine.app && engine.app.renderer) {
            engine.app.renderer.resize(renderWidth, renderHeight);
        }

        // SMART AUTO-FIT: Prioritize width for readability (Fit to Width)
        if (renderWidth > 0 && viewportSize.width > 100 && !engineRef.current._initialFitDone) {
            const margin = 40;
            const fitScaleW = (viewportSize.width - margin) / renderWidth;

            // Aim for Fit to Width but cap it at a comfortable reading level
            const finalScale = Math.min(fitScaleW, 1.5);

            setCamera(prev => ({ ...prev, scale: finalScale }));
            engineRef.current._initialFitDone = true;
        }

    }, [page, viewportSize.width]);

    // 2. Render Single Active Page
    const renderActivePage = useCallback(async () => {
        if (!engineRef.current || !isReady || !page) {
            return;
        }

        const engine = engineRef.current;
        const stage = engine.app.stage;

        // Use a persistent world container to avoid stacking
        if (!engineRef.current.worldContainer) {
            engineRef.current.worldContainer = new PIXI.Container();
            stage.addChild(engineRef.current.worldContainer);
        }

        const worldContainer = engineRef.current.worldContainer;
        worldContainer.removeChildren(); // Clear previous page content

        const A4_WIDTH = 793.70;
        const A4_HEIGHT = 1122.52;
        const renderWidth = page.width || A4_WIDTH;
        const renderHeight = page.height || A4_HEIGHT;

        const scaledWidth = renderWidth * camera.scale;

        // Match Canvas size (which matches wrapper size)
        worldContainer.x = 0;
        worldContainer.y = 0;
        worldContainer.scale.set(1);

        // REMOVED Pixi Background/Shadow - Now handled by CSS

        // Prepare items
        const nodes = [];

        let currentPath = []; // Accumulate segments
        let lastPoint = { x: 0, y: 0 };

        // Helper to parse color
        const parseColor = (c) => {
            if (!c) return 0x000000;
            if (Array.isArray(c)) {
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
                    g = r;
                    b = r;
                }
                // Convert to Hex Integer
                return (r << 16) + (g << 8) + b;
            }
            return 0x000000;
        };

        const flushPath = (isFill, color) => {
            if (currentPath.length > 0) {
                // Structure path for Engine
                const pathNode = {
                    type: 'pdf_path',
                    items: [{
                        type: 'path',
                        segments: [...currentPath],
                        [isFill ? 'fill_color' : 'stroke_color']: parseColor(color)
                    }],
                    height: 0 // DISABLE internal Pixi flip (backend is Top-Down)
                };
                // For fill, we assume we close it? PDF fills are implicitly closed usually.
                if (isFill) {
                    pathNode.items[0].fill_color = parseColor(color);
                    // Check if we need to set explicit opacity or rule?
                } else {
                    pathNode.items[0].stroke_color = parseColor(color);
                    pathNode.items[0].stroke_width = 1; // Default
                }
                nodes.push(pathNode);
                // Do NOT clear path immediately if we might stroke it after fill?
                // Standard PDF behavior: 'fill' ends the path object. 'stroke' ends it.
                // 'fill_stroke' does both.
                // In this operator stream, usually we see: ops... -> fill. ops... -> stroke.
                // So we can clear.
                currentPath = [];
            }
        };

        (page.items || []).forEach((item, index) => {

            if (item.type === 'text') {
                return;
            } else if (item.type === 'image') {
                nodes.push({
                    id: item.id || `img-${index}`,
                    type: 'image',
                    src: item.data.startsWith('data:') ? item.data : `data:image/png;base64,${item.data}`,
                    x: item.x,
                    y: item.y, // Unified Top-Down in backend
                    width: item.width,
                    height: item.height,
                    styles: { opacity: 1 }
                });
            }
            // --- PATH OPERATOR STATE MACHINE ---
            else if (item.type === 'path_move') {
                currentPath.push({ type: 'm', x: item.x, y: item.y });
                lastPoint = { x: item.x, y: item.y };
            } else if (item.type === 'path_line') {
                currentPath.push({ type: 'l', pts: [[lastPoint.x, lastPoint.y], [item.x, item.y]] });
                lastPoint = { x: item.x, y: item.y };
            } else if (item.type === 'path_curve') {
                // Bezier
                currentPath.push({
                    type: 'c', pts: [
                        [lastPoint.x, lastPoint.y],
                        [item.pts[0], item.pts[1]],
                        [item.pts[2], item.pts[3]],
                        [item.pts[4], item.pts[5]]
                    ]
                });
                lastPoint = { x: item.pts[4], y: item.pts[5] };
            } else if (item.op === 're') { // Rect
                const [rx, ry, rw, rh] = item.pts;
                currentPath.push({ type: 're', pts: [[rx, ry, rw, rh]] });
            } else if (item.type === 'path_close') {
                // ...
            } else if (item.type === 'paint') {
                if (currentPath.length > 0) {
                    const pathItem = {
                        type: 'path',
                        segments: [...currentPath]
                    };

                    if (item.fill) {
                        pathItem.fill_color = parseColor(item.fill);
                    }
                    if (item.stroke) {
                        pathItem.stroke_color = parseColor(item.stroke);
                        pathItem.stroke_width = item.stroke_width || 1;
                    }

                    nodes.push({
                        id: `path-${index}`,
                        type: 'pdf_path',
                        x: 0,
                        y: 0,
                        items: [pathItem],
                        height: 0
                    });

                    currentPath = [];
                }
            }
            // Backward compatibility
            else if (item.type === 'fill' || item.type === 'eofill') {
                flushPath(true, item.color);
            } else if (item.type === 'stroke') {
                flushPath(false, item.color);
            }
            // Handle high-level paths (backward compatibility)
            else if (item.type === 'path' && item.segments) {
                nodes.push({ id: item.id || `path-${index}`, type: 'pdf_path', items: [item], height: 0 });
            }
        });

        console.log(`[PythonRenderer] Rendering ${nodes.length} nodes to WebGL and ${textItems.length} text items to SVG`);
        console.log(`[PythonRenderer] Page Dimensions: ${page.width}x${page.height}`);

        // Flush remaining if any (rare for valid PDF)

        engine.worldContainer = worldContainer;
        await engine.render({ nodes }, { targetContainer: worldContainer });
        engine.app.render();

    }, [isReady, page, pageIndex, viewportSize]);

    // 3. Compute Merged Lines for Editing/SVG
    const textItems = useMemo(() => {
        if (!page || !page.items) return [];
        return page.items.filter(it => it.type === 'text');
    }, [page]);

    // Re-render when dependencies change
    useEffect(() => {
        renderActivePage();
    }, [renderActivePage]);

    // Handle Window Resize - Track the actual workspace area
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

    // --- ACTION HANDLERS ---

    // Start Editing
    const handleDoubleClick = (pIndex, itemIndex, item, domRect, styles) => {
        // Notify parent to scroll the sidebar
        if (onSelect) {
            onSelect(itemIndex);
        }
    };


    const A4_WIDTH = 793.70;
    const A4_HEIGHT = 1122.52;
    const renderWidth = (page && page.width) || A4_WIDTH;
    const renderHeight = (page && page.height) || A4_HEIGHT;

    return (
        <div className="webgl-single-page" style={{
            width: 'auto', // Don't force 100% if we want to scroll
            height: 'auto',
            position: 'relative',
            background: 'transparent',
            padding: '0px 20px'
        }}>
            {/* The Page Wrapper - Handles CSS Background, Shadow, and Scale */}
            <div
                className="page-paper-wrapper"
                style={{
                    position: 'relative',
                    width: renderWidth + 'px',
                    height: renderHeight + 'px',
                    backgroundColor: 'white',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                    transform: `scale(${camera.scale})`,
                    transformOrigin: 'top center',
                    flexShrink: 0,
                    margin: '40px auto',
                    transition: 'transform 0.1s ease-out'
                }}
            >
                {/* 1. WebGL Canvas (Vectors) */}
                <div ref={containerRef} style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: renderWidth + 'px',
                    height: renderHeight + 'px',
                    pointerEvents: 'none',
                    zIndex: 1
                }} />

                {/* 2. SVG (Sharp Text) */}
                <svg
                    viewBox={`0 0 ${renderWidth} ${renderHeight}`}
                    textRendering="geometricPrecision"
                    shapeRendering="geometricPrecision"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 10,
                        overflow: 'visible'
                    }}
                >
                    {page && (
                        <EditableTextLayer
                            items={textItems}
                            height={page.height}
                            pageIndex={pageIndex}
                            fontsKey={fontsKey}
                            onDoubleClick={handleDoubleClick}
                        />
                    )}
                </svg>

            </div>

            {/* ZOOM HUD */}
            <div style={{ position: 'fixed', bottom: '25px', right: '25px', display: 'flex', gap: '10px', zIndex: 100 }}>
                <div style={{ background: 'rgba(0,0,0,0.8)', padding: '8px 15px', borderRadius: '12px', color: 'white', fontSize: '0.8rem', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    Page {pageIndex + 1}
                </div>
            </div>
        </div>
    );
}


function EditableTextLayer({ items, height, pageIndex, fontsKey, onDoubleClick }) {
    return (
        <g className="text-layer" key={fontsKey}>
            {items.map((item, i) => {
                if (item.type !== 'text') return null;

                const rectX = item.bbox[0];
                const rectY = item.bbox[1] - (3 * 1.333); // Small nudge for baseline offset
                const rectW = item.width;
                const rectH = item.height;

                return (
                    <g key={item.id || i} className="text-item-group" onDoubleClick={(e) => onDoubleClick(pageIndex, i, item, e.target.getBoundingClientRect())}>
                        {/* Hit Test / Background Rect */}
                        <rect
                            x={rectX}
                            y={rectY}
                            width={rectW}
                            height={rectH}
                            fill="transparent"
                            className="text-hit-rect"
                            style={{ cursor: item.uri ? 'pointer' : 'text' }}
                            onClick={() => item.uri && window.open(item.uri, '_blank')}
                        />
                        <text
                            fill={item.color ? `rgb(${item.color[0] * 255}, ${item.color[1] * 255}, ${item.color[2] * 255})` : 'black'}
                            style={{
                                fontSize: `${item.size}px`,
                                fontFamily: item.font || 'sans-serif',
                                fontWeight: item.is_bold ? 'bold' : 'normal',
                                fontStyle: item.is_italic ? 'italic' : 'normal',
                                fontVariant: item.font_variant || 'normal',
                                pointerEvents: 'none',
                                userSelect: 'none',
                                whiteSpace: 'pre'
                            }}
                        >
                            {item.items ? item.items.map((span, idx) => {
                                // Natural Flow Logic:
                                // If this span follows another span AND the X-gap is tiny (< 2px),
                                // we OMIT the x-position to let the browser handle kerning naturally.
                                const prevSpan = idx > 0 ? item.items[idx - 1] : null;
                                const currentX = span.origin ? span.origin[0] : (span.x || item.x);
                                const prevEndX = prevSpan ? (prevSpan.bbox ? prevSpan.bbox[2] : (prevSpan.origin ? prevSpan.origin[0] : currentX)) : -999;

                                const useNaturalFlow = prevSpan && Math.abs(currentX - prevEndX) < 2;

                                return (
                                    <tspan
                                        key={idx}
                                        x={useNaturalFlow ? undefined : currentX}
                                        y={span.origin ? span.origin[1] : (span.y || item.y)}
                                        fill={span.color ? `rgb(${span.color[0] * 255}, ${span.color[1] * 255}, ${span.color[2] * 255})` : (item.color ? `rgb(${item.color[0] * 255}, ${item.color[1] * 255}, ${item.color[2] * 255})` : 'black')}
                                        style={{
                                            fontSize: `${span.size || item.size}px`,
                                            fontFamily: span.font || item.font || 'sans-serif',
                                            fontWeight: span.is_bold ? 'bold' : 'normal',
                                            fontStyle: span.is_italic ? 'italic' : 'normal',
                                            fontVariant: span.font_variant || item.font_variant || 'normal',
                                        }}
                                    >
                                        {span.content}
                                    </tspan>
                                );
                            }) : (
                                <tspan x={item.x} y={item.y}>{item.content}</tspan>
                            )}
                        </text>

                        {/* Underline for links */}
                        {item.uri && (
                            <line
                                x1={item.bbox[0]}
                                y1={item.bbox[3]}
                                x2={item.bbox[2]}
                                y2={item.bbox[3]}
                                stroke="blue"
                                strokeWidth="1"
                                opacity="0.5"
                            />
                        )}
                    </g>
                );
            })}
        </g>
    );
}
