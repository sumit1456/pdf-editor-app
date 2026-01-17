import base64
import json
import os
import urllib.request
import fitz

# ================= CONFIG =================
PDF_FILE = "font_styles_test.pdf"
URL = "http://localhost:8000/save-pdf"
PX = 1.333333 # Internal Scale

# ==========================================

def test_edit_font_styles_pdf():
    if not os.path.exists(PDF_FILE):
        print(f"❌ {PDF_FILE} not found in current folder.")
        return

    print("=== DYNAMIC FIDELITY TEST ===")
    
    # 1. AUTO-DISCOVER COORDINATES (to avoid manual drift)
    doc = fitz.open(PDF_FILE)
    page = doc[0]
    blocks = page.get_text("dict")["blocks"]
    
    target_lines = {
        "Font Styles Test PDF": None,
        "Helvetica:": None,
        "Times-Roman:": None,
        "Courier:": None
    }
    
    for b in blocks:
        if b["type"] == 0:
            for l in b["lines"]:
                content = "".join(s["text"] for s in l["spans"])
                for key in target_lines.keys():
                    if key in content and target_lines[key] is None:
                        # Store PX converted coordinates
                        target_lines[key] = {
                            "bbox": [c * PX for c in l["bbox"]],
                            "origin": [c * PX for c in l["spans"][0]["origin"]],
                            "font": l["spans"][0]["font"]
                        }
    doc.close()

    with open(PDF_FILE, "rb") as f:
        pdf_base64 = base64.b64encode(f.read()).decode("utf-8")

    modifications = []

    # 1. Edit Title (Using its REAL coordinates)
    t = target_lines["Font Styles Test PDF"]
    if t:
        modifications.append({
            "id": "edit-title-1",
            "pageIndex": 0,
            "text": "Fidelity Verified: Perfect Alignment ✅",
            "bbox": t["bbox"],
            "origin": t["origin"],
            "style": {
                "size": 22 * PX,
                "is_bold": True,
                "font": "inter",
                "color": [0, 0, 0],
                "font_variant": "normal"
            }
        })

    # 2. Edit Samples
    replacements = [
        ("Helvetica:", "inter"),
        ("Times-Roman:", "source serif 4"),
        ("Courier:", "jetbrains mono")
    ]
    
    for key, font in replacements:
        t = target_lines.get(key)
        if t:
            modifications.append({
                "id": f"edit-{key}",
                "pageIndex": 0,
                "text": f"REPLACED: {key} looks better now.",
                "bbox": t["bbox"],
                "origin": t["origin"],
                "style": {
                    "size": 12 * PX,
                    "is_bold": False,
                    "font": font,
                    "color": [0, 0, 0],
                    "font_variant": "normal"
                }
            })

    payload = {
        "pdf_name": "fidelity_test_result.pdf",
        "pdf_base64": pdf_base64,
        "modifications": modifications
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=data, headers={'Content-Type': 'application/json'})

    print("Calling backend to verify alignment...")

    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
            if result.get("success"):
                out = "font_styles_test_result.pdf"
                with open(out, "wb") as f:
                    f.write(base64.b64decode(result["pdf_base64"]))
                print("\n✅ SUCCESS - Run 'python fidelity_audit.py' now.")
            else:
                print("\n❌ BACKEND ERROR:", result.get("error"))
    except Exception as e:
        print("\n❌ REQUEST FAILED:", e)

if __name__ == "__main__":
    test_edit_font_styles_pdf()
