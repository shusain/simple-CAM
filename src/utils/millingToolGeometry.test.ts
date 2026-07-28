import { describe, expect, it } from 'vitest';
import { makeTool } from '../test/factories';
import {
  changeMillingToolType,
  formatMillingToolGeometrySummary,
  getDefaultMillingToolGeometry,
  getMillingToolEffectiveRadiusAtDepth,
  getMillingToolHeightAtRadius,
  getMillingToolMaxUsableDepth,
  getMillingToolRadiusAtHeight,
  normalizeMillingToolGeometry,
} from './millingToolGeometry';

describe('milling tool geometry', () => {
  it('normalizes current geometry values and clamps tapered parameters', () => {
    expect(
      normalizeMillingToolGeometry(
        {
          type: 'v-bit',
          cuttingLength: -3,
          tipDiameter: 12,
          includedAngle: 240,
        },
        10
      )
    ).toEqual({
      type: 'v-bit',
      cuttingLength: 40,
      tipDiameter: 10,
      includedAngle: 179,
    });

    expect(normalizeMillingToolGeometry({ type: 'unknown' }, 4)).toEqual(
      getDefaultMillingToolGeometry('flat-end', 4)
    );
    expect(
      normalizeMillingToolGeometry({ type: 'ball-nose', cuttingLength: 1 }, 10)
        .cuttingLength
    ).toBe(5);
  });

  it('changes geometry type with useful V-bit and chamfer defaults', () => {
    const flat = getDefaultMillingToolGeometry('flat-end', 6);
    const vBit = changeMillingToolType(flat, 'v-bit', 6);
    const chamfer = changeMillingToolType(vBit, 'chamfer', 6);

    expect(vBit).toMatchObject({
      type: 'v-bit',
      tipDiameter: 0.2,
      includedAngle: 60,
    });
    expect(chamfer).toMatchObject({
      type: 'chamfer',
      tipDiameter: 0.2,
      includedAngle: 90,
    });
  });

  it('models flat and ball-nose radial profiles from the cutter tip', () => {
    const flat = makeTool({
      diameter: 10,
      millingGeometry: {
        type: 'flat-end',
        cuttingLength: 20,
        tipDiameter: 0,
        includedAngle: 60,
      },
    });
    const ball = makeTool({
      diameter: 10,
      millingGeometry: {
        type: 'ball-nose',
        cuttingLength: 20,
        tipDiameter: 0,
        includedAngle: 60,
      },
    });

    expect(getMillingToolRadiusAtHeight(flat, 0)).toBe(5);
    expect(getMillingToolRadiusAtHeight(flat, 12)).toBe(5);
    expect(getMillingToolHeightAtRadius(flat, 4)).toBe(0);

    expect(getMillingToolRadiusAtHeight(ball, 0)).toBe(0);
    expect(getMillingToolRadiusAtHeight(ball, 1)).toBeCloseTo(3);
    expect(getMillingToolRadiusAtHeight(ball, 5)).toBe(5);
    expect(getMillingToolHeightAtRadius(ball, 3)).toBeCloseTo(1);
  });

  it('models tapered profiles, tip flats, and usable depth limits', () => {
    const vBit = makeTool({
      diameter: 12,
      millingGeometry: {
        type: 'v-bit',
        cuttingLength: 20,
        tipDiameter: 0,
        includedAngle: 90,
      },
    });
    const limitedChamfer = makeTool({
      diameter: 10,
      millingGeometry: {
        type: 'chamfer',
        cuttingLength: 2,
        tipDiameter: 2,
        includedAngle: 90,
      },
    });

    expect(getMillingToolMaxUsableDepth(vBit)).toBeCloseTo(6);
    expect(getMillingToolRadiusAtHeight(vBit, 3)).toBeCloseTo(3);
    expect(getMillingToolHeightAtRadius(vBit, 3)).toBeCloseTo(3);
    expect(getMillingToolEffectiveRadiusAtDepth(vBit, -3)).toBeCloseTo(3);

    expect(getMillingToolMaxUsableDepth(limitedChamfer)).toBe(2);
    expect(getMillingToolRadiusAtHeight(limitedChamfer, 0)).toBe(1);
    expect(getMillingToolRadiusAtHeight(limitedChamfer, 2)).toBeCloseTo(3);
    expect(getMillingToolRadiusAtHeight(limitedChamfer, 20)).toBeCloseTo(3);
    expect(getMillingToolHeightAtRadius(limitedChamfer, 1)).toBe(0);
    expect(getMillingToolHeightAtRadius(limitedChamfer, 4)).toBe(2);
    expect(formatMillingToolGeometrySummary(limitedChamfer)).toBe(
      'Chamfer mill · max Ø10 mm · tip Ø2 mm · 90° included · 2 mm usable depth'
    );
  });
});
