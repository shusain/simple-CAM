import { clamp } from '../../utils/geometry';
import type { MachineSettings, Point } from '../../types';
import type { BaseViewport, ViewportSize, ViewTransform } from './types';

export function buildBaseViewport(
  containerWidth: number,
  containerHeight: number,
  workWidth: number,
  workHeight: number
): BaseViewport {
  const width = Math.max(200, containerWidth || 200);
  const height = Math.max(200, containerHeight || 200);
  const safeWorkWidth = Math.max(1, workWidth || 1);
  const safeWorkHeight = Math.max(1, workHeight || 1);
  const padding = 24;

  const fitScale = Math.min(
    (width - padding * 2) / safeWorkWidth,
    (height - padding * 2) / safeWorkHeight
  );

  return {
    width,
    height,
    workWidth: safeWorkWidth,
    workHeight: safeWorkHeight,
    fitScale: Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1,
  };
}

export function clampCenter(
  center: Point,
  workWidth: number,
  workHeight: number
): Point {
  return {
    x: clamp(center.x, 0, workWidth),
    y: clamp(center.y, 0, workHeight),
  };
}

export function buildTransform(
  size: ViewportSize,
  settings: MachineSettings,
  zoom: number,
  center: Point
): ViewTransform {
  const base = buildBaseViewport(size.width, size.height, settings.workWidth, settings.workHeight);
  const scale = base.fitScale * zoom;
  const viewWidth = base.width / scale;
  const viewHeight = base.height / scale;
  const clampedCenter = clampCenter(center, base.workWidth, base.workHeight);

  return {
    ...base,
    zoom,
    scale,
    viewWidth,
    viewHeight,
    center: clampedCenter,
    left: clampedCenter.x - viewWidth / 2,
    bottom: clampedCenter.y - viewHeight / 2,
    right: clampedCenter.x + viewWidth / 2,
    top: clampedCenter.y + viewHeight / 2,
  };
}

export function worldToCanvas(point: Point, transform: ViewTransform): Point {
  return {
    x: (point.x - transform.left) * transform.scale,
    y: transform.height - (point.y - transform.bottom) * transform.scale,
  };
}

export function canvasToWorld(
  xPx: number,
  yPx: number,
  transform: ViewTransform,
  clampToWorkArea = true
): Point {
  const point = {
    x: transform.left + xPx / transform.scale,
    y: transform.bottom + (transform.height - yPx) / transform.scale,
  };

  return clampToWorkArea
    ? {
        x: clamp(point.x, 0, transform.workWidth),
        y: clamp(point.y, 0, transform.workHeight),
      }
    : point;
}
