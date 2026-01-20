import urllib.request
import os

fonts = {
    "fa-brands-400.ttf": "https://raw.githubusercontent.com/FortAwesome/Font-Awesome/5.x/webfonts/fa-brands-400.ttf",
    "fa-solid-900.ttf": "https://raw.githubusercontent.com/FortAwesome/Font-Awesome/5.x/webfonts/fa-solid-900.ttf"
}

target_dir = "fonts"
os.makedirs(target_dir, exist_ok=True)

for name, url in fonts.items():
    print(f"Downloading {name}...")
    try:
        urllib.request.urlretrieve(url, os.path.join(target_dir, name))
        print(f"Successfully saved {name}")
    except Exception as e:
        print(f"Failed to download {name}: {e}")
