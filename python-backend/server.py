from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import fitz # PyMuPDF
import uvicorn
import base64
import traceback
import os
import zipfile
import io
import json
import sys
import contextlib

from layout_engine import normalize_layout
# from coordinate_diagnostic import run_comparison

app = FastAPI()

class TextSpan(BaseModel):
    text: str
    font: Optional[str] = None
    size: Optional[float] = None
    color: Optional[List[float]] = None
    is_bold: Optional[bool] = False
    is_italic: Optional[bool] = False
    font_variant: Optional[str] = "normal"
    google_font: Optional[str] = None # Added for direct matching

class Modification(BaseModel):
    id: str
    pageIndex: int
    text: Optional[str] = "" 
    bbox: List[float]
    origin: List[float]
    style: dict
    type: Optional[str] = "text"
    uri: Optional[str] = None
    spans: Optional[List[TextSpan]] = None
    items: Optional[List[dict]] = None
    google_font: Optional[str] = None # Direct override from frontend

class SavePDFRequest(BaseModel):
    pdf_name: str
    pdf_base64: str
    modifications: List[Modification]


# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_fonts(doc):
    """Extract embedded fonts to base64 and harvester metrics."""
    fonts = []
    seen_fonts = set()
    
    for page in doc:
        font_list = page.get_fonts(full=True)
        for font_info in font_list:
            xref = font_info[0]
            name = font_info[3]
            if xref in seen_fonts: 
                continue
            
            seen_fonts.add(xref)
            font_binary = doc.extract_font(xref)
            if font_binary:
                binary = font_binary[3]
                if binary:
                    b64 = base64.b64encode(binary).decode('utf-8')
                    
                    # HARVEST METRICS
                    try:
                        f = fitz.Font(fontbuffer=binary)
                        # Extract widths for common glyphs (normalized to 100pt)
                        widths = {chr(i): f.text_length(chr(i), fontsize=100) for i in range(32, 127)}
                        metrics = {
                            "widths": widths,
                            "ascender": f.ascender,
                            "descender": f.descender
                        }
                    except:
                        metrics = None

                    fonts.append({
                        "name": name,
                        "data": b64,
                        "metrics": metrics
                    })
    return fonts

def parse_color(color_in):
    """Convert PyMuPDF color (int or tuple) to flattened 3-float array [r, g, b]."""
    if color_in is None:
        return [0.0, 0.0, 0.0] # Default black
    
    # Text spans give integer (sRGB)
    if isinstance(color_in, int):
        r = (color_in >> 16) & 0xFF
        g = (color_in >> 8) & 0xFF
        b = color_in & 0xFF
        rv = [r/255.0, g/255.0, b/255.0]
        # COLOR FIDELITY: Snap dark grays (often extraction artifacts) to True Black
        # Inter/SourceSerif look 'Gray' if we use the raw 0.1-0.2 extracted values.
        if all(c < 0.28 for c in rv):
            return [0.0, 0.0, 0.0]
        return rv
    
    # Drawings give tuple (0-1 floats)
    if isinstance(color_in, (list, tuple)):
        rv = list(color_in)
        if all(c < 0.28 for c in rv):
             return [0.0, 0.0, 0.0]
        return rv
        
    return [0.0, 0.0, 0.0]

# SYMBOL FIDELITY: Map PDF symbols to high-fidelity Unicode equivalents
SYMBOL_MAP = {
    # Bullets & Markers
    "\u2022": "\u2022", "\u25cf": "\u2022", "\u25cb": "\u25e6",
    "\u25aa": "\u25aa", "\u2731": "*", "\u2217": "*",
    "\u00ef": "\u2022", "\u00a7": "\u2022", "\u0083": "\u2022",
    "\u00d0": "\u2022", "\u00b7": "·", 
    # FontAwesome 5 Fallbacks (PUA -> Standard High-Fidelity)
    "\uf0e0": "\u2709\ufe0f",   # Envelope
    "\uf095": "\u260e\ufe0f",   # Phone
    "\uf08c": "[in]",           # LinkedIn Replacement (Safe Text)
    "\uf0e1": "[in]",           # LinkedIn Alt
    "\uf09b": "\u229a",         # Github (Octocat-like circle dot)
    "\uf0ac": "\u1f310",        # Globe
    "\uf121": "</>",            # Code
    "\uf3b8": "\u270f\ufe0f",   # Edit
    # Direct LaTeX Icon Anchors (Matches Frontend mapContentToIcons)
    "\u0083": "\u260e\ufe0f",   # ƒ anchor maps to Phone
    "\u00a7": "\u229a",         # § anchor maps to GitHub
    "\u00ef": "[in]",           # ï anchor maps to LinkedIn
    "\u00d0": "</>",            # Ð anchor maps to LeetCode
    # Computer Modern Symbol (cmsy) fixes
    "\u0000": "\u2022", 
    "\u000c": "\u2022",
    "\u2192": "\u2192",         # Right Arrow
}

