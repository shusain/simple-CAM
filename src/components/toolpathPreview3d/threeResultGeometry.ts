import type { MaterialRemovalMesh } from '../../utils/materialRemovalMesh';

export interface ThreeResultGeometryData {
  positions: Float32Array;
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
 * face's vertices separate lets the renderer calculate crease-aware normals
 * while allowing WebGL's depth buffer to resolve overlap without SVG painter
 * sorting.
 */
export function buildThreeResultGeometryData(
  mesh: MaterialRemovalMesh
): ThreeResultGeometryData {
  const componentCount = mesh.triangleCount * 9;
  const positions = new Float32Array(componentCount);
  const colors = new Float32Array(componentCount);
  let componentOffset = 0;
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
        positions[componentOffset] = point.x;
        positions[componentOffset + 1] = point.y;
        positions[componentOffset + 2] = point.z;
        colors[componentOffset] = color[0];
        colors[componentOffset + 1] = color[1];
        colors[componentOffset + 2] = color[2];
        componentOffset += 3;
      });
      triangleCount += 1;
    }
  });

  return {
    positions,
    colors,
    triangleCount,
  };
}
