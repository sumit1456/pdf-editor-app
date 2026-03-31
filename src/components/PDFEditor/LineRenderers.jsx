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
    isFitMode, 
    onFitUpdate, 
    onFitUpdateBatch, 
    isReflowEnabled, 
    workerInstance, 
    itemRefs, 
    onPointerDown, 
    onPointerMove, 
    onPointerUp, 
    isDragEnabled, 
    showAllBboxes, 
    onScaleUpdate, 
    fittingQueue 
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
                    isFitMode={isFitMode}
                    onFitUpdate={onFitUpdate}
                    onFitUpdateBatch={onFitUpdateBatch}
                    isReflowEnabled={isReflowEnabled}
                    workerInstance={workerInstance}
                    itemRefs={itemRefs} 
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove} 
                    onPointerUp={onPointerUp}
                    isDragEnabled={isDragEnabled} 
                    showAllBboxes={showAllBboxes}
                    onScaleUpdate={onScaleUpdate} 
                    fittingQueue={fittingQueue}
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
    isFitMode, 
    onFitUpdate, 
    isReflowEnabled, 
    workerInstance, 
    itemRefs, 
    onPointerDown, 
    onPointerMove, 
    onPointerUp, 
    isDragEnabled, 
    showAllBboxes, 
    onScaleUpdate, 
    onFitUpdateBatch, 
    fittingQueue 
}) {
    const edit = nodeEdits[block.id] || {};
    const lines = useMemo(() => block.lines || [], [block]);
    const isBlockActive = activeNodeId === `block-reflow-${block.id}` || lines.some(l => l.id === activeNodeId);
    
    // Logic for "Reflow Mode" (ForeignObject) vs "Standard Mode" (Text Engine)
    const containerTypes = ['paragraph', 'list_item', 'heading', 'metadata_row', 'caption', 'code_block'];
    const shouldUseContainer = isReflowEnabled && containerTypes.includes(block.type);

    return (
        <g className={`semantic-block ${block.type}`} id={`block-${block.id}`}>
            {isReflowEnabled && isBlockActive && block.bbox && (
                <rect 
                    x={block.bbox[0] - 2} 
                    y={block.bbox[1] - 2}
                    width={block.bbox[2] - block.bbox[0] + 4} 
                    height={block.bbox[3] - block.bbox[1] + 4}
                    fill="none" 
                    stroke="#3b82f6" 
                    strokeWidth="2" 
                    opacity="0.8" 
                    pointerEvents="none" 
                />
            )}
            {shouldUseContainer ? (
                <BlockContainer 
                    block={block} 
                    edit={edit} 
                    nodeEdits={nodeEdits} 
                    pageIndex={pageIndex}
                    activeNodeId={activeNodeId} 
                    metricRatio={metricRatio} 
                    onDoubleClick={onDoubleClick} 
                    onSelect={onSelect}
                    isFitMode={isFitMode} 
                    itemRefs={itemRefs} 
                    onPointerDown={onPointerDown} 
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp} 
                    isDragEnabled={isDragEnabled} 
                    showAllBboxes={showAllBboxes} 
                    onScaleUpdate={onScaleUpdate} 
                />
            ) : (
                lines.map((line, li) => (
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
                        isFitMode={isFitMode} 
                        onFitUpdate={onFitUpdate}
                        onFitUpdateBatch={onFitUpdateBatch} 
                        onScaleUpdate={onScaleUpdate}
                        workerInstance={workerInstance}
                        itemRef={(el) => itemRefs.current.set(line.id, el)}
                        onPointerDown={onPointerDown} 
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp} 
                        isDragEnabled={isDragEnabled} 
                        showAllBboxes={showAllBboxes}
                    />
                ))
            )}
        </g>
    );
}

// ─── BlockContainer ───────────────────────────────────────────────────────────
// Legacy Reflow Container (simplified)
export function BlockContainer({ block, edit, nodeEdits, pageIndex, activeNodeId, metricRatio, onDoubleClick, onSelect, isFitMode, itemRefs, onPointerDown, onPointerMove, onPointerUp, isDragEnabled, showAllBboxes, onScaleUpdate }) {
    const bbox = block.bbox || [0, 0, 100, 100];
    const width = bbox[2] - bbox[0];
    const height = bbox[3] - bbox[1];
    const styleItem = block.lines?.[0]?.items?.[0] || {};
    const baseFontSize = Math.abs(styleItem.size || 10);
    const fontFamily = resolveFontFamily(styleItem.font);

    return (
        <foreignObject x={bbox[0]} y={bbox[1] - (baseFontSize * 0.8)} width={width + 100} height={height + 200}>
            <div xmlns="http://www.w3.org/1999/xhtml" style={{
                fontFamily, fontSize: `${baseFontSize}px`,
                lineHeight: 1.4, width: `${width}px`, whiteSpace: 'pre-wrap',
                pointerEvents: 'auto', outline: 'none'
            }}
                contentEditable={isDragEnabled}
                onDoubleClick={(e) => onDoubleClick(e, `block-reflow-${block.id}`)}
                onClick={(e) => onSelect && onSelect(`block-reflow-${block.id}`)}
            >
                {edit.content || block.lines.map(l => l.content).join('\n')}
            </div>
        </foreignObject>
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
    workerInstance, 
    showAllBboxes, 
    onFitUpdateBatch, 
    onScaleUpdate 
}) {
    const edit = nodeEdits[line.id] || {};
    const isModified = !!edit.isModified;
    const isActive = activeNodeId === line.id || activeNodeId === `block-reflow-${line.blockId}`;

    const [workerScale, setWorkerScale] = useState(null);

    // Use Engine to normalize line data
    const unifiedLine = useMemo(() => normalizeToUnifiedLine(line, 'processed'), [line]);

    // Handle Worker-based fitting (Cleaned up)
    useEffect(() => {
        if (!workerInstance || !line || isModified) return;
        
        const targetWidth = line.width || (line.bbox ? line.bbox[2] - line.bbox[0] : 100);
        const browserTarget = targetWidth * (metricRatio || 1.33);

        const handler = (e) => {
            if (e.data.type === 'measureFitResult' && e.data.id === line.id) {
                setWorkerScale(e.data.scale ?? 1.0);
                if (onFitUpdateBatch) {
                    onFitUpdateBatch({ [line.id]: { scale: e.data.scale, fontSize: e.data.fontSize } });
                }
            }
        };

        workerInstance.addEventListener('message', handler);
        workerInstance.postMessage({ 
            type: 'measureFit', 
            items: line.items || line.fragments || [], 
            targetWidth: browserTarget, 
            id: line.id 
        });

        return () => workerInstance.removeEventListener('message', handler);
    }, [line.id, workerInstance, isModified, metricRatio, line]);

    useEffect(() => {
        if (isActive && onScaleUpdate) onScaleUpdate(workerScale || 1.0);
    }, [isActive, workerScale, onScaleUpdate]);

    return (
        <TextLine 
            line={unifiedLine}
            scale={workerScale || 1.0}
            isActive={isActive}
            showBbox={showAllBboxes || isActive}
            isModified={isModified}
            editData={edit}
            onSelect={() => onSelect && onSelect(line.blockId ? `block-reflow-${line.blockId}` : line.id)}
            onDoubleClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const rep = (line.items || line.fragments)?.[0] || {};
                onDoubleClick(pageIndex, line.id, rep, rect, {
                    safetyStyle: { ...rep, uri: line.uri }
                });
            }}
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
