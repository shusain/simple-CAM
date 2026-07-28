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
- [x] Excellon / DRL drill import into native drill operations
- [x] STL import with centered placement, 2D silhouette editing, and dedicated surface operations
- [x] Material-aware tool presets with per-tool/per-material feeds and pass depth
- [x] Mill and laser tool types with a job-wide material choice and tool/material-specific presets
- [x] Milling tool definitions for flat-end, ball-nose, V-bit, and chamfer cutter profiles
- [x] Laser cut and fill/etch operations with power, speed, passes, line interval, and overscan controls
- [x] Marlin inline laser output using `M3 I` continuous or `M4 I` dynamic mode, with `M5` shutdown
- [x] Configurable, labeled laser test patterns for comparing material speed and power ranges
- [x] Parametric text operations with font, layout, and cut-side controls
- [x] Keyboard transform workflow (`G`, `R`, `S`, axis locks, numeric entry, confirm/cancel)
- [x] Shared numeric input controls instead of browser-default number input behavior
- [x] Collapsible side panels and unrestricted canvas panning with clickable minimap navigation
- [x] 3D toolpath preview with orbit/zoom, orientation gizmo, and playback controls
- [x] Advisory 2.5D material-removal preview with explicit stock thickness and toolpath/result/combined display modes
- [x] Three.js/WebGL result rendering with adaptive standard, detailed, and desktop-ultra sampling
- [x] Grayscale raster-image laser engraving with editable placement and brightness-driven power
- [x] Project save/load, G-code export, and OctoPrint upload/run integration
- [x] CI, tests, and release automation in place

## Backlog Use

- Prioritize work that expands real project usefulness without weakening toolpath trust
- Prefer features that reuse the existing sketch and operation model instead of adding parallel workflows
- Keep G-code, path previews, and material-removal previews driven by the same planned motion and tool-geometry model
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
- [x] Drill-to-circle conversion helper for pocketing larger holes without forcing an immediate tool change
- [x] Collapsible project/details panels for a distraction-free drawing workspace
- [x] Canvas status bar participates in layout instead of floating over the work area
- [x] Canvas can be panned at any zoom level using middle-button or modifier-assisted input
- [x] Minimap click/drag navigation can reposition the visible canvas region

### Laser tool and test-pattern workflow

Completed:
- [x] Add laser as a first-class tool type alongside mill tooling
- [x] Share material choices across tool types while keeping laser speed, power, and kerf settings per tool/material pair
- [x] Make material selection job-wide so every operation resolves against the same stock material
- [x] Present laser power as `0–100%` and map it to Marlin `S0–S255` output
- [x] Support along-path cutting and filled etching with configurable passes, line interval, and motion overscan
- [x] Emit Marlin continuous (`M3 I`) or dynamic (`M4 I`) inline laser commands and stop laser output with `M5`
- [x] Expose configurable project start/end G-code
- [x] Generate speed-by-power test grids with configurable dimensions, spacing, and cut/etch behavior
- [x] Add title, parameter summary, axis names, and row/column values to test patterns
- [x] Run test-pattern labels before cells using independent along-path label power and speed

### Imported geometry workflow

Completed:
- [x] `SVG` import into native sketch geometry
- [x] `DXF` import with support for `LINE`, `ARC`, `CIRCLE`, `LWPOLYLINE`, and legacy `POLYLINE`
- [x] `DRL` / Excellon import into native drill operations with first-pass KiCad support
- [x] `STL` import into centered, movable mesh placement with dedicated 3D operations
- [x] Import cut choice moved to a post-file-pick modal before conversion
- [x] Imported geometry arrives as editable sketch operations and respects cut side / pocket settings where valid
- [x] Onshape `Release 14` DXF export path validated against a real sample
- [ ] Richer import warning review UI beyond status text
- [ ] Support for more DXF entities such as splines, blocks, or ellipses where that adds real value
- [x] Add Excellon / DRL import for PCB drill maps, creating native drill operations with editable depths/tools
- [x] Import PNG/JPEG/WebP/BMP raster images as grayscale laser image-fill operations

