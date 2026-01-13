import fitz  # PyMuPDF

def create_stress_test_pdf(output_path):
    doc = fitz.open()
    page = doc.new_page()
    
    # 1. VECTOR SHAPES & LINES
    shape = page.new_shape()
    
    # Rectangles with different fills and strokes
    shape.draw_rect([50, 50, 150, 150])
    shape.finish(color=(1, 0, 0), fill=(1, 0.8, 0.8), width=2)
    
    shape.draw_rect([200, 50, 300, 100])
    shape.finish(color=(0, 0, 1), fill=(0.8, 0.8, 1), width=1, fill_opacity=0.5)
    
    # Circles / Ellipses
    shape.draw_oval([50, 200, 150, 250])
    shape.finish(color=(0, 0.5, 0), fill=(0.9, 1, 0.9))
    
    # Diagonal Lines (Stress test for path extraction)
    shape.draw_line([350, 50], [550, 250])
    shape.finish(color=(0.5, 0, 0.5), width=3)
    
    shape.draw_line([550, 50], [350, 250])
    shape.finish(color=(0.5, 0, 0.5), width=3)
    
    shape.commit()
    
    # 2. PARAGRAPHS & TEXT
    y = 300
    page.insert_text((50, y), "Stress Test: Document PDF Editor Layout Engine", fontname="hebo", fontsize=18)
    y += 30
    
    lorem = "This is a standard paragraph used to test coordinate stability and line merging. It should be extracted as a single logical block without horizontal drift. The text should align perfectly to the left margin at 50px."
    page.insert_textbox([50, y, 550, y+60], lorem, fontname="helv", fontsize=11)
    y += 70
    
    # 3. NESTED BULLET POINTS (The core drift test)
    bullets = [
        ("• Level 1: First item in a bulleted list", 1),
        ("  This is a wrapped line for level 1 that should align with the text above,", 1),
        ("  not with the bullet marker itself. Drift prevention is key here.", 1),
        ("• Level 1: Another top-level item", 1),
        ("  ⋆ Level 2: Nested bullet item with a different marker", 2),
        ("    - Level 3: Even deeper nesting with a dash marker", 3),
        ("    - Level 3: Continuing the deep nest to test indentation", 3),
        ("  ⋆ Level 2: Back to level 2 indentation", 2),
        ("• Level 1: Back to the main margin", 1)
    ]
    
    for text, level in bullets:
        indent = (level - 1) * 20
        page.insert_text((50 + indent, y), text, fontname="helv", fontsize=11)
        y += 18
        
    # 4. TABLES / GRID (Stress test for proximity merging)
    y += 20
    page.insert_text((50, y), "Mock Table / Multi-column Layout:", fontname="hebo", fontsize=12)
    y += 20
    
    page.insert_text((50, y), "Column A - Data 1", fontname="helv", fontsize=10)
    page.insert_text((250, y), "Column B - Secondary Data", fontname="helv", fontsize=10)
    page.insert_text((450, y), "Column C - Tertiary", fontname="helv", fontsize=10)
    
    doc.save(output_path)
    print(f"Stress test PDF created: {output_path}")

if __name__ == "__main__":
    create_stress_test_pdf("stress_test.pdf")
