import json

def final_deep_scan(file_path, page_idx=0):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    page = data['pages'][page_idx]
    items = page['items']
    text_items = [i for i in items if i.get('type') == 'text']
    
    near_dupes = []
    for i in range(len(text_items)):
        for j in range(i + 1, len(text_items)):
            b1 = text_items[i]['bbox']
            b2 = text_items[j]['bbox']
            
            # Distance between bboxes
            dist = sum(abs(v1 - v2) for v1, v2 in zip(b1, b2))
            
            if dist < 1.0: # Very close
                near_dupes.append({
                    'c1': text_items[i]['content'],
                    'c2': text_items[j]['content'],
                    'dist': dist,
                    'b1': b1,
                    'b2': b2
                })
                
    if not near_dupes:
        print("Final Scan: No near-duplicates found (dist < 1.0px).")
    else:
        print(f"Final Scan: Found {len(near_dupes)} near-duplicates:")
        for d in near_dupes[:10]:
            print(f"  '{d['c1']}' and '{d['c2']}' at {d['b1']} (dist: {d['dist']:.4f})")

if __name__ == "__main__":
    final_deep_scan('servlet_jsp_extraction.json')
