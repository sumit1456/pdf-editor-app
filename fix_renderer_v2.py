import os

file_path = r'c:\Users\SUMIT\Downloads\pdf-editor-app\src\components\PDFEditor\PythonRenderer.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_block = False

# We need to remove the MEASURE_CTX and scale logic from EditableTextLayer as well
# which starts around line 640 in the current version.

for line in lines:
    # Skip any line that references MEASURE_CTX
    if 'MEASURE_CTX.' in line:
        continue
    
    # Skip the scaling logic in EditableTextLayer
    if 'if (!isActiveOrModified && measuredWidth > availableWidth * 1.05) {' in line:
        skip_block = True
        continue
    if skip_block and 'else if (isActiveOrModified) {' in line:
        skip_block = False
        new_lines.append('                fittedFontSize = item.size;\n')
        continue
    if skip_block:
        continue

    # Fix the missing normalization and mapping functions if they were removed
    # (Actually they should be imported, but let's ensure the usages are clean)

    new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Removed all remaining MEASURE_CTX references and scaling logic from EditableTextLayer.")
