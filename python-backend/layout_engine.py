import math
import re
from collections import defaultdict, Counter
import uuid

def normalize_layout(items):
    """
    Stabilizes PDF text coordinates by clustering columns and grouping lines into paragraphs.
    Implements Semantic Decomposition and Span-Level Fragments for high-fidelity rendering.
    """
    if not items:
        return []

    text_items = [item for item in items if item.get("type") == "text"]
    other_items = [item for item in items if item.get("type") != "text"]

    if not text_items:
        return items

    # --- PHASE 1: STATISTICAL GEOMETRIC AUDIT ---
    # Find the "Truth" of the document's margins and rhythm.
    
    # 1. Discover X-Modes (The Vertical Pillars & Right Margins)
    raw_x0s = [round(it["origin"][0], 2) for it in text_items]
    raw_x1s = [round(it["bbox"][2], 2) for it in text_items]
    
    x_counts = Counter(raw_x0s)
    canonical_x_anchors = [val for val, count in x_counts.most_common(10) if count > 2]
    
    # Identify the "Meta Pillar" (Right-aligned margin mode)
    page_width = max(raw_x1s) if raw_x1s else 600
    right_margin_candidates = [x for x in raw_x1s if x > (page_width * 0.6)]
    right_counts = Counter(right_margin_candidates)
    canonical_right_anchors = [val for val, count in right_counts.most_common(5) if count > 2]

    # 2. Discover Content-Pillars & Leading
    BULLET_CHARS = ["·", "▪", "▫", "◦", "‣", "⁃", "■", "□", "•"]
    SUB_BULLET_CHARS = ["*", "»", ">", "-", "∗", "–"]
    ALL_MARKERS = BULLET_CHARS + SUB_BULLET_CHARS

    all_baselines = sorted(list(set(round(it["origin"][1], 2) for it in text_items)))
    gaps = []
    for i in range(1, len(all_baselines)):
        gap = round(all_baselines[i] - all_baselines[i-1], 2)
        if 5 < gap < 30:
            gaps.append(gap)
    
    leading_counts = Counter(gaps)
    canonical_leading = leading_counts.most_common(1)[0][0] if gaps else 0

    # --- PHASE 2: LINE AGGREGATION & SEMANTIC DECOMPOSITION ---
    lines_map = defaultdict(list)
    for item in text_items:
        y = item["origin"][1]
        y_group = None
        for existing_y in lines_map.keys():
            if abs(existing_y - y) < 4.0:
                y_group = existing_y
                break
        if y_group is None:
            y_group = y
        lines_map[y_group].append(item)

    # Statistical Pre-pass for Metrics (Clustered by Font/X)
    # We group bullets by (X-anchor, font) to avoid cross-pollinating sizes
    bullet_groups = defaultdict(list)
    content_clusters = defaultdict(list)
    
    for y_val in lines_map.keys():
        group = sorted(lines_map[y_val], key=lambda x: x["origin"][0])
        if not group: continue
        content = group[0]["content"].strip()
        if any(content.startswith(b) for b in ALL_MARKERS):
            marker_it = group[0]
            # Key: (closest_x_anchor, font)
            closest_anchor = min(canonical_x_anchors, key=lambda a: abs(a - marker_it["origin"][0])) if canonical_x_anchors else marker_it["origin"][0]
            group_key = (round(closest_anchor, 1), marker_it["font"])
            
            bullet_groups[group_key].append(marker_it.get("height", marker_it["size"]))
            
            for it in group[1:]:
                if it.get("content", "").strip():
                    content_clusters[group_key].append(round(it["origin"][0], 2))
                    break
    
    # Calculate medians per cluster
    cluster_medians = {k: sorted(v)[len(v)//2] for k, v in bullet_groups.items()}
    cluster_content_anchors = {}
    for k, v in content_clusters.items():
        counts = Counter(v)
        # Only pick a content anchor if it's statistically significant for THIS cluster
        cluster_content_anchors[k] = [val for val, count in counts.most_common(2) if count > 1]

    processed_lines = []
    for y_val in sorted(lines_map.keys()):
        raw_group = sorted(lines_map[y_val], key=lambda x: x["origin"][0])
        if not raw_group: continue

        # --- HORIZONTAL GAP SPLITTING (Date separation) ---
        # Separates text elements sharing a line with large horizontal space (e.g., Title vs Date)
        sub_groups = []
        current_sub = [raw_group[0]]
        for i in range(1, len(raw_group)):
            prev_it = raw_group[i-1]
            curr_it = raw_group[i]
            gap = curr_it["origin"][0] - prev_it["bbox"][2]
            if gap > 50:
                sub_groups.append(current_sub)
                current_sub = [curr_it]
            else:
                current_sub.append(curr_it)
        sub_groups.append(current_sub)

        for group in sub_groups:
            raw_x0 = group[0]["origin"][0]
            raw_x1 = group[-1]["bbox"][2]
            line_content = "".join(it["content"] for it in group)
            is_bullet = any(line_content.strip().startswith(b) for b in ALL_MARKERS)
            
            # --- DOUBLE-PILLAR SNAPPING ---
            snapped_x = raw_x0
            is_right_aligned = False
            
            # 1. Check for Right-Margin Snap (Dates/Metadata)
            for r_anchor in canonical_right_anchors:
                if abs(raw_x1 - r_anchor) < 3.0:
                    shift = r_anchor - raw_x1
                    snapped_x += shift
                    is_right_aligned = True
                    break
            
            if not is_right_aligned:
                # 2. Check for Left-Margin Snap
                for anchor in canonical_x_anchors:
                    if abs(raw_x0 - anchor) < 1.05:
                        snapped_x = anchor
                        break
            
            # --- CLUSTERED SHIFT ---
            marker_shift = snapped_x - raw_x0
            closest_anchor = min(canonical_x_anchors, key=lambda a: abs(a - raw_x0)) if canonical_x_anchors else raw_x0
            cluster_key = (round(closest_anchor, 1), group[0]["font"])
            
            for it in group:
                it["origin"][0] += marker_shift
                it["bbox"][0] += marker_shift
                it["bbox"][2] += marker_shift
                it["x"] = it["origin"][0]

            # 3. Normalize Marker Size (Local Cluster only)
            if is_bullet and cluster_key in cluster_medians:
                target_size = cluster_medians[cluster_key]
                # Protection: don't shift more than 30% to avoid blowing up mixed fonts
                if 0.7 < (target_size / group[0]["size"]) < 1.3:
                    group[0]["size"] = target_size
                    group[0]["is_normalized_bullet"] = True

            # 4. Snap the Content Anchor (Hanging indent)
            if is_bullet and len(group) > 1:
                content_it_idx = -1
                for i in range(1, len(group)):
                    if group[i].get("content", "").strip():
                        content_it_idx = i
                        break
                
                if content_it_idx != -1:
                    content_it = group[content_it_idx]
                    raw_content_x = content_it["origin"][0]
                    snapped_content_x = raw_content_x
                    
                    # Only snap if there is a local cluster anchor for THIS level/font
                    anchors = cluster_content_anchors.get(cluster_key, [])
                    for c_anchor in anchors:
                        if abs(raw_content_x - c_anchor) < 3.0:
                            snapped_content_x = c_anchor
                            break
                    
                    content_shift = snapped_content_x - raw_content_x
                    
                    # LOGS: Cluster-Aware diagnostic
                    extracted_dist = round(raw_content_x - raw_x0, 3)
                    actual_dist = round(snapped_content_x - snapped_x, 3)
                    print("==================================================")
                    print(f"[CLUSTERED BULLET] Font: {cluster_key[1]} | Size: {group[0]['size']:.2f}")
                    print(f"  Extracted Dist: {extracted_dist} | Actual Dist: {actual_dist}")
                    print(f"  Snippet: {line_content[:20]}...")
                    print("==================================================")

                    for it in group[content_it_idx:]:
                        it["origin"][0] += content_shift
                        it["bbox"][0] += content_shift
                        it["bbox"][2] += content_shift
                        it["x"] = it["origin"][0]

            # Group items by URI to treat different links as separate lines for editing
            chunked_items = []
            if group:
                current_chunk = [group[0]]
                current_uri = group[0].get("uri")
                for it in group[1:]:
                    it_uri = it.get("uri")
                    # If both are None, or they are the same value, group together
                    if it_uri == current_uri:
                        current_chunk.append(it)
                    else:
                        chunked_items.append((current_chunk, current_uri))
                        current_chunk = [it]
                        current_uri = it_uri
                chunked_items.append((current_chunk, current_uri))

            for chunk_idx, (chunk, uri) in enumerate(chunked_items):
                chunk_content = "".join(it["content"] for it in chunk)
                is_first_chunk = (chunk_idx == 0)
                
                processed_lines.append({
                    "y": y_val,
                    "x0": chunk[0]["origin"][0],
                    "x1": max(it["bbox"][2] for it in chunk),
                    "height": max(it.get("height", it["size"]) for it in chunk),
                    "size": max(it["size"] for it in chunk),
                    "items": chunk,
                    "content": chunk_content,
                    "is_bullet_start": is_bullet if is_first_chunk else False,
                    "is_right_aligned": is_right_aligned,
                    "marker_char": chunk_content.strip()[0] if is_bullet and is_first_chunk else None,
                    "uri": uri
                })

    # --- PHASE 3: SEMANTIC BLOCK RECONSTRUCTION ---
    blocks = []
    current_block = None
    last_y = -1000

    for line in processed_lines:
        y_gap = line["y"] - last_y
        max_gap = (canonical_leading * 1.5) if canonical_leading > 0 else (line["size"] * 1.5)
        is_proximal = abs(y_gap) < max_gap
        
        # Metadata or bullet markers trigger new blocks
        should_start_new = (
            current_block is None or 
            not is_proximal or 
            line.get("is_bullet_start") or
            line.get("is_right_aligned") or
            current_block.get("is_right_aligned")
        )

        if not should_start_new:
            if abs(line["x0"] - current_block["indentX"]) > 0.5:
                if current_block["type"] == "list-item":
                    if abs(line["x0"] - current_block["textX"]) > 0.5:
                        should_start_new = True
                else:
                    should_start_new = True

        if should_start_new:
            if current_block:
                blocks.append(current_block)
            
            block_type = "list-item" if line.get("is_bullet_start") else "paragraph"
            if line.get("is_right_aligned"): block_type = "metadata"

            text_x = line["x0"]
            if block_type == "list-item" and len(line["items"]) > 1:
                # Find first item after bullet with real content
                for it in line["items"][1:]:
                    if it.get("content", "").strip():
                        text_x = it["origin"][0]
                        break
            if text_x == line["x0"] and block_type == "list-item":
                text_x += 15

            current_block = {
                "id": str(uuid.uuid4()),
                "type": block_type,
                "is_right_aligned": line.get("is_right_aligned"),
                "lines": [],
                "bbox": [line["x0"], line["y"] - line["size"], line["x1"], line["y"]],
                "indentX": line["x0"],
                "textX": text_x,
                "style": {
                    "font": line["items"][0].get("font"),
                    "size": line["size"]
                },
                "uri": line.get("uri")
            }
            if line.get("is_bullet_start"):
                current_block["marker"] = line.get("marker_char", "•")

        # Map line items to the block
        for it in line["items"]:
            it["block_id"] = current_block["id"]
            
        current_block["lines"].append({
            "id": str(uuid.uuid4()),
            "content": line["content"],
            "y": line["y"],
            "x0": line["x0"],
            "x1": line["x1"],
            "size": line["size"],
            "height": line["height"],
            "is_bullet_start": line.get("is_bullet_start", False),
            "uri": line.get("uri"),
            "items": line["items"],
            # --- THE FRAGMENT CORE (Inline Styles) ---
            "fragments": [{
                "text": it["content"],
                "font": it["font"],
                "size": it["size"],
                "is_bold": bool(it.get("flags", 0) & 16),
                "is_italic": bool(it.get("flags", 0) & 2),
                "origin": it["origin"]
            } for it in line["items"]]
        })
        
        current_block["bbox"][0] = min(current_block["bbox"][0], line["x0"])
        current_block["bbox"][1] = min(current_block["bbox"][1], line["y"] - line["size"])
        current_block["bbox"][2] = max(current_block["bbox"][2], line["x1"])
        current_block["bbox"][3] = max(current_block["bbox"][3], line["y"])
        
        last_y = line["y"]

    if current_block:
        blocks.append(current_block)

    # --- PHASE 4: NESTING & STATS ---
    list_blocks = [b for b in blocks if b["type"] == "list-item"]
    if list_blocks:
        seen_indents = sorted(list(set(b["indentX"] for b in list_blocks)))
        for b in list_blocks:
            b["level"] = seen_indents.index(b["indentX"])

    return {
        "blocks": blocks,
        "bg_items": other_items,
        "stats": {
            "leading": canonical_leading,
            "anchors": len(canonical_x_anchors) + len(canonical_right_anchors)
        }
    }
