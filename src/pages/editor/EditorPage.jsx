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

                <div className="structure-list">
                    {textLines.slice().reverse().map((line, i) => (
                        <div key={line.id || i} className="premium-input-card">
                            <div className="input-card-header">
                                <span className="object-label">
                                    Object {String(textLines.length - i).padStart(2, '0')}
                                </span>
                            </div>
                            <textarea
                                value={line.content}
                                onChange={(e) => handleSidebarEdit(line.id, e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        e.target.blur();
                                    }
                                }}
                            />
                        </div>
                    ))}
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
                        <WebGLRenderer
                            page={activePageData}
                            pageIndex={activePageIndex}
                            fontsKey={fontsKey}
                            onUpdate={handlePageUpdate}
                        />
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
