import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import PDFRenderer from '../../components/PDFEditor/PDFRenderer';
import WebGLRenderer from '../../components/PDFEditor/WebGLRenderer';
import PythonRenderer from '../../components/PDFEditor/PythonRenderer';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';
import './EditorPage.css';

export default function EditorPage() {
    const location = useLocation();
    const backend = location.state?.backend || 'java';

    // MASTER STATE: All pages and the current active index
    // We merge fragments into lines ONCE at the start to create a persistent "Node Tree"
    const [pages, setPages] = useState(() => {
        const rawPages = location.state?.sceneGraph?.data?.pages || location.state?.sceneGraph?.pages || [];

        return rawPages.map((page, pIdx) => {
            // CRITICAL: Ensure every raw item has a stable unique ID before merging.
            // This prevents the "leak" where geometric collisions in LineMerger created duplicate IDs.
            const itemsWithIds = (page.items || []).map((item, iIdx) => ({
                id: item.id || item.line_id || `page${pIdx}-item${iIdx}`,
                ...item
            }));

            return {
                ...page,
                items: mergeFragmentsIntoLines(itemsWithIds)
            };
        });
    });

    const [fontsKey] = useState(location.state?.sceneGraph?.data?.fonts_key || location.state?.sceneGraph?.fonts_key || '');
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isAdvanced, setIsAdvanced] = useState(true);

    // NODE-BASED EDITING STATE: Persistent edits keyed by unique item ID
    const [nodeEdits, setNodeEdits] = useState({});

    // Persistent canvas for measurement
    const [measureCanvas] = useState(() => document.createElement('canvas'));

    // Helper for measuring text width
    const getTextWidth = (text, font, size) => {
        const context = measureCanvas.getContext('2d');
        context.font = `${Math.abs(size)}px "${font}", serif`;
        return context.measureText(text).width;
    };

    // Handle updates from Renderers (e.g. Text Edit)
    const handlePageUpdate = (newItems) => {
        setPages(prev => {
            const next = [...prev];
            const p = { ...next[activePageIndex] };
            p.items = newItems;
            next[activePageIndex] = p;
            return next;
        });
    };

    const scrollToNode = (index) => {
        const element = document.getElementById(`input-card-${index}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add a temporary highlight effect
            element.classList.add('highlight-flash');

            setTimeout(() => element.classList.remove('highlight-flash'), 1500);
        }
    };

    const handleSidebarEdit = (lineId, newText) => {
        if (!lineId) {
            console.warn('[EditorPage] Cannot edit node without stable ID');
            return;
        }

        setNodeEdits(prev => ({
            ...prev,
            [lineId]: {
                ...(prev[lineId] || {}),
                content: newText,
                isModified: true
            }
        }));
    };

    const handleLinkEdit = (lineId, newUri) => {
        if (!lineId) return;
        setNodeEdits(prev => ({
            ...prev,
            [lineId]: {
                ...(prev[lineId] || {}),
                uri: newUri,
                isModified: true
            }
        }));
    };

    if (pages.length === 0) {
        return (
            <div className="editor-page">
                <div className="placeholder" style={{ marginTop: '100px', color: 'var(--studio-text-dim)' }}>
                    No PDF data found. Upload a file first.
                </div>
            </div>
        );
    }

    const activePageData = pages[activePageIndex];
    // Filter to text and preserve original data index for stable scrolling
    const textLines = activePageData
        ? activePageData.items
            .map((item, index) => ({ ...item, dataIndex: index }))
            .filter(it => it.type === 'text')
        : [];

    return (
        <div className="editor-page">
            {/* Studio Background Layer */}
            <div className="bg-decoration">
                <div className="floating-shape shape-1"></div>
                <div className="floating-shape shape-2"></div>
            </div>

            {/* 1. EDITING PANEL - Premium Editorial Panel (Now on the Left) */}
            <div className="editing-panel">
                <div className="panel-header">
                    <div>
                        <h3 className="highlight">
                            Content <span style={{ color: 'var(--studio-white)', WebkitTextFillColor: 'initial' }}>Studio</span>
                        </h3>
                        <p>
                            Page {activePageIndex + 1}
                        </p>
                    </div>
                </div>

                <div className="structure-list" style={{ scrollBehavior: 'smooth' }}>
                    {textLines.slice().reverse().map((line, i) => {
                        const edit = nodeEdits[line.id] || {};
                        const displayContent = edit.content !== undefined ? edit.content : line.content;
                        const displayUri = edit.uri !== undefined ? edit.uri : line.uri;

                        return (
                            <div
                                key={line.id || i}
                                id={`input-card-${line.dataIndex}`}
                                className={`premium-input-card ${edit.isModified ? 'modified' : ''}`}
                            >
                                <div className="input-card-header">
                                    <span className="object-label">
                                        Object {String(textLines.length - i).padStart(2, '0')}
                                        {edit.isModified && <span className="modified-badge">Edited</span>}
                                    </span>
                                </div>
                                <textarea
                                    id={`input-${line.id}`}
                                    value={displayContent}
                                    onChange={(e) => handleSidebarEdit(line.id, e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            e.target.blur();
                                        }
                                    }}
                                />
                                {(line.uri !== undefined || displayUri !== undefined) && (
                                    <div className="link-input-wrapper">
                                        <label>Link URL</label>
                                        <input
                                            type="text"
                                            value={displayUri || ''}
                                            placeholder="https://..."
                                            onChange={(e) => handleLinkEdit(line.id, e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 2. MAIN WORKSPACE - Central WebGL Stage */}
            <div className="workspace-container">
                <div className="workspace-header">
                    <h2 className="highlight">
                        WebGL <span style={{ color: 'var(--studio-white)', WebkitTextFillColor: 'initial' }}>Engine</span>
                    </h2>
                </div>

                <div className="preview-stage">
                    <div className="preview-content-wrapper">
                        {backend === 'python' ? (
                            <PythonRenderer
                                page={activePageData}
                                pageIndex={activePageIndex}
                                fontsKey={fontsKey}
                                nodeEdits={nodeEdits}
                                onUpdate={handlePageUpdate}
                                onSelect={scrollToNode}
                            />
                        ) : (
                            <WebGLRenderer
                                page={activePageData}
                                pageIndex={activePageIndex}
                                fontsKey={fontsKey}
                                onUpdate={handlePageUpdate}
                                onSelect={scrollToNode}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* 3. PAGE NAVIGATOR - Grid (Now on the Right as requested) */}
            <div className="navigator-sidebar">
                <div className="navigator-header">
                    <h3 style={{ fontSize: '1rem', color: '#fff', margin: '0 0 10px 0' }}>Pages preview</h3>
                </div>
                <div className="navigator-grid">
                    {pages.map((_, i) => (
                        <div
                            key={i}
                            onClick={() => setActivePageIndex(i)}
                            className={`sidebar-thumb ${activePageIndex === i ? 'active' : ''}`}
                        >
                            {i + 1}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
