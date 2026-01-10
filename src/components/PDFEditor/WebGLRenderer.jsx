import React, { useMemo, useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRendererEngine } from '../engine/WebEngine';

// Now purely a Single Page Renderer
export default function WebGLRenderer({ page, pageIndex, fontsKey, onUpdate }) {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 800, height: 3000 });
    const [camera, setCamera] = useState({ scale: 0.85, x: 0, y: 0 });
    const [canvasHeight, setCanvasHeight] = useState(1000);
    const [isReady, setIsReady] = useState(false);

    // { itemIndex: number, rect: { top, left, width, height, ...styles } }
    const [editingItem, setEditingItem] = useState(null);

    // --- Helper: Apply Camera Transform ---
    const updateCameraTransform = useCallback((world, cam, currentMaxWidth) => {
        if (!world) return;
        world.scale.set(cam.scale);
        // Center horizontally
        const scaledWidth = currentMaxWidth * cam.scale;
        const offsetX = Math.max(0, (viewportSize.width - scaledWidth) / 2);
        // Vertical Top Alignment
        world.x = offsetX;
        world.y = 40;
    }, [viewportSize]);

    // 1. Initialize Engine
    useEffect(() => {
        if (!containerRef.current) return;

        const measureAndInit = async () => {
            const rect = containerRef.current.getBoundingClientRect();
            // Initial size is viewport size, but we will resize it dynamically
            const w = rect.width || 800;
            const h = rect.height || 1000;

            console.log('[DEBUG-WebGL] Container Measurement:', { w, h });
            setViewportSize({ width: w, height: h });

            const engine = new PixiRendererEngine(containerRef.current, {
                width: w,
                height: h, // Will be resized later
                backgroundColor: 0x300030, // Dark background explicitly
                antialias: true,
                resolution: 2
            });

            const ok = await engine.initialize();
            if (ok) {
                console.log('[DEBUG-WebGL] Engine Initialized Successfully');
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

    // Add logic to resize on render
    useEffect(() => {
        if (!engineRef.current || !page) return;

        const A4_WIDTH = 595.28;
        const A4_HEIGHT = 841.89;

        const renderWidth = page.width || A4_WIDTH;
        const renderHeight = page.height || A4_HEIGHT;

        // Calculate Required Canvas Height
        const scaledHeight = renderHeight * camera.scale;
        const requiredHeight = scaledHeight + 100;
        setCanvasHeight(requiredHeight);

        // Resize the renderer canvas
        const engine = engineRef.current;
        if (engine.app && engine.app.renderer) {
            engine.app.renderer.resize(viewportSize.width, requiredHeight);
        }

        // Fit to width on first load
        if (renderWidth > 0 && viewportSize.width > 0 && !engineRef.current._initialFitDone) {
            const fitScale = (viewportSize.width - 80) / renderWidth;
            setCamera(prev => ({ ...prev, scale: Math.min(fitScale, 1.0) }));
            engineRef.current._initialFitDone = true;
        }

    }, [camera.scale, page, viewportSize]); // Re-run when these change

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

        // Center Page (Horizontal Dynamic, Vertical Fixed Top)
        const offsetX = Math.max(0, (viewportSize.width - scaledWidth) / 2);
        worldContainer.x = offsetX;
        worldContainer.y = 40;
        worldContainer.scale.set(camera.scale);

        // Draw Drop Shadow
        const shadow = new PIXI.Graphics();
        if (typeof shadow.fill === 'function') {
            shadow.rect(5, 5, renderWidth, renderHeight).fill({ color: 0x000000, alpha: 0.3 });
        } else {
            shadow.beginFill(0x000000, 0.3).drawRect(5, 5, renderWidth, renderHeight).endFill();
        }
        worldContainer.addChild(shadow);

        // Draw Page Background
        const bg = new PIXI.Graphics();
        if (typeof bg.fill === 'function') {
            bg.rect(0, 0, renderWidth, renderHeight).fill({ color: 0xffffff });
        } else {
            bg.beginFill(0xffffff).drawRect(0, 0, renderWidth, renderHeight).endFill();
        }
        worldContainer.addChild(bg);

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
                /* Skip WebGL text for alignment check
                nodes.push({
                    type: 'text',
                    content: item.content || item.str,
                    text: item.content || item.str,
                    x: item.origin ? item.origin[0] : (item.x || 0),
                    y: item.origin ? item.origin[1] : (item.y || 0),
                    color: item.color,
                    font: item.font,
                    size: item.size,
                    height: page.height || 841.89,
                    is_bold: item.is_bold,
                    is_italic: item.is_italic,
                    styles: {
                        fontSize: item.size,
                        fontFamily: item.font,
                        fontWeight: item.is_bold ? 'bold' : 'normal',
                        fontStyle: item.is_italic ? 'italic' : 'normal',
                        color: typeof item.color === 'string' ? item.color : undefined
                    }
                });
                */
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
            // User requested to "disable inner text" (the vector paths that sometimes duplicate text)
            // We disable path accumulation for now.
            /*
            else if (item.type === 'path_move') {
                ...
            }
            */
        });

        // Flush remaining if any (rare for valid PDF)

        console.log(`[DEBUG-WebGL] Page nodes count: ${nodes.length}`);
        engine.worldContainer = worldContainer;
        await engine.render({ nodes }, { targetContainer: worldContainer });

        // Force a re-render frame
        engine.app.render();

    }, [isReady, page, pageIndex, camera, viewportSize, editingItem]);

    // Re-render when dependencies change
    useEffect(() => {
        renderActivePage();
    }, [renderActivePage]);

    // Handle Resize
    useEffect(() => {
        const handleResize = () => {
            if (!containerRef.current || !engineRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            setViewportSize({ width: rect.width, height: rect.height });
            engineRef.current.app.renderer.resize(rect.width, rect.height);
            if (engineRef.current.worldContainer && page) {
                updateCameraTransform(engineRef.current.worldContainer, camera, page.width);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [camera, page, updateCameraTransform]);

    // --- ACTION HANDLERS ---

    // Start Editing
    const handleDoubleClick = (pIndex, itemIndex, item, domRect, styles) => {
        // pIndex is irrelevant now as we are single page, but good for validation
        console.log('[Edit] Clicked:', item.content);
        setEditingItem({
            itemIndex,
            content: item.content,
            rect: domRect, // Absolute DOM coordinates to position the input
            styles: styles // Font, size, color
        });
    };

    // Save Edit
    const handleSaveEdit = (newText) => {
        if (!editingItem) return;

        console.log('[Edit] Saving:', newText);

        // Update the PARENT via onUpdate
        const newItems = [...page.items];
        newItems[editingItem.itemIndex] = {
            ...newItems[editingItem.itemIndex],
            content: newText
        };

        if (onUpdate) {
            onUpdate(newItems);
        }

        setEditingItem(null);
    };

    return (
        <div className="webgl-single-page" style={{ width: '100%', height: '100%', position: 'relative' }}>

            {/* Main WebGL Viewport - AUTO HEIGHT FOR FULL SS */}
            <div ref={containerRef} style={{
                width: '100%',
                height: canvasHeight + 'px',
                position: 'relative',
                background: '#300030',
                border: 'none'
            }}>
                {/* SVG Interaction Layer Overlay */}
                <svg
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: canvasHeight + 'px', pointerEvents: 'none', zIndex: 10 }}
                >
                    {page && (
                        <g transform={`translate(${Math.max(0, (viewportSize.width - page.width * camera.scale) / 2)}, 40) scale(${camera.scale})`}>
                            <EditableTextLayer
                                items={page.items}
                                height={page.height}
                                pageIndex={pageIndex}
                                fontsKey={fontsKey}
                                editingItem={editingItem}
                                onDoubleClick={handleDoubleClick}
                            />
                        </g>
                    )}
                </svg>

                {/* --- FLOATING TEXT EDITOR (The Swap) --- */}
                {editingItem && (
                    <FloatingTextEditor
                        editingItem={editingItem}
                        onSave={handleSaveEdit}
                        containerRect={containerRef.current ? containerRef.current.getBoundingClientRect() : null}
                    />
                )}

                {/* ZOOM HUD */}
                <div style={{ position: 'absolute', bottom: '25px', right: '25px', display: 'flex', gap: '10px', zIndex: 30 }}>
                    <div style={{ background: 'rgba(0,0,0,0.7)', padding: '8px 15px', borderRadius: '12px', color: 'white', fontSize: '0.8rem', backdropFilter: 'blur(10px)', border: '1px solid var(--studio-border)' }}>
                        Page {pageIndex + 1}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Separate component for the input box
function FloatingTextEditor({ editingItem, onSave, containerRect }) {
    const inputRef = useRef(null);
    const [val, setVal] = useState(editingItem.content);

    useLayoutEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select(); // Select all text on open
        }
    }, []);

    if (!containerRect) return null;

    const top = editingItem.rect.top - containerRect.top;
    const left = editingItem.rect.left - containerRect.left;
    const minWidth = editingItem.rect.width; // Allow growing

    return (
        <textarea
            ref={inputRef}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={() => onSave(val)}
            onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { // Shift+Enter for newline
                    e.preventDefault();
                    inputRef.current.blur();
                }
            }}
            style={{
                position: 'absolute',
                top: top - 2, // Slight adjustment for padding
                left: left - 4,
                minWidth: minWidth + 20,
                height: 'auto',
                background: 'white', // High contrast for editing
                color: 'black',
                border: '2px solid #00AAFF',
                borderRadius: '4px',
                padding: '0px 4px',
                zIndex: 100,
                fontSize: editingItem.styles.fontSize,
                fontFamily: editingItem.styles.fontFamily,
                fontWeight: editingItem.styles.fontWeight,
                fontStyle: editingItem.styles.fontStyle,
                outline: 'none',
                resize: 'both',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap'
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
                const rectY = y0;
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

                        {/* 2. Visual Text */}
                        <text
                            visibility={isEditing ? 'hidden' : 'visible'} // Hide the ghost when editing
                            transform={`translate(${startX}, ${baselineY}) matrix(${a},${b},${c},${d},0,0)`}
                            fontSize={Math.abs(item.size)}
                            fontFamily={`"${item.font}", serif`}
                            fontWeight={item.is_bold ? 'bold' : 'normal'}
                            fontStyle={item.is_italic ? 'italic' : 'normal'}
                            fill={item.color ? `rgb(${item.color[0] * 255}, ${item.color[1] * 255}, ${item.color[2] * 255})` : 'black'}
                            dominantBaseline="alphabetic"
                            textLength={w > 1 ? w : undefined}
                            lengthAdjust="spacingAndGlyphs"
                            style={{
                                userSelect: 'text',
                                pointerEvents: 'all', // FORCE pointer events
                                cursor: 'text',
                                touchAction: 'none' // Prevent scrolling while tapping text
                            }}
                        >
                            {item.content}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}
