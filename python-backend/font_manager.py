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
            "sfrm": "Source_Serif_4",
            "times": "Source_Serif_4",
            "roman": "Source_Serif_4",
            "georgia": "Source_Serif_4",
            "palatino": "Source_Serif_4",
            "cambria": "Source_Serif_4",
            "garamond": "Source_Serif_4",
            "libertine": "Source_Serif_4",
            "didot": "Source_Serif_4",
            "serif": "Source_Serif_4",
            "sans": "Inter",
            "arial": "Inter",
            "helvetica": "Inter",
            "calibri": "Inter",
            "verdana": "Inter",
            "tahoma": "Inter",
            "modern": "Inter",
            "geometric": "Inter",
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
        # Mapping for Optical Down-Shifting (PDF engines render ~15% thicker than browsers)
        # Systematic Down-Shift Scale:
        # Black -> Bold
        # ExtraBold -> SemiBold
        # Bold -> Medium
        # SemiBold -> Regular
        # Medium -> Regular
        # Regular -> Light (Experimental for better matching)
        
        is_truly_bold = is_bold

        optical_twin = None
        if any(x in family_keyword for x in ["black", "heavy", "900"]):
            requested_weight = "Black"
            optical_twin = "ExtraBold"
        elif any(x in family_keyword for x in ["extrabold", "800"]):
            requested_weight = "ExtraBold"
            optical_twin = "Bold"
        elif is_truly_bold:
            requested_weight = "Bold"
            # Calibration: Mapping 700 (Bold) to 600 (SemiBold) for PDF fidelity
            optical_twin = "SemiBold" 
        elif any(x in family_keyword for x in ["semibold", "demi", "600"]):
            requested_weight = "SemiBold"
            # Mapping 600 (SemiBold) to 500 (Medium)
            optical_twin = "Medium"
        elif any(x in family_keyword for x in ["medium", "500"]):
            requested_weight = "Medium"
            optical_twin = "Regular"
        else:
            requested_weight = "Regular"
            # FIDELITY FIX: For Classic/LaTeX fonts, Regular is too heavy.
            # Shifting to Light for these specific patterns.
            if any(x in family_keyword for x in ["cm", "sfrm", "roman", "times", "serif"]):
                optical_twin = "Light"
            else:
                optical_twin = "Regular"

        # 3. Handle Italics
        style_suffix = "Italic" if is_italic else ""
        def get_full_style(w):
            if w == "Regular" and is_italic: return "Italic"
            return f"{w}{style_suffix}"

        # 4. Construct Path & Fallback Chain (Prioritizing Optical Twin)
        attempts = []
        
        # Priority 1: Lighter version (Optical Twin)
        if optical_twin:
            attempts.append(f"{target_folder}-{get_full_style(optical_twin)}.ttf")
            attempts.append(f"{target_folder.replace('_', '')}-{get_full_style(optical_twin)}.ttf")
        
        # Priority 2: Actual requested weight
        attempts.append(f"{target_folder}-{get_full_style(requested_weight)}.ttf")
        attempts.append(f"{target_folder.replace('_', '')}-{get_full_style(requested_weight)}.ttf")
        
        # Priority 3: Systematic Fallbacks
        if is_truly_bold:
            # If Bold/Medium twin failed, try SemiBold
            attempts.append(f"{target_folder}-SemiBold{style_suffix}.ttf")
            attempts.append(f"{target_folder}-Bold{style_suffix}.ttf")
        
        if is_italic:
            attempts.append(f"{target_folder}-RegularItalic.ttf")
            attempts.append(f"{target_folder}-Italic.ttf")
            attempts.append(f"{target_folder}-LightItalic.ttf")
        
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
            log_msg = f"[FontManager] MAPPED: '{family_keyword}' -> {current_choice} (is_bold={is_bold}, is_italic={is_italic})"
            print(log_msg)
            with open("font_mapping.log", "a") as f:
                f.write(log_msg + "\n")
            return font_path, current_choice.replace(".ttf", "")
        
        main_attempt = f"{target_folder}-{get_full_style(requested_weight)}.ttf"
        err_msg = f"[FontManager] NO MATCH for '{family_keyword}' (tried: {main_attempt})"
        print(err_msg)
        with open("font_mapping.log", "a") as f:
            f.write(err_msg + "\n")
        return None, None

font_manager = FontManager()
