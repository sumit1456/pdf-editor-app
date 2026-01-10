import json
import collections

def analyze_overlaps(file_path, max_pages=1):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading file: {e}")
        return

    pages = data.get('pages', [])
    for p_idx, page in enumerate(pages[:max_pages]):
        print(f"\n--- Analyzing Page {p_idx} ---")
        items = page.get('items', [])
        
        # Group by coordinates to find exact duplicates
        coord_map = collections.defaultdict(list)
        
        for idx, item in enumerate(items):
            # Use bbox if available, else pts for paths
            if 'bbox' in item:
                bbox = tuple(item['bbox'])
                coord_map[bbox].append((idx, item))
            elif 'pts' in item:
                # For paths, use the first point or a bounding box if we calculated it
                # For simplicity, let's just use pts as a key
                pts = tuple((p['x'], p['y']) for p in item['pts'])
                coord_map[pts].append((idx, item))

        duplicates = {k: v for k, v in coord_map.items() if len(v) > 1}
        
        if not duplicates:
            print("No exact coordinate duplicates found in items.")
        else:
            print(f"Found {len(duplicates)} sets of exact coordinate duplicates.")
            for coords, dup_list in list(duplicates.items())[:5]:
                print(f"  Coordinates {coords} has {len(dup_list)} items:")
                for idx, item in dup_list:
                    content = item.get('content', item.get('type', 'Unknown'))
                    print(f"    - Index {idx}: Type={item.get('type')}, Content='{content}'")

        # Specifically check for text item overlaps and path/fill overlaps
        text_items = [i for i in items if i.get('type') == 'text']
        other_items = [i for i in items if i.get('type') in ('path', 'fill')]
        
        # Pre-calculate bboxes for other items if not present
        for i in other_items:
            if 'bbox' not in i and 'pts' in i:
                xs = [p['x'] for p in i['pts']]
                ys = [p['y'] for p in i['pts']]
                i['bbox'] = [min(xs), min(ys), max(xs), max(ys)]

        print(f"Checking {len(text_items)} text items and {len(other_items)} other items...")
        
        overlap_stats = collections.Counter()
        all_bbox_items = [i for i in items if i.get('bbox')]
        
        for i in range(len(all_bbox_items)):
            for j in range(i + 1, len(all_bbox_items)):
                b1 = all_bbox_items[i]['bbox']
                b2 = all_bbox_items[j]['bbox']
                
                # Check for intersection
                if (b1[0] < b2[2] and b1[2] > b2[0] and
                    b1[1] < b2[3] and b1[3] > b2[1]):
                    
                    t1 = all_bbox_items[i].get('type')
                    t2 = all_bbox_items[j].get('type')
                    
                    # Calculate intersection area
                    ix1 = max(b1[0], b2[0])
                    iy1 = max(b1[1], b2[1])
                    ix2 = min(b1[2], b2[2])
                    iy2 = min(b1[3], b2[3])
                    iarea = (ix2 - ix1) * (iy2 - iy1)
                    area1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
                    area2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
                    
                    # Only count significant overlaps (>10% of either item)
                    if iarea > 0.1 * min(area1, area2):
                        key = tuple(sorted([t1, t2]))
                        overlap_stats[key] += 1
                        
                        if overlap_stats[key] <= 5:
                            c1 = all_bbox_items[i].get('content', t1)
                            c2 = all_bbox_items[j].get('content', t2)
                            print(f"  Overlap {key} [{overlap_stats[key]}]: '{c1}' and '{c2}'")

        if not overlap_stats:
            print("No significant overlaps found on page.")
        else:
            print("Overlap summary:")
            for pair, count in overlap_stats.items():
                print(f"  {pair[0]} - {pair[1]}: {count} occurrences")

if __name__ == "__main__":
    analyze_overlaps('servlet_jsp_extraction.json', max_pages=1)
