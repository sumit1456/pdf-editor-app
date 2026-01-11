import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import * as PIXI from 'pixi.js';

// ==================== MODE 3: PIXI RENDERER (GPU ACCELERATED) ====================

export class PixiRendererEngine {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            width: options.width || 595,
            height: options.height || 842,
            backgroundColor: options.backgroundColor || 0xffffff,
            backgroundAlpha: options.backgroundAlpha ?? 1,
            resolution: options.resolution || 3, // Use 3x resolution for retina-sharp vectors
            antialias: options.antialias ?? true,
            ...options
        };
        this.app = null;
        this.textureCache = new Map(); // Key: data hash or unique ID
        this.textureRecency = [];     // Array of keys, ordered by recency
        this.maxTextureCacheSize = options.maxTextureCacheSize || 40; // Max textures in GPU memory
    }

    async initialize() {
        // Use imported PIXI first, fall back to window.PIXI
        const PIXI_LIB = PIXI || window.PIXI;

        if (!PIXI_LIB) {
            console.error('PixiJS not loaded. Add: <script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js"></script>');
            return false;
        }

        const appOptions = {
            width: this.options.width,
            height: this.options.height,
            backgroundColor: this.options.backgroundColor,
            backgroundAlpha: this.options.backgroundAlpha,
            resolution: this.options.resolution,
            antialias: this.options.antialias,
            autoDensity: true
        };

        try {
            // Support both PIXI v7 and v8
            if (PIXI_LIB.Application.prototype.init) {
                // v8 style
                this.app = new PIXI_LIB.Application();
                await this.app.init(appOptions);
                const canvas = this.app.canvas;
                canvas.style.position = 'absolute';
                canvas.style.top = '0';
                canvas.style.left = '0';
                this.container.appendChild(canvas);
            } else {
                // v7 style
                this.app = new PIXI_LIB.Application(appOptions);
                const view = this.app.view;
                view.style.position = 'absolute';
                view.style.top = '0';
                view.style.left = '0';
                this.container.appendChild(view);
            }

            return true;
        } catch (e) {
            console.error('PixiJS Initialization failed:', e);
            if (!this.container) {
                console.error('CRITICAL: PixiRendererEngine container is null during initialization.');
            }
            return false;
        }
    }

    async render(data, options = {}) {
        const renderStartTime = performance.now();
        if (!this.app && !options.targetContainer) {
            const initialized = await this.initialize();
            if (!initialized) return null;
        }

        const stage = options.targetContainer || this.app.stage;

        if (!options.targetContainer) {
            stage.removeChildren();
        }

        const PIXI_LIB = PIXI || window.PIXI;
        const mainContainer = new PIXI_LIB.Container();
        stage.addChild(mainContainer);

        // Render Content Nodes
        if (data && data.nodes) {
            const contentContainer = new PIXI_LIB.Container();
            mainContainer.addChild(contentContainer);

            // Sort by z-index if present
            const sortedNodes = [...data.nodes].sort((a, b) => {
                const za = a.styles?.zIndex || 0;
                const zb = b.styles?.zIndex || 0;
                return za - zb;
            });

            for (const node of sortedNodes) {
                const displayObject = await this.renderNode(node);
                if (displayObject) contentContainer.addChild(displayObject);
            }
        }

        const renderTime = performance.now() - renderStartTime;

        // LIVE GPU STATUS REPORT
        const textureKeys = Array.from(this.textureCache.keys()).map(k => k.substring(0, 10) + '...');
        console.log(
            `%c[GPU Live Status] Textures: ${this.textureCache.size}/${this.maxTextureCacheSize} | keys: [${textureKeys.join(', ')}] | Render: ${renderTime.toFixed(1)}ms`,
            "color: #00ff00; font-weight: bold;"
        );

        return mainContainer;
    }

    renderShapes(shapes, container) {
        const PIXI_LIB = PIXI || window.PIXI;
        shapes.forEach(shape => {
            const graphics = new PIXI_LIB.Graphics();
            const colorData = this.parseColor(shape.color || '#cccccc');
            const alpha = colorData.alpha !== undefined ? colorData.alpha : 1;

            if (graphics.fill) {
                graphics.fill({ color: colorData.hex, alpha });
                if (shape.type === 'circle') {
                    graphics.circle(shape.width / 2, shape.height / 2, shape.width / 2);
                } else {
                    graphics.rect(0, 0, shape.width, shape.height);
                }
            } else {
                graphics.beginFill(colorData.hex, alpha);
                if (shape.type === 'circle') {
                    graphics.drawCircle(shape.width / 2, shape.height / 2, shape.width / 2);
                } else {
                    graphics.drawRect(0, 0, shape.width, shape.height);
                }
                graphics.endFill();
            }

            graphics.x = shape.x;
            graphics.y = shape.y;
            container.addChild(graphics);
        });
    }

    renderLines(lines, container) {
        const PIXI_LIB = PIXI || window.PIXI;
        lines.forEach(line => {
            const graphics = new PIXI_LIB.Graphics();
            const colorData = this.parseColor(line.color || '#000000');
            const alpha = colorData.alpha !== undefined ? colorData.alpha : 1;

            if (graphics.stroke) {
                graphics.stroke({ color: colorData.hex, width: line.thickness || 1, alpha });
                graphics.moveTo(line.x1, line.y1);
                graphics.lineTo(line.x2, line.y2);
            } else {
                graphics.lineStyle(line.thickness || 1, colorData.hex, alpha);
                graphics.moveTo(line.x1, line.y1);
                graphics.lineTo(line.x2, line.y2);
            }
            container.addChild(graphics);
        });
    }

    async renderNode(node) {
        switch (node.type) {
            case 'box':
                return this.renderBox(node);
            case 'text':
                return this.renderText(node);
            case 'image':
                return await this.renderImage(node);
            case 'pdf_path':
                return this.renderPdfPath(node);
            default:
                return null;
        }
    }

    renderPdfPath(node) {
        const PIXI_LIB = PIXI || window.PIXI;
        const graphics = new PIXI_LIB.Graphics();
        const { items, height } = node;

        const drawSegments = (g, segments) => {
            const flipY = (y) => height ? height - y : y;
            segments.forEach(seg => {
                if (seg.type === 'm') {
                    g.moveTo(seg.x, flipY(seg.y));
                } else if (seg.type === 'l') {
                    const dest = seg.pts[1];
                    g.lineTo(dest[0], flipY(dest[1]));
                } else if (seg.type === 'c') {
                    const cp1 = seg.pts[1];
                    const cp2 = seg.pts[2];
                    const end = seg.pts[3];
                    g.bezierCurveTo(cp1[0], flipY(cp1[1]), cp2[0], flipY(cp2[1]), end[0], flipY(end[1]));
                } else if (seg.type === 're') {
                    const [x, y, w, h] = seg.pts[0];
                    // For rects in bottom-up, (x, y) is bottom-left.
                    // In top-down, we need top-left: height - (y + h)
                    if (g.rect) g.rect(x, flipY(y + h), w, h);
                    else g.drawRect(x, flipY(y + h), w, h);
                }
            });
        };

        if (items) {
            items.forEach(pathItem => {
                const isV8 = !!graphics.fill; // v8 has fill method as action/property

                if (isV8) {
                    // v8: Draw Path -> Fill/Stroke
                    if (pathItem.segments) {
                        // For v8, we might need a context or strictly speaking just draw then fill
                        // But if we want to separate paths, we assume sequential calls work on the single graphics context
                        drawSegments(graphics, pathItem.segments);
                    }

                    if (pathItem.fill_color !== undefined) {
                        const color = pathItem.fill_color;
                        graphics.fill({ color, alpha: 1 });
                    } else if (pathItem.stroke_color !== undefined) {
                        const color = pathItem.stroke_color;
                        const width = pathItem.stroke_width || 1;
                        graphics.stroke({ color, width, alpha: 1 });
                    }
                } else {
                    // v7: BeginFill/LineStyle -> Draw Path -> EndFill
                    if (pathItem.fill_color !== undefined) {
                        graphics.beginFill(pathItem.fill_color, 1);
                    } else if (pathItem.stroke_color !== undefined) {
                        graphics.lineStyle(pathItem.stroke_width || 1, pathItem.stroke_color, 1);
                    }

                    if (pathItem.segments) {
                        drawSegments(graphics, pathItem.segments);
                    }

                    if (pathItem.fill_color !== undefined) {
                        graphics.endFill();
                    }
                }
            });
        }

        return graphics;
    }

    _calculateRadius(node, styles) {
        let r = styles.borderRadius;
        if (typeof r === 'string' && r.endsWith('%')) {
            return (Math.min(node.width, node.height) * parseFloat(r)) / 100;
        }
        return parseFloat(r) || 0;
    }

    renderBox(node) {
        const PIXI_LIB = PIXI || window.PIXI;
        const wrap = new PIXI_LIB.Container();
        const graphics = new PIXI_LIB.Graphics();
        const { x, y, width, height, styles } = node;

        wrap.addChild(graphics);
        if (styles.opacity !== undefined) wrap.alpha = styles.opacity;

        if (node.clip) {
            const mask = new PIXI_LIB.Graphics();
            const localX = node.clip.x - x;
            const localY = node.clip.y - y;

            if (mask.fill) {
                mask.beginPath();
                if (node.clip.radius > 0) mask.roundRect(localX, localY, node.clip.width, node.clip.height, node.clip.radius);
                else mask.rect(localX, localY, node.clip.width, node.clip.height);
                mask.fill(0xffffff);
            } else {
                mask.beginFill(0xffffff);
                if (node.clip.radius > 0) mask.drawRoundedRect(localX, localY, node.clip.width, node.clip.height, node.clip.radius);
                else mask.drawRect(localX, localY, node.clip.width, node.clip.height);
                mask.endFill();
            }
            wrap.addChild(mask);
            wrap.mask = mask;
        }

        if (styles.transform && styles.transform !== 'none') {
            this.applyTransform(wrap, styles.transform, x, y, width, height);
        } else {
            wrap.x = x;
            wrap.y = y;
        }

        if (styles.boxShadow && styles.boxShadow !== 'none') {
            this.renderShadow(wrap, styles.boxShadow, width, height, styles.borderRadius);
        }

        if (styles.backgroundColor && styles.backgroundColor !== 'transparent') {
            const colorData = this.parseColor(styles.backgroundColor);
            const fillAlpha = (styles.opacity !== undefined ? styles.opacity : 1) * colorData.alpha;
            const radius = this._calculateRadius(node, styles);

            if (graphics.fill) {
                graphics.beginPath();
                graphics.roundRect(0, 0, width, height, radius);
                graphics.fill({ color: colorData.hex, alpha: fillAlpha });
            } else {
                graphics.beginFill(colorData.hex, fillAlpha);
                graphics.drawRoundedRect(0, 0, width, height, radius);
                graphics.endFill();
            }
        }

        return wrap;
    }

    renderText(node, isLocal = false, isMask = false) {
        const PIXI_LIB = PIXI || window.PIXI;

        // Handle Unified JSON Schema (Figma-style)
        // Fields: content, color (array), size, font, is_bold, is_italic, origin/bbox
        const textContent = node.content || node.text;
        if (!textContent) return null;

        // Determine Position
        let x = node.x || 0;
        let y = node.y || 0;

        // If x,y not strictly present but origin is (common in new JSON)
        if (node.origin && Array.isArray(node.origin)) {
            x = node.origin[0];
            y = node.origin[1];
        } else if (node.bbox && Array.isArray(node.bbox)) {
            x = node.bbox[0];
            const [x0, y0, x1, y1] = node.bbox;
            y = y0;
        }

        // Determine Style
        let fontSize = node.size || (node.styles && node.styles.fontSize) || 12;
        let fontFamily = node.font || (node.styles && node.styles.fontFamily) || 'Helvetica';
        let fontWeight = node.is_bold ? 'bold' : (node.styles && node.styles.fontWeight) || 'normal';
        let fontStyle = node.is_italic ? 'italic' : (node.styles && node.styles.fontStyle) || 'normal';

        // Color Mapping
        let fill = 0x000000;

        if (node.color && Array.isArray(node.color)) {
            // [r, g, b] in 0-1 range typically for this JSON
            const r = Math.round(node.color[0] * 255);
            const g = Math.round(node.color[1] * 255);
            const b = Math.round(node.color[2] * 255);
            fill = (r << 16) | (g << 8) | b;
        } else if (node.styles && node.styles.color) {
            fill = this.parseColor(node.styles.color).hex;
        }

        if (isMask) fill = 0xffffff;

        const textStyleOptions = {
            fontFamily,
            fontSize,
            fontWeight,
            fontStyle,
            fill,
            align: (node.styles && node.styles.textAlign) || 'left',
            textBaseline: 'alphabetic', // Align with PDF/SVG baseline
            // Basic padding to prevent clipping
            padding: 5
        };

        if (node.styles && node.styles.lineHeight) {
            textStyleOptions.lineHeight = node.styles.lineHeight;
        }

        let pixiText;
        try {
            pixiText = new PIXI_LIB.Text({ text: textContent, style: textStyleOptions });
        } catch (e) {
            // v7 fallback
            pixiText = new PIXI_LIB.Text(textContent, new PIXI_LIB.TextStyle(textStyleOptions));
        }

        // Handle Scaling from Matrix if present
        if (node.matrix && Array.isArray(node.matrix) && node.matrix.length >= 4) {
            const [ma, mb, mc, md] = node.matrix;
            // PDF Matrix [a, b, c, d, tx, ty]
            // We apply the matrix for scale/skew and then set the absolute position.
            // PIXI v8: setFromMatrix is the modern way.
            pixiText.setFromMatrix(new PIXI_LIB.Matrix(ma, mb, mc, md, x, y));
        } else {
            pixiText.x = (isLocal ? 0 : x);
            pixiText.y = (isLocal ? 0 : y);
        }

        return pixiText;
    }

    async renderImage(node) {
        const PIXI_LIB = PIXI || window.PIXI;

        // Unified Schema
        // node.data (base64) or node.src (url)
        let src = node.src || node.data;
        if (!src) return null;

        if (node.data && !node.data.startsWith('http') && !node.data.startsWith('data:')) {
            src = `data:image/png;base64,${node.data}`;
        }

        // --- SMART CACHING LOGIC ---
        // Use a subset of base64/url as key for performance
        const cacheKey = src.slice(0, 100) + src.length;

        let texture;
        if (this.textureCache.has(cacheKey)) {
            // Move to end of recency list (Mark as used)
            this.textureRecency = this.textureRecency.filter(k => k !== cacheKey);
            this.textureRecency.push(cacheKey);
            texture = this.textureCache.get(cacheKey);
            console.log(`[GPU Cache] HIT: ${cacheKey.substring(0, 20)}... | Total: ${this.textureCache.size}`);
        } else {
            try {
                texture = await PIXI_LIB.Assets.load(src);
                if (!texture) return null;

                // Add to Cache
                this.textureCache.set(cacheKey, texture);
                this.textureRecency.push(cacheKey);

                console.log(`[GPU Cache] NEW: ${cacheKey.substring(0, 20)}... | Total: ${this.textureCache.size}/${this.maxTextureCacheSize}`);

                // Prune if limit exceeded
                this.pruneCache();
            } catch (error) {
                console.error('Failed to load image found in node:', error);
                return null;
            }
        }

        // Position
        let x = node.x;
        let y = node.y;
        let width = node.width;
        let height = node.height;

        if (x === undefined && node.bbox) {
            x = node.bbox[0];
            y = node.bbox[1]; // Top-Left
            width = node.bbox[2] - node.bbox[0];
            height = node.bbox[3] - node.bbox[1];
        }

        const sprite = new PIXI_LIB.Sprite(texture);
        sprite.x = x || 0;
        sprite.y = y || 0;
        if (width) sprite.width = width;
        if (height) sprite.height = height;

        if (node.styles && node.styles.opacity !== undefined) sprite.alpha = node.styles.opacity;

        return sprite;
    }

    pruneCache() {
        while (this.textureRecency.length > this.maxTextureCacheSize) {
            const oldestKey = this.textureRecency.shift(); // Remove oldest
            const texture = this.textureCache.get(oldestKey);
            if (texture) {
                console.log(`[GPU GC] EVICT: ${oldestKey.substring(0, 20)}...`);
                // EXPLICIT GPU DISPOSAL
                texture.destroy(true);
            }
            this.textureCache.delete(oldestKey);
        }
    }

    parseColor(cssColor) {
        if (!cssColor) return { hex: 0xffffff, alpha: 0 };
        if (typeof cssColor === 'number') return { hex: cssColor, alpha: 1 }; // Handle raw hex integer

        cssColor = cssColor.trim().toLowerCase();
        if (cssColor === 'transparent') return { hex: 0xffffff, alpha: 0 };

        if (cssColor.startsWith('#')) {
            let hex = cssColor.slice(1);
            if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
            return { hex: parseInt(hex, 16), alpha: 1 };
        }
        return { hex: 0xffffff, alpha: 1 };
    }

    applyTransform(displayObject, transformStr, x, y, width, height) {
        // Basic placeholder for transform logic
        displayObject.x = x;
        displayObject.y = y;
    }

    renderShadow(container, shadowStr, width, height, radius) {
        // Simplified shadow
    }

    async exportImage() {
        if (!this.app) return null;
        const canvas = this.app.renderer.canvas || this.app.renderer.view;
        return canvas.toDataURL();
    }

    destroyDisplayObject(obj) {
        if (!obj || obj.destroyed) return;
        obj.destroy({ children: true, texture: true, baseTexture: true });
    }

    destroy() {
        if (this.app) {
            console.log(`[GPU GC] Engine Destroying. Cleaning up ${this.textureCache.size} managed textures.`);
            // Explicitly destroy managed textures
            this.textureCache.forEach(t => t.destroy(true));
            this.textureCache.clear();
            this.textureRecency = [];

            this.app.destroy(true);
            this.app = null;
        }
    }
}

