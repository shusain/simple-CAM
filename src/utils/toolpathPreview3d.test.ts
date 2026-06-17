import { describe, expect, it } from 'vitest';
import { makeCircleOperation, makeDrillOperation, makeImportedMesh, makeSettings, makeSurfaceFinishOperation, makeSurfaceRoughOperation, makeTool } from '../test/factories';
import { buildToolpathPreview3D } from './toolpathPreview3d';

describe('buildToolpathPreview3D', () => {
  it('builds stepped cut passes for layered cutting', () => {
    const preview = buildToolpathPreview3D({
      operations: [
        makeCircleOperation({
          depth: -3,
          materialId: 'mat-1',
          toolId: 'tool-1',
        }),
      ],
      settings: makeSettings({ cutDepth: -3, safeZ: 5, startEndZ: 8 }),
      tools: [
        makeTool({
          id: 'tool-1',
          materialProfiles: {
            'mat-1': {
              cutFeedRate: 300,
              plungeFeedRate: 120,
              cutDepthPerPass: 1,
              drillDepthPerPass: 1,
            },
          },
        }),
      ],
    });

    const plungeDepths = preview.segments
      .filter((segment) => segment.kind === 'plunge')
      .map((segment) => segment.points[1].z);

    expect(plungeDepths).toEqual([-1, -2, -3]);
    expect(preview.markers[0].kind).toBe('start');
    expect(preview.markers[1].kind).toBe('end');
  });

  it('builds peck-style vertical drill motion', () => {
    const preview = buildToolpathPreview3D({
      operations: [
        makeDrillOperation({
          x: 10,
          y: 12,
          depth: -3,
          materialId: 'mat-1',
          toolId: 'tool-1',
        }),
      ],
      settings: makeSettings({ drillDepth: -3, safeZ: 5, startEndZ: 8 }),
      tools: [
        makeTool({
          id: 'tool-1',
          materialProfiles: {
            'mat-1': {
              cutFeedRate: 300,
              plungeFeedRate: 120,
              cutDepthPerPass: 1,
              drillDepthPerPass: 1,
            },
          },
        }),
      ],
    });

    const plungeDepths = preview.segments
      .filter((segment) => segment.kind === 'plunge')
      .map((segment) => segment.points[1].z);

    expect(plungeDepths).toEqual([-1, -2, -3]);
    expect(preview.bounds.minZ).toBe(-3);
    expect(preview.bounds.maxZ).toBe(8);
  });

  it('builds 3D raster passes for STL surface roughing operations', () => {
    const preview = buildToolpathPreview3D({
      operations: [
        makeSurfaceRoughOperation({
          depth: -2,
          stepOver: 2,
          stockToLeave: 0.5,
          meshId: 'mesh-1',
          toolId: 'tool-1',
          materialId: 'mat-1',
        }),
      ],
      settings: makeSettings({ safeZ: 5, startEndZ: 8 }),
      tools: [
        makeTool({
          id: 'tool-1',
          diameter: 4,
          materialProfiles: {
            'mat-1': {
              cutFeedRate: 300,
              plungeFeedRate: 120,
              cutDepthPerPass: 1,
              drillDepthPerPass: 1,
            },
          },
        }),
      ],
      importedMeshes: [
        makeImportedMesh({
          id: 'mesh-1',
          placement: { x: 20, y: 20 },
          localBounds: {
            minX: -5,
            maxX: 5,
            minY: -4,
            maxY: 4,
            minZ: -2,
            maxZ: 0,
          },
          triangles: [
            {
              a: { x: -5, y: -4, z: -2 },
              b: { x: 5, y: -4, z: -2 },
              c: { x: 5, y: 4, z: -2 },
            },
            {
              a: { x: -5, y: -4, z: -2 },
              b: { x: 5, y: 4, z: -2 },
              c: { x: -5, y: 4, z: -2 },
            },
          ],
        }),
      ],
    });

    expect(preview.segments.some((segment) => segment.operationType === 'surface-rough' && segment.kind === 'cut')).toBe(true);
    expect(preview.segments.some((segment) => segment.operationType === 'surface-rough' && segment.kind === 'plunge')).toBe(true);
    expect(preview.bounds.minZ).toBeLessThanOrEqual(-1.5);
  });

  it('builds 3D raster passes for STL surface finishing operations', () => {
    const preview = buildToolpathPreview3D({
      operations: [
        makeSurfaceFinishOperation({
          depth: -2,
          stepOver: 2,
          meshId: 'mesh-1',
          toolId: 'tool-1',
          materialId: 'mat-1',
        }),
      ],
      settings: makeSettings({ safeZ: 5, startEndZ: 8 }),
      tools: [
        makeTool({
          id: 'tool-1',
          diameter: 4,
          materialProfiles: {
            'mat-1': {
              cutFeedRate: 300,
              plungeFeedRate: 120,
              cutDepthPerPass: 1,
              drillDepthPerPass: 1,
            },
          },
        }),
      ],
      importedMeshes: [
        makeImportedMesh({
          id: 'mesh-1',
          placement: { x: 20, y: 20 },
          localBounds: {
            minX: -5,
            maxX: 5,
            minY: -4,
            maxY: 4,
            minZ: -2,
            maxZ: 0,
          },
          triangles: [
            {
              a: { x: -5, y: -4, z: -2 },
              b: { x: 5, y: -4, z: -2 },
              c: { x: 5, y: 4, z: 0 },
            },
            {
              a: { x: -5, y: -4, z: -2 },
              b: { x: 5, y: 4, z: 0 },
              c: { x: -5, y: 4, z: 0 },
            },
          ],
        }),
      ],
    });

    expect(preview.segments.some((segment) => segment.operationType === 'surface-finish' && segment.kind === 'cut')).toBe(true);
    expect(preview.segments.some((segment) => segment.operationType === 'surface-finish' && segment.kind === 'plunge')).toBe(true);
    expect(preview.bounds.minZ).toBeLessThanOrEqual(-1.5);
  });
});
