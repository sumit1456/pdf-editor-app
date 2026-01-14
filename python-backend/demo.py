from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import red, blue, green, black, yellow, orange
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem, PageBreak,
    Preformatted, HRFlowable
)
from reportlab.graphics.shapes import Drawing, Line, Rect, Circle, String

# Create document
doc = SimpleDocTemplate("test_complex.pdf", pagesize=letter)
story = []

# Styles
styles = getSampleStyleSheet()
normal = styles['Normal']
title = styles['Title']
heading1 = styles['Heading1']
heading2 = styles['Heading2']

# Custom styles
bold_style = ParagraphStyle(
    'BoldCustom',
    parent=normal,
    fontName='Helvetica-Bold',
    fontSize=12,
    textColor=red,
    alignment=TA_CENTER
)
italic_style = ParagraphStyle(
    'ItalicCustom',
    parent=normal,
    fontName='Helvetica-Oblique',
    fontSize=11,
    textColor=blue,
    leftIndent=20
)
green_para = ParagraphStyle(
    'GreenPara',
    parent=normal,
    textColor=green,
    spaceAfter=12,
    bulletFontName='Helvetica-Bold',
    bulletFontSize=14
)

# Page 1: Paragraphs and fonts
story.append(Paragraph("Page 1: Multi-style Paragraphs and Text", title))
story.append(Paragraph("This is a <b>bold</b> and <i>italic</i> paragraph with <font color=green>green text</font> and <super>superscript</super>.", normal))
story.append(Paragraph("Centered bold red text in custom style.", bold_style))
story.append(Paragraph("Right-aligned italic blue indented paragraph with multiple lines for wrapping test.", italic_style))
story.append(Spacer(1, 12))

# Bullets and nested bullets using ListFlowable
outer_list = ListFlowable(
    [
        ListItem(Paragraph("Main bullet 1 with sublist", normal)),
        ListFlowable(
            [
                ListItem(Paragraph("• Nested bullet 1a", normal)),
                ListItem(Paragraph("• Nested bullet 1b with <u>underline</u>", normal)),
                ListItem(Paragraph("• Nested bullet 1c", normal))
            ],
            bulletType='bullet',
            bulletFontSize=8,
            leftIndent=20,
            bulletColor=orange
        ),
        ListItem(Paragraph("Main bullet 2", normal)),
        ListItem(Paragraph("Main bullet 3 numbered style", normal))
    ],
    bulletType='1',
    start='1',
    bulletFontSize=12
)
story.append(outer_list)
story.append(Spacer(1, 12))

# Horizontal line
story.append(HRFlowable(width="80%", thickness=1, lineCap='round', color=black, spaceBefore=12, spaceAfter=12))

# Page 2: Shapes and graphics via Drawing
story.append(PageBreak())
story.append(Paragraph("Page 2: Lines, Shapes, and Colors", heading1))

drawing = Drawing(400, 200)
drawing.add(Line(50, 50, 350, 50, strokeColor=red, strokeWidth=3))
drawing.add(Line(50, 150, 350, 150, strokeColor=blue, strokeWidth=2, strokeLineCap=1))
drawing.add(Rect(50, 75, 100, 75, fillColor=green, strokeColor=black, strokeWidth=1))
drawing.add(Circle(250, 100, 40, fillColor=yellow, strokeColor=red, strokeWidth=2))
drawing.add(String(280, 105, "Shape!", fontName="Helvetica-Bold", fontSize=12, fillColor=black))
story.append(drawing)

# More content
story.append(Paragraph("Accompanying text after shapes in <font color=orange>orange</font>. Preformatted code block:", normal))
story.append(Preformatted("def test_pdf():\n    print('Complex PDF generated!')", normal))
story.append(Spacer(1, 20))

# Page 3: More nested and mixed
story.append(PageBreak())
story.append(Paragraph("Page 3: Nested Lists and Mixed Elements", heading2))
nested_deep = ListFlowable(
    [
        ListItem(ListFlowable(
            [
                ListItem(Paragraph("Deeply nested bullet", normal)),
                ListItem(Paragraph("Another deep one", normal))
            ],
            bulletType='bullet'
        ))
    ],
    bulletType='bullet'
)
story.append(nested_deep)

# Build PDF
doc.build(story)
print("PDF created: test_complex.pdf")
