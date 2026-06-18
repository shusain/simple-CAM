# Codebase Review

This note captures the clearest refactor opportunities after the recent TypeScript, import, and STL feature work.

## Why Now

The app has grown in useful ways without obvious breakage, but the next round of feature work will be easier if a few large coordination points are reduced first.

The goal is not cleanup for its own sake. The goal is to make preview performance, STL iteration, and future UI changes easier to reason about and test.

## Highest-Value Refactor Targets

### 1. App-level state and action extraction

Current pressure point:
- [src/App.tsx](/home/shaun/Development/simple-CAM/src/App.tsx)

Why it matters:
- `App.tsx` now coordinates project I/O, import flows, operation history, sketch edit state, transforms, viewport mode, STL meshes, and preview wiring.
- This makes feature changes harder to isolate and increases retest cost.

Recommended direction:
- Extract project/open/save/import actions into app-level hooks or modules
- Extract imported-mesh actions and surface-operation creation into a dedicated feature module
- Extract keyboard shortcut handling and transform orchestration from the root component

### 2. Preview planning vs preview rendering separation

Current pressure points:
- [src/components/CamCanvas.tsx](/home/shaun/Development/simple-CAM/src/components/CamCanvas.tsx)
- [src/components/canvas/drawing.ts](/home/shaun/Development/simple-CAM/src/components/canvas/drawing.ts)
- [src/utils/toolpathPreview.ts](/home/shaun/Development/simple-CAM/src/utils/toolpathPreview.ts)
- [src/utils/toolpathPreview3d.ts](/home/shaun/Development/simple-CAM/src/utils/toolpathPreview3d.ts)

Why it matters:
- Dense `surface-finish` previews can overwhelm the 2D view.
- Rendering concerns and path-generation concerns are still close enough together that it is awkward to add level-of-detail behavior cleanly.

Recommended direction:
- Keep full-resolution planner output for G-code and validation
- Introduce a preview-oriented simplification stage for dense surface operations
- Make 2D and 3D preview layers consume the same structured preview model, but allow each renderer to request a cheaper representation

### 3. ToolpathPreview3D decomposition

Current pressure point:
- [src/components/ToolpathPreview3D.tsx](/home/shaun/Development/simple-CAM/src/components/ToolpathPreview3D.tsx)

Why it matters:
- Scene projection math, bounds fitting, gizmo generation, playback logic, drag handling, and rendering all live in one component.
- That makes performance work and UI changes riskier than necessary.

Recommended direction:
- Split projection/math helpers into a `preview3d` utility module
- Split playback state/timing into a small hook
- Split rendering subtrees into scene layers: stock bounds, toolpath lines, imported meshes, playback marker, gizmo

### 4. Surface planning primitives

Current pressure point:
- [src/utils/surfaceRoughing.ts](/home/shaun/Development/simple-CAM/src/utils/surfaceRoughing.ts)

Why it matters:
- Roughing and finishing share raster sampling concepts, but the shared primitives are still embedded in one growing module.
- Machine-tested strategy changes will be easier if mesh sampling, raster setup, span extraction, and pass planning are separable.

Recommended direction:
- Split mesh sampling/prepared triangle logic into a shared sampler module
- Separate roughing and finishing planners from lower-level row/span helpers
- Make it easy to add alternate finish patterns without editing one large planner file

### 5. Geometry module decomposition

Current pressure point:
- [src/utils/geometry.ts](/home/shaun/Development/simple-CAM/src/utils/geometry.ts)

Why it matters:
- The file now spans selection helpers, sketch integrity, path extraction, transforms, and operation mutation helpers.
- It is still useful, but the surface area is broad enough that edits are getting harder to localize.

Recommended direction:
- Split sketch integrity/path ordering helpers
- Split operation transform/move helpers
- Split imported-mesh-aware geometry helpers if more of those are added

## Secondary Opportunities

### Operation-type registry

Motivation:
- Operation-specific edit UI, preview planning, and G-code generation are still coordinated with multiple switch-style branches.

Possible direction:
- Define a small per-operation registry for labels, preview planning hooks, and operation-specific controls

### Form control normalization

Motivation:
- Shared numeric controls are already helping, but operation/material/tool editors still have repeated shape and validation logic.

Possible direction:
- Move repeated control row patterns and numeric-field adapters into smaller reusable components

## Suggested Order

1. Preview planning vs rendering separation
2. `ToolpathPreview3D.tsx` split
3. `App.tsx` state/action extraction
4. Surface planning primitive extraction
5. Geometry module decomposition
