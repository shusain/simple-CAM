import { describe, expect, it } from 'vitest';
import { makeSettings } from '../../test/factories';
import { buildTransform } from './viewport';
import {
  getMiniMapGeometry,
  miniMapCanvasToWorld,
  miniMapWorldToCanvas,
} from './minimap';

describe('canvas minimap helpers', () => {
  const transform = buildTransform(
    { width: 900, height: 600 },
    makeSettings({ workWidth: 300, workHeight: 200 }),
    2,
    { x: 150, y: 100 }
  );

  it('maps work-area points into the minimap and back', () => {
    const geometry = getMiniMapGeometry(transform);
    const mapPoint = miniMapWorldToCanvas({ x: 75, y: 150 }, transform, geometry);

    expect(geometry.width).toBeLessThanOrEqual(190);
    expect(geometry.height).toBeLessThanOrEqual(130);
    expect(miniMapCanvasToWorld(mapPoint, transform, geometry)).toEqual({
      x: 75,
      y: 150,
    });
  });

  it('maps minimap corners to stock corners and rejects outside clicks', () => {
    const geometry = getMiniMapGeometry(transform);

    expect(
      miniMapCanvasToWorld({ x: geometry.x, y: geometry.y }, transform, geometry)
    ).toEqual({ x: 0, y: 200 });
    expect(
      miniMapCanvasToWorld(
        { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
        transform,
        geometry
      )
    ).toEqual({ x: 300, y: 0 });
    expect(
      miniMapCanvasToWorld({ x: geometry.x - 1, y: geometry.y }, transform, geometry)
    ).toBeNull();
  });
});
