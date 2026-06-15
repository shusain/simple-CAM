import { describe, expect, it } from 'vitest';
import { buildBaseViewport, buildTransform, canvasToWorld, clampCenter, worldToCanvas } from './viewport';
import { makeSettings } from '../../test/factories';

describe('canvas viewport helpers', () => {
  it('builds a safe base viewport with minimum size and fit scale', () => {
    const viewport = buildBaseViewport(0, 0, 300, 200);
    expect(viewport.width).toBe(200);
    expect(viewport.height).toBe(200);
    expect(viewport.fitScale).toBeGreaterThan(0);
  });

  it('clamps center inside the work area or recenters when view is larger than work area', () => {
    expect(clampCenter({ x: -50, y: 400 }, 100, 50, 300, 200)).toEqual({ x: 50, y: 175 });
    expect(clampCenter({ x: 0, y: 0 }, 400, 300, 300, 200)).toEqual({ x: 150, y: 100 });
  });

  it('builds transforms and converts world/canvas coordinates consistently', () => {
    const transform = buildTransform(
      { width: 600, height: 400 },
      makeSettings({ workWidth: 300, workHeight: 200 }),
      1.5,
      { x: 150, y: 100 }
    );

    const canvasPoint = worldToCanvas({ x: 150, y: 100 }, transform);
    const worldPoint = canvasToWorld(canvasPoint.x, canvasPoint.y, transform);

    expect(transform.scale).toBeGreaterThan(0);
    expect(worldPoint.x).toBeCloseTo(150);
    expect(worldPoint.y).toBeCloseTo(100);
  });

  it('clamps canvas-to-world coordinates to work area bounds', () => {
    const transform = buildTransform(
      { width: 400, height: 300 },
      makeSettings({ workWidth: 100, workHeight: 80 }),
      1,
      { x: 50, y: 40 }
    );

    expect(canvasToWorld(-100, 9999, transform)).toEqual({ x: 0, y: 0 });
    expect(canvasToWorld(9999, -100, transform)).toEqual({ x: 100, y: 80 });
  });
});
