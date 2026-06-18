import type { ImportedMesh } from '../../types';
import { getImportedMeshWorldBounds } from '../../utils/importStl';
import type { Point3D, ToolpathPreview3D } from '../../utils/toolpathPreview3d';
import type { AxisGizmo, ProjectedPoint, ProjectedTool, ProjectedTriangle } from './types';

export type ProjectedSegment = ToolpathPreview3D['segments'][number] & {
  projected: ProjectedPoint[];
  averageDepth: number;
};

export type ProjectedMarker = ToolpathPreview3D['markers'][number] & {
  projected: ProjectedPoint;
};

export interface ProjectedScene {
  segments: ProjectedSegment[];
  markers: ProjectedMarker[];
  bounds: ProjectedPoint[][];
  meshes: ProjectedTriangle[];
  gizmo: AxisGizmo[];
  tool: ProjectedTool | null;
}

interface ProjectSceneOptions {
  preview: ToolpathPreview3D;
  importedMeshes: ImportedMesh[];
  center: Point3D;
  yaw: number;
  pitch: number;
  zoom: number;
  fitRadius: number;
  viewWidth: number;
  viewHeight: number;
  padding: number;
  gizmoOffset: number;
  toolConeHeight: number;
  toolConeRadius: number;
  playbackPoint: { kind: 'rapid' | 'plunge' | 'cut'; point: Point3D } | null;
  sceneBounds: ToolpathPreview3D['bounds'];
}

export function rotatePoint(point: Point3D, center: Point3D, yaw: number, pitch: number): Point3D {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;

  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const yawX = dx * cosYaw - dy * sinYaw;
  const yawY = dx * sinYaw + dy * cosYaw;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const pitchY = yawY * cosPitch - dz * sinPitch;
  const pitchZ = yawY * sinPitch + dz * cosPitch;

  return {
    x: yawX,
    y: pitchY,
    z: pitchZ,
  };
}

function buildBoundsBox(bounds: ToolpathPreview3D['bounds']): Point3D[][] {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const p000 = { x: minX, y: minY, z: minZ };
  const p100 = { x: maxX, y: minY, z: minZ };
  const p110 = { x: maxX, y: maxY, z: minZ };
  const p010 = { x: minX, y: maxY, z: minZ };
  const p001 = { x: minX, y: minY, z: maxZ };
  const p101 = { x: maxX, y: minY, z: maxZ };
  const p111 = { x: maxX, y: maxY, z: maxZ };
  const p011 = { x: minX, y: maxY, z: maxZ };

  return [
    [p000, p100],
    [p100, p110],
    [p110, p010],
    [p010, p000],
    [p001, p101],
    [p101, p111],
    [p111, p011],
    [p011, p001],
    [p000, p001],
    [p100, p101],
    [p110, p111],
    [p010, p011],
  ];
}

export function buildSceneBounds(
  preview: ToolpathPreview3D,
  importedMeshes: ImportedMesh[]
): ToolpathPreview3D['bounds'] {
  return importedMeshes.reduce(
    (bounds, mesh) => {
      const meshBounds = getImportedMeshWorldBounds(mesh);
      return {
        minX: Math.min(bounds.minX, meshBounds.minX),
        maxX: Math.max(bounds.maxX, meshBounds.maxX),
        minY: Math.min(bounds.minY, meshBounds.minY),
        maxY: Math.max(bounds.maxY, meshBounds.maxY),
        minZ: Math.min(bounds.minZ, meshBounds.minZ),
        maxZ: Math.max(bounds.maxZ, meshBounds.maxZ),
      };
    },
    { ...preview.bounds }
  );
}

