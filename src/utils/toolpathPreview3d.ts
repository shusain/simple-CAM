import type { MachineSettings, Operation, Point, Tool } from '../types';
import { buildIncrementDepths, getStartEndZ, toNegativeDepth, toPositiveStep } from './gcode/depth';
import { getOperationPlannedPaths } from './toolpathPreview';
import { resolveToolPreset } from './tooling';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export type ToolpathPreview3DSegmentKind = 'rapid' | 'plunge' | 'cut';
export type ToolpathPreview3DMarkerKind = 'start' | 'end';

export interface ToolpathPreview3DSegment {
  kind: ToolpathPreview3DSegmentKind;
  operationId: string | null;
  operationType: Operation['type'] | 'job';
  points: Point3D[];
}

export interface ToolpathPreview3DMarker {
  kind: ToolpathPreview3DMarkerKind;
  point: Point3D;
}

export interface ToolpathPreview3D {
  segments: ToolpathPreview3DSegment[];
  markers: ToolpathPreview3DMarker[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

interface BuildToolpathPreview3DArgs {
  operations: Operation[];
  settings: MachineSettings;
  tools: Tool[];
}

function getOperationTool(operation: Operation, tools: Tool[]): Tool | null {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null;
  }

  return tools.find((tool) => tool.id === operation.toolId) || null;
}

function getOperationTravelZ(settings: MachineSettings): number {
  const safeZ = Number(settings.safeZ);
  if (!Number.isFinite(safeZ) || safeZ <= 0) {
    return 1;
  }

  return Math.min(safeZ, 1);
}

function pointsEqual3d(a: Point3D, b: Point3D, tolerance = 0.0001): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.z - b.z) <= tolerance
  );
}

function point2dTo3d(point: Point, z: number): Point3D {
  return { x: point.x, y: point.y, z };
}

function appendSegment(
  target: ToolpathPreview3DSegment[],
  kind: ToolpathPreview3DSegmentKind,
  operation: Operation | null,
  operationType: Operation['type'] | 'job',
  points: Point3D[]
): void {
  if (points.length < 2) {
    return;
  }

  const deduped = points.filter((point, index) => index === 0 || !pointsEqual3d(point, points[index - 1]));
  if (deduped.length < 2) {
    return;
  }

  target.push({
    kind,
    operationId: operation?.id || null,
    operationType,
    points: deduped,
  });
}

function appendPathAtDepth(
  target: ToolpathPreview3DSegment[],
  operation: Exclude<Operation, Extract<Operation, { type: 'drill' }>>,
  path: Point[],
  depth: number
): void {
  const points = path.map((point) => point2dTo3d(point, depth));
  appendSegment(target, 'cut', operation, operation.type, points);
}

function computeBounds(
  segments: ToolpathPreview3DSegment[],
  settings: MachineSettings
): ToolpathPreview3D['bounds'] {
  const allPoints = segments.flatMap((segment) => segment.points);
  if (allPoints.length === 0) {
    return {
      minX: 0,
      maxX: settings.workWidth,
      minY: 0,
      maxY: settings.workHeight,
      minZ: Math.min(0, -1),
      maxZ: Math.max(getStartEndZ(settings), settings.safeZ, 1),
    };
  }

  return {
    minX: Math.min(0, ...allPoints.map((point) => point.x)),
    maxX: Math.max(settings.workWidth, ...allPoints.map((point) => point.x)),
    minY: Math.min(0, ...allPoints.map((point) => point.y)),
    maxY: Math.max(settings.workHeight, ...allPoints.map((point) => point.y)),
    minZ: Math.min(...allPoints.map((point) => point.z), 0),
    maxZ: Math.max(...allPoints.map((point) => point.z), getStartEndZ(settings), settings.safeZ, 1),
  };
}

