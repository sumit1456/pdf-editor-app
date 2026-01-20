import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PDFRenderer from '../../components/PDFEditor/PDFRenderer';
import WebGLRenderer from '../../components/PDFEditor/WebGLRenderer';
import PythonRenderer from '../../components/PDFEditor/PythonRenderer';
import { mergeFragmentsIntoLines } from '../../lib/pdf-extractor/LineMerger';
import { ReflowEngine } from '../../lib/pdf-extractor/ReflowEngine';
import { savePdfToBackend } from '../../services/PdfBackendService';
import './EditorPage.css';

// Helper to decouple bullets from content (Global for use in initializers)
const splitBullet = (content) => {
    if (!content) return { bullet: '', text: '' };

    // Robust pattern for bullet markers:
    // 1. Common symbols: • · * ∗ ⋆ – - »
    // 2. Ordered markers: 1. 1) a. a)
    // 3. Artifact mappings: i, G (mapping from LaTeX/Symbol fonts)
    // Matches the marker and all trailing whitespace
    const match = content.match(/^([•·*∗⋆–\-»iG]|[\da-zA-Z]+[.)])\s*/);

    if (match) {
        const bulletPart = match[0];
        // If it's specifically 'i' or 'G' as a single starting character followed by space, 
        // we treat it as a bullet artifact.
        const isArtifact = (bulletPart.trim() === 'i' || bulletPart.trim() === 'G');

        return {
            bullet: isArtifact ? '• ' : bulletPart,
            text: content.substring(bulletPart.length)
        };
    }

    return { bullet: '', text: content };
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

