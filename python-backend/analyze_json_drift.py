import json

def analyze_drift():
    try:
        # PowerShell redirect creates UTF-16LE with BOM
        with open('nable_python_v2.json', 'r', encoding='utf-16') as f:
            data = json.load(f)
        
        print("Analyzing sections: Experience, Projects, and Bullets")
        print("-" * 50)
        
        found_experience = False
        found_project = False
        
        for pno, page in enumerate(data['pages']):
            print(f"\nPAGE {pno + 1}")
            items = page.get('items', [])
            
            # Group by Y to see alignment of same-row items
            rows = {}
            for item in items:
                if item.get('type') != 'text': continue
                y = round(item['origin'][1], 1)
                if y not in rows: rows[y] = []
                rows[y].append(item)
            
            for y in sorted(rows.keys()):
                group = sorted(rows[y], key=lambda x: x['origin'][0])
                line_text = "".join(it['content'] for it in group)
                
                # Check for keywords and bullets
                is_bullet = any(it['content'].strip() in ['•', '·', '*'] or it['content'].strip().startswith('-') for it in group)
                
                if 'Experience' in line_text or 'EXperience' in line_text:
                    found_experience = True
                    print(f"[EXPERIENCE SECTION START]")
                
                if 'Project' in line_text or 'PROJECT' in line_text:
                    found_project = True
                    print(f"[PROJECT SECTION START]")
                
                if found_experience or found_project or is_bullet:
                    # Print X coordinates of items in the line
                    coords = [f"{it['content'][:10]:<10} @ X:{it['origin'][0]:.2f}" for it in group]
                    print(f"Y:{y:<6} | {' | '.join(coords)}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    analyze_drift()
