import type {
  CircleOperation,
  DrillOperation,
  ImportedMesh,
  LineOperation,
  MachineSettings,
  Operation,
  PathOperation,
  Point,
  RectOperation,
  SketchOperation,
  TextOperation,
  SurfaceFinishOperation,
  SurfaceRoughOperation,
  Tool,
} from '../types';
import { isPathOperation } from '../types';
import { getSketchSubpaths } from './geometry';
import { resolveToolPreset } from './tooling';
import { appendPathWithTabs, getTabRanges } from './gcode/tabs';
import { buildIncrementDepths, getStartEndZ, num, toNegativeDepth, toPositiveStep } from './gcode/depth';
import {
  distanceBetween,
  getToolRadius,
} from './gcode/path';
import { getOperationPlannedPaths } from './toolpathPreview';
import { buildSurfaceFinishPlan, buildSurfaceRoughPlan } from './surfaceRoughing';

interface GenerateMarlinGcodeArgs {
  operations: Operation[];
  settings: MachineSettings;
  tools: Tool[];
  importedMeshes?: ImportedMesh[];
}

interface CutPathOptions {
  useStartEndClearance?: boolean;
  betweenPassClearanceZ?: number;
  finalRetractZ?: number;
}

interface CutPathFeeds {
  rapidFeed: string;
  plungeFeed: string;
  cutFeed: string;
}

function getOperationTravelZ(settings: MachineSettings): number {
  const safeZ = Number(settings.safeZ);
  if (!Number.isFinite(safeZ) || safeZ <= 0) {
    return 1;
  }

  return Math.min(safeZ, 1);
}

function addHeader(lines: string[], settings: MachineSettings, operationCount: number): void {
  const rapidFeed = num(settings.rapidFeedRate || 2400, 0);
  const startEndZ = num(getStartEndZ(settings));

  lines.push('; Simple CAM output');
  lines.push('; Target: Marlin (MPCNC)');
  lines.push(`; Operations: ${operationCount}`);
  lines.push(`; Work area: ${settings.workWidth} x ${settings.workHeight} mm`);
  lines.push('G21 ; mm units');
  lines.push('G90 ; absolute positioning');
  lines.push('G94 ; feed rate in units/min');
  lines.push(`G0 Z${startEndZ} F${rapidFeed}`);

  if (settings.spindleOn) {
    lines.push(`M3 S${Math.round(settings.spindleSpeed || 0)}`);
  }

  lines.push('');
}

function addFooter(lines: string[], settings: MachineSettings): void {
  const rapidFeed = num(settings.rapidFeedRate || 2400, 0);
  const startEndZ = num(getStartEndZ(settings));

  lines.push('');
  lines.push('; Program end');
  lines.push(`G0 Z${startEndZ} F${rapidFeed}`);
  lines.push(`G0 X0 Y0 F${rapidFeed}`);

  if (settings.spindleOn) {
    lines.push('M5');
  }

  lines.push('M2');
}

function getOperationTool(operation: Operation, tools: Tool[] | null | undefined): Tool | null {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null;
  }

  const match = tools.find((tool) => tool.id === operation.toolId);
  return match || null;
}

function getToolKey(tool: Tool | null): string {
  if (tool?.id) {
    return `tool:${tool.id}`;
  }
  return 'tool:none';
}

function formatToolLabel(tool: Tool | null): string {
  if (!tool) {
    return 'Unassigned tool';
  }
  return `${tool.name} (Ø${num(tool.diameter)}mm)`;
}

function appendToolChange(lines: string[], previousTool: Tool | null, nextTool: Tool | null, settings: MachineSettings): void {
  const rapidFeed = num(settings.rapidFeedRate || 2400, 0);
  const startEndZ = num(getStartEndZ(settings));

  lines.push('; Tool change required');
  lines.push(`; From: ${formatToolLabel(previousTool)} -> To: ${formatToolLabel(nextTool)}`);

  if (settings.spindleOn) {
    lines.push('M5');
  }

  lines.push(`G0 Z${startEndZ} F${rapidFeed}`);
  lines.push(`G0 X0 Y0 F${rapidFeed}`);
  lines.push(`M0 Change tool: ${formatToolLabel(nextTool)}`);

  if (settings.spindleOn) {
    lines.push(`M3 S${Math.round(settings.spindleSpeed || 0)}`);
  }

  lines.push('');
}

