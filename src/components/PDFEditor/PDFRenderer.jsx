import React, { useEffect, useMemo, useState, useRef } from 'react';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';

export default function PDFRenderer({ data, isMini = false, activePageIndex, nodeEdits = {} }) {
    const [localPages, setLocalPages] = useState([]);

    useEffect(() => {
        if (data && data.pages) {
            setLocalPages(data.pages);
        }
    }, [data?.pages]);

    if (!localPages || localPages.length === 0) {
        return (
            <div style={{ padding: '100px', color: '#a1a1aa', textAlign: 'center' }}>
                No PDF content to display.
            </div>
        );
    }

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '40px',
        alignItems: 'center',
        padding: isMini ? '0' : '40px',
        backgroundColor: isMini ? 'transparent' : '#525659',
        minHeight: isMini ? 'auto' : '100%',
        position: 'relative',
        width: '100%'
    };

    return (
        <div className="pdf-renderer" style={containerStyle}>
            {localPages.map((page, index) => {
                if (!isMini && activePageIndex !== undefined && index !== activePageIndex) return null;

                return (
                    <PageRenderer
                        key={index}
                        page={page}
                        pageIndex={index}
                        fonts={data.fonts || []}
                        nodeEdits={nodeEdits}
                    />
                );
            })}
        </div>
    );
}

function PageRenderer({ page, pageIndex, fonts, nodeEdits }) {
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const renderWidth = page.width || A4_WIDTH;
    const renderHeight = page.height || A4_HEIGHT;
    const isTopDown = !!page.blocks;

    const fontStyles = useMemo(() => {
        if (!fonts || fonts.length === 0) return '';
        return fonts.map(f => `
            @font-face {
                font-family: "${f.name}";
                src: url(data:application/font-woff;base64,${f.data});
            }
        `).join('\n');
    }, [fonts]);

    const items = page.items || [];

    return (
        <div
            className="pdf-page-wrapper"
            style={{
                width: renderWidth + 'px',
                height: renderHeight + 'px',
                position: 'relative',
                backgroundColor: 'white',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                margin: '0 auto',
                flexShrink: 0
            }}
        >
            <svg
                width={renderWidth}
                height={renderHeight}
                viewBox={`0 0 ${renderWidth} ${renderHeight}`}
                textRendering="geometricPrecision"
                shapeRendering="geometricPrecision"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'visible'
                }}
            >
                <VectorLayer items={items} height={renderHeight} isTopDown={isTopDown} />
                <ImageLayer items={items.filter(it => it.type === 'image')} height={renderHeight} isTopDown={isTopDown} />

                {page.blocks ? (
                    <BlockLayer
                        blocks={page.blocks}
                        nodeEdits={nodeEdits}
                        pageIndex={pageIndex}
                        fontStyles={fontStyles}
                    />
                ) : (
                    <LegacyTextLayer
                        items={items}
                        height={renderHeight}
                        fontStyles={fontStyles}
                        pageIndex={pageIndex}
                    />
                )}
            </svg>
            <div style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', color: '#ccc', pointerEvents: 'none', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                Mode: SVG Lightweight
            </div>
        </div>
    );
}

function VectorLayer({ items, height, isTopDown }) {
    const flipY = (y) => isTopDown ? y : height - y;
    const pathElements = [];
    let currentD = "";

    items.forEach((op, index) => {
        if (op.type === 'pdf_path' && op.items) {
            op.items.forEach((sub, si) => {
                let d = "";
                if (sub.segments) {
                    sub.segments.forEach(seg => {
                        if (seg.type === 'm') d += `M ${seg.x} ${flipY(seg.y)} `;
                        else if (seg.type === 'l' && seg.pts) d += `L ${seg.pts[1][0]} ${flipY(seg.pts[1][1])} `;
                        else if (seg.type === 'c' && seg.pts) d += `C ${seg.pts[1][0]} ${flipY(seg.pts[1][1])}, ${seg.pts[2][0]} ${flipY(seg.pts[2][1])}, ${seg.pts[3][0]} ${flipY(seg.pts[3][1])} `;
                        else if (seg.type === 're' && seg.pts) {
                            const [x, y, w, h] = seg.pts[0];
                            d += `M ${x} ${flipY(y)} L ${x + w} ${flipY(y)} L ${x + w} ${flipY(y + h)} L ${x} ${flipY(y + h)} Z `;
                        }
                    });
                }
                if (d) {
                    pathElements.push(
                        <path
                            key={`${index}-${si}`}
                            d={d}
                            fill={sub.fill_color !== undefined ? `rgb(${(sub.fill_color >> 16) & 255},${(sub.fill_color >> 8) & 255},${sub.fill_color & 255})` : 'none'}
                            stroke={sub.stroke_color !== undefined ? `rgb(${(sub.stroke_color >> 16) & 255},${(sub.stroke_color >> 8) & 255},${sub.stroke_color & 255})` : 'none'}
                            strokeWidth={sub.stroke_width || 0}
                        />
                    );
                }
            });
            return;
        }

        if (op.type === 'path_move') currentD += `M ${op.x} ${flipY(op.y)} `;
        else if (op.type === 'path_line') currentD += `L ${op.x} ${flipY(op.y)} `;
        else if (op.type === 'path_curve' && op.pts) {
            const p = op.pts;
            currentD += `C ${p[0]} ${flipY(p[1])}, ${p[2]} ${flipY(p[3])}, ${p[4]} ${flipY(p[5])} `;
        }
        else if (op.type === 'stroke' || op.type === 'fill') {
            if (currentD) {
                const c = op.color || [0, 0, 0];
                const colorStr = `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`;
                pathElements.push(<path key={index} d={currentD} stroke={op.type === 'stroke' ? colorStr : 'none'} fill={op.type === 'fill' ? colorStr : 'none'} strokeWidth={op.width || 1} />);
                currentD = "";
            }
        }
    });

    return <g style={{ pointerEvents: 'none' }}>{pathElements}</g>;
}

