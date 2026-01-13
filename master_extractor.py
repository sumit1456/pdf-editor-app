import fitz
import json
import base64
import os
from python_backend.layout_engine import normalize_layout

def parse_color(c):
    if c is None: return [0, 0, 0]
    if isinstance(c, int):
        return [((c >> 16) & 255)/255.0, ((c >> 8) & 255)/255.0, (c & 255)/255.0]
    return list(c)

def run_master_extraction(pdf_path, output_json):
    doc = fitz.open(pdf_path)
    pages_data = []
    all_fonts = {}

    for pno, page in enumerate(doc):
        items = []
        
        # 1. Text Analysis (Dict mode for spans)
        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            if block["type"] == 0:
                for line in block["lines"]:
                    for span in line["spans"]:
                        # Capture every detail
                        font_name = span["font"]
                        if font_name not in all_fonts:
                            # Try to extract binary
                            try:
                                # We need xref for extraction
                                for f in page.get_fonts(full=True):
                                    if f[3] == font_name:
                                        xref = f[0]
                                        binary = doc.extract_font(xref)[3]
                                        if binary:
                                            all_fonts[font_name] = base64.b64encode(binary).decode('utf-8')
                                        break
                            except:
                                pass

                        items.append({
                            "type": "text",
                            "content": span["text"],
                            "origin": span["origin"],
                            "bbox": span["bbox"],
                            "size": span["size"],
                            "font": font_name,
                            "color": parse_color(span.get("color")),
                            "flags": span["flags"],
                            "matrix": [1, 0, 0, 1, 0, 0]
                        })

        # 2. Vector Graphics
        drawings = page.get_drawings()
        for draw in drawings:
            segments = []
            for item in draw["items"]:
                kind = item[0]
                if kind == "l":
                    segments.append({"type": "m", "x": item[1].x, "y": item[1].y})
                    segments.append({"type": "l", "pts": [[item[1].x, item[1].y], [item[2].x, item[2].y]]})
                elif kind == "c":
                    segments.append({"type": "m", "x": item[1].x, "y": item[1].y})
                    segments.append({"type": "c", "pts": [[item[1].x, item[1].y], [item[2].x, item[2].y], [item[3].x, item[3].y], [item[4].x, item[4].y]]})
                elif kind == "re":
                    r = item[1]
                    segments.append({"type": "re", "pts": [[r.x0, r.y0, r.width, r.height]]})
            
            if segments:
                items.append({
                    "type": "path",
                    "segments": segments,
                    "fill_color": parse_color(draw.get("fill")),
                    "stroke_color": parse_color(draw.get("color")),
                    "stroke_width": draw.get("width", 1),
                    "opacity": draw.get("fill_opacity", 1.0)
                })

        # 3. Images
        image_list = page.get_images(full=True)
        for img_info in image_list:
            xref = img_info[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            ext = base_image["ext"]
            # To get coordinates, we need to find where it's used
            # This is complex in PyMuPDF, skipping for this reference as we focus on vectors/text
            pass

        # 4. Layout Normalization
        items = normalize_layout(items)

        pages_data.append({
            "page": pno + 1,
            "width": page.rect.width,
            "height": page.rect.height,
            "items": items
        })

    result = {
        "metadata": {
            "source": pdf_path,
            "engine": "PyMuPDF High-Fidelity Master",
            "total_pages": len(doc)
        },
        "pages": pages_data,
        "fonts": [{"name": k, "data": v} for k, v in all_fonts.items()],
        "fonts_key": str(len(all_fonts))
    }

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    
    print(f"Master Extraction Complete: {output_json}")

if __name__ == "__main__":
    target_pdf = r"c:\Users\SUMIT\Downloads\pdf-editor-app\src\pages\test\AndrewResumeWorkshop.pdf"
    output_file = "master_reference.json"
    if os.path.exists(target_pdf):
        run_master_extraction(target_pdf, output_file)
    else:
        print(f"Error: File not found {target_pdf}")
