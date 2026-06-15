import { describe, expect, it } from 'vitest';
import {
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

  it('computes bounds and hit testing for representative operations', () => {
    const rect = makeRectOperation({ x: 5, y: 10, width: 20, height: 4 });
    const line = makeLineOperation({ x1: 0, y1: 0, x2: 10, y2: 0 });
    const circle = makeCircleOperation({ x: 10, y: 10, radius: 5 });
    const drill = makeDrillOperation({ x: 2, y: 2 });

    expect(getOperationBounds(rect)).toEqual({ minX: 5, minY: 10, maxX: 25, maxY: 14 });
    expect(hitTestOperation(line, { x: 5, y: 0.5 }, 1)).toBe(true);
    expect(hitTestOperation(rect, { x: 6, y: 11 }, 1)).toBe(true);
    expect(hitTestOperation(circle, { x: 10, y: 14.5 }, 1)).toBe(true);
    expect(hitTestOperation(drill, { x: 3, y: 2 }, 1)).toBe(true);
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
