# Simple CAM

Simple desktop CAM sketcher for MPCNC / Marlin workflows, built with Electron + React.

Current release stage: alpha.

## Safety disclaimer

This project is a work in progress. Use it at your own risk.

Generating or running G-code on a CNC machine, router, mill, or similar equipment always carries risk, including machine damage, tool breakage, fire risk, and bodily harm or injury. You are responsible for validating machine setup, work offsets, tool selection, feeds/speeds, clearances, hold-downs, travel limits, and the final generated toolpath before running a job.

I am doing what I can to test and validate the generated output, but machine behavior also depends on controller configuration, firmware behavior, hardware setup, calibration, and other conditions outside the scope of this app. Dry-run new jobs, stay with the machine while it is running, and be prepared to stop the machine immediately if something looks wrong.

## Overview

This app lets you:

- Draw CAM operations on a 2D work area (`drill`, `line`, `rectangle`, `circle`, and editable sketch paths)
- Edit sketch geometry with `Poly-Line` / `Poly-Arc`, segment handles, transforms, and numeric entry
- Preview planned 2D toolpaths with rapids, cut direction, retaining tabs, and pocket/clear-area motion
- Import `SVG`, `DXF`, and first-pass `STL` geometry into the normal authoring workflow
- Assign tools and materials with per-tool/per-material feeds and pass-depth presets
- Configure laser tools with material-specific kerf, speed/power ranges, percent-to-`S0–S255` power mapping, and Marlin `M3 I` / `M4 I` inline power
- Generate cut outlines, raster fill/etch paths with power-off overscan, and configurable speed/power test grids
- Customize the G-code emitted at the start and end of each job
- Create first-pass STL-derived `surface-rough` and `surface-finish` operations
- Inspect jobs in a 3D preview with orbit/zoom, bounds, orientation gizmo, and playback controls
- Collapse either sidebar for a distraction-free drawing and preview workspace
- Export Marlin-compatible G-code, save/open project files (`.cam.json`), and send jobs to OctoPrint

The project docs and active planning notes live under [docs/](./docs/README.md).

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

Browser-hosted mode works for the core editor and G-code export download, but desktop-only flows remain disabled there:

- native open/save dialogs
- SVG/DXF/STL/DRL file-picker imports
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
- `Ctrl/Cmd + Z` undo
- `Ctrl/Cmd + Shift + Z` or `Ctrl + Y` redo
- `Delete` / `Backspace` delete selected operations
- `Esc` cancel draw/paste interactions

## Project save/load and local preferences

- Project files include operations plus machine/tool/material configuration data.
- App preferences also persist machine settings + tool/material setup between launches.

## Repository notes

- Build output is generated into `dist/`
- Electron build output is generated into `dist-electron/`
- Packaged desktop release output is generated into `release/`
- Test coverage output is generated into `coverage/`
- Dependency directory is `node_modules/`
- These are ignored via [`.gitignore`](.gitignore)
