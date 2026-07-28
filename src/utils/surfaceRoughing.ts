import type {
  ImportedMesh,
  MachineSettings,
  MeshPoint3D,
  SurfaceFinishOperation,
  SurfaceRoughOperation,
  Tool,
} from '../types';
import { buildIncrementDepths, toNegativeDepth, toPositiveStep } from './gcode/depth';
import { getImportedMeshWorldBounds } from './importStl';
import { getMillingToolHeightAtRadius } from './millingToolGeometry';
import { resolveToolPreset } from './tooling';

export interface SurfacePoint3D {
  x: number;
  y: number;
  z: number;
}

export interface SurfaceRoughPath {
  passIndex: number;
  passDepth: number;
  rowIndex: number;
  points: SurfacePoint3D[];
}

export interface SurfaceRoughPlan {
  operationId: string;
  meshId: string;
  rowStep: number;
  sampleStep: number;
  scanAxis: 'x' | 'y';
  passDepths: number[];
  paths: SurfaceRoughPath[];
}

export interface SurfaceFinishPath {
  passIndex: number;
  passDepth: number;
  rowIndex: number;
  points: SurfacePoint3D[];
}

export interface SurfaceFinishPlan {
  operationId: string;
  meshId: string;
  rowStep: number;
  sampleStep: number;
  scanAxis: 'x' | 'y' | 'crosshatch';
  passDepths: number[];
  paths: SurfaceFinishPath[];
}

interface PreparedTriangle {
  a: MeshPoint3D;
  b: MeshPoint3D;
  c: MeshPoint3D;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  denominator: number;
}

function buildAxisSamples(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return [];
  }

  if (!Number.isFinite(step) || step <= 0 || Math.abs(max - min) <= 0.0001) {
    return [min, max].filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 0.0001);
  }

  const samples = [min];
  for (let value = min + step; value < max - step * 0.5; value += step) {
    samples.push(value);
  }
  if (samples.length === 0 || Math.abs(samples[samples.length - 1] - max) > 0.0001) {
    samples.push(max);
  }
  return samples;
}

function prepareTriangles(mesh: ImportedMesh): PreparedTriangle[] {
  return mesh.triangles.map((triangle) => {
    const a = {
      x: triangle.a.x + mesh.placement.x,
      y: triangle.a.y + mesh.placement.y,
      z: triangle.a.z,
    };
    const b = {
      x: triangle.b.x + mesh.placement.x,
      y: triangle.b.y + mesh.placement.y,
      z: triangle.b.z,
    };
    const c = {
      x: triangle.c.x + mesh.placement.x,
      y: triangle.c.y + mesh.placement.y,
      z: triangle.c.z,
    };
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    return {
      a,
      b,
      c,
      minX: Math.min(a.x, b.x, c.x),
      maxX: Math.max(a.x, b.x, c.x),
      minY: Math.min(a.y, b.y, c.y),
      maxY: Math.max(a.y, b.y, c.y),
      denominator,
    };
  });
}

function sampleTriangleTopZ(triangle: PreparedTriangle, x: number, y: number): number | null {
  if (
    x < triangle.minX - 0.0001 ||
    x > triangle.maxX + 0.0001 ||
    y < triangle.minY - 0.0001 ||
    y > triangle.maxY + 0.0001
  ) {
    return null;
  }

  if (Math.abs(triangle.denominator) <= 0.000001) {
    return null;
  }

  const alpha =
    ((triangle.b.y - triangle.c.y) * (x - triangle.c.x) +
      (triangle.c.x - triangle.b.x) * (y - triangle.c.y)) /
    triangle.denominator;
  const beta =
    ((triangle.c.y - triangle.a.y) * (x - triangle.c.x) +
      (triangle.a.x - triangle.c.x) * (y - triangle.c.y)) /
    triangle.denominator;
  const gamma = 1 - alpha - beta;

  if (alpha < -0.0001 || beta < -0.0001 || gamma < -0.0001) {
    return null;
  }

  return alpha * triangle.a.z + beta * triangle.b.z + gamma * triangle.c.z;
}

