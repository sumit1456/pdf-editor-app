import React, { useMemo, useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRendererEngine } from '../engine/WebEngine';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';

// Now purely a Single Page Renderer for Python Backend
export default function PythonRenderer({ page, pageIndex, fontsKey, fonts, nodeEdits, onUpdate, onSelect }) {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [camera, setCamera] = useState({ scale: 1.0, x: 0, y: 0 }); // Fixed 1.0
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

    // 2. Resize Canvas (No Auto-Fit)
    useEffect(() => {
        if (!engineRef.current || !page) return;

        const renderWidth = (page && page.width) || 595.28;
        const renderHeight = (page && page.height) || 841.89;

        // Resize the renderer canvas to exact page dimensions
        const engine = engineRef.current;
        if (engine.app && engine.app.renderer) {
            engine.app.renderer.resize(renderWidth, renderHeight);
        }
    }, [page]);

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

        // Render Background Items (Images / Paths)
        const bgItems = page.bg_items || (page.items || []).filter(it => it.type !== 'text');

        bgItems.forEach((item, index) => {
            if (item.type === 'image') {
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
            // Handle high-level paths (New Unified Format)
            else if (item.type === 'pdf_path') {
                nodes.push(item);
            }
            // Backward compatibility
            else if (item.type === 'path' && item.segments) {
                nodes.push({ id: item.id || `path-${index}`, type: 'pdf_path', items: [item], height: 0 });
            }
        });

        console.log(`[PythonRenderer] Rendering ${nodes.length} nodes to WebGL and ${page.blocks ? page.blocks.length : 0} text blocks to SVG`);
        console.log(`[PythonRenderer] Page Dimensions: ${page.width}x${page.height}`);

        // Flush remaining if any (rare for valid PDF)

        engine.worldContainer = worldContainer;
        await engine.render({ nodes }, { targetContainer: worldContainer });
        engine.app.render();

    }, [isReady, page, pageIndex, viewportSize]);

    // --- 3. DYNAMIC FONT INJECTION ---
    const fontStyles = useMemo(() => {
        if (!fonts || fonts.length === 0) return '';

        return fonts.map(f => `
            @font-face {
                font-family: "${f.name}";
                src: url(data:application/font-woff;base64,${f.data});
            }
        `).join('\n');
    }, [fonts]);

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


    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
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
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    transform: 'scale(1.0)',
                    transformOrigin: 'top center',
                    flexShrink: 0,
                    margin: '0 auto',
                    marginBottom: '40px',
                    transition: 'none',
                    opacity: 1
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
                    {page && page.blocks ? (
                        <BlockLayer
                            blocks={page.blocks}
                            nodeEdits={nodeEdits || {}}
                            pageIndex={pageIndex}
                            fontsKey={fontsKey}
                            fontStyles={fontStyles}
                            onDoubleClick={handleDoubleClick}
                        />
                    ) : page && (
                        <EditableTextLayer
                            items={textItems}
                            nodeEdits={nodeEdits || {}}
                            height={page.height}
                            pageIndex={pageIndex}
                            fontsKey={fontsKey}
                            fontStyles={fontStyles}
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


function EditableTextLayer({ items, nodeEdits, height, pageIndex, fontsKey, fontStyles, onDoubleClick }) {
    // Robust font matching to handle cryptic PDF font names
    const normalizeFont = (fontName) => {
        if (!fontName) return '"Times New Roman", serif';
        const name = fontName.toLowerCase();

        // Diagnostic Test: Use compact Serif instead of wide Sans-Serif
        if (name.includes('cmbx') || name.includes('bold')) return '"Times New Roman", serif';
        if (name.includes('cm') || name.includes('sfrm')) return '"Times New Roman", serif';
        if (name.includes('times')) return '"Times New Roman", serif';
        if (name.includes('arial') || name.includes('helv') || name.includes('sans')) return 'sans-serif';

        const cleanName = fontName.replace(/^[A-Z]{6}\+/, '');
        return `"${cleanName}", "Times New Roman", serif`;
    };

    return (
        <g className="text-layer" key={fontsKey}>
            {/* Inject dynamic fonts */}
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {items.map((item, i) => {
                if (item.type !== 'text' || !item.bbox) return null;

                const edit = nodeEdits[item.id] || {};
                const isModified = !!edit.isModified;
                const content = edit.content !== undefined ? edit.content : item.content;

                // Visual Deletion support
                if (content === "" && isModified) return null;

                const color = item.color
                    ? `rgb(${item.color[0] * 255}, ${item.color[1] * 255}, ${item.color[2] * 255})`
                    : 'black';

                // Construct baseline and hit-area metrics
                const baselineY = item.origin ? item.origin[1] : item.bbox[1];
                const startX = item.origin ? item.origin[0] : item.bbox[0];

                const [x0, y0, x1, y1] = item.bbox;
                const rectY = y0 - 3;
                const rectH = y1 - y0;
                const rectW = x1 - x0;

                return (
                    <g key={item.id || i}>
                        {/* 1. Hit Test Rect */}
                        <rect
                            x={x0}
                            y={rectY}
                            width={rectW}
                            height={rectH}
                            fill="transparent"
                            cursor="text"
                            pointerEvents="all"
                            stroke="none"
                            strokeWidth="0"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = e.target.getBoundingClientRect();
                                onDoubleClick(pageIndex, i, item, rect, {
                                    fontWeight: item.is_bold ? 'bold' : 'normal',
                                    fontStyle: item.is_italic ? 'italic' : 'normal',
                                    color: color
                                });
                            }}
                        />

                        {/* 2. Visual Text (High-Fidelity Rendering) */}
                        <text
                            transform={`translate(0, 0)`}
                            fontSize={Math.max(1, Math.abs(item.size))}
                            fontFamily={normalizeFont(item.font)}
                            fontWeight={item.is_bold ? 'bold' : 'normal'}
                            fontStyle={item.is_italic ? 'italic' : 'normal'}
                            fill={color}
                            dominantBaseline="alphabetic"
                            style={{
                                userSelect: 'none',
                                pointerEvents: 'none',
                                cursor: 'text',
                                touchAction: 'none'
                            }}
                        >
                            {isModified ? (
                                <tspan x={startX} y={baselineY}>{content}</tspan>
                            ) : (
                                (item.items || [item]).map((span, si) => {
                                    // ABSOLUTE POSITIONING:
                                    // Honor PDF coordinates absolutely by forcing X for every fragment
                                    // unless they are exactly at the same position.
                                    const prevSpan = si > 0 ? item.items[si - 1] : null;
                                    const spanX = span.origin ? span.origin[0] : (span.x || item.x);
                                    const prevX1 = prevSpan ? (prevSpan.bbox ? prevSpan.bbox[2] : prevSpan.x + 10) : -1;
                                    const forceX = si === 0 || (Math.abs(spanX - prevX1) > 0.1);

                                    return (
                                        <tspan
                                            key={si}
                                            x={forceX ? spanX : undefined}
                                            y={span.origin ? span.origin[1] : (span.y || item.y)}
                                            fontSize={Math.max(1, Math.abs(span.size))}
                                            fill={span.color ? `rgb(${span.color[0] * 255}, ${span.color[1] * 255}, ${span.color[2] * 255})` : color}
                                            fontWeight={span.is_bold ? 'bold' : undefined}
                                            fontStyle={span.is_italic ? 'italic' : undefined}
                                            fontFamily={span.font ? normalizeFont(span.font) : undefined}
                                        >
                                            {span.content}
                                        </tspan>
                                    );
                                })
                            )}
                        </text>

                        {/* 3. Link Handling */}
                        {item.uri && (
                            <>
                                <line x1={x0} y1={baselineY + 2} x2={x0 + rectW} y2={baselineY + 2} stroke={color} strokeWidth="0.5" opacity="0.4" />
                                <rect
                                    x={x0} y={rectY} width={rectW} height={rectH}
                                    fill="transparent" cursor="pointer" pointerEvents="all"
                                    onClick={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        window.open(item.uri, '_blank');
                                    }}
                                />
                            </>
                        )}
                    </g>
                );
            })}
        </g>
    );
}
function BlockLayer({ blocks, nodeEdits, pageIndex, fontsKey, fontStyles, onDoubleClick }) {
    return (
        <g className="block-layer" key={fontsKey}>
            <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://cdn.jsdelivr.net/npm/latin-modern-web@1.0.0/style/all.css');
                @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css');
                ${fontStyles}
            ` }} />
            {blocks.map((block, bi) => (
                <SemanticBlock
                    key={block.id || bi}
                    block={block}
                    nodeEdits={nodeEdits}
                    pageIndex={pageIndex}
                    onDoubleClick={onDoubleClick}
                />
            ))}
        </g>
    );
}

function SemanticBlock({ block, nodeEdits, pageIndex, onDoubleClick }) {
    const edit = nodeEdits[block.id] || {};
    const isModified = !!edit.isModified;

    // Use lines from the block structure (which are now reflowed by EditorPage on edit)
    const lines = block.lines || [];

    return (
        <g className={`semantic-block ${block.type}`} id={`block-${block.id}`}>
            {lines.map((line, li) => (
                <g key={li} className="line-row">
                    {/* FLOW-BASED RENDERING: 
                        We wrap the entire line in a single <text> element.
                        The first item provides the Anchor X.
                        Further items are <tspan> helpers.
                    */}
                    {line.items && line.items.length > 0 && (
                        <LineRenderer
                            line={line}
                            block={block}
                            nodeEdits={nodeEdits}
                            pageIndex={pageIndex}
                            onDoubleClick={onDoubleClick}
                        />
                    )}
                </g>
            ))}
        </g>
    );
}

function LineRenderer({ line, block, nodeEdits, pageIndex, onDoubleClick }) {
    const normalizeFont = (fontName) => {
        if (!fontName) return '"Latin Modern Roman", "Times New Roman", serif';
        const name = fontName.toLowerCase();

        // High-Fidelity Mapping for LaTeX/Computer Modern variants
        if (name.includes('cmbx') || name.includes('bold')) return '"Latin Modern Roman", serif';
        if (name.includes('cmcsc')) return '"Latin Modern Roman", serif'; // Handled via fontVariant
        if (name.includes('cmti')) return '"Latin Modern Roman", serif'; // Handled via fontStyle
        if (name.includes('cm') || name.includes('sfrm')) return '"Latin Modern Roman", serif';

        // Icon Font Handling
        if (name.includes('awesome') || name.includes('fa-')) return '"Font Awesome 6 Free", "Font Awesome 5 Free", sans-serif';

        return `"${fontName.replace(/^[A-Z]{6}\+/, '')}", "Latin Modern Roman", serif`;
    };

    const firstItem = line.items[0];
    const isListItem = block.type === 'list-item';
    const textAnchorX = block.textX || firstItem.bbox[0];

    // Determine Lane for the first item
    // If it's a wrapped line in a list, it should anchor to the text column
    const isWrappedLine = isListItem && !line.is_bullet_start;
    const initialStartX = isWrappedLine ? textAnchorX : (firstItem.origin ? firstItem.origin[0] : firstItem.bbox[0]);
    const baselineY = firstItem.origin ? firstItem.origin[1] : firstItem.bbox[1];

    const edit = nodeEdits[line.id] || {};
    const isModified = !!edit.isModified;
    const content = edit.content !== undefined ? edit.content : line.content;

    const isSmallCaps = (firstItem.font || '').toLowerCase().includes('cmcsc');

    const mapContentToIcons = (content, fontName) => {
        const lowerFont = (fontName || '').toLowerCase();
        const isIconFont = lowerFont.includes('awesome') || lowerFont.includes('fa-') || lowerFont.includes('symbol') || lowerFont.includes('webdings');

        const c = content.trim();
        if (isIconFont || c.length === 1) {
            // Map common broken icon glyphs to Font Awesome codes
            if (c === 'ï' || c === '\u00ef') return '\uf08c'; // LinkedIn
            if (c === 'Ð' || c === '\u00d0') return '\uf09b'; // GitHub
            if (c === '§' || c === '\u00a7') return '\uf0e0'; // Email
            if (c === ')' || c === '\u0029' || c === '#' || c === 'phone') return '\uf095'; // Phone
            if (c === 'L' && (isIconFont || lowerFont.includes('serif'))) return '\uf3a5'; // LeetCode
            if (c === 'y' && isIconFont) return '\uf167'; // YouTube
            if (c === 'f' && isIconFont) return '\uf09a'; // Facebook
        }
        return content;
    };

    return (
        <text
            x={initialStartX}
            y={baselineY}
            fontSize={Math.max(1, Math.abs(firstItem.size))}
            fontFamily={normalizeFont(firstItem.font)}
            fill={firstItem.color ? `rgb(${firstItem.color[0] * 255}, ${firstItem.color[1] * 255}, ${firstItem.color[2] * 255})` : 'black'}
            fontWeight={firstItem.is_bold ? 'bold' : 'normal'}
            fontStyle={firstItem.is_italic ? 'italic' : 'normal'}
            dominantBaseline="alphabetic"
            style={{
                userSelect: 'none',
                pointerEvents: 'all',
                cursor: 'text',
                whiteSpace: 'pre',
                fontVariant: isSmallCaps ? 'small-caps' : 'normal'
            }}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                // --- STYLE SAFETY MECHANIC ---
                // Capture the original PDF metadata at the moment of edit
                const safetyStyle = {
                    size: line.size,
                    font: firstItem.font,
                    color: firstItem.color,
                    is_bold: firstItem.is_bold,
                    is_italic: firstItem.is_italic,
                    uri: line.uri
                };

                console.log("--------------------------------------");
                console.log("[Style Capture] Saved styles for Line", line.id, ":", safetyStyle);
                console.log("--------------------------------------");

                onDoubleClick(pageIndex, line.id, firstItem, e.target.getBoundingClientRect(), {
                    safetyStyle
                });
            }}
        >
            {isModified ? (
                (() => {
                    const mapped = mapContentToIcons(content, firstItem.font);
                    const isMappedIcon = mapped !== content;
                    const sStyle = edit.safetyStyle || {};
                    const isMarkerLine = isListItem && line.is_bullet_start;
                    const bMetrics = block.bullet_metrics || {};

                    // Use Safety Styles if available, fallback to line.size (which is the max size/height)
                    // This prevents shrinking if capture is missing.
                    const safeSize = Math.abs(sStyle.size || line.size || firstItem.size);
                    const safeFont = sStyle.font || firstItem.font;
                    const safeColor = sStyle.color || firstItem.color;

                    console.log("--------------------------------------");
                    console.log(`[Style Render] Line ${line.id}: size=${safeSize}, font=${safeFont}`);
                    console.log("--------------------------------------");

                    if (isMarkerLine) {
                        const firstSpaceIdx = mapped.search(/\s/);
                        const markerPart = firstSpaceIdx > -1 ? mapped.substring(0, firstSpaceIdx) : (mapped.length > 2 ? mapped.substring(0, 1) : mapped);
                        const restPart = mapped.substring(markerPart.length);

                        return (
                            <tspan x={initialStartX} y={baselineY}>
                                <tspan
                                    fontSize={Math.abs(bMetrics.size || safeSize)}
                                    fontFamily={isMappedIcon ? '"Font Awesome 6 Free", "Font Awesome 5 Free"' : normalizeFont(safeFont)}
                                    fill={safeColor ? `rgb(${safeColor[0] * 255},${safeColor[1] * 255},${safeColor[2] * 255})` : 'black'}
                                    fontWeight={(block.style?.is_bold || sStyle.is_bold) ? 'bold' : 'normal'}
                                    fontStyle={(block.style?.is_italic || sStyle.is_italic) ? 'italic' : 'normal'}
                                    dy={-((firstItem.size - (bMetrics.size || safeSize)) * 0.4) + "px"}
                                >
                                    {markerPart}
                                </tspan>
                                <tspan
                                    x={textAnchorX}
                                    y={baselineY}
                                    fontSize={safeSize}
                                    fontFamily={normalizeFont(safeFont)}
                                    fill={safeColor ? `rgb(${safeColor[0] * 255},${safeColor[1] * 255},${safeColor[2] * 255})` : 'black'}
                                    fontWeight={sStyle.is_bold ? 'bold' : 'normal'}
                                    fontStyle={sStyle.is_italic ? 'italic' : 'normal'}
                                >
                                    {restPart}
                                </tspan>
                            </tspan>
                        );
                    }

                    return (
                        <tspan
                            x={initialStartX}
                            y={baselineY}
                            fontSize={safeSize}
                            fontFamily={isMappedIcon ? '"Font Awesome 6 Free", "Font Awesome 5 Free"' : normalizeFont(safeFont)}
                            fill={safeColor ? `rgb(${safeColor[0] * 255},${safeColor[1] * 255},${safeColor[2] * 255})` : 'black'}
                            fontWeight={sStyle.is_bold ? 'bold' : 'normal'}
                            fontStyle={sStyle.is_italic ? 'italic' : 'normal'}
                        >
                            {mapped}
                        </tspan>
                    );
                })()
            ) : (
                line.items.map((span, si) => {
                    const fontName = span.font || '';
                    const isSmallCaps = fontName.toLowerCase().includes('cmcsc');

                    // LANE ANCHORING LOGIC
                    const prev = si > 0 ? line.items[si - 1] : null;
                    const currentX = span.origin ? span.origin[0] : span.bbox[0];
                    const prevX1 = prev ? prev.bbox[2] : -1;

                    let forceX = undefined;

                    // Case A: Large jump (Date/Location lane)
                    if (prev && (currentX - prevX1) > 8) {
                        forceX = currentX;
                    }

                    // Case B: Bullet -> Content transition in the first line of a list
                    if (isListItem && line.is_bullet_start && si > 0) {
                        const prevTxt = prev.content.trim();
                        // Sync with backend SUB_BULLET_CHARS to prevent false positives (removed icons)
                        const BULLET_CHARS = ["•", "·", "*", "-", "∗", "»", "ΓÇó", "├»", "Γêù"];
                        if (BULLET_CHARS.includes(prevTxt) || prevTxt.length === 1 && prevTxt.charCodeAt(0) === 0x2217) {
                            forceX = textAnchorX;
                        }
                    }

                    const content = span.content;
                    const mapped = mapContentToIcons(content, span.font);
                    const isMappedIcon = mapped !== content;

                    const isMarker = isListItem && line.is_bullet_start && si === 0;
                    const bMetrics = block.bullet_metrics || {};
                    const customSize = isMarker ? (bMetrics.size || span.size) : span.size;
                    const isStandardDot = isMarker && (span.content === '•' || span.content === '·');

                    // Dynamic vertical centering: Lift bullets up (negative dy)
                    const verticalShift = isMarker ? -((line.size - customSize) * 0.4) : 0;

                    return (
                        <tspan
                            key={si}
                            x={forceX}
                            y={baselineY}
                            dy={verticalShift + "px"}
                            fontSize={Math.max(1, Math.abs(customSize))}
                            fontWeight={span.is_bold ? 'bold' : 'normal'}
                            fontStyle={span.is_italic ? 'italic' : 'normal'}
                            fontFamily={isMappedIcon ? '"Font Awesome 6 Free", "Font Awesome 5 Free"' : normalizeFont(span.font)}
                            fill={span.color ? `rgb(${span.color[0] * 255},${span.color[1] * 255},${span.color[2] * 255})` : 'black'}
                            style={{
                                fontVariant: isSmallCaps ? 'small-caps' : 'normal'
                            }}
                        >
                            {mapped}
                        </tspan>
                    );
                })
            )}
        </text>
    );
}
