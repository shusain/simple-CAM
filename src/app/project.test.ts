import { describe, expect, it } from 'vitest';
import { buildProjectFile, hydrateProjectFile } from './project';
import { makeDrillOperation, makeMaterial, makeSurfaceFinishOperation, makeTool } from '../test/factories';

describe('project helpers', () => {
  it('hydrates projects with normalized tools, materials, and sanitized operations', () => {
    const project = {
      version: 1,
      settings: { activeMaterialId: 'missing-material', safeZ: 12 },
      materials: [{ id: '', name: '  MDF  ' }, makeMaterial({ id: 'material-baltic', name: 'Baltic Birch' })],
      tools: [{ id: '', name: 'Tool Raw' }, makeTool({ id: 'tool-finisher', diameter: 1.5 })],
      activeToolId: 'missing-tool',
      importedMeshes: [
        {
          id: '',
          type: 'stl',
          name: ' Hold Down ',
          units: 'mm',
          triangleCount: 1,
          placement: { x: 100, y: 50 },
          localBounds: { minX: -10, maxX: 10, minY: -2, maxY: 2, minZ: -3, maxZ: 0 },
          triangles: [{ a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 0, y: 1, z: -1 } }],
        },
      ],
      operations: [
        { type: 'drill', x: 3, y: 4, depth: -2, toolId: 'missing-tool', materialId: 'missing-material' },
        { type: 'surface-finish', meshId: 'mesh-1', depth: -3, stepOver: 1.5, toolId: 'tool-finisher' },
        { type: 'drill', x: 'bad', y: 4, depth: -2 },
      ],
    } as never;

    const hydrated = hydrateProjectFile(project, () => 'generated-id');

    expect(hydrated.settings.safeZ).toBe(12);
    expect(hydrated.settings.activeMaterialId).toBe('material-0');
    expect(hydrated.materials[0]).toEqual({ id: 'material-0', name: 'MDF' });
    expect(hydrated.tools[0].id).toBe('tool-0');
    expect(hydrated.activeToolId).toBe('tool-0');
    expect(hydrated.operations).toHaveLength(2);
    expect(hydrated.importedMeshes).toHaveLength(1);
    expect(hydrated.importedMeshes[0]).toMatchObject({
      id: 'generated-id',
      name: 'Hold Down',
      placement: { x: 100, y: 50 },
    });
    expect(hydrated.operations[0]).toMatchObject({
      id: 'generated-id',
      toolId: 'tool-0',
      materialId: 'material-0',
    });
    expect(hydrated.operations[1]).toMatchObject({
      type: 'surface-finish',
      meshId: 'mesh-1',
      toolId: 'tool-finisher',
    });
  });

  it('builds project files from hydrated data', () => {
    const data = {
      settings: { safeZ: 6 } as never,
      materials: [makeMaterial()],
      tools: [makeTool()],
      activeToolId: 'tool-1',
      importedMeshes: [],
      operations: [makeDrillOperation(), makeSurfaceFinishOperation()],
    };

    expect(buildProjectFile(data)).toEqual({
      version: 1,
      ...data,
    });
  });
});
