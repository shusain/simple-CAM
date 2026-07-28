import { describe, expect, it } from 'vitest';
import { makeCircleOperation, makeDrillOperation, makeImportedMesh, makeLineOperation, makeRectOperation, makeSettings, makeSurfaceFinishOperation, makeSurfaceRoughOperation, makeTool } from '../test/factories';
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

  it('uses geometry-derived V-groove depth in the 3D path preview', () => {
    const vBit = makeTool({
      id: 'v-bit-1',
      diameter: 12,
      millingGeometry: {
        type: 'v-bit',
        cuttingLength: 20,
        tipDiameter: 0.2,
        includedAngle: 60,
      },
    });
    const preview = buildToolpathPreview3D({
      operations: [
        makeLineOperation({
          toolId: vBit.id,
          depth: -8,
          millingStrategy: 'v-groove',
          millingTargetWidth: 6,
        }),
      ],
      settings: makeSettings(),
      tools: [vBit],
    });
    const cutDepths = preview.segments
      .filter((segment) => segment.kind === 'cut')
      .flatMap((segment) => segment.points.map((point) => point.z));

    expect(Math.min(...cutDepths)).toBeCloseTo(-5.02295, 4);
  });

  it('uses chamfer depth and tip-radius compensation in the 3D path preview', () => {
    const chamferMill = makeTool({
      id: 'chamfer-1',
      diameter: 10,
      millingGeometry: {
        type: 'chamfer',
        cuttingLength: 10,
        tipDiameter: 2,
        includedAngle: 90,
      },
    });
    const preview = buildToolpathPreview3D({
      operations: [
        makeCircleOperation({
          x: 10,
          y: 10,
          radius: 5,
          toolId: chamferMill.id,
          depth: -3,
          cutSide: 'outside',
          millingStrategy: 'chamfer-edge',
          millingTargetWidth: 2,
        }),
      ],
      settings: makeSettings({ circleSegments: 16 }),
      tools: [chamferMill],
    });
    const cutSegments = preview.segments.filter((segment) => segment.kind === 'cut');
    const cutDepths = cutSegments.flatMap((segment) =>
      segment.points.map((point) => point.z)
    );
    const radialDistances = cutSegments.flatMap((segment) =>
      segment.points.map((point) => Math.hypot(point.x - 10, point.y - 10))
    );

    expect(Math.min(...cutDepths)).toBeCloseTo(-2);
    expect(Math.max(...radialDistances)).toBeCloseTo(6);
  });

  it('includes retaining-tab lift motion in the shared 3D cut stream', () => {
    const tool = makeTool({
      id: 'tool-1',
      diameter: 2,
      materialProfiles: {
        'mat-1': {
          cutFeedRate: 300,
          plungeFeedRate: 120,
          cutDepthPerPass: 2,
          drillDepthPerPass: 2,
        },
      },
    });
    const preview = buildToolpathPreview3D({
      operations: [
        makeRectOperation({
          depth: -2,
          toolId: tool.id,
          materialId: 'mat-1',
          tabsEnabled: true,
          tabCount: 2,
          tabWidth: 1,
          tabHeight: 1,
        }),
      ],
      settings: makeSettings(),
      tools: [tool],
    });
    const [cutSegment] = preview.segments.filter(
      (segment) => segment.kind === 'cut'
    );
    const depths = cutSegment.points.map((point) => point.z);

    expect(depths).toContain(-2);
    expect(depths).toContain(-1);
    expect(
      cutSegment.points.some(
        (point, index) =>
          index > 0 &&
          point.x === cutSegment.points[index - 1].x &&
          point.y === cutSegment.points[index - 1].y &&
          point.z !== cutSegment.points[index - 1].z
      )
    ).toBe(true);
  });
});
