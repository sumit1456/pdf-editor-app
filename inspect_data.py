import json

def inspect_page_1_data(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    page = data['pages'][0]
    items = page['items']
    text_items = [i for i in items if i.get('type') == 'text']
    
    print(f"--- Page 1: First 40 Text Items ---")
    print(f"{'Content':<10} | {'X1':<10} | {'Y1':<10} | {'X2':<10} | {'Y2':<10}")
    print("-" * 60)
    
    for item in text_items[:100]:
        content = item.get('content', '')
        bbox = item.get('bbox', [0,0,0,0])
        print(f"'{content}' | {bbox[0]:.2f} | {bbox[1]:.2f} | {bbox[2]:.2f} | {bbox[3]:.2f}")

if __name__ == "__main__":
    inspect_page_1_data('servlet_jsp_extraction.json')
