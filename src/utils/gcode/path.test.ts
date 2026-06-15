import { describe, expect, it } from 'vitest';
import {
  buildRoundedRectPath,
  clampRectCornerRadius,
  getClosedPathLength,
  getCutSide,
  getToolRadius,
  interpolatePoint,
  normalizeRectGeometry,
  offsetClosedPath,
  pointsEqual,
} from './path';
import { makeTool } from '../../test/factories';

describe('gcode path helpers', () => {
  it('normalizes geometry and tool settings', () => {
    expect(normalizeRectGeometry(10, 5, -4, -2)).toEqual({
      x: 6,
      y: 3,
      width: 4,
      height: 2,
    });
    expect(clampRectCornerRadius(10, 6, 4)).toBe(2);
    expect(getToolRadius(makeTool({ diameter: 3.175 }))).toBeCloseTo(1.5875);
    expect(getToolRadius(makeTool({ diameter: Number.NaN }))).toBe(0);
    expect(getCutSide({ cutSide: 'inside' }, 'outside')).toBe('inside');
    expect(getCutSide({}, 'outside')).toBe('outside');
  });

  it('builds closed rectangle paths and computes path length', () => {
    const path = buildRoundedRectPath({ x: 0, y: 0, width: 10, height: 5 }, 0, 4);

    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 0, y: 0 });
    expect(getClosedPathLength(path)).toBeCloseTo(30);
  });

  it('handles zero-length interpolation and empty rounded rects', () => {
    expect(interpolatePoint({ x: 1, y: 2 }, { x: 1, y: 2 }, 5)).toEqual({ x: 1, y: 2 });
    expect(interpolatePoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 20)).toEqual({ x: 10, y: 0 });
    expect(buildRoundedRectPath({ x: 0, y: 0, width: 0, height: 5 }, 2, 4)).toEqual([]);
    expect(pointsEqual({ x: 0, y: 0 }, { x: 0.00001, y: 0.00001 })).toBe(true);
  });

  it('offsets closed paths outward', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];

    const offset = offsetClosedPath(square, 1);
    expect(offset).not.toBeNull();
    expect(offset?.[0].x).toBeLessThan(0);
    expect(offset?.[0].y).toBeLessThan(0);
  });

  it('returns null or closed originals for unsupported offset cases', () => {
    expect(offsetClosedPath([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1)).toBeNull();

    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    expect(offsetClosedPath(square, 0)).toEqual(square);

    const degenerate = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(offsetClosedPath(degenerate, 1)).toBeNull();
  });
});