function sampleMeshTopZ(triangles: PreparedTriangle[], x: number, y: number): number | null {
  let topZ: number | null = null;

  triangles.forEach((triangle) => {
    const z = sampleTriangleTopZ(triangle, x, y);
    if (z === null) {
      return;
    }
    if (topZ === null || z > topZ) {
      topZ = z;
    }
  });

  return topZ;
}

function sampleFinishToolTipZ(
  triangles: PreparedTriangle[],
  x: number,
  y: number,
  tool: Tool | null,
  sampleStep: number
): number | null {
  const centerTop = sampleMeshTopZ(triangles, x, y);
  if (
    centerTop === null ||
    !tool ||
    tool.isLaser ||
    tool.millingGeometry.type !== 'ball-nose'
  ) {
    return centerTop;
  }

  const radius = Math.max(0, Number(tool.diameter) || 0) / 2;
  if (radius <= 0.0001) {
    return centerTop;
  }

  const contactStep = Math.max(
    0.1,
    Math.min(sampleStep, radius / 4)
  );
  let toolTipZ = centerTop;

  for (let offsetX = -radius; offsetX <= radius + 0.0001; offsetX += contactStep) {
    for (let offsetY = -radius; offsetY <= radius + 0.0001; offsetY += contactStep) {
      const radialDistance = Math.hypot(offsetX, offsetY);
      if (radialDistance > radius + 0.0001) {
        continue;
      }

      const sampledTop = sampleMeshTopZ(triangles, x + offsetX, y + offsetY);
      if (sampledTop === null) {
        continue;
      }

      toolTipZ = Math.max(
        toolTipZ,
        sampledTop - getMillingToolHeightAtRadius(tool, radialDistance)
      );
    }
  }

  return toolTipZ;
}

function getRasterSetup(
  mesh: ImportedMesh,
  stepOver: number,
  tool: Tool | null,
  preferredAxis?: 'x' | 'y'
): {
  bounds: ReturnType<typeof getImportedMeshWorldBounds>;
  triangles: PreparedTriangle[];
  scanAxis: 'x' | 'y';
  rowValues: number[];
  sampleValues: number[];
  sampleStep: number;
} {
  const toolDiameter = Math.max(0, Number(tool?.diameter) || 0);
  const sampleStep = Math.max(
    0.25,
    Math.min(stepOver / 2, toolDiameter > 0 ? toolDiameter / 2 : stepOver / 2)
  );
  const expansion = Math.max(stepOver, toolDiameter / 2, sampleStep);
  const bounds = getImportedMeshWorldBounds(mesh);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scanAxis = preferredAxis || (width >= height ? 'x' : 'y');

  return {
    bounds,
    triangles: prepareTriangles(mesh),
    scanAxis,
    rowValues: buildAxisSamples(
      (scanAxis === 'x' ? bounds.minY : bounds.minX) - expansion,
      (scanAxis === 'x' ? bounds.maxY : bounds.maxX) + expansion,
      stepOver
    ),
    sampleValues: buildAxisSamples(
      (scanAxis === 'x' ? bounds.minX : bounds.minY) - expansion,
      (scanAxis === 'x' ? bounds.maxX : bounds.maxY) + expansion,
      sampleStep
    ),
    sampleStep,
  };
}

function collapseRasterPath(points: SurfacePoint3D[]): SurfacePoint3D[] {
  if (points.length < 3) {
    return points;
  }

  const collapsed: SurfacePoint3D[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = collapsed[collapsed.length - 1];
    const current = points[index];
    const next = points[index + 1];

    const sameY = Math.abs(previous.y - current.y) <= 0.0001 && Math.abs(current.y - next.y) <= 0.0001;
    const sameX = Math.abs(previous.x - current.x) <= 0.0001 && Math.abs(current.x - next.x) <= 0.0001;
    const sameZ = Math.abs(previous.z - current.z) <= 0.0001 && Math.abs(current.z - next.z) <= 0.0001;

    if ((sameY || sameX) && sameZ) {
      continue;
    }

    collapsed.push(current);
  }

  collapsed.push(points[points.length - 1]);
  return collapsed;
}

