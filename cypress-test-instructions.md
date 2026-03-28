# Font Style Preservation Test Instructions

## 🎯 Test Overview
This comprehensive Cypress test verifies font style preservation across:
- Line selection and data extraction
- Content editing via Content Studio
- Line movement in Move Mode
- Fit Mode functionality
- Multiple line operations

## 🚀 How to Run the Test

### Prerequisites
1. Ensure your app is running on `localhost:8080`
2. Cypress should be installed (already in package.json)

### Method 1: Interactive Mode (Recommended)
```bash
cd c:\Users\SUMIT\Downloads\pdf-editor\pdf-editor-app
npm run test:open
```
- This opens Cypress Test Runner
- Click on `font-style-preservation.cy.js` to run the test
- You can watch the test execute in real-time

### Method 2: Headless Mode
```bash
cd c:\Users\SUMIT\Downloads\pdf-editor\pdf-editor-app
npm run test:run -- --spec "cypress/e2e/font-style-preservation.cy.js"
```

## 📋 Test Scenarios

### Test 1: Content Studio Edit Preservation
1. **Clicks first line** → Extracts font data (size, family, weight, color, width)
2. **Edits via Content Studio** → Changes text content
3. **Verifies preservation** → Font styles should remain identical
4. **Screenshots**: `original-first-line.png`, `edited-first-line.png`

### Test 2: Move Mode Preservation
1. **Clicks second line** → Records font configurations and position
2. **Enables Move Mode** → Activates drag functionality
3. **Drags line** → Moves line by (50px, 20px)
4. **Verifies preservation** → Font configs unchanged, position changed
5. **Screenshots**: `before-move-line.png`, `after-move-line.png`

### Test 3: Fit Mode Preservation
1. **Selects third line** → Captures initial font data
2. **Enables Fit Mode** → Triggers worker binary search
3. **Verifies preservation** → Styles preserved, sizes optimized
4. **Screenshots**: `before-fit-mode.png`, `after-fit-mode.png`

### Test 4: Comprehensive Multi-line Test
1. **Tests 4 different lines** → Edit each one
2. **Records all data** → Complete preservation verification
3. **Screenshots**: Individual line screenshots

## 📊 Data Points Captured

### Font Configuration Data
```javascript
{
  fontSize: "12px",
  fontFamily: "Helvetica, sans-serif", 
  fontWeight: "400",
  fill: "#000000",
  content: "Line text content",
  width: 150.5,
  transform: "scale(0.95, 1)",
  dataFitMeasuredWidth: "158.2",
  dataFitTargetWidth: "150.0", 
  dataFitScale: "0.95"
}
```

### Position Data (for Move Mode)
```javascript
{
  x: "100.5",
  y: "200.3",
  bbox: DOMRect { x: 100, y: 195, width: 158, height: 15 }
}
```

## 📸 Screenshot Output

All screenshots are saved to:
```
cypress/screenshots/font-style-preservation.cy.js/
├── original-first-line.png
├── edited-first-line.png  
├── before-move-line.png
├── after-move-line.png
├── before-fit-mode.png
├── after-fit-mode.png
├── line-1-initial.png
├── line-1-edited.png
├── line-2-initial.png
├── line-2-edited.png
├── line-3-initial.png
├── line-3-edited.png
├── line-4-initial.png
├── line-4-edited.png
└── comprehensive-test-results.png
```

## 🔍 Test Assertions

### Style Preservation Checks
- ✅ Font family remains unchanged
- ✅ Font weight remains unchanged  
- ✅ Font color remains unchanged
- ✅ Content updates correctly
- ✅ Transform scales applied correctly

### Movement Checks
- ✅ Font configurations unchanged after move
- ✅ Position coordinates changed
- ✅ No font shrinkage during movement

### Fit Mode Checks  
- ✅ Font styles preserved during fitting
- ✅ Font sizes optimized via worker
- ✅ CSS scales applied correctly

## 🐛 Troubleshooting

### Common Issues
1. **"Live Demo not found"** → Ensure app is running on localhost:8080
2. **"Content Studio not visible"** → Wait longer for PDF to load
3. **"Line selection fails"** → Check if data-testid attributes exist
4. **"Move Mode not working"** → Verify drag functionality is enabled

### Debug Mode
Add `cy.log()` statements and increase wait times:
```javascript
cy.wait(5000); // Increase wait times
cy.log('Debug point reached'); // Add debug logs
```

## 📈 Expected Results

**All tests should pass with:**
- Font styles 100% preserved across all operations
- No font shrinkage when moving lines
- Proper worker-based optimization in Fit Mode
- Consistent behavior across multiple lines

**If any test fails:**
- Check the Cypress logs for detailed error messages
- Review screenshots for visual differences
- Verify DOM attributes match expected values

## 🎯 Success Criteria

The test suite validates that your implementation:
1. ✅ Preserves font families during edits
2. ✅ Maintains font weights during movement  
3. ✅ Keeps colors consistent across operations
4. ✅ Applies Fit Mode optimization correctly
5. ✅ Uses handlers instead of direct manipulation
6. ✅ Prevents text shrinkage on move/edit

Run this test to verify your font style preservation implementation is working correctly! 🚀
