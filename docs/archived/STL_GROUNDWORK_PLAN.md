# STL Groundwork Plan

Archived status:
- The groundwork phase described here has been completed and shipped.
- Ongoing STL follow-up work now lives in [../living/PRODUCT_REFINEMENT_BACKLOG.md](../living/PRODUCT_REFINEMENT_BACKLOG.md).

This document defines the first groundwork needed before `simple-CAM` takes on STL import.

## Why This Exists

`STL` import is attractive, but mesh import on its own would add a lot of ambiguity:

- What kind of machining should the mesh drive?
- How should Z motion be previewed and validated?
- What stock assumptions are being made?
- How does the user understand whether the generated motion matches the part?

The current app is strong at 2D authoring because the tool motion is understandable. The 3D path should preserve that same trust.

## Recommendation

Do **not** start with arbitrary full 3-axis STL machining.

Start with a narrower first milestone:

1. Define a 3D preview model for existing and future toolpaths
2. Add a simple 3D visualization mode for tool motion and work envelope
3. Choose the first supported STL-driven machining scenario

Recommended first STL-driven scenario to evaluate:

- Relief roughing and finishing from the top surface only on a 3-axis machine

Why:

- Simpler than general freeform 3-axis contouring
- Easier to reason about stock top and safe Z behavior
- Easier to preview with a sampled height field than with full material-removal simulation
- More compatible with the app's current “generate understandable machine motion” philosophy

## First-Pass Scope Decisions

These decisions are now locked for the first STL implementation pass:

- Source assumption: `STL` exported from Onshape and treated as millimeters
- Machine assumption: 3-axis top-down milling only
- Stock assumption: rectangular stock, using the configured machine work width/height as the stock footprint
- Z convention: `Z0` is the top of the stock, positive Z is above stock, negative Z cuts into stock
- Default placement: imported mesh is centered in X/Y on the stock
- Placement workflow: mesh can be moved in the 2D view using a top-down silhouette representation
- Operation model direction: introduce dedicated STL-derived 3D operations rather than trying to force the model into existing 2D cut operations
- Initial STL-derived operations:
  - `surface-rough`
  - `surface-finish`

## Coordinate Normalization

Imported meshes need to be normalized into the CAM coordinate system before preview or toolpath generation.

For the first pass:

- Keep the mesh top aligned to stock top by remapping imported Z so the mesh maximum Z becomes `0`
- After normalization, the mesh extends from `0` down into negative Z
- Center the normalized mesh in X/Y by default within the configured stock footprint
- Allow the user to translate the mesh in X/Y afterward from the 2D silhouette view

Example from the current sample:

- `src/test/samples/hold-down.stl`
- Bounds in file space:
  - `X: -75 .. 75`
  - `Y: -7.5 .. 7.5`
  - `Z: 0 .. 3`
- Size:
  - `150 x 15 x 3 mm`
- Normalized CAM-space Z range should become:
  - `-3 .. 0`

## Phase 1: 3D Preview Groundwork

### Goal

Allow the user to inspect tool motion in 3D before any STL import exists.

### Scope

- [x] Show toolpath lines in 3D space
- [x] Show work envelope / stock bounds
- [x] Show Z-safe moves versus cutting moves distinctly
- [x] Reuse current generated/planned path data where possible
- [x] Add a 2D/3D viewport toggle so the preview does not replace the current authoring view
- [x] Add orbit/zoom controls plus an XYZ orientation gizmo
- [x] Add lightweight path playback with play / slow-mo / pause / rewind controls

### Out of Scope

- Full material removal simulation
- Collision detection
- Spindle/tool holder simulation
- Real-time machine playback tied to live machine state

### Technical Direction

- [x] Reuse the existing planned-path pipeline as the source of motion
- [x] Expand preview data to include Z coordinates and per-pass grouping
- [x] Add a lightweight 3D renderer view, likely as a toggle alongside the current 2D preview
- [x] Keep the first render style simple: lines, bounds, axes, and motion coloring
- [x] Start with an orthographic projected SVG view before considering heavier rendering paths

### Acceptance Criteria

- [x] User can view a job path in 3D and distinguish rapid vs cut motion
- [x] User can tell where passes step down in Z
- [x] User can rotate/pan/zoom the 3D view
- [x] 2D preview remains available and unchanged
- [x] User can play through the path motion to understand sequence and direction

### Current Implementation Notes

