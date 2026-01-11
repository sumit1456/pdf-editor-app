import React, { useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';

/**
 * Renders the PDF content using SVG based on the JSON data from the backend.
 * Uses SVG <text> with textLength for high-fidelity coordinate matching.
 */
export default function PDFRenderer({ data }) {
    const [fontsLoaded, setFontsLoaded] = useState(0);
    const [localPages, setLocalPages] = useState([]);

    // { pageIndex: number, itemIndex: number, rect: { top, left, width, height, ...styles } }
    const [editingItem, setEditingItem] = useState(null);

    // 1. Font Loading Effect
    useEffect(() => {
        if (!data || !data.fonts) return;

        const loadFonts = async () => {
            for (const font of data.fonts) {
                try {
                    // Check if already loaded
                    if (document.fonts.check(`12px "${font.name}"`)) continue;

                    const binaryString = window.atob(font.data.trim());
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }

                    const fontFace = new FontFace(font.name, bytes);
                    await fontFace.load();
                    document.fonts.add(fontFace);
                    setFontsLoaded(prev => prev + 1);
                } catch (err) {
                    console.warn(`⚠️ Failed to load font ${font.name}:`, err);
                }
            }
        };

        loadFonts();
    }, [data?.fonts]);

    // Initialize local pages for editing
    useEffect(() => {
        if (data && data.pages) {
            setLocalPages(JSON.parse(JSON.stringify(data.pages)));
        }
    }, [data]);

    if (!localPages || localPages.length === 0) return null;

    // --- EDITING HANDLERS ---
    const handleDoubleClick = (pageIndex, itemIndex, item, domRect, styles) => {
        setEditingItem({
            pageIndex,
            itemIndex,
            content: item.content,
            rect: domRect, // Absolute DOM coordinates
            styles: styles
        });
    };

    const handleSaveEdit = (newText) => {
        if (!editingItem) return;

        setLocalPages(prev => {
            const next = [...prev];
            const p = next[editingItem.pageIndex];

            // We need to find which fragments this line represents
            const mergedLines = mergeFragmentsIntoLines(p.items);
            const line = mergedLines[editingItem.itemIndex];
            if (!line) return prev;

            const originalIndices = line.items.map(it => p.items.indexOf(it));
            const firstIndex = Math.min(...originalIndices);
            const indicesToRemove = new Set(originalIndices);

            const filteredItems = p.items.filter((_, idx) => !indicesToRemove.has(idx));

            const newMergedItem = {
                ...line,
                content: newText,
                type: 'text',
                items: undefined
            };

            filteredItems.splice(firstIndex, 0, newMergedItem);
            p.items = filteredItems;

            return next;
        });

        setEditingItem(null);
    };

    return (
        <div className="pdf-renderer" style={{ display: 'flex', flexDirection: 'column', gap: '40px', alignItems: 'center', padding: '40px', backgroundColor: '#525659', minHeight: '200vh', position: 'relative' }}>
            {localPages.map((page, index) => (
                <PageRenderer
                    key={index}
                    page={page}
                    pageIndex={index}
                    fontsKey={fontsLoaded}
                    editingItem={editingItem}
                    onDoubleClick={handleDoubleClick}
                />
            ))}

            {/* --- FLOATING TEXT EDITOR (Global Overlay) --- */}
            {editingItem && (
                <FloatingTextEditor
                    editingItem={editingItem}
                    onSave={handleSaveEdit}
                />
            )}
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
            inputRef.current.select(); // Select all text on open
        }
    }, []);

    // Since the main renderer has relative/absolute positioning, 
    // we can use fixed positioning or absolute relative to the body if simpler.
    // The `editingItem.rect` contains detailed viewport coordinates from getBoundingClientRect().
    // Using `position: fixed` is usually safest for overlays to match getBoundingClientRect.

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
                position: 'fixed',
                top: editingItem.rect.top - 2,
                left: editingItem.rect.left - 4,
                width: editingItem.rect.width + 20, // Allow slight expansion
                minWidth: '100px',
                height: 'auto',
                background: 'white',
                color: 'black', // Always black for contrast while editing? Or inherit?
                // color: editingItem.styles.color,
                border: '2px solid #00AAFF',
                borderRadius: '4px',
                padding: '0px 4px',
                zIndex: 9999, // Ensure it's on top of everything
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

