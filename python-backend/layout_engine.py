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

    # --- PHASE 1: LINE AGGREGATION & GRANULAR SPLITTING ---
    # Group raw PDF text spans into logical lines, but split them if they cross URI boundaries.
    lines_map = defaultdict(list)
    for item in text_items:
        y = item["origin"][1]
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
        
        # Split group into segments if URIs change (to give each link its own input)
        current_segment = [group[0]]
        for i in range(1, len(group)):
            prev_it = group[i-1]
            curr_it = group[i]
            
            # Split if URI changes (Link-to-Text or Link-to-Link)
            if prev_it.get("uri") != curr_it.get("uri"):
                # Close segment
                seg_content = "".join(it["content"] for it in current_segment)
                processed_lines.append({
                    "y": y_val,
                    "x0": current_segment[0]["origin"][0],
                    "x1": max(it["bbox"][2] for it in current_segment),
                    "height": max(it["height"] for it in current_segment),
                    "size": max(it["size"] for it in current_segment),
                    "items": current_segment,
                    "content": seg_content,
                    "uri": next((it["uri"] for it in current_segment if it.get("uri")), None)
                })
                current_segment = [curr_it]
            else:
                current_segment.append(curr_it)
        
        # Add final segment
        seg_content = "".join(it["content"] for it in current_segment)
        processed_lines.append({
            "y": y_val,
            "x0": current_segment[0]["origin"][0],
            "x1": max(it["bbox"][2] for it in current_segment),
            "height": max(it["height"] for it in current_segment),
            "size": max(it["size"] for it in current_segment),
            "items": current_segment,
            "content": seg_content,
            "uri": next((it["uri"] for it in current_segment if it.get("uri")), None)
        })

    # --- PHASE 2: HANGING INDENT & COLUMN ANCHORING ---
    # Identification of bullet points and calculation of content anchors.
    # Revised Bullet Characters
    BULLET_CHARS = [
        "·", "▪", "▫", "◦", "‣", "⁃", "■", "□", 
        "ΓÇó", "├»", "Γêù",  # Common encoding glitches
        "\u2022", "\u2023", "\u2043", "\u2219", "\u22c5", "\u25cb", "\u25cf", "\u25e6", "\u25a0", "\u25a1"
    ]
    # Special markers that shouldn't always be dots
    SUB_BULLET_CHARS = ["*", "»", ">", "-", "\u2217", "\u2013"]
    
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
            marker_char = content
        elif any(content.startswith(b) for b in ALL_MARKERS):
            is_bullet = True
            for b in ALL_MARKERS:
                if content.startswith(b):
                    marker_char = b
                    # If it's a primary bullet and we want to normalize it
                    if b in BULLET_CHARS and b not in SUB_BULLET_CHARS:
                         new_content = NORM_BULLET + content[len(b):]
                         first_item["content"] = new_content
                         line["content"] = new_content + line["content"][len(content):]
                         marker_char = NORM_BULLET
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
            
            # Tighten the gap for a professional look (approx 0.4x font size)
            fixed_gap = font_size * 0.4
            
            # If marker is part of the first item, anchor starts after the marker
            if len(bullet_item["content"]) > len(marker_char):
                anchor_x = bullet_item["bbox"][0] + (font_size * 0.3) + fixed_gap
            else:
                for i in range(1, len(items)):
                    it = items[i]
                    if it.get("content", "").strip():
                         anchor_x = it["origin"][0]
                         break
                
                # If we detected an anchor but it's too close, push it
                if anchor_x is None or (anchor_x - bullet_item["bbox"][0]) < fixed_gap:
                    anchor_x = bullet_item["bbox"][0] + fixed_gap
            
            line["content_anchor"] = anchor_x
            line["content_gap"] = anchor_x - bullet_item["bbox"][0]
            
            # Use 1:1 scaling. No more manual boosting.
            line["bullet_size"] = font_size
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
            # Tighter clustering (6px) to keep nested levels distinct
            if x0_coords[i] - current_cluster[-1] < 6:
                current_cluster.append(x0_coords[i])
            else:
                anchors.append(sum(current_cluster) / len(current_cluster))
                current_cluster = [x0_coords[i]]
        anchors.append(sum(current_cluster) / len(current_cluster))
        
    # Snap line x0 to nearest anchor to fix drift
    for line in processed_lines:
        if line.get("is_bullet_start"):
            continue # Bullets define columns, they shouldn't snap to them
            
        current_x = line["x0"]
        # Find closest anchor
        if anchors:
            closest_anchor = min(anchors, key=lambda a: abs(a - current_x))
            # Tighten snap threshold to 3px to avoid collapsing nested levels
            if abs(closest_anchor - current_x) < 3:
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
                    "size": line["size"],
                    "is_bold": any(item.get("flags", 0) & 16 for item in line["items"]),
                    "is_italic": any(item.get("flags", 0) & 2 for item in line["items"])
                },
                "uri": line.get("uri")
            }
            if line.get("is_bullet_start"):
                marker_item = line["items"][0]
                current_block["marker"] = line.get("marker_char", marker_item["content"])
                current_block["textX"] = line.get("content_anchor", line["x0"] + 15)
                current_block["bullet_metrics"] = {
                    "size": line.get("bullet_size", line["size"]),
                    "gap": line.get("content_gap", 5.0),
                    "marker_width": marker_item["bbox"][2] - marker_item["bbox"][0],
                    "marker_char": line.get("marker_char")
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

        for it in line["items"]:
            if shift != 0:
                it["origin"][0] += shift
                it["x"] = it["origin"][0]
                it["bbox"][0] += shift
                it["bbox"][2] += shift
            it["block_id"] = current_block["id"]

        # Add line data to block
        li_id = line.get("id") or str(uuid.uuid4())
        current_block["lines"].append({
            "id": li_id,
            "content": line["content"],
            "y": line["y"],
            "x0": line["x0"],
            "x1": line["x1"],
            "size": line["size"],
            "is_bullet_start": line.get("is_bullet_start", False),
            "items": line["items"],
            "uri": line.get("uri")
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

    # --- PHASE 4: IDENTIFY NESTING LEVELS ---
    list_blocks = [b for b in blocks if b["type"] == "list-item"]
    if list_blocks:
        indents = sorted(list(set(b["indentX"] for b in list_blocks)))
        # Cluster indents that are very close (within 5px)
        clustered_indents = []
        if indents:
            current_group = indents[0]
            clustered_indents.append(current_group)
            for x in indents[1:]:
                if x - current_group > 5:
                    clustered_indents.append(x)
                    current_group = x
        
        for b in list_blocks:
            # Find closest cluster
            level = 0
            for i, cluster in enumerate(clustered_indents):
                if abs(b["indentX"] - cluster) < 4:
                    level = i
                    break
            b["level"] = level

    # Convert blocks and other items (images/paths) into one tree
    return {
        "blocks": blocks,
        "bg_items": other_items
    }