// TYPOGRAPHIC AUDITOR: Measures natural density of fonts to find the best match
const measureLineDensity = (text, font, size, weight = 'normal') => {
    if (typeof window === 'undefined') return 0;
    if (!window.__canvas_auditor) {
        window.__canvas_auditor = document.createElement('canvas').getContext('2d');
    }
    const ctx = window.__canvas_auditor;
    ctx.font = `${weight} ${size}px "${font}", sans-serif`;
    return ctx.measureText(text).width;
};

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
    const [pdfName] = useState(location.state?.pdfName || 'document.pdf');
    const [originalPdfBase64] = useState(location.state?.originalPdfBase64 || '');
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isAdvanced, setIsAdvanced] = useState(true);

    // NODE-BASED EDITING STATE: Persistent edits keyed by unique item ID
    const [nodeEdits, setNodeEdits] = useState({});
    const [activeTab, setActiveTab] = useState('text'); // 'text' or 'links'
    const [zoom, setZoom] = useState(0.9); // Master zoom state
    const [activeNodeId, setActiveNodeId] = useState(null); // Track currently focused node
    const [smartStyling, setSmartStyling] = useState(true);
    const [selectedWordIndices, setSelectedWordIndices] = useState([]);
    const [isMultiSelect, setIsMultiSelect] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    const getActiveNodeStyle = () => {
        if (!activeNodeId) return null;
        const edit = nodeEdits[activeNodeId];

        // If specific words are selected, prioritize their style shown in toolbar
        if (selectedWordIndices.length > 0) {
            const firstIdx = selectedWordIndices[0];
            if (edit?.wordStyles?.[firstIdx]) {
                return { ...(edit.safetyStyle || {}), ...edit.wordStyles[firstIdx] };
            }
        }

        if (edit?.safetyStyle) return edit.safetyStyle;

        // Deep search in pages if not in edits
        for (const page of pages) {
            const found = (page.blocks ? page.blocks.flatMap(b => b.lines) : (page.items || [])).find(l => l.id === activeNodeId);
            if (found) {
                const base = (found.items?.[0] || found);
                return {
                    size: base.size,
                    font: base.font,
                    color: base.color,
                    is_bold: base.is_bold,
                    is_italic: base.is_italic,
                    font_variant: found.font_variant || 'normal'
                };
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
                setIsInitialLoad(false);
            }
        }
    }, [pages, isInitialLoad, activeNodeId]);

    const handleDownload = async () => {
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
                    bbox: original?.bbox,
                    origin: original?.origin,
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
            alert("No changes to export. Try editing some text first!");
            return;
        }

        const payload = {
            pdf_name: pdfName,
            pdf_base64: originalPdfBase64,
            modifications: modifiedNodes
        };


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
            } else {
                alert("Failed to generate PDF: " + (result.error || "Unknown error"));
            }
        } catch (err) {
            alert("Error during PDF export: " + err.message);
        }
    };

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
        // Capture and store original styles if not already set or not yet modified
        setNodeEdits(prev => {
            const currentEdit = prev[lineId] || {};
            // If already modified, we don't want to revert the user's manual style choices
            if (currentEdit.isModified) return prev;

            return {
                ...prev,
                [lineId]: {
                    ...currentEdit,
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

        // Trigger existing scroll logic with a slight delay to allow tab render
        setTimeout(() => scrollToNode(lineId), 100);
    };

    const scrollToNode = (idOrIndex) => {
        if (idOrIndex !== activeNodeId) setSelectedWordIndices([]);
        setActiveNodeId(idOrIndex);
        const element = document.getElementById(`input-card-${idOrIndex}`);

        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-flash');
            setTimeout(() => {
                element.classList.remove('highlight-flash');
            }, 2000);
        }
    };

    const handleSidebarEdit = (lineId, newText, originalStyle) => {
        if (!lineId) {
            console.warn('[EditorPage] Cannot edit node without stable ID');
            return;
        }

        // --- DYNAMIC BBOX CALCULATION ---
        const sStyle = nodeEdits[lineId]?.safetyStyle || originalStyle || {};
        const measuredWidth = measureLineDensity(
            newText,
            sStyle.font || 'Source Serif 4',
            sStyle.size || 10,
            sStyle.is_bold ? 'bold' : 'normal'
        );

        // Update visual edit state for the SPECIFIC line
        setNodeEdits(prev => {
            const current = prev[lineId] || {};
            // If we have an existing bbox, we update its right-edge (x1)
            let newBBox = current.bbox || null;
            if (!newBBox) {
                // Find original bbox in pages
                for (const p of pages) {
                    const found = (p.blocks ? p.blocks.flatMap(b => b.lines) : p.items || []).find(l => l.id === lineId);
                    if (found && found.bbox) {
                        newBBox = [...found.bbox];
                        break;
                    }
                }
            }

            if (newBBox) {
                // x1 = x0 + width
                newBBox[2] = newBBox[0] + measuredWidth;
                // Also update the logical width
            }

            return {
                ...prev,
                [lineId]: {
                    ...current,
                    content: newText,
                    width: measuredWidth,
                    bbox: newBBox,
                    safetyStyle: current.safetyStyle || originalStyle,
                    isModified: true
                }
            };
        });
    };

    const handleStyleUpdate = (lineId, field, value, wordIndices = null) => {
        setNodeEdits(prev => {
            const current = prev[lineId] || {};
            const sStyle = { ...(current.safetyStyle || {}) };
            const wordStyles = { ...(current.wordStyles || {}) };

            if (wordIndices !== null) {
                const indices = Array.isArray(wordIndices) ? wordIndices : [wordIndices];

                indices.forEach(idx => {
                    if (idx === null || idx === undefined) return;
                    if (!wordStyles[idx]) wordStyles[idx] = {};
                    wordStyles[idx] = { ...wordStyles[idx], [field]: value };
                });
            } else {
                sStyle[field] = value;
                if (field === 'font') sStyle.googleFont = value;
            }

            // --- RECALCULATE DYNAMIC WIDTH ---
            const content = current.content !== undefined ? current.content : (
                pages[activePageIndex].items?.find(it => it.id === lineId)?.content ||
                pages[activePageIndex].blocks?.flatMap(b => b.lines).find(l => l.id === lineId)?.content || ""
            );

            const measuredWidth = measureLineDensity(
                content,
                sStyle.font || 'Source Serif 4',
                sStyle.size || 10,
                sStyle.is_bold ? 'bold' : 'normal'
            );

            let newBBox = current.bbox || null;
            if (!newBBox) {
                const found = (pages[activePageIndex].blocks ? pages[activePageIndex].blocks.flatMap(b => b.lines) : (pages[activePageIndex].items || [])).find(l => l.id === lineId);
                if (found && found.bbox) newBBox = [...found.bbox];
            }
            if (newBBox) {
                newBBox[2] = newBBox[0] + measuredWidth;
            }

            return {
                ...prev,
                [lineId]: {
                    ...current,
                    safetyStyle: sStyle,
                    wordStyles: wordStyles,
                    width: measuredWidth,
                    bbox: newBBox,
                    isModified: true
                }
            };
        });
    };


    const rgbToHex = (c) => {
        if (!c || !Array.isArray(c)) return '#000000';
        const r = Math.round(c[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(c[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(c[2] * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    };

    const hexToRgb = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return [r, g, b];
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
                            is_bold: line.items?.some(it => it.is_bold) || contentItem.is_bold,
                            is_italic: line.items?.some(it => it.is_italic) || contentItem.is_italic
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

    return (
        <div className="editor-page">
            {/* Studio Background Layer */}
            <div className="bg-decoration">
                <div className="floating-shape shape-1"></div>
                <div className="floating-shape shape-2"></div>
            </div>

            {/* 1. EDITING PANEL - Left */}
            <div className="editing-panel">
                {/* 1.1 DESIGN CONFIG TOOLBAR (Global control for active node) */}
                {(() => {
                    const activeStyle = getActiveNodeStyle();
                    const isWordSelection = selectedWordIndices.length > 0;
                    if (!activeStyle) return null;

                    return (
                        <div className={`design-config-toolbar ${!activeNodeId ? 'idle' : ''}`}>
                            <div className="toolbar-header">
                                <div className="toolbar-label">Design Configuration</div>
                                {!activeNodeId && <span className="toolbar-status">Selection Required</span>}
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
                                        handleStyleUpdate(activeNodeId, 'size', (activeStyle?.size || 10) - 1, isWordSelection ? selectedWordIndices : null);
                                    }}>−</button>
                                    <span className="size-label">
                                        {activeNodeId ? Math.round(Math.abs(activeStyle?.size || 10)) : '--'}
                                    </span>
                                    <button disabled={!activeNodeId} onClick={() => {
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
                                        // Find original if edit doesn't exist yet
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
                            </div>
                        </div>
                    );
                })()}

                <div className="panel-header" style={{ flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <h3 className="highlight">
                            Content <span style={{ color: 'var(--studio-white)', WebkitTextFillColor: 'initial' }}>Studio</span>
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
                        const sStyle = edit.safetyStyle || line.originalStyle || {};
                        const displayContent = edit.content !== undefined ? edit.content : line.content;
                        const displayUri = edit.uri !== undefined ? edit.uri : line.uri;

                        return (
                            <div
                                key={line.id || i}
                                id={`input-card-${line.id || line.dataIndex}`}
                                className={`premium-input-card ${edit.isModified ? 'modified' : ''} ${activeNodeId === (line.id || line.dataIndex) ? 'active' : ''}`}
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
                                        value={displayContent}
                                        onFocus={() => setActiveNodeId(line.id)}
                                        onChange={(e) => handleSidebarEdit(line.id, e.target.value, line.originalStyle)}
                                        placeholder="Enter text..."
                                        style={{
                                            fontFamily: sStyle.font ? `'${sStyle.font}', serif` : 'inherit',
                                            fontWeight: sStyle.is_bold ? '700' : '400',
                                            fontStyle: sStyle.is_italic ? 'italic' : 'normal',
                                            fontSize: '1rem',
                                            transition: 'all 0.2s'
                                        }}
                                    />

                                    {activeTab === 'links' && (
                                        <div className="inline-link-field">
                                            <label className="field-label">Hyperlink (URL)</label>
                                            <input
                                                type="text"
                                                className="link-field"
                                                value={displayUri || ''}
                                                placeholder="https://..."
                                                onChange={(e) => handleLinkEdit(line.id, e.target.value, line.originalStyle)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 2. MAIN WORKSPACE - Center */}
            <div className="workspace-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                    <h2 className="highlight" style={{ margin: 0 }}>
                        Studio <span style={{ color: 'var(--studio-white)', WebkitTextFillColor: 'initial' }}>Workspace</span>
                    </h2>

                    <div className="zoom-controls">
                        <button className="zoom-btn" onClick={() => handleZoom(-0.1)}>−</button>
                        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                        <button className="zoom-btn" onClick={() => handleZoom(0.1)}>+</button>
                    </div>

                    <div style={{ flex: 1 }}></div>

                    <button className="download-btn-premium" onClick={handleDownload}>
                        <span style={{ fontSize: '1rem' }}>📥</span> Download PDF
                    </button>
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

            {/* 3. NAVIGATOR - Right */}
            <div className="navigator-sidebar">
                <div className="navigator-section top">
                    <div className="navigator-header">
                        <h3 style={{ fontSize: '1rem', color: '#fff', margin: '0' }}>Pages Preview</h3>
                        <h3 style={{ fontSize: '1rem', color: '#fff', margin: '0' }}>Pages Preview</h3>
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

                <div className="navigator-section bottom" style={{ flex: 1, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px', marginTop: '10px' }}>
                    {activeNodeData ? (
                        <div className="word-level-panel">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <strong style={{ fontSize: '0.9rem', color: '#fff' }}>Word Styling</strong>
                                <button
                                    className={`tab-pill ${isMultiSelect ? 'active' : ''}`}
                                    onClick={() => {
                                        setIsMultiSelect(!isMultiSelect);
                                        if (isMultiSelect) setSelectedWordIndices([]);
                                    }}
                                    style={{ fontSize: '0.7rem' }}
                                >
                                    {isMultiSelect ? 'Multi: ON' : 'Multi-Select'}
                                </button>
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
                                        style={{
                                            padding: '5px 10px',
                                            background: selectedWordIndices.includes(idx) ? '#4a9eff' : 'rgba(255,255,255,0.05)',
                                            color: '#fff',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {word}
                                    </div>
                                ))}
                            </div>

                            {selectedWordIndices.length > 0 && (
                                <div className="quick-actions" style={{ marginTop: '20px', padding: '15px', background: 'rgba(74, 158, 255, 0.05)', borderRadius: '12px', border: '1px solid rgba(74, 158, 255, 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#4a9eff', fontWeight: '600' }}>
                                            Editing {selectedWordIndices.length} {selectedWordIndices.length === 1 ? 'Word' : 'Words'}
                                        </div>
                                        <button className="mini-toggle" onClick={() => setSelectedWordIndices([])} style={{ background: 'transparent', color: '#666', border: 'none', cursor: 'pointer', padding: '2px' }}>Close</button>
                                    </div>

                                    {/* Size Controls */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#888', minWidth: '40px' }}>Size</span>
                                        <div className="size-control" style={{ border: '1px solid rgba(255,255,255,0.1)', flex: 1 }}>
                                            <button onClick={() => handleStyleUpdate(activeNodeId, 'size', (getActiveNodeStyle()?.size || 10) - 1, selectedWordIndices)}>−</button>
                                            <span style={{ fontSize: '0.8rem', color: '#fff' }}>{Math.round(getActiveNodeStyle()?.size || 10)}</span>
                                            <button onClick={() => handleStyleUpdate(activeNodeId, 'size', (getActiveNodeStyle()?.size || 10) + 1, selectedWordIndices)}>+</button>
                                        </div>
                                    </div>

                                    {/* Color Picker */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#888', minWidth: '40px' }}>Color</span>
                                        <input
                                            type="color"
                                            value={rgbToHex(getActiveNodeStyle()?.color || [0, 0, 0])}
                                            onChange={(e) => handleStyleUpdate(activeNodeId, 'color', hexToRgb(e.target.value), selectedWordIndices)}
                                            style={{
                                                flex: 1,
                                                height: '24px',
                                                background: 'transparent',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        />
                                    </div>

                                    {/* Font Style Toggles */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#888', minWidth: '40px' }}>Style</span>
                                        <div className="style-toggles" style={{ flex: 1, justifyContent: 'flex-start' }}>
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
        </div >
    );
}
