import type { MaterialRemovalMesh } from '../../utils/materialRemovalMesh';

export interface ThreeResultGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  triangleCount: number;
}

const SURFACE_COLORS = {
  top: [0.82, 0.62, 0.37],
  side: [0.57, 0.37, 0.2],
  bottom: [0.3, 0.19, 0.11],
} as const;

/**
 * Expands the material-removal mesh into non-indexed triangles. Keeping each
 * face's vertices separate preserves hard cutter walls while allowing WebGL's
 * depth buffer to resolve overlap without SVG painter sorting.
 */
export function buildThreeResultGeometryData(
  mesh: MaterialRemovalMesh
): ThreeResultGeometryData {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  let triangleCount = 0;

  mesh.faces.forEach((face) => {
    const color = SURFACE_COLORS[face.surface];
    for (let index = 1; index < face.points.length - 1; index += 1) {
      const triangle = [
        face.points[0],
        face.points[index],
        face.points[index + 1],
      ];
      triangle.forEach((point) => {
        positions.push(point.x, point.y, point.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        colors.push(color[0], color[1], color[2]);
      });
      triangleCount += 1;
    }
  });

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    triangleCount,
  };
}
