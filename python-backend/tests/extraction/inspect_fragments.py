import json
import fitz
from layout_engine import normalize_layout

pdf_path = "python-backend/nable_python.pdf"
doc = fitz.open(pdf_path)
page = doc[0]

PT_TO_PX = 96 / 72.0
text_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)

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
                    "bbox": bbox_px,
                    "size": span["size"] * PT_TO_PX,
                    "font": span["font"],
                    "flags": span["flags"],
                    "origin": origin_px,
                    "x": origin_px[0],
                    "y": origin_px[1],
                    "width": bbox_px[2] - bbox_px[0],
                    "height": bbox_px[3] - bbox_px[1]
                }
                raw_items.append(item)

normalized_data = normalize_layout(raw_items)

# Inspect all lines with fragments
print("--- Clustered Normalization Check ---")
for block in normalized_data["blocks"]:
    for line in block["lines"]:
        pass # The logic is in the layout_engine.py prints
