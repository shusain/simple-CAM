import { describe, expect, it } from 'vitest';
import { buildIncrementDepths, getStartEndZ, num, toNegativeDepth, toPositiveStep } from './depth';
import { makeSettings } from '../../test/factories';

describe('gcode depth helpers', () => {
  it('formats numbers and normalizes depths', () => {
    expect(num(3.14159)).toBe('3.142');
    expect(toNegativeDepth(2, -5)).toBe(-2);
    expect(toNegativeDepth(Number.NaN, -5)).toBe(-5);
    expect(toPositiveStep(-0.5, 1)).toBe(0.5);
  });

  it('builds incremental pass depths', () => {
    expect(buildIncrementDepths(-3, 1)).toEqual([-1, -2, -3]);
    expect(buildIncrementDepths(-2.5, 1)).toEqual([-1, -2, -2.5]);
    expect(buildIncrementDepths(0, 1)).toEqual([0]);
  });

  it('uses startEndZ when present and safeZ as fallback', () => {
    expect(getStartEndZ(makeSettings({ startEndZ: 15, safeZ: 6 }))).toBe(15);
    expect(getStartEndZ(makeSettings({ startEndZ: Number.NaN, safeZ: 6 }))).toBe(6);
  });
});
