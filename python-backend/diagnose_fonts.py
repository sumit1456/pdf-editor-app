import fitz
import os
import base64

def diagnose_fonts():
    # Anchor paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    fonts_dir = os.path.join(base_dir, "fonts")
    
    test_fonts = [
        ("Inter", "Inter-Regular.ttf"),
        ("Montserrat", "Montserrat-Regular.ttf"),
        ("Oswald", "Oswald-Regular.ttf"),
        ("Roboto", "Roboto-Regular.ttf")
    ]
    
    doc = fitz.open()
    page = doc.new_page()
    
    report = ["--- FONT DIAGNOSTIC REPORT ---"]
    
    for family, filename in test_fonts:
        path = os.path.join(fonts_dir, family, filename)
        if not os.path.exists(path):
            report.append(f"[MISSING] {family}: {path}")
            continue
            
        try:
            # Attempt to register and use the font
            # We use a unique name to avoid collisions
            font_key = f"test-{family.lower()}"
            page.insert_text((50, 50), "test", fontfile=path, fontname=font_key, fontsize=12)
            report.append(f"[SUCCESS] {family}: Loaded and injected successfully.")
        except Exception as e:
            report.append(f"[FAILED] {family}: PyMuPDF Error: {str(e)}")
            
    doc.close()
    
    with open("font_diagnostic_log.txt", "w") as f:
        f.write("\n".join(report))
    print("Diagnostic complete. Read font_diagnostic_log.txt")

if __name__ == "__main__":
    diagnose_fonts()
