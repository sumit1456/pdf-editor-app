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

    # 1. Group items into logical lines (Geometric proximity on Y)
    lines_map = defaultdict(list)
    for item in text_items:
        # Use origin Y for baseline stability
        y = item["origin"][1]
        # 1px tolerance for baseline jitter
        y_key = round(y)
        lines_map[y_key].append(item)

    lines = []
    for y_key in sorted(lines_map.keys()):
        group = lines_map[y_key]
        # Sort by X
        group.sort(key=lambda x: x["origin"][0])
        
        # Merge items into a unified "Line" object for layout analysis
        if not group: continue
        first = group[0]
        full_content = "".join(it["content"] for it in group)
        x0 = first["origin"][0]
        x1 = max(it["bbox"][2] for it in group)
        
        lines.append({
            "y": y_key,
            "x0": x0,
            "x1": x1,
            "height": max(it["height"] for it in group),
            "font": first["font"],
            "size": first["size"],
            "items": group,
            "content": full_content
        })

    # 2. COLUMN CLUSTERING (Detect consistent X anchors)
    x_coords = [line["x0"] for line in lines]
    anchors = []
    if x_coords:
        x_coords.sort()
        # Simple clustering: if diff < 5px, it's the same column anchor
        current_cluster = [x_coords[0]]
        for i in range(1, len(x_coords)):
            if x_coords[i] - current_cluster[-1] < 5:
                current_cluster.append(x_coords[i])
            else:
                anchors.append(sum(current_cluster) / len(current_cluster))
                current_cluster = [x_coords[i]]
        anchors.append(sum(current_cluster) / len(current_cluster))

    # 3. PARAGRAPH ANALYSIS & DRIFT FIX
    # We look for lines that are close vertically and adjust their X to the nearest anchor
    final_text_items = []
    
    # helper to check if a string is a bullet
    def is_bullet(text):
        bullets = ["•", "·", "⋆", "*", "-", "o"]
        return text.strip() in bullets or (len(text.strip()) == 1 and ord(text.strip()[0]) > 127)

    for line in lines:
        # Snap X0 to nearest anchor if within drift threshold (10px)
        best_anchor = line["x0"]
        min_dist = 999
        for a in anchors:
            dist = abs(line["x0"] - a)
            if dist < 10 and dist < min_dist:
                min_dist = dist
                best_anchor = a
        
        shift = best_anchor - line["x0"]
        
        # Apply shift to all items in this line
        for item in line["items"]:
            # Update origin
            item["origin"][0] += shift
            item["x"] = item["origin"][0]
            # Update bbox
            item["bbox"][0] += shift
            item["bbox"][2] += shift
            
            final_text_items.append(item)

    return other_items + final_text_items
