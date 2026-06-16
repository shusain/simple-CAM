import type { CircleOperation, CutSide, DrillOperation, MachineSettings, Operation, Point, RectOperation, SketchOperation, Tool } from '../types';
import { getSketchSubpaths, isClosedSketchPath } from './geometry';
import { buildRoundedRectPath, clampRectCornerRadius, getCutSide, getToolRadius, interpolatePoint, normalizeRectGeometry, offsetClosedPath, pointsEqual } from './gcode/path';
import type { TabRange } from './gcode/shared';
import { getTabRanges } from './gcode/tabs';
import { buildPocketContourPaths, buildRectPocketContourPaths } from './pocketing';

export type ToolpathPreviewSegmentKind = 'rapid' | 'cut' | 'tab';
export type ToolpathPreviewMarkerKind = 'start' | 'end' | 'plunge' | 'drill';

export interface OperationPlannedPath {
  operationId: string;
  operationType: Operation['type'];
  cutSide: CutSide;
  path: Point[];
  tabRanges: TabRange[];
  fallbackToAlongPath: boolean;
  isPocketPath: boolean;
}

export interface ToolpathPreviewSegment {
  kind: ToolpathPreviewSegmentKind;
  operationId: string | null;
  operationType: Operation['type'] | 'job';
  points: Point[];
}

export interface ToolpathPreviewMarker {
  kind: ToolpathPreviewMarkerKind;
  operationId: string | null;
  operationType: Operation['type'] | 'job';
  point: Point;
}

export interface ToolpathPreview {
  segments: ToolpathPreviewSegment[];
  markers: ToolpathPreviewMarker[];
}

interface BuildToolpathPreviewArgs {
  operations: Operation[];
  settings: MachineSettings;
  tools: Tool[];
}

function getPathBounds(path: Point[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (!Array.isArray(path) || path.length === 0) {
    return null;
  }

  let minX = path[0].x;
  let maxX = path[0].x;
  let minY = path[0].y;
  let maxY = path[0].y;

  path.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });

  return { minX, maxX, minY, maxY };
}

function getPathArea(path: Point[]): number {
  if (!Array.isArray(path) || path.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
}

function isValidInwardOffset(basePath: Point[], candidatePath: Point[]): boolean {
  const baseBounds = getPathBounds(basePath);
  const candidateBounds = getPathBounds(candidatePath);
  if (!baseBounds || !candidateBounds) {
    return false;
  }

  const tolerance = 0.0001;
  const baseArea = getPathArea(basePath);
  const candidateArea = getPathArea(candidatePath);
  if (candidateArea <= tolerance || candidateArea >= baseArea - tolerance) {
    return false;
  }

  const baseWidth = baseBounds.maxX - baseBounds.minX;
  const baseHeight = baseBounds.maxY - baseBounds.minY;
  const candidateWidth = candidateBounds.maxX - candidateBounds.minX;
  const candidateHeight = candidateBounds.maxY - candidateBounds.minY;

  return candidateWidth < baseWidth - tolerance && candidateHeight < baseHeight - tolerance;
}

function getOperationTool(operation: Operation, tools: Tool[]): Tool | null {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null;
  }

  return tools.find((tool) => tool.id === operation.toolId) || null;
}

function buildCirclePath(operation: CircleOperation, settings: MachineSettings, tool: Tool | null): OperationPlannedPath[] {
  const toolRadius = getToolRadius(tool);
  const cutSide = getCutSide(operation, 'outside');
  const offsetAmount = cutSide === 'outside' ? toolRadius : cutSide === 'inside' ? -toolRadius : 0;
  const compensatedRadius = operation.radius + offsetAmount;
  const pathRadius = compensatedRadius <= 0.0001 ? operation.radius : compensatedRadius;
  const segments = Math.max(8, Math.floor(settings.circleSegments || 48));
  const path: Point[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const theta = (Math.PI * 2 * i) / segments;
    path.push({
      x: operation.x + pathRadius * Math.cos(theta),
      y: operation.y + pathRadius * Math.sin(theta),
    });
  }

  const fallbackToAlongPath = compensatedRadius <= 0.0001 && cutSide !== 'along';
  const plannedPaths =
    cutSide === 'inside' && operation.pocketEnabled && !fallbackToAlongPath
      ? buildPocketContourPaths(path, operation.pocketStepOver)
      : [path];

  return plannedPaths.map((plannedPath, index) => ({
    operationId: operation.id,
    operationType: operation.type,
    cutSide,
    path: plannedPath,
    tabRanges: operation.pocketEnabled && cutSide === 'inside' ? [] : getTabRanges(plannedPath, operation, tool),
    fallbackToAlongPath,
    isPocketPath: index > 0,
  }));
}

