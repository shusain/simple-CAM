# Toolpath Preview Plan

This note breaks the first preview milestone into implementable slices.

## Goal

Add a 2D planned toolpath preview that reflects the XY tool-center motion used by G-code generation.

## Scope For First Pass

1. Build a shared preview path planner
2. Reuse current cut-side and tab logic so preview and G-code stay aligned
3. Render planned cut paths, rapid links, and tab locations in the canvas
4. Add a simple UI toggle to show or hide the preview

## Out Of Scope For First Pass

- 3D stock/tool simulation
- Per-pass stacked depth visualization
- Full preflight validation
- Runtime machine playback

## Implementation Steps

### Step 1. Shared path planning

- Build a pure helper that resolves the planned XY path for each operation
- Match current G-code rules for line, rectangle, circle, and sketch operations
- Include tab span extraction so tabs can be highlighted in preview

### Step 2. Job preview assembly

- Convert planned operation paths into job-level preview segments
- Distinguish rapid travel, plunge entry markers, cutting paths, and tab spans
- Add start/end markers for the overall job

### Step 3. Canvas overlay

- Render the preview as a separate overlay layer
- Keep source geometry visible underneath
- Use clear visual distinction for rapid vs cut vs tab segments

### Step 4. Basic controls

- Add a simple show/hide toggle in the control panel
- Default the preview to enabled

### Step 5. Verification

- Add unit coverage for planned-path generation and tab slicing
- Extend drawing tests to cover the preview overlay
- Run tests and build before commit