### Raster image laser engraving

- [x] Add a persisted `image-fill` operation with embedded grayscale luminance data
- [x] Center imported images on stock and allow canvas dragging plus exact position, scale, aspect, and rotation controls
- [x] Map black-to-white luminance across editable minimum/maximum laser power
- [x] Generate alternating raster rows with configurable speed, passes, line interval, and motion overscan
- [x] Queue Marlin `M3` / `M4` power changes in inline mode and use `M5` for every row link and overscan transition
- [x] Show the grayscale source and raster-row toolpaths in 2D/3D previews without expanding every pixel for ordinary preview rendering
- [x] Approximate raster engraving depth per pixel from mapped power, pass count, and the laser/material calibration
- [ ] Hands-on test representative photographs, logos, gradients, and transparent images on the target machine
- [ ] Add image-processing controls such as inversion, brightness/contrast, gamma, threshold, and dithering
- [ ] Add estimated G-code size/runtime warnings for very fine intervals or large images
- [ ] Evaluate unidirectional scanning and configurable scan angle after bidirectional output is physically validated

Status:
The first end-to-end raster engraving slice is implemented. Images are downsampled to a maximum 1024-pixel source dimension, converted to grayscale with transparency composited onto white, stored in the project, and resampled at the operation's physical line interval. Black pixels use maximum power and white pixels use minimum power. Physical machine validation remains required before relying on photographic engraving defaults.

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

### 1. Laser physical validation and workflow hardening

- [ ] Exercise continuous `M3 I` and dynamic `M4 I` output against the target Marlin/MPCNC configuration
- [ ] Confirm every rapid move, fill turnaround, and overscan transition keeps the laser off outside the intended path
- [ ] Verify representative `0%`, `15%`, `50%`, and `100%` settings map safely and predictably to `S0`, approximately `S38`, approximately `S128`, and `S255`
- [ ] Machine-test along-path cuts, fill/etch operations, multiple passes, line interval, and overscan on representative materials
- [ ] Verify test-pattern labels run before cells and that independent label speed/power settings produce readable markings
- [ ] Record usable power/speed/kerf ranges and any machine-specific start/end G-code in the alpha feedback template
- [ ] Calibrate approximate depth at 100% power per pass for representative laser/material pairs
- [ ] Review focus-height, positioning, and operator guidance after hands-on use
- [ ] Treat any finding that can leave the laser energized during unintended travel as a `P0` issue

Why it matters:
The first-pass laser workflow is implemented, but real-machine validation is required before its defaults and output can be treated as trustworthy.

Goal:
Establish safe, repeatable cut and etch workflows on the target machine, then use measured results to refine defaults and UI guidance.

### 2. Geometry-aware milling tools and toolpath planning

- [x] Replace the implicit flat-end-mill assumption with an explicit milling tool geometry type
- [x] Represent flat end mills, ball-nose mills, V-bits/V-carve tools, and chamfer mills as the first geometry set
- [x] Define and validate geometry parameters, including:
  - Flat end mill: cutting diameter and usable cutting/flute length
  - Ball nose: cutting diameter/ball radius and usable cutting length
  - V-bit: included angle, tip/flat diameter, maximum cutting diameter, and usable depth
  - Chamfer mill: angle convention, tip diameter, maximum cutting diameter, and cutting height
