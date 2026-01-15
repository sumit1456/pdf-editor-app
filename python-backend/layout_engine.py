import math
import re
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

    # --- PHASE 2: HANGING INDENT & COLUMN ANCHORING ---
    # Identification of bullet points and calculation of content anchors.
    BULLET_CHARS = ["•", "·", "*", "-", "ΓÇó", "├»", "Γêù"] # common bullet symbols
    
    # 1. First pass: Identify bullets and set anchors
    bullet_anchors = {} # Map Y coordinate to anchor X
    
    for line in processed_lines:
        items = line["items"]
        if not items: continue
        
        # Check if the first item is a bullet or the content starts with a bullet
        first_item = items[0]
        content = first_item["content"].strip()
        
        is_bullet = False
        if content in BULLET_CHARS:
            is_bullet = True
        elif any(content.startswith(b) for b in BULLET_CHARS):
            is_bullet = True
            
        if is_bullet:
            # Bullet found at line["x0"].
            # Find the actual start of text after the bullet to set the anchor.
            line["is_bullet_start"] = True
            
            anchor_x = None
            for i, item in enumerate(items):
                txt = item.get("content", "").strip()
                if not txt: continue
                # Skip if this item is JUST a bullet
                if txt in BULLET_CHARS:
                    continue
                # Found the first content span! Use its origin.
                anchor_x = item["origin"][0]
                break
                
            if anchor_x is None:
                # Fallback: End of bullet item + minimal padding
                bullet_item = items[0]
                anchor_x = bullet_item["bbox"][2] + 4.0
                
            line["content_anchor"] = anchor_x
        else:
            line["is_bullet_start"] = False

    # 2. Second pass: Propagate anchors and snap columns
    # Find dominant anchors across the document
    x0_coords = [line["x0"] for line in processed_lines]
    anchors = []
    if x0_coords:
        x0_coords.sort()
        current_cluster = [x0_coords[0]]
        for i in range(1, len(x0_coords)):
            if x0_coords[i] - current_cluster[-1] < 10:
                current_cluster.append(x0_coords[i])
            else:
                anchors.append(sum(current_cluster) / len(current_cluster))
                current_cluster = [x0_coords[i]]
        anchors.append(sum(current_cluster) / len(current_cluster))

    # --- PHASE 3: SEMANTIC BLOCK RECONSTRUCTION ---
    blocks = []
    
    # Track state for block assembly
    current_block = None
    last_y = -100
    
    import uuid

    for line in processed_lines:
        # 1. Determine if this line is a continuation of the previous block
        y_gap = line["y"] - last_y
        is_proximal = abs(y_gap) < (line["size"] * 2.0)
        
        # A line continues a block if:
        # - It is proximal to the previous line
        # - It is NOT a bullet start (bullets always start new blocks)
        # - It aligns vertically with the current block's logic
        
        should_start_new = (
            current_block is None or 
            not is_proximal or 
            line.get("is_bullet_start")
        )

        if not should_start_new:
            # Check if it aligns with the paragraph indent or the bullet indent
            dist_to_base = abs(line["x0"] - current_block["indentX"])
            dist_to_text = abs(line["x0"] - current_block.get("textX", -999))
            
            # If it's a list item, it must align with either the marker or the text anchor
            if current_block["type"] == "list-item":
                if dist_to_text > 5 and dist_to_base > 5:
                    should_start_new = True
            else:
                # Regular paragraph: just check base indent
                if dist_to_base > 15:
                    should_start_new = True

        if should_start_new:
            # Commit previous block if exists
            if current_block:
                # Update block bbox
                blocks.append(current_block)
            
            # Initialize new block
            block_type = "list-item" if line.get("is_bullet_start") else "paragraph"
            current_block = {
                "id": str(uuid.uuid4()),
                "type": block_type,
                "lines": [],
                "bbox": [line["x0"], line["y"] - line["size"], line["x1"], line["y"]],
                "indentX": line["x0"],
                "textX": line.get("content_anchor", line["x0"]),
                "style": {
                    "font": line["items"][0].get("font"),
                    "size": line["size"]
                }
            }
            if block_type == "list-item":
                current_block["marker"] = line["items"][0]["content"]
                current_block["textX"] = line["content_anchor"]
                current_block["level"] = 0 # Future: detect nesting
        
        # Normalize and add line to current block
        shift = 0
        target_x = current_block["indentX"]
        
        if current_block["type"] == "list-item":
            if line.get("is_bullet_start"):
                # First line of a list: First item is marker, others snap to textX
                marker_item = line["items"][0]
                # Snap marker to indentX
                marker_shift = target_x - marker_item["origin"][0]
                marker_item["origin"][0] += marker_shift
                marker_item["x"] = marker_item["origin"][0]
                marker_item["bbox"][0] += marker_shift
                marker_item["bbox"][2] += marker_shift
                
                # Others snap to textX
                for it in line["items"][1:]:
                    it_shift = current_block["textX"] - it["origin"][0]
                    it["origin"][0] += it_shift
                    it["x"] = it["origin"][0]
                    it["bbox"][0] += it_shift
                    it["bbox"][2] += it_shift
            else:
                # Wrapped lines in a list: Snap to textX
                shift = current_block["textX"] - line["x0"]
        else:
            # Regular paragraph: Snap to indentX
            shift = target_x - line["x0"]

        if shift != 0:
            for it in line["items"]:
                if current_block["type"] == "list-item" and line.get("is_bullet_start") and it == line["items"][0]:
                    continue # Already handled marker
                it["origin"][0] += shift
                it["x"] = it["origin"][0]
                it["bbox"][0] += shift
                it["bbox"][2] += shift
        
        # Tags for legacy compatibility
        for it in line["items"]:
            it["block_id"] = current_block["id"]

        # Add line data to block
        current_block["lines"].append({
            "id": f"{current_block['id']}_{len(current_block['lines'])}",
            "content": line["content"],
            "y": line["y"],
            "is_bullet_start": line.get("is_bullet_start", False),
            "items": line["items"]
        })
        
        # Update block bbox
        current_block["bbox"][0] = min(current_block["bbox"][0], line["x0"] + (shift if not line.get("is_bullet_start") else 0))
        current_block["bbox"][2] = max(current_block["bbox"][2], line["x1"] + (shift if not line.get("is_bullet_start") else 0))
        current_block["bbox"][3] = line["y"]
        
        last_y = line["y"]

    if current_block:
        blocks.append(current_block)

    # Convert blocks and other items (images/paths) into one tree
    return {
        "blocks": blocks,
        "bg_items": other_items
    }
