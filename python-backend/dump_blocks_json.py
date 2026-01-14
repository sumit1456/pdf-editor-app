import json
import fitz
import base64
import uuid
from layout_engine import normalize_layout

def dump_sample_blocks():
    doc = fitz.open('nable_python.pdf')
    page = doc[0]
    PT_TO_PX = 1.333333
    
    items = []
    text_page = page.get_text("dict")
    for block in text_page["blocks"]:
        if block["type"] == 0:
            for line in block["lines"]:
                line_id = str(uuid.uuid4())
                for span in line["spans"]:
                    bbox_px = [coord * PT_TO_PX for coord in span["bbox"]]
                    origin_px = [coord * PT_TO_PX for coord in span["origin"]]
                    size_px = span["size"] * PT_TO_PX
                    items.append({
                        "id": str(uuid.uuid4()),
                        "line_id": line_id,
                        "type": "text",
                        "content": span["text"],
                        "origin": origin_px,
                        "bbox": bbox_px,
                        "size": size_px,
                        "height": bbox_px[3] - bbox_px[1],
                        "font": span["font"]
                    })
    
    # Run the new Block Tree logic
    result = normalize_layout(items)
    
    with open('nable_python_blocks.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)
    
    print("Successfully created 'nable_python_blocks.json'!")

if __name__ == "__main__":
    dump_sample_blocks()
