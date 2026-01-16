import fitz
import json
from collections import Counter
import math

def run_geometric_audit(pdf_path):
    doc = fitz.open(pdf_path)
    all_items = []
    
    # 1. Extraction Pass
    for page in doc:
        # Get raw dict for full precision
        blocks = page.get_text("dict")["blocks"]
        for b in blocks:
            if "lines" in b:
                for l in b["lines"]:
                    # We want the origin of the first span in the line as the "Primary Baseline"
                    if l["spans"]:
                        span = l["spans"][0]
                        all_items.append({
                            "text": "".join([s["text"] for s in l["spans"]]),
                            "x0": l["bbox"][0],
                            "y_baseline": span["origin"][1],
                            "size": span["size"],
                            "font": span["font"]
                        })
    
    # 2. X-Axis Statistical Mode Analysis
    # Rounding to 0.1px to catch "near-misses"
    x_coords = [round(item["x0"], 2) for item in all_items]
    x_counts = Counter(x_coords)
    x_modes = x_counts.most_common(20) # Show more candidates
    
    # 3. Y-Axis Leading Analysis (Vertical Rhythm)
    leadings = []
    # Sort by Y to get sequential lines
    sorted_items = sorted(all_items, key=lambda x: x["y_baseline"])
    for i in range(1, len(sorted_items)):
        dist = sorted_items[i]["y_baseline"] - sorted_items[i-1]["y_baseline"]
        # Filter for typical line heights (e.g. 5pt to 30pt)
        if 5 < dist < 30:
            leadings.append(round(dist, 2))
    
    # Find the most frequent line height (The Rhythm)
    leading_counts = Counter(leadings)
    leading_modes = leading_counts.most_common(5)
    
    # 4. Detailed Report
    report = {
        "detected_columns": x_modes,
        "vertical_leads": leading_modes,
        "total_lines": len(all_items),
        "proximity_alerts": []
    }
    
    # Alert if any two X-origins are VERY close (e.g. < 2.5px) - This is the "Drift Zone"
    unique_xs = sorted(x_counts.keys())
    for i in range(len(unique_xs) - 1):
        gap = unique_xs[i+1] - unique_xs[i]
        if 0.1 < gap < 3.0:
            report["proximity_alerts"].append({
                "x1": unique_xs[i],
                "x2": unique_xs[i+1],
                "gap": round(gap, 3),
                "frequency": f"{x_counts[unique_xs[i]]} vs {x_counts[unique_xs[i+1]]}"
            })
            
    return report

if __name__ == "__main__":
    # Test on any resident PDF
    import sys
    pdf_to_test = "rable_python.pdf" # Default
    if len(sys.argv) > 1:
        pdf_to_test = sys.argv[1]
        
    audit_results = run_geometric_audit(pdf_to_test)
    print(json.dumps(audit_results, indent=2))
