import json

def check_json(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    page = data['pages'][0]
    items = page['items']
    
    print(f"Page Height: {page.get('height')}")
    
    # Check for specific text
    text_items = [i for i in items if i.get('type') == 'text']
    for i in text_items:
        if 'Abhishek' in i.get('content', ''):
             print(f"TEXT: '{i.get('content')}' | Origin: {i.get('origin')} | BBox: {i.get('bbox')}")
    
    # Check for paths that might be drawing text outlines
    print("\n--- Path Sample ---")
    paths = [i for i in items if i.get('type') in ('path_move', 'path_line', 'fill', 'stroke')]
    for p in paths[:20]:
        print(p)

if __name__ == "__main__":
    check_json('resume_16_extraction.json')