function appendEntryMove(
  lines: string[],
  startPoint: Point,
  rapidFeed: string,
  settings: MachineSettings,
  useStartEndClearance: boolean,
  clearanceZ = Number(settings.safeZ) || 5
): void {
  if (useStartEndClearance) {
    lines.push(`G0 X${num(startPoint.x)} Y${num(startPoint.y)} F${rapidFeed}`);
    lines.push(`G0 Z${num(clearanceZ)} F${rapidFeed}`);
    return;
  }

  lines.push(`G0 Z${num(clearanceZ)} F${rapidFeed}`);
  lines.push(`G0 X${num(startPoint.x)} Y${num(startPoint.y)} F${rapidFeed}`);
}

function appendDrill(
  lines: string[],
  operation: DrillOperation,
  settings: MachineSettings,
  tool: Tool | null,
  useStartEndClearance = false
): void {
  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const rapidFeed = num(preset.rapidFeedRate, 0);
  const plungeFeed = num(preset.plungeFeedRate, 0);
  const finalDepth = toNegativeDepth(operation.depth, settings.drillDepth);
  const peckDepth = toPositiveStep(preset.drillDepthPerPass, Math.abs(finalDepth));
  const pecks = buildIncrementDepths(finalDepth, peckDepth);
  const peckRetractZ = 1;

  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  lines.push(
    `; Drill @ X${num(operation.x)} Y${num(operation.y)} depth ${num(finalDepth)} peck ${num(peckDepth)}`
  );
  appendEntryMove(lines, { x: operation.x, y: operation.y }, rapidFeed, settings, useStartEndClearance);

  pecks.forEach((depth, index) => {
    lines.push(`G1 Z${num(depth)} F${plungeFeed}`);

    if (index < pecks.length - 1) {
      lines.push(`G0 Z${num(peckRetractZ)} F${rapidFeed}`);
      lines.push(`G0 X${num(operation.x)} Y${num(operation.y)} F${rapidFeed}`);
    }
  });

  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
  lines.push('');
}

function appendCutPath(
  lines: string[],
  pathPoints: Point[],
  operation: PathOperation,
  settings: MachineSettings,
  tool: Tool | null,
  options: CutPathOptions = {}
): void {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
    return;
  }

  const {
    useStartEndClearance = false,
    betweenPassClearanceZ = getOperationTravelZ(settings),
    finalRetractZ = Number(settings.safeZ) || 5,
  } = options;
  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const rapidFeed = num(preset.rapidFeedRate, 0);
  const plungeFeed = num(preset.plungeFeedRate, 0);
  const cutFeed = num(preset.cutFeedRate, 0);
  const finalDepth = toNegativeDepth(operation.depth, settings.cutDepth);
  const passStep = toPositiveStep(preset.cutDepthPerPass, Math.abs(finalDepth));
  const passes = buildIncrementDepths(finalDepth, passStep);
  const tabRanges = getTabRanges(pathPoints, operation, tool);
  const tabHeight = 'tabHeight' in operation ? Math.max(0.1, Math.abs(Number(operation.tabHeight) || 1)) : 1;
  const feeds = { rapidFeed, plungeFeed, cutFeed };

  const start = pathPoints[0];
  passes.forEach((depth, index) => {
    appendCutPathAtDepth(lines, pathPoints, operation, settings, tool, depth, feeds, {
      useStartEndClearance: useStartEndClearance && index === 0,
      retractZ: index === passes.length - 1 ? finalRetractZ : betweenPassClearanceZ,
      clearanceZ: index === 0 ? Number(settings.safeZ) || 5 : betweenPassClearanceZ,
      tabRanges,
      tabHeight,
    });
  });

  lines.push('');
}

interface CutPathAtDepthOptions {
  useStartEndClearance: boolean;
  retractZ: number;
  clearanceZ: number;
  tabRanges: ReturnType<typeof getTabRanges>;
  tabHeight: number;
}

