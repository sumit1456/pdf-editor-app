import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PDFRenderer from '../../components/PDFEditor/PDFRenderer';
import WebGLRenderer from '../../components/PDFEditor/WebGLRenderer';
import PythonRenderer from '../../components/PDFEditor/PythonRenderer';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';
import { ReflowEngine } from '../../lib/pdf-extractor/ReflowEngine';
import './EditorPage.css';

export default function EditorPage() {
    const location = useLocation();
    const backend = location.state?.backend || 'java';

    // MASTER STATE: All pages and the current active index
    // We merge fragments into lines ONCE at the start to create a persistent "Node Tree"
    const [pages, setPages] = useState(() => {
        const rawPages = location.state?.sceneGraph?.data?.pages || location.state?.sceneGraph?.pages || [];

        return rawPages.map((page, pIdx) => {
            // Check if backend already provided blocks (Python)
            if (page.blocks) {
                return page;
            }

            // Legacy Logic (Java): Manual fragment merging
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
    const [fonts] = useState(location.state?.sceneGraph?.data?.fonts || location.state?.sceneGraph?.fonts || []);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isAdvanced, setIsAdvanced] = useState(true);

    // NODE-BASED EDITING STATE: Persistent edits keyed by unique item ID
    const [nodeEdits, setNodeEdits] = useState({});

    // Persistent canvas for measurement
    const [measureCanvas] = useState(() => document.createElement('canvas'));

    // Initialize Reflow Engine with font metrics
    const reflowEngine = useMemo(() => new ReflowEngine(fonts), [fonts]);

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

    const handleDoubleClick = (pIdx, lineId, item, rect, extraData) => {
        // --- STYLE SAFETY MECHANIC ---
        // Capture and store original styles if not already set
        setNodeEdits(prev => {
            if (prev[lineId]?.safetyStyle) return prev; // Don't overwrite once set

            return {
                ...prev,
                [lineId]: {
                    ...(prev[lineId] || {}),
                    safetyStyle: extraData?.safetyStyle || {
                        size: item.size,
                        font: item.font,
                        color: item.color,
                        is_bold: item.is_bold,
                        is_italic: item.is_italic
                    },
                    isModified: prev[lineId]?.isModified || false
                }
            };
        });

        // Trigger existing scroll logic
        scrollToNode(lineId);
    };

    const scrollToNode = (idOrIndex) => {
        // Try to find by stable ID or index
        const element = document.getElementById(`input-card-${idOrIndex}`);

        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add a temporary highlight effect
            element.classList.add('highlight-flash');

            setTimeout(() => element.classList.remove('highlight-flash'), 1500);
        }
    };

    const handleSidebarEdit = (lineId, newText, originalStyle) => {
        if (!lineId) {
            console.warn('[EditorPage] Cannot edit node without stable ID');
            return;
        }

        // Logic:
        // 1. Update visual edit state for the SPECIFIC line
        setNodeEdits(prev => ({
            ...prev,
            [lineId]: {
                ...(prev[lineId] || {}),
                content: newText,
                safetyStyle: prev[lineId]?.safetyStyle || originalStyle,
                isModified: true
            }
        }));

        // NO REFLOW: We allow the user to manualy type at specific lines
    };

    const handleLinkEdit = (lineId, newUri, originalStyle) => {
        if (!lineId) return;
        setNodeEdits(prev => ({
            ...prev,
            [lineId]: {
                ...(prev[lineId] || {}),
                uri: newUri,
                safetyStyle: prev[lineId]?.safetyStyle || originalStyle,
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

    // Semantic Text items for Side Panels (Blocks for Python, Lines for Java)
    const textLines = useMemo(() => {
        if (!activePageData) return [];

        if (activePageData.blocks) {
            // Flatten all lines from all blocks for granular editing
            const flattenedLines = [];
            activePageData.blocks.forEach(block => {
                block.lines.forEach(line => {
                    flattenedLines.push({
                        id: line.id,
                        content: line.content,
                        type: 'text',
                        dataIndex: line.id,
                        isBlock: false,
                        marker: line.is_bullet_start ? block.marker : null,
                        level: block.level || 0,
                        blockId: block.id,
                        uri: line.uri,
                        originalStyle: {
                            size: line.size,
                            font: line.items[0]?.font,
                            color: line.items[0]?.color,
                            is_bold: line.items[0]?.is_bold,
                            is_italic: line.items[0]?.is_italic
                        }
                    });
                });
            });
            return flattenedLines;
        }

        return (activePageData.items || [])
            .map((item, index) => ({ ...item, dataIndex: index }))
            .filter(it => it.type === 'text');
    }, [activePageData]);

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
                            Page {activePageIndex + 1} &middot; {textLines.length} Lines
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
                                id={`input-card-${line.id || line.dataIndex}`}
                                className={`premium-input-card ${edit.isModified ? 'modified' : ''}`}
                                style={{ marginLeft: `${(line.level || 0) * 20}px` }}
                            >
                                <div className="input-card-header">
                                    <span className="line-label">
                                        Line {String(textLines.length - i).padStart(2, '0')}
                                        {edit.isModified && <span className="modified-badge">Edited</span>}
                                    </span>
                                </div>
                                <textarea
                                    id={`input-${line.id}`}
                                    value={displayContent}
                                    onChange={(e) => handleSidebarEdit(line.id, e.target.value, line.originalStyle)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            e.target.blur();
                                        }
                                    }}
                                />
                                {!!displayUri && (
                                    <div className="link-input-wrapper">
                                        <label>Link URL</label>
                                        <input
                                            type="text"
                                            value={displayUri || ''}
                                            placeholder="https://..."
                                            onChange={(e) => handleLinkEdit(line.id, e.target.value, line.originalStyle)}
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
                                fonts={fonts}
                                nodeEdits={nodeEdits}
                                onUpdate={handlePageUpdate}
                                onSelect={scrollToNode}
                                onDoubleClick={handleDoubleClick}
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
