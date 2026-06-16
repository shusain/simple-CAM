import { describe, expect, it } from 'vitest';
import { makeCircleOperation, makeDrillOperation, makeLineOperation, makeRectOperation, makeSettings, makeSketchOperation, makeTool } from '../test/factories';
import { getDefaultPocketStepOver } from './pocketing';
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

    expect(preview.markers[0]).toMatchObject({ kind: 'start', point: { x: 0, y: 0 } });
    expect(preview.markers.some((marker) => marker.kind === 'drill')).toBe(true);
    expect(preview.markers.some((marker) => marker.kind === 'plunge' && marker.operationId === 'rect-tabs')).toBe(true);
    expect(preview.markers[preview.markers.length - 1]).toMatchObject({ kind: 'end', point: { x: 0, y: 0 } });
    expect(preview.segments.some((segment) => segment.kind === 'rapid' && segment.points[0]?.x === 0 && segment.points[0]?.y === 0)).toBe(true);
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

  it('defaults pocket stepover to half the tool diameter', () => {
    expect(getDefaultPocketStepOver(3.175)).toBeCloseTo(1.5875);
  });

  it('builds multiple inside pocket contours and suppresses tabs for closed areas', () => {
    const tool = makeTool({ diameter: 4 });
    const operation = makeRectOperation({
      width: 20,
      height: 16,
      cutSide: 'inside',
      pocketEnabled: true,
      pocketStepOver: 1,
      tabsEnabled: true,
      tabCount: 2,
    });

    const plannedPaths = getOperationPlannedPaths(operation, makeSettings({ circleSegments: 16 }), tool);

    expect(plannedPaths.length).toBeGreaterThan(1);
    expect(plannedPaths[0]?.isPocketPath).toBe(false);
    expect(plannedPaths[1]?.isPocketPath).toBe(true);
    expect(plannedPaths.every((planned) => planned.cutSide === 'inside')).toBe(true);
    expect(plannedPaths.every((planned) => planned.tabRanges.length === 0)).toBe(true);
  });

  it('builds multiple pocket contours for rounded rectangles', () => {
    const tool = makeTool({ diameter: 4 });
    const operation = makeRectOperation({
      width: 24,
      height: 18,
      cornerRadius: 4,
      cutSide: 'inside',
      pocketEnabled: true,
      pocketStepOver: 1,
    });

    const plannedPaths = getOperationPlannedPaths(operation, makeSettings({ circleSegments: 16 }), tool);

    expect(plannedPaths.length).toBeGreaterThan(1);
    expect(plannedPaths[1]?.isPocketPath).toBe(true);
  });

  it('falls back to a single along-path sketch preview when inside pocket compensation fails', () => {
    const tool = makeTool({ diameter: 12 });
    const operation = makeSketchOperation({
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 6, y2: 0 },
        { type: 'line', x1: 6, y1: 0, x2: 6, y2: 6 },
        { type: 'line', x1: 6, y1: 6, x2: 0, y2: 6 },
        { type: 'line', x1: 0, y1: 6, x2: 0, y2: 0 },
      ],
      closed: true,
      cutSide: 'inside',
      pocketEnabled: true,
      pocketStepOver: 1,
    });

    const plannedPaths = getOperationPlannedPaths(operation, makeSettings({ circleSegments: 12 }), tool);

    expect(plannedPaths).toHaveLength(1);
    expect(plannedPaths[0]?.fallbackToAlongPath).toBe(true);
    expect(plannedPaths[0]?.isPocketPath).toBe(false);
  });

  it('pockets sketches when the geometry is closed even if the stored closed flag is false', () => {
    const tool = makeTool({ diameter: 2 });
    const operation = makeSketchOperation({
      closed: false,
      cutSide: 'inside',
      pocketEnabled: true,
      pocketStepOver: 1,
    });

    const plannedPaths = getOperationPlannedPaths(operation, makeSettings({ circleSegments: 12 }), tool);

    expect(plannedPaths.length).toBeGreaterThan(1);
    expect(plannedPaths[0]?.cutSide).toBe('inside');
  });

  it('does not emit invalid inner pocket contours that leave a concave sketch boundary', () => {
    const tool = makeTool({ diameter: 3.175 });
    const operation = makeSketchOperation({
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 20, y2: 0 },
        { type: 'line', x1: 20, y1: 0, x2: 10, y2: 6 },
        { type: 'line', x1: 10, y1: 6, x2: 20, y2: 12 },
        { type: 'line', x1: 20, y1: 12, x2: 0, y2: 12 },
        { type: 'line', x1: 0, y1: 12, x2: 0, y2: 0 },
      ],
      closed: true,
      cutSide: 'inside',
      pocketEnabled: true,
      pocketStepOver: 1.5875,
    });

    const plannedPaths = getOperationPlannedPaths(operation, makeSettings({ circleSegments: 24 }), tool);

    expect(plannedPaths.length).toBeGreaterThan(0);
    expect(plannedPaths.every((plannedPath) => plannedPath.path.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))).toBe(true);
    expect(plannedPaths.some((plannedPath) => plannedPath.isPocketPath)).toBe(true);
  });

  it('keeps concave sketch cleanup contours finite when constrained by the original boundary', () => {
    const tool = makeTool({ diameter: 3.175 });
    const operation = makeSketchOperation({
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 12, y2: 0 },
        { type: 'arc', x1: 12, y1: 0, x2: 6, y2: 6, throughX: 12, throughY: 6 },
        { type: 'arc', x1: 6, y1: 6, x2: 0, y2: 0, throughX: 0, throughY: 6 },
      ],
      closed: true,
      cutSide: 'inside',
      pocketEnabled: true,
      pocketStepOver: 1.5875,
    });

    const plannedPaths = getOperationPlannedPaths(operation, makeSettings({ circleSegments: 32 }), tool);

    expect(plannedPaths.length).toBeGreaterThan(0);
    expect(plannedPaths.every((plannedPath) => plannedPath.path.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))).toBe(true);
  });
});
