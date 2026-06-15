import { describe, expect, it } from 'vitest';
import { makeCircleOperation, makeDrillOperation, makeLineOperation, makeRectOperation, makeSettings, makeSketchOperation, makeTool } from '../test/factories';
import { buildToolpathPreview, getOperationPlannedPaths, slicePathByRange } from './toolpathPreview';

describe('toolpathPreview', () => {
  it('builds an outside rectangle path using tool radius compensation', () => {
    const operation = makeRectOperation({ x: 2, y: 3, width: 10, height: 4, cutSide: 'outside' });
    const tool = makeTool({ diameter: 2 });
    const [planned] = getOperationPlannedPaths(operation, makeSettings(), tool);

    expect(planned.path[0]).toEqual({ x: 2, y: 2 });
    expect(planned.path).toContainEqual({ x: 12, y: 2 });
    expect(planned.fallbackToAlongPath).toBe(false);
  });

  it('falls back to the nominal circle path when an inside offset is too small', () => {
    const operation = makeCircleOperation({ radius: 1, cutSide: 'inside' });
    const tool = makeTool({ diameter: 4 });
    const [planned] = getOperationPlannedPaths(operation, makeSettings({ circleSegments: 8 }), tool);

    expect(planned.fallbackToAlongPath).toBe(true);
    expect(planned.path[0]).toEqual({ x: 6, y: 5 });
  });

  it('slices a path segment for tab highlighting', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    const tabPath = slicePathByRange(path, { start: 8, end: 12 });

    expect(tabPath).toEqual([
      { x: 8, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
    ]);
  });

  it('builds a job preview with rapid links, tab overlays, and start/end markers', () => {
    const preview = buildToolpathPreview({
      operations: [
        makeDrillOperation({ x: 2, y: 2 }),
        makeRectOperation({ id: 'rect-tabs', x: 10, y: 10, width: 6, height: 4, tabsEnabled: true, tabCount: 2, tabWidth: 1 }),
        makeLineOperation({ id: 'line-2', x1: 20, y1: 3, x2: 25, y2: 3 }),
      ],
      settings: makeSettings({ circleSegments: 12 }),
      tools: [makeTool({ diameter: 2 })],
    });

    expect(preview.markers[0]).toMatchObject({ kind: 'start', point: { x: 2, y: 2 } });
    expect(preview.markers.some((marker) => marker.kind === 'drill')).toBe(true);
    expect(preview.markers.some((marker) => marker.kind === 'plunge' && marker.operationId === 'rect-tabs')).toBe(true);
    expect(preview.markers[preview.markers.length - 1]).toMatchObject({ kind: 'end', point: { x: 0, y: 0 } });
    expect(preview.segments.some((segment) => segment.kind === 'rapid')).toBe(true);
    expect(preview.segments.some((segment) => segment.kind === 'tab' && segment.operationId === 'rect-tabs')).toBe(true);
    expect(preview.segments.some((segment) => segment.kind === 'cut' && segment.operationId === 'line-2')).toBe(true);
  });

  it('uses compensated closed-sketch paths for outside cuts', () => {
    const operation = makeSketchOperation({
      cutSide: 'outside',
      tabsEnabled: true,
      tabCount: 2,
      tabWidth: 1,
    });
    const tool = makeTool({ diameter: 2 });
    const [planned] = getOperationPlannedPaths(operation, makeSettings({ circleSegments: 12 }), tool);

    expect(planned.path[0]).not.toEqual({ x: 0, y: 0 });
    expect(planned.tabRanges).toHaveLength(2);
  });
});
