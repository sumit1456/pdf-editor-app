import fitz
doc = fitz.open("font_styles_test.pdf")
for page in doc:
    print(page.get_text())
doc.close()
