# STL Groundwork Plan

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

- Relief / height-map style machining from the top surface only

Why:

- Simpler than general freeform 3-axis contouring
- Easier to reason about stock top and safe Z behavior
- Easier to preview with a sampled height field than with full material-removal simulation
- More compatible with the app's current “generate understandable machine motion” philosophy

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

Possible first operation types:

- `surface-rough`
- `surface-finish`

### Remaining Decisions Before STL Import

- Choose the first supported machining scenario:
  - Relief / height-map engraving
  - Relief roughing only
  - Relief roughing + finishing
- Decide whether STL-derived jobs create new 3D operation types or generate derived preview/toolpath data from an import step
- Define how step-over, step-down, machining allowance, and finishing tolerance should be represented
- Define whether the first path-planning pass is raster, contour, or hybrid

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

### Requirements Before Starting

- A chosen first 3D machining scenario
- A 3D preview capable of visualizing the resulting motion
- A clear stock/orientation model

## Suggested Next Implementation Order

1. [x] Add a planning note for 3D preview data requirements
2. [x] Extract/extend planned path data to include 3D path segments
3. [x] Add a first 3D preview toggle and renderer
4. [x] Validate the 3D preview on existing 2D jobs with layered cuts and pocketing
5. [ ] Lock the first supported STL machining scenario
6. [ ] Define stock/origin/units assumptions for STL-derived jobs
7. [ ] Define the first STL-derived operation model and its parameters
8. [ ] Only then start parsing and importing STL files

## Open Questions

- [x] Should 3D preview be canvas/WebGL based or a lightweight SVG/DOM projection first?
  Current answer: lightweight SVG/orthographic projection first.
- [x] Should the first 3D view be integrated into the main canvas or shown in a separate preview panel/modal?
  Current answer: integrated as a 2D/3D viewport toggle.
- [x] Do we want line-based preview only first, or simple stock-box context immediately?
  Current answer: line-based preview plus bounds immediately.
- [ ] Should the first STL workflow assume Z-up mesh input and remap on import, or expose orientation controls immediately?
- [ ] Should the first STL workflow support both roughing and finishing, or roughing only until machine validation is complete?
- [ ] What triangle-count limit is reasonable before import must warn or refuse to process?

## Current Decision

The next feature branch can move from preview groundwork into STL scope definition and operation modeling, but should still avoid full STL parsing until stock/origin/units assumptions are decided.