- [x] Update bundled/default tools, project schema version, and stored preferences to use the new geometry schema
- [x] Show only geometry fields relevant to the selected milling tool type, with clear parameter guidance
- [x] Add shared tool-profile math for effective radius/contact point at a given depth instead of duplicating geometry calculations across planners
- [x] Show cutter-profile details and flag target depths beyond the usable profile in operation details and G-code comments
- [x] Keep current profile and pocket compensation correct for flat tools while making depth-dependent compensation available to tapered tools
- [x] Add fixed-width V-groove planning where cut depth follows the requested surface width within operation/tool depth limits
- [ ] Add area/shape V-carve planning with variable depth where geometry width changes along the path
- [x] Add chamfer-edge planning with explicit target chamfer width/depth and tool-envelope validation
- [x] Make tested ball-nose contact geometry available to surface finishing and future relief/contour strategies
- [x] Ensure 2D preview, 3D path preview, G-code, and operation validation consume the same planned centerline motion
- [x] Add geometry tests for angle conventions, tip flats, maximum usable depth/diameter, inverse contact height, and current-schema hydration
- [x] Test fixed-width V-groove depth, limiting, schema sanitization, editor controls, 2D/3D preview, and G-code
- [ ] Add specialized toolpath tests for area V-carve depth
- [x] Add specialized toolpath tests for chamfer placement and ball-nose surface contact

Status:
The geometry foundation, fixed-width V-grooves, chamfer-edge placement, and ball-nose surface contact are implemented through shared operation, preview, and G-code planning. Existing flat-tool behavior remains covered, while variable-depth area V-carving remains a separate strategy-design phase.

Why it matters:
Diameter alone is sufficient for a flat end mill, but V-carve, chamfer, and ball-nose work depends on the full cutter profile. Modeling that geometry once creates a trustworthy basis for both specialized toolpaths and result visualization.

Goal:
Let users define common milling cutter shapes and produce paths that account for how each cutter contacts and removes material.

### 3. Material-removal result preview

- [x] Preserve the current centerline toolpath overlay and add `Toolpaths`, `Result`, and combined preview modes
- [x] Define the starting stock solid explicitly enough to preview removal, including stock thickness and stock-top `Z0`
- [x] Simulate operations in job order using the same XYZ paths, depth passes, tabs, pockets, and tool profiles used for G-code
- [x] Start with a height-field/2.5D removal model for top-down axisymmetric cutters, which covers flat, ball-nose, V-bit, and chamfer tools without requiring a general-purpose solid kernel
- [x] Treat each cutter profile as an analytic implicit solid swept along shared XYZ motion, then triangulate the resulting stock envelope into a continuous mesh
- [x] Replace visible voxel/cell faces with clipped top, bottom, and stock-side mesh faces plus angle-based shading
- [x] Cull back-facing result faces and seal SVG polygon seams so underside faces and antialiasing gaps do not appear as view-dependent stripes
- [x] Move `Result` and combined rendering to a Three.js/WebGL depth-buffered mesh, retaining SVG toolpath playback and an automatic SVG fallback
- [x] Use crease-aware smooth surface normals for shaped cuts while preserving sharp stock edges and 90° laser/end-mill walls
- [x] Render the resulting workpiece in the 3D preview with stock boundaries, zero-plane-relative heights, and orbit/zoom controls
- [ ] Refine result-preview lighting, depth cues, and cut-surface coloring after visual and hands-on comparison
- [ ] Allow inspection of the final result and, where practical, the result after each operation or during playback
- [ ] Cache intermediate removal state per operation and invalidate only affected downstream results after edits
- [x] Set initial adaptive resolution/performance limits and disclose when the result is approximate or an operation is not represented
- [x] Offer high-resolution standard (~240k), detailed (~800k), and opt-in desktop ultra (~2M) result sampling budgets, with target spacing scaled for roughly 4× the prior surface detail
- [x] Greedily merge adjacent coplanar stock/result regions so untouched areas do not emit a face per sample cell
- [x] Preserve explicit 90° cut walls in flat/laser-only results while continuously interpolating ball-nose and tapered cutter envelopes
- [x] Preserve local 90° flat/laser boundaries when those operations share a result with ball-nose or tapered-tool cuts
- [x] Render full-depth milling cuts and laser kerfs that reach stock thickness as open gaps with internal stock walls instead of a stock-bottom floor
- [x] Approximate laser result depth from a per-tool/material 100%-power depth calibration, operation power, passes, and raster pixel luminance
- [x] Compare initial flat and ball-nose simulated cross-sections against analytic tool-profile expectations
- [ ] Extend analytic result-preview tests to V-bit/chamfer cross-sections and representative generated jobs
- [x] Keep material-removal visualization advisory: it does not alter G-code and explicitly discloses its adaptive sample resolution

