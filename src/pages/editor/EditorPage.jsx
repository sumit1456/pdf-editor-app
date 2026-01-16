import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PDFRenderer from '../../components/PDFEditor/PDFRenderer';
import WebGLRenderer from '../../components/PDFEditor/WebGLRenderer';
import PythonRenderer from '../../components/PDFEditor/PythonRenderer';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';
import { ReflowEngine } from '../../lib/pdf-extractor/ReflowEngine';
import './EditorPage.css';

// Helper to decouple bullets from content (Global for use in initializers)
const splitBullet = (content) => {
    if (!content) return { bullet: '', text: '' };

    // Robust pattern for bullet markers:
    // 1. Common symbols: • · * ∗ ⋆ – - »
    // 2. Ordered markers: 1. 1) a. a)
    // Matches the marker and all trailing whitespace
    const match = content.match(/^([•·*∗⋆–\-»]|[\da-zA-Z]+[.)])\s*/);

    if (match) {
        const bulletPart = match[0];
        return {
            bullet: bulletPart,
            text: content.substring(bulletPart.length)
        };
    }

    return { bullet: '', text: content };
};

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
                // Sanitize Python blocks: separate bullets from content at the root
                const newBlocks = page.blocks.map(block => ({
                    ...block,
                    lines: block.lines.map(line => {
                        const isBullet = !!line.is_bullet_start;
                        const { bullet, text } = isBullet ? splitBullet(line.content) : { bullet: '', text: line.content };
                        return {
                            ...line,
                            content: text,
                            bullet: bullet
                        };
                    })
                }));
                return { ...page, blocks: newBlocks };
            }

            // Legacy Logic (Java): Manual fragment merging
            const itemsWithIds = (page.items || []).map((item, iIdx) => ({
                id: item.id || item.line_id || `page${pIdx}-item${iIdx}`,
                ...item
            }));

            const mergedItems = mergeFragmentsIntoLines(itemsWithIds);

            // Apply bullet splitting to Java items as well
            const processedItems = mergedItems.map(item => {
                if (item.type === 'text') {
                    const { bullet, text } = splitBullet(item.content);
                    return {
                        ...item,
                        bullet: bullet,
                        content: text,
                        is_bullet_start: !!bullet
                    };
                }
                return item;
            });

            return {
                ...page,
                items: processedItems
            };
        });
    });

    const [fontsKey] = useState(location.state?.sceneGraph?.data?.fonts_key || location.state?.sceneGraph?.fonts_key || '');
    const [fonts] = useState(location.state?.sceneGraph?.data?.fonts || location.state?.sceneGraph?.fonts || []);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isAdvanced, setIsAdvanced] = useState(true);

    // NODE-BASED EDITING STATE: Persistent edits keyed by unique item ID
    const [nodeEdits, setNodeEdits] = useState({});
    const [renderMode, setRenderMode] = useState('webgl'); // 'webgl' or 'svg'
    const [activeTab, setActiveTab] = useState('text'); // 'text' or 'links'
    const [zoom, setZoom] = useState(0.85); // Master zoom state

    const handleZoom = (delta) => {
        setZoom(prev => Math.min(2.0, Math.max(0.3, parseFloat((prev + delta).toFixed(2)))));
    };
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
        // --- AUTO-TAB SWITCHING ---
        // If the clicked line isn't in the current tab, flip tabs
        const nodeInCurrentTab = textLines.find(l => l.id === lineId);
        if (!nodeInCurrentTab) {
            setActiveTab(prev => prev === 'text' ? 'links' : 'text');
        }

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

        // Trigger existing scroll logic with a slight delay to allow tab render
        setTimeout(() => scrollToNode(lineId), 100);
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

        const flattenedLines = [];

        if (activePageData.blocks) {
            // Flatten all lines from all blocks for granular editing
            activePageData.blocks.forEach(block => {
                block.lines.forEach(line => {
                    const isBullet = !!(line.bullet || line.is_bullet_start);
                    // Safety: Even if initializer missed it, try splitting here for the sidebar projection
                    const { bullet, text } = isBullet ?
                        { bullet: line.bullet, text: line.content } :
                        splitBullet(line.content);

                    // Style Safety: Use the second item (actual text) for the content style if it's a bullet
                    const contentItem = (isBullet && line.items.length > 1) ? line.items[1] : (line.items[0] || {});

                    flattenedLines.push({
                        id: line.id,
                        content: text,
                        bullet: bullet || line.bullet,
                        type: 'text',
                        dataIndex: line.id,
                        isBlock: false,
                        marker: (line.is_bullet_start || bullet) ? (line.bullet_char || bullet?.trim() || block.marker) : null,
                        level: block.level || 0,
                        blockId: block.id,
                        uri: line.uri,
                        originalStyle: {
                            size: contentItem.size || line.size,
                            font: contentItem.font,
                            color: contentItem.color,
                            is_bold: contentItem.is_bold,
                            is_italic: contentItem.is_italic
                        }
                    });
                });
            });
        } else {
            // Legacy Path (Java)
            (activePageData.items || [])
                .filter(it => it.type === 'text')
                .forEach((item, index) => {
                    const { bullet, text } = (item.bullet) ?
                        { bullet: item.bullet, text: item.content } :
                        splitBullet(item.content);

                    flattenedLines.push({
                        ...item,
                        content: text,
                        bullet: bullet || item.bullet,
                        dataIndex: index,
                        originalStyle: {
                            size: item.size,
                            font: item.font,
                            color: item.color,
                            is_bold: item.is_bold,
                            is_italic: item.is_italic
                        }
                    });
                });
        }

        return flattenedLines.filter(line => activeTab === 'links' ? !!line.uri : !line.uri);
    }, [activePageData, activeTab]);

    return (
        <div className="editor-page">
            {/* Studio Background Layer */}
            <div className="bg-decoration">
                <div className="floating-shape shape-1"></div>
                <div className="floating-shape shape-2"></div>
            </div>

            {/* 1. EDITING PANEL - Premium Editorial Panel (Now on the Left) */}
            <div className="editing-panel">
                <div className="panel-header" style={{ flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <h3 className="highlight">
                            Content <span style={{ color: 'var(--studio-white)', WebkitTextFillColor: 'initial' }}>Studio</span>
                        </h3>
                        <p style={{ margin: 0 }}>
                            Page {activePageIndex + 1} &middot; {textLines.length} {activeTab === 'text' ? 'Lines' : 'Links'}
                        </p>
                    </div>

                    <div className="tab-pill-selector">
                        <button
                            className={`tab-pill ${activeTab === 'text' ? 'active' : ''}`}
                            onClick={() => setActiveTab('text')}
                        >
                            <span className="tab-icon">Aa</span>
                            Text Content
                        </button>
                        <button
                            className={`tab-pill ${activeTab === 'links' ? 'active' : ''}`}
                            onClick={() => setActiveTab('links')}
                        >
                            <span className="tab-icon">🔗</span>
                            Links
                        </button>
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
                                        {line.uri ? '🔗 Link Node' : `Line ${String(textLines.length - i).padStart(2, '0')}`}
                                        {edit.isModified && <span className="modified-badge">Edited</span>}
                                    </span>
                                </div>
                                <div className="input-group-content">
                                    {activeTab === 'links' && <label className="field-label">Hypertext</label>}
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
                                        placeholder="Text to display..."
                                    />
                                </div>
                                {!!displayUri && (
                                    <div className="link-input-wrapper">
                                        <label className="field-label">Hyperlink (URL)</label>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2 className="highlight" style={{ margin: 0 }}>
                        {renderMode === 'webgl' ? 'WebGL' : 'SVG'} <span style={{ color: 'var(--studio-white)', WebkitTextFillColor: 'initial' }}>Engine</span>
                    </h2>
                    <div
                        className={`render-toggle ${renderMode}`}
                        onClick={() => setRenderMode(prev => prev === 'webgl' ? 'svg' : 'webgl')}
                        title="Switch Rendering Engine"
                    >
                        <div className="toggle-thumb"></div>
                        <span className="toggle-label-webgl">WebGL</span>
                        <span className="toggle-label-svg">SVG</span>
                    </div>

                    {/* ZOOM CONTROLS */}
                    <div className="zoom-controls">
                        <button className="zoom-btn" onClick={() => handleZoom(-0.1)} title="Zoom Out">−</button>
                        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                        <button className="zoom-btn" onClick={() => handleZoom(0.1)} title="Zoom In">+</button>
                    </div>
                </div>

                <div className="preview-stage">
                    <div className="preview-content-wrapper">
                        {renderMode === 'svg' ? (
                            <PDFRenderer
                                data={{ pages, fonts }}
                                isMini={false}
                                activePageIndex={activePageIndex}
                                nodeEdits={nodeEdits}
                            />
                        ) : backend === 'python' ? (
                            <PythonRenderer
                                page={activePageData}
                                pageIndex={activePageIndex}
                                fontsKey={fontsKey}
                                fonts={fonts}
                                nodeEdits={nodeEdits}
                                onUpdate={handlePageUpdate}
                                onSelect={scrollToNode}
                                onDoubleClick={handleDoubleClick}
                                scale={zoom}
                            />
                        ) : (
                            <WebGLRenderer
                                page={activePageData}
                                pageIndex={activePageIndex}
                                fontsKey={fontsKey}
                                onUpdate={handlePageUpdate}
                                onSelect={scrollToNode}
                                scale={zoom}
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
