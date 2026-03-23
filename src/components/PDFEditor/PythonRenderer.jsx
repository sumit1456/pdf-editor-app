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

const getWeightFromFont = (font, isBold) => {
    if (isBold) return '700';
    if (!font) return '400';
    const name = font.toLowerCase().replace(/[_-]/g, "");
    if (name.includes('black') || name.includes('heavy')) return '900';
    if (name.includes('extrabold') || name.includes('ultrabold')) return '800';
    if (name.includes('bold')) return '700';
    if (name.includes('semibold') || name.includes('demibold') || name.includes('demi')) return '600';
    if (name.includes('medium')) return '500';
    if (name.includes('regular') || name.includes('book')) return '400';
    if (name.includes('light')) return '300';
    if (name.includes('extralight') || name.includes('thin')) return '200';
    return '400';
};

// ==================== SHARED TYPOGRAPHIC ENGINE ====================

const normalizeFont = (fontName, googleFont) => {
    // Priority 1: Backend-mapped Google Font (The "Source of Truth")
    if (googleFont) {
        const gf = googleFont.toLowerCase();
        if (gf.includes('inter')) return "'Inter', sans-serif";
        if (gf.includes('source serif')) return "'Source Serif 4', serif";
        if (gf.includes('roboto')) return "'Roboto', sans-serif";
        if (gf.includes('open sans')) return "'Open Sans', sans-serif";
        if (gf.includes('montserrat')) return "'Montserrat', sans-serif";
        if (gf.includes('lora')) return "'Lora', serif";
        if (gf.includes('merriweather')) return "'Merriweather', serif";
        if (gf.includes('libre baskerville')) return "'Libre Baskerville', serif";
        if (gf.includes('playfair display')) return "'Playfair Display', serif";
        if (gf.includes('oswald')) return "'Oswald', sans-serif";
        if (gf.includes('roboto mono')) return "'Roboto Mono', monospace";
        if (gf.includes('jetbrains mono')) return "'JetBrains Mono', monospace";
        if (gf.includes('fira code')) return "'Fira Code', monospace";
        if (gf.includes('poppins')) return "'Poppins', sans-serif";
        if (gf.includes('crimson pro')) return "'Crimson Pro', serif";
        if (gf.includes('dancing script')) return "'Dancing Script', cursive";
        if (gf.includes('orbitron')) return "'Orbitron', sans-serif";
        if (gf.includes('pt serif')) return "'PT Serif', serif";
        if (gf.includes('pt sans')) return "'PT Sans', sans-serif";
        if (gf.includes('ubuntu')) return "'Ubuntu', sans-serif";
    }

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

const PythonRenderer = React.memo(({ page, pageIndex, activeNodeId, selectedWordIndices = [], fontsKey, fonts, nodeEdits, onUpdate, onSelect, onDoubleClick, scale, isFitMode, onMove, isDragEnabled }) => {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    // Reflow Engine was removed as it broke bounding box logic
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [isReady, setIsReady] = useState(false);
    const [metricRatio, setMetricRatio] = useState(1.0);

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
                }
            } catch (err) {
                setMetricRatio(1.0);
            }
        };

        const timer = setTimeout(calibrate, 500);
        return () => clearTimeout(timer);
    }, [page, fontsKey]);

    const workerRef = useRef(null);
    useEffect(() => {
        workerRef.current = new Worker('/workers/MeasureWorker.js');
        workerRef.current.postMessage({ type: 'init' });

        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

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
                    {page && page.blocks ? (
                        <BlockLayer
                            blocks={page.blocks} nodeEdits={nodeEdits || {}} pageIndex={pageIndex} activeNodeId={activeNodeId}
                            selectedWordIndices={selectedWordIndices} fontsKey={fontsKey} fontStyles={fontStyles} metricRatio={metricRatio}
                            onDoubleClick={onDoubleClick} isFitMode={isFitMode} workerRef={workerRef}
                            itemRefs={itemRefs} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} isDragEnabled={isDragEnabled}
                        />
                    ) : page && (
                        <EditableTextLayer
                            items={textItems} nodeEdits={nodeEdits || {}} activeNodeId={activeNodeId} height={page.height} pageIndex={pageIndex}
                            fontsKey={fontsKey} fonts={fonts} fontStyles={fontStyles} metricRatio={metricRatio} onDoubleClick={onDoubleClick}
                            isFitMode={isFitMode} workerRef={workerRef} itemRefs={itemRefs} onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} isDragEnabled={isDragEnabled}
                        />
                    )}
                </svg>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.page === next.page &&
        prev.pageIndex === next.pageIndex &&
        prev.scale === next.scale &&
        prev.nodeEdits === next.nodeEdits &&
        prev.activeNodeId === next.activeNodeId &&
        prev.selectedWordIndices === next.selectedWordIndices &&
        prev.fontsKey === next.fontsKey &&
        prev.isDragEnabled === next.isDragEnabled;
});