@app.post("/pdf-extraction-config")
async def extract_pdf(file: UploadFile = File(...), backend: str = "python"):
    try:
        # Read file into memory
        content = await file.read()
        
        doc = fitz.open(stream=content, filetype="pdf")
        
        extracted_pages = []
        
        import uuid

        PT_TO_PX = 1.333333  # Standard 96DPI (CSS Pixels) / 72DPI (PDF Points)

        for pno, page in enumerate(doc):
            items = []
            
            # Scaled page dimensions
            pg_w = page.rect.width * PT_TO_PX
            pg_h = page.rect.height * PT_TO_PX

            # 1. TEXT & IMAGE EXTRACTION (High Fidelity)
            # 1.1 LINK EXTRACTION (Pre-fetch for association)
            links = page.get_links()

            text_page = page.get_text("dict")
            if "blocks" in text_page:
                for block in text_page["blocks"]:
                    # --- TEXT BLOCKS ---
                    if block["type"] == 0:
                        for line in block["lines"]:
                            line_id = str(uuid.uuid4())
                            for span in line["spans"]:
                                is_bold = bool(span["flags"] & 16)
                                is_italic = bool(span["flags"] & 2)

                                # DETECT SMALL-CAPS
                                font_name = span["font"].lower()
                                font_variant = "normal"
                                if any(x in font_name for x in ["csc", "smallcaps", "small-caps", "caps"]):
                                    font_variant = "small-caps"

                                span_bbox = span["bbox"]
                                # Use scaled centroids for link matching
                                centroid_x = (span_bbox[0] + span_bbox[2]) / 2
                                centroid_y = (span_bbox[1] + span_bbox[3]) / 2

                                uri = None
                                for lnk in links:
                                    if "from" in lnk and "uri" in lnk:
                                        r = lnk["from"]
                                        if r.x0 <= centroid_x <= r.x1 and r.y0 <= centroid_y <= r.y1:
                                            uri = lnk["uri"]
                                            break

                                # Apply Scale Fix: PDF Points to CSS Pixels
                                size_px = span["size"] * PT_TO_PX
                                bbox_px = [coord * PT_TO_PX for coord in span["bbox"]]
                                origin_px = [coord * PT_TO_PX for coord in span["origin"]]

                                from font_manager import font_manager
                                g_font = font_manager.get_folder_name(span["font"])

                                text_item = {
                                    "id": str(uuid.uuid4()),
                                    "line_id": line_id,
                                    "type": "text",
                                    "content": span["text"].title() if font_variant == "small-caps" and (span["text"].isupper() or span["text"].istitle() or len(span["text"]) > 5) else span["text"],
                                    "origin": origin_px,
                                    "x": origin_px[0],
                                    "y": origin_px[1],
                                    "bbox": bbox_px,
                                    "width": bbox_px[2] - bbox_px[0],
                                    "height": bbox_px[3] - bbox_px[1],
                                    "size": size_px,
                                    "font": span["font"],
                                    "google_font": g_font.replace("_", " "), # Human readable
                                    "font_variant": font_variant,
                                    "color": parse_color(span.get("color")),
                                    "is_bold": is_bold,
                                    "is_italic": is_italic,
                                    "flags": span["flags"],
                                    "original_x": origin_px[0],
                                    "original_y": origin_px[1],
                                    "matrix": [1, 0, 0, 1, 0, 0]
                                }
                                if uri:
                                    text_item["uri"] = uri

                                items.append(text_item)

                    # --- IMAGE BLOCKS ---
                    elif block["type"] == 1:
                        bbox = [coord * PT_TO_PX for coord in block["bbox"]]
                        img_data = block.get("image")
                        if img_data:
                            b64_data = base64.b64encode(img_data).decode('utf-8')
                            items.append({
                                "id": str(uuid.uuid4()),
                                "type": "image",
                                "data": b64_data,
                                "x": bbox[0],
                                "y": bbox[1], # Use Top-Down for consistency in 96DPI flow
                                "width": bbox[2] - bbox[0],
                                "height": bbox[3] - bbox[1],
                                "bbox": bbox
                            })

            # 2. VECTOR EXTRACTION (Continuous Path Refinement)
            drawings = page.get_drawings()
            for draw in drawings:
                current_path = []

                for item in draw["items"]:
                    kind = item[0]
                    if kind == "m": # move
                        current_path.append({ "type": "m", "x": item[1].x * PT_TO_PX, "y": item[1].y * PT_TO_PX })
                    elif kind == "l": # line
                        p1 = item[1]
                        p2 = item[2]
                        # Ensure continuity: if no segments yet, start with move
                        if not current_path:
                            current_path.append({ "type": "m", "x": p1.x * PT_TO_PX, "y": p1.y * PT_TO_PX })
                        current_path.append({ "type": "l", "pts": [[p1.x * PT_TO_PX, p1.y * PT_TO_PX], [p2.x * PT_TO_PX, p2.y * PT_TO_PX]] })
                    elif kind == "c": # curve (bezier)
                        p1, p2, p3, p4 = item[1], item[2], item[3], item[4]
                        if not current_path:
                            current_path.append({ "type": "m", "x": p1.x * PT_TO_PX, "y": p1.y * PT_TO_PX })
                        current_path.append({
                            "type": "c",
                            "pts": [
                                [p1.x * PT_TO_PX, p1.y * PT_TO_PX],
                                [p2.x * PT_TO_PX, p2.y * PT_TO_PX],
                                [p3.x * PT_TO_PX, p3.y * PT_TO_PX],
                                [p4.x * PT_TO_PX, p4.y * PT_TO_PX]
                            ]
                        })
                    elif kind == "re": # rect
                        r = item[1]
                        current_path.append({
                            "type": "re",
                            "pts": [[r.x0 * PT_TO_PX, r.y0 * PT_TO_PX, (r.x1-r.x0) * PT_TO_PX, (r.y1-r.y0) * PT_TO_PX]]
                        })

                # Check for path closing command
                if draw.get("closePath"):
                    current_path.append({ "type": "close" })

                if current_path:
                    path_item = {
                        "type": "path",
                        "segments": current_path,
                        "fill_opacity": draw.get("fill_opacity", 1.0),
                        "stroke_opacity": draw.get("stroke_opacity", 1.0)
                    }

                    if draw["fill"] is not None:
                        path_item["fill_color"] = parse_color(draw["fill"])
                    if draw["color"] is not None:
                        path_item["stroke_color"] = parse_color(draw["color"])
                        path_item["stroke_width"] = (draw.get("width") or 1.0) * PT_TO_PX

                    items.append({
                        "id": str(uuid.uuid4()),
                        "type": "pdf_path",
                        "x": 0, "y": 0,
                        "items": [path_item],
                        "height": 0
                    })

            # 3. LINK EXTRACTION (Legacy/Visual Layer)
            for lnk in links:
                if "from" in lnk and "uri" in lnk:
                    r = lnk["from"]
                    bbox = [r.x0 * PT_TO_PX, r.y0 * PT_TO_PX, r.x1 * PT_TO_PX, r.y1 * PT_TO_PX]
                    items.append({
                        "id": str(uuid.uuid4()),
                        "type": "link",
                        "bbox": bbox,
                        "uri": lnk["uri"]
                    })

            # 4. LAYOUT NORMALIZATION (Block Tree Reconstruction)
            layout_data = normalize_layout(items)

            # --- RUNTIME DIAGNOSTIC ---
            # Generate the coordinate comparison report for the current page
            # try:
            #     run_comparison(items, layout_data)
            # except Exception as diag_e:
            #     print(f"[Diagnostic Error] Failed to generate coordinate report: {diag_e}")

            extracted_pages.append({
                "index": pno,
                "width": pg_w,
                "height": pg_h,
                "blocks": layout_data.get("blocks", []),
                "bg_items": layout_data.get("bg_items", [])
            })

        fonts = extract_fonts(doc)

        return {
            "success": True,
            "data": {
                "pages": extracted_pages,
                "fonts": fonts,
                "fonts_key": str(len(fonts))
            }
        }

    except Exception as e:
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@app.post("/save-pdf")
async def save_pdf(request: SavePDFRequest):
    try:
        # 1. Open original PDF from Base64
        pdf_data = base64.b64decode(request.pdf_base64)
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        PT_TO_PX = 1.333333
        from font_manager import font_manager
        
        # --- NEW: PRINT FRONTEND PAYLOAD ---
        print("\n[FRONTEND PAYLOAD RECEIVED]")
        # We print a truncated version of base64 but full modifications
        payload_debug = request.dict()
        payload_debug["pdf_base64"] = f"{request.pdf_base64[:50]}... (truncated)"
        print(json.dumps(payload_debug, indent=2))
        print("----------------------------\n")
        
        # Clear audit log at start of operation
        with open("backend_audit.log", "w", encoding="utf-8") as f:
            f.write(f"--- FONT HARMONIZATION AUDIT: {request.pdf_name} ---\n")

        # 2. Group modifications by page
        mods_by_page = {}
        for mod in request.modifications:
            if mod.pageIndex not in mods_by_page:
                mods_by_page[mod.pageIndex] = []
            mods_by_page[mod.pageIndex].append(mod)

        # 3. Process EVERY PAGE for Global Font Harmonization
        for p_idx in range(len(doc)):
            page = doc[p_idx]
            text_dict = page.get_text("dict")
            links = page.get_links()
            mods = mods_by_page.get(p_idx, [])
            applied_mod_ids = set()

            # Pass 1: Redact all text lines and match to modifications
            render_tasks = []
            for block in text_dict.get("blocks", []):
                if block["type"] == 0: # Text
                    for line in block["lines"]:
                        # A. Mark for redaction
                        page.add_redact_annot(line["bbox"], fill=(1,1,1))
                        
                        # B. Identify if this line is being modified
                        target_mod = None
                        for s_orig in line["spans"]:
                            ox, oy = s_orig["origin"][0] * PT_TO_PX, s_orig["origin"][1] * PT_TO_PX
                            for m in mods:
                                if m.type != "pdf_path" and m.id not in applied_mod_ids:
                                    if abs(m.origin[0] - ox) < 1.5 and abs(m.origin[1] - oy) < 1.5:
                                        target_mod = m
                                        applied_mod_ids.add(m.id)
                                        break
                            if target_mod: break
                        
                        render_tasks.append((line, target_mod))
            
            # Commit redactions to empty the page of old text
            page.apply_redactions()

            # Pass 2: Re-render with Google Fonts
            for line, target_mod in render_tasks:
                if target_mod:
                    # Use edited data from frontend
                    line_spans = target_mod.spans if (target_mod.spans and len(target_mod.spans) > 0) else [
                        TextSpan(
                            text=target_mod.text or "",
                            font=target_mod.style.get("font"),
                            size=target_mod.style.get("size"),
                            color=target_mod.style.get("color"),
                            is_bold=target_mod.style.get("is_bold"),
                            is_italic=target_mod.style.get("is_italic"),
                            font_variant=target_mod.style.get("font_variant", "normal")
                        )
                    ]
                    curr_x, curr_y = [coord / PT_TO_PX for coord in target_mod.origin]
                    uri = target_mod.uri
                    link_bbox = fitz.Rect(target_mod.bbox) / PT_TO_PX
                else:
                    # Construct Google Font task from original content
                    line_spans = []
                    uri = None
                    for s_orig in line["spans"]:
                        # Associate link
                        if not uri:
                            centroid_x = (s_orig["bbox"][0] + s_orig["bbox"][2]) / 2
                            centroid_y = (s_orig["bbox"][1] + s_orig["bbox"][3]) / 2
                            for lnk in links:
                                if "from" in lnk and "uri" in lnk:
                                    r = lnk["from"]
                                    if r.x0 <= centroid_x <= r.x1 and r.y0 <= centroid_y <= r.y1:
                                        uri = lnk["uri"]
                                        break

                        f_name = s_orig["font"].lower()
                        line_spans.append(TextSpan(
                            text=s_orig["text"],
                            font=s_orig["font"],
                            google_font=font_manager.get_folder_name(s_orig["font"]).replace("_", " "),
                            size=s_orig["size"] * PT_TO_PX, # Store as PX for rendering loop
                            color=parse_color(s_orig.get("color")),
                            is_bold=bool(s_orig["flags"] & 16),
                            is_italic=bool(s_orig["flags"] & 2),
                            font_variant="small-caps" if any(x in f_name for x in ["csc", "smallcaps", "caps"]) else "normal"
                        ))
                    curr_x, curr_y = line["spans"][0]["origin"]
                    link_bbox = fitz.Rect(line["bbox"])

                # --- BACKEND SMART CALIBRATION ENGINE (PER-LINE) ---
                OPTICAL_HEIGHT_FACTOR = 0.96
                total_measured_width = 0
                processed_render_spans = []

                # Pass A: Pre-measure all spans using their actual fonts to get the total line width
                for span in line_spans:
                    s_text = span.text
                    for sym, rep in SYMBOL_MAP.items():
                        s_text = s_text.replace(sym, rep)
                    
                    s_is_bold = span.is_bold
                    s_is_italic = span.is_italic
                    s_font_in = (span.font or "inter").lower()
                    
                    frontend_google_font = getattr(span, 'google_font', None)
                    if not frontend_google_font and target_mod:
                        frontend_google_font = target_mod.style.get('googleFont')
                    
                    search_font = frontend_google_font if frontend_google_font else s_font_in
                    font_path, font_key = font_manager.get_font_path(search_font, s_is_bold, s_is_italic, original_context=s_font_in)
                    
                    if font_path:
                        temp_font = fitz.Font(fontfile=font_path)
                        # CRITICAL: Measure with the Optical Height Factor included!
                        # This ensures the width we calculate matches the final rendered width.
                        meas_size = (span.size or 10) / PT_TO_PX * OPTICAL_HEIGHT_FACTOR
                        
                        if span.font_variant == "small-caps":
                            s_measured_width = 0
                            for char in s_text:
                                is_lower = char.islower() and char.isalpha()
                                c_size = meas_size * (0.75 if is_lower else 1.0)
                                c_char = char.upper() if is_lower else char
                                s_measured_width += temp_font.text_length(c_char, fontsize=c_size)
                        else:
                            s_measured_width = temp_font.text_length(s_text, fontsize=meas_size)
                            
                        total_measured_width += s_measured_width
                        
                        processed_render_spans.append({
                            "text": s_text,
                            "font_path": font_path,
                            "font_key": font_key,
                            "size": (span.size or 10) / PT_TO_PX,
                            "variant": span.font_variant,
                            "color": span.color or [0, 0, 0]
                        })

                # Pass B: Calculate line-wide fitting ratio
                target_width = (line["bbox"][2] - line["bbox"][0])
                fitting_ratio = 1.0
                
                # TITLE GUARD: If it's a short line (likely a header like "Experience"), 
                # we NEVER shrink it. We'd rather let it overflow than become tiny.
                is_short_line = total_measured_width < 100 or len(processed_render_spans) == 1 and len(processed_render_spans[0]["text"].split()) < 4
                
                if not target_mod and not is_short_line and total_measured_width > 0:
                    # Snug Fit: 99% - 100.5% Thresholds
                    if total_measured_width > target_width * 1.005 or total_measured_width < target_width * 0.99:
                        fitting_ratio = target_width / total_measured_width
                
                # BBOX EXPANSION (Edited Lines): Allow 4-char buffer before shrinking
                if target_mod and total_measured_width > 0:
                    avg_char_w = total_measured_width / len(" ".join([s["text"] for s in processed_render_spans]) or "1")
                    allowable_w = target_width + (avg_char_w * 4)
                    if total_measured_width > allowable_w:
                        fitting_ratio = allowable_w / total_measured_width
                    else:
                        fitting_ratio = 1.0

                safe_ratio = max(0.65, min(1.25, fitting_ratio))
                
                with open("backend_audit.log", "a", encoding="utf-8") as audit_log:
                    mod_status = "EDITED" if target_mod else "ORIGINAL"
                    guard_status = "TITLE_GUARD" if is_short_line else "CALIBRATED"
                    match_pct = (total_measured_width / target_width * 100) if target_width > 0 else 0
                    audit_log.write(f"[CALIBRATE] Line: {line['bbox'][0]:.1f},{line['bbox'][1]:.1f} | Status: {mod_status}({guard_status}) | Match: {match_pct:.1f}% | Ratio: {safe_ratio:.3f}\n")

                # Pass C: Render calibrated spans
                for r_span in processed_render_spans:
                    try:
                        calibrated_size = r_span["size"] * OPTICAL_HEIGHT_FACTOR * safe_ratio
                        internal_name = f"f-{r_span['font_key'].lower()}"
                        
                        if r_span["variant"] == "small-caps":
                            for char in r_span["text"]:
                                is_lower_alpha = char.islower() and char.isalpha()
                                c_size = calibrated_size * (0.75 if is_lower_alpha else 1.0)
                                c_char = char.upper() if is_lower_alpha else char
                                page.insert_text((curr_x, curr_y), c_char, fontsize=c_size, color=tuple(r_span["color"]), fontfile=r_span["font_path"], fontname=internal_name)
                                curr_x += fitz.Font(fontfile=r_span["font_path"]).text_length(c_char, fontsize=c_size)
                        else:
                            page.insert_text((curr_x, curr_y), r_span["text"], fontsize=calibrated_size, color=tuple(r_span["color"]), fontfile=r_span["font_path"], fontname=internal_name)
                            curr_x += fitz.Font(fontfile=r_span["font_path"]).text_length(r_span["text"], fontsize=calibrated_size)
                    except Exception as e:
                        print(f"[BACKEND ERROR] Rendering span: {e}")
                
                if uri:
                    page.insert_link({"from": link_bbox, "uri": uri, "kind": fitz.LINK_URI})
                
                # --- DEBUG: Red Bottom Border in PDF ---
                lx0, ly0, lx1, ly1 = line["bbox"]
                page.draw_line(fitz.Point(lx0, ly1), fitz.Point(lx1, ly1), color=(1, 0, 0), width=0.5)

            # B. Handle Remaining Mods (New text or vector drawings)
            for m in mods:
                if m.id in applied_mod_ids: continue
                
                if m.type == "pdf_path" and m.path_data:
                    shape = page.new_shape()
                    for p in m.path_data:
                        if "fill_color" in p:
                            fc = p["fill_color"]
                            shape.draw_rect(fitz.Rect(p["pts"][0]) / PT_TO_PX)
                            shape.finish(fill=tuple(fc), fill_opacity=p.get("fill_opacity", 1.0), stroke_opacity=0)
                        if "stroke_color" in p:
                            sc = p["stroke_color"]
                            for segment in p["segments"]:
                                if segment["type"] == "m":
                                    shape.move_to(fitz.Point(segment["x"], segment["y"]) / PT_TO_PX)
                                elif segment["type"] == "l":
                                    pts = segment["pts"]
                                    if len(pts) >= 2:
                                        shape.line_to(fitz.Point(pts[1]) / PT_TO_PX)
                            shape.finish(color=tuple(sc), width=p.get("stroke_width", 1.0)/PT_TO_PX, stroke_opacity=p.get("stroke_opacity", 1.0))
                    shape.commit()
                
                elif m.text:
                    curr_x, curr_y = [coord / PT_TO_PX for coord in m.origin]
                    s_font_in = (m.style.get("font") or "inter").lower()
                    s_is_bold = m.style.get("is_bold")
                    s_is_italic = m.style.get("is_italic")
                    s_size = (m.style.get("size") or 10) / PT_TO_PX
                    s_color = m.style.get("color") or [0, 0, 0]

                    font_path, font_key = font_manager.get_font_path(s_font_in, s_is_bold, s_is_italic)
                    if font_path:
                        try:
                            internal_name = f"f-{font_key.lower()}"
                            page.insert_text((curr_x, curr_y), m.text, fontsize=s_size, color=tuple(s_color), fontfile=font_path, fontname=internal_name)
                        except: pass

        # 4. Save to memory and return
        out_pdf_buffer = io.BytesIO()
        doc.save(out_pdf_buffer)
        doc.close()
        
        out_pdf_b64 = base64.b64encode(out_pdf_buffer.getvalue()).decode('utf-8')
        
        return {
            "success": True,
            "pdf_base64": out_pdf_b64,
            "filename": f"edited_{request.pdf_name}"
        }

    except Exception as e:
        traceback.print_exc()
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    # Use reload=True for auto-restart on code changes
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
