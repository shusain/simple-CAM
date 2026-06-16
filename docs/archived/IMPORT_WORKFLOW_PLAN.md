# Import Workflow Plan

This file breaks down the next major feature for `simple-CAM`: importing external 2D geometry into the existing sketch-based editing and toolpath workflow.

## Goal

Allow users to import common 2D design files and immediately work with them as native `simple-CAM` geometry.

The imported result should:

- Use the existing operation and sketch model
- Support selection, editing, transforms, cut-side choice, tabs, and pocketing where geometry permits
- Preserve confidence by making invalid or ambiguous geometry visible

## Recommended Scope Order

### Phase 1: SVG import

Why first:
- Common export format from vector editors and browser-based design tools
- Easier to parse reliably than DXF
- Good fit for current line/arc/sketch geometry model

Initial supported SVG features:
- `path`
- `line`
- `polyline`
- `polygon`
- `rect`
- `circle`
- `ellipse` only if converted to sketch segments during import

Initial non-goals:
- Text import as editable text
- Fills, clipping, filters, masks, gradients, embedded images
- Full SVG styling fidelity

### Phase 2: DXF import

Why second:
- High-value for CAD-origin geometry
- More complex entity support and unit handling than SVG

Initial supported DXF entities:
- `LINE`
- `LWPOLYLINE`
- `POLYLINE`
- `ARC`
- `CIRCLE`

Initial non-goals:
- Splines unless approximated deliberately
- Blocks/attributes with deep CAD fidelity
- 3D entities

## Data Model Strategy

Imported geometry should normalize into existing native structures:

- Drill-like isolated points should remain a separate later decision; do not infer drilling automatically in v1
- Closed or open shape geometry should import as `sketch` operations by default
- Simple rectangles/circles may optionally import as native `rect` / `circle` operations only if that is cheap and reliable

Recommendation:
- Prefer importing everything as sketch geometry first
- Only preserve native rect/circle operations later if there is clear value and low ambiguity

Why:
- One editing workflow
- Fewer special cases
- Easier cut-side/tab/pocket reuse

## Geometry Normalization Rules

Imported geometry should go through a normalization pass before creating operations:

- Convert coordinates into workspace millimeters
- Flatten transforms into actual point coordinates
- Split compound paths into subpaths
- Detect closed vs open paths
- Remove zero-length segments
- Merge nearly identical endpoints using a tolerance
- Report disconnected fragments instead of silently forcing closure

Open design question:
- Tolerance should likely be based on a small absolute mm value, not grid size

## UI / Workflow Plan

### Entry points

- Add `Import SVG` and later `Import DXF` under the `Project` panel
- File-open dialog should filter supported file types explicitly

### After import

- Imported operations should become selected immediately
- Status text should report counts, e.g. `Imported 6 sketch path(s), 2 closed, 4 open`
- If import produced warnings, show a lightweight summary in the status area and/or modal

### Failure handling

Examples:
- Unsupported entities skipped
- Paths with invalid commands
- Geometry outside the work area
- Extremely dense geometry that may need simplification

## Suggested Implementation Phases

### Phase A: Infrastructure

- Add import actions to Electron `main` / preload bridge
- Add file dialog plumbing
- Add app-level import command handling
- Add unit-tested parser wrapper utilities

### Phase B: SVG parser and normalization

- Choose SVG parser
- Parse supported SVG geometry into an intermediate path model
- Normalize transforms/units into mm coordinates
- Convert normalized geometry into sketch segments
- Create operations in the canvas/app state

### Phase C: Import validation and UX

- Show import summary
- Flag open paths and malformed geometry
- Keep imported geometry editable immediately

### Phase D: DXF support

- Choose DXF parser
- Normalize supported entities into the same intermediate path model
- Reuse the SVG normalization-to-sketch pipeline

## Library Selection Guidance

### SVG

Prefer:
- A small parser that exposes path commands cleanly and does not force a rendering stack

Need:
- Path command access
- Transform handling or enough metadata to flatten transforms ourselves
- MIT/ISC-compatible license

### DXF

Prefer:
- A parser with stable support for 2D entities and permissive licensing

Need:
- Access to low-level entities without too much hidden conversion
- Clear unit metadata handling

## Test Plan

Add fixtures for:

- Simple open polyline
- Closed polygon
- Rounded rectangle/path with curves
- Multiple disconnected subpaths
- Tiny-gap closure case
- Unsupported element/entity case
- Geometry with transforms/scaling

Tests should cover:

- Parsing
- Normalization
- Closed/open detection
- Conversion into native sketch operations
- Import summaries and warnings

## Risks

- Ambiguous units, especially in SVG and DXF exports from different tools
- Curves that do not map cleanly to current line/arc segment types
- Dense imported paths creating poor editing or preview performance
- Over-eager auto-repair hiding geometry problems

## Success Criteria For First Milestone

First milestone is successful if a user can:

1. Import a basic SVG cut outline
2. See it appear as one or more selected sketch operations
3. Inspect whether each path is open or closed
4. Apply inside/outside/along cut behavior
5. Preview and export valid G-code without leaving the normal editing workflow
