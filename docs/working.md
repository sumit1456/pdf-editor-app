# PDF Editor Internal Architecture & Workflow

This document explains the internal mechanisms of the PDF Editor, detailing how files are processed, rendered, and saved.

## 1. System Architecture
The application is split into two main parts:
- **Frontend (React - `pdf-editor-app`)**: A "Studio" environment that renders the PDF using SVG/WebGL for interactivity and handles user edits.
- **Backend (FastAPI/Python - `pdf-editor-service`)**: The core engine that extracts data from raw PDFs and generates the final modified PDF.

---

## 2. PDF Extraction (The "Deconstruction" Phase)
When a PDF is uploaded, the backend (`server.py`) performs a high-fidelity deconstruction using **PyMuPDF (fitz)**.

### Coordinate & Layout Stabilization (`layout_engine.py`)
PDFs are often a mess of "floating fragments" rather than structured lines. The `layout_engine.py` stabilizes this:
- **X-Clustering**: It statistically analyzes X-coordinates to find "canonical anchors" (columns). This prevents text from looking "jagged" by snapping lines to consistent left/right margins.
- **Line Aggregation**: It groups text spans sharing the same baseline into single "Line" objects.
- **Block Grouping**: It calculates the "leading" (vertical spacing) to group lines into semantic paragraphs or blocks.
- **Horizontal Gap Splitting**: It detects large horizontal gaps to separate distinct items on the same line (e.g., a Job Title on the left and a Date on the right).

### Special Elements Handling
- **Symbols & Bullets**: Many PDFs use private encodings for bullets. The backend (`SYMBOL_MAP`) normalizes these artifacts into standard Unicode (e.g., converting `\u2022` or custom ZapfDingbats codes into `•`).
- **Icons**: It detects FontAwesome glyphs and maps them to the correct icon fonts.
- **Images**: Images are extracted as raw bytes, converted to Base64, and sent to the frontend.
- **Vector Paths**: Complex drawings (logos, lines, boxes) are extracted as a series of SVG-like commands (`move_to`, `line_to`, `curve_to`).

---

## 3. Rendering Engine (The "Studio" Preview)
The frontend uses a dual-layer rendering strategy in `PythonRenderer.jsx`:

1.  **WebGL/Canvas Layer (PixiJS)**: Renders "static" content like background images and complex vector paths. This ensures the UI stays responsive even with heavy graphics.
2.  **SVG Interactive Layer**: Renders the text. SVG is used because it provides pixel-perfect control over text placement, font-weight, and color while remaining fully accessible to browser events for editing.

### Points to Pixels (Scale Factor)
PDFs use **Points (72 DPI)**, while browsers use **Pixels (96 DPI)**. The system applies a constant `PT_TO_PX` factor (approx 1.33x) to ensure the rendered size on screen matches the physical size of the document.

---

## 4. Google Font Replacement & Harmonization
One of the most critical parts of this editor is **replacing embedded PDF fonts with Google Fonts**.

### Why replace fonts?
- **Consistency**: Standard PDF fonts (like `Helvetica` or `Times`) render differently across browsers/OS. Google Fonts are web-standard and look the same everywhere.
- **High-Fidelity Editing**: To allow editing text without layout shifts, we need access to the actual font files to measure widths accurately.
- **Style Flexibility**: It allows users to easily switch "looks" (e.g., switching a resume from `Inter` to `Playfair Display`).

### How it works (The Font Pipeline):
1.  **Mapping (`font_manager.py`)**: The backend analyzes the PDF font names and picks the closest visual match from a curated Google Font library (e.g., `Helvetica` maps to `Inter`, `Times` to `Source Serif 4`).
2.  **Injection**: The frontend receives the font names and injects CSS `@font-face` rules into the DOM to load the Google Font.
3.  **Optical Calibration**: PDF rendering is naturally "heavier" than browser rendering. `font_manager.py` applies a **down-shifting matrix** (e.g., if the PDF asks for `Bold`, we might use `SemiBold` in the final PDF so it doesn't look too chunky).

---

## 5. Final PDF Generation (The "Reconstruction" Phase)
When you click **Download**, the `SavePDFRequest` is sent to the backend.

1.  **Redaction**: The engine first "whitelists" the original PDF by placing white rectangles (redactions) over the old text areas.
2.  **Smart Calibration**: Before writing the new text, the engine measures the width of your edited text using the **actual Google Font files** on the server.
3.  **Fitting**: If your new text is too long for the original box, it calculates a `safe_ratio` to slightly compress the text so it fits perfectly without overflowing.
4.  **Stamping**: The new text and shapes are "stamped" back onto the PDF using the `insert_text` and `new_shape` methods of PyMuPDF.

---

## 6. Major File Reference
| File | Responsibility |
| :--- | :--- |
| **`server.py`** | Main API. Handles extraction logic and final PDF reconstruction. |
| **`layout_engine.py`** | Statistical analysis of PDF coordinates to build the block/line tree. |
| **`font_manager.py`** | Resolves PDF font names to Google Fonts and handles visual weight calibration. |
| **`PythonRenderer.jsx`** | The main frontend renderer (Dual WebGL + SVG layers). |
| **`LineMerger.js`** | Frontend logic to merge fragmented PDF spans into editable sentences. |
| **`ReflowEngine.js`** | Handles the logic of how text "flows" when you add more words to a line. |