function buildRectPath(operation: RectOperation, settings: MachineSettings, tool: Tool | null): OperationPlannedPath[] {
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
    Math.max(0, baseCorner + offsetAmount),
    offsetRect.width,
    offsetRect.height
  );
  const cornerSegments = Math.max(2, Math.floor((settings.circleSegments || 48) / 4));
  const fallbackToAlongPath = offsetRect.width <= 0.0001 || offsetRect.height <= 0.0001;
  const path = buildRoundedRectPath(
    fallbackToAlongPath || cutSide === 'along' ? baseRect : offsetRect,
    fallbackToAlongPath || cutSide === 'along' ? baseCorner : offsetCorner,
    cornerSegments
  );

  const plannedPaths =
    cutSide === 'inside' && operation.pocketEnabled && !fallbackToAlongPath
      ? buildRectPocketContourPaths(
          offsetRect,
          offsetCorner,
          operation.pocketStepOver,
          cornerSegments
        )
      : [path];

  return plannedPaths.map((plannedPath, index) => ({
    operationId: operation.id,
    operationType: operation.type,
    cutSide,
    path: plannedPath,
    tabRanges: operation.pocketEnabled && cutSide === 'inside' ? [] : getTabRanges(plannedPath, operation, tool),
    fallbackToAlongPath,
    isPocketPath: index > 0,
  }));
}

function buildSketchPaths(operation: SketchOperation, settings: MachineSettings, tool: Tool | null): OperationPlannedPath[] {
  const subpaths = getSketchSubpaths(operation, settings.circleSegments || 48);
  const effectiveClosed = Boolean(operation.closed || isClosedSketchPath(operation));
  const cutSide = getCutSide(operation, effectiveClosed ? 'outside' : 'along');
  const toolRadius = getToolRadius(tool);

  return subpaths
    .filter((path) => path.length >= 2)
    .map((path) => {
      let plannedPath = path;
      let fallbackToAlongPath = false;

      if (effectiveClosed && cutSide !== 'along') {
        const offsetPath = offsetClosedPath(path, cutSide === 'outside' ? toolRadius : -toolRadius);
        if (offsetPath && (cutSide !== 'inside' || isValidInwardOffset(path, offsetPath))) {
          plannedPath = offsetPath;
        } else {
          fallbackToAlongPath = true;
        }
      }

      const basePlannedPath = {
        operationId: operation.id,
        operationType: operation.type,
        cutSide,
        path: plannedPath,
        tabRanges: operation.pocketEnabled && cutSide === 'inside' ? [] : getTabRanges(plannedPath, operation, tool),
        fallbackToAlongPath,
        isPocketPath: false,
      };

      if (!(effectiveClosed && cutSide === 'inside' && operation.pocketEnabled) || fallbackToAlongPath) {
        return [basePlannedPath];
      }

      return buildPocketContourPaths(plannedPath, operation.pocketStepOver).map((pocketPath, index) => ({
        ...basePlannedPath,
        path: pocketPath,
        tabRanges: [],
        isPocketPath: index > 0,
      }));
    })
    .flat();
}

export function getOperationPlannedPaths(
  operation: Exclude<Operation, DrillOperation>,
  settings: MachineSettings,
  tool: Tool | null
): OperationPlannedPath[] {
  if (operation.type === 'line') {
    return [
      {
        operationId: operation.id,
        operationType: operation.type,
        cutSide: 'along',
        path: [
          { x: operation.x1, y: operation.y1 },
          { x: operation.x2, y: operation.y2 },
        ],
        tabRanges: [],
        fallbackToAlongPath: false,
        isPocketPath: false,
      },
    ];
  }

  if (operation.type === 'rect') {
    return buildRectPath(operation, settings, tool);
  }

  if (operation.type === 'circle') {
    return buildCirclePath(operation, settings, tool);
  }

  return buildSketchPaths(operation, settings, tool);
}

