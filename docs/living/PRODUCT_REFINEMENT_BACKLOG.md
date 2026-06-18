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
- [x] STL import with centered placement, 2D silhouette editing, and dedicated surface operations
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
- [x] `STL` import into centered, movable mesh placement with dedicated 3D operations
- [x] Import cut choice moved to a post-file-pick modal before conversion
- [x] Imported geometry arrives as editable sketch operations and respects cut side / pocket settings where valid
- [x] Onshape `Release 14` DXF export path validated against a real sample
- [ ] Richer import warning review UI beyond status text
- [ ] Support for more DXF entities such as splines, blocks, or ellipses where that adds real value

### STL groundwork

Completed:
- [x] 3D preview groundwork
- [x] Mesh inspection/parsing and normalized stock-top placement
- [x] Dedicated `surface-rough` and `surface-finish` operations
- [x] Previewable/exportable first-pass roughing toolpaths
- [x] Previewable/exportable first-pass finishing toolpaths

Reference:
- [x] Groundwork phase record archived in [../archived/STL_GROUNDWORK_PLAN.md](../archived/STL_GROUNDWORK_PLAN.md)

## P1: Near-Term Focus

### 1. Physical validation and preview-performance hardening for mesh workflows

- [ ] Capture machine-test findings for `surface-rough` and `surface-finish` using the alpha feedback template
- [ ] Optimize dense 2D preview rendering for surface operations so the canvas stays responsive during `surface-finish`
- [ ] Decide whether dense previews should use simplification, subsampling, or viewport-aware rendering while leaving G-code accuracy untouched
- [ ] Review whether the 3D preview needs additional stock-top / zero-plane cues after physical testing

Why it matters:
The STL workflow is implemented, but confidence now depends on how well preview responsiveness and real machine behavior line up on representative jobs.

Goal:
Keep STL workflows trustworthy under real machine use before adding more strategy complexity.

### 2. Mesh placement polish

- [ ] Add XY rotation for imported mesh placement in the 2D silhouette workflow
- [ ] Decide whether rotation should snap by default or allow free-angle numeric entry
- [ ] Make mesh placement bounds/origin feedback clearer while moving or rotating

Why it matters:
Translation-only placement is already useful, but rotation is the next practical lever for fitting imported parts into real stock.

### 3. STL import constraints and warning UX

- [ ] Define first-pass supported STL variants explicitly in-product and/or in docs
- [ ] Set a triangle-count threshold for warn vs refuse behavior
- [ ] Surface a reviewable import summary for mesh size/orientation assumptions and any warnings
- [ ] Decide whether ambiguous units/orientation stay assumption-based or prompt for confirmation

## P2: Follow-On Workflow Work

### 4. Surface-finish strategy refinement

Reason for sequencing:
Useful, but intentionally deferred until more physical validation is complete on the current roughing/finishing output.

Scope:
- [ ] Refine finishing coverage in steep/curved regions
- [ ] Revisit finish stepover defaults based on machine testing
- [ ] Evaluate whether hybrid finishing patterns outperform simple raster/crosshatch for the first supported mesh parts

### 5. Better operation summaries

Why it matters:
The operations list should help confirm setup and catch invalid state without constant reselection.

Scope:
- [ ] Show compact summaries for tool, material, cut side, target depth, and tabs
- [ ] Show open/closed sketch state directly in the list
- [ ] Flag invalid or incomplete operations inline

### 6. Sketch edit-mode polish

Why it matters:
The sketch flow is functional now, but edit mode can still be clearer and more deliberate.

Scope:
- [ ] Make sketch editing state even more explicit in the toolbar/panels
- [ ] Clarify open-vs-closed finish choices where relevant
- [ ] Improve repair/reconnect affordances for open sketches

### 7. Numeric geometry editing follow-through

Why it matters:
Most important numeric editing is in place, but there are still remaining opportunities to make exact edits faster.

Scope:
- [ ] Extend the shared numeric control to any remaining dialogs/modals
- [ ] Improve focus/dirty-state feedback where useful
- [ ] Evaluate whether common derived values like line length or circle diameter should be editable directly

### 8. Import warning and cleanup UX

Why it matters:
The importers work well enough for real jobs now, but warning visibility and post-import cleanup can still be improved for larger or messier files.

Scope:
- [ ] Surface skipped-entity warnings in a more reviewable UI than the status bar alone
- [ ] Show a better import summary for counts of open vs closed paths
- [ ] Consider lightweight per-import cleanup actions for simplification or rejection

### 9. Codebase refactor pass

Why it matters:
The recent feature growth landed well, but several high-traffic files are now large enough that the next round of changes will be slower and riskier without another decomposition pass.

Scope:
- [ ] Extract App-level feature state/actions into smaller hooks or app modules
- [ ] Split 3D preview scene math, playback logic, and rendering layers
- [ ] Separate shared mesh sampling/planning primitives from roughing and finishing strategies
- [ ] Reduce geometry utility sprawl by carving out sketch integrity, transforms, and imported-mesh helpers

Reference:
- [ ] See [CODEBASE_REVIEW.md](./CODEBASE_REVIEW.md)

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
- [x] Support importing STL after first-pass 3D preview and path-planning groundwork
- [x] Start with a narrowly-defined 3D use case instead of generic arbitrary mesh machining
- [ ] Expand beyond the current top-down rectangular-stock workflow only after machine validation

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

1. [ ] Run physical validation on representative STL roughing/finishing jobs and record findings
2. [ ] Optimize dense surface preview rendering in the 2D canvas
3. [ ] Add rotation to imported mesh placement
4. [ ] Define STL import limits/warnings and improve mesh import summaries
5. [ ] Start the next refactor pass before another large feature wave

## User-Driven Direction

- [x] Import should land inside the existing sketch and operation workflow, not become a separate mode
- [x] 3D toolpath preview is now in place as groundwork for future STL work
- [x] `Apply to all` is sufficient for current bulk-edit needs during alpha
- [x] `SVG` and `DXF` import are both in place for the current alpha workflow
- [x] STL import now uses the completed 3D path-planning and visualization groundwork
- [x] First STL assumptions: Onshape/mm source, rectangular stock, stock-top `Z0`, centered placement, and dedicated `surface-rough` / `surface-finish` operations