Why it matters:
A centerline path answers where the machine moves; a removal preview answers what those moves are expected to produce. Seeing both makes depth, tool selection, operation order, missed material, and accidental over-cutting much easier to review.

Goal:
Provide a credible visual approximation of the finished workpiece by subtracting each milling tool's swept profile from the starting stock.

Status:
The first advisory result preview is implemented. It shares ordered 3D cut/plunge motion with G-code-oriented planning, includes retaining-tab lifts, and subtracts analytic axisymmetric cutter profiles from the stock envelope. That envelope is clipped and triangulated into a continuous shaded mesh rather than rendered as square cells. Flat/laser regions use greedy planar meshing with explicit vertical walls, including local boundaries inside jobs that also contain ball-nose or tapered-tool cuts. Continuous interpolation remains within the shaped-cutter regions. Laser depth is approximated from the selected laser/material calibration, requested power, passes, and raster pixel luminance; it remains a visualization aid rather than a physical process model. Cuts that reach stock thickness produce separated stock regions using milling width or laser kerf, and users can select standard, detailed, or desktop ultra sampling. Result and combined views now render the mesh through Three.js/WebGL so face visibility is resolved by a real depth buffer instead of SVG painter sorting; SVG remains the toolpath/playback renderer and fallback. Per-operation snapshots, downstream cache invalidation, further adaptive refinement, and broader cross-section validation remain. A general-purpose CSG kernel should only be reconsidered if future operations require undercuts or non-axisymmetric cutters.

### 4. Text tool and glyph-based path workflow

- [x] Add a `text` authoring tool that creates a new text operation
- [x] Let the user enter text content, choose a font, and set size/placement
- [x] Convert glyph outlines into an editable parametric text operation that regenerates geometry on edit
- [x] Support `cut along`, `cut outside`, and `cut inside` for closed glyph shapes where valid
- [x] Support retaining tabs on `cut outside` text contours
- [ ] Support `cut inside + clear area` for enclosed glyph regions without breaking counters/holes in letters
- [x] Keep text editable after creation by storing text/font/layout parameters on the text operation and regenerating geometry when edited

Status:
Initial text-tool authoring is good enough for alpha use. The next text-specific phase is pocket/clear-area support for filled glyphs.

Why it matters:
Text is a high-value authoring feature for signs, labels, engravings, and fixture marking, and it fits the existing 2D workflow better than introducing another isolated mode.

Goal:
Let users create usable toolpaths from text without depending on external SVG/DXF generation for every label or engraving job.

### 5. Excellon / DRL drill import

- [x] Parse first-pass KiCad/Excellon drill files into native drill operations
- [x] Handle unit assumptions explicitly enough for reliable first-pass KiCad import
- [x] Keep imported drill hits editable/re-orderable like manually placed drill operations
- [ ] Expand beyond the current first-pass assumptions for zero-suppressed / ambiguous Excellon coordinate formats
- [ ] Map plated/non-plated tool hits into drill operations with richer tool-diameter-aware summaries where practical
- [ ] Surface import warnings for unsupported commands or ambiguous format declarations

Why it matters:
PCB drilling and template/fixture workflows often begin from Excellon output, and importing those holes directly is a good fit for the existing drill operation model.

Goal:
Let users bring in KiCad-style drill maps without manually placing every hole.

### 6. Physical validation and preview-performance hardening for mesh workflows