function appendCutPathAtDepth(
  lines: string[],
  pathPoints: Point[],
  operation: PathOperation,
  settings: MachineSettings,
  _tool: Tool | null,
  depth: number,
  feeds: CutPathFeeds,
  options: CutPathAtDepthOptions
): void {
  const start = pathPoints[0];
  appendEntryMove(
    lines,
    start,
    feeds.rapidFeed,
    settings,
    options.useStartEndClearance,
    options.clearanceZ
  );
  lines.push(`G1 Z${num(depth)} F${feeds.plungeFeed}`);

  const liftedDepth =
    'tabsEnabled' in operation && operation.tabsEnabled
      ? Math.min(-0.001, depth + options.tabHeight)
      : depth;
  if ('tabsEnabled' in operation && operation.tabsEnabled && liftedDepth !== depth && options.tabRanges.length > 0) {
    appendPathWithTabs(lines, pathPoints, depth, liftedDepth, feeds.cutFeed, feeds.plungeFeed, options.tabRanges);
  } else {
    for (let i = 1; i < pathPoints.length; i += 1) {
      const point = pathPoints[i];
      lines.push(`G1 X${num(point.x)} Y${num(point.y)} F${feeds.cutFeed}`);
    }
  }

  lines.push(`G0 Z${num(options.retractZ)} F${feeds.rapidFeed}`);
}

function appendPocketCutPaths(
  lines: string[],
  plannedPaths: { path: Point[] }[],
  operation: PathOperation,
  settings: MachineSettings,
  tool: Tool | null,
  useStartEndClearance: boolean
): void {
  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const feeds: CutPathFeeds = {
    rapidFeed: num(preset.rapidFeedRate, 0),
    plungeFeed: num(preset.plungeFeedRate, 0),
    cutFeed: num(preset.cutFeedRate, 0),
  };
  const finalDepth = toNegativeDepth(operation.depth, settings.cutDepth);
  const passStep = toPositiveStep(preset.cutDepthPerPass, Math.abs(finalDepth));
  const passes = buildIncrementDepths(finalDepth, passStep);
  const operationTravelZ = getOperationTravelZ(settings);

  passes.forEach((depth, depthIndex) => {
    lines.push(`; Depth pass ${depthIndex + 1} (${num(depth)}mm)`);
    plannedPaths.forEach((plannedPath, pathIndex) => {
      lines.push(`; Pocket contour ${pathIndex + 1}`);
      appendCutPathAtDepth(lines, plannedPath.path, operation, settings, tool, depth, feeds, {
        useStartEndClearance: useStartEndClearance && depthIndex === 0 && pathIndex === 0,
        clearanceZ:
          depthIndex === 0 && pathIndex === 0 ? Number(settings.safeZ) || 5 : operationTravelZ,
        retractZ:
          depthIndex === passes.length - 1 && pathIndex === plannedPaths.length - 1
            ? Number(settings.safeZ) || 5
            : operationTravelZ,
        tabRanges: [],
        tabHeight: 1,
      });
    });
  });

  lines.push('');
}