function buildRowPaths(
  triangles: PreparedTriangle[],
  operation: SurfaceRoughOperation,
  rowCoordinate: number,
  passDepth: number,
  rowIndex: number,
  sampleValues: number[],
  scanAxis: 'x' | 'y',
  reverse: boolean
): SurfaceRoughPath[] {
  const spans: SurfacePoint3D[][] = [];
  let currentSpan: SurfacePoint3D[] = [];

  sampleValues.forEach((sampleValue) => {
    const x = scanAxis === 'x' ? sampleValue : rowCoordinate;
    const y = scanAxis === 'x' ? rowCoordinate : sampleValue;
    const sampledTop = sampleMeshTopZ(triangles, x, y);
    const desiredZ =
      sampledTop === null
        ? Math.min(0, Number(operation.depth) || 0)
        : Math.max(
            Math.min(0, Number(operation.depth) || 0),
            Math.min(0, sampledTop + Math.max(0, Number(operation.stockToLeave) || 0))
          );
    const cutZ = Math.max(passDepth, desiredZ);

    if (cutZ >= -0.0001) {
      if (currentSpan.length >= 2) {
        spans.push(collapseRasterPath(currentSpan));
      }
      currentSpan = [];
      return;
    }

    currentSpan.push({ x, y, z: cutZ });
  });

  if (currentSpan.length >= 2) {
    spans.push(collapseRasterPath(currentSpan));
  }

  const orderedSpans = reverse ? [...spans].reverse() : spans;
  return orderedSpans.map((span) => ({
    passIndex: 0,
    passDepth,
    rowIndex,
    points: reverse ? [...span].reverse() : span,
  }));
}

export function buildSurfaceRoughPlan(
  operation: SurfaceRoughOperation,
  mesh: ImportedMesh | null | undefined,
  settings: MachineSettings,
  tool: Tool | null
): SurfaceRoughPlan {
  const stepOver = Math.max(0.1, Number(operation.stepOver) || 0.1);
  const fallbackSampleStep = Math.max(
    0.25,
    Math.min(stepOver / 2, Math.max(0, Number(tool?.diameter) || 0) > 0 ? Math.max(0, Number(tool?.diameter) || 0) / 2 : stepOver / 2)
  );

  if (!mesh) {
    return {
      operationId: operation.id,
      meshId: operation.meshId,
      rowStep: stepOver,
      sampleStep: fallbackSampleStep,
      scanAxis: 'x',
      passDepths: [],
      paths: [],
    };
  }

  const rasterSetup = getRasterSetup(mesh, stepOver, tool);
  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const fallbackDepth = Math.min(0, mesh.localBounds.minZ);
  const finalDepth = toNegativeDepth(operation.depth, fallbackDepth);
  const passStep = toPositiveStep(preset.cutDepthPerPass, Math.abs(finalDepth));
  const passDepths = buildIncrementDepths(finalDepth, passStep);
  const paths: SurfaceRoughPath[] = [];

  passDepths.forEach((passDepth, passIndex) => {
    rasterSetup.rowValues.forEach((rowCoordinate, rowIndex) => {
      const reverse = rowIndex % 2 === 1;
      const rowPaths = buildRowPaths(
        rasterSetup.triangles,
        operation,
        rowCoordinate,
        passDepth,
        rowIndex,
        rasterSetup.sampleValues,
        rasterSetup.scanAxis,
        reverse
      ).map((path) => ({
        ...path,
        passIndex,
      }));
      paths.push(...rowPaths);
    });
  });

  return {
    operationId: operation.id,
    meshId: operation.meshId,
    rowStep: stepOver,
    sampleStep: rasterSetup.sampleStep,
    scanAxis: rasterSetup.scanAxis,
    passDepths,
    paths,
  };
}