// ==================== REACT COMPONENT: WEBGL STAGE ====================

export const WebGLStage = forwardRef(({
    width = 595,
    height = 842,
    shapes = [],
    lines = [],
    sections = [],
    snapshot = null,
    onDragEnd = () => { },
    onSelect = () => { },
    selectedId = null,
    resolution = 3,
    background = 0xffffff,
    physicsEnabled = false,
    physicsManagerRef = null,
    yOffset = 0,
    onHeaderContainerReady = null,
    onSkillsContainerReady = null,
    onDragStart = () => { },
    isMagneticEnabled = false,
    className = "",
    style = {},
    stageScale = 1
}, ref) => {
    const containerRef = useRef(null);
    const pixiApp = useRef(null);
    const layers = useRef({ background: null, shapes: null, sections: null, lines: null });
    const sharedRenderer = useRef(null);
    const [initialized, setInitialized] = useState(false);

    const physicsEnabledRef = useRef(physicsEnabled);
    const isMagneticEnabledRef = useRef(isMagneticEnabled);
    const yOffsetRef = useRef(yOffset);

    useEffect(() => {
        physicsEnabledRef.current = physicsEnabled;
        isMagneticEnabledRef.current = isMagneticEnabled;
        yOffsetRef.current = yOffset;
    }, [physicsEnabled, isMagneticEnabled, yOffset]);

    const dragSession = useRef({
        active: false,
        type: null,
        id: null,
        target: null,
        startX: 0,
        startY: 0,
        dragStartX: 0,
        dragStartY: 0,
        wasDragging: false,
        initialPositions: {}
    });

    useEffect(() => {
        let isMounted = true;
        const startTime = performance.now();

        const initPixi = async () => {
            if (!containerRef.current || !isMounted) return;

            const PIXI_LIB = PIXI || window.PIXI;
            if (!PIXI_LIB) return;

            const app = new PIXI_LIB.Application();

            try {
                await app.init({
                    width: Math.max(1, width),
                    height: Math.max(1, height),
                    background,
                    resolution: resolution,
                    antialias: true,
                    autoDensity: true
                });

                if (!isMounted) {
                    app.destroy(true, { children: true, texture: true });
                    return;
                }

                pixiApp.current = app;
                containerRef.current.innerHTML = '';
                containerRef.current.appendChild(app.canvas || app.view);

                // Initialize Layers
                layers.current.background = new PIXI_LIB.Container();
                layers.current.shapes = new PIXI_LIB.Container();
                layers.current.sections = new PIXI_LIB.Container();
                layers.current.sections.sortableChildren = true;
                layers.current.lines = new PIXI_LIB.Container();

                app.stage.addChild(layers.current.background);
                app.stage.addChild(layers.current.shapes);
                app.stage.addChild(layers.current.sections);
                app.stage.addChild(layers.current.lines);

                if (stageScale !== 1) {
                    app.stage.scale.set(stageScale);
                }

                app.stage.interactive = true;
                app.stage.hitArea = app.screen;

                bindEvents(app);
                app.stage.eventMode = 'static';

                setInitialized(true);

            } catch (err) {
                console.error("[WebGLStage] Init failed:", err);
            }
        };

        const bindEvents = (app) => {
            app.stage.on('pointermove', (e) => {
                const session = dragSession.current;
                if (!session.active || !session.target || session.target.destroyed) return;

                const newPos = e.data.global;
                const deltaX = newPos.x - session.dragStartX;
                const deltaY = newPos.y - session.dragStartY;

                const targetX = session.startX + deltaX;
                const targetY = session.startY + deltaY;

                session.target.x = targetX;
                session.target.y = targetY;
            });

            const endDrag = () => {
                const session = dragSession.current;
                if (!session.active) return;

                if (session.target && !session.target.destroyed) {
                    const finalX = Math.round(session.target.x);
                    const finalY = Math.round(session.target.y);
                    onDragEnd(session.type, session.id, { x: finalX, y: finalY }, {});
                }
                session.active = false;
                session.target = null;
                session.wasDragging = true;
                setTimeout(() => {
                    if (dragSession.current) dragSession.current.wasDragging = false;
                }, 150);
            };

            app.stage.on('pointerup', endDrag);
            app.stage.on('pointerupoutside', endDrag);
            app.stage.on('pointerdown', (e) => {
                if (dragSession.current.wasDragging) return;
                if (e.target === app.stage) onSelect(null, null);
            });
        };

        initPixi();

        return () => {
            isMounted = false;
            setInitialized(false);
            if (pixiApp.current) {
                const app = pixiApp.current;
                app.destroy(true, { children: true, texture: true });
                pixiApp.current = null;
            }
        };
    }, [width, height, stageScale, background]);

    useEffect(() => {
        const app = pixiApp.current;
        if (!app || !app.stage) return;

        const renderStartTime = performance.now();

        if (!sharedRenderer.current) {
            sharedRenderer.current = new PixiRendererEngine(null, { width, height, resolution });
        }

        let isCancelled = false;

        const render = async () => {
            if (isCancelled) return;
            const engine = sharedRenderer.current;

            // Clear layers
            Object.values(layers.current).forEach(layer => {
                if (!layer) return;
                [...layer.children].forEach(child => engine.destroyDisplayObject(child));
                layer.removeChildren();
            });

            if (isCancelled) return;

            // 1. Background
            const bg = new PIXI.Graphics();
            bg.rect(0, 0, width, height).fill({ color: background, alpha: 1 });
            layers.current.background.addChild(bg);

            // 2. Sections (Nodes)
            if (snapshot && snapshot.nodes) {
                const sortedNodes = [...snapshot.nodes].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                for (const node of sortedNodes) {
                    const displayObj = await engine.renderNode(node);
                    if (displayObj) layers.current.sections.addChild(displayObj);
                }
            }
        };

        render();

        return () => {
            isCancelled = true;
        };
    }, [initialized, snapshot, background, width, height]);

    useImperativeHandle(ref, () => ({
        app: pixiApp.current,
        exportImage: () => sharedRenderer.current ? sharedRenderer.current.exportImage() : null
    }));

    return (
        <div
            ref={containerRef}
            className={`webgl-stage-container ${className}`}
            style={{
                width: '100%', height: '100%',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                overflow: 'hidden', backgroundColor: '#ffffff',
                touchAction: 'none',
                ...style
            }}
        />
    );
});