function appendSurfaceRoughCut(
  lines: string[],
  operation: SurfaceRoughOperation,
  settings: MachineSettings,
  tool: Tool | null,
  mesh: ImportedMesh | null | undefined,
  useStartEndClearance = false
): void {
  const plan = buildSurfaceRoughPlan(operation, mesh, settings, tool);

  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  lines.push(`; Surface roughing (${plan.scanAxis.toUpperCase()} raster, stepover ${num(operation.stepOver)}mm, stock to leave ${num(operation.stockToLeave)}mm)`);

  if (!mesh) {
    lines.push('; Imported mesh not found for surface roughing operation');
    lines.push('');
    return;
  }

  if (plan.paths.length === 0) {
    lines.push('; No surface roughing paths were generated');
    lines.push('');
    return;
  }

  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const rapidFeed = num(preset.rapidFeedRate, 0);
  const plungeFeed = num(preset.plungeFeedRate, 0);
  const cutFeed = num(preset.cutFeedRate, 0);
  const betweenPathZ = getOperationTravelZ(settings);

  let currentPassIndex = -1;

  plan.paths.forEach((path, pathIndex) => {
    if (path.points.length < 2) {
      return;
    }

    if (path.passIndex !== currentPassIndex) {
      currentPassIndex = path.passIndex;
      lines.push(`; Surface roughing pass ${path.passIndex + 1} (${num(path.passDepth)}mm)`);
    }

    lines.push(`; Raster row ${path.rowIndex + 1}`);

    const startPoint = path.points[0];
    appendEntryMove(
      lines,
      { x: startPoint.x, y: startPoint.y },
      rapidFeed,
      settings,
      useStartEndClearance && pathIndex === 0,
      pathIndex === 0 ? Number(settings.safeZ) || 5 : betweenPathZ
    );
    lines.push(`G1 Z${num(startPoint.z)} F${plungeFeed}`);

    for (let pointIndex = 1; pointIndex < path.points.length; pointIndex += 1) {
      const point = path.points[pointIndex];
      lines.push(`G1 X${num(point.x)} Y${num(point.y)} Z${num(point.z)} F${cutFeed}`);
    }

    const retractZ = pathIndex === plan.paths.length - 1 ? Number(settings.safeZ) || 5 : betweenPathZ;
    lines.push(`G0 Z${num(retractZ)} F${rapidFeed}`);
  });

  lines.push('');
}

function appendSurfaceFinishCut(
  lines: string[],
  operation: SurfaceFinishOperation,
  settings: MachineSettings,
  tool: Tool | null,
  mesh: ImportedMesh | null | undefined,
  useStartEndClearance = false
): void {
  const plan = buildSurfaceFinishPlan(operation, mesh, settings, tool);

  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  lines.push(`; Surface finishing (${plan.scanAxis.toUpperCase()} pattern, stepover ${num(operation.stepOver)}mm)`);

  if (!mesh) {
    lines.push('; Imported mesh not found for surface finishing operation');
    lines.push('');
    return;
  }

  if (plan.paths.length === 0) {
    lines.push('; No surface finishing paths were generated');
    lines.push('');
    return;
  }

  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const rapidFeed = num(preset.rapidFeedRate, 0);
  const plungeFeed = num(preset.plungeFeedRate, 0);
  const cutFeed = num(preset.cutFeedRate, 0);
  const betweenPathZ = getOperationTravelZ(settings);

  let currentPassIndex = -1;

  plan.paths.forEach((path, pathIndex) => {
    if (path.points.length < 2) {
      return;
    }

    if (path.passIndex !== currentPassIndex) {
      currentPassIndex = path.passIndex;
      lines.push(`; Surface finishing pass ${path.passIndex + 1} (${num(path.passDepth)}mm)`);
    }

    lines.push(`; Finish row ${path.rowIndex + 1}`);

    const startPoint = path.points[0];
    appendEntryMove(
      lines,
      { x: startPoint.x, y: startPoint.y },
      rapidFeed,
      settings,
      useStartEndClearance && pathIndex === 0,
      pathIndex === 0 ? Number(settings.safeZ) || 5 : betweenPathZ
    );
    lines.push(`G1 Z${num(startPoint.z)} F${plungeFeed}`);

    for (let pointIndex = 1; pointIndex < path.points.length; pointIndex += 1) {
      const point = path.points[pointIndex];
      lines.push(`G1 X${num(point.x)} Y${num(point.y)} Z${num(point.z)} F${cutFeed}`);
    }

    const retractZ = pathIndex === plan.paths.length - 1 ? Number(settings.safeZ) || 5 : betweenPathZ;
    lines.push(`G0 Z${num(retractZ)} F${rapidFeed}`);
  });

  lines.push('');
}

function appendLineCut(
  lines: string[],
  operation: LineOperation,
  settings: MachineSettings,
  tool: Tool | null,
  useStartEndClearance = false
): void {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  lines.push('; Cut line');
  appendCutPath(
    lines,
    [
      { x: operation.x1, y: operation.y1 },
      { x: operation.x2, y: operation.y2 },
    ],
    operation,
    settings,
    tool,
    { useStartEndClearance }
  );
}

