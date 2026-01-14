import fitz
import json
import base64

def analyze_pdf(file_path):
    doc = fitz.open(file_path)
    page = doc[0]
    
    # Text extraction
    text_data = page.get_text("dict")
    
    # Image/Drawings/Font summary
    summary = {
        "images_count": len(page.get_images()),
        "drawings_count": len(page.get_drawings()),
        "fonts": [f[3] for f in page.get_fonts()],
        "text_blocks_count": len(text_data["blocks"])
    }
    
    def fallback(obj):
        if isinstance(obj, bytes):
            return "binary_data_hidden"
        return str(obj)

    with open("claude_analysis.json", "w") as f:
        json.dump(text_data, f, default=fallback, indent=2)
        
    print(f"Summary: {summary}")
    print("Full analysis saved to claude_analysis.json")

if __name__ == "__main__":
    analyze_pdf("Creating PDF from data - Claude.pdf")
