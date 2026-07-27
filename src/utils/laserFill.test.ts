import { describe, expect, it } from 'vitest';
import { buildLaserFillSegments } from './laserFill';

describe('buildLaserFillSegments', () => {
  it('builds alternating raster rows through a closed rectangle', () => {
    const segments = buildLaserFillSegments(
      [[
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ]],
      5
    );

    expect(segments).toEqual([
      { start: { x: 0, y: 2.5 }, end: { x: 10, y: 2.5 } },
      { start: { x: 10, y: 7.5 }, end: { x: 0, y: 7.5 } },
    ]);
  });

  it('uses even-odd filling to preserve holes', () => {
    const segments = buildLaserFillSegments(
      [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
          { x: 0, y: 0 },
        ],
        [
          { x: 4, y: 4 },
          { x: 6, y: 4 },
          { x: 6, y: 6 },
          { x: 4, y: 6 },
          { x: 4, y: 4 },
        ],
      ],
      2
    );

    const middleRows = segments.filter((segment) => segment.start.y === 5);
    expect(middleRows).toEqual([
      { start: { x: 0, y: 5 }, end: { x: 4, y: 5 } },
      { start: { x: 6, y: 5 }, end: { x: 10, y: 5 } },
    ]);
  });
});
