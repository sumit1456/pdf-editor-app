import React, { useMemo, useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import * as PIXI from 'pixi.js';
import { PixiRendererEngine } from '../engine/WebEngine';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';

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

// ==================== SHARED TYPOGRAPHIC ENGINE ====================

const normalizeFont = (fontName) => {
    if (!fontName) return "'Source Serif 4', serif";
    const name = fontName.toLowerCase();

    // 0. EXPLICIT MATCH (For user-selected fonts)
    if (name === 'inter') return "'Inter', sans-serif";
    if (name === 'roboto') return "'Roboto', sans-serif";
    if (name === 'open sans') return "'Open Sans', sans-serif";
    if (name.includes('montserrat')) return "'Montserrat', sans-serif";
    if (name.includes('lora')) return "'Lora', serif";
    if (name.includes('merriweather')) return "'Merriweather', serif";
    if (name.includes('libre baskerville')) return "'Libre Baskerville', serif";
    if (name.includes('playfair display')) return "'Playfair Display', serif";
    if (name === 'oswald') return "'Oswald', sans-serif";
    if (name === 'roboto mono') return "'Roboto Mono', monospace";
    if (name === 'jetbrains mono') return "'JetBrains Mono', monospace";
    if (name === 'fira code') return "'Fira Code', monospace";
    if (name === 'source serif 4') return "'Source Serif 4', serif";
    if (name === 'poppins') return "'Poppins', sans-serif";

    // 1. Monospace / Code
    if (name.includes('mono') || name.includes('courier') || name.includes('consolas') || name.includes('lucida console')) {
        return 'var(--mono-code)';
    }

    // 2. Serif (Classic/Academic/LaTeX)
    if (
        name.includes('times') || name.includes('serif') || name.includes('roman') ||
        name.includes('cm') || name.includes('sfrm') || name.includes('nimbus') ||
        name.includes('georgia') || name.includes('palatino') || name.includes('minion') ||
        name.includes('baskerville') || name.includes('cambria') || name.includes('garamond') ||
        name.includes('libertine') || name.includes('antiqua') || name.includes('didot')
    ) {
        if (name.includes('merriweather')) return 'var(--serif-academic)';
        if (name.includes('playfair')) return 'var(--serif-high-contrast)';
        // Sync with Backend: Use Latin Modern / Source Serif 4 as the LaTeX/Academic primary
        return "var(--serif-latex)";
    }

    // 3. Sans-Serif (Modern/Geometric/System)
    if (
        name.includes('inter') || name.includes('poppins') || name.includes('sans') ||
        name.includes('arial') || name.includes('helvetica') || name.includes('calibri') ||
        name.includes('verdana') || name.includes('tahoma') || name.includes('ubuntu') ||
        name.includes('geometric') || name.includes('modern')
    ) {
        if (name.includes('poppins')) return 'var(--sans-geometric)';
        if (name.includes('open') && name.includes('sans')) return 'var(--sans-readable)';
        return 'var(--sans-modern)'; // Inter
    }

    // Default: Inter (Clean Modern)
    return 'var(--sans-modern)';
};

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
const PythonRenderer = React.memo(({ page, pageIndex, fontsKey, fonts, nodeEdits, onUpdate, onSelect, onDoubleClick, scale }) => {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
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

        const scaledWidth = renderWidth * scale;

        // Match Canvas size (which matches wrapper size)
        worldContainer.x = 0;
        worldContainer.y = 0;
        worldContainer.scale.set(1);

        // REMOVED Pixi Background/Shadow - Now handled by CSS

        // Prepare items
        const nodes = [];

        let currentPath = []; // Accumulate segments
        let lastPoint = { x: 0, y: 0 };


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
                // IMPORTANT: Backend sends color as [r, g, b] array. 
                // Pixi Engine needs 0xRRGGBB hex integer.
                const clonedPath = JSON.parse(JSON.stringify(item));
                if (clonedPath.items) {
                    clonedPath.items.forEach(pi => {
                        if (Array.isArray(pi.fill_color)) pi.fill_color = parseColor(pi.fill_color);
                        if (Array.isArray(pi.stroke_color)) pi.stroke_color = parseColor(pi.stroke_color);

                        // ENSURE VISIBILITY: If it has a stroke but width is too thin (or missing),
                        // force a minimum of 0.8px so it doesn't disappear in the browser/Pixi.
                        if (pi.stroke_color !== undefined) {
                            pi.stroke_width = Math.max(0.8, pi.stroke_width || 1);
                        }
                    });
                }
                nodes.push(clonedPath);
            }
            // Backward compatibility
            else if (item.type === 'path' && item.segments) {
                nodes.push({ id: item.id || `path-${index}`, type: 'pdf_path', items: [item], height: 0 });
            }
        });


        // Flush remaining if any (rare for valid PDF)

        engine.worldContainer = worldContainer;
        await engine.render({ nodes }, { targetContainer: worldContainer });
        engine.app.render();

    }, [isReady, page, pageIndex, scale, viewportSize]);

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
                    transform: `scale(${scale})`,
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
                            onDoubleClick={onDoubleClick}
                        />
                    ) : page && (
                        <EditableTextLayer
                            items={textItems}
                            nodeEdits={nodeEdits || {}}
                            height={page.height}
                            pageIndex={pageIndex}
                            fontsKey={fontsKey}
                            fontStyles={fontStyles}
                            onDoubleClick={onDoubleClick}
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
}, (prev, next) => {
    return prev.page === next.page &&
        prev.pageIndex === next.pageIndex &&
        prev.scale === next.scale &&
        prev.nodeEdits === next.nodeEdits &&
        prev.fontsKey === next.fontsKey;
});

