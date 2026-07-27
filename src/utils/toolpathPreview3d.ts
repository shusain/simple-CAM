import type {
  ImportedMesh,
  MachineSettings,
  Operation,
  PathOperation,
  Point,
  SurfaceFinishOperation,
  SurfaceRoughOperation,
  Tool,
} from '../types';
import { isPathOperation } from '../types';
import { buildIncrementDepths, getStartEndZ, toNegativeDepth, toPositiveStep } from './gcode/depth';
import { buildSurfaceFinishPlan, buildSurfaceRoughPlan } from './surfaceRoughing';
import { getOperationPlannedPaths } from './toolpathPreview';
import { resolveLaserMaterialPreset, resolveToolPreset } from './tooling';
import { buildLaserFillSegments } from './laserFill';

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
  importedMeshes?: ImportedMesh[];
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
  operation: PathOperation,
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

  let minX = 0;
  let maxX = settings.workWidth;
  let minY = 0;
  let maxY = settings.workHeight;
  let minZ = 0;
  let maxZ = Math.max(getStartEndZ(settings), settings.safeZ, 1);

  for (const point of allPoints) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
  };
}

export function buildToolpathPreview3D({
  operations,
  settings,
  tools,
  importedMeshes = [],
}: BuildToolpathPreview3DArgs): ToolpathPreview3D {
  const segments: ToolpathPreview3DSegment[] = [];
  const markers: ToolpathPreview3DMarker[] = [];
  const startEndZ = getStartEndZ(settings);
  const safeZ = Number(settings.safeZ) || 5;
  const betweenPassClearanceZ = getOperationTravelZ(settings);
  let current = { x: 0, y: 0, z: startEndZ };
  const importedMeshMap = new Map(importedMeshes.map((mesh) => [mesh.id, mesh]));

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

    if (operation.type === 'surface-rough') {
      const tool = getOperationTool(operation, tools);
      const mesh = importedMeshMap.get(operation.meshId);
      const plan = buildSurfaceRoughPlan(operation as SurfaceRoughOperation, mesh, settings, tool);

      plan.paths.forEach((path, pathIndex) => {
        if (path.points.length < 2) {
          return;
        }

        const startPoint = path.points[0];
        const endPoint = path.points[path.points.length - 1];
        const operationStartClearance = pathIndex === 0 ? safeZ : betweenPassClearanceZ;

        if (current.z !== operationStartClearance) {
          appendSegment(segments, 'rapid', operation, operation.type, [current, { ...current, z: operationStartClearance }]);
          current = { ...current, z: operationStartClearance };
        }
        if (current.x !== startPoint.x || current.y !== startPoint.y) {
          appendSegment(segments, 'rapid', operation, operation.type, [current, { x: startPoint.x, y: startPoint.y, z: current.z }]);
          current = { x: startPoint.x, y: startPoint.y, z: current.z };
        }

        appendSegment(segments, 'plunge', operation, operation.type, [current, startPoint]);
        current = startPoint;
        appendSegment(segments, 'cut', operation, operation.type, path.points);
        current = endPoint;

        const retractZ = pathIndex === plan.paths.length - 1 ? safeZ : betweenPassClearanceZ;
        appendSegment(segments, 'rapid', operation, operation.type, [current, { x: endPoint.x, y: endPoint.y, z: retractZ }]);
        current = { x: endPoint.x, y: endPoint.y, z: retractZ };
      });
      return;
    }

    if (operation.type === 'surface-finish') {
      const tool = getOperationTool(operation, tools);
      const mesh = importedMeshMap.get(operation.meshId);
      const plan = buildSurfaceFinishPlan(operation as SurfaceFinishOperation, mesh, settings, tool);

      plan.paths.forEach((path, pathIndex) => {
        if (path.points.length < 2) {
          return;
        }

        const startPoint = path.points[0];
        const endPoint = path.points[path.points.length - 1];
        const operationStartClearance = pathIndex === 0 ? safeZ : betweenPassClearanceZ;

        if (current.z !== operationStartClearance) {
          appendSegment(segments, 'rapid', operation, operation.type, [current, { ...current, z: operationStartClearance }]);
          current = { ...current, z: operationStartClearance };
        }
        if (current.x !== startPoint.x || current.y !== startPoint.y) {
          appendSegment(segments, 'rapid', operation, operation.type, [current, { x: startPoint.x, y: startPoint.y, z: current.z }]);
          current = { x: startPoint.x, y: startPoint.y, z: current.z };
        }

        appendSegment(segments, 'plunge', operation, operation.type, [current, startPoint]);
        current = startPoint;
        appendSegment(segments, 'cut', operation, operation.type, path.points);
        current = endPoint;

        const retractZ = pathIndex === plan.paths.length - 1 ? safeZ : betweenPassClearanceZ;
        appendSegment(segments, 'rapid', operation, operation.type, [current, { x: endPoint.x, y: endPoint.y, z: retractZ }]);
        current = { x: endPoint.x, y: endPoint.y, z: retractZ };
      });
      return;
    }

    if (!isPathOperation(operation)) {
      return;
    }

    const tool = getOperationTool(operation, tools);
    if (tool?.isLaser) {
      const laserOperation = {
        ...operation,
        cutSide: 'along',
        pocketEnabled: false,
        tabsEnabled: false,
      } as PathOperation;
      const plannedPaths = getOperationPlannedPaths(laserOperation, settings, tool);
      const laserProcess =
        operation.laserProcess || (operation.type === 'text' ? 'etch' : 'cut');
      const laserPreset = resolveLaserMaterialPreset(tool, operation.materialId);
      const laserPaths: Point[][] =
        laserProcess === 'etch'
          ? buildLaserFillSegments(
              plannedPaths.map((plannedPath) => plannedPath.path),
              operation.laserLineInterval || laserPreset.kerfDiameter
            ).map((segment) => [segment.start, segment.end])
          : plannedPaths.map((plannedPath) => plannedPath.path);
      const passes = Math.max(1, Math.round(Number(operation.laserPasses) || 1));
      const overscan =
        laserProcess === 'etch'
          ? Math.max(0, Number(operation.laserOverscan) || 0)
          : 0;

      for (let passIndex = 0; passIndex < passes; passIndex += 1) {
        laserPaths.forEach((path) => {
          if (path.length < 2) {
            return;
          }

          const start = path[0];
          const end = path[path.length - 1];
          const direction = end.x >= start.x ? 1 : -1;
          const approach = {
            x: Math.min(settings.workWidth, Math.max(0, start.x - direction * overscan)),
            y: start.y,
            z: current.z,
          };
          const start3d = { ...start, z: current.z };
          const end3d = { ...end, z: current.z };
          const exit = {
            x: Math.min(settings.workWidth, Math.max(0, end.x + direction * overscan)),
            y: end.y,
            z: current.z,
          };

          appendSegment(segments, 'rapid', operation, operation.type, [current, approach, start3d]);
          appendSegment(
            segments,
            'cut',
            operation,
            operation.type,
            path.map((point) => ({ ...point, z: current.z }))
          );
          appendSegment(segments, 'rapid', operation, operation.type, [end3d, exit]);
          current = exit;
        });
      }
      return;
    }

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
