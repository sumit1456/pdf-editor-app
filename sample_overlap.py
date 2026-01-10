import json

def find_sample_overlap(file_path, page_idx=0):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    page = data['pages'][page_idx]
    items = page['items']
    
    # Pre-calculate bboxes for paths
    for i in items:
        if i.get('type') in ('path', 'fill') and 'bbox' not in i and 'pts' in i:
            xs = [p['x'] for p in i['pts']]
            ys = [p['y'] for p in i['pts']]
            i['bbox'] = [min(xs), min(ys), max(xs), max(ys)]

    text_items = [i for i in items if i.get('type') == 'text']
    other_items = [i for i in items if i.get('type') in ('path', 'fill')]
    
    for t in text_items[:10]:
        tb = t['bbox']
        for o in other_items:
            ob = o['bbox']
            if (tb[0] < ob[2] and tb[2] > ob[0] and
                tb[1] < ob[3] and tb[3] > ob[1]):
                print(f"Sample Overlap on Page {page_idx+1}:")
                print(f"  Text: '{t['content']}' at {tb}")
                print(f"  Path: {o.get('op', 'fill')} at {ob}")
                return

if __name__ == "__main__":
    find_sample_overlap('servlet_jsp_extraction.json')
