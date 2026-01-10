import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import PDFRenderer from '../../components/PDFEditor/PDFRenderer';
import WebGLRenderer from '../../components/PDFEditor/WebGLRenderer';
import './EditorPage.css';

export default function EditorPage() {
    const location = useLocation();

    // MASTER STATE: All pages and the current active index
    const [pages, setPages] = useState(location.state?.sceneGraph?.pages || []);
    const [fontsKey] = useState(location.state?.sceneGraph?.fonts_key || '');
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isAdvanced, setIsAdvanced] = useState(true); // Default to Advanced/WebGL

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

    return (
        <div className="editor-page" style={{ flexDirection: 'row', alignItems: 'flex-start', padding: '20px', gap: '20px' }}>
            <div className="bg-decoration"></div>

            {/* 1. SIDEBAR NAVIGATION (Controlled by EditorPage) */}
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
