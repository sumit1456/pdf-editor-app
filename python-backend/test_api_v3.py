import requests
import json

def test_api_v3():
    url = "http://localhost:8000/extract-pdf"
    files = {'file': open('nable_python.pdf', 'rb')}
    
    print(f"Requesting {url}...")
    try:
        response = requests.post(url, files=files)
        if response.status_code == 200:
            data = response.json()
            pages = data.get('pages', [])
            if pages:
                first_page = pages[0]
                blocks = first_page.get('blocks', [])
                fonts = data.get('fonts', [])
                
                print(f"Success!")
                print(f"Found {len(pages)} pages.")
                print(f"Found {len(blocks)} blocks on page 1.")
                print(f"Found {len(fonts)} fonts extracted.")
                
                if fonts and fonts[0].get('metrics'):
                    print(f"Check: Font Metrics Harvester... [OK]")
                else:
                    print(f"Check: Font Metrics Harvester... [MISSING]")
                
                if blocks and 'lines' in blocks[0]:
                    print(f"Check: Block Tree Format... [OK]")
                else:
                    print(f"Check: Block Tree Format... [MISSING]")
            else:
                print("Error: No pages found in response.")
        else:
            print(f"Error: Server returned status {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"Failed to connect to server: {e}")

if __name__ == "__main__":
    test_api_v3()