function appendRectCut(
  lines: string[],
  operation: RectOperation,
  settings: MachineSettings,
  tool: Tool | null,
  useStartEndClearance = false
): void {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  const plannedPaths = getOperationPlannedPaths(operation, settings, tool);
  const firstPath = plannedPaths[0];
  if (!firstPath) {
    return;
  }
  const toolRadius = getToolRadius(tool);

  if (firstPath.fallbackToAlongPath && firstPath.cutSide === 'inside') {
    lines.push('; Cut rectangle (inside requested, falling back to along path: tool too large for inside offset)');
  } else if (operation.pocketEnabled && firstPath.cutSide === 'inside') {
    lines.push(`; Pocket rectangle (inside clear area, stepover ${num(operation.pocketStepOver)}mm)`);
  } else {
    lines.push(`; Cut rectangle (${firstPath.cutSide} path)`);
  }
  if (firstPath.cutSide !== 'along' && toolRadius > 0 && !firstPath.fallbackToAlongPath) {
    lines.push(`; Tool radius compensation ${num(toolRadius)}mm`);
  }

  plannedPaths.forEach((plannedPath, index) => {
    if (!(operation.pocketEnabled && firstPath.cutSide === 'inside')) {
      appendCutPath(
        lines,
        plannedPath.path,
        operation,
        settings,
        tool,
        {
          useStartEndClearance: useStartEndClearance && index === 0,
          betweenPassClearanceZ: getOperationTravelZ(settings),
          finalRetractZ:
            index === plannedPaths.length - 1 ? Number(settings.safeZ) || 5 : getOperationTravelZ(settings),
        }
      );
    }
  });
  if (operation.pocketEnabled && firstPath.cutSide === 'inside') {
    appendPocketCutPaths(lines, plannedPaths, { ...operation, tabsEnabled: false }, settings, tool, useStartEndClearance);
  }
}

function appendCircleCut(
  lines: string[],
  operation: CircleOperation,
  settings: MachineSettings,
  tool: Tool | null,
  useStartEndClearance = false
): void {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  const plannedPaths = getOperationPlannedPaths(operation, settings, tool);
  const firstPath = plannedPaths[0];
  if (!firstPath) {
    return;
  }

  if (firstPath.fallbackToAlongPath && firstPath.cutSide === 'inside') {
    lines.push('; Cut circle (inside requested, falling back to along path: tool too large for inside offset)');
  } else if (operation.pocketEnabled && firstPath.cutSide === 'inside') {
    lines.push(`; Pocket circle (inside clear area, stepover ${num(operation.pocketStepOver)}mm)`);
  } else {
    lines.push(`; Cut circle (${firstPath.cutSide} path)`);
  }

  plannedPaths.forEach((plannedPath, index) => {
    if (!(operation.pocketEnabled && firstPath.cutSide === 'inside')) {
      appendCutPath(
        lines,
        plannedPath.path,
        operation,
        settings,
        tool,
        {
          useStartEndClearance: useStartEndClearance && index === 0,
          betweenPassClearanceZ: getOperationTravelZ(settings),
          finalRetractZ:
            index === plannedPaths.length - 1 ? Number(settings.safeZ) || 5 : getOperationTravelZ(settings),
        }
      );
    }
  });
  if (operation.pocketEnabled && firstPath.cutSide === 'inside') {
    appendPocketCutPaths(lines, plannedPaths, { ...operation, tabsEnabled: false }, settings, tool, useStartEndClearance);
  }
}

