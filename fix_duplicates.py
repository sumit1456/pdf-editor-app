import os

file_path = r'c:\Users\SUMIT\Downloads\pdf-editor-app\src\components\PDFEditor\PythonRenderer.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    # Remove the global constants and helpers that were moved to the service
    if 'const MEASURE_CANVAS = document.createElement(\'canvas\');' in line:
        continue
    if 'const MEASURE_CTX = MEASURE_CANVAS.getContext(\'2d\');' in line:
        continue
    if 'function getRealFontString(fontName, googleFont, weight, size, style) {' in line:
        skip = True
        continue
    
    if skip and line.strip() == '}':
        skip = False
        continue
    
    if skip:
        continue
        
    new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully removed duplicate getRealFontString and measurement globals.")
