import requests
import base64
import json
import os

URL = "http://localhost:8000/pdf-extraction-config"
PDF_FILE = "nable_python_result.pdf"

def test_extraction():
    # Find the PDF file
    if not os.path.exists(PDF_FILE):
        alternate = os.path.join("python-backend", "tests", "scripts", PDF_FILE)
        if os.path.exists(alternate):
            pdf_path = alternate
        else:
            print(f"Error: {PDF_FILE} not found.")
            return
    else:
        pdf_path = PDF_FILE

    print(f"--- EXTRACTION DIAGNOSTIC ---")
    print(f"File: {pdf_path}")
    
    with open(pdf_path, 'rb') as f:
        files = {'file': (PDF_FILE, f, 'application/pdf')}
        response = requests.post(URL, files=files)
    
    if response.status_code == 200:
        result = response.json()
        # Save to file for inspection
        with open("extraction_dump.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        print("Success! Saved to extraction_dump.json")
        
        # Print first few blocks to see what's happening
        pages = result.get("pages", [])
        if pages:
            blocks = pages[0].get("blocks", [])
            print(f"Extracted {len(blocks)} blocks from Page 0")
            
            # Look for specific lines mentioning "Java full stack" or other headers
            for block in blocks:
                for line in block.get("lines", []):
                    content = line.get("content", "")
                    if any(target in content.lower() for target in ["java", "sky", "personalized", "bachelor"]):
                        is_bold = any(frag.get("is_bold") for frag in line.get("fragments", []))
                        print(f"Line: {content[:50]}... | Bold: {is_bold}")
    else:
        print(f"Failed with status {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    test_extraction()
