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
  viewWidth: number,
  viewHeight: number,
  workWidth: number,
  workHeight: number
): Point {
  const minX = viewWidth / 2;
  const maxX = workWidth - viewWidth / 2;
  const minY = viewHeight / 2;
  const maxY = workHeight - viewHeight / 2;

  return {
    x: minX > maxX ? workWidth / 2 : clamp(center.x, minX, maxX),
    y: minY > maxY ? workHeight / 2 : clamp(center.y, minY, maxY),
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
  const clampedCenter = clampCenter(center, viewWidth, viewHeight, base.workWidth, base.workHeight);

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

export function canvasToWorld(xPx: number, yPx: number, transform: ViewTransform): Point {
  return {
    x: clamp(transform.left + xPx / transform.scale, 0, transform.workWidth),
    y: clamp(transform.bottom + (transform.height - yPx) / transform.scale, 0, transform.workHeight),
  };
}
