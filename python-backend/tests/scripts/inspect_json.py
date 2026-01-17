import fitz
import json
import base64
import os

PT_TO_PX = 1.3333333333

def parse_color(color_int):
    if color_int is None:
        return [0, 0, 0]
    r = (color_int >> 16) & 255
    g = (color_int >> 8) & 255
    b = color_int & 255
    return [r / 255.0, g / 255.0, b / 255.0]

def inspect_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    page = doc[0]
    text_page = page.get_text("dict")
    
    results = []
    
    for block in text_page.get("blocks", []):
        if block["type"] == 0:
            for line in block["lines"]:
                line_content = ""
                line_spans = []
                for span in line["spans"]:
                    font_name = span["font"].lower()
                    font_variant = "normal"
                    if any(x in font_name for x in ["csc", "smallcaps", "small-caps"]):
                        font_variant = "small-caps"
                    
                    is_bold = bool(span["flags"] & 16)
                    if any(x in font_name for x in ["bold", "black", "heavy", "700", "800", "900"]):
                        is_bold = True
                        
                    content = span["text"]
                    if font_variant == "small-caps" and content.isupper():
                        content = content.title()
                        
                    line_content += span["text"]
                    line_spans.append({
                        "text": content,
                        "font": span["font"],
                        "size": span["size"] * PT_TO_PX,
                        "is_bold": is_bold,
                        "font_variant": font_variant,
                        "color": parse_color(span.get("color"))
                    })
                
                results.append({
                    "raw_line": line_content,
                    "processed_spans": line_spans
                })
                
    # Targeted search for the name
    name_lines = [r for r in results if "yagyik" in r["raw_line"].lower()]
    print(json.dumps(name_lines, indent=2))
    doc.close()

if __name__ == "__main__":
    inspect_pdf(r"c:\Users\SUMIT\Downloads\pdf-editor-app\python-backend\tests\scripts\nable_python.pdf")