export function slicePathByRange(pathPoints: Point[], range: TabRange): Point[] {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
    return [];
  }

  const startDistance = Number(range.start);
  const endDistance = Number(range.end);
  if (!Number.isFinite(startDistance) || !Number.isFinite(endDistance) || endDistance <= startDistance) {
    return [];
  }

  const points: Point[] = [];
  let traveled = 0;

  for (let i = 1; i < pathPoints.length; i += 1) {
    const start = pathPoints[i - 1];
    const end = pathPoints[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    const segmentStart = traveled;
    const segmentEnd = traveled + segmentLength;

    if (segmentLength <= 0.000001) {
      traveled = segmentEnd;
      continue;
    }

    if (endDistance <= segmentStart) {
      break;
    }

    if (startDistance >= segmentEnd) {
      traveled = segmentEnd;
      continue;
    }

    const localStart = Math.max(startDistance, segmentStart);
    const localEnd = Math.min(endDistance, segmentEnd);
    const localStartPoint =
      localStart <= segmentStart + 0.000001
        ? start
        : interpolatePoint(start, end, localStart - segmentStart);
    const localEndPoint =
      localEnd >= segmentEnd - 0.000001
        ? end
        : interpolatePoint(start, end, localEnd - segmentStart);

    if (points.length === 0 || !pointsEqual(points[points.length - 1], localStartPoint)) {
      points.push(localStartPoint);
    }
    if (!pointsEqual(points[points.length - 1], localEndPoint)) {
      points.push(localEndPoint);
    }

    traveled = segmentEnd;
  }

  return points.length >= 2 ? points : [];
}

export function buildToolpathPreview({ operations, settings, tools }: BuildToolpathPreviewArgs): ToolpathPreview {
  const segments: ToolpathPreviewSegment[] = [];
  const markers: ToolpathPreviewMarker[] = [];
  const home = { x: 0, y: 0 };
  let previousEndPoint: Point | null = operations.length > 0 ? home : null;

  if (operations.length > 0) {
    markers.push({
      kind: 'start',
      operationId: null,
      operationType: 'job',
      point: home,
    });
  }

  operations.forEach((operation) => {
    if (operation.type === 'drill') {
      const point = { x: operation.x, y: operation.y };
      if (previousEndPoint && !pointsEqual(previousEndPoint, point)) {
        segments.push({
          kind: 'rapid',
          operationId: operation.id,
          operationType: operation.type,
          points: [previousEndPoint, point],
        });
      }
      markers.push({
        kind: 'drill',
        operationId: operation.id,
        operationType: operation.type,
        point,
      });
      previousEndPoint = point;
      return;
    }

    const tool = getOperationTool(operation, tools);
    const plannedPaths = getOperationPlannedPaths(operation, settings, tool);

    plannedPaths.forEach((plannedPath) => {
      if (plannedPath.path.length < 2) {
        return;
      }

      const startPoint = plannedPath.path[0];
      const endPoint = plannedPath.path[plannedPath.path.length - 1];
      if (previousEndPoint && !pointsEqual(previousEndPoint, startPoint)) {
        segments.push({
          kind: 'rapid',
          operationId: plannedPath.operationId,
          operationType: plannedPath.operationType,
          points: [previousEndPoint, startPoint],
        });
      }

      markers.push({
        kind: 'plunge',
        operationId: plannedPath.operationId,
        operationType: plannedPath.operationType,
        point: startPoint,
      });
      segments.push({
        kind: 'cut',
        operationId: plannedPath.operationId,
        operationType: plannedPath.operationType,
        points: plannedPath.path,
      });

      plannedPath.tabRanges.forEach((range) => {
        const tabPoints = slicePathByRange(plannedPath.path, range);
        if (tabPoints.length >= 2) {
          segments.push({
            kind: 'tab',
            operationId: plannedPath.operationId,
            operationType: plannedPath.operationType,
            points: tabPoints,
          });
        }
      });

      previousEndPoint = endPoint;
    });
  });

  if (previousEndPoint) {
    if (!pointsEqual(previousEndPoint, home)) {
      segments.push({
        kind: 'rapid',
        operationId: null,
        operationType: 'job',
        points: [previousEndPoint, home],
      });
    }
    markers.push({
      kind: 'end',
      operationId: null,
      operationType: 'job',
      point: home,
    });
  }

  return { segments, markers };
}
