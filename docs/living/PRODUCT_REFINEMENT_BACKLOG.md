# Product Refinement Backlog

This file tracks the next meaningful product work for `simple-CAM` during the current alpha phase.

## Current State

The app now has the following core capabilities in place:

- [x] Manual geometry creation for drills, lines, rectangles, circles, and sketch-based cutouts
- [x] Sketch-first editing with `Poly-Line` / `Poly-Arc`, segment deletion/replacement, and closure/integrity feedback
- [x] Inside / outside / along-path planning with 2D preview, rapid links, direction markers, and tab highlighting
- [x] Retaining tabs for profile cuts
- [x] Pocket / clear-area support for inside cuts on rectangles, circles, and closed sketches
- [x] SVG import into native sketch geometry with editable imported paths
- [x] DXF import into the same normalized sketch pipeline for first-pass CAD geometry
- [x] Material-aware tool presets with per-tool/per-material feeds and pass depth
- [x] Keyboard transform workflow (`G`, `R`, `S`, axis locks, numeric entry, confirm/cancel)
- [x] Shared numeric input controls instead of browser-default number input behavior
- [x] 3D toolpath preview with orbit/zoom, orientation gizmo, and playback controls
- [x] Project save/load, G-code export, and OctoPrint upload/run integration
- [x] CI, tests, and release automation in place

## Backlog Use

- Prioritize work that expands real project usefulness without weakening toolpath trust
- Prefer features that reuse the existing sketch and operation model instead of adding parallel workflows
- Capture machine-testing findings in [ALPHA_FEEDBACK_TEMPLATE.md](./ALPHA_FEEDBACK_TEMPLATE.md)

## Priority Rubric

- `P0`: Correctness or workflow gaps that materially block confident use
- `P1`: High-value feature work that expands realistic job authoring
- `P2`: Useful workflow improvements that can follow once import and core geometry flows are stable
- `P3`: Longer-range polish or expansion

## Completed Recently

### Toolpath and G-code confidence

Completed:
- [x] 2D planned-path preview overlay
- [x] Inside / outside / along-path visualization
- [x] Rapid links, start/end markers, and direction indicators
- [x] Retaining tab planning across all depth passes
- [x] Pocket / clear-area planning for closed inside cuts

### Sketch-first editing workflow

Completed:
- [x] `New Sketch` enters sketch editing immediately
- [x] Local `Poly-Line` / `Poly-Arc` tools while editing
- [x] Segment selection, deletion, replacement, and numeric segment editing
- [x] Closed/open detection and sketch integrity reporting
- [x] Cancel-in-progress sketch workflow distinct from later sketch editing

### Editing and UI workflow

Completed:
- [x] Drag history batching so undo/redo only captures completed drags
- [x] Tool-aware canvas/status guidance
- [x] `Ctrl+number` tool switching
- [x] Compact project actions with icon buttons
- [x] Left/right panel layout cleanup and details/list separation
- [x] Lucide icon adoption started for main controls

### Imported geometry workflow

Completed:
- [x] `SVG` import into native sketch geometry
- [x] `DXF` import with support for `LINE`, `ARC`, `CIRCLE`, `LWPOLYLINE`, and legacy `POLYLINE`
- [x] Import cut choice moved to a post-file-pick modal before conversion
- [x] Imported geometry arrives as editable sketch operations and respects cut side / pocket settings where valid
- [x] Onshape `Release 14` DXF export path validated against a real sample
- [ ] Richer import warning review UI beyond status text
- [ ] Support for more DXF entities such as splines, blocks, or ellipses where that adds real value

## P1: Next Major Feature

### 1. 3D groundwork for future STL import

- [x] Add a 3D toolpath / stock preview direction that can explain Z motion, pass stacking, and top-vs-bottom cuts
- [ ] Define the first supported 3D CAM scope before any STL parser work
- [ ] Establish whether the first 3D workflow is height-map engraving, relief roughing, or simple mesh projection rather than general 3-axis machining
- [ ] Identify the minimal operation model additions needed for 3D paths without destabilizing the current 2D workflow
- [ ] Define the stock/origin assumptions the 3D workflow will use for STL-derived jobs
- [ ] Define the first mesh import constraints: supported STL variants, units/orientation handling, and triangle-count limits

Why it matters:
STL import is desirable, but mesh import without a trustworthy 3D preview and some form of 3D path-planning model would weaken confidence fast. The right next step is to build the visualization and planning foundations before taking on mesh ingestion.

Goal:
Create a path to future STL-driven jobs that stays aligned with the app's current emphasis on understandable, verifiable tool motion.

Implementation direction:
- [x] Keep STL import out of active implementation until preview/planning groundwork is in place
- [x] Decide whether the first 3D visualization is a lightweight path viewer or a basic stock/tool simulation
- [ ] Decide whether imported meshes become a new operation type or feed a derived surface/path workflow
- [ ] Capture expected machine and performance constraints for desktop rendering before implementation
- [ ] Decide whether STL work starts with roughing only or roughing + finishing from the start
- [ ] Decide how 3D toolpath preview will communicate stock top, zero plane, and final depth envelope for mesh jobs