function appendSketchCut(
  lines: string[],
  operation: SketchOperation,
  settings: MachineSettings,
  tool: Tool | null,
  useStartEndClearance = false
): void {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }

  const subpaths = getSketchSubpaths(operation, settings.circleSegments || 48);
  if (subpaths.length === 0) {
    return;
  }

  lines.push(`; Cut sketch ${operation.closed ? 'closed' : 'open'} path (${subpaths.length} subpath(s))`);
  if (operation.pocketEnabled && operation.cutSide === 'inside' && operation.closed) {
    lines.push(`; Pocket sketch (inside clear area, stepover ${num(operation.pocketStepOver)}mm)`);
  }

  const plannedPaths = getOperationPlannedPaths(operation, settings, tool);
  const isPocketSketch = operation.pocketEnabled && operation.cutSide === 'inside' && operation.closed;
  plannedPaths.forEach((plannedPath, index) => {
    if (plannedPath.fallbackToAlongPath) {
      lines.push(`; Sketch subpath ${index + 1} offset failed, falling back to along path`);
    } else if (!isPocketSketch) {
      lines.push(`; Sketch subpath ${index + 1}`);
    }
    if (!isPocketSketch) {
      appendCutPath(
        lines,
        plannedPath.path,
        operation,
        settings,
        tool,
        {
          useStartEndClearance: useStartEndClearance && index === 0,
          betweenPassClearanceZ: getOperationTravelZ(settings),
          finalRetractZ:
            index === plannedPaths.length - 1 ? Number(settings.safeZ) || 5 : getOperationTravelZ(settings),
        }
      );
    }
  });
  if (isPocketSketch) {
    appendPocketCutPaths(lines, plannedPaths, { ...operation, tabsEnabled: false }, settings, tool, useStartEndClearance);
  }
}

function appendTextCut(
  lines: string[],
  operation: TextOperation,
  settings: MachineSettings,
  tool: Tool | null,
  useStartEndClearance = false
): void {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }

  const plannedPaths = getOperationPlannedPaths(operation, settings, tool);
  if (plannedPaths.length === 0) {
    return;
  }

  const label = operation.text.trim().replace(/\s+/g, ' ') || 'Text';
  lines.push(`; Cut text "${label}" (${plannedPaths.length} contour(s))`);

  plannedPaths.forEach((plannedPath, index) => {
    if (plannedPath.fallbackToAlongPath) {
      lines.push(`; Text contour ${index + 1} offset failed, falling back to along path`);
    } else {
      lines.push(`; Text contour ${index + 1} (${plannedPath.cutSide} path)`);
    }

    appendCutPath(
      lines,
      plannedPath.path,
      operation,
      settings,
      tool,
      {
        useStartEndClearance: useStartEndClearance && index === 0,
        betweenPassClearanceZ: getOperationTravelZ(settings),
        finalRetractZ:
          index === plannedPaths.length - 1 ? Number(settings.safeZ) || 5 : getOperationTravelZ(settings),
      }
    );
  });
}

export function generateMarlinGcode({ operations, settings, tools, importedMeshes = [] }: GenerateMarlinGcodeArgs): string {
  const lines: string[] = [];
  addHeader(lines, settings, operations.length);
  const importedMeshMap = new Map(importedMeshes.map((mesh) => [mesh.id, mesh]));

  let previousTool: Tool | null = null;
  let previousToolKey: string | null = null;
  let useStartEndClearance = true;

  operations.forEach((operation) => {
    const tool = getOperationTool(operation, tools);
    const toolKey = getToolKey(tool);

    if (previousToolKey !== null && toolKey !== previousToolKey) {
      appendToolChange(lines, previousTool, tool, settings);
      useStartEndClearance = true;
    }

    if (operation.type === 'drill') {
      appendDrill(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'line') {
      appendLineCut(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'rect') {
      appendRectCut(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'circle') {
      appendCircleCut(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'surface-rough') {
      appendSurfaceRoughCut(
        lines,
        operation,
        settings,
        tool,
        importedMeshMap.get(operation.meshId),
        useStartEndClearance
      );
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'surface-finish') {
      appendSurfaceFinishCut(
        lines,
        operation,
        settings,
        tool,
        importedMeshMap.get(operation.meshId),
        useStartEndClearance
      );
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (!isPathOperation(operation)) {
      return;
    }

    if (operation.type === 'text') {
      appendTextCut(lines, operation, settings, tool, useStartEndClearance);
    } else {
      appendSketchCut(lines, operation, settings, tool, useStartEndClearance);
    }
    previousTool = tool;
    previousToolKey = toolKey;
    useStartEndClearance = false;
  });

  addFooter(lines, settings);
  return `${lines.join('\n')}\n`;
}
