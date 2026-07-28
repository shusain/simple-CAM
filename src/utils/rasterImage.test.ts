import { describe, expect, it } from 'vitest';
import { makeImageFillOperation } from '../test/factories';
import {
  buildRasterScanRows,
  decodeGrayscaleBytes,
  encodeGrayscaleBytes,
  getRasterPowerPercent,
} from './rasterImage';

describe('raster image planning', () => {
  it('round-trips grayscale bytes and maps black to maximum power', () => {
    const encoded = encodeGrayscaleBytes(
      new Uint8Array([0, 64, 128, 255])
    );

    expect(Array.from(decodeGrayscaleBytes(encoded))).toEqual([
      0, 64, 128, 255,
    ]);
    expect(getRasterPowerPercent(0, 10, 90)).toBe(90);
    expect(getRasterPowerPercent(255, 10, 90)).toBe(10);
    expect(getRasterPowerPercent(127.5, 10, 90)).toBe(50);
  });

  it('builds alternating scan rows with per-sample power', () => {
    const operation = makeImageFillOperation({
      width: 2,
      height: 2,
      pixelWidth: 2,
      pixelHeight: 2,
      grayscaleData: encodeGrayscaleBytes(
        new Uint8Array([0, 255, 128, 64])
      ),
      laserPowerMin: 10,
      laserPowerMax: 90,
      laserLineInterval: 1,
    });

    const rows = buildRasterScanRows(operation);

    expect(rows).toHaveLength(2);
    expect(rows[0].start).toEqual({ x: 0, y: 1.5 });
    expect(rows[0].end).toEqual({ x: 2, y: 1.5 });
    expect(rows[0].samples.map((sample) => sample.outputPower)).toEqual([
      230, 26,
    ]);
    expect(rows[1].start).toEqual({ x: 2, y: 0.5 });
    expect(rows[1].end).toEqual({ x: 0, y: 0.5 });
    expect(rows[1].samples[0].powerPercent).toBeCloseTo(
      getRasterPowerPercent(64, 10, 90)
    );
  });

  it('rotates raster motion around the image center', () => {
    const rows = buildRasterScanRows(
      makeImageFillOperation({ rotation: Math.PI / 2 })
    );

    expect(rows[0].start.x).toBeCloseTo(1);
    expect(rows[0].start.y).toBeCloseTo(-0.5);
    expect(rows[0].end.x).toBeCloseTo(1);
    expect(rows[0].end.y).toBeCloseTo(1.5);
  });
});
