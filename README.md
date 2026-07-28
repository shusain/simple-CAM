# Simple CAM

Simple desktop CAM sketcher for MPCNC / Marlin workflows, built with Electron + React.

Current release stage: alpha.

## Safety disclaimer

This project is a work in progress. Use it at your own risk.

Generating or running G-code on a CNC machine, router, mill, or similar equipment always carries risk, including machine damage, tool breakage, fire risk, and bodily harm or injury. You are responsible for validating machine setup, work offsets, tool selection, feeds/speeds, clearances, hold-downs, travel limits, and the final generated toolpath before running a job.

Laser use adds eye-injury, fire, smoke/fume, and unintended-beam hazards. Use suitable shielding and protective equipment, provide appropriate ventilation, and never leave an active laser unattended.

I am doing what I can to test and validate the generated output, but machine behavior also depends on controller configuration, firmware behavior, hardware setup, calibration, and other conditions outside the scope of this app. Dry-run new jobs, stay with the machine while it is running, and be prepared to stop the machine immediately if something looks wrong.

## Overview

This app lets you:

- Draw CAM operations on a 2D work area (`drill`, `line`, `rectangle`, `circle`, editable sketch paths, and parametric text)
- Edit sketch geometry with `Poly-Line` / `Poly-Arc`, segment handles, transforms, and numeric entry
- Preview planned 2D toolpaths with rapids, cut direction, retaining tabs, and pocket/clear-area motion
- Import `SVG`, `DXF`, Excellon/`DRL`, first-pass `STL`, and `PNG`/`JPEG`/`WebP`/`BMP` raster images
- Select one job-wide stock material and configure feeds, pass depth, and laser behavior for each tool/material pairing
- Define flat-end, ball-nose, V-bit, and chamfer milling tools, including fixed-width V-groove and chamfer-edge strategies
- Configure laser tools with material-specific kerf, speed/power ranges, approximate depth at 100% power per pass, percent-to-`S0–S255` power mapping, and Marlin `M3 I` / `M4 I` inline power
- Generate laser cut outlines, filled etching with power-off overscan, and labeled speed/power test grids
- Import grayscale images as laser image-fill operations, then position, scale, rotate, and map image brightness to a minimum/maximum power range
- Customize the G-code emitted at the start and end of each job
- Create first-pass STL-derived `surface-rough` and `surface-finish` operations
- Inspect centerline motion in a 3D toolpath preview with orbit/zoom, bounds, orientation gizmo, and playback controls
- Preview the approximate finished stock in WebGL `Result` or `Combined` modes using swept milling-tool geometry and calibrated laser depth
- Pan the canvas freely, navigate through a clickable minimap, and collapse either sidebar for a distraction-free workspace
- Export Marlin-compatible G-code, save/open project files (`.cam.json`), and send jobs to OctoPrint

The project docs and active planning notes live under [docs/](./docs/README.md).

### Alpha-stage limitations

- Result/material-removal rendering is advisory. It does not alter G-code and is not a substitute for inspecting the planned motion or running a safe dry run.
- Laser depth is a rough estimate based on the selected laser/material calibration, requested power, and pass count. Real depth also depends on speed, focus, material variation, air assist, and other physical conditions.
- Raster engraving and laser defaults still require validation on the target machine and material.
- Project/configuration compatibility may change before the `1.0` release.

## Requirements

- Node.js 18+ (recommended current LTS)
- npm

## Install

```bash
npm install
```

## Run in development

Starts the webpack dev server and Electron together:

```bash
npm run dev
```

Useful individual scripts:

```bash
npm run dev:renderer
npm run dev:electron
```

## Build

Build renderer assets for production:

```bash
npm run build
```

## Test

Run the unit test suite:

```bash
npm test
```

Run the suite with coverage output:

```bash
npm run test:coverage
```

The GitHub Actions CI workflow runs `typecheck`, `test:coverage`, and `build` on pushes to `main` and on pull requests.

## Self-hosted web build

This repo can also be built as a browser-hosted app from the webpack `dist/` output.

The included Docker/Drone/Kubernetes files are set up for that path:

- `Dockerfile` builds the renderer and serves it with nginx
- `.drone.yml` verifies the app on pull requests and builds/deploys on pushes to `main`
- `k8s/` contains a minimal deployment, service, and ingress

Browser-hosted mode supports the core editor, browser file-picker imports, and G-code export downloads. These desktop-only flows remain disabled there:

- project open/save
- direct OctoPrint upload

## Releases

Tagged GitHub releases are built automatically by GitHub Actions.

- Use `vX.Y.Z-alpha.N` tags for alpha releases
- Use `vX.Y.Z-beta.N` tags for beta releases
- Use `vX.Y.Z` tags for stable releases once the app is ready

Alpha and beta tags are published as GitHub pre-releases automatically. Stable tags publish a normal GitHub release with packaged desktop artifacts plus a `SHA256SUMS.txt` manifest.

Current release packaging targets:

- Windows: NSIS installer (`.exe`)
- macOS: disk image (`.dmg`)
- Linux: AppImage

These builds are currently unsigned, so Windows Defender, macOS Gatekeeper, or similar trust prompts may still appear until code signing and notarization are added.

## Launch (production mode)

Builds first, then opens Electron:

```bash
npm start
```

## Keyboard shortcuts

- `Ctrl/Cmd + C` copy selected operations
- `Ctrl/Cmd + V` paste mode (click canvas to place)
- `Ctrl/Cmd + A` select all operations while the canvas is focused
- `Ctrl/Cmd + Z` undo
- `Ctrl/Cmd + Shift + Z` or `Ctrl + Y` redo
- `Ctrl/Cmd + 1–7` select the corresponding visible drawing tool
- `G`, `R`, or `S` move, rotate, or scale the current selection
- `X` / `Y` constrain a move or scale transform; type a number for an exact value
- `Enter` confirm the current transform or sketch; `Esc` cancel it
- `Delete` / `Backspace` delete selected operations
- `Alt/Option + drag`, middle-button drag, or the minimap pans the canvas
- `Ctrl/Cmd + wheel` zooms around the pointer

## Project save/load and local preferences

- Project files include operations, embedded raster luminance data, imported meshes, and machine/tool/material configuration.
- The selected material is job-wide; each tool can keep a different preset for that material.
- App preferences also persist machine settings and tool/material setup between launches.
- Until `1.0`, older alpha project/configuration files are not guaranteed to load unchanged.

## Repository notes

- Build output is generated into `dist/`
- Electron build output is generated into `dist-electron/`
- Packaged desktop release output is generated into `release/`
- Test coverage output is generated into `coverage/`
- Dependency directory is `node_modules/`
- These are ignored via [`.gitignore`](.gitignore)
