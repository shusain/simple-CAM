import type { Point, SketchOperation, SketchSegment } from '../types';
import { getDefaultPocketStepOver } from './pocketing';

export type ImportCutMode = 'along' | 'inside' | 'outside' | 'pocket';

export interface ImportOperationOptions {
  createId: () => string;
  depth: number;
  closedPathMode: ImportCutMode;
  toolId?: string;
  toolDiameter?: number;
  materialId?: string;
}

export function pointsEqual(a: Point, b: Point, tolerance = 0.001): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function buildImportedSketchOperationFromSegments(
  segments: SketchSegment[],
  closed: boolean,
  options: ImportOperationOptions
): SketchOperation | null {
  if (segments.length === 0) {
    return null;
  }

  const closedCutSide =
    options.closedPathMode === 'inside' || options.closedPathMode === 'pocket'
      ? 'inside'
      : options.closedPathMode === 'outside'
        ? 'outside'
        : 'along';

  return {
    id: options.createId(),
    type: 'sketch',
    segments,
    closed,
    cutSide: closed ? closedCutSide : 'along',
    tabsEnabled: false,
    tabCount: 2,
    tabWidth: 1,
    tabHeight: 1,
    pocketEnabled: Boolean(closed && options.closedPathMode === 'pocket'),
    pocketStepOver: getDefaultPocketStepOver(options.toolDiameter),
    depth: options.depth,
    toolId: options.toolId,
    materialId: options.materialId,
  };
}

export function buildImportedSketchOperationFromPoints(
  points: Point[],
  closed: boolean,
  options: ImportOperationOptions
): SketchOperation | null {
  const uniquePoints = points.filter((point, index, source) => {
    if (index === 0) {
      return true;
    }

    return !pointsEqual(point, source[index - 1]);
  });

  if (uniquePoints.length < 2) {
    return null;
  }

  const segments: SketchSegment[] = uniquePoints.slice(1).map((point, index) => ({
    type: 'line',
    x1: uniquePoints[index].x,
    y1: uniquePoints[index].y,
    x2: point.x,
    y2: point.y,
  }));

  if (closed && !pointsEqual(uniquePoints[0], uniquePoints[uniquePoints.length - 1])) {
    segments.push({
      type: 'line',
      x1: uniquePoints[uniquePoints.length - 1].x,
      y1: uniquePoints[uniquePoints.length - 1].y,
      x2: uniquePoints[0].x,
      y2: uniquePoints[0].y,
    });
  }

  return buildImportedSketchOperationFromSegments(segments, closed, options);
}