export function projectScene({
  preview,
  importedMeshes,
  center,
  yaw,
  pitch,
  zoom,
  fitRadius,
  viewWidth,
  viewHeight,
  padding,
  gizmoOffset,
  toolConeHeight,
  toolConeRadius,
  playbackPoint,
  sceneBounds,
}: ProjectSceneOptions): ProjectedScene {
  const rawSegments = preview.segments.map((segment) => ({
    ...segment,
    projected: segment.points.map((point) => rotatePoint(point, center, yaw, pitch)),
  }));
  const rawMarkers = preview.markers.map((marker) => ({
    ...marker,
    projected: rotatePoint(marker.point, center, yaw, pitch),
  }));
  const rawBounds = buildBoundsBox(sceneBounds).map((edge) =>
    edge.map((point) => rotatePoint(point, center, yaw, pitch))
  );

  const baseScale = (Math.min(viewWidth - padding * 2, viewHeight - padding * 2) / (fitRadius * 2)) * zoom;

  function toScreen(point: Point3D): ProjectedPoint {
    return {
      x: point.x * baseScale + viewWidth / 2,
      y: viewHeight / 2 - point.y * baseScale,
      depth: point.z,
    };
  }

  const gizmoLength = Math.max(18, fitRadius * 0.2);
  const gizmoCenter = {
    x: gizmoOffset,
    y: viewHeight - gizmoOffset,
  };
  const axisVectors = [
    {
      id: 'x' as const,
      label: 'X',
      color: '#f87171',
      start: { x: gizmoCenter.x, y: gizmoCenter.y, depth: 0 },
      end: (() => {
        const rotated = rotatePoint(
          { x: center.x + gizmoLength, y: center.y, z: center.z },
          center,
          yaw,
          pitch
        );
        return {
          x: gizmoCenter.x + rotated.x * 0.9,
          y: gizmoCenter.y - rotated.y * 0.9,
          depth: rotated.z,
        };
      })(),
    },
    {
      id: 'y' as const,
      label: 'Y',
      color: '#4ade80',
      start: { x: gizmoCenter.x, y: gizmoCenter.y, depth: 0 },
      end: (() => {
        const rotated = rotatePoint(
          { x: center.x, y: center.y + gizmoLength, z: center.z },
          center,
          yaw,
          pitch
        );
        return {
          x: gizmoCenter.x + rotated.x * 0.9,
          y: gizmoCenter.y - rotated.y * 0.9,
          depth: rotated.z,
        };
      })(),
    },
    {
      id: 'z' as const,
      label: 'Z',
      color: '#60a5fa',
      start: { x: gizmoCenter.x, y: gizmoCenter.y, depth: 0 },
      end: (() => {
        const rotated = rotatePoint(
          { x: center.x, y: center.y, z: center.z + gizmoLength },
          center,
          yaw,
          pitch
        );
        return {
          x: gizmoCenter.x + rotated.x * 0.9,
          y: gizmoCenter.y - rotated.y * 0.9,
          depth: rotated.z,
        };
      })(),
    },
  ] satisfies AxisGizmo[];
  axisVectors.sort((left, right) => left.end.depth - right.end.depth);

  const meshes: ProjectedTriangle[] = importedMeshes
    .flatMap((mesh) =>
      mesh.triangles.map((triangle) => {
        const rotated = [
          rotatePoint(
            { x: triangle.a.x + mesh.placement.x, y: triangle.a.y + mesh.placement.y, z: triangle.a.z },
            center,
            yaw,
            pitch
          ),
          rotatePoint(
            { x: triangle.b.x + mesh.placement.x, y: triangle.b.y + mesh.placement.y, z: triangle.b.z },
            center,
            yaw,
            pitch
          ),
          rotatePoint(
            { x: triangle.c.x + mesh.placement.x, y: triangle.c.y + mesh.placement.y, z: triangle.c.z },
            center,
            yaw,
            pitch
          ),
        ];
        return {
          points: [toScreen(rotated[0]), toScreen(rotated[1]), toScreen(rotated[2])] as [
            ProjectedPoint,
            ProjectedPoint,
            ProjectedPoint,
          ],
          averageDepth: (rotated[0].z + rotated[1].z + rotated[2].z) / 3,
        };
      })
    )
    .sort((left, right) => left.averageDepth - right.averageDepth);

  const tool = playbackPoint
    ? (() => {
        const tip = toScreen(rotatePoint(playbackPoint.point, center, yaw, pitch));
        const baseCenter = toScreen(
          rotatePoint(
            {
              x: playbackPoint.point.x,
              y: playbackPoint.point.y,
              z: playbackPoint.point.z + toolConeHeight,
            },
            center,
            yaw,
            pitch
          )
        );
        const dx = tip.x - baseCenter.x;
        const dy = tip.y - baseCenter.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const perpendicularX = (-dy / length) * toolConeRadius;
        const perpendicularY = (dx / length) * toolConeRadius;
        return {
          kind: playbackPoint.kind,
          tip,
          baseLeft: {
            x: baseCenter.x + perpendicularX,
            y: baseCenter.y + perpendicularY,
            depth: baseCenter.depth,
          },
          baseRight: {
            x: baseCenter.x - perpendicularX,
            y: baseCenter.y - perpendicularY,
            depth: baseCenter.depth,
          },
          baseCenter,
        };
      })()
    : null;

  return {
    segments: rawSegments
      .map((segment) => ({
        ...segment,
        projected: segment.projected.map(toScreen),
        averageDepth: segment.projected.reduce((sum, point) => sum + point.z, 0) / segment.projected.length,
      }))
      .sort((left, right) => left.averageDepth - right.averageDepth),
    markers: rawMarkers.map((marker) => ({
      ...marker,
      projected: toScreen(marker.projected),
    })),
    bounds: rawBounds.map((edge) => edge.map(toScreen)),
    meshes,
    gizmo: axisVectors,
    tool,
  };
}
