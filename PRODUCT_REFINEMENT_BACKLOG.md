# Product Refinement Backlog

This file tracks the next highest-value product work for `simple-CAM` during the current alpha phase.

## How To Use This Backlog

- Prioritize work that improves toolpath confidence, editing reliability, and machine-safe workflow clarity before adding larger CAM scope.
- Favor changes that reduce surprise geometry behavior or unexpected machine motion.
- When a refinement is selected, move it into an issue or feature branch with a tighter acceptance checklist.
- Add user-found machine testing notes to [ALPHA_FEEDBACK_TEMPLATE.md](ALPHA_FEEDBACK_TEMPLATE.md) so prioritization stays grounded in real runs.

## Priority Rubric

- `P0`: Core workflow or correctness issues that block confident use
- `P1`: High-frequency workflow improvements that reduce friction
- `P2`: Valuable feature expansion after alpha hardening work
- `P3`: Nice-to-have polish or longer-range expansion

## Completed Recently

### Toolpath preview clarity

Completed:
- 2D planned-path preview overlay
- Inside/outside/along path visualization
- Rapid links, start/end markers, and direction indicators
- Retaining tab highlighting
- Preview toggle in the top view controls

### Sketch-first drawing workflow

Completed:
- `New Sketch` flow that enters sketch edit mode immediately
- Local `Poly-Line` / `Poly-Arc` tools while editing a sketch
- Chained line/arc segment placement with close-on-start, `Enter`, `Esc`, and double-click finish
- Segment deletion and replacement flow during sketch editing
- Tool-aware canvas helper text instead of static selection-only guidance

Remaining follow-up:
- Stronger edit-mode affordances in the side panels and toolbar
- Optional explicit prompt/choice for leaving a sketch open vs closing it when relevant

### Transform hotkeys and modal numeric transform entry

Completed:
- `G`, `R`, and `S` transform entry for selected operations
- Live canvas preview while transforming
- `X` / `Y` axis locks for move and scale
- Numeric transform entry with `Enter` confirm and `Esc` cancel
- Status/canvas guidance while a transform is active
- `Ctrl+number` tool switching to avoid conflicts with transform hotkeys

Current behavior notes:
- Rotating rectangles converts them to sketch geometry because native rectangles are axis-aligned
- Non-uniformly scaling circles converts them to sketch geometry because there is no ellipse operation yet

Remaining follow-up:
- Extend transform workflow to sketch point/segment editing directly, not just whole operations
- Decide whether direct canvas gizmos/handles are needed in addition to keyboard-first transforms

### Numeric input controls

Completed:
- Shared text-backed numeric input that allows blank/retype and sign changes cleanly
- Applied to machine setup numeric fields and main editable operation numeric fields
- Applied to transform numeric entry and operation-side editing flows that were previously relying on browser number input behavior
- Preserved clamping/validation behavior without relying on browser `type="number"` quirks

Remaining follow-up:
- Extend the custom numeric control to any remaining editable numeric dialogs/modals
- Optional visual polish for focus/dirty-state feedback

## P0: Alpha Hardening

### 1. Sketch closure and geometry integrity checks

Why it matters:
Sketches are now central to more advanced geometry, so integrity issues should be obvious and recoverable.

Scope:
- Recompute and display closed/open state immediately after edits
- Detect tiny gaps, duplicate segments, zero-length segments, and overlapping fragments
- Offer a lightweight "inspect sketch" summary for selected sketches
- Make this validation reusable later for geometry import workflows

Acceptance notes:
- Closing a path after segment edits should update state without requiring extra user actions
- Users should be able to see why a sketch is considered open

### 2. Sketch-first drawing workflow

Why it matters:
The drawing flow should center around building and editing sketches instead of treating polyline/arc as separate top-level operations.

Scope:
- Add a clearer "new sketch" flow that enters sketch edit mode immediately
- Move line/arc segment creation into sketch editing rather than exposing them as top-level operation buttons
- Simplify the toolbar and editing affordances around the sketch workflow
- Keep rectangle/circle/drill/cutout flows available where they remain faster than sketching

