import fitz
import os

pdf_path = r"c:\Users\SUMIT\Downloads\pdf-editor-app\python-backend\tests\scripts\font_styles_test_result.pdf"
output_log = r"c:\Users\SUMIT\Downloads\pdf-editor-app\python-backend\tests\scripts\inspect_result.txt"

with open(output_log, "w", encoding="utf-8") as out:
    if os.path.exists(pdf_path):
        doc = fitz.open(pdf_path)
        out.write(f"PDF metadata: {doc.metadata}\n\n")
        
        for pno, page in enumerate(doc):
            out.write(f"--- PAGE {pno} ---\n")
            text_dict = page.get_text("dict")
            for b_idx, block in enumerate(text_dict["blocks"]):
                if block["type"] == 0:
                    for l_idx, line in enumerate(block["lines"]):
                        line_text = "".join(span["text"] for span in line["spans"])
                        out.write(f"Block {b_idx} Line {l_idx}: {line_text}\n")
                        for span in line["spans"]:
                            out.write(f"  - Span: '{span['text']}' Font: {span['font']} Size: {span['size']:.2f}\n")
        doc.close()
        print(f"Extraction complete. Log saved to {output_log}")
    else:
        print(f"File not found: {pdf_path}")