export default PythonRenderer;


function EditableTextLayer({ items, nodeEdits, height, pageIndex, fontsKey, fontStyles, onDoubleClick }) {
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

                const color = getSVGColor(item.color, 'black');

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
                                    safetyStyle: {
                                        size: item.size,
                                        font: item.font,
                                        color: item.color,
                                        is_bold: item.is_bold,
                                        is_italic: item.is_italic,
                                        font_variant: item.font_variant || 'normal'
                                    }
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
                            textLength={!isModified ? Math.max(0, item.width || (x1 - x0)) : undefined}
                            lengthAdjust={!isModified ? "spacingAndGlyphs" : undefined}
                            style={{
                                userSelect: 'none',
                                pointerEvents: 'none',
                                cursor: 'text',
                                touchAction: 'none'
                            }}
                        >
                            {isModified ? (
                                <tspan x={startX} y={baselineY}>
                                    {renderVisualText(content, (item.font_variant === 'small-caps'), item.size)}
                                </tspan>
                            ) : (
                                (item.items || [item]).map((span, si) => {
                                    // ABSOLUTE POSITIONING:
                                    // Honor PDF coordinates absolutely by forcing X for every fragment
                                    // unless they are exactly at the same position.
                                    const prevSpan = si > 0 ? item.items[si - 1] : null;
                                    const spanX = span.origin ? span.origin[0] : (span.x || item.x);
                                    const prevX1 = prevSpan ? (prevSpan.bbox ? prevSpan.bbox[2] : prevSpan.x + 10) : -1;
                                    const forceX = si === 0 || (Math.abs(spanX - prevX1) > 0.1);

                                    const spanIsSmallCaps = span.font_variant === 'small-caps' || (span.font || '').toLowerCase().includes('cmcsc');

                                    return (
                                        <tspan
                                            key={si}
                                            x={forceX ? spanX : undefined}
                                            y={span.origin ? span.origin[1] : (span.y || item.y)}
                                            fontSize={Math.max(1, Math.abs(span.size))}
                                            fill={getSVGColor(span.color, color)}
                                            fontWeight={span.is_bold ? (span.size > 18 ? '600' : '550') : '400'}
                                            fontStyle={span.is_italic ? 'italic' : undefined}
                                            fontFamily={span.font ? normalizeFont(span.font) : undefined}
                                            xmlSpace="preserve"
                                            style={{
                                                fontVariant: spanIsSmallCaps ? 'small-caps' : 'normal'
                                            }}
                                        >
                                            {renderVisualText(span.content, spanIsSmallCaps)}
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
    // ROBUST STYLE CAPTURE: Look for the first span that actually contains content/color
    const styleItem = useMemo(() => {
        if (!line.items || line.items.length === 0) return line.items[0] || {};

        let candidates = [];
        let searchIndex = (block.type === 'list-item' && line.is_bullet_start && line.items.length > 1) ? 1 : 0;

        for (let i = searchIndex; i < line.items.length; i++) {
            const it = line.items[i];
            if (it.content && it.content.trim().length > 0 && it.color) {
                // If it's a vibrant color (not a standard dark gray/black), return it immediately
                const [r, g, b] = it.color;
                const isGray = Math.abs(r - g) < 0.05 && Math.abs(g - b) < 0.05;
                if (!isGray || (r > 0.4 || g > 0.4 || b > 0.4)) return it;
                candidates.push(it);
            }
        }
        const base = candidates[0] || line.items[searchIndex] || line.items[0];
        return {
            ...base,
            is_bold: base.is_bold || line.items.some(it => it.is_bold),
            is_italic: base.is_italic || line.items.some(it => it.is_italic)
        };
    }, [line, block]);

    const firstItem = line.items[0];
    const isListItem = block.type === 'list-item';
    const textAnchorX = block.textX || (firstItem?.bbox ? firstItem.bbox[0] : 0);

    // Determine Lane for the first item
    // If it's a wrapped line in a list, it should anchor to the text column
    const isWrappedLine = isListItem && !line.is_bullet_start;
    const initialStartX = isWrappedLine ? textAnchorX : (firstItem.origin ? firstItem.origin[0] : firstItem.bbox[0]);
    const baselineY = firstItem.origin ? firstItem.origin[1] : firstItem.bbox[1];

    const edit = nodeEdits[line.id] || {};
    const isModified = !!edit.isModified;
    const content = edit.content !== undefined ? edit.content : line.content;

    const isSmallCaps = firstItem.font_variant === 'small-caps' ||
        (firstItem.font || '').toLowerCase().includes('cmcsc') ||
        (firstItem.font || '').toLowerCase().includes('smallcaps') ||
        ((firstItem.font || '').toLowerCase().includes('cmr') && content === content.toUpperCase() && content.length > 2);

    const mapContentToIcons = (text, fontName, variant) => {
        if (!text) return text;
        const lowerFont = (fontName || '').toLowerCase();

        // LaTeX/Computer Modern Symbol replacements
        let mapped = text
            .replace(/\u2022/g, '•')  // Bullet
            .replace(/\u2217/g, '∗')  // Asterisk bullet
            .replace(/\u22c6/g, '⋆')  // Star bullet
            .replace(/\u2013/g, '–')  // En-dash
            .replace(/\u2014/g, '—'); // Em-dash

        // FontAwesome Mapping (ONLY for high-unicode symbols, NOT standard ASCII)
        mapped = mapped
            .replace(/\u0083/g, '\uf095') // ƒ -> Phone (PhoneAlt)
            .replace(/\u00a7/g, '\uf09b') // § -> Github
            .replace(/\u00ef/g, '\uf08c') // ï -> LinkedIn
            .replace(/\u00d0/g, '\uf121'); // Ð -> Code / LeetCode

        // TYPOGRAPHIC PREVIEW FIX:
        // We let the browser's font-variant: small-caps handle the rendering.
        // It naturally renders lowercase as small caps and uppercase as big caps.
        return mapped;
    };

    return (
        <g
            className="line-group"
            style={{ cursor: 'text' }}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                // Trigger clicking on the invisible hitbox as if it were the text
                console.log(`==================== CLICKED LINE ====================`);
                console.log(`Line ID: ${line.id}`);
                console.log(`Style Master:`, styleItem);
                console.log(`Raw Color Array:`, JSON.stringify(styleItem.color));
                console.log(`=======================================================`);

                onDoubleClick(pageIndex, line.id, styleItem, e.currentTarget.getBoundingClientRect(), {
                    safetyStyle: {
                        size: styleItem.size || line.size,
                        font: styleItem.font,
                        color: styleItem.color,
                        is_bold: styleItem.is_bold,
                        is_italic: styleItem.is_italic,
                        font_variant: styleItem.font_variant || 'normal',
                        uri: line.uri
                    }
                });
            }}
        >
            {/* INVISIBLE HITBOX: Covers the entire line area and some padding */}
            <rect
                x={line.x0 - 5}
                y={line.y - (line.height || line.size || 10) - 4}
                width={Math.max(50, (line.x1 - line.x0) + 10)}
                height={(line.height || line.size || 12) + 8}
                fill="transparent"
                pointerEvents="all"
            />
            <text
                x={initialStartX}
                y={baselineY}
                fontSize={Math.max(1, Math.abs(styleItem.size))}
                fontFamily={normalizeFont(styleItem.font)}
                fill={getSVGColor(styleItem.color, 'black')}
                fontWeight={styleItem.is_bold ? (styleItem.size > 20 ? '700' : '600') : '400'}
                fontStyle={styleItem.is_italic ? 'italic' : 'normal'}
                dominantBaseline="alphabetic"
                xmlSpace="preserve"
                textLength={!isModified ? line.width : undefined}
                lengthAdjust={!isModified ? "spacingAndGlyphs" : undefined}
                style={{
                    userSelect: 'none',
                    pointerEvents: 'none',  // Pass clicks through to the <g> container
                    whiteSpace: 'pre'
                }}
            >
                {isModified ? (
                    (() => {
                        const sStyle = edit.safetyStyle || {};
                        const safeFont = sStyle.font || styleItem.font;
                        const safeSize = sStyle.size || styleItem.size || line.size;
                        const safeColor = sStyle.color || styleItem.color;
                        const safeVariant = sStyle.font_variant || styleItem.font_variant || 'normal';

                        const mapped = mapContentToIcons(content, safeFont, safeVariant);
                        const isMappedIcon = mapped !== content;
                        const isMarkerLine = isListItem && line.is_bullet_start;
                        const bMetrics = block.bullet_metrics || {};

                        // Dynamic isSmallCaps based on active font + variant
                        const activeSmallCaps = safeVariant === 'small-caps' || isSmallCaps;


                        if (isMarkerLine) {
                            const markerPart = line.bullet || '';
                            const restPart = content;

                            // Bullet size correction: if extraction says 6 but it's a primary bullet, ensure it's at least 70% of text size
                            const rawBSize = Math.abs(bMetrics.size || styleItem.size);
                            const safeBSize = (rawBSize < safeSize * 0.7) ? safeSize * 0.8 : rawBSize;

                            return (
                                <tspan key="modified-marker" x={initialStartX} y={baselineY} style={{ fontVariant: activeSmallCaps ? 'small-caps' : 'normal' }}>
                                    <tspan
                                        fontSize={safeBSize}
                                        fontFamily={/[\uf000-\uf999]/.test(markerPart) ? '"Font Awesome 6 Free", "Font Awesome 5 Free", sans-serif' : normalizeFont(safeFont)}
                                        fontWeight={/[\uf000-\uf999]/.test(markerPart) ? '900' : ((block.style?.is_bold || sStyle.is_bold) ? 'bold' : 'normal')}
                                        fill={getSVGColor(safeColor, 'black')}
                                        fontStyle={(block.style?.is_italic || sStyle.is_italic) ? 'italic' : 'normal'}
                                        dy={-((safeSize - safeBSize) * 0.4) + "px"}
                                        xmlSpace="preserve"
                                    >
                                        {markerPart}
                                    </tspan>
                                    <tspan
                                        x={textAnchorX}
                                        y={baselineY}
                                        fontSize={safeSize}
                                        fontFamily={normalizeFont(safeFont)}
                                        fill={getSVGColor(safeColor, 'black')}
                                        fontWeight={sStyle.is_bold ? '600' : '400'}
                                        fontStyle={sStyle.is_italic ? 'italic' : 'normal'}
                                        xmlSpace="preserve"
                                    >
                                        {renderVisualText(restPart, activeSmallCaps, safeSize)}
                                    </tspan>
                                </tspan>
                            );
                        }

                        return (
                            <tspan
                                key="modified-plain"
                                x={initialStartX}
                                y={baselineY}
                                fontSize={safeSize}
                                fontFamily={/[\uf000-\uf999]/.test(mapped) || isMappedIcon ? '"Font Awesome 6 Free", "Font Awesome 5 Free", sans-serif' : normalizeFont(safeFont)}
                                fill={getSVGColor(safeColor, 'black')}
                                fontWeight={/[\uf000-\uf999]/.test(mapped) ? '900' : (sStyle.is_bold ? (safeSize > 18 ? '600' : '550') : '400')}
                                fontStyle={sStyle.is_italic ? 'italic' : 'normal'}
                                style={{
                                    // Removed native fontVariant to avoid double-processing
                                    fontFeatureSettings: activeSmallCaps ? '"smcp"' : 'normal'
                                }}
                            >
                                {renderVisualText(mapped, activeSmallCaps, safeSize)}
                            </tspan>
                        );
                    })()
                ) : (
                    line.items.map((span, si) => {
                        const fontName = span.font || '';
                        const spanVariant = span.font_variant || 'normal';
                        const isOriginalSmallCaps = spanVariant === 'small-caps' ||
                            (fontName || '').toLowerCase().includes('cmcsc') ||
                            (fontName || '').toLowerCase().includes('smallcaps') ||
                            ((fontName || '').toLowerCase().includes('cmr') && span.content === span.content.toUpperCase() && span.content.length > 2);

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

                        const mapped = mapContentToIcons(span.content, span.font, spanVariant);
                        const isMappedIcon = mapped !== span.content;

                        const isMarker = isListItem && line.is_bullet_start && si === 0;
                        const bMetrics = block.bullet_metrics || {};
                        let customSize = isMarker ? (bMetrics.size || span.size) : span.size;

                        // Bullet size correction: ensure markers are at least 70% of the following text size
                        if (isMarker && line.items.length > 1) {
                            const contentSize = Math.abs(line.items[1].size);
                            if (Math.abs(customSize) < contentSize * 0.7) {
                                customSize = contentSize * 0.8;
                            }
                        }
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
                                fontWeight={/[\uf000-\uf999]/.test(mapped) ? '900' : (span.is_bold ? (span.size > 18 ? '600' : '550') : '400')}
                                fontStyle={span.is_italic ? 'italic' : 'normal'}
                                fontFamily={/[\uf000-\uf999]/.test(mapped) || isMappedIcon ? '"Font Awesome 6 Free", "Font Awesome 5 Free", sans-serif' : normalizeFont(span.font)}
                                fill={getSVGColor(span.color, 'black')}
                                style={{
                                    // Removed native fontVariant to avoid double-processing
                                    fontFeatureSettings: isOriginalSmallCaps ? '"smcp"' : 'normal'
                                }}
                            >
                                {renderVisualText(mapped, isOriginalSmallCaps, customSize)}
                            </tspan>
                        );
                    })
                )}
            </text>
        </g>
    );
}
