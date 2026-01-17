import base64
import json
import os
import urllib.request

# Configuration
PDF_FILE = "blank.pdf"
URL = "http://localhost:8000/save-pdf"

def test_font_injection():
    # Find the PDF file
    if not os.path.exists(PDF_FILE):
        alternate = os.path.join("python-backend", PDF_FILE)
        if os.path.exists(alternate):
            pdf_path = alternate
        else:
            print(f"Error: {PDF_FILE} not found. Please run this script in or near the python-backend directory.")
            return
    else:
        pdf_path = PDF_FILE

    print(f"--- GLOBAL FONT STRESS TEST ---")
    print(f"Using Template: {pdf_path}")
    with open(pdf_path, "rb") as f:
        pdf_base64 = base64.b64encode(f.read()).decode("utf-8")

    # List of all available fonts in the 'fonts' directory
    font_families = [
        "Fira Code",
        "Inter",
        "JetBrains Mono",
        "Libre Baskerville",
        "Lora",
        "Merriweather",
        "Montserrat",
        "Open Sans",
        "Oswald",
        "Playfair Display",
        "Roboto",
        "Roboto Mono",
        "Source Serif 4"
    ]

    modifications = []
    start_y = 50
    spacing = 40

    for i, font in enumerate(font_families):
        y_pos = start_y + (i * spacing)
        
        # Add a title/label for the font
        modifications.append({
            "id": f"label-{font.replace(' ', '-')}",
            "text": f"Font: {font}",
            "pageIndex": 0,
            "bbox": [50, y_pos, 250, y_pos + 15],
            "origin": [50, y_pos + 12],
            "style": {
                "font": "inter",
                "size": 10,
                "color": [0.4, 0.4, 0.4],
                "font_variant": "normal"
            }
        })

        # Add the actual font sample
        modifications.append({
            "id": f"sample-{font.replace(' ', '-')}",
            "text": f"The quick brown fox jumps over the lazy dog. 1234567890",
            "pageIndex": 0,
            "bbox": [50, y_pos + 15, 550, y_pos + 35],
            "origin": [50, y_pos + 32],
            "style": {
                "font": font.lower(),
                "size": 14,
                "color": [0, 0, 0],
                "font_variant": "normal"
            }
        })

    # Add a special Small-Caps test at the bottom
    last_y = start_y + (len(font_families) * spacing) + 20
    modifications.append({
        "id": "small-caps-test",
        "text": "SMALL CAPS TYPOGRAPHIC TEST (SOURCE SERIF 4)",
        "pageIndex": 0,
        "bbox": [50, last_y, 550, last_y + 30],
        "origin": [50, last_y + 25],
        "style": {
            "font": "source serif 4",
            "size": 18,
            "color": [0.1, 0.3, 0.6],
            "font_variant": "small-caps"
        }
    })

    payload = {
        "pdf_name": "font_stress_test.pdf",
        "pdf_base64": pdf_base64,
        "modifications": modifications
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=data, headers={'Content-Type': 'application/json'})
    
    print(f"Calling Backend at: {URL}...")
    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                result = json.loads(response.read().decode("utf-8"))
                if result.get("success"):
                    output_filename = "font_stress_test_result.pdf"
                    with open(output_filename, "wb") as f:
                        f.write(base64.b64decode(result["pdf_base64"]))
                    print(f"\n✅ SUCCESS!")
                    print(f"Total Fonts Tested: {len(font_families)}")
                    print(f"Result saved to: {os.path.abspath(output_filename)}")
                else:
                    print(f"\n❌ SERVER ERROR: {result.get('error')}")
            else:
                print(f"\n❌ HTTP FAILED: Status {response.status}")
    except Exception as e:
        print(f"\n❌ CONNECTION FAILED: {e}")

if __name__ == "__main__":
    test_font_injection()