- Existing 2D jobs now build a 3D preview data model with `rapid`, `plunge`, and `cut` segments
- The 3D preview shows bounds, path coloring, start/end markers, an XYZ gizmo, and a simple cone tool marker
- The current playback is a visualization aid only; it is not a simulator and does not remove stock
- The current preview is sufficient to validate basic Z sequencing before STL work starts

## Phase 2: First 3D Operation Model

### Goal

Define the minimum operation/data additions needed for STL-derived jobs.

### Key Questions

- Does STL import create a new operation type, or a generated surface-path operation?
- Is the first supported stock model rectangular stock only?
- Is the first supported machining direction top-down only?
- How are tool diameter and stepover represented for 3D clearing/finishing paths?

### Recommendation

For the first pass:

- Rectangular stock only
- Top-down machining only
- One or two new 3D operation types rather than a generic everything-operation
- Explicit stock-top / zero-plane handling rather than inferring from arbitrary mesh placement
- Imported mesh should be placeable in X/Y from a silhouette view before toolpaths are generated

Possible first operation types:

- `surface-rough`
- `surface-finish`

### Remaining Decisions Before STL Import

- Decide whether STL-derived jobs create new 3D operation types or generate derived preview/toolpath data from an import step
- Define how step-over, step-down, machining allowance, and finishing tolerance should be represented
- Define whether the first path-planning pass is raster, contour, or hybrid
- Decide whether roughing and finishing share the same imported mesh placement object or duplicate imported mesh state per operation

## Phase 3: STL Import Preparation

### Goal

Prepare the mesh ingestion assumptions before parsing STL into operations.

### Scope

- Supported file types: ASCII and/or binary STL
- Coordinate orientation expectations
- Unit assumptions and scale import flow
- Mesh bounds and triangle-count limits
- Error handling for invalid or overly dense meshes
- Import-time UI for confirming units/orientation if the source file is ambiguous
- Silhouette generation for top-down placement in the 2D view

### Requirements Before Starting

- A chosen first 3D machining scenario
- A 3D preview capable of visualizing the resulting motion
- A clear stock/orientation model

## Suggested Next Implementation Order

1. [x] Add a planning note for 3D preview data requirements
2. [x] Extract/extend planned path data to include 3D path segments
3. [x] Add a first 3D preview toggle and renderer
4. [x] Validate the 3D preview on existing 2D jobs with layered cuts and pocketing
5. [x] Lock the first supported STL machining scenario
6. [x] Define stock/origin/units assumptions for STL-derived jobs
7. [x] Add STL inspection/parsing that computes bounds, normalized placement, and triangle counts
8. [x] Add a 2D silhouette placement model for imported meshes
9. [x] Define the first STL-derived operation model and its parameters
10. [x] Start generating STL-derived toolpaths

## Open Questions

- [x] Should 3D preview be canvas/WebGL based or a lightweight SVG/DOM projection first?
  Current answer: lightweight SVG/orthographic projection first.
- [x] Should the first 3D view be integrated into the main canvas or shown in a separate preview panel/modal?
  Current answer: integrated as a 2D/3D viewport toggle.
- [x] Do we want line-based preview only first, or simple stock-box context immediately?
  Current answer: line-based preview plus bounds immediately.
- [x] Should the first STL workflow assume Z-up mesh input and remap on import, or expose orientation controls immediately?
  Current answer: assume Onshape-style top-aligned export first and remap imported Z so mesh top becomes stock-top `Z0`.
- [x] Should the first STL workflow support both roughing and finishing, or roughing only until machine validation is complete?
  Current answer: model both `surface-rough` and `surface-finish`, even if roughing lands first in implementation.
- [ ] What triangle-count limit is reasonable before import must warn or refuse to process?
- [ ] Should the first silhouette placement support rotation in 2D, or translation only until orientation handling is explicit?

## Current Decision

The groundwork phase is now in place:

- STL meshes can be imported, normalized into the CAM coordinate system, and positioned from a 2D silhouette view
- Imported meshes render as translucent context in the 3D preview
- Dedicated `surface-rough` and `surface-finish` operations can now be created and configured against an imported mesh
- `surface-rough` now has a first-pass raster planner that feeds both preview and G-code generation
- `surface-finish` now has a first-pass raster/crosshatch planner with export and preview support

The next implementation step should move into validation, preview-performance work, and mesh-aware planning refinement rather than basic plumbing.