function PageRenderer({ page, pageIndex, fontsKey, editingItem, onDoubleClick }) {
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;

    const renderWidth = page.width || A4_WIDTH;
    const renderHeight = page.height || A4_HEIGHT;

    const { paths, images, textItems, isRichPage, mergedLines } = useMemo(() => {
        const paths = [];
        const images = [];
        const textItems = [];

        (page.items || []).forEach((item, originalIndex) => {
            if (item.type === 'text') {
                textItems.push({ ...item, originalIndex });
            } else if (item.type === 'image') {
                images.push(item);
            } else if (item.type.startsWith('path') || item.type === 'stroke' || item.type === 'fill') {
                paths.push(item);
            }
        });

        const mergedLines = mergeFragmentsIntoLines(page.items);

        // Smart Detection
        const hasLargeImage = images.some(img => (img.width * img.height) > (renderWidth * renderHeight * 0.5));
        const hasManyPaths = paths.length > 50;
        const isRichPage = hasLargeImage || hasManyPaths;

        return { paths, images, textItems, isRichPage, mergedLines };
    }, [page.items, renderWidth, renderHeight]);

    return (
        <div
            className="pdf-page-container"
            style={{
                width: renderWidth,
                height: renderHeight,
                position: 'relative',
                backgroundColor: 'white',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                userSelect: 'text'
            }}
        >
            <svg
                width={renderWidth}
                height={renderHeight}
                viewBox={`0 0 ${renderWidth} ${renderHeight}`}
                textRendering="geometricPrecision"
                shapeRendering="geometricPrecision"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            >
                {/* 1. Vector Layer */}
                <VectorLayer items={paths} height={renderHeight} />

                {/* 2. Image Layer */}
                <ImageLayer items={images} height={renderHeight} />

                {/* 3. Text Layer */}
                <EditableTextLayer
                    items={mergedLines}
                    height={renderHeight}
                    fontsKey={fontsKey}
                    hideText={false}
                    pageIndex={pageIndex}
                    editingItem={editingItem}
                    onDoubleClick={onDoubleClick}
                />
            </svg>

            {/* Page Badge for Parity */}
            <div style={{ position: 'absolute', bottom: '25px', right: '25px', display: 'flex', gap: '10px', zIndex: 30 }}>
                <div style={{ background: 'rgba(0,0,0,0.7)', padding: '8px 15px', borderRadius: '12px', color: 'white', fontSize: '0.8rem', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    Page {pageIndex + 1}
                </div>
            </div>
        </div>
    );
}

function VectorLayer({ items, height }) {
    const pathElements = [];
    let currentD = "";

    items.forEach((op, index) => {
        if (op.type === 'path_move') {
            currentD += `M ${op.x} ${height - op.y} `;
        } else if (op.type === 'path_line') {
            currentD += `L ${op.x} ${height - op.y} `;
        } else if (op.type === 'path_curve' && op.pts) {
            const p = op.pts;
            currentD += `C ${p[0]} ${height - p[1]}, ${p[2]} ${height - p[3]}, ${p[4]} ${height - p[5]} `;
        } else if (op.type === 'path_close') {
            currentD += `Z `;
        } else if (op.type === 'stroke') {
            if (currentD) {
                const c = op.color || [0, 0, 0];
                pathElements.push(
                    <path
                        key={`s-${index}`}
                        d={currentD}
                        stroke={`rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`}
                        strokeWidth={op.width || 1}
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                    />
                );
                currentD = "";
            }
        } else if (op.type === 'fill') {
            if (currentD) {
                const c = op.color || [0, 0, 0];
                pathElements.push(
                    <path
                        key={`f-${index}`}
                        d={currentD}
                        fill={`rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`}
                        stroke="none"
                    />
                );
                currentD = "";
            }
        }
    });

    return <g className="vector-layer" style={{ pointerEvents: 'none' }}>{pathElements}</g>;
}

function ImageLayer({ items, height }) {
    return (
        <g className="image-layer" style={{ pointerEvents: 'none' }}>
            {items.map((img, i) => (
                img.data && (
                    <image
                        key={i}
                        href={`data:image/png;base64,${img.data}`}
                        x={img.x}
                        y={height - (img.y + img.height)}
                        width={img.width}
                        height={img.height}
                        preserveAspectRatio="none"
                    />
                )
            ))}
        </g>
    );
}

function EditableTextLayer({ items, height, fontsKey, hideText, pageIndex, editingItem, onDoubleClick }) {
    return (
        <g className="text-layer" key={fontsKey}>
            {items.map((item, i) => {
                if (item.type !== 'text' || !item.bbox) return null;

                const w = item.bbox[2] - item.bbox[0];
                const color = item.color
                    ? `rgb(${item.color[0] * 255},${item.color[1] * 255},${item.color[2] * 255})`
                    : 'black';

                // Construct matrix for SVG transform
                const [a, b, c, d] = item.matrix || [1, 0, 0, 1];

                // Use origin[1] (baseline) if available, fallback to bbox[1]
                const baselineY = item.origin ? item.origin[1] : item.bbox[1];
                const startX = item.origin ? item.origin[0] : item.bbox[0];

                const isEditing = editingItem && editingItem.pageIndex === pageIndex && editingItem.itemIndex === i;

                // Hit Area Calculations
                const [x0, y0, x1, y1] = item.bbox;
                // PDF y=0 is bottom. SVG y=0 is top.
                // rectY (top-left) = height - y1
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
                                e.preventDefault();
                                e.stopPropagation();

                                const rect = e.target.getBoundingClientRect();
                                const computed = window.getComputedStyle(e.target);
                                // Pass text styles, not rect styles
                                onDoubleClick(pageIndex, i, item, rect, {
                                    fontSize: Math.abs(item.size) + 'px',
                                    fontFamily: item.font,
                                    fontWeight: item.is_bold ? 'bold' : 'normal',
                                    fontStyle: item.is_italic ? 'italic' : 'normal',
                                    color: color
                                });
                            }}
                        />

                        {/* 2. Visual Text */}
                        <text
                            visibility={isEditing ? 'hidden' : 'visible'}
                            transform={`translate(${startX}, ${baselineY}) matrix(${a},${b},${c},${d},0,0)`}
                            fontSize={Math.abs(item.size)}
                            fontFamily={`"${item.font}", serif`}
                            fontWeight={item.is_bold ? 'bold' : 'normal'}
                            fontStyle={item.is_italic ? 'italic' : 'normal'}
                            fill={hideText ? "transparent" : color}
                            dominantBaseline="alphabetic"
                            style={{
                                userSelect: 'none', // Disable native selection to prefer click handling
                                pointerEvents: 'none', // Let clicks pass to the rect
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
