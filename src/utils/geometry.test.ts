import { describe, expect, it } from 'vitest';
import {
  analyzeSketchIntegrity,
  deriveSketchState,
  getSketchPathPoints,
  getSketchSegments,
  getSketchStartPoint,
  getOperationBounds,
  getSketchSubpaths,
  hitTestOperation,
  isClosedSketchPath,
  moveOperation,
  normalizeRect,
  pointToSegmentDistance,
  sanitizeOperation,
  snapValue,
  snapPoint,
} from './geometry';
import {
  makeCircleOperation,
  makeDrillOperation,
  makeLineOperation,
  makeRectOperation,
  makeSketchOperation,
  makeSurfaceRoughOperation,
  makeTextOperation,
} from '../test/factories';

describe('geometry', () => {
  it('normalizes rectangles and snaps points to grid', () => {
    expect(normalizeRect(10, 20, -5, -8)).toEqual({
      x: 5,
      y: 12,
      width: 5,
      height: 8,
    });

    expect(snapPoint({ x: 4.6, y: 9.9 }, true, 5)).toEqual({ x: 5, y: 10 });
    expect(snapPoint({ x: 4.6, y: 9.9 }, false, 5)).toEqual({ x: 4.6, y: 9.9 });
    expect(snapValue(4.6, 0)).toBe(4.6);
  });

  it('builds subpaths and detects closed sketch paths', () => {
    const sketch = makeSketchOperation();

    const subpaths = getSketchSubpaths(sketch);
    expect(subpaths).toHaveLength(1);
    expect(subpaths[0][0]).toEqual(subpaths[0][subpaths[0].length - 1]);
    expect(isClosedSketchPath(sketch)).toBe(true);
  });

  it('builds arc sketch subpaths and exposes sketch start/path points', () => {
    const arcSketch = makeSketchOperation({
      segments: [
        { type: 'arc', x1: 0, y1: 0, x2: 10, y2: 0, throughX: 5, throughY: 5 },
        { type: 'line', x1: 10, y1: 0, x2: 12, y2: 0 },
      ],
      closed: false,
    });

    const subpaths = getSketchSubpaths(arcSketch, 24);
    expect(subpaths).toHaveLength(1);
    expect(subpaths[0].length).toBeGreaterThan(3);
    expect(getSketchStartPoint(arcSketch)).toEqual({ x: 0, y: 0 });
    expect(getSketchPathPoints(arcSketch, 24)[0]).toEqual({ x: 0, y: 0 });
  });

  it('splits disconnected sketch segments into multiple subpaths', () => {
    const splitSketch = makeSketchOperation({
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 },
        { type: 'line', x1: 20, y1: 0, x2: 25, y2: 0 },
      ],
      closed: false,
    });

    expect(getSketchSubpaths(splitSketch)).toHaveLength(2);
    expect(isClosedSketchPath(splitSketch)).toBe(false);
  });

  it('detects closed sketches even when segments are stored out of draw order', () => {
    const reorderedClosedSketch = makeSketchOperation({
      closed: false,
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'line', x1: 10, y1: 10, x2: 0, y2: 10 },
        { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
        { type: 'line', x1: 0, y1: 10, x2: 0, y2: 0 },
      ],
    });

    const subpaths = getSketchSubpaths(reorderedClosedSketch);

    expect(subpaths).toHaveLength(1);
    expect(subpaths[0][0]).toEqual(subpaths[0][subpaths[0].length - 1]);
    expect(isClosedSketchPath(reorderedClosedSketch)).toBe(true);
    expect(deriveSketchState(reorderedClosedSketch, reorderedClosedSketch.segments)).toMatchObject({
      closed: true,
      cutSide: 'outside',
    });
  });

  it('does not auto-close an open geometry just because the stored closed flag was true', () => {
    const previouslyClosedButNowOpen = makeSketchOperation({
      closed: true,
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
        { type: 'line', x1: 10, y1: 10, x2: 0, y2: 10 },
      ],
    });

    const subpaths = getSketchSubpaths(previouslyClosedButNowOpen);

    expect(subpaths).toHaveLength(1);
    expect(subpaths[0][0]).not.toEqual(subpaths[0][subpaths[0].length - 1]);
    expect(isClosedSketchPath(previouslyClosedButNowOpen)).toBe(false);
    expect(deriveSketchState(previouslyClosedButNowOpen, previouslyClosedButNowOpen.segments)).toMatchObject({
      closed: false,
      cutSide: 'along',
      tabsEnabled: false,
    });
  });

  it('analyzes sketch integrity issues and closure state', () => {
    const openSketch = makeSketchOperation({
      closed: false,
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
      ],
    });
    const disconnectedSketch = makeSketchOperation({
      closed: false,
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 },
        { type: 'line', x1: 20, y1: 0, x2: 25, y2: 0 },
      ],
    });
    const degenerateSketch = makeSketchOperation({
      closed: false,
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 0, y2: 0 },
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      ],
    });

    const openReport = analyzeSketchIntegrity(openSketch);
    expect(openReport.detectedClosed).toBe(false);
    expect(openReport.openGap).toBeCloseTo(Math.sqrt(200));
    expect(openReport.issues.map((issue) => issue.code)).toContain('open-gap');

    const disconnectedReport = analyzeSketchIntegrity(disconnectedSketch);
    expect(disconnectedReport.subpathCount).toBe(2);
    expect(disconnectedReport.issues.map((issue) => issue.code)).toContain('disconnected-subpaths');

    const degenerateReport = analyzeSketchIntegrity(degenerateSketch);
    expect(degenerateReport.zeroLengthSegmentIndexes).toEqual([0]);
    expect(degenerateReport.duplicateSegmentIndexes).toEqual([2]);
    expect(degenerateReport.issues.map((issue) => issue.code)).toContain('zero-length-segment');
    expect(degenerateReport.issues.map((issue) => issue.code)).toContain('duplicate-segment');
  });

  it('derives sketch state from the current segment geometry', () => {
    const openSketch = makeSketchOperation({
      closed: false,
      cutSide: 'along',
      tabsEnabled: true,
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
      ],
    });
    const closedSegments = [
      ...openSketch.segments,
      { type: 'line' as const, x1: 10, y1: 10, x2: 0, y2: 0 },
    ];

    expect(deriveSketchState(openSketch)).toMatchObject({
      closed: false,
      cutSide: 'along',
      tabsEnabled: false,
    });

    expect(deriveSketchState(openSketch, closedSegments)).toMatchObject({
      closed: true,
      cutSide: 'outside',
      tabsEnabled: true,
    });
  });

  it('preserves an explicit along-path cut side for sketches that were already closed', () => {
    const importedClosedSketch = makeSketchOperation({
      closed: true,
      cutSide: 'along',
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
        { type: 'line', x1: 10, y1: 10, x2: 0, y2: 10 },
        { type: 'line', x1: 0, y1: 10, x2: 0, y2: 0 },
      ],
    });

    expect(deriveSketchState(importedClosedSketch)).toMatchObject({
      closed: true,
      cutSide: 'along',
    });
  });

  it('computes bounds and hit testing for representative operations', () => {
    const rect = makeRectOperation({ x: 5, y: 10, width: 20, height: 4 });
    const line = makeLineOperation({ x1: 0, y1: 0, x2: 10, y2: 0 });
    const circle = makeCircleOperation({ x: 10, y: 10, radius: 5 });
    const drill = makeDrillOperation({ x: 2, y: 2 });
    const text = makeTextOperation({ x: 30, y: 40, text: 'A', fontSize: 8 });

    expect(getOperationBounds(rect)).toEqual({ minX: 5, minY: 10, maxX: 25, maxY: 14 });
    expect(hitTestOperation(line, { x: 5, y: 0.5 }, 1)).toBe(true);
    expect(hitTestOperation(rect, { x: 6, y: 11 }, 1)).toBe(true);
    expect(hitTestOperation(circle, { x: 10, y: 14.5 }, 1)).toBe(true);
    expect(hitTestOperation(drill, { x: 3, y: 2 }, 1)).toBe(true);
    expect(getOperationBounds(text)).toMatchObject({
      minX: expect.any(Number),
      minY: expect.any(Number),
      maxX: expect.any(Number),
      maxY: expect.any(Number),
    });
    expect(hitTestOperation(text, { x: 32, y: 45 }, 2)).toBe(true);
    expect(hitTestOperation(makeRectOperation({ width: 0.5, height: 0.5 }), { x: 0.25, y: 0.25 }, 1)).toBe(true);
  });

  it('moves sketch operations by offset', () => {
    const sketch = makeSketchOperation();
    const moved = moveOperation(sketch, 2, -3);

    expect(moved?.type).toBe('sketch');
    if (moved?.type !== 'sketch') {
      throw new Error('Expected sketch operation');
    }

    expect(moved.segments[0]).toMatchObject({
      x1: 2,
      y1: -3,
      x2: 12,
      y2: -3,
    });
  });

  it('moves and sanitizes text operations', () => {
    const text = makeTextOperation({ x: 12, y: 18, text: 'Hi' });
    const moved = moveOperation(text, 5, -3);

    expect(moved).toMatchObject({
      type: 'text',
      x: 17,
      y: 15,
      text: 'Hi',
    });

    expect(
      sanitizeOperation({
        ...text,
        type: 'text',
        text: 'Hello',
        fontSize: '14',
        lineHeight: '1.4',
      })
    ).toMatchObject({
      type: 'text',
      text: 'Hello',
      fontSize: 14,
      lineHeight: 1.4,
    });
  });

  it('keeps STL surface operations immutable in 2D geometry helpers', () => {
    const operation = makeSurfaceRoughOperation({ meshId: 'mesh-9' });

    expect(getOperationBounds(operation)).toBeNull();
    expect(hitTestOperation(operation, { x: 0, y: 0 }, 1)).toBe(false);
    expect(moveOperation(operation, 10, 5)).toEqual(operation);
  });

  it('sanitizes legacy sketch operations and clamps tab values', () => {
    const sanitized = sanitizeOperation({
      id: 'legacy-1',
      type: 'sketch',
      points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }],
      closed: true,
      tabCount: 0,
      tabWidth: -2,
      tabHeight: 0,
    });

    expect(sanitized).toMatchObject({
      id: 'legacy-1',
      type: 'sketch',
      closed: true,
      tabCount: 1,
      tabWidth: 1,
      tabHeight: 1,
    });
  });

  it('sanitizes line, rect, and circle operations and rejects invalid records', () => {
    expect(
      sanitizeOperation({
        id: 'line-raw',
        type: 'line',
        x1: 0,
        y1: 1,
        x2: 4,
        y2: 6,
        depth: -2,
      })
    ).toMatchObject({
      id: 'line-raw',
      type: 'line',
      x2: 4,
      y2: 6,
    });

    expect(
      sanitizeOperation({
        id: 'line-invalid',
        type: 'line',
        x1: 0,
        y1: 1,
        x: 4,
        y: 6,
      })
    ).toBeNull();

    expect(
      sanitizeOperation({
        id: 'rect-raw',
        type: 'rect',
        x: 0,
        y: 0,
        width: 10,
        height: 4,
        cornerRadius: 99,
        cutSide: 'bad-value',
      })
    ).toMatchObject({
      type: 'rect',
      cornerRadius: 2,
      cutSide: 'outside',
    });

    expect(
      sanitizeOperation({
        id: 'surface-rough',
        type: 'surface-rough',
        meshId: 'mesh-1',
        depth: -4,
        stepOver: 1.2,
        stockToLeave: 0.3,
      })
    ).toMatchObject({
      type: 'surface-rough',
      meshId: 'mesh-1',
      stepOver: 1.2,
      stockToLeave: 0.3,
    });

    expect(
      sanitizeOperation({
        id: 'circle-raw',
        type: 'circle',
        x: 5,
        y: 5,
        radius: -0.01,
      })
    ).toMatchObject({
      type: 'circle',
      radius: 0.1,
    });

    expect(sanitizeOperation({ type: 'circle', x: 'bad', y: 0, radius: 1 })).toBeNull();
    expect(sanitizeOperation({ type: 'surface-finish', meshId: '', depth: -2 })).toBeNull();
    expect(sanitizeOperation({ type: 'unknown' })).toBeNull();
  });

  it('supports legacy and filtered sketch segments plus zero-length segment distance', () => {
    const legacy = {
      type: 'sketch',
      points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }],
    };
    const mixed = {
      type: 'sketch',
      segments: [
        { type: 'line', x1: 0, y1: 0, x: 4, y: 0 },
        { type: 'arc', x1: 4, y1: 0, x2: 6, y2: 0, throughX: 5, throughY: 2 },
        { type: 'bad' },
      ],
    };

    expect(getSketchSegments(legacy)).toHaveLength(2);
    expect(getSketchSegments(mixed)).toHaveLength(2);
    expect(pointToSegmentDistance({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(Math.sqrt(2));
  });
});
