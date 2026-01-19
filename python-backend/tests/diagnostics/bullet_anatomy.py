import fitz
import json

def bullet_anatomy(pdf_path):
    doc = fitz.open(pdf_path)
    page = doc[0]
    PT_TO_PX = 96 / 72.0
    text_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
    
    print(f"--- RUTHLESS ANATOMY: {pdf_path} ---")
    
    found_bullets = 0
    for block in text_dict["blocks"]:
        if block["type"] == 0:
            for line in block["lines"]:
                spans = line["spans"]
                if not spans: continue
                
                # Check if this line starts with a bullet
                first_text = spans[0]["text"].strip()
                if not first_text: continue
                
                # Using a broad check for anything that looks like a marker
                is_bullet_line = first_text[0] in "•·▪▫◦‣⁃■□*»>−∗–"
                
                if is_bullet_line:
                    found_bullets += 1
                    print(f"\n[BULLET LINE {found_bullets}]")
                    for i, span in enumerate(spans):
                        bbox = [c * PT_TO_PX for c in span["bbox"]]
                        origin = [c * PT_TO_PX for c in span["origin"]]
                        print(f"  Span {i}: '{span['text']}'")
                        print(f"    - Origin:  {origin}")
                        print(f"    - BBox:    [{bbox[0]:.3f}, {bbox[1]:.3f}, {bbox[2]:.3f}, {bbox[3]:.3f}]")
                        print(f"    - Width:   {bbox[2]-bbox[0]:.3f}")
                        print(f"    - Size:    {span['size'] * PT_TO_PX:.3f}")
                        print(f"    - Font:    {span['font']}")
                        print(f"    - Flags:   {span['flags']}")
                    
                    if i > 0:
                        # Calculate visual gap between Span 0 and Span 1
                        prev_x1 = spans[0]["bbox"][2] * PT_TO_PX
                        next_x0 = spans[i]["bbox"][0] * PT_TO_PX
                        origin_gap = (spans[i]["origin"][0] - spans[0]["origin"][0]) * PT_TO_PX
                        visual_gap = next_x0 - prev_x1
                        print(f"  ==> ORIGIN ADVANCE: {origin_gap:.3f}")
                        print(f"  ==> VISUAL GAP:     {visual_gap:.3f}")

                    if found_bullets >= 3: return

if __name__ == "__main__":
    bullet_anatomy("python-backend/nable_python.pdf")
