import React, { useMemo, useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRendererEngine } from '../engine/WebEngine';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';

// Now purely a Single Page Renderer
export default function WebGLRenderer({ page, pageIndex, fontsKey, onUpdate }) {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 800, height: 3000 });
    const [camera, setCamera] = useState({ scale: 1.1, x: 0, y: 0 });
    const [canvasHeight, setCanvasHeight] = useState(1000);
    const [isReady, setIsReady] = useState(false);

    // { itemIndex: number, rect: { top, left, width, height, ...styles } }
    const [editingItem, setEditingItem] = useState(null);

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
                backgroundAlpha: 0, // Transparent canvas
                antialias: true,
                resolution: window.devicePixelRatio || 3
            });

            const ok = await engine.initialize();
            if (ok) {
                engineRef.current = engine;
                setIsReady(true);
            } else {
                console.error('[DEBUG-WebGL] Engine Initialization FAILED');
            }
        };

        measureAndInit();

        return () => {
            if (engineRef.current) {
                engineRef.current.destroy();
                engineRef.current = null;
            }
        };
    }, []);

    // 2. Resize Canvas to Page size (1:1)
    useEffect(() => {
        if (!engineRef.current || !page) return;

        const A4_WIDTH = 595.28;
        const A4_HEIGHT = 841.89;
        const renderWidth = page.width || A4_WIDTH;
        const renderHeight = page.height || A4_HEIGHT;

        // Resize the renderer canvas to exact page dimensions
        const engine = engineRef.current;
        if (engine.app && engine.app.renderer) {
            engine.app.renderer.resize(renderWidth, renderHeight);
        }

        // Auto-fit on first load
        if (renderWidth > 0 && viewportSize.width > 0 && !engineRef.current._initialFitDone) {
            const fitScale = (viewportSize.width - 40) / renderWidth; // Use smaller margin
            setCamera(prev => ({ ...prev, scale: Math.min(fitScale, 1.3) })); // Allow up to 1.3x scale
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

        const A4_WIDTH = 595.28;
        const A4_HEIGHT = 841.89;
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
                    height: page.height || 841.89
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
            // Text Editing Shield
            const isEditing = editingItem && editingItem.itemIndex === index;
            if (isEditing && item.type === 'text') return;

            if (item.type === 'text') {
                // We use the SVG layer for text to ensure maximum sharpness and searchability.
                // WebGL is reserved for heavy background elements (paths, images).
                return;
            } else if (item.type === 'image') {
                nodes.push({
                    type: 'image',
                    src: `data:image/png;base64,${item.data}`,
                    x: item.x,
                    y: page.height - (item.y + item.height),
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
            } else if (item.type === 'fill' || item.type === 'eofill') {
                flushPath(true, item.color);
            } else if (item.type === 'stroke') {
                flushPath(false, item.color);
            }
            // Handle high-level paths (backward compatibility)
            else if (item.type === 'path' && item.segments) {
                nodes.push({ type: 'pdf_path', items: [item], height: page.height });
            }
        });

        // Flush remaining if any (rare for valid PDF)

        engine.worldContainer = worldContainer;
        await engine.render({ nodes }, { targetContainer: worldContainer });

        // Force a re-render frame
        engine.app.render();

    }, [isReady, page, pageIndex, camera, viewportSize, editingItem]);

    // 3. Compute Merged Lines for Editing/SVG
    const mergedLines = useMemo(() => {
        if (!page || !page.items) return [];
        return mergeFragmentsIntoLines(page.items);
    }, [page, fontsKey]);

    // Re-render when dependencies change
    useEffect(() => {
        renderActivePage();
    }, [renderActivePage]);

    // Handle Window Resize
    useEffect(() => {
        const handleResize = () => {
            if (!containerRef.current || !engineRef.current) return;
            const rect = containerRef.current.parentElement.parentElement.getBoundingClientRect();
            setViewportSize({ width: rect.width, height: rect.height });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- ACTION HANDLERS ---

    // Start Editing
    const handleDoubleClick = (pIndex, itemIndex, item, domRect, styles) => {
        setEditingItem({
            itemIndex,
            content: item.content,
            rect: domRect,
            styles: styles
        });
    };

    // Save Edit
    const handleSaveEdit = (newText) => {
        if (!editingItem) return;

        // Update the PARENT via onUpdate
        // When a LINE is edited, we replace the set of original fragments with a single new line fragment
        const line = mergedLines[editingItem.itemIndex];
        if (!line) return;

        const originalIndices = line.items.map(it => page.items.indexOf(it));

        // Remove old fragments, insert new merged fragment
        const newItems = [...page.items];

        // We find the first index and replace 
        const firstIndex = Math.min(...originalIndices);

        // Mark items for removal
        const indicesToRemove = new Set(originalIndices);
        const filteredItems = newItems.filter((_, idx) => !indicesToRemove.has(idx));

        // Construct the new merged item
        const newMergedItem = {
            ...line,
            content: newText,
            type: 'text',
            items: undefined // Clean up internal ref
        };

        // Re-insert at the original position (closest to first segment)
        filteredItems.splice(firstIndex, 0, newMergedItem);

        if (onUpdate) {
            onUpdate(filteredItems);
        }

        setEditingItem(null);
    };

    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const renderWidth = (page && page.width) || A4_WIDTH;
    const renderHeight = (page && page.height) || A4_HEIGHT;

    return (
        <div className="webgl-single-page" style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            background: '#2d2d2d',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '40px 20px'
        }}>
            {/* The Page Wrapper - Handles CSS Background, Shadow, and Scale */}
            <div
                className="page-paper-wrapper"
                style={{
                    position: 'relative',
                    width: renderWidth + 'px',
                    height: renderHeight + 'px',
                    backgroundColor: 'white',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    transform: `scale(${camera.scale})`,
                    transformOrigin: 'top center',
                    flexShrink: 0
                }}
            >
                {/* 1. WebGL Canvas (Vectors) */}
                <div ref={containerRef} style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 1
                }} />

                {/* 2. SVG (Sharp Text) */}
                <svg
                    textRendering="geometricPrecision"
                    shapeRendering="geometricPrecision"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 10
                    }}
                >
                    {page && (
                        <EditableTextLayer
                            items={mergedLines}
                            height={page.height}
                            pageIndex={pageIndex}
                            fontsKey={fontsKey}
                            editingItem={editingItem}
                            onDoubleClick={handleDoubleClick}
                        />
                    )}
                </svg>

                {/* 3. Floating Editor Overlay */}
                {editingItem && (
                    <FloatingTextEditor
                        editingItem={editingItem}
                        onSave={handleSaveEdit}
                    />
                )}
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