function buildFinishRowPaths(
  triangles: PreparedTriangle[],
  operation: SurfaceFinishOperation,
  tool: Tool | null,
  rowCoordinate: number,
  passDepth: number,
  rowIndex: number,
  sampleValues: number[],
  sampleStep: number,
  scanAxis: 'x' | 'y',
  reverse: boolean
): SurfaceFinishPath[] {
  const spans: SurfacePoint3D[][] = [];
  let currentSpan: SurfacePoint3D[] = [];

  sampleValues.forEach((sampleValue) => {
    const x = scanAxis === 'x' ? sampleValue : rowCoordinate;
    const y = scanAxis === 'x' ? rowCoordinate : sampleValue;
    const sampledTop = sampleFinishToolTipZ(
      triangles,
      x,
      y,
      tool,
      sampleStep
    );

    if (sampledTop === null) {
      if (currentSpan.length >= 2) {
        spans.push(collapseRasterPath(currentSpan));
      }
      currentSpan = [];
      return;
    }

    const desiredZ = Math.max(Math.min(0, Number(operation.depth) || 0), sampledTop);
    const cutZ = Math.max(passDepth, desiredZ);
    currentSpan.push({ x, y, z: cutZ });
  });

  if (currentSpan.length >= 2) {
    spans.push(collapseRasterPath(currentSpan));
  }

  const orderedSpans = reverse ? [...spans].reverse() : spans;
  return orderedSpans.map((span) => ({
    passIndex: 0,
    passDepth,
    rowIndex,
    points: reverse ? [...span].reverse() : span,
  }));
}

export function buildSurfaceFinishPlan(
  operation: SurfaceFinishOperation,
  mesh: ImportedMesh | null | undefined,
  settings: MachineSettings,
  tool: Tool | null
): SurfaceFinishPlan {
  const stepOver = Math.max(0.1, Number(operation.stepOver) || 0.1);
  const fallbackSampleStep = Math.max(
    0.25,
    Math.min(stepOver / 2, Math.max(0, Number(tool?.diameter) || 0) > 0 ? Math.max(0, Number(tool?.diameter) || 0) / 2 : stepOver / 2)
  );

  if (!mesh) {
    return {
      operationId: operation.id,
      meshId: operation.meshId,
      rowStep: stepOver,
      sampleStep: fallbackSampleStep,
      scanAxis: operation.pattern,
      passDepths: [],
      paths: [],
    };
  }

  const preferredAxes =
    operation.pattern === 'crosshatch' ? (['x', 'y'] as const) : ([operation.pattern] as const);
  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const fallbackDepth = Math.min(0, mesh.localBounds.minZ);
  const finalDepth = toNegativeDepth(operation.depth, fallbackDepth);
  const passStep = toPositiveStep(preset.cutDepthPerPass, Math.abs(finalDepth));
  const passDepths = buildIncrementDepths(finalDepth, passStep);
  const paths: SurfaceFinishPath[] = [];

  passDepths.forEach((passDepth, passIndex) => {
    preferredAxes.forEach((axis, axisIndex) => {
      const rasterSetup = getRasterSetup(mesh, stepOver, tool, axis);
      rasterSetup.rowValues.forEach((rowCoordinate, rowIndex) => {
        const combinedRowIndex = axisIndex * rasterSetup.rowValues.length + rowIndex;
        const reverse = combinedRowIndex % 2 === 1;
        const rowPaths = buildFinishRowPaths(
          rasterSetup.triangles,
          operation,
          tool,
          rowCoordinate,
          passDepth,
          combinedRowIndex,
          rasterSetup.sampleValues,
          rasterSetup.sampleStep,
          rasterSetup.scanAxis,
          reverse
        ).map((path) => ({
          ...path,
          passIndex,
        }));
        paths.push(...rowPaths);
      });
    });
  });

  const sampleStep = Math.max(
    ...preferredAxes.map((axis) => getRasterSetup(mesh, stepOver, tool, axis).sampleStep)
  );

  return {
    operationId: operation.id,
    meshId: operation.meshId,
    rowStep: stepOver,
    sampleStep,
    scanAxis: operation.pattern,
    passDepths,
    paths,
  };
}
