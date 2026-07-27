import { describe, expect, it } from 'vitest';
import { makeSettings, makeTool } from '../test/factories';
import { getOperationBounds } from './geometry';
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
        labelPower: 15,
        labelSpeed: 1500,
      },
      settings: makeSettings({ marginX: 5, marginY: 7, cutDepth: -1 }),
      tool: makeTool({ id: 'laser-1', isLaser: true, diameter: 0.1 }),
      materialId: 'birch',
      materialName: 'Birch plywood',
      createId: () => `test-${++id}`,
    });

    const rectangles = operations.filter((operation) => operation.type === 'rect');
    const labels = operations.filter((operation) => operation.type === 'text');

    expect(rectangles).toHaveLength(6);
    expect(labels).toHaveLength(9);
    expect(rectangles.map((operation) => operation.laserSpeed)).toEqual([
      1000, 2000, 3000, 1000, 2000, 3000,
    ]);
    expect(rectangles.map((operation) => operation.laserPower)).toEqual([
      20, 20, 20, 80, 80, 80,
    ]);
    expect(rectangles[0]).toMatchObject({
      id: 'test-10',
      width: 10,
      height: 8,
      laserProcess: 'etch',
      laserLineInterval: 0.1,
      laserOverscan: 2,
    });
    expect(rectangles[0].x).toBeGreaterThan(7);
    expect(rectangles[0].y).toBeGreaterThan(7);
    expect(rectangles[5].x - rectangles[0].x).toBeCloseTo(24);
    expect(rectangles[5].y - rectangles[0].y).toBeCloseTo(10);

    expect(labels.map((operation) => operation.text)).toEqual([
      'LASER TEST PATTERN - BIRCH PLYWOOD',
      'ETCH | SPEED 1000-3000 MM/MIN | POWER 20-80%\nLABELS ALONG PATH | 15% POWER | 1500 MM/MIN\nGRID 3X2 | CELL 10X8 MM | GAP 2 MM\nINTERVAL 0.1 MM | OVERSCAN 2 MM',
      'SPEED',
      'POWER',
      '1000',
      '2000',
      '3000',
      '20%',
      '80%',
    ]);
    expect(labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          laserProcess: 'cut',
          laserPower: 15,
          laserSpeed: 1500,
          laserOverscan: 0,
        }),
      ])
    );
    expect(operations.slice(0, labels.length).every((operation) => operation.type === 'text')).toBe(true);
    expect(operations.slice(labels.length).every((operation) => operation.type === 'rect')).toBe(true);

    const rectangleBounds = rectangles.map((operation) => getOperationBounds(operation)!);
    const titleBounds = getOperationBounds(labels[0])!;
    const summaryBounds = getOperationBounds(labels[1])!;
    const speedAxisBounds = getOperationBounds(labels[2])!;
    const powerAxisBounds = getOperationBounds(labels[3])!;
    const speedLabelBounds = labels
      .slice(4, 7)
      .map((operation) => getOperationBounds(operation)!);
    const powerLabelBounds = labels
      .slice(7)
      .map((operation) => getOperationBounds(operation)!);
    const gridMinX = Math.min(...rectangleBounds.map((bounds) => bounds.minX));
    const gridMinY = Math.min(...rectangleBounds.map((bounds) => bounds.minY));
    const gridMaxY = Math.max(...rectangleBounds.map((bounds) => bounds.maxY));

    expect(Math.max(...speedLabelBounds.map((bounds) => bounds.maxY))).toBeLessThan(gridMinY);
    expect(Math.max(...powerLabelBounds.map((bounds) => bounds.maxX))).toBeLessThan(gridMinX);
    expect(speedAxisBounds.maxY).toBeLessThan(
      Math.min(...speedLabelBounds.map((bounds) => bounds.minY))
    );
    expect(powerAxisBounds.maxX).toBeLessThan(
      Math.min(...powerLabelBounds.map((bounds) => bounds.minX))
    );
    expect(labels[3].rotation).toBeCloseTo(Math.PI / 2);
    expect(summaryBounds.minY).toBeGreaterThan(gridMaxY);
    expect(titleBounds.minY).toBeGreaterThan(summaryBounds.maxY);
  });

  it('keeps labels along-path for a cut test and omits raster-only parameters', () => {
    let id = 0;
    const operations = buildLaserTestPattern({
      options: {
        process: 'cut',
        speedMin: 300,
        speedMax: 900,
        powerMin: 60,
        powerMax: 100,
        columns: 2,
        rows: 2,
        rectangleWidth: 12,
        rectangleHeight: 12,
        gap: 3,
        lineInterval: 0.1,
        overscan: 2,
        labelPower: 18,
        labelSpeed: 750,
      },
      settings: makeSettings(),
      tool: makeTool({ id: 'laser-1', isLaser: true, diameter: 0.1 }),
      materialId: 'generic',
      createId: () => `cut-${++id}`,
    });

    const rectangles = operations.filter((operation) => operation.type === 'rect');
    const labels = operations.filter((operation) => operation.type === 'text');
    const summary = labels.find((operation) => operation.text.startsWith('CUT |'));

    expect(rectangles).toHaveLength(4);
    expect(rectangles.every((operation) => operation.laserProcess === 'cut')).toBe(true);
    expect(labels).toHaveLength(8);
    expect(labels.every((operation) => operation.laserProcess === 'cut')).toBe(true);
    expect(labels.every((operation) => operation.cutSide === 'along')).toBe(true);
    expect(labels.every((operation) => operation.laserPower === 18)).toBe(true);
    expect(labels.every((operation) => operation.laserSpeed === 750)).toBe(true);
    expect(operations.slice(0, labels.length).every((operation) => operation.type === 'text')).toBe(true);
    expect(labels.map((operation) => operation.text)).toContain('SPEED');
    expect(labels.map((operation) => operation.text)).toContain('POWER');
    expect(summary?.text).not.toContain('INTERVAL');
    expect(summary?.text).not.toContain('OVERSCAN');
  });
});
