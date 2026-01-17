import fitz
import os

pdf_path = r"c:\Users\SUMIT\Downloads\pdf-editor-app\python-backend\tests\scripts\font_styles_test_result.pdf"

if os.path.exists(pdf_path):
    doc = fitz.open(pdf_path)
    page = doc[0]
    text_dict = page.get_text("dict")
    
    print(f"=== {os.path.basename(pdf_path)} EDITED COORDINATES ===")
    for block in text_dict["blocks"]:
        if block["type"] == 0:
            for line in block["lines"]:
                content = "".join(s["text"] for s in line["spans"])
                origin = line["spans"][0]["origin"]
                print(f"Text: '{content[:30]}' | Origin: {[round(c, 2) for c in origin]}")
    doc.close()
else:
    print("File not found.")
