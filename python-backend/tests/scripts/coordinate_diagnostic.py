import fitz
import json
import os
from layout_engine import normalize_layout

def run_comparison(items, normalized_data, output_json="coordinate_comparison.json"):
    """
    Compares original items with normalized layout results and saves to JSON.
    Assumes items have 'original_x' and 'original_y' properties.
    """
    normalized_blocks = normalized_data.get("blocks", [])
    comparison_report = []
    
    for block in normalized_blocks:
        for line in block.get("lines", []):
            if not line["items"]: continue
            
            first_item = line["items"][0]
            # Use original values saved during server-side extraction
            orig_x = first_item.get("original_x", line["x0"])
            orig_y = first_item.get("original_y", line["y"])
            
            comparison_report.append({
                "line_content": line["content"].strip()[:50],
                "block_type": block["type"],
                "extracted": {
                    "x0": orig_x,
                    "y": orig_y
                },
                "rendered": {
                    "x0": line["x0"],
                    "y": line["y"]
                },
                "delta": {
                    "x": line["x0"] - orig_x,
                    "y": line["y"] - orig_y
                }
            })

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump({
            "total_lines": len(comparison_report),
            "report": comparison_report
        }, f, indent=2)

    print(f"Runtime coordinate report updated: {output_json}")

def generate_coordinate_report(pdf_path, output_json):
    if not os.path.exists(pdf_path):
        print(f"Error: PDF not found at {pdf_path}")
        return

    doc = fitz.open(pdf_path)
    page = doc[0]
    
    PT_TO_PX = 96 / 72.0
    text_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
    links = page.get_links()
    
    raw_items = []
    for block in text_dict["blocks"]:
        if block["type"] == 0:
            for line in block["lines"]:
                for span in line["spans"]:
                    bbox_px = [c * PT_TO_PX for c in span["bbox"]]
                    origin_px = [c * PT_TO_PX for c in span["origin"]]
                    
                    item = {
                        "type": "text",
                        "content": span["text"],
                        "original_x": origin_px[0],
                        "original_y": origin_px[1],
                        "bbox": bbox_px,
                        "size": span["size"] * PT_TO_PX,
                        "font": span["font"],
                        "origin": origin_px,
                        "x": origin_px[0],
                        "y": origin_px[1],
                        "width": bbox_px[2] - bbox_px[0],
                        "height": bbox_px[3] - bbox_px[1]
                    }
                    raw_items.append(item)

    # Process
    normalized_data = normalize_layout(raw_items)
    run_comparison(raw_items, normalized_data, output_json)

if __name__ == "__main__":
    generate_coordinate_report("nable_python.pdf", "coordinate_comparison.json")
