
import fitz
import sys
import os
import json

# Adjust path to import backend modules
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from layout_engine import normalize_layout

def diagnose_structure(pdf_path):
    if not os.path.exists(pdf_path):
        print(f"Error: {pdf_path} does not exist")
        return

    doc = fitz.open(pdf_path)
    page = doc[0] # Analyze first page
    
    PT_TO_PX = 1.333333
    
    items = []
    text_page = page.get_text("dict")
    
    # Minimal extraction logic mirroring server.py
    for block in text_page["blocks"]:
        if block["type"] == 0:
            for line in block["lines"]:
                for span in line["spans"]:
                    bbox_px = [c * PT_TO_PX for c in span["bbox"]]
                    origin_px = [c * PT_TO_PX for c in span["origin"]]
                    
                    items.append({
                        "type": "text",
                        "content": span["text"],
                        "origin": origin_px,
                        "x": origin_px[0],
                        "y": origin_px[1],
                        "bbox": bbox_px,
                        "width": bbox_px[2] - bbox_px[0],
                        "height": bbox_px[3] - bbox_px[1],
                        "size": span["size"] * PT_TO_PX,
                        "font": span["font"],
                        "flags": span["flags"]
                    })
    
    print(f"Extracted {len(items)} items from PDF.")
    
    # Capture state BEFORE normalization
    pre_coords = {i: (item["origin"][0], item["origin"][1]) for i, item in enumerate(items)}
    
    # Run Normalization
    normalized = normalize_layout(items)
    
    print(f"\n--- NORMALIZATION AUDIT ---")
    blocks = normalized["blocks"]
    
    moved_count = 0
    total_checked = 0
    
    for blk in blocks:
        for line in blk["lines"]:
            for item in line["items"]:
                # We can't easily match back to original index unless we added IDs.
                # But we can check if 'origin' in the item is different from what we'd expect 
                # if we tracked it.
                # Actually, normalize_layout modifies items IN PLACE unless deep copied.
                pass

    # Since normalize_layout modifies in-place, let's re-scan 'items' list
    for i, item in enumerate(items):
        old_x, old_y = pre_coords[i]
        new_x, new_y = item["origin"][0], item["origin"][1]
        
        if abs(new_x - old_x) > 0.1 or abs(new_y - old_y) > 0.1:
            moved_count += 1
            if moved_count <= 10:
                print(f"MOVED: '{item['content'].strip()[:20]}' | ({old_x:.1f}, {old_y:.1f}) -> ({new_x:.1f}, {new_y:.1f}) | Diff: ({new_x-old_x:.1f}, {new_y-old_y:.1f})")
    
    print(f"\nTotal Moved Items: {moved_count} / {len(items)}")
    if moved_count > len(items) * 0.1:
        print("CONCLUSION: Significant structural changes detected. layout_engine.py is aggressively snapping coordinates.")
    else:
        print("CONCLUSION: Minimal structural changes.")

if __name__ == "__main__":
    target = os.path.join(os.path.dirname(__file__), "samples", "nable_python.pdf")
    diagnose_structure(target)
