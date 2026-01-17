import os

class FontManager:
    def __init__(self, fonts_dir=None):
        if fonts_dir is None:
            # Anchor to the absolute path of the python-backend/fonts folder
            # This prevents injection fails when running server from root or other dirs
            base_dir = os.path.dirname(os.path.abspath(__file__))
            fonts_dir = os.path.join(base_dir, "fonts")
        self.fonts_dir = fonts_dir
        self.font_cache = {} # (family, weight) -> path

    def get_font_path(self, family_keyword, is_bold=False, is_italic=False):
        """
        Finds the best matching .ttf path from our assets.
        """
        family_keyword = (family_keyword or "").lower()
        
        # 1. Determine target weight string
        if is_bold and is_italic: weight = "BoldItalic"
        elif is_bold: weight = "Bold"
        elif is_italic: weight = "Italic"
        else: weight = "Regular"

        # 2. Map PDF keywords to our specific folder names
        # Order matters! Specific matches first.
        family_map = {
            "roboto mono": "Roboto_Mono",
            "jetbrains mono": "JetBrains_Mono",
            "fira code": "Fira_Code",
            "open sans": "Open_Sans",
            "playfair display": "Playfair_Display",
            "libre baskerville": "Libre_Baskerville",
            "source serif": "Source_Serif_4",
            "crimson pro": "Crimson_Pro",
            "inter": "Inter",
            "roboto": "Roboto",
            "lora": "Lora",
            "poppins": "Poppins",
            "montserrat": "Montserrat",
            "merriweather": "Merriweather",
            "oswald": "Oswald",
            "ubuntu": "Ubuntu",
            "arial": "Inter",
            "helvetica": "Inter",
            "calibri": "Inter",
            "verdana": "Inter",
            "tahoma": "Inter",
            "mono": "Roboto_Mono",
            "courier": "Roboto_Mono",
            "times": "Source_Serif_4",
            "roman": "Source_Serif_4",
            "georgia": "Source_Serif_4",
            "palatino": "Source_Serif_4",
            "minion": "Source_Serif_4",
            "baskerville": "Source_Serif_4",
            "cambria": "Source_Serif_4",
            "garamond": "Source_Serif_4",
            "libertine": "Source_Serif_4",
            "cm": "Source_Serif_4", # LaTeX
            "sfrm": "Source_Serif_4",
            "nimbus": "Source_Serif_4",
        }

        target_family = None
        # Use an ordered check (we expect the dict to maintain order in Python 3.7+)
        for key, folder in family_map.items():
            if key in family_keyword:
                target_family = folder
                break
        
        # Fallback based on serif/sans if no direct name match
        if not target_family:
            if any(k in family_keyword for k in ["cm", "sfrm", "serif", "roman", "times", "nimbus"]):
                target_family = "Source_Serif_4" # Best match for LaTeX Look
            elif "mono" in family_keyword or "courier" in family_keyword or "fira" in family_keyword:
                target_family = "Roboto_Mono"
            else:
                target_family = "Inter"

        print(f"[FontManager] Mapping '{family_keyword}' (Bold={is_bold}) -> {target_family}")

        # 3. Construct the filename we created in optimization
        font_filename = f"{target_family}-{weight}.ttf"
        font_path = os.path.join(self.fonts_dir, target_family, font_filename)

        # Check if BoldItalic exists, fallback to Bold or Regular if not
        if not os.path.exists(font_path):
            if is_bold and is_italic:
                # Try Bold or Italic individually
                font_path = os.path.join(self.fonts_dir, target_family, f"{target_family}-Bold.ttf")
                if not os.path.exists(font_path):
                    font_path = os.path.join(self.fonts_dir, target_family, f"{target_family}-Regular.ttf")
            elif is_bold or is_italic:
                font_path = os.path.join(self.fonts_dir, target_family, f"{target_family}-Regular.ttf")

        if os.path.exists(font_path):
            return font_path, f"{target_family}-{weight}"
        
        return None, None

font_manager = FontManager()
