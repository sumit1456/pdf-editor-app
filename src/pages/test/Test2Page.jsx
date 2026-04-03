import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import './Test2Page.css';

const Test2Page = () => {
    // Analytics Bridge: Pull active line data from Redux if available
    const activeLineFromRedux = useSelector(state => state.fontFit?.activeLine);
    console.log("[DIAG] Test2Page activeLineFromRedux:", activeLineFromRedux);

    // Initial Word Data - Fallback to demo if redux is empty
    const [words, setWords] = useState([
        { id: 0, content: 'Fast.', font: 'Arial, sans-serif', isBold: true, isItalic: false },
        { id: 1, content: 'Precise.', font: 'Arial, sans-serif', isBold: false, isItalic: true },
        { id: 2, content: 'Built for text.', font: 'Arial, sans-serif', isBold: false, isItalic: false }
    ]);

    const [targetWidth, setTargetWidth] = useState(300);
    const [results, setResults] = useState([]);
    const [summary, setSummary] = useState(null);
    const [isWorkerReady, setIsWorkerReady] = useState(false);
    
    const workerRef = useRef(null);

    // Sync from Redux on Mount or Change
    useEffect(() => {
        if (activeLineFromRedux) {
            console.log("[DIAG-BRIDGE] Loading Snapshot from Editor:", activeLineFromRedux);
            
            // Map Redux payload (flat parts) back to the word manager's editable format
            // Since word styles are flat in Redux, we strip the spaces for the editor grid
            const editableWords = activeLineFromRedux.words
                .filter(p => p.content !== ' ') // Editor edits words, worker measues parts
                .map((p, i) => ({
                    id: i,
                    content: p.content,
                    font: p.font,
                    isBold: p.weight === '700',
                    isItalic: p.is_italic
                }));
                
            setWords(editableWords);
            setTargetWidth(activeLineFromRedux.targetWidth);
        }
    }, [activeLineFromRedux]);

    useEffect(() => {
        // Initialize Worker
        const worker = new Worker('/workers/FontFitWorker.js');
        workerRef.current = worker;

        worker.onmessage = (e) => {
            const { type, data } = e.data;
            if (type === 'ready') {
                setIsWorkerReady(true);
            } else if (type === 'complete') {
                setResults(data.results);
                setSummary(data.summary);
            }
        };

        worker.postMessage({ type: 'init' });

        return () => {
            worker.terminate();
        };
    }, []);

    useEffect(() => {
        if (!isWorkerReady || !workerRef.current) return;

        // HIGH-FIDELITY PAYLOAD: Split by words AND spaces to mirror browser rendering
        const parts = [];
        words.forEach((w, idx) => {
            // The word itself
            parts.push({
                id: `p-${w.id}-w`,
                content: w.content,
                font: w.font,
                size: 16,
                weight: w.isBold ? '700' : '400',
                is_italic: w.isItalic
            });

            // Add an explicit space part if it's not the last word
            if (idx < words.length - 1) {
                parts.push({
                    id: `p-${w.id}-s`,
                    content: ' ', // Explicit space
                    font: w.font, // Usually inherits from previous span
                    size: 16,
                    weight: w.isBold ? '700' : '400',
                    is_italic: w.isItalic
                });
            }
        });

        // Perform fitting with the expanded "parts" payload
        workerRef.current.postMessage({
            type: 'fitWords',
            data: {
                words: parts,
                targetWidth: targetWidth
            },
            jobId: Date.now()
        });
    }, [words, targetWidth, isWorkerReady]);

    const addWord = () => {
        const newId = words.length > 0 ? Math.max(...words.map(w => w.id)) + 1 : 0;
        setWords([...words, { 
            id: newId, 
            content: 'NewWord', 
            font: 'Arial, sans-serif', 
            isBold: false, 
            isItalic: false 
        }]);
    };

    const updateWord = (id, field, value) => {
        setWords(words.map(w => w.id === id ? { ...w, [field]: value } : w));
    };

    const removeWord = (id) => {
        setWords(words.filter(w => w.id !== id));
    };

    const optimalFontSize = results[0]?.optimalSize || 16;
    const isOverflow = summary?.totalFittedWidth > targetWidth + 1;

    return (
        <div className="test2-container">
            <div className="analytics-card">
                <div className="dashboard-header">
                    <h2 style={{ margin: 0 }}>Font-Fit Analytics Dashboard</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ 
                            width: '8px', height: '8px', borderRadius: '50%', 
                            background: isWorkerReady ? '#10b981' : '#94a3b8',
                            boxShadow: isWorkerReady ? '0 0 10px #10b981' : 'none'
                        }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                            {isWorkerReady ? 'ENGINE ACTIVE' : 'INITIALIZING...'}
                        </span>
                    </div>
                </div>

                {/* Dashboard Stats */}
                <div className="dashboard-stats">
                    <div className="stat-item">
                        <div className="stat-value">{summary?.totalFittedWidth?.toFixed(1) || '0'}px</div>
                        <div className="stat-label">Total Width</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value">{optimalFontSize.toFixed(2)}px</div>
                        <div className="stat-label">Optimal Size</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value">{summary?.totalIterations || '0'}</div>
                        <div className="stat-label">Iterations</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value" style={{ color: isOverflow ? '#ef4444' : '#10b981' }}>
                            {isOverflow ? 'OVERFLOW' : 'FITS'}
                        </div>
                        <div className="stat-label">Status</div>
                    </div>
                </div>

                {/* Visual Preview */}
                <div className="preview-container">
                    <div className="target-ruler" style={{ width: `${targetWidth + 20}px` }}> {/* +20 for offset */}
                        <div className="ruler-label">TARGET: {targetWidth}px</div>
                    </div>
                    <div className="text-line-preview" style={{ gap: `${optimalFontSize * 0.25}px` }}>
                        {words.map((w, idx) => (
                            <span key={w.id} className="word-span" style={{
                                fontSize: `${optimalFontSize}px`,
                                fontFamily: w.font,
                                fontWeight: w.isBold ? 700 : 400,
                                fontStyle: w.isItalic ? 'italic' : 'normal',
                                color: isOverflow ? '#ff6b6b' : '#fff',
                                textShadow: isOverflow ? '0 0 10px rgba(239, 68, 68, 0.4)' : 'none'
                            }}>
                                {w.content}
                            </span>
                        ))}
                    </div>
                </div>

                {/* target width control */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="stat-label">Adjust Target Width Boundary</span>
                        <b style={{ color: '#3b82f6' }}>{targetWidth}px</b>
                    </div>
                    <input 
                        type="range" min="50" max="900" value={targetWidth} 
                        onChange={(e) => setTargetWidth(parseInt(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                </div>

                {/* Word Style Editor */}
                <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Sentence Construction</h3>
                        <button className="btn-add" onClick={addWord}>+ ADD WORD</button>
                    </div>
                    
                    <div className="word-editor-grid">
                        {words.map((word) => (
                            <div key={word.id} className="word-control-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8' }}>WORD #{word.id}</span>
                                    <button 
                                        onClick={() => removeWord(word.id)}
                                        style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px', fontWeight: 800 }}
                                    >
                                        DELETE
                                    </button>
                                </div>
                                <input 
                                    className="word-input"
                                    value={word.content}
                                    onChange={(e) => updateWord(word.id, 'content', e.target.value)}
                                    placeholder="Text..."
                                />
                                <div className="style-toggles">
                                    <button 
                                        className={`toggle-btn ${word.isBold ? 'active' : ''}`}
                                        onClick={() => updateWord(word.id, 'isBold', !word.isBold)}
                                    >B</button>
                                    <button 
                                        className={`toggle-btn ${word.isItalic ? 'active' : ''}`}
                                        onClick={() => updateWord(word.id, 'isItalic', !word.isItalic)}
                                    >I</button>
                                    <select 
                                        className="font-select"
                                        value={word.font}
                                        onChange={(e) => updateWord(word.id, 'font', e.target.value)}
                                    >
                                        <option value="Arial, sans-serif">Arial</option>
                                        <option value="'Times New Roman', serif">Serif</option>
                                        <option value="'Courier New', monospace">Mono</option>
                                        <option value="'Inter', sans-serif">Inter</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Word Inspector Grid */}
                <div className="inspector-section" style={{ marginTop: '10px' }}>
                    <h3>Measurement Inspector (Trace)</h3>
                    <div className="inspector-grid">
                        <div className="inspector-row" style={{ background: '#e2e8f0', fontWeight: 800, color: '#475569' }}>
                            <span>WORD</span>
                            <span>PIXEL WIDTH</span>
                            <span>SCALE %</span>
                            <span>ITERATIONS</span>
                        </div>
                        {results.map((res, i) => (
                            <div key={i} className="inspector-row">
                                <span style={{ fontWeight: 700 }}>{res.content}</span>
                                <span>{res.fittedWidth.toFixed(1)}px</span>
                                <span>{(res.scale * 100).toFixed(1)}%</span>
                                <span>{res.iterations}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Test2Page;
