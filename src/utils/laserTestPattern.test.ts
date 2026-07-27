import { describe, expect, it } from 'vitest';
import { makeSettings, makeTool } from '../test/factories';
import { buildLaserTestPattern } from './laserTestPattern';

describe('buildLaserTestPattern', () => {
  it('maps speed across columns and power across rows', () => {
    let id = 0;
    const operations = buildLaserTestPattern({
      options: {
        process: 'etch',
        speedMin: 1000,
        speedMax: 3000,
        powerMin: 20,
        powerMax: 80,
        columns: 3,
        rows: 2,
        rectangleWidth: 10,
        rectangleHeight: 8,
        gap: 2,
        lineInterval: 0.1,
        overscan: 2,
      },
      settings: makeSettings({ marginX: 5, marginY: 7, cutDepth: -1 }),
      tool: makeTool({ id: 'laser-1', isLaser: true, diameter: 0.1 }),
      materialId: 'birch',
      createId: () => `test-${++id}`,
    });

    expect(operations).toHaveLength(6);
    expect(operations.map((operation) => operation.laserSpeed)).toEqual([
      1000, 2000, 3000, 1000, 2000, 3000,
    ]);
    expect(operations.map((operation) => operation.laserPower)).toEqual([
      20, 20, 20, 80, 80, 80,
    ]);
    expect(operations[0]).toMatchObject({
      id: 'test-1',
      x: 7,
      y: 7,
      width: 10,
      height: 8,
      laserProcess: 'etch',
      laserLineInterval: 0.1,
      laserOverscan: 2,
    });
    expect(operations[5]).toMatchObject({ x: 31, y: 17 });
  });
});
