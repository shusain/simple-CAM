import { describe, expect, it } from 'vitest';
import { makeCircleOperation, makeDrillOperation, makeSettings, makeTool } from '../test/factories';
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
});
