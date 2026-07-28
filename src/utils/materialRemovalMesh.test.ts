import { describe, expect, it } from 'vitest';
import type { MaterialRemovalPreview } from './materialRemovalPreview';
import { buildMaterialRemovalMesh } from './materialRemovalMesh';

function makePreview(
  heights: number[],
  overrides: Partial<MaterialRemovalPreview> = {}
): MaterialRemovalPreview {
  return {
    width: 2,
    height: 2,
    stockThickness: 3,
    columns: 3,
    rows: 3,
    cellSizeX: 1,
    cellSizeY: 1,
    heights: new Float32Array(heights),
    minimumHeight: Math.min(0, ...heights),
    removedCellCount: heights.filter((height) => height < 0).length,
    simulatedOperationIds: [],
    approximate: true,
    warnings: [],
    ...overrides,
  };
}

describe('material removal mesh', () => {
  it('builds continuous top, bottom, and outer stock faces', () => {
    const mesh = buildMaterialRemovalMesh(
      makePreview(new Array(9).fill(0))
    );

    expect(mesh.faces.filter((face) => face.surface === 'top')).toHaveLength(1);
    expect(mesh.faces.filter((face) => face.surface === 'bottom')).toHaveLength(1);
    expect(mesh.faces.filter((face) => face.surface === 'side')).toHaveLength(8);
    expect(mesh.triangleCount).toBe(20);
  });

  it('clips stock-bottom regions out of the top mesh instead of rendering a floor', () => {
    const mesh = buildMaterialRemovalMesh(
      makePreview([0, 0, 0, 0, -3, 0, 0, 0, 0])
    );
    const topFaces = mesh.faces.filter((face) => face.surface === 'top');

    expect(topFaces).toHaveLength(8);
    expect(
      topFaces.every((face) =>
        face.points.some((point) => point.z > -3 + 0.0001)
      )
    ).toBe(true);
  });

  it('triangulates sloped cutter envelopes with non-vertical surface normals', () => {
    const mesh = buildMaterialRemovalMesh(
      makePreview([0, -1, -2, 0, -1, -2], {
        width: 2,
        height: 1,
        columns: 3,
        rows: 2,
      })
    );
    const topFaces = mesh.faces.filter((face) => face.surface === 'top');

    expect(topFaces.length).toBeGreaterThan(0);
    expect(
      topFaces.some((face) => Math.abs(face.normal.x) > 0.1)
    ).toBe(true);
  });

  it('greedily combines untouched flat stock into a single top face', () => {
    const mesh = buildMaterialRemovalMesh(
      makePreview(new Array(9).fill(0), {
        surfaceModes: new Uint8Array(9),
      })
    );

    expect(mesh.faces.filter((face) => face.surface === 'top')).toHaveLength(1);
    expect(mesh.faces.filter((face) => face.surface === 'bottom')).toHaveLength(1);
  });

  it('keeps flat-cutter boundaries vertical instead of interpolating a ramp', () => {
    const mesh = buildMaterialRemovalMesh(
      makePreview([0, 0, 0, 0, -1, 0, 0, 0, 0], {
        surfaceModes: new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]),
      })
    );
    const internalWalls = mesh.faces.filter(
      (face) =>
        face.surface === 'side' &&
        face.points.some((point) => point.z === 0) &&
        face.points.some((point) => point.z === -1)
    );

    expect(internalWalls).toHaveLength(4);
    expect(
      internalWalls.every((face) => Math.abs(face.normal.z) < 0.0001)
    ).toBe(true);
  });

  it('splits laser and shaped-tool samples into local regions with vertical interfaces', () => {
    const mesh = buildMaterialRemovalMesh(
      makePreview([0, -3, -1, -0.5, 0, -3, -1, -0.5], {
        width: 3,
        height: 1,
        columns: 4,
        rows: 2,
        surfaceModes: new Uint8Array([0, 1, 2, 2, 0, 1, 2, 2]),
      })
    );
    const internalWalls = mesh.faces.filter(
      (face) =>
        face.surface === 'side' &&
        face.points.some(
          (point) =>
            point.x > 0.0001 &&
            point.x < 2.9999 &&
            point.y > 0.0001 &&
            point.y < 0.9999
        ) &&
        face.points.some((point) => point.z <= -3 + 0.0001) &&
        face.points.some((point) => point.z > -3 + 0.0001)
    );
    const shapedTopFaces = mesh.faces.filter(
      (face) =>
        face.surface === 'top' &&
        face.points.some((point) => point.x > 2)
    );

    expect(internalWalls.length).toBeGreaterThan(0);
    expect(
      internalWalls.every((face) => Math.abs(face.normal.z) < 0.0001)
    ).toBe(true);
    expect(
      shapedTopFaces.some((face) => Math.abs(face.normal.x) > 0.1)
    ).toBe(true);
  });
});
