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
    # Revised Bullet Characters
    BULLET_CHARS = [
        "·", "-", "▪", "▫", "◦", "‣", "⁃", "■", "□", 
        "ΓÇó", "├»", "Γêù",  # Common encoding glitches
        "\u2022", "\u2023", "\u2043", "\u2219", "\u22c5", "\u25cb", "\u25cf", "\u25e6", "\u25a0", "\u25a1"
    ]
    # Special markers that shouldn't always be dots
    SUB_BULLET_CHARS = ["*", "»", ">"]
    
    ALL_MARKERS = BULLET_CHARS + SUB_BULLET_CHARS
    
    # 1. First pass: Identify bullets and set anchors
    bullet_anchors = {} # Map Y coordinate to anchor X
    
    # Normalize bullet characters to solid dots for professional appearance
    NORM_BULLET = "•"
    
    for line in processed_lines:
        items = line["items"]
        if not items: continue
        
        # Check if the first item is a bullet or the content starts with a bullet
        first_item = items[0]
        content = first_item.get("content", "").strip()
        is_bullet = False
        
        # Normalize primary bullet characters to solid dots
        NORM_BULLET = "•"
        
        if content in ALL_MARKERS:
            is_bullet = True
            # Normalize common bullet characters to a standard dot, but leave SUB_BULLETS alone
            if content in ["·", "-", "ΓÇó", "├»", "Γêù"] or content == NORM_BULLET:
                first_item["content"] = NORM_BULLET
                line["content"] = NORM_BULLET + line["content"][len(content):]
        elif any(content.startswith(b) for b in ALL_MARKERS):
            is_bullet = True
            for b in ALL_MARKERS:
                if content.startswith(b):
                    if b in ["·", "-", "ΓÇó", "├»", "Γêù"] or b == NORM_BULLET:
                        new_content = NORM_BULLET + content[len(b):]
                        first_item["content"] = new_content
                        line["content"] = new_content + line["content"][len(content):]
                    break
            
        if is_bullet:
            line["is_bullet_start"] = True
            
            # Use marker character if it's in SUB_BULLET_CHARS
            marker_char = first_item["content"][0] if first_item["content"] else NORM_BULLET
            line["marker_char"] = marker_char
            
            # Find the actual text content that follows the bullet
            anchor_x = None
            bullet_item = items[0]
            font_size = bullet_item.get("size", 10.0)
            
            # Heuristic: Find first non-empty text that isn't the marker
            for i, item in enumerate(items):
                txt = item.get("content", "").strip()
                if not txt or txt in BULLET_CHARS:
                    continue
                anchor_x = item["origin"][0]
                break
                
            if anchor_x is None:
                # If everything is in one span, or no text after bullet, calculate based on character width
                anchor_x = bullet_item["bbox"][2] + (font_size * 0.4) 
            
            # Distance (Gap) between bullet and content
            raw_gap = max(0, anchor_x - bullet_item["bbox"][2])
            
            # Dynamic Gap: Proportional to font size (e.g., 30% of font size)
            # This ensures consistent visual weight across different scales.
            min_gap = font_size * 0.3
            line["content_gap"] = max(min_gap, raw_gap)
            line["bullet_size"] = font_size
            
            # Adjust anchor if we enforced a minimum gap
            if line["content_gap"] > raw_gap:
                line["content_anchor"] = bullet_item["bbox"][2] + line["content_gap"]
            else:
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
        
    # Snap line x0 to nearest anchor to fix drift
    for line in processed_lines:
        current_x = line["x0"]
        # Find closest anchor
        if anchors:
            closest_anchor = min(anchors, key=lambda a: abs(a - current_x))
            if abs(closest_anchor - current_x) < 12:
                line["x0"] = closest_anchor

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
                marker_item = line["items"][0]
                current_block["marker"] = line.get("marker_char", marker_item["content"])
                current_block["textX"] = line.get("content_anchor", line["x0"] + 15)
                current_block["bullet_metrics"] = {
                    "size": line.get("bullet_size", line["size"]),
                    "gap": line.get("content_gap", 5.0),
                    "marker_width": marker_item["bbox"][2] - marker_item["bbox"][0]
                }
                current_block["level"] = 0
        
        # Normalize and add line to current block
        shift = 0
        target_x = current_block["indentX"]
        
        if current_block["type"] == "list-item":
            if line.get("is_bullet_start"):
                # First line of a list: First item is marker, others snap to textX relative to first non-empty
                marker_item = line["items"][0]
                marker_shift = target_x - marker_item["origin"][0]
                marker_item["origin"][0] += marker_shift
                marker_item["x"] = marker_item["origin"][0]
                marker_item["bbox"][0] += marker_shift
                marker_item["bbox"][2] += marker_shift
                
                # Find the first item after the bullet that actually has content (the anchor item)
                anchor_idx = 1
                for i in range(1, len(line["items"])):
                    if line["items"][i].get("content", "").strip():
                        anchor_idx = i
                        break
                
                # Calculate shift for all subsequent items based on the first content item's new anchor
                if anchor_idx < len(line["items"]):
                    content_shift = current_block["textX"] - line["items"][anchor_idx]["origin"][0]
                    for it in line["items"][1:]:
                        it["origin"][0] += content_shift
                        it["x"] = it["origin"][0]
                        it["bbox"][0] += content_shift
                        it["bbox"][2] += content_shift
                shift = 0 # Handled individually
            else:
                # Wrapped lines in a list: Snap to textX
                shift = current_block["textX"] - line["x0"]
        else:
            # Regular paragraph: Snap to indentX
            shift = target_x - line["x0"]

        if shift != 0:
            for it in line["items"]:
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
        
        # Update block bbox using the ACTUAL NEW COORDINATES of items
        for it in line["items"]:
            current_block["bbox"][0] = min(current_block["bbox"][0], it["bbox"][0])
            current_block["bbox"][1] = min(current_block["bbox"][1], it["bbox"][1])
            current_block["bbox"][2] = max(current_block["bbox"][2], it["bbox"][2])
            current_block["bbox"][3] = max(current_block["bbox"][3], it["bbox"][3])
        
        last_y = line["y"]

    if current_block:
        blocks.append(current_block)

    # Convert blocks and other items (images/paths) into one tree
    return {
        "blocks": blocks,
        "bg_items": other_items
    }
