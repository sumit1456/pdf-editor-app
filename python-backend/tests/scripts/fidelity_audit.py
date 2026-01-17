import fitz
import os
import json

def audit_fidelity(original_path, edited_path):
    if not os.path.exists(original_path) or not os.path.exists(edited_path):
        print("❌ Error: One or both PDF files missing.")
        return

    doc_orig = fitz.open(original_path)
    doc_edit = fitz.open(edited_path)
    
    report = {
        "summary": {"total_pages": len(doc_orig), "errors": 0, "warnings": 0},
        "pages": []
    }

    for pno in range(len(doc_orig)):
        page_orig = doc_orig[pno]
        page_edit = doc_edit[pno]
        
        # Extract dictionary for deep inspection
        raw_orig = page_orig.get_text("dict")["blocks"]
        raw_edit = page_edit.get_text("dict")["blocks"]
        
        page_audit = {"page": pno, "issues": []}
        
        # Flatten blocks into lines for comparison
        lines_orig = []
        for b in raw_orig:
            if b["type"] == 0: lines_orig.extend(b["lines"])
            
        lines_edit = []
        for b in raw_edit:
            if b["type"] == 0: lines_edit.extend(b["lines"])

        # Audit 1: Line Count Integrity
        if len(lines_orig) != len(lines_edit):
            page_audit["issues"].append({
                "type": "STRUCTURE_BREAK",
                "severity": "CRITICAL",
                "msg": f"Line count mismatch! Original: {len(lines_orig)}, Edited: {len(lines_edit)}",
                "details": "Layout engine is likely splitting single lines into fragments or merging columns incorrectly."
            })

        # Audit 2: Line-by-Line Geometric Drift
        # We try to match lines by proximity (Y-coordinate)
        for l_orig in lines_orig:
            content_orig = "".join(s["text"] for s in l_orig["spans"]).strip()
            bbox_orig = l_orig["bbox"]
            center_orig = (bbox_orig[0] + bbox_orig[2])/2, (bbox_orig[1] + bbox_orig[3])/2
            
            # Find closest matching line in edited doc
            match = None
            min_dist = 999
            for l_edit in lines_edit:
                content_edit = "".join(s["text"] for s in l_edit["spans"]).strip()
                bbox_edit = l_edit["bbox"]
                center_edit = (bbox_edit[0] + bbox_edit[2])/2, (bbox_edit[1] + bbox_edit[3])/2
                dist = ((center_orig[0] - center_edit[0])**2 + (center_orig[1] - center_edit[1])**2)**0.5
                
                # SMART MATCH: Either content matches, OR they overlap geometrically
                is_geometry_match = dist < 5.0 # Very close proximity
                is_content_match = content_orig in content_edit or content_edit in content_orig
                
                if (is_content_match or is_geometry_match) and dist < min_dist:
                    min_dist = dist
                    match = l_edit

            if match:
                # Check for Drift
                if min_dist > 1.0: # 1 point threshold
                    page_audit["issues"].append({
                        "type": "GEOMETRIC_DRIFT",
                        "severity": "WARNING",
                        "msg": f"Line '{content_orig[:20]}...' shifted by {min_dist:.2f}pt",
                        "details": f"Orig: {bbox_orig}, Edit: {match['bbox']}"
                    })
                
                # Check for Fragmentation
                if len(match["spans"]) > (len(l_orig["spans"]) + 2):
                    page_audit["issues"].append({
                        "type": "FRAGMENTATION",
                        "severity": "MINOR",
                        "msg": f"Line '{content_orig[:20]}...' split into {len(match['spans'])} spans (Orig: {len(l_orig['spans'])}).",
                        "details": "This indicates the Layout Engine is not merging text correctly."
                    })
                
                # Check for Style (Size)
                if abs(match["spans"][0]["size"] - l_orig["spans"][0]["size"]) > 0.1:
                    page_audit["issues"].append({
                        "type": "SIZE_MISMATCH",
                        "severity": "WARNING",
                        "msg": f"Font size changed for '{content_orig[:20]}...'",
                        "details": f"Orig: {l_orig['spans'][0]['size']:.2f}, Edit: {match['spans'][0]['size']:.2f}"
                    })
            else:
                page_audit["issues"].append({
                    "type": "REDACTION_FAILURE",
                    "severity": "CRITICAL",
                    "msg": f"Could not find edited match for text: '{content_orig[:30]}'",
                    "details": "This likely means the text was hidden or moved to a different page/bbox during reconstruction."
                })

        report["pages"].append(page_audit)
        report["summary"]["errors"] += sum(1 for i in page_audit["issues"] if i["severity"] == "CRITICAL")
        report["summary"]["warnings"] += sum(1 for i in page_audit["issues"] if i["severity"] == "WARNING")

    print("\n" + "="*50)
    print("           FIDELITY AUDIT REPORT")
    print("="*50)
    print(f"Summary: {report['summary']['errors']} Errors, {report['summary']['warnings']} Warnings")
    print("-"*50)
    
    for p in report["pages"]:
        if p["issues"]:
            print(f"\n[PAGE {p['page']}] Found {len(p['issues'])} issues:")
            for issue in p["issues"]:
                color = "🔴" if issue["severity"] == "CRITICAL" else "🟡"
                print(f"  {color} {issue['type']}: {issue['msg']}")
                print(f"     -> {issue['details']}")
    
    # Save raw report
    with open("audit_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print("\nFull JSON report saved to audit_report.json")

if __name__ == "__main__":
    audit_fidelity("font_styles_test.pdf", "font_styles_test_result.pdf")
