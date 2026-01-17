import fitz
import os

fonts_dir = r"c:\Users\SUMIT\Downloads\pdf-editor-app\python-backend\fonts"
font_path = os.path.join(fonts_dir, "Inter", "Inter-Regular.ttf")

if os.path.exists(font_path):
    font = fitz.Font(fontfile=font_path)
    text = "!@#$%^&*()"
    print(f"Font: {font.name}")
    for char in text:
        length = font.text_length(char, fontsize=12)
        print(f"Char: '{char}' | Length: {length}")
else:
    print(f"Font not found: {font_path}")
