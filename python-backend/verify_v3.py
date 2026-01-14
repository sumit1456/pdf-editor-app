import json
import os

def verify_v3_architecture():
    print("=== V3 ARCHITECTURAL VERIFICATION ===")
    
    json_path = 'nable_python_blocks.json'
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found. Run dump_blocks_json.py first.")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    blocks = data.get('blocks', [])
    print(f"\n1. Block Tree Integrity:")
    print(f"   - Total Blocks Found: {len(blocks)}")
    
    # Check for List Items and Paragraphs
    list_items = [b for b in blocks if b['type'] == 'list-item']
    paragraphs = [b for b in blocks if b['type'] == 'paragraph']
    print(f"   - Paragraphs: {len(paragraphs)}")
    print(f"   - List Items: {len(list_items)}")

    # 2. Semantic Grouping Check (Check if multi-line regions are grouped)
    multi_line_blocks = [b for b in blocks if len(b['lines']) > 1]
    print(f"\n2. Semantic Grouping:")
    print(f"   - Multiline Blocks: {len(multi_line_blocks)}")
    if multi_line_blocks:
        first_multi = multi_line_blocks[0]
        print(f"   - Sample Block [{first_multi['id'][:8]}]: type={first_multi['type']}, lines={len(first_multi['lines'])}")
        for i, line in enumerate(first_multi['lines']):
            print(f"     Line {i}: {line['content'][:50]}...")

    # 3. Geometric Enforcements
    print(f"\n3. Geometric Enforcements:")
    if list_items:
        li = list_items[0]
        print(f"   - List Marker detected: '{li.get('marker')}'")
        print(f"   - Content Anchor (textX): {li.get('textX'):.2f}px")
        # Verify alignment of wrapped lines
        if len(li['lines']) > 1:
            wrapped_x = li['lines'][1]['items'][0]['origin'][0]
            print(f"   - Wrapped Line Alignment: {wrapped_x:.2f}px (Target: {li.get('textX'):.2f}px)")
            if abs(wrapped_x - li.get('textX')) < 0.5:
                print("     [OK] Hanging indent strictly enforced.")

    print("\n=== VERIFICATION COMPLETE ===")

if __name__ == "__main__":
    verify_v3_architecture()
