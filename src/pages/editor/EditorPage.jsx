import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setActiveLine } from '../../store/slices/fontFitSlice';
import { buildWorkerPayload } from '../../components/PDFEditor/workerUtils';
import PDFRenderer from '../../components/PDFEditor/PDFRenderer';
import WebGLRenderer from '../../components/PDFEditor/WebGLRenderer';
import PythonRenderer from '../../components/PDFEditor/PythonRenderer';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';
import { ReflowEngine } from '../../lib/pdf-extractor/ReflowEngine';
import { fontFitManager } from '../../utils/FontFitManager';
import { savePdfToBackend, logFontMapping } from '../../services/PdfBackendService';
import './EditorPage.css';

// Helper to decouple bullets from content (Global for use in initializers)
const mapSpansToWordStyles = (items) => {
    const wordStyles = {};
    let wordIdx = 0;
    (items || []).forEach((item, i) => {
        const content = item.content || '';
        const trimmed = content.trim();
        if (!trimmed) return;
        const words = trimmed.split(/\s+/);
        words.forEach(() => {
            wordStyles[wordIdx] = {
                font: item.font,
                size: item.size,
                color: item.color,
                is_bold: item.is_bold,
                is_italic: item.is_italic,
                googleFont: item.google_font,
                font_variant: item.font_variant || 'normal'
            };
            wordIdx++;
        });
    });
    return wordStyles;
};



const FONT_OPTIONS = [
    { label: 'Serif (Latex)', value: 'Source Serif 4' },
    { label: 'Inter (Sans)', value: 'Inter' },
    { label: 'Roboto', value: 'Roboto' },
    { label: 'Open Sans', value: 'Open Sans' },
    { label: 'Montserrat', value: 'Montserrat' },
    { label: 'Lora', value: 'Lora' },
    { label: 'Merriweather', value: 'Merriweather' },
    { label: 'Libre Basker', value: 'Libre Baskerville' },
    { label: 'Playfair', value: 'Playfair Display' },
    { label: 'Oswald', value: 'Oswald' },
    { label: 'Roboto Mono', value: 'Roboto Mono' },
    { label: 'JetBrains', value: 'JetBrains Mono' },
    { label: 'Fira Code', value: 'Fira Code' },
    { label: 'Crimson Pro (Book)', value: 'Crimson Pro' },
    { label: 'Poppins (Geometric)', value: 'Poppins' },
    { label: 'Ubuntu', value: 'Ubuntu' },
    { label: 'Dancing Script', value: 'Dancing Script' },
    { label: 'Orbitron (Techno)', value: 'Orbitron' },
    { label: 'PT Serif', value: 'PT Serif' },
    { label: 'PT Sans', value: 'PT Sans' }
];

const rgbToHex = (color) => {
    if (!color || color.length < 3) return '#000000';
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
    ] : [0, 0, 0];
};

