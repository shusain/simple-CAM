import type {
  CircleOperation,
  DrillOperation,
  LineOperation,
  MachineSettings,
  Operation,
  Point,
  RectOperation,
  SketchOperation,
  Tool,
} from '../types';
import { getSketchSubpaths } from './geometry';
import { resolveToolPreset } from './tooling';
import { appendPathWithTabs, getTabRanges } from './gcode/tabs';
import { buildIncrementDepths, getStartEndZ, num, toNegativeDepth, toPositiveStep } from './gcode/depth';
import {
  buildRoundedRectPath,
  clampRectCornerRadius,
  distanceBetween,
  getCutSide,
  getToolRadius,
  normalizeRectGeometry,
  offsetClosedPath,
} from './gcode/path';
import type { PathOperation } from './gcode/shared';

interface GenerateMarlinGcodeArgs {
  operations: Operation[];
  settings: MachineSettings;
  tools: Tool[];
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
  useStartEndClearance: boolean
): void {
  if (useStartEndClearance) {
    lines.push(`G0 X${num(startPoint.x)} Y${num(startPoint.y)} F${rapidFeed}`);
    lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
    return;
  }

  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
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
  useStartEndClearance = false
): void {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
    return;
  }

  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const rapidFeed = num(preset.rapidFeedRate, 0);
  const plungeFeed = num(preset.plungeFeedRate, 0);
  const cutFeed = num(preset.cutFeedRate, 0);
  const finalDepth = toNegativeDepth(operation.depth, settings.cutDepth);
  const passStep = toPositiveStep(preset.cutDepthPerPass, Math.abs(finalDepth));
  const passes = buildIncrementDepths(finalDepth, passStep);
  const tabRanges = getTabRanges(pathPoints, operation, tool);
  const tabHeight = 'tabHeight' in operation ? Math.max(0.1, Math.abs(Number(operation.tabHeight) || 1)) : 1;

  const start = pathPoints[0];
  passes.forEach((depth, index) => {
    appendEntryMove(lines, start, rapidFeed, settings, useStartEndClearance && index === 0);
    lines.push(`G1 Z${num(depth)} F${plungeFeed}`);

    const liftedDepth = 'tabsEnabled' in operation && operation.tabsEnabled ? Math.min(-0.001, depth + tabHeight) : depth;
    if ('tabsEnabled' in operation && operation.tabsEnabled && liftedDepth !== depth && tabRanges.length > 0) {
      appendPathWithTabs(lines, pathPoints, depth, liftedDepth, cutFeed, plungeFeed, tabRanges);
    } else {
      for (let i = 1; i < pathPoints.length; i += 1) {
        const point = pathPoints[i];
        lines.push(`G1 X${num(point.x)} Y${num(point.y)} F${cutFeed}`);
      }
    }

    lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
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
    useStartEndClearance
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
  const baseRect = normalizeRectGeometry(operation.x, operation.y, operation.width, operation.height);
  const toolRadius = getToolRadius(tool);
  const cutSide = getCutSide(operation, 'outside');
  const offsetAmount = cutSide === 'outside' ? toolRadius : cutSide === 'inside' ? -toolRadius : 0;
  const offsetRect = {
    x: baseRect.x - offsetAmount,
    y: baseRect.y - offsetAmount,
    width: baseRect.width + offsetAmount * 2,
    height: baseRect.height + offsetAmount * 2,
  };
  const baseCorner = clampRectCornerRadius(operation.cornerRadius, baseRect.width, baseRect.height);
  const offsetCorner = clampRectCornerRadius(
    baseCorner + offsetAmount,
    offsetRect.width,
    offsetRect.height
  );
  const cornerSegments = Math.max(2, Math.floor((settings.circleSegments || 48) / 4));

  if (offsetRect.width <= 0.0001 || offsetRect.height <= 0.0001) {
    lines.push(`; Cut rectangle (${cutSide} requested, falling back to along path: tool too large for inside offset)`);
    appendCutPath(lines, buildRoundedRectPath(baseRect, baseCorner, cornerSegments), operation, settings, tool, useStartEndClearance);
    return;
  }

  lines.push(`; Cut rectangle (${cutSide} path)`);
  lines.push(`; Tool radius compensation ${num(offsetAmount)}mm`);
  lines.push(`; Nominal ${num(baseRect.width)} x ${num(baseRect.height)} mm, corner R${num(baseCorner)} -> path corner R${num(offsetCorner)}`);

  const path = buildRoundedRectPath(
    cutSide === 'along' ? baseRect : offsetRect,
    cutSide === 'along' ? baseCorner : offsetCorner,
    cornerSegments
  );
  appendCutPath(lines, path, operation, settings, tool, useStartEndClearance);
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
  const toolRadius = getToolRadius(tool);
  const cutSide = getCutSide(operation, 'outside');
  const offsetAmount = cutSide === 'outside' ? toolRadius : cutSide === 'inside' ? -toolRadius : 0;
  const compensatedRadius = operation.radius + offsetAmount;

  if (compensatedRadius <= 0.0001) {
    lines.push(`; Cut circle (${cutSide} requested, falling back to along path: tool too large for inside offset)`);
  } else {
    lines.push(`; Cut circle nominal R${num(operation.radius)} (${cutSide} tool-center path R${num(compensatedRadius)})`);
  }

  const segments = Math.max(8, Math.floor(settings.circleSegments || 48));
  const path: Point[] = [];
  const pathRadius = compensatedRadius <= 0.0001 ? operation.radius : compensatedRadius;

  for (let i = 0; i <= segments; i += 1) {
    const theta = (Math.PI * 2 * i) / segments;
    path.push({
      x: operation.x + pathRadius * Math.cos(theta),
      y: operation.y + pathRadius * Math.sin(theta),
    });
  }

  appendCutPath(lines, path, operation, settings, tool, useStartEndClearance);
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

  const cutSide = getCutSide(operation, operation.closed ? 'outside' : 'along');
  const toolRadius = getToolRadius(tool);
  lines.push(`; Cut sketch ${operation.closed ? 'closed' : 'open'} path (${subpaths.length} subpath(s))`);
  lines.push(`; Toolpath mode: ${operation.closed ? cutSide : 'along'}${operation.closed && cutSide !== 'along' ? `, tool radius compensation ${num(toolRadius)}mm` : ''}`);
  subpaths.forEach((path, index) => {
    if (path.length < 2) {
      return;
    }
    let plannedPath = path;
    if (operation.closed && cutSide !== 'along') {
      const offsetPath = offsetClosedPath(path, cutSide === 'outside' ? toolRadius : -toolRadius);
      if (offsetPath) {
        plannedPath = offsetPath;
      } else {
        lines.push(`; Sketch subpath ${index + 1} offset failed, falling back to along path`);
      }
    }
    lines.push(`; Sketch subpath ${index + 1}`);
    appendCutPath(lines, plannedPath, operation, settings, tool, useStartEndClearance && index === 0);
  });
}

export function generateMarlinGcode({ operations, settings, tools }: GenerateMarlinGcodeArgs): string {
  const lines: string[] = [];
  addHeader(lines, settings, operations.length);

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

    appendSketchCut(lines, operation, settings, tool, useStartEndClearance);
    previousTool = tool;
    previousToolKey = toolKey;
    useStartEndClearance = false;
  });

  addFooter(lines, settings);
  return `${lines.join('\n')}\n`;
}
