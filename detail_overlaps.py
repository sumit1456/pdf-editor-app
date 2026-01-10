import json

def detail_text_overlaps(file_path, page_idx=0):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    page = data['pages'][page_idx]
    text_items = [i for i in page['items'] if i.get('type') == 'text']
    
    overlaps = []
    for i in range(len(text_items)):
        for j in range(i + 1, len(text_items)):
            b1 = text_items[i]['bbox']
            b2 = text_items[j]['bbox']
            
            if (b1[0] < b2[2] and b1[2] > b2[0] and
                b1[1] < b2[3] and b1[3] > b2[1]):
                
                # Intersection area
                ix1 = max(b1[0], b2[0])
                iy1 = max(b1[1], b2[1])
                ix2 = min(b1[2], b2[2])
                iy2 = min(b1[3], b2[3])
                iarea = (ix2 - ix1) * (iy2 - iy1)
                area1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
                area2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
                
                if iarea > 0.1 * min(area1, area2):
                    overlaps.append({
                        'c1': text_items[i]['content'],
                        'c2': text_items[j]['content'],
                        'b1': b1,
                        'b2': b2,
                        'ratio': iarea / min(area1, area2)
                    })

    print(json.dumps(overlaps, indent=2))

if __name__ == "__main__":
    detail_text_overlaps('servlet_jsp_extraction.json')
