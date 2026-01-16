from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import fitz # PyMuPDF
import uvicorn
import base64
import traceback
import os
import zipfile
import io
import json
from layout_engine import normalize_layout
from coordinate_diagnostic import run_comparison

app = FastAPI()


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
        return [r/255.0, g/255.0, b/255.0]
    
    # Drawings give tuple (0-1 floats)
    if isinstance(color_in, (list, tuple)):
        return list(color_in)
        
    return [0.0, 0.0, 0.0]

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
                                
                                font_name = span["font"].lower()
                                if any(x in font_name for x in ["bold", "black", "heavy", "700", "800", "900"]):
                                    is_bold = True
                                if any(x in font_name for x in ["italic", "oblique"]):
                                    is_italic = True

                                # DETECT SMALL-CAPS
                                font_variant = "normal"
                                if any(x in font_name for x in ["csc", "smallcaps", "small-caps"]):
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
                                
                                text_item = {
                                    "id": str(uuid.uuid4()), 
                                    "line_id": line_id,
                                    "type": "text",
                                    "content": span["text"],
                                    "origin": origin_px,
                                    "x": origin_px[0],
                                    "y": origin_px[1],
                                    "bbox": bbox_px,
                                    "width": bbox_px[2] - bbox_px[0],
                                    "height": bbox_px[3] - bbox_px[1],
                                    "size": size_px,
                                    "font": span["font"],
                                    "font_variant": font_variant,
                                    "color": parse_color(span.get("color")), 
                                    "is_bold": is_bold,
                                    "is_italic": is_italic,
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
            try:
                run_comparison(items, layout_data)
            except Exception as diag_e:
                print(f"[Diagnostic Error] Failed to generate coordinate report: {diag_e}")

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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
