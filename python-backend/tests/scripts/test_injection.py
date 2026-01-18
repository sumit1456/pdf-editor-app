import base64
import json
import os
import urllib.request

# Configuration
PDF_FILE = "nable_python.pdf"
URL = "http://localhost:8000/save-pdf"

def test_injection():
    # Find the PDF file
    if not os.path.exists(PDF_FILE):
        alternate = os.path.join("python-backend", "tests", "scripts", PDF_FILE)
        if os.path.exists(alternate):
            pdf_path = alternate
        else:
            # Try just relative to root
            pdf_path = os.path.join("python-backend", "tests", "scripts", "nable_python.pdf")
    else:
        pdf_path = PDF_FILE

    if not os.path.exists(pdf_path):
        print(f"Error: {pdf_path} not found.")
        return

    print(f"--- FONT & COLOR STRESS TEST ---")
    print(f"Using Template: {pdf_path}")
    with open(pdf_path, "rb") as f:
        pdf_base64 = base64.b64encode(f.read()).decode("utf-8")

    modifications = []
    
    # We will inject some text at the bottom of the first page (nable_python has content)
    # nable_python page 0 has many blocks. Let's add something at y=300
    y_pos = 500
    
    test_fonts = ["Inter", "Roboto"]

    for font in test_fonts:
        # Regular (Should be SOLID BLACK)
        modifications.append({
            "id": f"{font}-regular-black-test",
            "type": "text",
            "text": f"{font} Regular (BLACK TEST): This text must be pure black [0,0,0].",
            "pageIndex": 0,
            "bbox": [50, y_pos, 500, y_pos + 20],
            "origin": [50, y_pos + 15],
            "style": {"font": font.lower(), "size": 12, "color": [0, 0, 0], "is_bold": False, "is_italic": False}
        })
        
        # Italic (Should also be SOLID BLACK)
        modifications.append({
            "id": f"{font}-italic-black-test",
            "type": "text",
            "text": f"{font} Italic (BLACK TEST): This text must be pure black [0,0,0].",
            "pageIndex": 0,
            "bbox": [50, y_pos + 20, 500, y_pos + 40],
            "origin": [50, y_pos + 35],
            "style": {"font": font.lower(), "size": 12, "color": [0, 0, 0], "is_bold": False, "is_italic": True}
        })

        y_pos += 50

    payload = {
        "pdf_name": "nable_python_test.pdf",
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
                    output_filename = "nable_python_result.pdf"
                    with open(output_filename, "wb") as f:
                        f.write(base64.b64decode(result["pdf_base64"]))
                    print(f"\n\u2705 SUCCESS!")
                    print(f"Result saved to: {os.path.abspath(output_filename)}")
                else:
                    print(f"\n\u274c SERVER ERROR: {result.get('error')}")
            else:
                print(f"\n\u274c HTTP FAILED: Status {response.status}")
    except Exception as e:
        print(f"\n\u274c CONNECTION FAILED: {e}")

if __name__ == "__main__":
    test_injection()