export default PythonRenderer;

const MEASURE_CANVAS = document.createElement('canvas');
const MEASURE_CTX = MEASURE_CANVAS.getContext('2d');

function getRealFontString(fontName, googleFont, weight, size, style) {
    let family = normalizeFont(fontName, googleFont);
    if (family.includes('var(--serif-latex)')) family = "'Source Serif 4', serif";
    else if (family.includes('var(--mono-code)')) family = "'Roboto Mono', monospace";
    else if (family.includes('var(--sans-modern)')) family = "'Inter', sans-serif";
    else if (family.includes('var(--serif-academic)')) family = "'Merriweather', serif";
    else if (family.includes('var(--serif-high-contrast)')) family = "'Playfair Display', serif";
    else if (family.includes('var(--sans-geometric)')) family = "'Poppins', sans-serif";
    else if (family.includes('var(--sans-readable)')) family = "'Open Sans', sans-serif";
    return `${style} ${weight} ${size}px ${family}`;
}

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
    if (item.type !== 'text' || !item.bbox) return null;
    const isModified = !!edit.isModified;
    const content = edit.content !== undefined ? edit.content : item.content;
    if (content === "" && isModified) return null;

    const [x0, y0, x1, y1] = edit.bbox || item.bbox;
    const rectW = x1 - x0;

    const color = getSVGColor(item.color, 'black');
    const baselineY = edit.origin ? edit.origin[1] : (item.origin ? item.origin[1] : item.bbox[1]);
    const startX = edit.origin ? edit.origin[0] : (item.origin ? item.origin[0] : item.bbox[0]);
    const rectY = y0 - 3;
    const rectH = y1 - y0;

    const sStyle = edit.safetyStyle || { size: item.size, font: item.font, googleFont: item.google_font, is_bold: item.is_bold, is_italic: item.is_italic, font_variant: item.font_variant || 'normal' };
    const OPTICAL_HEIGHT_FACTOR = 1.0;
    let fittedFontSize = sStyle.size * OPTICAL_HEIGHT_FACTOR;
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
    const measuredWidth = MEASURE_CTX.measureText(content).width;
    const dynamicPdfWidth = isModified ? (measuredWidth / (metricRatio || 1.0)) : (item.width || rectW);
    // FROZEN: never expand beyond original bbox — use rectW as the hard ceiling
    const finalRectWidth = rectW;

    // No BBox Adjusting as per user request (pure font sizes)
    let safeRatio = 1.0;
    fittedFontSize = (sStyle.size || item.size) * OPTICAL_HEIGHT_FACTOR * safeRatio;

    // BBox Debug console log removed

    const renderWeight = (matchingFont && /bold|medium|semibold|black|heavy/i.test(matchingFont.name)) ? 'normal' : (sStyle.is_bold ? '700' : '400');

    return (
        <g key={item.id || index} ref={itemRef} id={`item-debug-${item.id || index}`}>
            {activeNodeId === (item.id || index) && (
                <rect x={x0} y={y0} width={finalRectWidth} height={y1 - y0} fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.8" strokeDasharray="4 2" pointerEvents="none" />
            )}
            <rect
                x={x0} y={rectY} width={finalRectWidth} height={rectH} fill="transparent" cursor="move" pointerEvents="all"
                onPointerDown={(e) => isDragEnabled && onPointerDown(e, item.id || index, startX, baselineY)}
                onPointerMove={isDragEnabled ? onPointerMove : undefined} onPointerUp={isDragEnabled ? onPointerUp : undefined}
                onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onDoubleClick(pageIndex, index, item, e.target.getBoundingClientRect(), { safetyStyle: sStyle }); }}
            />
            <text
                fontSize={Math.max(1, Math.abs(fittedFontSize))} fontFamily={measureFamily.replace(/'/g, "")}
                fontWeight={renderWeight} fontStyle={style} fill={getSVGColor(sStyle.color, color)}
                dominantBaseline="alphabetic" style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
                {isModified ? (
                    <tspan x={startX} y={baselineY}>{renderVisualText(content, (item.font_variant === 'small-caps'), fittedFontSize)}</tspan>
                ) : (
                    (item.items || [item]).map((span, si) => {
                        const spanX = span.origin ? span.origin[0] : (span.x || item.x);
                        const prevX1 = si > 0 ? (item.items[si - 1].bbox ? item.items[si - 1].bbox[2] : item.items[si - 1].x + 10) : -1;
                        const forceX = si === 0 || (Math.abs(spanX - prevX1) > 0.1);
                        const spanIsSmallCaps = span.font_variant === 'small-caps' || (span.font || '').toLowerCase().includes('cmcsc');
                        const spanFittedSize = span.size * (fittedFontSize / item.size);
                        return (
                            <tspan key={si} x={forceX ? spanX : undefined} y={span.origin ? span.origin[1] : (span.y || item.y)} fontSize={Math.max(1, Math.abs(spanFittedSize))} fill={getSVGColor(span.color, color)} fontWeight={spanIsSmallCaps ? '500' : (span.is_bold ? '700' : '400')} fontStyle={span.is_italic ? 'italic' : undefined} fontFamily={span.font ? normalizeFont(span.font, span.google_font) : undefined} xmlSpace="preserve" style={{ fontVariant: spanIsSmallCaps ? 'small-caps' : 'normal' }}>
                                {renderVisualText(span.content, spanIsSmallCaps, spanFittedSize)}
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

function BlockLayer({ blocks, nodeEdits, pageIndex, activeNodeId, selectedWordIndices, fontsKey, fontStyles, metricRatio, onDoubleClick, isFitMode, workerRef, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled }) {
    return (
        <g className="block-layer" key={fontsKey}>
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {blocks.map((block, bi) => (
                <SemanticBlock key={block.id || bi} block={block} nodeEdits={nodeEdits} pageIndex={pageIndex} activeNodeId={activeNodeId} selectedWordIndices={selectedWordIndices} metricRatio={metricRatio} onDoubleClick={onDoubleClick} isFitMode={isFitMode} workerRef={workerRef} itemRefs={itemRefs} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} isDragEnabled={isDragEnabled} />
            ))}
        </g>
    );
}

function SemanticBlock({ block, nodeEdits, pageIndex, activeNodeId, selectedWordIndices, metricRatio, onDoubleClick, isFitMode, workerRef, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled }) {
    const edit = nodeEdits[block.id] || {};
    const isModified = !!edit.isModified;
    const lines = useMemo(() => {
        return block.lines || [];
    }, [block]);

    return (
        <g className={`semantic-block ${block.type}`} id={`block-${block.id}`}>
            {lines.map((line, li) => (
                <g key={li} className="line-row">
                    {line.items && line.items.length > 0 && (
                        <LineRenderer key={line.id || li} line={line} block={block} nodeEdits={nodeEdits} pageIndex={pageIndex} activeNodeId={activeNodeId} selectedWordIndices={selectedWordIndices} metricRatio={metricRatio} onDoubleClick={onDoubleClick} isFitMode={isFitMode} workerRef={workerRef} itemRef={(el) => itemRefs.current.set(line.id, el)} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} isDragEnabled={isDragEnabled} />
                    )}
                </g>
            ))}
        </g>
    );
}

function LineRenderer({ line, block, nodeEdits, pageIndex, activeNodeId, selectedWordIndices, metricRatio, onDoubleClick, isFitMode, workerRef, itemRef, onPointerDown, onPointerMove, onPointerUp, isDragEnabled }) {
    const isActive = activeNodeId === line.id;

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

    const firstItem = line.items[0];
    const edit = nodeEdits[line.id] || {};
    const isModified = !!edit.isModified;
    const content = edit.content !== undefined ? edit.content : line.content;

    const initialStartX = edit.origin ? edit.origin[0] : (firstItem?.origin ? firstItem.origin[0] : (firstItem?.bbox ? firstItem.bbox[0] : 0));
    const baselineY = edit.origin ? edit.origin[1] : (firstItem?.origin ? firstItem.origin[1] : (firstItem?.bbox ? firstItem.bbox[1] : 0));
    const isSmallCaps = (firstItem?.font_variant === 'small-caps') || (firstItem?.font || '').toLowerCase().includes('cmcsc');

    const mapContent = (text) => {
        if (!text) return text;
        return text
            .replace(/\u2022/g, '•').replace(/\u2217/g, '*').replace(/\u22c6/g, '*')
            .replace(/\u2013/g, '–').replace(/\u2014/g, '—')
            .replace(/\u0083/g, '\uf095').replace(/\u00a7/g, '\uf09b')
            .replace(/\u00ef/g, '\uf08c').replace(/\u00d0/g, '\uf121');
    };

    const { finalFontSize, finalFittingRatio, finalPdfWidth, finalWeight } = useMemo(() => {
        const sStyle = edit.safetyStyle || styleItem;
        const baseSize = Math.abs(sStyle.size || styleItem.size || line.size || 10);
        
        // Always anchor to original line geometry
        const targetWidth = line.width || (line.bbox ? line.bbox[2] - line.bbox[0] : 50);
        const finalPdfW = targetWidth;

        // NO FITTING for any nodes as per user request (pure font sizes everywhere)
        return {
            finalFontSize: baseSize,
            finalFittingRatio: 1.0,
            finalPdfWidth: targetWidth,
            finalWeight: getWeightFromFont(sStyle.font || styleItem.font, sStyle.is_bold !== undefined ? sStyle.is_bold : styleItem.is_bold)
        };
    }, [line, styleItem, isModified, metricRatio, edit.safetyStyle]);

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
            }}>
            {/* DEBUG: Red Bounding Box for ALL text - REMOVED for production */}
            
            
            {isActive && <rect x={edit.bbox ? edit.bbox[0] : line.x0} y={edit.bbox ? edit.bbox[1] : (line.y - (line.height || line.size || 10))} width={finalPdfWidth} height={line.height || line.size || 12} fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.8" strokeDasharray="4 2" pointerEvents="none" style={{ animation: 'blink 2s infinite' }} />}
            <rect x={(edit.bbox ? edit.bbox[0] : line.x0) - 5} y={(edit.bbox ? edit.bbox[1] : (line.y - (line.height || line.size || 10))) - 4} width={Math.max(50, finalPdfWidth + 10)} height={(line.height || line.size || 12) + 8} fill="transparent" pointerEvents="all" />
            <text
                x={initialStartX} y={baselineY}
                fontSize={finalFontSize}
                fontFamily={normalizeFont(edit.safetyStyle?.font || styleItem.font, edit.safetyStyle?.googleFont || edit.safetyStyle?.google_font || styleItem.google_font)}
                fill={getSVGColor(edit.safetyStyle?.color || styleItem.color, 'black')}
                fontWeight={finalWeight}
                fontStyle={(edit.safetyStyle?.is_italic !== undefined ? edit.safetyStyle.is_italic : styleItem.is_italic) ? 'italic' : 'normal'}
                dominantBaseline="alphabetic" xmlSpace="preserve"
                style={{ userSelect: 'none', pointerEvents: 'none', whiteSpace: 'pre', letterSpacing: 'normal' }}>
                {isModified ? (
                    (() => {
                        const sStyle = edit.safetyStyle || {};
                        const safeSize = sStyle.size || styleItem.size || line.size;
                        const activeSmallCaps = (sStyle.font_variant || 'normal') === 'small-caps' || isSmallCaps;
                        const safeBSize = safeSize * finalFittingRatio;
                        return <tspan x={initialStartX} y={baselineY} style={{ fontVariant: activeSmallCaps ? 'small-caps' : 'normal' }}>
                            {renderWordStyledText(mapContent(content), edit.wordStyles || {}, sStyle || styleItem, activeSmallCaps, safeBSize)}
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
                                fontSize={Math.max(1, Math.abs(span.size * finalFittingRatio))}
                                fontWeight={isIcon ? '900' : (span.is_bold ? '700' : '400')}
                                fontStyle={span.is_italic ? 'italic' : 'normal'}
                                fontFamily={isIcon ? '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif' : normalizeFont(span.font, span.google_font)}
                                fill={getSVGColor(span.color, 'black')}
                                xmlSpace="preserve"
                                style={{ fontFeatureSettings: isOriginalSmallCaps ? '"smcp"' : 'normal', fontVariant: isOriginalSmallCaps ? 'small-caps' : 'normal' }}>
                                {renderVisualText(mapped, isOriginalSmallCaps, span.size * finalFittingRatio)}
                            </tspan>
                        );
                    })
                )}
            </text>
            {isActive && <line x1={edit.bbox ? edit.bbox[0] : line.x0} y1={edit.bbox ? edit.bbox[3] : (line.bbox ? line.bbox[3] : line.y)} x2={(edit.bbox ? edit.bbox[0] : line.x0) + (edit.bbox ? (edit.bbox[2] - edit.bbox[0]) : (line.width || line.x1 - line.x0 || 50))} y2={edit.bbox ? edit.bbox[3] : (line.bbox ? line.bbox[3] : line.y)} stroke="#f6763bff" strokeWidth="1.5" opacity="0.8" pointerEvents="none" />}
        </g>
    );
}

export { MEASURE_CTX, getRealFontString, LineRenderer };