Acceptance notes:
- [ ] A future STL plan should name the first concrete supported machining scenario
- [x] 3D preview requirements should be clear enough that later STL import work is not guessing at UX or path validation
- [x] The 2D workflow should remain stable and understandable while 3D capabilities are introduced incrementally
- [ ] STL import should not begin until units/orientation and stock assumptions are documented

Status:
- [x] Do not take on full 3D model import until preview/planning groundwork is in place
- [x] Active scope note is tracked in [STL_GROUNDWORK_PLAN.md](./STL_GROUNDWORK_PLAN.md)
- [x] 3D preview toggle, orbit/zoom, bounds, path coloring, gizmo, and playback are now in place for existing jobs

## P2: Follow-On Workflow Work

### 2. Better operation summaries

Why it matters:
The operations list should help confirm setup and catch invalid state without constant reselection.

Scope:
- [ ] Show compact summaries for tool, material, cut side, target depth, and tabs
- [ ] Show open/closed sketch state directly in the list
- [ ] Flag invalid or incomplete operations inline

### 3. Sketch edit-mode polish

Why it matters:
The sketch flow is functional now, but edit mode can still be clearer and more deliberate.

Scope:
- [ ] Make sketch editing state even more explicit in the toolbar/panels
- [ ] Clarify open-vs-closed finish choices where relevant
- [ ] Improve repair/reconnect affordances for open sketches

### 4. Numeric geometry editing follow-through

Why it matters:
Most important numeric editing is in place, but there are still remaining opportunities to make exact edits faster.

Scope:
- [ ] Extend the shared numeric control to any remaining dialogs/modals
- [ ] Improve focus/dirty-state feedback where useful
- [ ] Evaluate whether common derived values like line length or circle diameter should be editable directly

### 5. Import warning and cleanup UX

Why it matters:
The importers work well enough for real jobs now, but warning visibility and post-import cleanup can still be improved for larger or messier files.

Scope:
- [ ] Surface skipped-entity warnings in a more reviewable UI than the status bar alone
- [ ] Show a better import summary for counts of open vs closed paths
- [ ] Consider lightweight per-import cleanup actions for simplification or rejection

## Deferred For Now

### Batch operation editing

Reason for deferral:
`Apply to all` currently covers the highest-value bulk update flow for this alpha stage, and true heterogeneous multi-editing adds complexity in both UI state and undo behavior.

Revisit when:
- [ ] There is stronger demand for editing subsets of operations with mixed values
- [ ] Imported geometry creates larger multi-operation jobs where selection-scoped bulk edits become common

### Pocketing strategy refinement

Reason for deferral:
The current simple contour-offset clearing is functionally useful and good enough for alpha machine testing.

Revisit when:
- [ ] Import workflows introduce more complex shapes more frequently
- [ ] There is clear demand for raster/adaptive strategies or richer pocket defaults

### Job preflight validation

Reason for deferral:
Still valuable, but not the highest-value next step compared with geometry import and edit workflow expansion.

## P3: Longer-Range Refinements

### STL / mesh import

Ideas:
- [ ] Support importing STL only after a first 3D preview and path-planning model exists
- [ ] Start with a narrowly-defined 3D use case instead of generic arbitrary mesh machining
- [ ] Explore whether mesh import should target relief/height-map style workflows first

### Constraints and snapping upgrades

Ideas:
- [ ] Horizontal/vertical constraints
- [ ] Tangent/endpoint inference for arcs
- [ ] Midpoint and center snapping
- [ ] Temporary snap-disable modifier

### Project UX polish

Ideas:
- [ ] Recent files
- [ ] Unsaved changes prompts
- [ ] Job notes and setup checklist
- [ ] Better empty states and onboarding hints

### Machine integration polish

Ideas:
- [ ] Better OctoPrint upload/run feedback
- [ ] Dry-run or air-cut helper mode
- [ ] More explicit machine state/status feedback

### Basic job estimates

Ideas:
- [ ] Estimate total cut distance, rapid distance, plunge count, and rough runtime
- [ ] Show per-operation contribution to runtime

## Suggested Next Sequence

1. [ ] Lock the first STL machining scope and stock/origin assumptions
2. [ ] Define STL import constraints and file-orientation/unit handling
3. [ ] Better operation summaries
4. [ ] Import warning and cleanup UX
5. [ ] Sketch edit-mode polish after imported-geometry usage exercises the workflow harder

## User-Driven Direction

- [x] Import should land inside the existing sketch and operation workflow, not become a separate mode
- [x] 3D toolpath preview is now in place as groundwork for future STL work
- [x] `Apply to all` is sufficient for current bulk-edit needs during alpha
- [x] `SVG` and `DXF` import are both in place for the current alpha workflow
- [x] STL import should wait for 3D path-planning and visualization groundwork
