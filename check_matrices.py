import json

def check_matrices(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    page = data['pages'][0]
    text_items = [i for i in page['items'] if i.get('type') == 'text']
    
    non_id = [i for i in text_items if i.get('matrix') != [1.0, 0.0, 0.0, 1.0, 0.0, 0.0] and i.get('matrix') != [1, 0, 0, 1, 0, 0]]
    print(f"Total text items: {len(text_items)}")
    print(f"Non-identity matrices: {len(non_id)}")
    if non_id:
        print(f"First non-identity: {non_id[0]['content']} | {non_id[0]['matrix']}")

if __name__ == "__main__":
    check_matrices('servlet_jsp_extraction.json')
