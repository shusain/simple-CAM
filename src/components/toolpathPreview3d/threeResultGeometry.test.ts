import { describe, expect, it } from 'vitest';
import type { MaterialRemovalMesh } from '../../utils/materialRemovalMesh';
import { buildThreeResultGeometryData } from './threeResultGeometry';

describe('buildThreeResultGeometryData', () => {
  it('triangulates faces and preserves hard face normals and surface colors', () => {
    const mesh: MaterialRemovalMesh = {
      faces: [
        {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 2, y: 0, z: 0 },
            { x: 2, y: 1, z: 0 },
            { x: 0, y: 1, z: 0 },
          ],
          surface: 'top',
          normal: { x: 0, y: 0, z: 1 },
        },
        {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 },
            { x: 0, y: 1, z: -1 },
          ],
          surface: 'side',
          normal: { x: -1, y: 0, z: 0 },
        },
      ],
      triangleCount: 3,
    };

    const result = buildThreeResultGeometryData(mesh);

    expect(result.triangleCount).toBe(3);
    expect(result.positions).toHaveLength(27);
    expect(result.normals).toHaveLength(27);
    expect(result.colors).toHaveLength(27);
    expect(Array.from(result.normals.slice(0, 9))).toEqual([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]);
    expect(Array.from(result.normals.slice(18, 27))).toEqual([
      -1, 0, 0,
      -1, 0, 0,
      -1, 0, 0,
    ]);
    expect(result.colors[0]).toBeCloseTo(0.82);
    expect(result.colors[18]).toBeCloseTo(0.57);
  });
});
