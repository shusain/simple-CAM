import type {
  CircleOperation,
  CutSide,
  ImportedMesh,
  MachineSettings,
  Operation,
  PathOperation,
  Point,
  RectOperation,
  SurfaceFinishOperation,
  SketchOperation,
  SurfaceRoughOperation,
  TextOperation,
  Tool,
} from '../types';
import { isPathOperation } from '../types';
import { getSketchSubpaths, isClosedSketchPath } from './geometry';
import { buildRoundedRectPath, clampRectCornerRadius, getCutSide, getToolRadius, interpolatePoint, normalizeRectGeometry, offsetClosedPath, pointsEqual } from './gcode/path';
import type { TabRange } from './gcode/shared';
import { getTabRanges } from './gcode/tabs';
import { buildPocketContourPaths, buildRectPocketContourPaths } from './pocketing';
import { buildSurfaceFinishPlan, buildSurfaceRoughPlan } from './surfaceRoughing';
import { getTextOperationContours } from './text';
import { buildLaserFillSegments } from './laserFill';
import { resolveLaserMaterialPreset } from './tooling';
import { EndType, FillRule, inflatePathsD, JoinType, unionD } from 'clipper2-ts';

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

export interface CirclePlan {
  cutSide: CutSide;
  fallbackToAlongPath: boolean;
  pathRadius: number;
  radii: number[];
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
  importedMeshes?: ImportedMesh[];
}