// Separate component for the input box
function FloatingTextEditor({ editingItem, onSave }) {
    const inputRef = useRef(null);
    const [val, setVal] = useState(editingItem.content);

    useLayoutEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const top = editingItem.rect.top;
    const left = editingItem.rect.left;
    const minWidth = editingItem.rect.width;

    return (
        <textarea
            ref={inputRef}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={() => onSave(val)}
            onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    inputRef.current.blur();
                }
            }}
            style={{
                position: 'fixed',
                top: top - 2,
                left: left - 4,
                minWidth: minWidth + 20,
                height: 'auto',
                background: 'white',
                color: 'black',
                border: '2px solid #00AAFF',
                borderRadius: '4px',
                padding: '0px 4px',
                zIndex: 10000, // Top of everything
                fontSize: editingItem.styles.fontSize,
                fontFamily: editingItem.styles.fontFamily,
                fontWeight: editingItem.styles.fontWeight,
                fontStyle: editingItem.styles.fontStyle,
                outline: 'none',
                resize: 'both',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
            }}
        />
    );
}

function EditableTextLayer({ items, height, pageIndex, fontsKey, editingItem, onDoubleClick }) {
    return (
        <g className="text-layer" key={fontsKey}>
            {items.map((item, i) => {
                if (item.type !== 'text') return null;

                const w = item.bbox[2] - item.bbox[0];
                const [a, b, c, d] = item.matrix || [1, 0, 0, 1];
                const baselineY = item.origin ? item.origin[1] : item.bbox[1];
                const startX = item.origin ? item.origin[0] : item.bbox[0];

                const isEditing = editingItem && editingItem.itemIndex === i;

                const [x0, y0, x1, y1] = item.bbox;
                // PDF Y is bottom-up, SVG is top-down
                const rectY = height - y1;
                const rectH = y1 - y0;
                const rectW = x1 - x0;

                return (
                    <g key={i}>
                        {/* 1. Hit Test Rect (Invisible but clickable) */}
                        <rect
                            x={x0}
                            y={rectY}
                            width={rectW}
                            height={rectH}
                            fill="transparent"
                            style={{ cursor: 'text', pointerEvents: 'all' }}
                            onClick={(e) => {
                                // Use a small timeout to ensure double-clicking works on mobile/tap
                                e.preventDefault();
                                e.stopPropagation();

                                const rect = e.target.getBoundingClientRect();
                                // Pass text styles, not rect styles
                                onDoubleClick(pageIndex, i, item, rect, {
                                    fontSize: Math.abs(item.size) + 'px',
                                    fontFamily: item.font,
                                    fontWeight: item.is_bold ? 'bold' : 'normal',
                                    fontStyle: item.is_italic ? 'italic' : 'normal',
                                    color: 'black'
                                });
                            }}
                        />

                        {/* 2. Visual Text (Native Browser Rendering for Sharpness) */}
                        <g style={{ pointerEvents: 'none' }}>
                            <text
                                visibility={isEditing ? 'hidden' : 'visible'}
                                transform={`translate(${startX}, ${baselineY}) matrix(${a},${b},${c},${d},0,0)`}
                                fontSize={Math.abs(item.size)}
                                fontFamily={`"${item.font}", serif`}
                                fontWeight={item.is_bold ? 'bold' : 'normal'}
                                fontStyle={item.is_italic ? 'italic' : 'normal'}
                                fill={item.color ? `rgb(${item.color[0] * 255}, ${item.color[1] * 255}, ${item.color[2] * 255})` : 'black'}
                                dominantBaseline="alphabetic"
                                style={{
                                    userSelect: 'none',
                                    pointerEvents: 'none',
                                    cursor: 'text',
                                    touchAction: 'none' // Prevent scrolling while tapping text
                                }}
                            >
                                {item.content}
                            </text>
                        </g>
                    </g>
                );
            })}
        </g>
    );
}
