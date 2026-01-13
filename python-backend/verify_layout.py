import fitz
import json
import os
import sys

# Add current dir to path to import layout_engine
sys.path.append(os.path.dirname(__file__))
from layout_engine import normalize_layout

def verify_fix(pdf_path):
    print(f"--- Verifying Layout Fix for {pdf_path} ---")
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    # 1. Get raw text items
    raw_items = []
    PT_TO_PX = 1.333333
    text_page = page.get_text("dict")
    for block in text_page["blocks"]:
        if block["type"] == 0:
            for line in block["lines"]:
                for span in line["spans"]:
                    raw_items.append({
                        "type": "text",
                        "content": span["text"],
                        "origin": [c * PT_TO_PX for c in span["origin"]],
                        "bbox": [c * PT_TO_PX for c in span["bbox"]],
                        "height": (span["bbox"][3] - span["bbox"][1]) * PT_TO_PX,
                        "size": span["size"] * PT_TO_PX,
                        "font": span["font"]
                    })
    
    # 2. Duplicate raw items for comparison (deep copy not needed as we only change lists)
    items_to_normalize = json.loads(json.dumps(raw_items))
    normalized_items = normalize_layout(items_to_normalize)
    
    # 3. Find bullet-heavy sections and check alignment
    # Check lines containing bullets and the lines immediately following them
    print("\nScanning for drift resolution...")
    
    text_normalized = [it for it in normalized_items if it["type"] == "text"]
    
    # Group raw by rounded Y for drift check
    raw_lines = {}
    for it in raw_items:
        y = round(it["origin"][1])
        if y not in raw_lines: raw_lines[y] = []
        raw_lines[y].append(it)
        
    norm_lines = {}
    for it in text_normalized:
        y = round(it["origin"][1])
        if y not in norm_lines: norm_lines[y] = []
        norm_lines[y].append(it)
        
    sorted_ys = sorted(raw_lines.keys())
    for i, y in enumerate(sorted_ys):
        raw_content = "".join(it["content"] for it in raw_lines[y])
        norm_content = "".join(it["content"] for it in norm_lines[y])
        
        raw_x = raw_lines[y][0]["origin"][0]
        norm_x = norm_lines[y][0]["origin"][0]
        
        # Check if this line was previously drifting (e.g. raw_x was ~79 while others were ~72)
        if abs(raw_x - norm_x) > 0.5:
            print(f"FIXED DRIFT at Y={y}:")
            print(f"  Content: {raw_content[:50]}...")
            print(f"  Before X: {raw_x:.2f}")
            print(f"  After X:  {norm_x:.2f} (Shift: {norm_x - raw_x:.2f}px)")

    print("\nVerification Complete.")

if __name__ == "__main__":
    target = r"c:\Users\SUMIT\Downloads\pdf-editor-app\python-backend\nable_python.pdf"
    if os.path.exists(target):
        verify_fix(target)
    else:
        print(f"Error: {target} not found.")