Acceptance notes:
- It should be obvious when the user is creating/editing a sketch versus creating a standalone operation
- Sketch segment tools should feel local to the active sketch editing context

Status:
- Core workflow is implemented
- Remaining work is now tracked under `Better sketch editing mode`

## P1: Core Workflow Refinements

### 3. Blender-style transform hotkeys

Why it matters:
Fast keyboard-driven transforms will make geometry editing much more efficient, especially for repeated adjustments.

Implementation breakdown:
- Phase 1: Make helper/status text tool-aware and add non-conflicting tool hotkeys for sketch/select placement flow
  Status: complete
- Phase 2: Add transform state handling for `G`, `R`, and `S` with live preview and explicit confirm/cancel
  Status: complete
- Phase 3: Add axis locks with `X` / `Y`, plus on-screen transform state feedback while active
  Status: complete for move/scale; not applicable to rotate
- Phase 4: Add numeric entry during active transforms, with `Enter` to confirm and `Esc` to cancel
  Status: complete
- Phase 5: Expand the same transform flow to multi-select and sketch point editing without conflicting with text inputs
  Status: complete for multi-select operation transforms; sketch point/segment transforms still pending

Scope:
- Add `G` for grab/move, `R` for rotate, and `S` for scale
- Allow `X` or `Y` after transform start to constrain motion/transform to an axis
- Support numeric entry during transforms, with `Enter` to confirm and `Esc` to cancel
- Ensure this works consistently for single operations, multi-select, and sketch editing where applicable

Acceptance notes:
- Transform state should be clear while active
- Hotkeys should not conflict with text inputs or existing editing shortcuts

Status:
- Mostly complete for operation-level transforms
- Remaining work is direct sketch point/segment transform support

### 4. Numeric geometry editing

Why it matters:
Dragging is useful, but precise geometry needs direct coordinate and dimension entry.

Scope:
- Show editable numeric fields for selected points/segments
- Allow direct entry for line length, endpoint coordinates, circle diameter, rectangle width/height
- Support exact tab width/count edits from operation controls
- Pair this with more user-friendly numeric controls instead of relying on default browser number inputs where they hurt usability

Acceptance notes:
- Numeric edits should update canvas geometry immediately
- Inputs should respect current units and snapping behavior
- Numeric entry UX should feel deliberate rather than browser-default and fiddly

Status:
- Modal numeric transform entry is implemented during `G` / `R` / `S`
- Direct panel-based numeric editing is still the main remaining work

### 5. Better sketch editing mode

Why it matters:
Sketching is functionally useful now, but editing still has friction when repairing or extending shapes.

Scope:
- Make edit mode state more explicit in the UI
- Let sketch segment creation rely on the active sketch tools/workflow instead of extra insert buttons
- Improve discoverability for segment selection, deletion, and reconnecting open ends
- Add a simple "finish open sketch anyway" vs "close sketch" choice when relevant

Acceptance notes:
- Editing mode should make it obvious that drill/cut creation is temporarily unavailable
- Adding replacement segments after deletion should feel predictable

Status:
- Segment creation/deletion/replacement flow is in much better shape
- Remaining work is mostly UI clarity and more deliberate edit-mode controls

### 6. Batch operation editing

Why it matters:
Material, tool, cut side, and depth changes often need to apply across several operations.

Scope:
- Multi-edit selected operations for tool, material, cut side, tab settings, and enabled state
- Provide apply-to-selected controls alongside the current apply-to-all patterns
- Show mixed values clearly when selection is heterogeneous

Acceptance notes:
- Multi-edit should not silently overwrite unrelated operation fields
- Undo/redo should treat a batch edit as one action

### 7. Better operation summaries

Why it matters:
The operations list should help confirm job intent without constant re-selection.

