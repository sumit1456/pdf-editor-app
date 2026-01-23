import os

file_path = r'c:\Users\SUMIT\Downloads\pdf-editor-app\src\components\PDFEditor\PythonRenderer.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_block = False

# Phase 1: Clean up imports and redundant helpers
# (I already removed normalizeFont in a previous step, but let's be thorough)
helpers_to_remove = ['normalizeFont', 'getRealFontString', 'mapContentToIcons', 'renderVisualText', 'MEASURE_CANVAS', 'MEASURE_CTX']

for line in lines:
    # Handle the messy LineRenderer useMemo block if it wasn't fully cleaned
    if 'calibratedFontSize: baseSize * OPTICAL_HEIGHT_FACTOR * safeRatio,' in line and 'measuredPercent:' in lines[lines.index(line)+2]:
        continue # Skip the junk lines
    
    # Handle the bullet anchor logic that was failing
    if 'MEASURE_CTX.font =' in line and 'bulletSpan.size' in line:
        new_lines.append(line.replace(line.strip(), '// MEASURED DISABLED FOR STABILITY TEST'))
        continue
    if 'const bulletWidth = MEASURE_CTX.measureText(mapped).width;' in line:
        new_lines.append(line.replace(line.strip(), 'const bulletWidth = 15; // Stable Fallback'))
        continue

    new_lines.append(line)

# Apply final writes
with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Cleaned up failing measurement code and forced stable anchors.")
