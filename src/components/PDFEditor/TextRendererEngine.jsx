import React from 'react';
import { 
    resolveFontFamily, 
    getWeightFromFont, 
    normalizeFont 
} from './reflowUtils';
import { 
    getSVGColor, 
    mapContent, 
    renderVisualText 
} from './lineRenderUtils';

/**
 * TextRendererEngine.jsx
 * Specialized engine for high-fidelity SVG text rendering.
 * Supports: Processed Layout (result.json) and Raw Extraction (dict).
 */

// --- NORMALIZER ---

export const normalizeToUnifiedLine = (input, type = 'processed') => {
    if (!input) return null;

    if (type === 'raw') {
        // Handle PyMuPDF "line" dict
        const spans = input.spans || [];
        const firstSpan = spans[0] || {};
        return {
            id: input.id || Math.random().toString(36).substr(2, 9),
            content: spans.map(s => s.text).join(''),
            bbox: input.bbox || [0, 0, 0, 0],
            origin: firstSpan.origin || [0, 0],
            fragments: spans.map(s => ({
                text: s.text,
                font: s.font,
                size: s.size,
                color: s.color, // Color might need parsing if it's an int
                isBold: !!(s.flags & 16),
                isItalic: !!(s.flags & 2),
                origin: s.origin,
                bbox: s.bbox
            })),
            lineType: 'paragraph'
        };
    }

    // Handle processed result.json "line"
    return {
        id: input.id,
        content: input.content || '',
        bbox: input.bbox,
        origin: input.origin || (input.items?.[0]?.origin),
        fragments: (input.fragments || input.items || []).map(f => ({
            text: f.text || f.content,
            font: f.font,
            size: f.size,
            color: f.color,
            isBold: f.is_bold || !!(f.flags & 16),
            isItalic: f.is_italic || !!(f.flags & 2),
            origin: f.origin,
            bbox: f.bbox,
            fontVariant: f.font_variant || 'normal'
        })),
        lineType: input.type || 'paragraph',
        uri: input.uri
    };
};

// --- COMPONENTS ---

/**
 * Renders a single unified line using a single <text> element and <tspan> children.
 */
export function TextLine({ 
    line, 
    scale = 1.0, 
    isActive = false, 
    onDoubleClick, 
    onSelect,
    isModified = false,
    editData = {},
    showBbox = false
}) {
    if (!line || !line.fragments || line.fragments.length === 0) return null;

    const firstFrag = line.fragments[0];
    const initialX = line.origin ? line.origin[0] : firstFrag.origin[0];
    const initialY = line.origin ? line.origin[1] : firstFrag.origin[1];
    
    // Determine base style for the line (from first non-empty span)
    const baseStyleItem = line.fragments.find(f => (f.text || '').trim().length > 0) || firstFrag;
    const baseFamily = resolveFontFamily(baseStyleItem.font, baseStyleItem.googleFont);
    const baseSize = baseStyleItem.size || 10;
    const baseWeight = getWeightFromFont(baseStyleItem.font, baseStyleItem.isBold);
    const baseStyle = baseStyleItem.isItalic ? 'italic' : 'normal';

    const renderFragments = () => {
        return line.fragments.map((frag, i) => {
            const mappedText = mapContent(frag.text);
            const isIcon = /[\uf000-\uf999]/.test(mappedText);
            const fragFamily = isIcon 
                ? '"Font Awesome 6 Free", "Font Awesome 6 Brands", sans-serif'
                : resolveFontFamily(frag.font, frag.googleFont);
            
            const fragWeight = isIcon ? '900' : (frag.isBold ? '700' : '400');
            const fragStyle = frag.isItalic ? 'italic' : 'normal';
            const fragColor = getSVGColor(frag.color, 'black');
            const isSmallCaps = frag.fontVariant === 'small-caps' || (frag.font || '').toLowerCase().includes('cmcsc');

            // Position: If it's the first fragment, we don't need absolute X/Y as it's set on parent <text>
            // but for subsequent fragments with gaps, we might need absolute positioning.
            const needsAbsolutePos = i > 0 && Math.abs(frag.origin[0] - line.fragments[i-1].origin[0]) > 2.0;

            return (
                <tspan 
                    key={i}
                    x={needsAbsolutePos ? frag.origin[0] : undefined}
                    y={needsAbsolutePos ? frag.origin[1] : undefined}
                    fontFamily={fragFamily.replace(/'/g, "")}
                    fontSize={Math.max(1, frag.size * scale)}
                    fontWeight={fragWeight}
                    fontStyle={fragStyle}
                    fill={fragColor}
                    style={{ 
                        fontVariant: isSmallCaps ? 'small-caps' : 'normal',
                        dominantBaseline: 'alphabetic'
                    }}
                >
                    {renderVisualText(mappedText, isSmallCaps, frag.size)}
                </tspan>
            );
        });
    };

    return (
        <g 
            className={`text-engine-line ${line.lineType} ${isActive ? 'active' : ''}`}
            id={`engine-line-${line.id}`}
            onDoubleClick={(e) => onDoubleClick && onDoubleClick(e, line)}
            onClick={(e) => onSelect && onSelect(e, line)}
            style={{ cursor: 'pointer' }}
        >
            {/* Interaction Rect */}
            {(showBbox || isActive) && line.bbox && (
                <rect 
                    x={line.bbox[0]} 
                    y={line.bbox[1]} 
                    width={line.bbox[2] - line.bbox[0]} 
                    height={line.bbox[3] - line.bbox[1]}
                    fill="none"
                    stroke={isActive ? "#3b82f6" : "#cbd5e1"}
                    strokeWidth={isActive ? "1.5" : "1"}
                    strokeDasharray={isActive ? "none" : "2 2"}
                    pointerEvents="none"
                />
            )}

            {/* Invisible Hit Area (slightly larger than text) */}
            {line.bbox && (
                <rect 
                    x={line.bbox[0] - 2} 
                    y={line.bbox[1] - 2} 
                    width={(line.bbox[2] - line.bbox[0]) + 4} 
                    height={(line.bbox[3] - line.bbox[1]) + 4}
                    fill="transparent"
                    pointerEvents="all"
                />
            )}

            <text
                x={initialX}
                y={initialY}
                fontFamily={baseFamily.replace(/'/g, "")}
                fontSize={Math.max(1, baseSize * scale)}
                fontWeight={baseWeight}
                fontStyle={baseStyle}
                dominantBaseline="alphabetic"
                xmlSpace="preserve"
                style={{ 
                    userSelect: 'none', 
                    pointerEvents: 'none',
                    letterSpacing: 'normal'
                }}
            >
                {renderFragments()}
            </text>
        </g>
    );
}
