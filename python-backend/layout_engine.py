import math
from collections import defaultdict

def normalize_layout(items):
    """
    Stabilizes PDF text coordinates by clustering columns and grouping lines into paragraphs.
    Fixes X-axis drift specifically for wrapped bullet lines.
    """
    if not items:
        return []

    text_items = [item for item in items if item.get("type") == "text"]
    other_items = [item for item in items if item.get("type") != "text"]

    if not text_items:
        return items

    # --- PHASE 1: LINE AGGREGATION ---
    # Group raw PDF text spans into logical lines based on baseline (Y) proximity.
    lines_map = defaultdict(list)
    for item in text_items:
        y = item["origin"][1]
        # Cluster baselines within 4.5px jitter (increased to catch mixed-style baseline drift)
        y_group = None
        for existing_y in lines_map.keys():
            if abs(existing_y - y) < 4.5:
                y_group = existing_y
                break
        if y_group is None:
            y_group = y
            
        lines_map[y_group].append(item)

    processed_lines = []
    for y_val in sorted(lines_map.keys()):
        group = lines_map[y_val]
        group.sort(key=lambda x: x["origin"][0])
        
        if not group: continue
        
        # Merge basic metrics
        first_origin = group[0]["origin"]
        line_content = "".join(it["content"] for it in group)
        max_height = max(it["height"] for it in group)
        max_size = max(it["size"] for it in group)
        
        processed_lines.append({
            "y": y_val,
            "x0": first_origin[0],
            "x1": max(it["bbox"][2] for it in group),
            "height": max_height,
            "size": max_size,
            "items": group,
            "content": line_content
        })

    # --- PHASE 2: ADAPTIVE COLUMN CLUSTERING ---
    # Cluster X-coordinates to find common indent anchors (threshold = 10px).
    x0_coords = [line["x0"] for line in processed_lines]
    anchors = []
    if x0_coords:
        x0_coords.sort()
        current_cluster = [x0_coords[0]]
        for i in range(1, len(x0_coords)):
            # 10px threshold usually catches bullet drift (~7px) and minor alignment jitter
            if x0_coords[i] - current_cluster[-1] < 10:
                current_cluster.append(x0_coords[i])
            else:
                anchors.append(sum(current_cluster) / len(current_cluster))
                current_cluster = [x0_coords[i]]
        anchors.append(sum(current_cluster) / len(current_cluster))

    # --- PHASE 3: GEOMETRIC STABILIZATION ---
    # Snap each line to its nearest anchor for pixel-perfect alignment.
    final_text_items = []
    
    for line in processed_lines:
        # Finding the optimal anchor
        best_anchor = line["x0"]
        min_dist = float('inf')
        for a in anchors:
            dist = abs(line["x0"] - a)
            # Threshold to prevent snapping unrelated elements (e.g. page numbers)
            if dist < 12 and dist < min_dist:
                min_dist = dist
                best_anchor = a
        
        shift = best_anchor - line["x0"]
        
        # Apply normalization shift to all constituent items
        for item in line["items"]:
            # Correct origin X (The main coordinate used by the renderer)
            item["origin"][0] += shift
            item["x"] = item["origin"][0] # Sync property for convenience
            
            # Correct bbox (used for selection/hit-test)
            item["bbox"][0] += shift
            item["bbox"][2] += shift
            
            final_text_items.append(item)

    # Return stabilized text items merged with original vector/image items
    return other_items + final_text_items
