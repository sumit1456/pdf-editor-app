import fitz  # PyMuPDF
import os

def create_diagnostic_pdf(output_path):
    # Create a new PDF (Standard 600x800)
    doc = fitz.open()
    page = doc.new_page(width=600, height=800)
    
    # 1. Background Grid (Light Blue)
    grid_color = (0.8, 0.9, 1.0)
    for x in range(0, 601, 100):
        page.draw_line((x, 0), (x, 800), color=grid_color, width=0.5)
    for y in range(0, 801, 100):
        page.draw_line((0, y), (600, y), color=grid_color, width=0.5)

    # 2. Main Axes (Red X, Blue Y)
    page.draw_line((0, 0), (200, 0), color=(1, 0, 0), width=5) # X-Axis
    page.draw_line((0, 0), (0, 200), color=(0, 0, 1), width=5) # Y-Axis
    
    # Labels for Origin
    page.insert_text((10, 20), "ORIGIN (0,0) - RED=X, BLUE=Y", fontsize=14, color=(0,0,0))
    page.insert_text((210, 15), "X -> 200", fontsize=10, color=(0.8, 0, 0))
    page.insert_text((5, 215), "Y -> 200", fontsize=10, color=(0, 0, 0.8))

    # 3. Reference Shapes
    # Green Square in Top-Left quadrant
    page.draw_rect(fitz.Rect(100, 100, 200, 200), color=(0, 0.8, 0), width=2)
    page.insert_text((105, 95), "Square: (100,100) to (200,200)", fontsize=10)

    # Orange Triangle (using lines)
    p1, p2, p3 = (300, 300), (500, 300), (400, 500)
    page.draw_line(p1, p2, color=(1, 0.5, 0), width=3)
    page.draw_line(p2, p3, color=(1, 0.5, 0), width=3)
    page.draw_line(p3, p1, color=(1, 0.5, 0), width=3)
    page.insert_text((300, 290), "Triangle: (300,300), (500,300), (400,500)", fontsize=10)

    # 4. Text Position Tests
    page.insert_text((50, 400), "TEXT MID-LEFT (50, 400)", fontsize=14)
    page.insert_text((50, 750), "TEXT BOTTOM-LEFT (50, 750)", fontsize=14)
    
    # 5. Boundary Markers
    page.insert_text((500, 50), "TOP RIGHT", fontsize=12)
    page.insert_text((500, 750), "BOTTOM RIGHT", fontsize=12)

    # Gradient-like lines to check Y-direction
    for i in range(10):
        y = 600 + (i * 20)
        alpha = i / 10.0
        page.draw_line((400, y), (550, y), color=(0, 0, 0), width=2)
        page.insert_text((560, y + 5), f"Y={y}", fontsize=8)

    # Save
    doc.save(output_path)
    doc.close()
    print(f"Successfully created diagnostic PDF at: {os.path.abspath(output_path)}")

if __name__ == "__main__":
    create_diagnostic_pdf("diagnostic_test.pdf")
