import os

class FontManager:
    def __init__(self, fonts_dir=None):
        if fonts_dir is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            fonts_dir = os.path.join(base_dir, "fonts")
        self.fonts_dir = fonts_dir

    def get_font_path(self, family_keyword, is_bold=False, is_italic=False):
        """
        The standardized Font Resolver.
        Expects fonts to be in 'Folder/Folder-Weight.ttf' format.
        """
        family_keyword = (family_keyword or "").lower()
        
        # 1. Map keywords to our 13 Elite Folder names
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
            "cm": "Source_Serif_4", 
            "serif": "Source_Serif_4",
            "sans": "Inter",
            "mono": "Roboto_Mono",
            "symbol": "zapf",
            "fontawesome": "zapf"
        }

        target_folder = "Inter" 
        for key, folder in family_map.items():
            if key in family_keyword:
                target_folder = folder
                break

        # 2. Determine Weight Spectrum (Fidelity Fix)
        # OPTICAL CALIBRATION: PDF engines render TTF files 'heavier' than browsers.
        # We now perform a systematic down-shift for all 'Bold-Class' weights.
        requested_weight = "Regular"
        optical_twin = None # The lighter version to try first
        
        # Mapping for Optical Down-Shifting
        is_truly_bold = is_bold or any(x in family_keyword for x in ["bold", "700"])
        
        # SKEPTICISM LAYER: If it's an Italic, don't trust the 'Bold' flag 
        # unless 'bold' is actually in the font name keyword.
        if is_italic and is_bold and "bold" not in family_keyword:
            is_truly_bold = False

        if any(x in family_keyword for x in ["black", "heavy", "900"]):
            requested_weight = "Black"
            optical_twin = "ExtraBold"
        elif any(x in family_keyword for x in ["extrabold", "800"]):
            requested_weight = "ExtraBold"
            optical_twin = "Bold"
        elif is_truly_bold:
            requested_weight = "Bold"
            optical_twin = "SemiBold"
        elif any(x in family_keyword for x in ["semibold", "demi", "600"]):
            requested_weight = "SemiBold"
            optical_twin = "Medium"
        elif any(x in family_keyword for x in ["medium", "500"]):
            requested_weight = "Medium"
            # Medium is the last 'Bold-Class', it falls back to Regular if too thick
            optical_twin = "Regular"
        elif any(x in family_keyword for x in ["extralight", "100", "200"]):
            requested_weight = "ExtraLight"
        elif any(x in family_keyword for x in ["light", "thin", "300"]):
            requested_weight = "Light"

        # 3. Handle Italics
        style_suffix = "Italic" if is_italic else ""
        def get_full_style(w):
            if w == "Regular" and is_italic: return "Italic"
            return f"{w}{style_suffix}"

        # 4. Construct Path & Fallback Chain (Prioritizing Optical Twin)
        attempts = []
        if optical_twin:
            attempts.append(f"{target_folder}-{get_full_style(optical_twin)}.ttf")
            attempts.append(f"{target_folder.replace('_', '')}-{get_full_style(optical_twin)}.ttf")
        
        # Then try the actual requested weight
        attempts.append(f"{target_folder}-{get_full_style(requested_weight)}.ttf")
        attempts.append(f"{target_folder.replace('_', '')}-{get_full_style(requested_weight)}.ttf")
        
        # Generic fallbacks
        attempts.append(f"{target_folder}-Bold{style_suffix}.ttf" if is_truly_bold else f"{target_folder}-Regular{style_suffix}.ttf")
        # Ensure we fall back to an italic version if we started with one
        if is_italic:
            attempts.append(f"{target_folder}-Italic.ttf")
        attempts.append(f"{target_folder}-Regular.ttf")

        font_path = None
        current_choice = None
        for attempt in attempts:
            candidate = os.path.join(self.fonts_dir, target_folder, attempt)
            if os.path.exists(candidate):
                font_path = candidate
                current_choice = attempt
                break

        if font_path:
            print(f"[FontManager] MAPPED: '{family_keyword}' -> {current_choice}")
            return font_path, current_choice.replace(".ttf", "")
        
        main_attempt = f"{target_folder}-{get_full_style(requested_weight)}.ttf"
        print(f"[FontManager] NO MATCH for '{family_keyword}' (tried: {main_attempt})")
        return None, None

font_manager = FontManager()
