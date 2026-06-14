# Simple CAM

Simple desktop CAM sketcher for MPCNC / Marlin workflows, built with Electron + React.

## Overview

This app lets you:

- Draw CAM operations on a 2D work area (drill, line, rectangle, circle)
- Manage operation order and per-operation tool assignment
- Assign materials per operation and apply a material across the whole job
- Configure machine settings (safe Z, feed rates, depth settings, spindle options)
- Configure tool library values (diameter plus per-material feed and stepdown presets)
- Export Marlin-compatible G-code
- Save/open project files (`.cam.json`)

Recent workflow features include:

- Multi-select (Shift+click + drag-select)
- Group move in canvas
- Copy/paste placement workflow (keyboard)
- Undo/redo history (keyboard)

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
- Dependency directory is `node_modules/`
- These are ignored via [`.gitignore`](.gitignore)