- [ ] Capture machine-test findings for `surface-rough` and `surface-finish` using the alpha feedback template
- [ ] Optimize dense 2D preview rendering for surface operations so the canvas stays responsive during `surface-finish`
- [ ] Decide whether dense previews should use simplification, subsampling, or viewport-aware rendering while leaving G-code accuracy untouched
- [ ] Review whether the 3D preview needs additional stock-top / zero-plane cues after physical testing

Why it matters:
The STL workflow is implemented, but confidence now depends on how well preview responsiveness and real machine behavior line up on representative jobs.

Goal:
Keep STL workflows trustworthy under real machine use before adding more strategy complexity.

### 7. Mesh placement polish

- [ ] Add XY rotation for imported mesh placement in the 2D silhouette workflow
- [ ] Decide whether rotation should snap by default or allow free-angle numeric entry
- [ ] Make mesh placement bounds/origin feedback clearer while moving or rotating

Why it matters:
Translation-only placement is already useful, but rotation is the next practical lever for fitting imported parts into real stock.

### 8. STL import constraints and warning UX

- [ ] Define first-pass supported STL variants explicitly in-product and/or in docs
- [ ] Set a triangle-count threshold for warn vs refuse behavior
- [ ] Surface a reviewable import summary for mesh size/orientation assumptions and any warnings
- [ ] Decide whether ambiguous units/orientation stay assumption-based or prompt for confirmation

## P2: Follow-On Workflow Work

### 9. Hybrid clear-area planning

Why it matters:
Pure contour-offset clearing works, but it makes complete material removal harder in some shapes and is not ideal for future glyph/text clearing or more complex enclosed regions.

Scope:
- [ ] Keep contour passes near the outer boundary of a `clear area` operation
- [ ] Fill the remaining interior with a raster or line-by-line clearing strategy
- [ ] Continue respecting tool/material depth-per-pass settings
- [ ] Reuse the same strategy for shape pockets and text/glyph interior clearing where possible

### 10. Surface-finish strategy refinement

Reason for sequencing:
Useful, but intentionally deferred until more physical validation is complete on the current roughing/finishing output.

Scope:
- [ ] Refine finishing coverage in steep/curved regions
- [ ] Revisit finish stepover defaults based on machine testing
- [ ] Evaluate whether hybrid finishing patterns outperform simple raster/crosshatch for the first supported mesh parts

### 11. Playback timing modes

Why it matters:
The current preview is useful for quick review, but a closer-to-real-time mode would make it more useful for validating job sequence and operator expectations.

Scope:
- [ ] Add a `real-time` playback mode that approximates motion timing from feed/plunge rates and path length
- [ ] Keep the current fast preview mode and slow-mo mode
- [ ] Decide how rapid moves should be timed when exact machine acceleration is unknown
- [ ] Show enough UI feedback that users understand the timing is approximate, not a simulation

### 12. Better operation summaries

Why it matters:
The operations list should help confirm setup and catch invalid state without constant reselection.

Scope:
- [ ] Show compact summaries for tool, cut side/strategy, target depth, and tabs
- [x] Keep the job-wide material visible in machine setup instead of repeating it on every operation
- [ ] Show open/closed sketch state directly in the list
- [ ] Flag invalid or incomplete operations inline

### 13. Sketch edit-mode polish

Why it matters:
The sketch flow is functional now, but edit mode can still be clearer and more deliberate.

Scope:
- [ ] Make sketch editing state even more explicit in the toolbar/panels
- [ ] Clarify open-vs-closed finish choices where relevant
- [ ] Improve repair/reconnect affordances for open sketches

### 14. Numeric geometry editing follow-through

Why it matters:
Most important numeric editing is in place, but there are still remaining opportunities to make exact edits faster.

Scope:
- [ ] Extend the shared numeric control to any remaining dialogs/modals
- [ ] Improve focus/dirty-state feedback where useful
- [ ] Evaluate whether common derived values like line length or circle diameter should be editable directly

