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

## P0: Alpha Hardening

### 1. Toolpath preview clarity

Why it matters:
The user should be able to visually confirm what the machine will do before running the job.

Scope:
- Start with a clear 2D toolpath preview that shows the final planned path, not just source geometry
- Preview cut offset for `inside`, `outside`, and `along`
- Distinguish rapid moves, plunge moves, and cutting moves
- Highlight retaining tabs in the preview
- Show start point and end point for each operation or the full job
- Leave room in the design for a later 3D preview mode that shows pass depth and Z transitions

Acceptance notes:
- Preview should match exported G-code intent closely enough to catch direction, offset, or tab mistakes
- Tabs should be easy to locate visually
- 2D preview should be the first milestone, with 3D visualization as a follow-on refinement

### 2. Sketch closure and geometry integrity checks

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

### 3. Sketch-first drawing workflow

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

## P1: Core Workflow Refinements

### 4. Blender-style transform hotkeys

Why it matters:
Fast keyboard-driven transforms will make geometry editing much more efficient, especially for repeated adjustments.

Scope:
- Add `G` for grab/move, `R` for rotate, and `S` for scale
- Allow `X` or `Y` after transform start to constrain motion/transform to an axis
- Support numeric entry during transforms, with `Enter` to confirm and `Esc` to cancel
- Ensure this works consistently for single operations, multi-select, and sketch editing where applicable

Acceptance notes:
- Transform state should be clear while active
- Hotkeys should not conflict with text inputs or existing editing shortcuts

### 5. Numeric geometry editing

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

### 6. Better sketch editing mode

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

### 7. Batch operation editing

Why it matters:
Material, tool, cut side, and depth changes often need to apply across several operations.

Scope:
- Multi-edit selected operations for tool, material, cut side, tab settings, and enabled state
- Provide apply-to-selected controls alongside the current apply-to-all patterns
- Show mixed values clearly when selection is heterogeneous

Acceptance notes:
- Multi-edit should not silently overwrite unrelated operation fields
- Undo/redo should treat a batch edit as one action

### 8. Better operation summaries

Why it matters:
The operations list should help confirm job intent without constant re-selection.

Scope:
- Show compact summaries for tool, material, cut side, target depth, and tabs
- Show open/closed sketch state directly in the list
- Flag invalid or incomplete operations inline

Acceptance notes:
- Users should be able to spot incomplete setup from the operations panel alone

## P2: Feature Expansion

### 9. Pocketing and area clearing

Why it matters:
This is one of the biggest missing CAM capabilities after profile cuts and drilling.

Scope:
- Pocket inside closed rectangles, circles, and closed sketches
- Reuse current tool/material pass depth and feed settings
- Provide stepover control per operation or via tool/material defaults

Acceptance notes:
- Start with simple offset pocketing before more advanced clearing strategies

### 10. Imported geometry workflow

Why it matters:
Manual sketching is good for simple jobs, but import will unlock more realistic projects.

Scope:
- Evaluate SVG or DXF import as sketch geometry
- Normalize imported shapes into existing sketch/segment models
- Preserve closed-path detection and cut-side support

Acceptance notes:
- Imported geometry should land in the same editing workflow as manually drawn sketches

### 11. Basic job estimates

Why it matters:
Estimated cut distance/time improves planning and can catch unexpectedly large jobs.

Scope:
- Estimate total cut distance, plunge count, rapid distance, and rough runtime
- Surface per-operation estimate details

Acceptance notes:
- Estimates can be rough, but assumptions should be obvious

## P3: Longer-Range Refinements

### 12. Constraints and snapping upgrades

Ideas:
- Horizontal/vertical constraints
- Tangent/endpoint inference for arcs
- Midpoint and center snapping
- Optional temporary snap disable modifier

### 13. Project UX polish

Ideas:
- Recent files
- Unsaved changes prompts
- Job notes and setup checklist
- Better empty states and onboarding hints

### 14. Machine integration polish

Ideas:
- Better OctoPrint upload/run feedback
- Dry-run or air-cut helper mode
- More explicit machine state/status feedback

### 15. Job preflight validation

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

1. Toolpath preview clarity, starting with a strong 2D planned-path view
2. Sketch closure and integrity checks
3. Sketch-first drawing workflow
4. Blender-style transform hotkeys
5. Numeric geometry editing with better input controls
6. Better sketch editing mode

## User-Requested Priorities

Use this section to add or reorder work based on hands-on machine testing and day-to-day usage.

- Toolpath preview should eventually support a 3D visualization mode after the initial 2D planned-path view
- Sketch creation/editing should feel like the primary geometry workflow instead of exposing polyline/poly-arc as separate top-level operations
- Keyboard transforms should follow Blender-like patterns where practical
- Numeric input UX should avoid frustrating default browser number controls
