import json

def verify_tech_stack_coords():
    with open('nable_python_blocks.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    found = False
    print("=== TECH STACK COORDINATE REPORT ===\n")
    
    for block in data['blocks']:
        for line in block['lines']:
            if "Programming Languages" in line['content']:
                found = True
                print(f"Block ID: {block['id']}")
                print(f"Type: {block['type']}")
                print(f"Total Content: {line['content']}")
                print("-" * 40)
                
                for item in line['items']:
                    print(f"Item: '{item['content']}'")
                    print(f"  X: {item['origin'][0]:.2f}, Y: {item['origin'][1]:.2f}")
                    print(f"  X0: {item['bbox'][0]:.2f}, X1: {item['bbox'][2]:.2f}")
                    print(f"  Font: {item['font']}")

    if not found:
        # Check all lines just in case
        for block in data['blocks']:
            for line in block['lines']:
                if "Python" in line['content'] or "Java" in line['content']:
                    print(f"Block ID: {block['id']} | Content: {line['content']}")
                    for item in line['items']:
                         print(f"  '{item['content']}' at {item['origin']}")

if __name__ == "__main__":
    verify_tech_stack_coords()
