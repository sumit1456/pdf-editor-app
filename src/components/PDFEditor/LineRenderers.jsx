import React, { useMemo, useEffect, useState } from 'react';
import { 
    MEASURE_CTX, 
    getRealFontString, 
    normalizeFont, 
    resolveFontFamily, 
    getWeightFromFont 
} from './reflowUtils';
import {
    getSVGColor,
    renderVisualText,
    mapContent,
} from './lineRenderUtils';
import { 
    normalizeToUnifiedLine, 
    TextLine 
} from './TextRendererEngine';

/**
 * LineRenderers.jsx
 * High-level layout components for the PDF Editor.
 * Delegates actual text rendering to TextRendererEngine.jsx
 */

// ─── BlockLayer ───────────────────────────────────────────────────────────────

export function BlockLayer({ 
    blocks, 
    isFirstPage, 
    nodeEdits, 
    pageIndex, 
    activeNodeId, 
    selectedWordIndices, 
    fontsKey, 
    fontStyles, 
    metricRatio, 
    onDoubleClick, 
    onSelect, 
    showAllBboxes, 
    onScaleUpdate,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    itemRefs,
    isDragEnabled
}) {
    return (
        <g className="block-layer" key={fontsKey}>
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {blocks.map((block, bi) => (
                <SemanticBlock
                    key={block.id || bi}
                    isFirstBlock={isFirstPage && bi === 0}
                    block={block} 
                    nodeEdits={nodeEdits}
                    pageIndex={pageIndex} 
                    activeNodeId={activeNodeId}
                    selectedWordIndices={selectedWordIndices}
                    metricRatio={metricRatio} 
                    onDoubleClick={onDoubleClick}
                    onSelect={onSelect} 
                    showAllBboxes={showAllBboxes}
                    onScaleUpdate={onScaleUpdate} 
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    itemRefs={itemRefs}
                    isDragEnabled={isDragEnabled}
                />
            ))}
        </g>
    );
}

// ─── SemanticBlock ────────────────────────────────────────────────────────────

export function SemanticBlock({ 
    isFirstBlock, 
    block, 
    nodeEdits, 
    pageIndex, 
    activeNodeId, 
    selectedWordIndices, 
    metricRatio, 
    onDoubleClick, 
    onSelect, 
    showAllBboxes, 
    onScaleUpdate,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    itemRefs,
    isDragEnabled
}) {
    const edit = nodeEdits[block.id] || {};
    const lines = useMemo(() => block.lines || [], [block]);
    const isBlockActive = activeNodeId === `block-reflow-${block.id}` || lines.some(l => l.id === activeNodeId);
    
    return (
        <g className={`semantic-block ${block.type}`} id={`block-${block.id}`}>
            {lines.map((line, li) => (
                <LineRenderer
                    key={line.id || li}
                    isFirstLine={isFirstBlock && li === 0}
                    line={line} 
                    block={block} 
                    nodeEdits={nodeEdits}
                    pageIndex={pageIndex} 
                    activeNodeId={activeNodeId}
                    selectedWordIndices={selectedWordIndices}
                    metricRatio={metricRatio} 
                    onDoubleClick={onDoubleClick} 
                    onSelect={onSelect}
                    showAllBboxes={showAllBboxes}
                    onScaleUpdate={onScaleUpdate}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    itemRef={(el) => itemRefs && itemRefs.current.set(line.id || li, el)}
                    isDragEnabled={isDragEnabled}
                />
            ))}
        </g>
    );
}



// ─── LineRenderer ─────────────────────────────────────────────────────────────

export function LineRenderer({ 
    line, 
    nodeEdits, 
    pageIndex, 
    activeNodeId, 
    metricRatio, 
    onDoubleClick, 
    onSelect, 
    showAllBboxes, 
    onScaleUpdate,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    itemRef,
    isDragEnabled
}) {
    const edit = nodeEdits[line.id] || {};
    const isModified = !!edit.isModified;
    const isActive = activeNodeId === line.id;

    const workerScale = 1.0;

    // Use Engine to normalize line data
    const unifiedLine = useMemo(() => normalizeToUnifiedLine(line, 'processed'), [line]);


    useEffect(() => {
        if (isActive && onScaleUpdate) onScaleUpdate(workerScale || 1.0);
    }, [isActive, workerScale, onScaleUpdate]);

    const firstItem = line.items?.[0] || {};
    const baselineY = firstItem.origin ? firstItem.origin[1] : (firstItem.bbox ? firstItem.bbox[1] : 0);
    const startX = firstItem.origin ? firstItem.origin[0] : (firstItem.bbox ? firstItem.bbox[0] : 0);

    return (
        <TextLine 
            line={unifiedLine}
            scale={workerScale || 1.0}
            isActive={isActive}
            showBbox={showAllBboxes || isActive}
            isModified={isModified}
            editData={edit}
            onSelect={() => onSelect && onSelect(line.id)}
            onDoubleClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const rep = (line.items || line.fragments)?.[0] || {};
                onDoubleClick(pageIndex, line.id, rep, rect, {
                    safetyStyle: { ...rep, uri: line.uri }
                });
            }}
            onPointerDown={(e) => isDragEnabled && onPointerDown && onPointerDown(e, line.id, startX, baselineY)}
            onPointerMove={isDragEnabled ? onPointerMove : undefined}
            onPointerUp={isDragEnabled ? onPointerUp : undefined}
            itemRef={itemRef}
        />
    );
}

// ─── EditableTextLayer ────────────────────────────────────────────────────────
export function EditableTextLayer({ items, nodeEdits, activeNodeId, pageIndex, fontsKey, fontStyles, metricRatio, onDoubleClick, isFitMode, onSelect }) {
    return (
        <g className="editable-text-layer">
            <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
            {items.map((item, i) => (
                <EditableTextItem 
                    key={item.id || i} 
                    item={item} 
                    edit={nodeEdits[item.id] || {}} 
                    pageIndex={pageIndex}
                    activeNodeId={activeNodeId}
                    onDoubleClick={onDoubleClick}
                    onSelect={onSelect}
                />
            ))}
        </g>
    );
}

export function EditableTextItem({ item, edit, pageIndex, activeNodeId, onDoubleClick, onSelect }) {
    const unifiedLine = useMemo(() => normalizeToUnifiedLine(item, 'processed'), [item]);
    return (
        <TextLine 
            line={unifiedLine}
            isActive={activeNodeId === item.id}
            editData={edit}
            onDoubleClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onDoubleClick(pageIndex, item.id, item, rect, { safetyStyle: item });
            }}
            onSelect={() => onSelect && onSelect(item.id)}
        />
    );
}