function projectSurfacePath(points: { x: number; y: number }[]): Point[] {
  const projected: Point[] = [];
  points.forEach((point) => {
    const previous = projected[projected.length - 1];
    if (!previous || !pointsEqual(previous, point)) {
      projected.push({ x: point.x, y: point.y });
    }
  });
  return projected;
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

function getSignedPathArea(path: Point[]): number {
  if (!Array.isArray(path) || path.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    area += current.x * next.y - next.x * current.y;
  }

  return area / 2;
}

function stripClosingPoint(path: Point[]): Point[] {
  if (path.length >= 2 && pointsEqual(path[0], path[path.length - 1])) {
    return path.slice(0, -1);
  }
  return [...path];
}

function ensureClosedPath(path: Point[]): Point[] {
  if (path.length === 0) {
    return [];
  }
  return pointsEqual(path[0], path[path.length - 1]) ? [...path] : [...path, path[0]];
}

function orientClosedPath(path: Point[], clockwise: boolean): Point[] {
  const openPath = stripClosingPoint(path);
  if (openPath.length < 3) {
    return [];
  }

  const isClockwise = getSignedPathArea([...openPath, openPath[0]]) < 0;
  const oriented = isClockwise === clockwise ? openPath : [...openPath].reverse();
  return ensureClosedPath(oriented);
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

function buildCirclePolyline(cx: number, cy: number, radius: number, segments: number): Point[] {
  const safeRadius = Math.max(0, Number(radius) || 0);
  const safeSegments = Math.max(8, Math.floor(segments || 48));
  const path: Point[] = [];

  for (let i = 0; i <= safeSegments; i += 1) {
    const theta = (Math.PI * 2 * i) / safeSegments;
    path.push({
      x: cx + safeRadius * Math.cos(theta),
      y: cy + safeRadius * Math.sin(theta),
    });
  }

  return path;
}

export function getCirclePlan(operation: CircleOperation, tool: Tool | null): CirclePlan {
  const toolRadius = getToolRadius(tool);
  const cutSide = getCutSide(operation, 'outside');
  const offsetAmount = cutSide === 'outside' ? toolRadius : cutSide === 'inside' ? -toolRadius : 0;
  const compensatedRadius = operation.radius + offsetAmount;
  const fallbackToAlongPath = compensatedRadius <= 0.0001 && cutSide !== 'along';
  const pathRadius = fallbackToAlongPath ? operation.radius : compensatedRadius;
  const radii = [pathRadius];

  if (cutSide === 'inside' && operation.pocketEnabled && !fallbackToAlongPath) {
    const safeStepOver = Math.abs(Number(operation.pocketStepOver) || 0);
    const targetInnerRadius = toolRadius > 0.0001 ? toolRadius : 0;

    if (safeStepOver > 0.0001) {
      let currentRadius = pathRadius;
      for (let index = 0; index < 500; index += 1) {
        const nextRadius = currentRadius - safeStepOver;
        if (nextRadius <= targetInnerRadius + 0.0001) {
          break;
        }
        radii.push(nextRadius);
        currentRadius = nextRadius;
      }
    }

    const lastRadius = radii[radii.length - 1];
    if (targetInnerRadius > 0.0001 && lastRadius > targetInnerRadius + 0.0001) {
      radii.push(targetInnerRadius);
    }
  }

  return {
    cutSide,
    fallbackToAlongPath,
    pathRadius,
    radii,
  };
}

function buildCirclePath(operation: CircleOperation, settings: MachineSettings, tool: Tool | null): OperationPlannedPath[] {
  const segments = Math.max(8, Math.floor(settings.circleSegments || 48));
  const plan = getCirclePlan(operation, tool);
  const plannedPaths = plan.radii.map((radius) => buildCirclePolyline(operation.x, operation.y, radius, segments));

  return plannedPaths.map((plannedPath, index) => ({
    operationId: operation.id,
    operationType: operation.type,
    cutSide: plan.cutSide,
    path: plannedPath,
    tabRanges: operation.pocketEnabled && plan.cutSide === 'inside' ? [] : getTabRanges(plannedPath, operation, tool),
    fallbackToAlongPath: plan.fallbackToAlongPath,
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

function buildTextPaths(operation: TextOperation, _settings: MachineSettings, tool: Tool | null): OperationPlannedPath[] {
  const contours = getTextOperationContours(operation);
  const cutSide = getCutSide(operation, 'along');
  const toolRadius = getToolRadius(tool);

  if (cutSide === 'along' || toolRadius <= 0) {
    return contours
      .filter((contour) => contour.points.length >= 2)
      .map((contour) => ({
        operationId: operation.id,
        operationType: operation.type,
        cutSide,
        path: contour.points,
        tabRanges: cutSide === 'outside' ? getTabRanges(contour.points, operation, tool) : [],
        fallbackToAlongPath: false,
        isPocketPath: false,
      }));
  }

  const filledGeometry = unionD(
    contours
      .map((contour) => orientClosedPath(contour.points, contour.isHole))
      .filter((path) => path.length >= 4)
      .map((path) => stripClosingPoint(path)),
    FillRule.NonZero
  );

  const offsetPaths = inflatePathsD(
    filledGeometry,
    cutSide === 'outside' ? toolRadius : -toolRadius,
    JoinType.Round,
    EndType.Polygon,
    2,
    3
  );

  if (offsetPaths.length === 0) {
    return contours
      .filter((contour) => contour.points.length >= 2)
      .map((contour) => ({
        operationId: operation.id,
        operationType: operation.type,
        cutSide,
        path: contour.points,
        tabRanges: cutSide === 'outside' ? getTabRanges(contour.points, operation, tool) : [],
        fallbackToAlongPath: true,
        isPocketPath: false,
      }));
  }

  return offsetPaths
    .map((path) => ensureClosedPath(path))
    .filter((path) => path.length >= 4)
    .map((path) => ({
      operationId: operation.id,
      operationType: operation.type,
      cutSide,
      path,
      tabRanges: cutSide === 'outside' ? getTabRanges(path, operation, tool) : [],
      fallbackToAlongPath: false,
      isPocketPath: false,
    }));
}

export function getOperationPlannedPaths(
  operation: PathOperation,
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

  if (operation.type === 'text') {
    return buildTextPaths(operation, settings, tool);
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

export function buildToolpathPreview({ operations, settings, tools, importedMeshes = [] }: BuildToolpathPreviewArgs): ToolpathPreview {
  const segments: ToolpathPreviewSegment[] = [];
  const markers: ToolpathPreviewMarker[] = [];
  const home = { x: 0, y: 0 };
  let previousEndPoint: Point | null = operations.length > 0 ? home : null;
  const importedMeshMap = new Map(importedMeshes.map((mesh) => [mesh.id, mesh]));

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

    if (operation.type === 'surface-rough') {
      const tool = getOperationTool(operation, tools);
      const mesh = importedMeshMap.get(operation.meshId);
      const plan = buildSurfaceRoughPlan(operation as SurfaceRoughOperation, mesh, settings, tool);

      plan.paths.forEach((path) => {
        const projectedPath = projectSurfacePath(path.points);
        if (projectedPath.length < 2) {
          return;
        }

        const startPoint = projectedPath[0];
        const endPoint = projectedPath[projectedPath.length - 1];
        if (previousEndPoint && !pointsEqual(previousEndPoint, startPoint)) {
          segments.push({
            kind: 'rapid',
            operationId: operation.id,
            operationType: operation.type,
            points: [previousEndPoint, startPoint],
          });
        }

        markers.push({
          kind: 'plunge',
          operationId: operation.id,
          operationType: operation.type,
          point: startPoint,
        });
        segments.push({
          kind: 'cut',
          operationId: operation.id,
          operationType: operation.type,
          points: projectedPath,
        });
        previousEndPoint = endPoint;
      });
      return;
    }

    if (operation.type === 'surface-finish') {
      const tool = getOperationTool(operation, tools);
      const mesh = importedMeshMap.get(operation.meshId);
      const plan = buildSurfaceFinishPlan(operation as SurfaceFinishOperation, mesh, settings, tool);

      plan.paths.forEach((path) => {
        const projectedPath = projectSurfacePath(path.points);
        if (projectedPath.length < 2) {
          return;
        }

        const startPoint = projectedPath[0];
        const endPoint = projectedPath[projectedPath.length - 1];
        if (previousEndPoint && !pointsEqual(previousEndPoint, startPoint)) {
          segments.push({
            kind: 'rapid',
            operationId: operation.id,
            operationType: operation.type,
            points: [previousEndPoint, startPoint],
          });
        }

        markers.push({
          kind: 'plunge',
          operationId: operation.id,
          operationType: operation.type,
          point: startPoint,
        });
        segments.push({
          kind: 'cut',
          operationId: operation.id,
          operationType: operation.type,
          points: projectedPath,
        });
        previousEndPoint = endPoint;
      });
      return;
    }

    if (!isPathOperation(operation)) {
      return;
    }

    const tool = getOperationTool(operation, tools);
    const laserOperation = tool?.isLaser
      ? ({
          ...operation,
          cutSide: 'along',
          pocketEnabled: false,
          tabsEnabled: false,
        } as PathOperation)
      : operation;
    const plannedPaths = getOperationPlannedPaths(laserOperation, settings, tool);

    const laserProcess =
      operation.laserProcess || (operation.type === 'text' ? 'etch' : 'cut');
    if (tool?.isLaser && laserProcess === 'etch') {
      const laserPreset = resolveLaserMaterialPreset(tool, operation.materialId);
      const fillSegments = buildLaserFillSegments(
        plannedPaths.map((plannedPath) => plannedPath.path),
        operation.laserLineInterval || laserPreset.kerfDiameter
      );
      const overscan = Math.max(0, Number(operation.laserOverscan) || 0);

      fillSegments.forEach((fillSegment) => {
        const direction = fillSegment.end.x >= fillSegment.start.x ? 1 : -1;
        const approach = {
          x: Math.min(
            settings.workWidth,
            Math.max(0, fillSegment.start.x - direction * overscan)
          ),
          y: fillSegment.start.y,
        };
        const exit = {
          x: Math.min(
            settings.workWidth,
            Math.max(0, fillSegment.end.x + direction * overscan)
          ),
          y: fillSegment.end.y,
        };

        const rapidStart = previousEndPoint || approach;
        if (!pointsEqual(rapidStart, fillSegment.start)) {
          segments.push({
            kind: 'rapid',
            operationId: operation.id,
            operationType: operation.type,
            points: [rapidStart, approach, fillSegment.start],
          });
        }
        segments.push({
          kind: 'cut',
          operationId: operation.id,
          operationType: operation.type,
          points: [fillSegment.start, fillSegment.end],
        });
        if (!pointsEqual(fillSegment.end, exit)) {
          segments.push({
            kind: 'rapid',
            operationId: operation.id,
            operationType: operation.type,
            points: [fillSegment.end, exit],
          });
        }
        previousEndPoint = exit;
      });
      return;
    }

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
