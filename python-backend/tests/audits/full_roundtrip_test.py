import base64
import json
import os
import requests
import time

# ================= CONFIG =================
BASE_URL = "http://localhost:8000"
INPUT_PDF = "tests/reference_pdfs/nable_python.pdf"
RESULTS_DIR = "tests/results"
AUDIT_LOG = "backend_audit.log"

def run_roundtrip():
    if not os.path.exists(INPUT_PDF):
        print(f"❌ Error: {INPUT_PDF} not found.")
        return

    print("🚀 Starting Professional Roundtrip Audit...")

    # 1. INITIAL EXTRACTION
    print("\n[Step 1] Extracting original PDF state...")
    with open(INPUT_PDF, "rb") as f:
        files = {'file': (os.path.basename(INPUT_PDF), f, 'application/pdf')}
        params = {'backend': 'python'}
        response = requests.post(f"{BASE_URL}/pdf-extraction-config", files=files, params=params)
    
    if response.status_code != 200:
        print(f"❌ Extraction failed: {response.text}")
        return
    
    orig_data = response.json()
    with open(f"{RESULTS_DIR}/original_extraction.json", "w", encoding="utf-8") as f:
        json.dump(orig_data, f, indent=2)
    print(f"✅ Saved: {RESULTS_DIR}/original_extraction.json")

    # 2. GLOBAL HARMONIZATION & INJECTION
    print("\n[Step 2] Triggering Global Font Harmonization + Injection...")
    with open(INPUT_PDF, "rb") as f:
        pdf_b64 = base64.b64encode(f.read()).decode('utf-8')

    # We inject one visible modification to "Summary" to confirm sniper matching
    modifications = [
        {
            "id": "diagnostic-mod-1",
            "pageIndex": 0,
            "text": "DIAGNOSTIC OVERRIDE: VERIFYING FONT FIDELITY",
            "bbox": [50, 50, 400, 70], # Top of page
            "origin": [60, 65],
            "style": {
                "font": "inter",
                "googleFont": "Inter",
                "size": 14,
                "is_bold": True,
                "color": [0, 0, 0]
            },
            "type": "text"
        }
    ]

    payload = {
        "pdf_name": "nable_python_diagnostic.pdf",
        "pdf_base64": pdf_b64,
        "modifications": modifications
    }

    save_response = requests.post(f"{BASE_URL}/save-pdf", json=payload)
    if save_response.status_code != 200:
        print(f"❌ Save failed: {save_response.text}")
        return
    
    res_pdf_b64 = save_response.json()["pdf_base64"]
    res_pdf_bytes = base64.b64decode(res_pdf_b64)
    
    with open(f"{RESULTS_DIR}/nable_python_result.pdf", "wb") as f:
        f.write(res_pdf_bytes)
    print(f"✅ Saved Harmonized PDF: {RESULTS_DIR}/nable_python_result.pdf")

    # 3. SAVE FONT SELECTION REPORT
    print("\n[Step 3] Capturing Font Selection Report...")
    if os.path.exists(AUDIT_LOG):
        with open(AUDIT_LOG, "r", encoding="utf-8") as f:
            report = f.read()
        with open(f"{RESULTS_DIR}/font_selection_report.txt", "w", encoding="utf-8") as f:
            f.write(report)
        print(f"✅ Saved: {RESULTS_DIR}/font_selection_report.txt")
    else:
        print("⚠️ Warning: backend_audit.log not found. Ensure server is running.")

    # 4. AUDIT EXTRACTION (The Roundtrip)
    print("\n[Step 4] Extracting Harmonized PDF for audit...")
    files = {'file': ("harmonized.pdf", res_pdf_bytes, 'application/pdf')}
    audit_response = requests.post(f"{BASE_URL}/pdf-extraction-config", files=files, params=params)
    
    if audit_response.status_code == 200:
        audit_data = audit_response.json()
        with open(f"{RESULTS_DIR}/result_extraction_audit.json", "w", encoding="utf-8") as f:
            json.dump(audit_data, f, indent=2)
        print(f"✅ Saved Final Audit: {RESULTS_DIR}/result_extraction_audit.json")
    else:
        print(f"❌ Audit extraction failed: {audit_response.text}")

    print("\n✨ ALL TESTS COMPLETE. Inspect the 'tests/results' folder.")

if __name__ == "__main__":
    run_roundtrip()