Scope:
- Show compact summaries for tool, material, cut side, target depth, and tabs
- Show open/closed sketch state directly in the list
- Flag invalid or incomplete operations inline

Acceptance notes:
- Users should be able to spot incomplete setup from the operations panel alone

## P2: Feature Expansion

### 8. Pocketing and area clearing

Why it matters:
This is one of the biggest missing CAM capabilities after profile cuts and drilling.

Scope:
- Pocket inside closed rectangles, circles, and closed sketches
- Reuse current tool/material pass depth and feed settings
- Provide stepover control per operation or via tool/material defaults
- Limit the first implementation to simple contour-offset clearing before adding smarter raster/adaptive strategies

Acceptance notes:
- Start with simple offset pocketing before more advanced clearing strategies

Status:
- Initial implementation now supports `Clear area` on inside rectangle/circle/closed-sketch cuts
- Step-over is operation-configurable and defaults to `50%` of the selected tool diameter when the operation is created
- Preview and G-code both use the same planned pocket contour generation and layered depth-per-pass sequencing
- Concave sketch pocket cleanup now stays constrained by the original sketch outline while allowing overlapping inner cleanup contours
- Remaining work is mostly strategy refinement and optional future defaults/tool-material integration if needed later

### 9. Imported geometry workflow

Why it matters:
Manual sketching is good for simple jobs, but import will unlock more realistic projects.

Scope:
- Evaluate SVG or DXF import as sketch geometry
- Normalize imported shapes into existing sketch/segment models
- Preserve closed-path detection and cut-side support

Acceptance notes:
- Imported geometry should land in the same editing workflow as manually drawn sketches

### 10. Basic job estimates

Why it matters:
Estimated cut distance/time improves planning and can catch unexpectedly large jobs.

Scope:
- Estimate total cut distance, plunge count, rapid distance, and rough runtime
- Surface per-operation estimate details

Acceptance notes:
- Estimates can be rough, but assumptions should be obvious

## P3: Longer-Range Refinements

### 11. Constraints and snapping upgrades

Ideas:
- Horizontal/vertical constraints
- Tangent/endpoint inference for arcs
- Midpoint and center snapping
- Optional temporary snap disable modifier

### 12. Project UX polish

Ideas:
- Recent files
- Unsaved changes prompts
- Job notes and setup checklist
- Better empty states and onboarding hints

### 13. Machine integration polish

Ideas:
- Better OctoPrint upload/run feedback
- Dry-run or air-cut helper mode
- More explicit machine state/status feedback

### 14. Job preflight validation

Why it matters:
Preflight will still be useful, but it can follow once preview and geometry workflows are stronger.

Scope:
- Warn on missing tool assignment, missing material assignment, or missing tool/material profile values
- Warn when operation depth is zero, negative, or inconsistent with the selected operation type
- Warn when a sketch intended for inside/outside cutting is not closed
- Warn when tool diameter is too large for an inside feature or obviously invalid for the selected cut side
- Warn when tabs are enabled on geometry that cannot support them cleanly
- Warn when start/end positions, safe Z, or work depth settings appear contradictory

Acceptance notes:
- Validation should be visible before export and before OctoPrint send
- Warnings should identify the affected operation by name/id
- Blocking errors and non-blocking warnings should be distinct

## Suggested Near-Term Sequence

1. Sketch closure and integrity checks
2. Better sketch editing mode
3. Batch operation editing
4. Better operation summaries
5. Pocketing and area clearing refinement
6. Numeric geometry editing where direct point/segment fields are still missing

## User-Requested Priorities

Use this section to add or reorder work based on hands-on machine testing and day-to-day usage.

- Toolpath preview should eventually support a 3D visualization mode after the current 2D planned-path view
- Sketch creation/editing should feel like the primary geometry workflow instead of exposing polyline/poly-arc as separate top-level operations
- Keyboard transforms should follow Blender-like patterns where practical
- Numeric input UX should avoid frustrating default browser number controls
