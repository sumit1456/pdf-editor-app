import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import PDFRenderer from '../../components/PDFEditor/PDFRenderer';
import WebGLRenderer from '../../components/PDFEditor/WebGLRenderer';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';
import './EditorPage.css';

export default function EditorPage() {
    const location = useLocation();

    // MASTER STATE: All pages and the current active index
    // We merge fragments into lines ONCE at the start to create a persistent "Node Tree"
    const [pages, setPages] = useState(() => {
        const rawPages = location.state?.sceneGraph?.pages || [];
        return rawPages.map(page => ({
            ...page,
            items: mergeFragmentsIntoLines(page.items)
        }));
    });

    const [fontsKey] = useState(location.state?.sceneGraph?.fonts_key || '');
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isAdvanced, setIsAdvanced] = useState(true);

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

    const handleSidebarEdit = (lineId, newText) => {
        setPages(prev => {
            const next = [...prev];
            const activePage = { ...next[activePageIndex] };

            activePage.items = activePage.items.map(item => {
                if (item.id === lineId) {
                    const fontSize = Math.abs(item.size || 12);
                    const newWidth = getTextWidth(newText, item.font, fontSize);

                    // CRASH FIX: Ensure bbox exists before accessing [0]
                    const currentBbox = item.bbox || [0, 0, 0, 0];

                    return {
                        ...item,
                        content: newText,
                        bbox: [currentBbox[0], currentBbox[1], currentBbox[0] + newWidth, currentBbox[3]]
                    };
                }
                return item;
            });

            next[activePageIndex] = activePage;
            return next;
        });
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
    // Since we merged on init, items ARE the lines
    const textLines = activePageData ? activePageData.items.filter(it => it.type === 'text') : [];

    return (
        <div className="editor-page" style={{ flexDirection: 'row', alignItems: 'flex-start', padding: '20px', gap: '20px' }}>
            <div className="bg-decoration"></div>

            {/* 1. SIDEBAR NAVIGATION */}
            <div className="navigator-sidebar" style={{
                width: '180px',
                height: 'calc(100vh - 100px)',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid var(--studio-border)',
                borderRadius: '12px',
                padding: '15px',
                overflowY: 'auto',
                flexShrink: 0
            }}>
                <h3 style={{ color: '#888', marginBottom: '10px', fontSize: '0.9rem' }}>PAGES</h3>
                {pages.map((_, i) => (
                    <div
                        key={i}
                        onClick={() => setActivePageIndex(i)}
                        style={{
                            width: '100%',
                            height: '160px',
                            background: activePageIndex === i ? 'white' : '#333',
                            borderRadius: '8px',
                            marginBottom: '15px',
                            cursor: 'pointer',
                            outline: activePageIndex === i ? '4px solid var(--studio-accent)' : '1px solid #555',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 'bold',
                            color: activePageIndex === i ? 'black' : '#888',
                            fontSize: '1.5rem'
                        }}
                    >
                        {i + 1}
                    </div>
                ))}
            </div>

            {/* 1.5. EDITING PANEL */}
            <div className="editing-panel" style={{
                width: '360px',
                height: 'calc(100vh - 100px)',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--studio-border)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden', // Contain the scrollable list
                flexShrink: 0
            }}>
                {/* Sticky Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(20,20,20,0.8)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 10
                }}>
                    <h3 style={{ color: 'var(--studio-accent)', margin: 0, fontSize: '0.9rem', letterSpacing: '1px' }}>
                        EDITING PANEL
                    </h3>
                    <span style={{ fontSize: '0.7rem', color: '#666', fontWeight: 'bold' }}>
                        {textLines.length} LINES
                    </span>
                </div>

                {/* Scrollable List */}
                <div className="structure-list" style={{
                    padding: '20px',
                    overflowY: 'auto',
                    flex: 1
                }}>
                    {textLines.map((line, i) => (
                        <div
                            key={line.id || i}
                            className="structure-item-wrapper"
                            style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'flex-start' }}
                        >
                            <div className="line-number" style={{
                                fontSize: '0.65rem',
                                color: 'var(--studio-accent)',
                                width: '24px',
                                textAlign: 'right',
                                paddingTop: '10px',
                                opacity: 0.5,
                                flexShrink: 0,
                                fontFamily: 'monospace'
                            }}>
                                {String(i + 1).padStart(2, '0')}
                            </div>
                            <div
                                className="structure-item"
                                style={{
                                    flex: 1,
                                    padding: '10px 14px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    color: '#ccc',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    transition: 'all 0.2s',
                                    position: 'relative'
                                }}
                            >
                                <div style={{ fontSize: '0.6rem', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {line.font ? line.font.split(',')[0] : 'Font'} • {Math.round(Math.abs(line.size || 0))}pt
                                </div>
                                <textarea
                                    value={line.content}
                                    onChange={(e) => {
                                        handleSidebarEdit(line.id, e.target.value);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            e.target.blur();
                                        }
                                    }}
                                    rows={1}
                                    style={{
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#eee',
                                        fontSize: '0.85rem',
                                        lineHeight: '1.4',
                                        fontFamily: 'inherit',
                                        resize: 'none',
                                        outline: 'none',
                                        padding: 0,
                                        margin: 0,
                                        overflow: 'hidden'
                                    }}
                                    onInput={(e) => {
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. MAIN WORKSPACE */}
            <div className="renderer-container" style={{ flex: 1, height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>

                {/* Header / Toolbar */}
                <div className="editor-header" style={{ marginBottom: '15px', justifyContent: 'space-between' }}>
                    <h2 className="highlight" style={{ fontSize: '1.5rem', margin: 0 }}>
                        {isAdvanced ? `Page ${activePageIndex + 1} (WebGL Mode)` : 'Standard Preview'}
                    </h2>
                    <button
                        onClick={() => setIsAdvanced(!isAdvanced)}
                        className={`btn-toggle ${isAdvanced ? 'advanced' : ''}`}
                    >
                        {isAdvanced ? 'Switch to Standard' : 'Switch to WebGL'}
                    </button>
                </div>

                {/* The Single Page Renderer */}
                <div style={{ flex: 1, position: 'relative', borderRadius: '12px', overflowY: 'auto', overflowX: 'hidden', border: '1px solid var(--studio-border)', background: '#1a1a1a' }}>
                    {isAdvanced ? (
                        <WebGLRenderer
                            page={activePageData}
                            pageIndex={activePageIndex}
                            fontsKey={fontsKey}
                            onUpdate={handlePageUpdate}
                        />
                    ) : (
                        <PDFRenderer data={{ pages }} />
                    )}
                </div>
            </div>
        </div>
    );
}
