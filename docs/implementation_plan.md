# Implementation Plan: PDF Scene Graph Renderer

This plan outlines how to adapt the WebGL renderer ([PixiRendererEngine](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/engine/WebEngine.jsx#977-1895)) to support a DOM-less "Scene Graph" (represented by [LayoutNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/engine/WebEngine.jsx#1899-1977) hierarchy) instead of capturing from the real DOM. This is essential for rendering PDF structures that don't have a live DOM equivalent.

## Integration with CanvasEngine

To achieve DOM-less rendering, we will leverage the **Layout & Measurement Engine** from [CanvasEngine.jsx](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx). 

### Why CanvasEngine?
WebGL (PixiJS) is solely a rendering layer. It doesn't understand "Flexbox" or "Margin". Usually, the browser's DOM/CSS handles this. Without a DOM, we need a mathematical engine to calculate absolute positions (`x`, `y`) and sizes. `CanvasEngine` provides this via its [LayoutNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/engine/WebEngine.jsx#1899-1977) hierarchy.

### Parts we are using:
1. **[LayoutNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/engine/WebEngine.jsx#1899-1977) Hierarchy**: Classes like [FlexNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#558-788), [TextNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#1028-1132), and [BlockNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#1135-1222) will act as our "Scene Graph" nodes.
2. **[measure(constraints)](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#1136-1180)**: This logic calculates the intrinsic size of elements (e.g., how big is this text given a max width?).
3. **[layout(bounds)](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#1334-1337)**: This logic takes the measured sizes and calculates the final `x`/`y` absolute coordinates for every node in the tree.

### Data Flow for PDF:
## Scene Graph Formation Methodology

Following the architecture diagram, the process of creating nodes from PDF data will be handled by a new **`PDFSceneGraphBuilder`**. 

Since PDF data often arrives as "loose" characters or small chunks, we need an aggregation algorithm:

### Step 1: Extract Primitives
We receive raw data chunks (Position, Character/Image/Path) from the PDF parser/worker. These are mapped to `PrimitiveNode` (lightweight# Implementation Plan - Sidebar "Short Form" Editor

The user wants to make the text items in the "Structure" sidebar editable. Edits made in the sidebar should reflect in the main WebGL/PDF view.

## Proposed Changes

### [Component] Editor Page
#### [MODIFY] [EditorPage.jsx](file:///c:/Users/SUMIT/Downloads/pdf-editor-app/src/pages/editor/EditorPage.jsx)
- Replace static text in the `structure-sidebar` with an editable interface (e.g., `contentEditable` or `<textarea>`).
- Implement `handleSidebarEdit(itemIndex, newText)`:
    - Locate the original- [/] **Refine Bullet Aesthetics & Indentation**
    - [x] Narrow marker list to prevent false positives (remove icons)
    - [ ] Remove manual bullet size boosting (1:1 scaling)
    - [ ] Replace hardcoded `fontWeight="bold"` with PDF metadata flags
    - [ ] Implement Vector Dots for standard markers (`•`, `·`)
- [/] **Preserve Styles during Editing**
    - [ ] Fix color loss for edited text in `PythonRenderer.jsx`
    - [ ] Ensure font-weight/style consistency in split-line path
- [x] **Hierarchical Nesting Detection**
r save-on-blur to prevent excessive re-renders during typing.

## Verification Plan

### Manual Verification
1.  **Sidebar Editing**:
    - Click a text item in the sidebar.
    - Edit the text.
    - Blur the field or press Enter.
    - Verify that the text in the main canvas updates immediately.
2.  **Two-way Sync**:
    - Edit a line in the canvas and verify the sidebar updates.
    - Edit the same line in the sidebar and verify the canvas updates.
3.  **Compression Maintenance**:
    - Verify that edits made via the sidebar still respect the width compression logic.
 ImageNode({ src: '...', x: 100, y: 200 })
    ]),
    2: new PageNode(...)
  }
}
```

### Step 2: Combine to Lines
- Sort `PrimitiveNode` objects by `y` coordinate, then `x`.
- Group characters into a [TextLine](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#1668-1679) if they share similar `y` and have safe `x` distance.

### Step 3: Combine to TextBlocks
- Group [TextLine](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#1668-1679) objects into a `TextBlock` (mapped to [FlexNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#558-788) or [BlockNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#1135-1222)) if they have consistent vertical spacing and belong to the same logical area.

### Step 4: Multi-Page Handling
- Nodes are assigned to a `PageNode`.
- All `PageNode` instances are wrapped in a `Document` object.

```javascript
// Conceptual Structure
const doc = {
  pages: {
    1: new PageNode({ width: 595, height: 842 }, [
        new TextBlockNode({ x: 50, y: 50 }, [...]),
        new ImageNode({ src: '...', x: 100, y: 200 })
    ]),
    2: new PageNode(...)
  }
}
```

### Style Preservation & Mapping

To preserve font styles, colors, and other properties from the original PDF, we follow a categorical mapping:

1.  **Metadata Extraction**: When characters are parsed, they aren't just letters; they are "Rich Primitives" containing:
    *   `fontName` (base family)
    *   `fontSize` (pt/px)
    *   `fontWeight` (bold/normal)
    *   `fillColor` (hex/rgb)
    *   `opacity`

2.  **Structural Mapping**:
    *   **Unified Styles**: If a grouped `TextBlock` has uniform formatting, we apply these styles to the `LayoutNode.props`.
    *   **Mixed Styles (Spans)**: If a block has mixed formatting (e.g., a **bold** word), we break the block into multiple [TextNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#1028-1132) objects inside a [FlexNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#558-788) (row).

3.  **WebGL Conversion**:
    The `GeometrySnapshot.fromSceneGraph` method will map these preserved props into the `styles` object used by [PixiRendererEngine](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/engine/WebEngine.jsx#977-1895):
    *   `node.props.color` → `styles.color`
    *   `node.props.font` → `styles.fontFamily`, `styles.fontSize`
    *   `node.props.backgroundColor` → `styles.backgroundColor`

```javascript
// Example Mapping Logic
const mapPropsToStyle = (props) => ({
    color: props.color || '#000000',
    fontSize: props.fontSize || 12,
    fontFamily: props.fontFamily || 'Arial',
    fontWeight: props.fontWeight || 'normal',
    backgroundColor: props.backgroundColor || 'transparent'
});
```

### Manual Verification
1. **Create a PDF Scene Graph Demo**: I will create a new demo component (or update the existing one) that constructs a [LayoutNode](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/engine/WebEngine.jsx#1899-1977) tree representing a multi-page PDF document.
2. **Invoke WebGL Renderer**: I will pass this tree to `GeometrySnapshot.fromSceneGraph` and then to `PixiRendererEngine.render`.
3. **Visual Check**: Verify that the rendered output in the WebGL canvas matches the structure defined in the Scene Graph.
4. **Test Components**:
    - Text positioning and wrapping.
    - Image loading and rendering.
    - Box styles (background, border, radius).
    - Multi-page layout.

> [!NOTE]
> Since there is no DOM, the [capture](file:///c:/Users/SUMIT/Downloads/resumemaker-frontend-master/WebGL%20Renderer/webgl/src/canvasEngine/CanvasEngine.jsx#70-129) method will not use `getBoundingClientRect` or `getComputedStyle`. Instead, it will rely on the `bounds` and `props` calculated during the `CanvasEngine` layout phase.
