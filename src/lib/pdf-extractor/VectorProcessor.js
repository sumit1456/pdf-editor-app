import { OPS } from './operators.js';
import { applyTransform, multiplyMatrices, sanitizeColorComps, compsToHex } from './utils.js';

export class VectorProcessor {
    constructor(viewportHeight, scaleX = 1.0, scaleY = 1.0) {
        this.viewportHeight = viewportHeight;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.graphics = [];
        this.state = {
            lineWidth: 1,
            strokeColor: '#000000',
            fillColor: '#000000',
            opacity: 1.0,
            fillOpacity: 1.0,
            currentPath: [],
            stack: [],
            ctm: [1, 0, 0, 1, 0, 0],
            inTextMode: false
        };
        this.metrics = { path: 0, rect: 0, color: 0 };
    }

    processOperator(fn, args, fnIndex) {
        const { state } = this;

        switch (fn) {
            case OPS.save:
                state.stack.push({
                    lineWidth: state.lineWidth,
                    strokeColor: state.strokeColor,
                    fillColor: state.fillColor,
                    opacity: state.opacity,
                    fillOpacity: state.fillOpacity,
                    ctm: [...state.ctm]
                });
                break;
            case OPS.restore:
                if (state.stack.length > 0) {
                    const saved = state.stack.pop();
                    Object.assign(state, saved);
                }
                break;
            case OPS.transform:
                if (args) {
                    const oldCtm = [...state.ctm];
                    state.ctm = multiplyMatrices(args, state.ctm);
                    console.log(`[Vector Processor] CTM Updated (fn: 12):`, { move: [args[4], args[5]], scale: [args[0], args[3]], new: state.ctm });
                }
                break;
            case OPS.setLineWidth:
                if (args) state.lineWidth = args[0];
                break;

            case OPS.setGState:
                if (args && args[0]) {
                    const gState = args[0];
                    if (gState.ca !== undefined) state.opacity = gState.ca;
                    if (gState.ca_m !== undefined) state.opacity = gState.ca_m;
                    if (gState.CA !== undefined) state.opacity = gState.CA;
                    if (gState.CA_m !== undefined) state.opacity = gState.CA_m;
                    console.log(`[Vector Processor] setGState Opacity:`, state.opacity);
                }
                break;

            case OPS.setStrokeGray:
            case OPS.setFillGray:
            case OPS.setStrokeColor:
            case OPS.setFillColor:
            case OPS.setStrokeColorN:
            case OPS.setFillColorN:
            case OPS.setStrokeRGBColor:
            case OPS.setFillRGBColor:
            case OPS.setStrokeCMYKColor:
            case OPS.setFillCMYKColor:
                this.metrics.color++;
                const comps = sanitizeColorComps(args);
                const hex = compsToHex(comps);
                const isStroke = [OPS.setStrokeGray, OPS.setStrokeColor, OPS.setStrokeColorN, OPS.setStrokeRGBColor, OPS.setStrokeCMYKColor].includes(fn);
                if (isStroke) {
                    state.strokeColor = hex;
                    console.log(`[Vector Processor] Stroke Color Updated: ${hex} (fn: ${fn})`, { args: comps });
                } else {
                    state.fillColor = hex;
                    console.log(`[Vector Processor] Fill Color Updated: ${hex} (fn: ${fn})`, { args: comps });
                }
                break;

            case OPS.beginText:
                state.inTextMode = true;
                state.currentPath = []; // Clear any pending path when entering text
                break;
            case OPS.endText:
                state.inTextMode = false;
                state.currentPath = []; // Clear any pending path when exiting text
                break;

            case OPS.moveTo:
                if (state.inTextMode) break;
                const mv = applyTransform(args[0], args[1], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                if (fnIndex % 50 === 0) console.log(`[Vector Processor] Sample Move (fn: ${fnIndex}): raw(${args[0]}, ${args[1]}) -> view(${mv.x.toFixed(1)}, ${mv.y.toFixed(1)}) CTM:`, state.ctm);
                state.currentPath.push({ type: 'move', x: mv.x, y: mv.y });
                break;
            case OPS.lineTo:
                if (state.inTextMode) break;
                const ln = applyTransform(args[0], args[1], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                state.currentPath.push({ type: 'line', x: ln.x, y: ln.y });
                break;
            case OPS.curveTo:
                if (state.inTextMode) break;
                const c1 = applyTransform(args[0], args[1], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                const c2 = applyTransform(args[2], args[3], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                const tgt = applyTransform(args[4], args[5], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                state.currentPath.push({ type: 'curve', cp1x: c1.x, cp1y: c1.y, cp2x: c2.x, cp2y: c2.y, x: tgt.x, y: tgt.y });
                break;
            case OPS.curveTo2:
                if (state.inTextMode) break;
                const c2_1 = state.currentPath.length > 0 ? state.currentPath[state.currentPath.length - 1] : { x: 0, y: 0 };
                const c2_2 = applyTransform(args[0], args[1], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                const c2_t = applyTransform(args[2], args[3], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                state.currentPath.push({ type: 'curve', cp1x: c2_1.x, cp1y: c2_1.y, cp2x: c2_2.x, cp2y: c2_2.y, x: c2_t.x, y: c2_t.y });
                break;
            case OPS.curveTo3:
                if (state.inTextMode) break;
                const c3_1 = applyTransform(args[0], args[1], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                const c3_t = applyTransform(args[2], args[3], state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                state.currentPath.push({ type: 'curve', cp1x: c3_1.x, cp1y: c3_1.y, cp2x: c3_t.x, cp2y: c3_t.y, x: c3_t.x, y: c3_t.y });
                break;

            case OPS.constructPath:
                if (state.inTextMode) break;
                this.handleConstructPath(args, fnIndex);
                break;

            case OPS.rectangle:
                if (state.inTextMode) break;
                this.metrics.rect++;
                const x = args[0], y = args[1], w = args[2], h = args[3];
                const p1 = applyTransform(x, y, state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                const p2 = applyTransform(x + w, y, state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                const p3 = applyTransform(x + w, y + h, state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                const p4 = applyTransform(x, y + h, state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                state.currentPath.push({ type: 'move', x: p1.x, y: p1.y });
                state.currentPath.push({ type: 'line', x: p2.x, y: p2.y });
                state.currentPath.push({ type: 'line', x: p3.x, y: p3.y });
                state.currentPath.push({ type: 'line', x: p4.x, y: p4.y });
                state.currentPath.push({ type: 'close' });
                break;

            case OPS.stroke:
                this.flushPath(false, true, fnIndex);
                break;
            case OPS.closeStroke:
                state.currentPath.push({ type: 'close' });
                this.flushPath(false, true, fnIndex);
                break;
            case OPS.fill:
            case OPS.eoFill:
                this.flushPath(true, false, fnIndex);
                break;
            case OPS.strokeFill:
            case OPS.eoStrokeFill:
                this.flushPath(true, true, fnIndex);
                break;
            case OPS.closeFillStroke:
            case OPS.eoCloseFillStroke:
                state.currentPath.push({ type: 'close' });
                this.flushPath(true, true, fnIndex);
                break;
            case OPS.closePath:
                state.currentPath.push({ type: 'close' });
                break;
            case OPS.clip:
            case OPS.eoClip:
                // Clipping paths are often defined but NOT immediately drawn.
                // We don't support clipping paths in the renderer yet, 
                // so we clear the path to prevent it from leaking into the next stroke/fill.
                state.currentPath = [];
                break;
            case OPS.endPath:
                state.currentPath = [];
                break;
        }
    }

    handleConstructPath(args, fnIndex) {
        if (this.state.inTextMode) return; // Reinforced shield
        if (!args || !args[1] || !args[1][0]) return;
        const pathData = args[1][0];
        let pIdx = 0;
        while (pIdx < pathData.length) {
            const type = pathData[pIdx++];
            try {
                if (type === 0) { // moveTo
                    const p = applyTransform(pathData[pIdx++], pathData[pIdx++], this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    this.state.currentPath.push({ type: 'move', x: p.x, y: p.y });
                } else if (type === 1) { // lineTo
                    const p = applyTransform(pathData[pIdx++], pathData[pIdx++], this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    this.state.currentPath.push({ type: 'line', x: p.x, y: p.y });
                } else if (type === 2) { // bezierCurveTo
                    const c1 = applyTransform(pathData[pIdx++], pathData[pIdx++], this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    const c2 = applyTransform(pathData[pIdx++], pathData[pIdx++], this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    const t = applyTransform(pathData[pIdx++], pathData[pIdx++], this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    this.state.currentPath.push({ type: 'curve', cp1x: c1.x, cp1y: c1.y, cp2x: c2.x, cp2y: c2.y, x: t.x, y: t.y });
                } else if (type === 3 || type === 4) { // quadratic/other
                    pIdx += 2;
                    const t = applyTransform(pathData[pIdx++], pathData[pIdx++], this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    this.state.currentPath.push({ type: 'line', x: t.x, y: t.y });
                } else if (type === 5) { // rect
                    const x = pathData[pIdx++], y = pathData[pIdx++], w = pathData[pIdx++], h = pathData[pIdx++];
                    const p1 = applyTransform(x, y, this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    const p2 = applyTransform(x + w, y, this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    const p3 = applyTransform(x + w, y + h, this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    const p4 = applyTransform(x, y + h, this.state.ctm, this.viewportHeight, this.scaleX, this.scaleY);
                    this.state.currentPath.push({ type: 'move', x: p1.x, y: p1.y });
                    this.state.currentPath.push({ type: 'line', x: p2.x, y: p2.y });
                    this.state.currentPath.push({ type: 'line', x: p3.x, y: p3.y });
                    this.state.currentPath.push({ type: 'line', x: p4.x, y: p4.y });
                    this.state.currentPath.push({ type: 'close' });
                } else if (type === 6) { // closePath
                    this.state.currentPath.push({ type: 'close' });
                }
            } catch (e) { break; }
        }

        const drawOp = args[0];
        if (drawOp !== null && drawOp !== undefined) {
            if (drawOp === OPS.closeStroke || drawOp === OPS.closeFillStroke || drawOp === OPS.eoCloseFillStroke || drawOp === 21) {
                this.state.currentPath.push({ type: 'close' });
            }
            const isS = drawOp === OPS.stroke || drawOp === 1 || drawOp === OPS.closeStroke || drawOp === 21;
            const isF = [OPS.fill, OPS.eoFill, 2, 3].includes(drawOp);
            const isB = [OPS.strokeFill, OPS.eoStrokeFill, OPS.closeFillStroke, OPS.eoCloseFillStroke].includes(drawOp);
            this.flushPath(isF || isB, isS || isB, fnIndex);
        } else {
            // If no draw operation, this might be a clipping path or abandoned path.
            // We clear it to prevent leakage into the NEXT path.
            this.state.currentPath = [];
        }
    }

    flushPath(isFilled, isStroked, fnIndex) {
        if (this.state.currentPath.length === 0) return;

        // 1. Group by manual 'move' commands
        const moveGroups = [];
        let currentGroup = [];

        for (const seg of this.state.currentPath) {
            if (seg.type === 'move') {
                if (currentGroup.length > 0) moveGroups.push(currentGroup);
                currentGroup = [seg];
            } else {
                currentGroup.push(seg);
            }
        }
        if (currentGroup.length > 0) moveGroups.push(currentGroup);

        // 2. Further split groups if there are massive "jumps" without moves (coordinate leakage)
        const subPaths = [];
        const JUMP_THRESHOLD = this.viewportHeight * 0.4; // 40% of page height is likely a skip

        moveGroups.forEach(group => {
            let sub = [group[0]];
            for (let i = 1; i < group.length; i++) {
                const prev = group[i - 1];
                const curr = group[i];

                // If the jump is massive, treat it as a new sub-path (implicit moveTo)
                const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
                if (dist > JUMP_THRESHOLD && curr.type !== 'close' && prev.type !== 'close') {
                    if (sub.length > 0) subPaths.push(sub);
                    sub = [{ type: 'move', x: curr.x, y: curr.y }];
                    // If it was a curve or line, we convert current to a point and continue
                    if (curr.type !== 'move') sub.push(curr);
                } else {
                    sub.push(curr);
                }
            }
            if (sub.length > 0) subPaths.push(sub);
        });

        // 3. Filter and Push Graphics
        subPaths.forEach((pathSegments, idx) => {
            // Prune segments that are just single points or very short leaks
            if (pathSegments.length < 2) return;

            // Calculate Bounding Box for outlier detection
            const points = pathSegments.filter(p => p.x !== undefined && !isNaN(p.x));
            if (points.length < 2) return;

            const xs = points.map(p => p.x);
            const ys = points.map(p => p.y);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const width = maxX - minX;
            const height = maxY - minY;

            // Guard: Ignore excessively long "leaks" that are just two points far apart 
            // and don't contribute to a filled shape
            if (pathSegments.length === 2 && !isFilled) {
                const dist = Math.sqrt(Math.pow(xs[0] - xs[1], 2) + Math.pow(ys[0] - ys[1], 2));
                if (dist > this.viewportHeight * 0.5) return;
            }

            // Prune "Needle" paths (long single lines that look like beams)
            // if it's way outside the expected content area of a normal shape
            if (width > this.viewportHeight * 0.8 || height > this.viewportHeight * 0.8) {
                if (pathSegments.length < 5 && !isFilled) return;
            }

            this.graphics.push({
                id: `path_${fnIndex}_${idx}`,
                type: 'ShapePath',
                path: pathSegments,
                thickness: this.state.lineWidth,
                color: this.state.strokeColor,
                fillColor: this.state.fillColor,
                opacity: this.state.opacity,
                isFilled,
                isStroked,
                _debugSize: { w: width.toFixed(2), h: height.toFixed(2) }
            });
            this.metrics.path++;
        });

        this.state.currentPath = [];
    }

    getResults() {
        return this.graphics;
    }
}
