import fitz  # PyMuPDF
import base64
import re
import io
import tempfile
import os
import subprocess

class PDFExtractor:
    def __init__(self, pdf_path):
        self.doc = fitz.open(pdf_path)

    def extract(self):
        pages_data = []
        self.font_map = {} # xref -> font_name
        
        for i, page in enumerate(self.doc):
            pages_data.append(self._extract_page(page, i))
            
        # Extract binary data for all collected fonts
        fonts_data = self._extract_font_binaries()
            
        return {
            "pages": pages_data,
            "fonts": fonts_data
        }

    def _extract_page(self, page, index):
        width = page.rect.width
        height = page.rect.height
        rotation = page.rotation
        
        # Extract Text with detailed spans
        text_items = self._extract_text(page)
        
        # Extract Vector Graphics
        path_items = self._extract_paths(page)
        
        # Extract Images
        image_items = self._extract_images(page)
        
        return {
            "page_index": index,
            "width": width,
            "height": height,
            "rotation": rotation,
            "items": text_items + path_items + image_items
        }

    def _extract_text(self, page):
        items = []
        text_dict = page.get_text("dict")
        
        # Get font xrefs for this page
        page_fonts = page.get_fonts()
        font_name_to_xref = {}
        for f in page_fonts:
            xref = f[0]
            basefont = f[3] if len(f) > 3 else None
            name = f[4] if len(f) > 4 else None
            
            if basefont: font_name_to_xref[basefont] = xref
            if name: font_name_to_xref[name] = xref
            # Handle subset naming "ABCDEF+FontName"
            if basefont and "+" in basefont:
                font_name_to_xref[basefont.split("+")[-1]] = xref
        
        for block in text_dict.get("blocks", []):
            if block.get("type") == 0:  # Text block
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                            raw_font = span["font"]
                            # Clean subset prefix (e.g., AAAAAA+FontName)
                            font_name = raw_font
                            if "+" in raw_font:
                                font_name = raw_font.split("+")[-1]

                            xref = font_name_to_xref.get(raw_font)
                            if xref and xref not in self.font_map:
                                self.font_map[xref] = font_name
                                
                            flags = span["flags"]
                            is_italic = bool(flags & 1)
                            is_monospaced = bool(flags & 2)
                            is_serif = bool(flags & 4)
                            is_bold = bool(flags & 16)
                            
                            # --- HEURISTIC FALLBACK ---
                            # Many PDFs (especially LaTeX/Computer Modern) don't set flags correctly.
                            # We check the font name as a secondary source of truth.
                            font_upper = font_name.upper()
                            
                            # Bold heuristic
                            if not is_bold:
                                if any(x in font_upper for x in ["BOLD", "CMBX", "BD", "BLACK", "HEAVY"]):
                                    is_bold = True
                                    
                            # Italic heuristic
                            if not is_italic:
                                if any(x in font_upper for x in ["ITALIC", "OBLIQUE", "IT", "TI", "SL"]):
                                    is_italic = True
                            
                            items.append({
                                "type": "text",
                                "content": span["text"],
                                "font": font_name,
                                "raw_font": raw_font,
                                "size": span["size"],
                                "color": self._rgb_to_hex(span["color"]),
                                "bbox": list(span["bbox"]),
                                "origin": list(span["origin"]),
                                "flags": flags,
                                "is_bold": is_bold,
                                "is_italic": is_italic,
                                "is_monospaced": is_monospaced,
                                "is_serif": is_serif,
                                "matrix": list(line.get("dir", [1, 0])), # Simple orientation
                                "chars": self._extract_chars(span)
                            })
        return items

    def _extract_chars(self, span):
        # PyMuPDF span already has some char info, but we can refine if needed
        # For high fidelity, we'd need more details, but span is often enough for starters.
        # Adding chars dummy for schema consistency if needed, but let's stick to spans first
        return []

    def _extract_paths(self, page):
        items = []
        # Get path details
        paths = page.get_drawings()
        
        for p in paths:
            segments = []
            for item in p["items"]:
                if item[0] == "m": # move
                    segments.append({"type": "m", "x": item[1].x, "y": item[1].y})
                elif item[0] == "l": # line
                    segments.append({"type": "l", "pts": [[item[1].x, item[1].y], [item[2].x, item[2].y]]})
                elif item[0] == "c": # curve
                    segments.append({"type": "c", "pts": [
                        [item[1].x, item[1].y], 
                        [item[2].x, item[2].y], 
                        [item[3].x, item[3].y], 
                        [item[4].x, item[4].y]
                    ]})
                elif item[0] == "re": # rectangle
                    segments.append({"type": "re", "pts": [[item[1].x0, item[1].y0, item[1].width, item[1].height]]})
                elif item[0] == "qu": # quad
                    # Map quad points
                    q = item[1]
                    segments.append({"type": "qu", "pts": [[q.ul.x, q.ul.y], [q.ur.x, q.ur.y], [q.lr.x, q.lr.y], [q.ll.x, q.ll.y]]})

            items.append({
                "type": "path",
                "segments": segments,
                "stroke_color": self._rgb_tuple_to_hex(p.get("color")),
                "fill_color": self._rgb_tuple_to_hex(p.get("fill")),
                "stroke_width": p.get("width", 1.0),
                "opacity": p.get("opacity", 1.0),
                "lineCap": p.get("lineCap", 0),
                "lineJoin": p.get("lineJoin", 0),
                "even_odd": p.get("even_odd", False)
            })
        return items

    def _extract_images(self, page):
        items = []
        img_list = page.get_images(full=True)
        for img in img_list:
            xref = img[0]
            base_image = self.doc.extract_image(xref)
            image_bytes = base_image["image"]
            
            # Find location of image on page
            inst = page.get_image_info(xrefs=True)
            for info in inst:
                if info["xref"] == xref:
                    items.append({
                        "type": "image",
                        "bbox": list(info["bbox"]),
                        "transform": list(info.get("transform", [1, 0, 0, 1, 0, 0])),
                        "extension": base_image["ext"],
                        "data": base64.b64encode(image_bytes).decode('utf-8')
                    })
        return items

    def _rgb_to_hex(self, s_color):
        # PyMuPDF color is often an int or a tuple
        if isinstance(s_color, int):
            # Convert decimal color to RGB
            r = (s_color >> 16) & 0xFF
            g = (s_color >> 8) & 0xFF
            b = s_color & 0xFF
            return f"#{r:02x}{g:02x}{b:02x}"
        return "#000000"

    def _rgb_tuple_to_hex(self, color):
        if not color:
            return None
        if isinstance(color, (list, tuple)):
            if len(color) == 3: # RGB
                return f"#{int(color[0]*255):02x}{int(color[1]*255):02x}{int(color[2]*255):02x}"
            elif len(color) == 1: # Gray
                val = int(color[0]*255)
                return f"#{val:02x}{val:02x}{val:02x}"
            elif len(color) == 4: # CMYK
                # CMYK to RGB conversion
                c, m, y, k = color
                r = 255 * (1 - c) * (1 - k)
                g = 255 * (1 - m) * (1 - k)
                b = 255 * (1 - y) * (1 - k)
                return f"#{int(r):02x}{int(g):02x}{int(b):02x}"
        return "#000000"


    def _extract_font_binaries(self):
        fonts = []
        # Fallback: if font_map is empty, try to get fonts from ALL pages
        if not self.font_map:
            for page in self.doc:
                for f in page.get_fonts():
                    xref = f[0]
                    name = f[3] or f[4] or f"Font_{xref}"
                    if xref not in self.font_map:
                        self.font_map[xref] = name

        for xref, name in self.font_map.items():
            try:
                # Extract font binary
                font_info = self.doc.extract_font(xref)
                if font_info and font_info[2]: # font_info[2] is the buffer
                    ext = font_info[1]
                    font_data = font_info[2]
                    
                    # Convert PFA/Type1 to WOFF if possible
                    if (ext == 'pfa' or ext == 'type1') and font_data:
                         try:
                             # Use AFDKO 'tx' tool to convert PFA -> OTF (CFF)
                             # This is the most robust way to make Type 1 fonts web-compatible.
                             
                             with tempfile.NamedTemporaryFile(suffix='.pfa', delete=False) as tmp_in:
                                 tmp_in.write(font_data)
                                 input_path = tmp_in.name
                                 
                             output_path = input_path.replace('.pfa', '.otf')
                             
                             # Run tx command
                             # -cff: convert to CFF/OTF
                             result = subprocess.run(['tx', '-cff', input_path, output_path], capture_output=True, text=True)
                             
                             if result.returncode == 0 and os.path.exists(output_path):
                                 with open(output_path, 'rb') as f_out:
                                     converted_data = f_out.read()
                                     
                                 font_data = converted_data
                                 ext = 'otf' # Update extension
                                 print(f"Successfully converted {name} to OTF using tx.")
                             else:
                                 print(f"tx conversion failed for {name}: {result.stderr}")
                             
                             # Cleanup
                             try:
                                 os.remove(input_path)
                                 if os.path.exists(output_path):
                                     os.remove(output_path)
                             except:
                                 pass
                                 
                         except Exception as e:
                             print(f"Font conversion exception: {e}")

                    fonts.append({
                        "name": name,
                        "extension": ext,
                        "data": base64.b64encode(font_data).decode('utf-8')
                    })
            except Exception as e:
                pass 
        return fonts

    def close(self):
        """Explicitly release the PDF file handle."""
        if hasattr(self, 'doc') and self.doc:
            try:
                self.doc.close()
            except:
                pass
            self.doc = None
    def __del__(self):
        # Fallback cleanup
        try:
            self.close()
        except:
            pass        