function ImageLayer({ items, height, isTopDown }) {
    const flipY = (y, h) => isTopDown ? y : height - (y + h);
    return (
        <g style={{ pointerEvents: 'none' }}>
            {items.map((img, i) => img.data && (
                <image key={i} href={`data:image/png;base64,${img.data}`} x={img.x} y={flipY(img.y, img.height)} width={img.width} height={img.height} preserveAspectRatio="none" />
            ))}
        </g>
    );
}

function BlockLayer({ blocks, nodeEdits, pageIndex, fontStyles }) {
    return (
        <g className="block-layer">
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {blocks.map((block, bi) => (
                <SemanticBlock key={block.id || bi} block={block} nodeEdits={nodeEdits} pageIndex={pageIndex} />
            ))}
        </g>
    );
}

function SemanticBlock({ block, nodeEdits, pageIndex }) {
    return (
        <g className={`semantic-block ${block.type}`}>
            {(block.lines || []).map((line, li) => (
                <LineRenderer key={line.id || li} line={line} block={block} nodeEdits={nodeEdits} pageIndex={pageIndex} />
            ))}
        </g>
    );
}

function LineRenderer({ line, block, nodeEdits, pageIndex }) {
    const items = line.items || [];
    const firstItem = items[0];
    if (!firstItem) return null;

    const normalizeFont = (fontName) => {
        if (!fontName) return '"Latin Modern Roman", "Times New Roman", serif';
        const name = fontName.toLowerCase();
        if (name.includes('cmbx') || name.includes('bold')) return '"Latin Modern Roman", serif';
        if (name.includes('cm') || name.includes('sfrm')) return '"Latin Modern Roman", serif';
        return `"${fontName.replace(/^[A-Z]{6}\+/, '')}", "Latin Modern Roman", serif`;
    };

    const edit = nodeEdits[line.id] || {};
    const content = edit.content !== undefined ? edit.content : line.content;

    const isListItem = block.type === 'list-item';
    const startsWithBullet = /^[\u2022\u2217\u22c6\*\-\uâ–ª\[]/.test(content.trim());
    const isMarkerLine = isListItem && (line.is_bullet_start || startsWithBullet);

    if (isListItem) {
        console.log(`[LineRenderer] List item check: content="${content.substring(0, 10)}...", isMarkerLine=${isMarkerLine}, blockType=${block.type}, bulletStart=${line.is_bullet_start}, startsWithBullet=${startsWithBullet}`);
    }

    // Position Pillars
    const bulletX = firstItem.origin ? firstItem.origin[0] : firstItem.bbox[0];
    const textAnchorX = block.textX || (items[1]?.origin?.[0]) || (bulletX + 20);
    const baselineY = firstItem.origin ? firstItem.origin[1] : firstItem.bbox[1];

    // Style Safety: Use the second item (actual text) for the content style
    const contentItem = (isMarkerLine && items.length > 1) ? items[1] : firstItem;
    const isSmallCaps = (contentItem.font || '').toLowerCase().includes('cmcsc');

    const mapContentToIcons = (text, fontName) => {
        if (!text) return text;
        const lowerFont = (fontName || '').toLowerCase();

        // LaTeX/Computer Modern Symbol replacements
        let mapped = text
            .replace(/\u2022/g, '•')  // Bullet
            .replace(/\u2217/g, '∗')  // Asterisk bullet
            .replace(/\u22c6/g, '⋆')  // Star bullet
            .replace(/\u2013/g, '–')  // En-dash
            .replace(/\u2014/g, '—')  // Em-dash
            .replace(/^I$/g, '•')     // Artifact mapping: 'I' -> Bullet
            .replace(/^G$/g, '•');    // Artifact mapping: 'G' -> Bullet

        // FontAwesome Mapping (Based on nable_python.pdf findings)
        if (lowerFont.includes('fontawesome')) {
            mapped = mapped
                .replace(/\u0083/g, '\uf095') // ƒ -> Phone (PhoneAlt)
                .replace(/#/g, '\uf0e0')      // # -> Envelope
                .replace(/\u00a7/g, '\uf09b') // § -> Github
                .replace(/\u00ef/g, '\uf08c') // ï -> LinkedIn
                .replace(/\u00d0/g, '\uf121'); // Ð -> Code / LeetCode
        }
        return mapped;
    };

    const renderLine = () => {
        if (isMarkerLine) {
            // Dual-lane split for proper marker-size control
            const markerPart = line.bullet || '';
            const restPart = content; // Stripped content from EditorPage

            const bMetrics = block.bullet_metrics || {};
            // Bullet size correction: if extraction says 6 but it's a primary bullet, ensure it's at least 70% of text size
            const rawBSize = Math.abs(bMetrics.size || firstItem.size);
            const contentSize = Math.abs(contentItem.size);
            const safeBSize = (rawBSize < contentSize * 0.7) ? contentSize * 0.8 : rawBSize;

            return (
                <g className="decoupled-line">
                    <text
                        x={bulletX}
                        y={baselineY}
                        fontFamily={normalizeFont(firstItem.font)}
                        fontSize={safeBSize}
                        fill={firstItem.color ? `rgb(${firstItem.color[0] * 255},${firstItem.color[1] * 255},${firstItem.color[2] * 255})` : 'black'}
                        dominantBaseline="alphabetic"
                    >
                        {markerPart}
                    </text>
                    <text
                        x={textAnchorX}
                        y={baselineY}
                        fontFamily={normalizeFont(contentItem.font)}
                        fontSize={contentSize}
                        fontWeight={contentItem.is_bold ? 'bold' : 'normal'}
                        fontStyle={contentItem.is_italic ? 'italic' : 'normal'}
                        fill={contentItem.color ? `rgb(${contentItem.color[0] * 255},${contentItem.color[1] * 255},${contentItem.color[2] * 255})` : 'black'}
                        dominantBaseline="alphabetic"
                        xmlSpace="preserve"
                        style={{ pointerEvents: 'all', cursor: 'text', whiteSpace: 'pre', fontVariant: isSmallCaps ? 'small-caps' : 'normal' }}
                    >
                        {restPart}
                    </text>
                </g>
            );
        }

        // Multi-span flow for complex lines (mixed fonts/icons)
        return (
            <text
                x={bulletX}
                y={baselineY}
                dominantBaseline="alphabetic"
                xmlSpace="preserve"
                style={{
                    pointerEvents: 'all',
                    cursor: 'text',
                    whiteSpace: 'pre',
                    userSelect: 'none'
                }}
            >
                {items.length > 0 ? (
                    items.map((span, si) => {
                        const isSpanSmallCaps = (span.font || '').toLowerCase().includes('cmcsc');
                        const mappedContent = mapContentToIcons(span.content, span.font);
                        const isIconFont = (span.font || '').toLowerCase().includes('fontawesome');

                        return (
                            <tspan
                                key={si}
                                x={(si === 0 || Math.abs(span.origin?.[0] - items[si - 1]?.bbox?.[2]) > 0.5) ? (span.origin?.[0] || span.bbox[0]) : undefined}
                                fontSize={Math.abs(span.size)}
                                fontFamily={isIconFont ? '"Font Awesome 6 Free", "Font Awesome 5 Free"' : normalizeFont(span.font)}
                                fill={span.color ? `rgb(${span.color[0] * 255},${span.color[1] * 255},${span.color[2] * 255})` : 'black'}
                                fontWeight={span.is_bold ? 'bold' : 'normal'}
                                fontStyle={span.is_italic ? 'italic' : 'normal'}
                                style={{ fontVariant: isSpanSmallCaps ? 'small-caps' : 'normal' }}
                            >
                                {mappedContent}
                            </tspan>
                        );
                    })
                ) : content}
            </text>
        );
    };

    return (
        <g className="line-row" id={`line-${line.id}`}>
            {renderLine()}
        </g>
    );
}

function LegacyTextLayer({ items, height, fontStyles, pageIndex }) {
    const textItems = items.filter(it => it.type === 'text');
    return (
        <g className="legacy-text-layer">
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {textItems.map((item, i) => (
                <text
                    key={i}
                    x={item.origin ? item.origin[0] : item.bbox[0]}
                    y={item.origin ? item.origin[1] : height - item.bbox[1]}
                    fontSize={Math.abs(item.size)}
                    fontFamily={item.font}
                    fill="black"
                    dominantBaseline="alphabetic"
                >
                    {item.content}
                </text>
            ))}
        </g>
    );
}