### 15. Import warning and cleanup UX

Why it matters:
The importers work well enough for real jobs now, but warning visibility and post-import cleanup can still be improved for larger or messier files.

Scope:
- [ ] Surface skipped-entity warnings in a more reviewable UI than the status bar alone
- [ ] Show a better import summary for counts of open vs closed paths
- [ ] Consider lightweight per-import cleanup actions for simplification or rejection

### 16. Codebase refactor pass

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
Job-wide material selection and `Apply depths to all operations` cover the highest-value bulk update flows for this alpha stage, and true heterogeneous multi-editing adds complexity in both UI state and undo behavior.

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

1. [ ] Run laser test patterns and representative cut/etch jobs on the target machine
2. [ ] Capture findings, promote any unsafe motion/output behavior to `P0`, and refine laser defaults and guidance
3. [ ] Calibrate advisory 100%-power depth values for representative laser/material pairs
4. [ ] Test raster photographs, logos, gradients, transparency, and fine line intervals on the target machine
5. [x] Make stock material a job-wide choice while retaining tool/material-specific presets
6. [x] Add grayscale raster-image import with brightness-driven inline laser power
7. [x] Add laser result depth based on material calibration, power, passes, and raster luminance
8. [x] Define the milling tool-geometry data model, validation rules, UI fields, and current project schema
9. [x] Add shared tool-profile/contact math, current-schema tests, and usable-depth validation
10. [x] Implement fixed-width V-groove planning through operation editing, preview, and G-code
11. [x] Add chamfer-edge placement with explicit target width/depth and tapered-tool validation
12. [x] Apply ball-nose contact geometry to surface finishing and add representative path tests
13. [ ] Design variable-depth area/shape V-carving separately from fixed-width path grooves
14. [x] Build the first height-field material-removal preview from the same ordered paths used by G-code
15. [x] Add toolpath/result/combined modes and WebGL result rendering
16. [ ] Refine result-preview accuracy, per-operation caching/playback, and performance on representative jobs
17. [ ] Improve clear-area generation with contour-plus-raster behavior for complete shape and glyph cleanup
18. [ ] Return to STL physical validation and preview-performance work with machine-test findings

## User-Driven Direction

- Resume hands-on laser testing and refinement when weather and machine access permit
- Keep mill and laser workflows in the same operation/material model while exposing only tool-appropriate settings
- Prefer test artifacts that remain useful when stopped early, including running labels before test cells
- Preserve a low-distraction drawing workspace with predictable panning, minimap navigation, and collapsible panels
- Let physical machine findings drive laser defaults, safety checks, and documentation before expanding strategy complexity
- Make common flat, ball-nose, V-carve, and chamfer milling tools first-class geometry types rather than treating every tool as a diameter-only end mill
- Preserve the existing toolpath view while adding a finished-workpiece preview based on ordered swept-tool subtraction
- Reuse one tool-geometry and planned-motion model so G-code and both preview modes cannot silently disagree
- Until the `1.0` release, prefer a clean current schema over migration code for older project/configuration files

- [x] Import should land inside the existing sketch and operation workflow, not become a separate mode
- [x] 3D toolpath preview is now in place as groundwork for future STL work
- [x] Job-wide material selection plus depth apply-all are sufficient for current bulk-edit needs during alpha
- [x] `SVG` and `DXF` import are both in place for the current alpha workflow
- [x] STL import now uses the completed 3D path-planning and visualization groundwork
- [x] First STL assumptions: Onshape/mm source, rectangular stock, stock-top `Z0`, centered placement, and dedicated `surface-rough` / `surface-finish` operations
- [x] Next 2D authoring expansion should include native text/glyph path creation rather than relying only on imported artwork
- [x] Text operations should remain directly editable after creation instead of flattening immediately to static geometry