export function buildToolpathPreview3D({
  operations,
  settings,
  tools,
}: BuildToolpathPreview3DArgs): ToolpathPreview3D {
  const segments: ToolpathPreview3DSegment[] = [];
  const markers: ToolpathPreview3DMarker[] = [];
  const startEndZ = getStartEndZ(settings);
  const safeZ = Number(settings.safeZ) || 5;
  const betweenPassClearanceZ = getOperationTravelZ(settings);
  let current = { x: 0, y: 0, z: startEndZ };

  markers.push({ kind: 'start', point: current });

  operations.forEach((operation) => {
    if (operation.type === 'drill') {
      const tool = getOperationTool(operation, tools);
      const preset = resolveToolPreset(tool, operation.materialId, settings);
      const finalDepth = toNegativeDepth(operation.depth, settings.drillDepth);
      const peckDepth = toPositiveStep(preset.drillDepthPerPass, Math.abs(finalDepth));
      const pecks = buildIncrementDepths(finalDepth, peckDepth);
      const point = { x: operation.x, y: operation.y };

      if (current.z !== safeZ) {
        appendSegment(segments, 'rapid', operation, operation.type, [current, { ...current, z: safeZ }]);
        current = { ...current, z: safeZ };
      }
      if (current.x !== point.x || current.y !== point.y) {
        appendSegment(segments, 'rapid', operation, operation.type, [current, { ...point, z: current.z }]);
        current = { ...point, z: current.z };
      }

      pecks.forEach((depth, index) => {
        appendSegment(segments, 'plunge', operation, operation.type, [current, { ...point, z: depth }]);
        current = { ...point, z: depth };

        if (index < pecks.length - 1) {
          appendSegment(segments, 'rapid', operation, operation.type, [current, { ...point, z: 1 }]);
          current = { ...point, z: 1 };
        }
      });

      appendSegment(segments, 'rapid', operation, operation.type, [current, { ...point, z: safeZ }]);
      current = { ...point, z: safeZ };
      return;
    }

    const tool = getOperationTool(operation, tools);
    const preset = resolveToolPreset(tool, operation.materialId, settings);
    const finalDepth = toNegativeDepth(operation.depth, settings.cutDepth);
    const passStep = toPositiveStep(preset.cutDepthPerPass, Math.abs(finalDepth));
    const passes = buildIncrementDepths(finalDepth, passStep);
    const plannedPaths = getOperationPlannedPaths(operation, settings, tool);

    plannedPaths.forEach((plannedPath, pathIndex) => {
      if (plannedPath.path.length < 2) {
        return;
      }

      const startPoint = plannedPath.path[0];
      const operationStartClearance = pathIndex === 0 ? safeZ : betweenPassClearanceZ;

      if (current.z !== operationStartClearance) {
        appendSegment(segments, 'rapid', operation, operation.type, [current, { ...current, z: operationStartClearance }]);
        current = { ...current, z: operationStartClearance };
      }
      if (current.x !== startPoint.x || current.y !== startPoint.y) {
        appendSegment(segments, 'rapid', operation, operation.type, [current, { ...startPoint, z: current.z }]);
        current = { ...startPoint, z: current.z };
      }

      passes.forEach((depth, depthIndex) => {
        appendSegment(segments, 'plunge', operation, operation.type, [current, { ...startPoint, z: depth }]);
        current = { ...startPoint, z: depth };

        appendPathAtDepth(segments, operation, plannedPath.path, depth);
        const endPoint = plannedPath.path[plannedPath.path.length - 1];
        current = { ...endPoint, z: depth };

        const isLastPass = depthIndex === passes.length - 1;
        const isLastPath = pathIndex === plannedPaths.length - 1;
        const retractZ = isLastPass && isLastPath ? safeZ : betweenPassClearanceZ;
        appendSegment(segments, 'rapid', operation, operation.type, [current, { ...endPoint, z: retractZ }]);
        current = { ...endPoint, z: retractZ };
      });
    });
  });

  const home = { x: 0, y: 0, z: startEndZ };
  if (!pointsEqual3d(current, home)) {
    if (current.z !== startEndZ) {
      appendSegment(segments, 'rapid', null, 'job', [current, { ...current, z: startEndZ }]);
      current = { ...current, z: startEndZ };
    }
    appendSegment(segments, 'rapid', null, 'job', [current, home]);
    current = home;
  }

  markers.push({ kind: 'end', point: current });

  return {
    segments,
    markers,
    bounds: computeBounds(segments, settings),
  };
}
