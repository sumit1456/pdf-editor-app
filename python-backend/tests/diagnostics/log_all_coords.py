import fitz
import os

pdf_path = r"c:\Users\SUMIT\Downloads\pdf-editor-app\python-backend\tests\scripts\font_styles_test.pdf"

if os.path.exists(pdf_path):
    doc = fitz.open(pdf_path)
    page = doc[0]
    text_dict = page.get_text("dict")
    
    with open("full_orig_coords.txt", "w") as f:
        for b in text_dict["blocks"]:
            if b["type"] == 0:
                for l in b["lines"]:
                    c = "".join(s["text"] for s in l["spans"])
                    f.write(f"[{round(l['bbox'][1], 2)}] '{c}'\n")
    doc.close()
    print("Coordinates saved.")
