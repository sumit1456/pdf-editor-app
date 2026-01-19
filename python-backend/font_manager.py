import os

class FontManager:
    def __init__(self, fonts_dir=None):
        if fonts_dir is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            fonts_dir = os.path.join(base_dir, "fonts")
        self.fonts_dir = fonts_dir

    @staticmethod
    def get_folder_name(family_keyword):
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
            "pt serif": "PT_Serif",
            "pt sans": "PT_Sans",
            "orbitron": "Orbitron",
            "dancing script": "Dancing_Script",
            "cm": "Source_Serif_4", 
            "sfrm": "Source_Serif_4",
            "times": "Source_Serif_4",
            "roman": "Source_Serif_4",
            "georgia": "Source_Serif_4",
            "palatino": "Source_Serif_4",
            "cambria": "Source_Serif_4",
            "garamond": "Crimson_Pro",
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
            "geometric": "Poppins",
            "mono": "Roboto_Mono",
            "courier": "Roboto_Mono",
            "console": "Roboto_Mono",
            "terminal": "Roboto_Mono",
            "fixed": "Roboto_Mono",
            "symbol": "Inter",
            "fontawesome": "Inter",
            "brands": "Inter",
            "script": "Dancing_Script",
            "cursive": "Dancing_Script",
            "handwriting": "Dancing_Script",
            "calligraphy": "Dancing_Script",
            "techno": "Orbitron",
            "futuristic": "Orbitron",
            "cmsy": "Source_Serif_4",
            "msbm": "Source_Serif_4"
        }
        
        family_keyword = (family_keyword or "").lower()
        clean_name = family_keyword.replace("'", "").replace('"', '').strip()

        # 1.1 Direct Folder Match
        for folder in set(family_map.values()):
            if clean_name.lower() == folder.lower().replace("_", " "):
                return folder
        
        # 1.2 Keyword Heuristic
        for key, folder in family_map.items():
            if key in family_keyword:
                return folder
        
        return "Inter" # Default

    def get_font_path(self, family_keyword, is_bold=False, is_italic=False, original_context=None):
        """
        The standardized Font Resolver.
        Expects fonts to be in 'Folder/Folder-Weight.ttf' format.
        """
        target_folder = self.get_folder_name(family_keyword)
        
        # USE ORIGINAL CONTEXT FOR SUBTYPE DETECTION (e.g. Small Caps)
        # If original_context is provided, we check it for specific LaTeX markers
        context = (original_context or family_keyword).lower()

        # 2. Base Weight Detection
        base_weight = "Regular"
        if any(x in context for x in ["black", "heavy", "900"]):
            base_weight = "Black"
        elif any(x in context for x in ["extrabold", "800"]):
            base_weight = "ExtraBold"
        elif is_bold or any(x in context for x in ["bold", "700", "cmbx"]):
            base_weight = "Bold"
        elif any(x in context for x in ["semibold", "demi", "600"]):
            base_weight = "SemiBold"
        elif any(x in context for x in ["medium", "500"]):
            base_weight = "Medium"
        elif any(x in context for x in ["extralight", "200"]):
            base_weight = "ExtraLight"
        elif any(x in context for x in ["light", "300"]):
            base_weight = "Light"

        # 3. PRECISION OPTICAL CALIBRATION MATRIX
        # PDF rendering is ~15-20% heavier than browser rendering. 
        # We down-shift selectively to maintain visual parity.
        optical_twin = base_weight 

        if "Source_Serif_4" in target_folder:
            # ACADEMIC SERIF CALIBRATION
            
            # --- SPECIAL VISUAL OVERRIDES FOR COMPUTER MODERN ---
            if "cmbx" in context:
                 # CMBX10 (Computer Modern Bold Extended) needs to be PHYSICALLY BOLD (700)
                 # We override generic "down-shifting" logic here.
                 base_weight = "Bold"
                 optical_twin = "Bold" 
            
            elif "cmcsc" in context:
                # CMCSC10 (Small Caps) needs distinct visual weight. 
                # Medium (500) is the closest visual proxy for small caps presence.
                base_weight = "Medium"
                optical_twin = "Medium"

            else:
                # STANDARD DOWN-SHIFTING FOR GENERIC FONTS (Prevents "muddy" pages)
                SERIF_MAP = {
                    "Black": "Black",
                    "ExtraBold": "ExtraBold",
                    "Bold": "Bold",          # Keep Bold (700)
                    "SemiBold": "SemiBold",  # Keep SemiBold (600)
                    "Medium": "Medium",
                    "Regular": "Regular",
                    "Light": "Light",
                    "ExtraLight": "ExtraLight"
                }
                optical_twin = SERIF_MAP.get(base_weight, "Regular")
                
                # ELEGANT ITALIC RULE
                if is_italic and base_weight == "Regular":
                    optical_twin = "Light"

        else:
            # MODERN SANS CALIBRATION (Inter / Roboto)
            SANS_MAP = {
                "Black": "ExtraBold",
                "ExtraBold": "Bold",
                "Bold": "SemiBold",     # Inter Bold is too heavy in PDF
                "SemiBold": "Medium",
                "Medium": "Regular",
                "Regular": "Regular",
                "Light": "Light"
            }
            optical_twin = SANS_MAP.get(base_weight, "Regular")

        requested_weight = base_weight # For fallback chain
        is_truly_bold = is_bold or base_weight in ["Bold", "SemiBold", "ExtraBold", "Black"]

        # 4. Handle Italics
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
            # print(log_msg)
            with open("font_mapping.log", "a") as f:
                f.write(log_msg + "\n")
            return font_path, current_choice.replace(".ttf", "")
        
        main_attempt = f"{target_folder}-{get_full_style(requested_weight)}.ttf"
        err_msg = f"[FontManager] NO MATCH for '{family_keyword}' (tried: {main_attempt})"
        # print(err_msg)
        with open("font_mapping.log", "a") as f:
            f.write(err_msg + "\n")
        return None, None

font_manager = FontManager()
