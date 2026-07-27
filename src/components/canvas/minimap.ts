import { clamp } from '../../utils/geometry';
import type { Point } from '../../types';
import type { ViewTransform } from './types';

export interface MiniMapGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export function getMiniMapGeometry(transform: ViewTransform): MiniMapGeometry {
  const maxWidth = 190;
  const maxHeight = 130;
  const scale = Math.min(
    maxWidth / transform.workWidth,
    maxHeight / transform.workHeight
  );
  const width = transform.workWidth * scale;
  const height = transform.workHeight * scale;

  return {
    x: transform.width - width - 14,
    y: 14,
    width,
    height,
    scale,
  };
}

export function miniMapWorldToCanvas(
  point: Point,
  transform: ViewTransform,
  geometry = getMiniMapGeometry(transform)
): Point {
  return {
    x: geometry.x + point.x * geometry.scale,
    y: geometry.y + geometry.height - point.y * geometry.scale,
  };
}

export function miniMapCanvasToWorld(
  point: Point,
  transform: ViewTransform,
  geometry = getMiniMapGeometry(transform),
  clampOutside = false
): Point | null {
  const isOutside =
    point.x < geometry.x ||
    point.x > geometry.x + geometry.width ||
    point.y < geometry.y ||
    point.y > geometry.y + geometry.height;
  if (isOutside && !clampOutside) {
    return null;
  }

  return {
    x: clamp((point.x - geometry.x) / geometry.scale, 0, transform.workWidth),
    y: clamp(
      (geometry.y + geometry.height - point.y) / geometry.scale,
      0,
      transform.workHeight
    ),
  };
}
