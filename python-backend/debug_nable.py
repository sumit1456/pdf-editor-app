import fitz
import json
import os

pdf_path = "nable_python.pdf"
doc = fitz.open(pdf_path)

output = []
for page in doc:
    text_dict = page.get_text("dict")
    output.append(text_dict)

with open("raw_dump_nable.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

# Simple text dump for quick reading
with open("text_dump_nable.txt", "w", encoding="utf-8") as f:
    for page in doc:
        f.write(page.get_text("text"))

print("Dumped nable_python.pdf to raw_dump_nable.json and text_dump_nable.txt")
