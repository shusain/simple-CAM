import { describe, expect, it } from 'vitest';
import { importStlModel, getImportedMeshWorldBounds, offsetImportedMesh } from './importStl';

const sampleStl = `
solid sample
  facet normal 0 0 1
    outer loop
      vertex -10 -5 0
      vertex 10 -5 0
      vertex 10 5 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex -10 -5 0
      vertex 10 5 0
      vertex -10 5 2
    endloop
  endfacet
endsolid sample
`;

describe('importStlModel', () => {
  it('normalizes an ASCII STL into centered XY placement and stock-top Z0', () => {
    const result = importStlModel(sampleStl, {
      createId: () => 'mesh-1',
      filePath: '/tmp/sample.stl',
      workWidth: 200,
      workHeight: 100,
    });

    expect(result.warnings).toEqual([]);
    expect(result.mesh).toMatchObject({
      id: 'mesh-1',
      name: 'sample.stl',
      triangleCount: 2,
      placement: { x: 100, y: 50 },
      localBounds: {
        minX: -10,
        maxX: 10,
        minY: -5,
        maxY: 5,
        minZ: -2,
        maxZ: 0,
      },
    });
  });

  it('computes world bounds from placement and supports XY translation', () => {
    const result = importStlModel(sampleStl, {
      createId: () => 'mesh-2',
      workWidth: 120,
      workHeight: 80,
    });

    const mesh = result.mesh;
    expect(mesh).not.toBeNull();
    if (!mesh) {
      return;
    }

    expect(getImportedMeshWorldBounds(mesh)).toEqual({
      minX: 50,
      maxX: 70,
      minY: 35,
      maxY: 45,
      minZ: -2,
      maxZ: 0,
    });

    expect(offsetImportedMesh(mesh, 5, -10).placement).toEqual({
      x: 65,
      y: 30,
    });
  });

  it('returns a warning when the contents are not a supported ASCII STL', () => {
    const result = importStlModel('not an stl', {
      createId: () => 'mesh-3',
      workWidth: 100,
      workHeight: 100,
    });

    expect(result.mesh).toBeNull();
    expect(result.warnings[0]).toMatch(/ASCII STL is supported/i);
  });
});