const MemoizedSidebarCard = React.memo(({ line, edit, isActive, isSelected, displayContent, onFocus, onChangeText, onChangeLink, onClick, i, isLineMultiSelect }) => {
    const [localText, setLocalText] = React.useState(displayContent);
    const [localLink, setLocalLink] = React.useState(edit.uri !== undefined ? edit.uri : line.uri);

    // Sync to upstream changes
    React.useEffect(() => {
        setLocalText(displayContent);
    }, [displayContent]);

    React.useEffect(() => {
        if (edit.uri !== undefined || line.uri !== undefined) {
            setLocalLink(edit.uri !== undefined ? edit.uri : line.uri);
        }
    }, [edit.uri, line.uri]);

    const handleTextChange = (e) => {
        const val = e.target.value;
        const selStart = e.target.selectionStart;
        setLocalText(val);
        // [FitV3 Stabilization] Debounce removed for instant feedback
        onChangeText(val, selStart);
    };

    const handleLinkChange = (e) => {
        const val = e.target.value;
        setLocalLink(val);
        // [FitV3 Stabilization] Debounce removed for instant feedback
        onChangeLink(val);
    };

    return (
        <div
            id={`input-card-${line.id || line.dataIndex}`}
            className={`premium-input-card ${edit.isModified ? 'modified' : ''} ${isActive || isSelected ? 'active' : ''}`}
            onClick={onClick}
        >
            <div className="card-controls-row">
                <div className="style-tools">
                    <span className="node-id-label">Node {line.id?.substring(0, 4) || i}</span>
                </div>
                <div className="status-badge">
                    {edit.isModified ? 'Edited' : 'Original'}
                </div>
            </div>

            <div className="card-input-area">
                <label className="field-label">{line.uri ? 'Hypertext' : 'Content'}</label>
                <textarea
                    value={localText}
                    onFocus={onFocus}
                    onChange={handleTextChange}
                    placeholder="Enter text..."
                />
                {line.uri && (
                    <div style={{ marginTop: '8px' }}>
                        <label className="field-label">Target URL</label>
                        <input
                            type="text"
                            className="link-field"
                            value={localLink || ''}
                            onChange={handleLinkChange}
                            placeholder="https://..."
                        />
                    </div>
                )}
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.isActive === next.isActive &&
        prev.isSelected === next.isSelected &&
        prev.displayContent === next.displayContent &&
        prev.isLineMultiSelect === next.isLineMultiSelect &&
        prev.edit === next.edit;
});

export default function EditorPage() {
    const location = useLocation();


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
    const [pdfName] = useState(location.state?.pdfName || 'document.pdf');
    const [originalPdfBase64] = useState(location.state?.originalPdfBase64 || '');
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isAdvanced, setIsAdvanced] = useState(true);
    const reflowEngine = useMemo(() => new ReflowEngine(fonts), [fonts]);

    // NODE-BASED EDITING STATE: Persistent edits keyed by unique item ID
    const [nodeEdits, setNodeEdits] = useState({});
    const [activeTab, setActiveTab] = useState('text'); // 'text' or 'links'
    const [zoom, setZoom] = useState(window.innerWidth < 768 ? 0.45 : 0.9); // Master zoom state
    const [activeNodeId, setActiveNodeId] = useState(null); // Track currently focused node
    const [smartStyling, setSmartStyling] = useState(true);
    const [selectedWordIndices, setSelectedWordIndices] = useState([]);
    const [isMultiSelect, setIsMultiSelect] = useState(false);
    // [FitV3] Automatic high-fidelity fitting is now default, isFitMode state removed.
    const [showAllBboxes, setShowAllBboxes] = useState(false);
    const [useOriginalFonts, setUseOriginalFonts] = useState(false);
    const [isReflowEnabled, setIsReflowEnabled] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isCalibrated, setIsCalibrated] = useState(false); // Tracks if fonts are calibrated
    // const [metricRatio, setMetricRatio] = useState(1.333333); // Default PT to PX ratio

    const [selectedNodeIds, setSelectedNodeIds] = useState([]);
    const [isLineMultiSelect, setIsLineMultiSelect] = useState(false);
    const [mobileActivePanel, setMobileActivePanel] = useState(null); // 'edit', 'pages', 'words' or null
    const [isDragEnabled, setIsDragEnabled] = useState(false); // Default dragging OFF as requested
    const [isFittingConfirmed, setIsFittingConfirmed] = useState(false); // [FitV4] Manual confirmation state

    // Reset fitting confirmation on page change
    React.useEffect(() => {
        setIsFittingConfirmed(false);
    }, [activePageIndex]);
    const [pageOffset, setPageOffset] = useState(0);
    const VISIBLE_PAGE_COUNT = 3;

    const [activeScale, setActiveScale] = useState(1.0);
    const [layoutMode, setLayoutMode] = useState('default'); // 'default', 'studio', 'preview'

    const reduxDispatch = useDispatch();

    const activePageData = pages[activePageIndex];

    // Semantic Text items for Side Panels (Blocks for Python, Lines for Java)
    const textLines = useMemo(() => {
        if (!activePageData) return [];

        const flattenedLines = [];

        if (activePageData.blocks) {
            // Flatten all lines from all blocks for granular editing
            activePageData.blocks.forEach(block => {
                if (isReflowEnabled && block.type === 'paragraph' && block.lines.length > 0) {
                    // Unified Block TextArea for Reflow Engine
                    const fullContent = block.lines.map(l => {
                        return nodeEdits[l.id]?.isModified ? nodeEdits[l.id].content : l.content;
                    }).join(' ').replace(/\s{2,}/g, ' ');

                    const firstLine = block.lines[0];
                    const contentItem = firstLine.items[0] || {};

                    flattenedLines.push({
                        id: `block-reflow-${block.id}`,
                        content: fullContent,
                        type: 'text',
                        dataIndex: block.id,
                        isBlock: true,
                        level: block.level || 0,
                        blockId: block.id,
                        originalStyle: {
                            size: contentItem.size || firstLine.size,
                            font: contentItem.font,
                            color: contentItem.color,
                            is_bold: contentItem.is_bold,
                            is_italic: contentItem.is_italic
                        }
                    });
                } else {
                    block.lines.forEach(line => {
                        // Style Safety: Use the first item for the default text style
                        const contentItem = line.items[0] || {};

                        flattenedLines.push({
                            id: line.id,
                            content: nodeEdits[line.id]?.isModified ? nodeEdits[line.id].content : line.content,
                            type: 'text',
                            dataIndex: line.id,
                            isBlock: false,
                            level: block.level || 0,
                            blockId: block.id,
                            uri: line.uri,
                            originalStyle: {
                                size: contentItem.size || line.size,
                                font: contentItem.font,
                                color: contentItem.color,
                                is_bold: contentItem.is_bold, // No longer line scanning
                                is_italic: contentItem.is_italic
                            }
                        });
                    });
                }
            });
        } else {
            // Legacy Path (Java)
            (activePageData.items || [])
                .filter(it => it.type === 'text')
                .forEach((item, index) => {
                    flattenedLines.push({
                        ...item,
                        content: item.content,
                        dataIndex: index,
                        originalStyle: {
                            size: item.size,
                            font: item.font,
                            color: item.color,
                            is_bold: item.is_bold,
                            is_italic: item.is_italic,
                            font_variant: item.font_variant || 'normal'
                        }
                    });
                });
        }

        return flattenedLines
            .filter(line => activeTab === 'links' ? !!line.uri : !line.uri)
            .reverse();
    }, [activePageData, activeTab]);

    const scrollToNode = React.useCallback((idOrIndex) => {
        setActiveNodeId(idOrIndex);
        if (!isLineMultiSelect) setSelectedNodeIds([idOrIndex]);
        else if (!selectedNodeIds.includes(idOrIndex)) setSelectedNodeIds(prev => [...prev, idOrIndex]);

        // Ensure wordStyles are initialized on navigation
        if (!nodeEdits[idOrIndex]?.wordStyles) {
            const line = textLines.find(l => l.id === idOrIndex);
            // Search in fragments too if line mapping is missing items
            let items = line?.items;
            if (!items) {
                const p = pages[activePageIndex];
                const rawLine = (p.blocks ? p.blocks.flatMap(b => b.lines) : (p.items || [])).find(l => l.id === idOrIndex);
                items = rawLine?.items;
            }

            if (items) {
                const initialWordStyles = mapSpansToWordStyles(items);
                setNodeEdits(prev => ({
                    ...prev,
                    [idOrIndex]: {
                        ...(prev[idOrIndex] || {}),
                        wordStyles: initialWordStyles,
                        isModified: false
                    }
                }));
            }
        }


        const element = document.getElementById(`input-card-${idOrIndex}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-flash');
            setTimeout(() => {
                element.classList.remove('highlight-flash');
            }, 2000);
        }
    }, [isLineMultiSelect, nodeEdits, textLines, pages, activePageIndex]);

    const handleZoom = React.useCallback((delta) => {
        setZoom(prev => Math.min(2.0, Math.max(0.3, parseFloat((prev + delta).toFixed(2)))));
    }, []);

    const handlePageUpdate = React.useCallback((newItems) => {
        setPages(prev => {
            const next = [...prev];
            const p = { ...next[activePageIndex] };
            p.items = newItems;
            next[activePageIndex] = p;
            return next;
        });
    }, [activePageIndex]);

    const getActiveNodeStyle = () => {
        if (!activeNodeId) return null;
        const edit = nodeEdits[activeNodeId];

        // TARGETING FIX: Always target the LAST word by default for the toolbar status
        const content = edit?.content || "";
        const words = content.split(/\s+/).filter(Boolean);
        const lastWordIdx = words.length > 0 ? words.length - 1 : 0;

        if (selectedWordIndices.length > 0) {
            // Check if ALL words are selected
            const contentStr = edit?.content || "";
            const totalWords = contentStr.split(/\s+/).filter(Boolean).length;

            // If more than 1 word or ALL words selected, prefer the line's safetyStyle (base style)
            // This ensures common font size is shown when a line is selected
            if (selectedWordIndices.length === totalWords && totalWords > 1) {
                if (edit?.safetyStyle) return edit.safetyStyle;
            }

            const lastIdx = selectedWordIndices[selectedWordIndices.length - 1];
            if (edit?.wordStyles?.[lastIdx]) {
                const style = { ...(edit.safetyStyle || {}), ...edit.wordStyles[lastIdx] };
                // Ensure size is a number
                if (style.size) style.size = parseFloat(style.size);
                return style;
            }
        } else if (edit?.wordStyles?.[lastWordIdx]) {
            // If no selection, show the status of the last word in the line
            const style = { ...(edit.safetyStyle || {}), ...edit.wordStyles[lastWordIdx] };
            if (style.size) style.size = parseFloat(style.size);
            return style;
        }

        if (edit?.safetyStyle) {
            const style = { ...edit.safetyStyle };
            if (style.size) style.size = parseFloat(style.size);
            return style;
        }

        // --- STYLE INHERITANCE FIX ---
        for (const page of pages) {
            const flattened = (page.blocks ? page.blocks.flatMap(b => b.lines) : (page.items || []));
            const found = flattened.find(l => l.id === activeNodeId);

            if (found) {
                // Return style of the LAST item (span) as per user targeting preference
                const base = (found.items && found.items.length > 0) ? found.items[found.items.length - 1] : found;
                return {
                    size: parseFloat(base.size),
                    font: base.font,
                    color: base.color,
                    is_bold: base.is_bold,
                    is_italic: base.is_italic,
                    font_variant: base.font_variant || 'normal'
                };
            }

            // If it's a reflow block ID, find the block and use its first line's style
            if (activeNodeId.startsWith('block-reflow-')) {
                const blockId = activeNodeId.replace('block-reflow-', '');
                const block = page.blocks?.find(b => b.id === blockId);
                if (block && block.lines.length > 0) {
                    const firstLine = block.lines[0];
                    const base = (firstLine.items && firstLine.items.length > 0) ? firstLine.items[0] : firstLine;
                    return {
                        size: parseFloat(base.size),
                        font: base.font,
                        color: base.color,
                        is_bold: base.is_bold,
                        is_italic: base.is_italic,
                        font_variant: base.font_variant || 'normal'
                    };
                }
            }
        }
        return null;
    };

    const activeNodeData = React.useMemo(() => {
        if (!activeNodeId) return null;
        const page = pages[activePageIndex];
        if (!page) return null;

        return (page.items || []).find(it => it.id === activeNodeId) ||
            (page.blocks || []).flatMap(b => b.lines).find(l => l.id === activeNodeId) ||
            null;
    }, [pages, activePageIndex, activeNodeId]);

    const activeNodeProps = React.useMemo(() => {
        if (!activeNodeId || !activeNodeData) return null;

        const edit = nodeEdits[activeNodeId] || {};
        const isModified = !!edit.isModified;
        const style = getActiveNodeStyle();
        const content = edit.content !== undefined ? edit.content : activeNodeData.content;

        // Calculate BBox
        let bbox = edit.bbox || activeNodeData.bbox;
        if (!bbox && activeNodeData.origin) {
            const w = activeNodeData.width || 50;
            const h = activeNodeData.size || 12;
            bbox = [activeNodeData.origin[0], activeNodeData.origin[1] - h, activeNodeData.origin[0] + w, activeNodeData.origin[1]];
        }

        return {
            font: style?.font || 'Default',
            size: style?.size || activeNodeData.size || 0,
            color: style?.color || activeNodeData.color || [0, 0, 0],
            x: bbox ? bbox[0] : (activeNodeData.origin ? activeNodeData.origin[0] : 0),
            y: bbox ? bbox[1] : (activeNodeData.origin ? activeNodeData.origin[1] : 0)
        };
    }, [activeNodeId, activeNodeData, nodeEdits, selectedWordIndices]);



    // [DIAG-BRIDGE] Sync Active Line to Global Redux for Analytics (/test2)
    React.useEffect(() => {
        if (!activeNodeId) return;

        // Find the line data for the current active node
        let lineData = null;
        for (const page of pages) {
            const flattened = (page.blocks ? page.blocks.flatMap(b => b.lines) : (page.items || []));
            lineData = flattened.find(l => l.id === activeNodeId);
            if (lineData) break;
        }

        if (lineData) {
            const payload = buildWorkerPayload(lineData, nodeEdits[activeNodeId] || {}, useOriginalFonts);
            if (payload) {
                console.log("[DIAG-BRIDGE] Dispatching Snapshot to Redux for Analytics (useOriginalFonts=" + useOriginalFonts + "):", payload);
                reduxDispatch(setActiveLine(payload));
            }
        }
    }, [activeNodeId, nodeEdits, pages, reduxDispatch, useOriginalFonts]);



    /* --- MASTER HUD: Log Node Tree on change ---
    React.useEffect(() => {
        if (!activeNodeId) return;
        const edit = nodeEdits[activeNodeId];
        if (!edit) return;

        const content = edit.content || "";
        const wordStyles = edit.wordStyles || {};
        const sStyle = edit.safetyStyle || {};
        const finalWordsList = content.split(/\s+/).filter(Boolean);

        if (finalWordsList.length > 0) {
            // console.group(`[CURRENT NODE TREE] Node: ${activeNodeId}`);
            // console.log(`Text: "${content}"`);
            // console.table(finalWordsList.map((word, idx) => {
            //     const wStyle = wordStyles[idx];
            //     const resolved = { ...sStyle, ...wStyle };
            //     return {
            //         index: idx,
            //         word: word,
            //         status: wStyle ? 'EXPLICIT (Override)' : 'INHERITED (Baseline)',
            //         font: resolved.font || 'Default',
            //         size: resolved.size,
            //         bold: resolved.is_bold ? 'Yes' : 'No'
            //     };
            // }));
            // console.groupEnd();
        }
    }, [activeNodeId, nodeEdits]); */





    // AUTO-SELECT FIRST NODE ON LOAD
    // This ensures the sidebar is "active" immediately for a better first impression
    React.useEffect(() => {
        if (pages.length > 0 && isInitialLoad && !activeNodeId) {
            const firstPage = pages[0];
            const firstLine = (firstPage.blocks || [])[0]?.lines[0] ||
                (firstPage.items || []).find(it => it.type === 'text');

            if (firstLine) {
                // Determine if it's a list or text to set the right tab
                const isLink = firstLine.type === 'link' || !!firstLine.uri;
                setActiveTab(isLink ? 'links' : 'text');
                setActiveNodeId(firstLine.id);
                // Auto-select first word as requested
                if (firstLine.content && firstLine.content.trim().length > 0) {
                    const words = firstLine.content.split(/\s+/).filter(Boolean);
                    setSelectedWordIndices(words.map((_, i) => i));
                    setIsMultiSelect(true);
                }
                setIsInitialLoad(false);
            }
        }
    }, [pages, isInitialLoad, activeNodeId]);

    const handleDownload = React.useCallback(async () => {
        // Gather all original lines across all pages with their indices
        const allOriginalLines = pages.flatMap((p, pIdx) =>
            (p.blocks || []).flatMap(b =>
                b.lines.map(l => ({ ...l, pageIndex: pIdx }))
            )
        );

        const modifiedNodes = Object.keys(nodeEdits)
            .filter(id => nodeEdits[id].isModified)
            .map(id => {
                const edit = nodeEdits[id];
                const original = allOriginalLines.find(l => l.id === id);

                const newText = (edit.content !== undefined && edit.content !== null) ? edit.content : (original?.content || '');
                const originalSpans = original?.items || original?.spans || [];

                let processedSpans = null;
                if (smartStyling || (edit.wordStyles && Object.keys(edit.wordStyles).length > 0)) {
                    // --- SMART RE-SPANNING / WORD-LEVEL STYLING ---
                    const words = newText.split(/(\s+)/); // Keep spaces
                    const baseStyle = edit.safetyStyle || original?.originalStyle || (original?.items?.[0] || {});
                    const wordStyles = edit.wordStyles || {};

                    // Strategy: Map words to styles.
                    // Note: 'words' includes spaces. wordStyles indices typically refer to non-space words.
                    let wordCounter = 0;
                    processedSpans = words.map((chunk) => {
                        const isSpace = /^\s+$/.test(chunk);
                        const style = (!isSpace && wordStyles[wordCounter]) ? wordStyles[wordCounter] : {};
                        if (!isSpace) wordCounter++;

                        return {
                            text: chunk,
                            font: style.font || baseStyle.font,
                            size: style.size || baseStyle.size,
                            color: style.color || baseStyle.color,
                            is_bold: style.is_bold !== undefined ? style.is_bold : (baseStyle.is_bold || false),
                            is_italic: style.is_italic !== undefined ? style.is_italic : (baseStyle.is_italic || false),
                            font_variant: style.font_variant || baseStyle.font_variant || "normal"
                        };
                    });
                }

                const getGoogleFontName = (fontName) => {
                    const name = (fontName || '').toLowerCase();
                    if (name.includes('inter')) return 'Inter';
                    if (name.includes('roboto mono')) return 'Roboto Mono';
                    if (name.includes('roboto')) return 'Roboto';
                    if (name.includes('open sans')) return 'Open Sans';
                    if (name.includes('montserrat')) return 'Montserrat';
                    if (name.includes('lora')) return 'Lora';
                    if (name.includes('merriweather')) return 'Merriweather';
                    if (name.includes('libre baskerville')) return 'Libre Baskerville';
                    if (name.includes('playfair display')) return 'Playfair Display';
                    if (name.includes('oswald')) return 'Oswald';
                    if (name.includes('jetbrains mono')) return 'JetBrains Mono';
                    if (name.includes('fira code')) return 'Fira Code';
                    if (name.includes('source serif') || name.includes('source_serif')) return 'Source Serif 4';
                    if (name.includes('poppins')) return 'Poppins';
                    if (name.includes('crimson pro')) return 'Crimson Pro';
                    if (name.includes('dancing script')) return 'Dancing Script';
                    if (name.includes('orbitron')) return 'Orbitron';
                    if (name.includes('pt serif')) return 'PT Serif';
                    if (name.includes('pt sans')) return 'PT Sans';
                    if (name.includes('ubuntu')) return 'Ubuntu';

                    if (name.includes('cm') || name.includes('sfrm') || name.includes('times')) return 'Source Serif 4';
                    return 'Inter'; // Default
                };

                return {
                    id: id,
                    pageIndex: original?.pageIndex ?? 0,
                    text: newText,
                    originalText: original?.content,
                    bbox: edit.bbox || original?.bbox,
                    origin: edit.origin || original?.origin,
                    original_origin: original?.origin,
                    style: {
                        ...edit.safetyStyle,
                        font: edit.safetyStyle?.font || original?.originalStyle?.font || original?.font || '',
                        googleFont: getGoogleFontName(edit.safetyStyle?.font || original?.originalStyle?.font || original?.font || ''),
                        size: edit.safetyStyle?.size || original?.originalStyle?.size || original?.size || 10,
                        color: edit.safetyStyle?.color || original?.originalStyle?.color || original?.color || [0, 0, 0],
                        font_variant: edit.safetyStyle?.font_variant || original?.font_variant || 'normal'
                    },
                    uri: edit.uri || original?.uri,
                    spans: processedSpans
                };
            });

        if (modifiedNodes.length === 0) {
            window.showMessage("No changes", "There are no modifications to export. Try editing some text first!", "info");
            return;
        }

        const payload = {
            pdf_name: pdfName,
            pdf_base64: originalPdfBase64,
            modifications: modifiedNodes
        };

        window.showLoading(true, "Generating High-Fidelity PDF...");
        try {
            const result = await savePdfToBackend(payload);
            if (result.success && result.pdf_base64) {
                // Convert Base64 back to Blob and Download
                const byteCharacters = atob(result.pdf_base64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });

                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.download = result.filename || "edited_document.pdf";
                link.click();

                window.showLoading(false);
                window.showMessage("Success", "Your PDF has been successfully generated and downloaded.", "success");
            } else {
                window.showLoading(false);
                window.showMessage("Export Failed", "Failed to generate PDF: " + (result.error || "Unknown error"), "error");
            }
        } catch (err) {
            window.showLoading(false);
            window.showMessage("Error", "Error during PDF export: " + err.message, "error");
        }
    }, [pages, nodeEdits, pdfName, originalPdfBase64, smartStyling]);


    // Handle updates from Renderers (e.g. Text Edit)



    const handleSidebarEdit = React.useCallback((lineId, newText, originalStyle, cursorIndex = null) => {
        if (!lineId) {
            return;
        }

        setNodeEdits(prev => {
            const current = prev[lineId] || {};
            const sStyle = current.safetyStyle || originalStyle || {};

            // --- EXPERIMENTAL REFLOW ENGINE (Unified Block) ---
            if (isReflowEnabled && lineId.startsWith('block-reflow-')) {
                const realBlockId = lineId.replace('block-reflow-', '');
                const page = pages[activePageIndex];
                if (page && page.blocks) {
                    const blockIndex = page.blocks.findIndex(b => b.id === realBlockId);
                    if (blockIndex !== -1) {
                        const block = page.blocks[blockIndex];
                        const sStyle = originalStyle || {}; // base paragraph style

                        // The user edits the full paragraph directly now
                        const fullText = newText.replace(/\s{2,}/g, ' ');
                        const newLines = reflowEngine.reflowBlock({ ...block, style: sStyle }, fullText);

                        // Sync structurally
                        setPages(prevPages => {
                            const nextPages = [...prevPages];
                            const p = { ...nextPages[activePageIndex] };
                            const newBlocks = [...(p.blocks || [])];
                            newBlocks[blockIndex] = { ...block, lines: newLines };
                            p.blocks = newBlocks;
                            nextPages[activePageIndex] = p;
                            return nextPages;
                        });

                        const nextEdits = { ...prev };
                        newLines.forEach(nl => {
                            // Retain existing line specific styles if possible
                            const prevStyle = prev[nl.id]?.safetyStyle || sStyle;
                            nextEdits[nl.id] = {
                                ...(prev[nl.id] || {}),
                                content: nl.content,
                                bbox: nl.bbox,
                                origin: [nl.bbox[0], nl.y],
                                safetyStyle: prevStyle,
                                isModified: true
                            };
                        });

                        // Keep memory of the unified block edit directly so UI is fast
                        nextEdits[lineId] = { isModified: true, content: newText, safetyStyle: sStyle };

                        return nextEdits;
                    }
                }
            }

            const oldText = current.content || "";
            const wordStyles = { ...(current.wordStyles || {}) };

            // --- SMART STYLE INHERITANCE (Node Tree Logic) ---
            if (cursorIndex !== null && oldText !== newText) {
                const getWordCount = (str) => str.split(/\s+/).filter(w => w.length > 0).length;

                const oldWordCount = getWordCount(oldText);
                const newWordCount = getWordCount(newText);
                const diff = newWordCount - oldWordCount;

                if (diff !== 0) {
                    const textBeforeCursor = newText.substring(0, cursorIndex);
                    const currentWordIdx = getWordCount(textBeforeCursor);
                    const newWordStylesMap = {};
                    const styleSource = wordStyles[currentWordIdx] || wordStyles[currentWordIdx - 1] || Object.values(wordStyles).pop() || sStyle;

                    if (diff > 0) {
                        Object.entries(wordStyles).forEach(([idx, sty]) => {
                            const i = parseInt(idx);
                            if (i >= currentWordIdx) newWordStylesMap[i + diff] = sty;
                            else newWordStylesMap[i] = sty;
                        });
                        for (let k = 0; k < diff; k++) {
                            newWordStylesMap[currentWordIdx + k] = { ...styleSource };
                        }
                    } else {
                        Object.entries(wordStyles).forEach(([idx, sty]) => {
                            const i = parseInt(idx);
                            if (i < currentWordIdx) {
                                newWordStylesMap[i] = sty;
                            } else if (i >= currentWordIdx + Math.abs(diff)) {
                                newWordStylesMap[i + diff] = sty;
                            }
                        });
                    }
                    Object.keys(wordStyles).forEach(k => delete wordStyles[k]);
                    Object.assign(wordStyles, newWordStylesMap);
                } else if (Object.keys(wordStyles).length === 0 && Object.keys(sStyle).length > 0) {
                    wordStyles[0] = { ...sStyle };
                }
            }

            // Resolve bbox from cached state or original node — NEVER mutate width/height
            let newBBox = current.bbox ? [...current.bbox] : null;
            if (!newBBox) {
                for (const p of pages) {
                    const found = (p.blocks ? p.blocks.flatMap(b => b.lines) : p.items || []).find(l => l.id === lineId);
                    if (found && found.bbox) {
                        newBBox = [...found.bbox];
                        break;
                    }
                }
            }

            // Sync content to base pages state (no bbox change)
            setPages(prevPages => {
                const nextPages = [...prevPages];
                const page = nextPages[activePageIndex];
                if (page) {
                    const block = page.blocks?.find(b => b.lines.some(l => l.id === lineId));
                    const item = block ? block.lines.find(l => l.id === lineId) : (page.items || []).find(l => l.id === lineId);
                    if (item) {
                        item.content = newText;
                    }
                }
                return nextPages;
            });

            return {
                ...prev,
                [lineId]: {
                    ...current,
                    content: newText,
                    bbox: newBBox,
                    wordStyles: wordStyles,
                    safetyStyle: sStyle,
                    isModified: true
                }
            };
        });
    }, [isReflowEnabled, pages, activePageIndex]);


    const handleStyleUpdate = React.useCallback((lineId, field, value, wordIndices = null) => {
        const targetIds = (isLineMultiSelect && selectedNodeIds.length > 0) ? selectedNodeIds : [lineId];

        setNodeEdits(prev => {
            const next = { ...prev };
            targetIds.forEach(id => {
                const current = next[id] || {};
                const sStyle = { ...(current.safetyStyle || {}) };
                const wordStyles = { ...(current.wordStyles || {}) };

                if (wordIndices !== null) {
                    const indices = Array.isArray(wordIndices) ? wordIndices : [wordIndices];
                    indices.forEach(idx => {
                        if (idx === null || idx === undefined) return;
                        if (!wordStyles[idx]) wordStyles[idx] = {};
                        wordStyles[idx] = { ...wordStyles[idx], [field]: value };
                    });

                    if (isLineMultiSelect) {
                        sStyle[field] = value;
                        if (field === 'font') sStyle.googleFont = value;
                    }
                } else if (isLineMultiSelect) {
                    const contentStr = current.content || "";
                    const wordsList = contentStr.split(/\s+/).filter(Boolean);
                    wordsList.forEach((_, k) => {
                        if (!wordStyles[k]) wordStyles[k] = {};
                        wordStyles[k] = { ...wordStyles[k], [field]: value };
                    });
                    sStyle[field] = value;
                    if (field === 'font') sStyle.googleFont = value;
                } else {
                    const content = current.content || "";
                    const wordsCount = content.split(/\s+/).filter(Boolean).length;
                    const lastIdx = wordsCount > 0 ? wordsCount - 1 : 0;

                    if (!wordStyles[lastIdx]) wordStyles[lastIdx] = {};
                    wordStyles[lastIdx] = { ...wordStyles[lastIdx], [field]: value };

                    sStyle[field] = value;
                    if (field === 'font') sStyle.googleFont = value;
                }


                let newBBox = current.bbox || null;
                if (!newBBox) {
                    const found = (pages[activePageIndex].blocks ? pages[activePageIndex].blocks.flatMap(b => b.lines) : (pages[activePageIndex].items || [])).find(l => l.id === id);
                    if (found && found.bbox) newBBox = [...found.bbox];
                }

                next[id] = {
                    ...current,
                    safetyStyle: sStyle,
                    wordStyles: wordStyles,
                    bbox: newBBox,
                    isModified: true
                };
            });
            return next;
        });
    }, [isLineMultiSelect, selectedNodeIds, pages, activePageIndex]);

    const handleBatchStyleUpdate = React.useCallback((updates) => {
        if (!updates || updates.length === 0) return;
        console.log(`[BatchUpdate] Applying ${updates.length} direct font size fits.`);

        setNodeEdits(prev => {
            const next = { ...prev };
            updates.forEach(({ lineId, results, scale }) => {
                const current = next[lineId] || {};
                const sStyle = { ...(current.safetyStyle || {}) };
                const wordStyles = { ...(current.wordStyles || {}) };

                // [FitV4 Pivot] Bake the fit directly into the font size of each segment
                // This ensures bullets and text maintain their relative proportions.
                if (results && results.length > 0) {
                    // Update safety/base size
                    sStyle.size = results[0].optimalSize;

                    // Update individual words
                    results.forEach((res, i) => {
                        if (!wordStyles[i]) wordStyles[i] = { ...sStyle };
                        wordStyles[i].size = res.optimalSize;
                    });
                }

                let newBBox = current.bbox || null;
                if (!newBBox) {
                    const page = pages[activePageIndex];
                    const found = (page && page.blocks ? page.blocks.flatMap(b => b.lines) : (page?.items || [])).find(l => l.id === lineId);
                    if (found && found.bbox) newBBox = [...found.bbox];
                }

                next[lineId] = {
                    ...current,
                    safetyStyle: sStyle,
                    wordStyles: wordStyles,
                    // scale: 1.0, // Scale is now baked into size
                    bbox: newBBox,
                    isModified: true,
                    isFitted: true
                };
            });
            return next;
        });
    }, [pages, activePageIndex]);



    const handleNodeMove = React.useCallback((id, newX, newY) => {
        setNodeEdits(prev => {
            const current = prev[id] || {};
            let newBBox = current.bbox ? [...current.bbox] : null;
            let newOrigin = current.origin ? [...current.origin] : null;
            let safetyStyle = current.safetyStyle || null;
            let wordStyles = current.wordStyles || null;

            if (!newBBox || !newOrigin || !safetyStyle) {
                for (const p of pages) {
                    const found = (p.blocks ? p.blocks.flatMap(b => b.lines) : (p.items || [])).find(l => l.id === id);
                    if (found) {
                        if (!newBBox && found.bbox) newBBox = [...found.bbox];
                        if (!newOrigin && found.origin) newOrigin = [...found.origin];
                        if (!newOrigin && newBBox) newOrigin = [newBBox[0], newBBox[1]];

                        if (!safetyStyle) {
                            const contentItem = (found.is_bullet_start && found.items?.length > 1) ? found.items[1] : (found.items?.[0] || found);
                            safetyStyle = {
                                size: contentItem.size || found.size || 10,
                                font: contentItem.font || found.font,
                                googleFont: found.google_font,
                                color: contentItem.color || found.color,
                                is_bold: contentItem.is_bold || false,
                                is_italic: contentItem.is_italic || false,
                                font_variant: contentItem.font_variant || 'normal'
                            };
                        }
                        if (!wordStyles) {
                            wordStyles = mapSpansToWordStyles(found.items);
                        }
                        break;
                    }
                }
            }

            if (newBBox && newOrigin) {
                const dx = newX - newOrigin[0];
                const dy = newY - newOrigin[1];
                const originalWidth = newBBox[2] - newBBox[0];
                const originalHeight = newBBox[3] - newBBox[1];
                const newX0 = newBBox[0] + dx;
                const newY0 = newBBox[1] + dy;
                newBBox = [newX0, newY0, newX0 + originalWidth, newY0 + originalHeight];
                newOrigin = [newX, newY];
            }

            return {
                ...prev,
                [id]: {
                    ...current,
                    bbox: newBBox,
                    origin: newOrigin,
                    safetyStyle: safetyStyle,
                    wordStyles: wordStyles,
                    isModified: true
                }
            };
        });
    }, [pages]);

    const handleLinkEdit = React.useCallback((lineId, newUri, originalStyle) => {
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
    }, []);

    if (pages.length === 0) {
        return (
            <div className="editor-page">
                <div className="placeholder" style={{ marginTop: '100px', color: 'var(--studio-text-dim)' }}>
                    No PDF data found. Upload a file first.
                </div>
            </div>
        );
    }


    // Semantic Text items for Side Panels (Blocks for Python, Lines for Java)


    const handleDoubleClick = React.useCallback((pIdx, lineId, item, rect, extraData) => {
        let targetLineId = lineId;

        // MAPPING FIX: If Reflow is enabled, select the unified block instead of the isolated line
        if (isReflowEnabled && pages[pIdx]?.blocks) {
            const block = pages[pIdx].blocks.find(b => b.lines.some(l => l.id === lineId));
            if (block && block.type === 'paragraph') targetLineId = `block-reflow-${block.id}`;
        }

        // --- AUTO-TAB SWITCHING ---
        // If the clicked line isn't in the current tab, flip tabs
        const nodeInCurrentTab = textLines.find(l => l.id === targetLineId);
        if (!nodeInCurrentTab) {
            setActiveTab(prev => prev === 'text' ? 'links' : 'text');
        }

        // --- STYLE SAFETY MECHANIC ---
        // Capture and store original styles if not already set or not yet modified
        setNodeEdits(prev => {
            const currentEdit = prev[targetLineId] || {};
            // If already modified, we don't want to revert the user's manual style choices
            if (currentEdit.isModified) return prev;

            const page = pages[pIdx];
            const line = (page.blocks ? page.blocks.flatMap(b => b.lines) : (page.items || [])).find(l => l.id === lineId);
            const initialWordStyles = mapSpansToWordStyles(line?.items);

            return {
                ...prev,
                [targetLineId]: {
                    ...currentEdit,
                    wordStyles: initialWordStyles,
                    safetyStyle: extraData?.safetyStyle || {
                        size: item.size,
                        font: item.font,
                        googleFont: item.google_font,
                        color: item.color,
                        is_bold: item.is_bold,
                        is_italic: item.is_italic,
                        font_variant: item.font_variant || 'normal'
                    },
                    isModified: false
                }
            };
        });

        const triggerFontMatch = async (nodeId, originalItem) => {
            if (!originalItem || !originalItem.font) return;

            const candidates = FONT_OPTIONS.map(opt => opt.value);
            const textToMeasure = "The quick brown fox jumps over the lazy dog"; // Standard reference string

            try {
                console.log(`[Font Matcher] Metric-testing original font: ${originalItem.font}...`);

                const result = await fontFitManager.findBestFontMatch(
                    originalItem.font,
                    textToMeasure,
                    candidates,
                    {
                        size: originalItem.size || 12,
                        is_bold: originalItem.is_bold,
                        is_italic: originalItem.is_italic
                    }
                );

                if (result && result.bestMatch) {
                    console.log(`[Font Matcher] Match Found: ${result.bestMatch} (Error: ${result.errorRatio.toFixed(4)})`);

                    // 1. Update nodeEdits state
                    setNodeEdits(prev => ({
                        ...prev,
                        [nodeId]: {
                            ...(prev[nodeId] || {}),
                            googleFont: result.bestMatch,
                            matchDiagnostic: result
                        }
                    }));

                    // 2. Log to Backend Diagnostic
                    logFontMapping({
                        id: nodeId,
                        originalFont: originalItem.font,
                        backendFont: originalItem.google_font || "unknown",
                        frontendFont: result.bestMatch,
                        text: originalItem.content || "",
                        errorRatio: result.errorRatio
                    });
                }
            } catch (err) {
                console.error("[Font Matcher] Error identifying best match:", err);
            }
        };

        // Trigger matching when node is selected
        const originalPage = pages[pIdx];
        const originalItem = (originalPage.blocks ? originalPage.blocks.flatMap(b => b.lines) : (originalPage.items || [])).find(l => l.id === lineId);
        triggerFontMatch(targetLineId, originalItem);

        // Trigger existing scroll logic with a slight delay to allow tab render
        setTimeout(() => scrollToNode(targetLineId), 100);
    }, [isReflowEnabled, pages, textLines, scrollToNode]);


    return (
        <div className={`editor-page layout-${layoutMode}`}>
            {/* Studio Background Layer */}
            <div className="bg-decoration">
                <div className="floating-shape shape-1"></div>
                <div className="floating-shape shape-2"></div>
            </div>

            {/* 1. NAVIGATOR - Left */}
            <div className={`navigator-sidebar ${(mobileActivePanel === 'pages' || mobileActivePanel === 'words') ? 'mobile-open' : ''}`}>
                <div className="drawer-handle" onClick={() => setMobileActivePanel(null)}></div>

                <div className="panel-header" style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                    <div className="section-badge" style={{ marginBottom: '8px' }}>Navigator</div>
                    <h3 className="studio-header">
                        Design <span>Configuration</span>
                    </h3>
                </div>

                {/* Design Config Toolbar - Moved from right panel */}
                {(() => {
                    const activeStyle = getActiveNodeStyle();
                    const isWordSelection = selectedWordIndices.length > 0;
                    if (!activeStyle) return (
                        <div style={{ color: 'var(--ink-4)', fontSize: '0.78rem', textAlign: 'center', padding: '20px 0' }}>
                            Select a line on the page to start editing
                        </div>
                    );

                    return (
                        <div className={`design-config-toolbar ${!activeNodeId ? 'idle' : ''}`}>
                            <div className="toolbar-header">
                                <div className="section-badge">Active Node</div>
                                {!activeNodeId && <span className="toolbar-status">Selection Required</span>}
                                {selectedNodeIds.length > 1 && <span className="toolbar-status highlight">Multiple Selected ({selectedNodeIds.length})</span>}
                            </div>

                            <div className="tools-group">
                                <select
                                    className="premium-font-select"
                                    disabled={!activeNodeId}
                                    value={(() => {
                                        if (!activeStyle || !activeStyle.font) return "";
                                        const needle = activeStyle.font.toLowerCase().replace(/[^a-z0-9]/g, '');
                                        const match = FONT_OPTIONS.find(opt => {
                                            const haystack = opt.value.toLowerCase().replace(/[^a-z0-9]/g, '');
                                            return needle.includes(haystack) || haystack.includes(needle);
                                        });
                                        return match ? match.value : '';
                                    })()}
                                    onChange={(e) => handleStyleUpdate(activeNodeId, 'font', e.target.value)}
                                >
                                    <option value="" disabled>{activeNodeId ? "Change Font Family" : "---"}</option>
                                    {FONT_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>

                                <div className="size-control">
                                    <button disabled={!activeNodeId} onClick={() => {
                                        console.log('➖ Font Size Decrease - Current:', (activeStyle?.size || 10));
                                        handleStyleUpdate(activeNodeId, 'size', (activeStyle?.size || 10) - 1, isWordSelection ? selectedWordIndices : null);
                                    }}>−</button>
                                    <span className="size-label">
                                        {activeNodeId ? Math.round(Math.abs(activeStyle?.size || 10)) : '--'}
                                    </span>
                                    <button disabled={!activeNodeId} onClick={() => {
                                        console.log('➕ Font Size Increase - Current:', (activeStyle?.size || 10));
                                        handleStyleUpdate(activeNodeId, 'size', (activeStyle?.size || 10) + 1, isWordSelection ? selectedWordIndices : null);
                                    }}>+</button>
                                </div>

                                <input
                                    type="color"
                                    disabled={!activeNodeId}
                                    className="premium-color-swatch"
                                    value={activeNodeId ? rgbToHex(activeStyle?.color || [0, 0, 0]) : '#333333'}
                                    onChange={(e) => handleStyleUpdate(activeNodeId, 'color', hexToRgb(e.target.value), isWordSelection ? selectedWordIndices : null)}
                                    title="Override Color"
                                />

                                <div className="style-toggles">
                                    <button
                                        disabled={!activeNodeId}
                                        className={`toggle-btn ${activeStyle?.is_bold ? 'active' : ''}`}
                                        onClick={() => handleStyleUpdate(activeNodeId, 'is_bold', !activeStyle?.is_bold, selectedWordIndices.length > 0 ? selectedWordIndices : null)}
                                        title="Toggle Bold"
                                    >
                                        B
                                    </button>
                                    <button
                                        disabled={!activeNodeId}
                                        className={`toggle-btn ${activeStyle?.is_italic ? 'active' : ''}`}
                                        onClick={() => handleStyleUpdate(activeNodeId, 'is_italic', !activeStyle?.is_italic, selectedWordIndices.length > 0 ? selectedWordIndices : null)}
                                        title="Toggle Italic"
                                    >
                                        I
                                    </button>
                                </div>

                                <button
                                    disabled={!activeNodeId}
                                    className={`caps-toggle-btn ${activeStyle?.font_variant === 'small-caps' ? 'active' : ''}`}
                                    onClick={() => handleStyleUpdate(activeNodeId, 'font_variant', activeStyle?.font_variant === 'small-caps' ? 'normal' : 'small-caps')}
                                    title="Toggle Small Caps Rendering"
                                >
                                    <span className="icon">Aa</span> Small Caps
                                </button>

                                <select
                                    className="case-transform-select"
                                    disabled={!activeNodeId}
                                    onChange={(e) => {
                                        const mode = e.target.value;
                                        if (!mode) return;
                                        const edit = nodeEdits[activeNodeId] || {};
                                        let rawContent = edit.content;
                                        if (rawContent === undefined) {
                                            for (const p of pages) {
                                                const found = (p.blocks ? p.blocks.flatMap(b => b.lines) : p.items || []).find(l => l.id === activeNodeId);
                                                if (found) { rawContent = found.content; break; }
                                            }
                                        }
                                        const content = rawContent || "";
                                        let transformed = content;
                                        if (mode === 'uppercase') transformed = content.toUpperCase();
                                        if (mode === 'lowercase') transformed = content.toLowerCase();
                                        if (mode === 'capitalize') transformed = content.charAt(0).toUpperCase() + content.slice(1).toLowerCase();
                                        if (mode === 'title') transformed = content.replace(/\b\w/g, l => l.toUpperCase());
                                        handleSidebarEdit(activeNodeId, transformed, activeStyle);
                                    }}
                                >
                                    <option value="">Case Transform</option>
                                    <option value="uppercase">ALL UPPERCASE</option>
                                    <option value="lowercase">all lowercase</option>
                                    <option value="capitalize">Sentence case</option>
                                    <option value="title">Title Case</option>
                                </select>

                                <button
                                    className={`caps-toggle-btn ${smartStyling ? 'active' : ''}`}
                                    onClick={() => setSmartStyling(!smartStyling)}
                                    title="If ON, we try to keep individual bold/italics in the original line"
                                >
                                    <span className="icon">🛡️</span> Preserve Styles
                                </button>

                                {/* [FitV3] Fit Mode toggle removed — now automatic and animated by default */}

                                <button
                                    className={`caps-toggle-btn ${showAllBboxes ? 'active' : ''}`}
                                    onClick={() => setShowAllBboxes(!showAllBboxes)}
                                    title="Show/Hide bounding boxes for all lines"
                                >
                                    <span className="icon">📦</span> BBox
                                </button>

                                <button
                                    className={`caps-toggle-btn ${useOriginalFonts ? 'active' : ''}`}
                                    onClick={() => setUseOriginalFonts(!useOriginalFonts)}
                                    title="Toggle between Original PDF fonts and Google Font mappings"
                                >
                                    <span className="icon">🔤</span> Original Fonts
                                </button>

                                <button
                                    className={`caps-toggle-btn ${isReflowEnabled ? 'active' : ''}`}
                                    onClick={() => setIsReflowEnabled(!isReflowEnabled)}
                                    title="Experimental: Block-level word wrapping inside the bounding box"
                                >
                                    <span className="icon">🌊</span> Reflow
                                    {isReflowEnabled && <span className="dev-tag" style={{ background: 'var(--brand-primary)' }}>ON</span>}
                                </button>

                                <button
                                    className={`caps-toggle-btn ${isLineMultiSelect ? 'active' : ''}`}
                                    onClick={() => {
                                        const nextState = !isLineMultiSelect;
                                        setIsLineMultiSelect(nextState);
                                        if (nextState) {
                                            if (activeNodeId) {
                                                setSelectedNodeIds([activeNodeId]);
                                                const line = textLines.find(l => l.id === activeNodeId);
                                                const content = nodeEdits[activeNodeId]?.content || line?.content || "";
                                                const words = content.split(/\s+/).filter(Boolean);
                                                setSelectedWordIndices(words.map((_, i) => i));
                                                setIsMultiSelect(true);
                                            }
                                        } else {
                                            setSelectedNodeIds([]);
                                        }
                                    }}
                                    title="Select multiple lines to style them all at once"
                                >
                                    <span className="icon">📋</span> Multi-Line
                                </button>

                                <button
                                    className="caps-toggle-btn"
                                    onClick={() => {
                                        // FIX: Select ALL items on page, ignoring tab filter for batch styling
                                        const pageNodes = activePageData.blocks
                                            ? activePageData.blocks.flatMap(b => b.lines)
                                            : (activePageData.items || []);
                                        const ids = pageNodes.map(l => l.id);

                                        setSelectedNodeIds(ids);
                                        setIsLineMultiSelect(true);
                                        setIsMultiSelect(false); // Disable word-level indices for full line batch
                                        setSelectedWordIndices([]);

                                        if (ids.length > 0) {
                                            setActiveNodeId(ids[0]);
                                        }
                                    }}
                                    title="Select all lines on the current page"
                                >
                                    <span className="icon">📑</span> Select All
                                </button>

                                <button
                                    className={`caps-toggle-btn ${isDragEnabled ? 'active' : ''}`}
                                    onClick={() => setIsDragEnabled(!isDragEnabled)}
                                    title="Toggle Free Dragging: Move lines anywhere on the page"
                                >
                                    <span className="icon">⚓</span> Move Mode
                                </button>

                                <div className="hud-divider"></div>

                                <button
                                    className={`premium-optimize-btn ${isFittingConfirmed ? 'active' : ''}`}
                                    onClick={() => setIsFittingConfirmed(true)}
                                    title="Fit all text lines perfectly into their PDF bounding boxes"
                                    style={{
                                        background: isFittingConfirmed ? 'var(--brand-primary)' : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                        color: 'white',
                                        fontWeight: '700',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '8px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: isFittingConfirmed ? 'none' : '0 4px 15px rgba(168, 85, 247, 0.3)',
                                        cursor: isFittingConfirmed ? 'default' : 'pointer',
                                        transform: isFittingConfirmed ? 'scale(0.98)' : 'scale(1)'
                                    }}
                                    disabled={isFittingConfirmed}
                                >
                                    <span className="icon" style={{ fontSize: '1.1rem' }}>{isFittingConfirmed ? '✓' : '✨'}</span>
                                    {isFittingConfirmed ? 'Layout Optimized' : 'Optimize Text Fit'}
                                </button>
                            </div>
                        </div>
                    );
                })()}

                {/* Word Level Control */}
                <div className="navigator-section bottom" style={{ flex: 1, paddingTop: '12px', display: (window.innerWidth < 1024 && mobileActivePanel === 'pages') ? 'none' : 'block' }}>
                    {activeNodeData ? (
                        <div className="word-level-panel">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <strong style={{ fontSize: '0.8rem', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Word Selector</strong>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button
                                        className="select-all-btn"
                                        style={{ fontSize: '0.65rem' }}
                                        onClick={() => {
                                            const content = nodeEdits[activeNodeId]?.content || activeNodeData.content || "";
                                            const words = content.split(/\s+/).filter(Boolean);
                                            setSelectedWordIndices(words.map((_, i) => i));
                                            setIsMultiSelect(true);
                                        }}
                                    >
                                        Select All
                                    </button>
                                    <button
                                        className="deselect-all-btn"
                                        style={{ fontSize: '0.65rem' }}
                                        onClick={() => {
                                            setSelectedWordIndices([]);
                                            setIsMultiSelect(false);
                                        }}
                                    >
                                        Deselect All
                                    </button>
                                    <button
                                        className={`tab-pill ${isMultiSelect ? 'active' : ''}`}
                                        onClick={() => {
                                            setIsMultiSelect(!isMultiSelect);
                                            if (isMultiSelect) setSelectedWordIndices([]);
                                        }}
                                        style={{ padding: '4px 8px', fontSize: '0.65rem' }}
                                    >
                                        {isMultiSelect ? 'Multi: ON' : 'Multi-Select'}
                                    </button>
                                </div>
                            </div>

                            <div className="word-pill-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {(nodeEdits[activeNodeId]?.content || activeNodeData.content || "").split(/\s+/).filter(Boolean).map((word, idx) => (
                                    <div
                                        key={idx}
                                        className={`word-pill ${selectedWordIndices.includes(idx) ? 'active' : ''}`}
                                        onClick={() => {
                                            if (isMultiSelect) {
                                                setSelectedWordIndices(prev =>
                                                    prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                                );
                                            } else {
                                                setSelectedWordIndices(prev =>
                                                    prev.includes(idx) && prev.length === 1 ? [] : [idx]
                                                );
                                            }
                                        }}
                                    >
                                        {word}
                                    </div>
                                ))}
                            </div>

                            {selectedWordIndices.length > 0 && (
                                <div className="quick-actions-panel">
                                    <div className="quick-actions-header">
                                        <div className="selection-count">
                                            Editing {selectedWordIndices.length} {selectedWordIndices.length === 1 ? 'Word' : 'Words'}
                                        </div>
                                        <button className="close-actions" onClick={() => setSelectedWordIndices([])}>Close</button>
                                    </div>

                                    {/* Size Controls - REMOVED for Unification as per User Request */}

                                    {/* Color Picker */}
                                    <div className="action-row">
                                        <span className="action-label">Color</span>
                                        <input
                                            type="color"
                                            className="action-color-picker"
                                            value={rgbToHex(getActiveNodeStyle()?.color || [0, 0, 0])}
                                            onChange={(e) => handleStyleUpdate(activeNodeId, 'color', hexToRgb(e.target.value), selectedWordIndices)}
                                        />
                                    </div>

                                    {/* Font Style Toggles */}
                                    <div className="action-row">
                                        <span className="action-label">Style</span>
                                        <div className="style-toggles">
                                            <button
                                                className={`toggle-btn ${getActiveNodeStyle()?.is_bold ? 'active' : ''}`}
                                                onClick={() => handleStyleUpdate(activeNodeId, 'is_bold', !getActiveNodeStyle()?.is_bold, selectedWordIndices)}
                                            >B</button>
                                            <button
                                                className={`toggle-btn ${getActiveNodeStyle()?.is_italic ? 'active' : ''}`}
                                                onClick={() => handleStyleUpdate(activeNodeId, 'is_italic', !getActiveNodeStyle()?.is_italic, selectedWordIndices)}
                                            >I</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center', marginTop: '40px' }}>
                            Select a line to edit individual words
                        </div>
                    )}
                </div>
            </div>

            {/* 2. MAIN WORKSPACE - Center */}
            <div className="workspace-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                    <h2 className="studio-header" style={{ margin: 0 }}>
                        Studio <span>Workspace</span>
                    </h2>

                    <div className="zoom-controls">
                        <button className="zoom-btn" onClick={() => handleZoom(-0.1)}>−</button>
                        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                        <button className="zoom-btn" onClick={() => handleZoom(0.1)}>+</button>
                    </div>

                    <div className="pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {pages.length > VISIBLE_PAGE_COUNT && (
                            <button
                                className="sidebar-thumb"
                                style={{ width: 'auto', padding: '0 10px', minWidth: 'unset' }}
                                onClick={() => setPageOffset(prev => Math.max(0, prev - 1))}
                                disabled={pageOffset === 0}
                            >
                                <i className="fa-solid fa-chevron-left" style={{ fontSize: '0.7rem' }}></i>
                            </button>
                        )}
                        <div className="navigator-grid" style={{ display: 'flex', gap: '8px' }}>
                            {pages.slice(pageOffset, pageOffset + VISIBLE_PAGE_COUNT).map((_, i) => {
                                const realIdx = pageOffset + i;
                                return (
                                    <div
                                        key={realIdx}
                                        onClick={() => setActivePageIndex(realIdx)}
                                        className={`sidebar-thumb ${activePageIndex === realIdx ? 'active' : ''}`}
                                        style={{ minWidth: '40px' }}
                                    >
                                        {realIdx + 1}
                                    </div>
                                );
                            })}
                        </div>
                        {pages.length > VISIBLE_PAGE_COUNT && (
                            <button
                                className="sidebar-thumb"
                                style={{ width: 'auto', padding: '0 10px', minWidth: 'unset' }}
                                onClick={() => setPageOffset(prev => Math.min(pages.length - VISIBLE_PAGE_COUNT, prev + 1))}
                                disabled={pageOffset >= pages.length - VISIBLE_PAGE_COUNT}
                            >
                                <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.7rem' }}></i>
                            </button>
                        )}
                    </div>

                    <div style={{ flex: 1 }}></div>

                    <div className="layout-switcher">
                        <button 
                            className={`layout-btn ${layoutMode === 'default' ? 'active' : ''}`}
                            onClick={() => setLayoutMode('default')}
                            title="Default Layout (All Panels)"
                        >
                            <i className="fa-solid fa-table-columns"></i>
                        </button>
                        <button 
                            className={`layout-btn ${layoutMode === 'studio' ? 'active' : ''}`}
                            onClick={() => setLayoutMode('studio')}
                            title="Split Studio (50/50)"
                        >
                            <i className="fa-solid fa-columns"></i>
                        </button>
                        <button 
                            className={`layout-btn ${layoutMode === 'preview' ? 'active' : ''}`}
                            onClick={() => setLayoutMode('preview')}
                            title="Full Preview"
                        >
                            <i className="fa-solid fa-expand"></i>
                        </button>
                    </div>

                    <button className="download-btn-premium" onClick={handleDownload}>
                        <span style={{ fontSize: '1rem' }}>📥</span> Download PDF
                    </button>
                </div>

                <div className="preview-stage">
                    {/* PROPERTY HUD BAR */}
                    {activeNodeProps && (
                        <div className="property-hud">


                            <div className="hud-group">
                                <span className="hud-label">Font</span>
                                <span className="hud-value">{activeNodeProps.font.split(',')[0].replace(/'/g, "")}</span>
                            </div>
                            <div className="hud-divider"></div>
                            <div className="hud-group">
                                <span className="hud-label">Size</span>
                                <span className="hud-value">
                                    {activeNodeProps.size.toFixed(1)} pt
                                </span>
                            </div>
                            <div className="hud-divider"></div>
                            <div className="hud-group">
                                <span className="hud-label">Scale</span>
                                <span className="hud-value monospace" style={{ color: activeScale !== 1.0 ? 'var(--brand-primary, #2563eb)' : 'inherit' }}>
                                    {activeScale.toFixed(2)}x
                                </span>
                            </div>
                            <div className="hud-divider"></div>
                            <div className="hud-group">
                                <span className="hud-label">Color</span>
                                <div className="hud-color-swatch" style={{ background: rgbToHex(activeNodeProps.color) }}></div>
                                <span className="hud-value monospace">{rgbToHex(activeNodeProps.color).toUpperCase()}</span>
                            </div>
                            <div className="hud-divider"></div>
                            <div className="hud-group">
                                <span className="hud-label">Pos</span>
                                <span className="hud-value monospace">X:{activeNodeProps.x.toFixed(0)} Y:{activeNodeProps.y.toFixed(0)}</span>
                            </div>
                        </div>
                    )}

                    <div className="preview-content-wrapper">
                        <PythonRenderer
                            page={activePageData}
                            pageIndex={activePageIndex}
                            activeNodeId={activeNodeId}
                            selectedWordIndices={selectedWordIndices}
                            fontsKey={fontsKey}
                            fonts={fonts}
                            nodeEdits={nodeEdits}
                            onUpdate={handlePageUpdate}
                            onSelect={scrollToNode}
                            onDoubleClick={handleDoubleClick}
                            onMove={handleNodeMove}
                            scale={zoom}
                            isReflowEnabled={isReflowEnabled}
                            isDragEnabled={isDragEnabled}
                            showAllBboxes={showAllBboxes}
                            useOriginalFonts={useOriginalFonts}
                            onScaleUpdate={setActiveScale}
                            onBatchUpdate={handleBatchStyleUpdate}
                            isFittingConfirmed={isFittingConfirmed}
                            onCalibrated={(ratio) => {
                                setMetricRatio(ratio);
                                setIsCalibrated(true);
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* 3. CONTENT STUDIO - Right */}
            <div className={`editing-panel ${mobileActivePanel === 'edit' ? 'mobile-open' : ''}`}>
                <div className="drawer-handle" onClick={() => setMobileActivePanel(null)}></div>
                {/* Content Studio Panel */}

                <div className="panel-header" style={{ flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <h3 className="studio-header">
                            Content <span>Studio</span>
                        </h3>
                        <span className="page-count-mini">Page {activePageIndex + 1} · {textLines.length} {activeTab === 'text' ? 'Nodes' : 'Links'}</span>
                    </div>
                    <div className="tab-pill-selector">
                        <button className={`tab-pill ${activeTab === 'text' ? 'active' : ''}`} onClick={() => setActiveTab('text')}>
                            <span className="icon">Aa</span> Text Content
                        </button>
                        <button className={`tab-pill ${activeTab === 'links' ? 'active' : ''}`} onClick={() => setActiveTab('links')}>
                            <span className="icon">🔗</span> Links
                        </button>
                    </div>
                </div>

                <div className="structure-list">
                    {textLines.slice().reverse().map((line, i) => {
                        const edit = nodeEdits[line.id] || {};
                        const displayContent = edit.content !== undefined ? edit.content : line.content;
                        const isActive = activeNodeId === (line.id || line.dataIndex);
                        const isSelected = selectedNodeIds.includes(line.id);

                        return (
                            <MemoizedSidebarCard
                                key={line.id || i}
                                line={line}
                                edit={edit}
                                i={i}
                                isActive={isActive}
                                isSelected={isSelected}
                                isLineMultiSelect={isLineMultiSelect}
                                displayContent={displayContent}
                                onClick={() => {
                                    if (isLineMultiSelect) {
                                        setSelectedNodeIds(prev => {
                                            const currentlySelected = prev.includes(line.id);
                                            const next = currentlySelected ? prev.filter(id => id !== line.id) : [...prev, line.id];
                                            if (!currentlySelected) setActiveNodeId(line.id);
                                            return next;
                                        });
                                    } else {
                                        setActiveNodeId(line.id);
                                        setSelectedNodeIds([line.id]);
                                    }
                                }}
                                onFocus={() => {
                                    setActiveNodeId(line.id);
                                    if (!isLineMultiSelect) setSelectedNodeIds([line.id]);
                                    else if (!selectedNodeIds.includes(line.id)) setSelectedNodeIds(prev => [...prev, line.id]);
                                }}
                                onChangeText={(val, selectionStart) => handleSidebarEdit(line.id, val, line.originalStyle, selectionStart)}
                                onChangeLink={(val) => handleSidebarEdit(line.id, displayContent, line.originalStyle, undefined, val)}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Mobile Action Dock */}
            <div className="mobile-action-dock">
                <div className={`dock-item ${mobileActivePanel === 'pages' ? 'active' : ''}`} onClick={() => setMobileActivePanel('pages')}>
                    <i className="fa-solid fa-layer-group"></i>
                    <span>Pages</span>
                </div>
                <div className={`dock-item ${mobileActivePanel === 'words' ? 'active' : ''}`} onClick={() => setMobileActivePanel('words')}>
                    <i className="fa-solid fa-font"></i>
                    <span>Words</span>
                </div>
                <div className={`dock-item active primary`} onClick={() => handleDownload()}>
                    <i className="fa-solid fa-cloud-arrow-down"></i>
                </div>
                <div className={`dock-item ${mobileActivePanel === 'edit' ? 'active' : ''}`} onClick={() => setMobileActivePanel('edit')}>
                    <i className="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Studio</span>
                </div>
            </div>
        </div>
    );
}
