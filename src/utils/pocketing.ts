import type { Point, RectBounds } from '../types';
import { buildRoundedRectPath, clampRectCornerRadius, offsetClosedPath, pointsEqual } from './gcode/path';

function pathsEquivalent(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((point, index) => pointsEqual(point, b[index]));
}

function getPathArea(path: Point[]): number {
  if (!Array.isArray(path) || path.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isPointOnSegment(point: Point, start: Point, end: Point, tolerance = 0.0001): boolean {
  const minX = Math.min(start.x, end.x) - tolerance;
  const maxX = Math.max(start.x, end.x) + tolerance;
  const minY = Math.min(start.y, end.y) - tolerance;
  const maxY = Math.max(start.y, end.y) + tolerance;

  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
    return false;
  }

  return Math.abs(cross(start, end, point)) <= tolerance;
}

function isPointInsideOrOnPath(path: Point[], point: Point): boolean {
  if (!Array.isArray(path) || path.length < 4) {
    return false;
  }

  for (let index = 1; index < path.length; index += 1) {
    if (isPointOnSegment(point, path[index - 1], path[index])) {
      return true;
    }
  }

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i, i += 1) {
    const a = path[i];
    const b = path[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 0.0000001) + a.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function getDefaultPocketStepOver(toolDiameter?: number): number {
  const diameter = Number(toolDiameter);
  return Math.max(0.1, (Number.isFinite(diameter) && diameter > 0 ? diameter : 1) * 0.5);
}

function isValidInwardPocketPath(basePath: Point[], currentPath: Point[], nextPath: Point[]): boolean {
  const tolerance = 0.0001;
  const currentArea = getPathArea(currentPath);
  const nextArea = getPathArea(nextPath);
  if (currentArea <= tolerance || nextArea <= tolerance || nextArea >= currentArea - tolerance) {
    return false;
  }

  for (let index = 1; index < nextPath.length; index += 1) {
    const start = nextPath[index - 1];
    const end = nextPath[index];
    const midpoint = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };

    if (!isPointInsideOrOnPath(basePath, start) || !isPointInsideOrOnPath(basePath, midpoint)) {
      return false;
    }
  }

  return true;
}

function findNextPocketPath(
  basePath: Point[],
  currentPath: Point[],
  preferredStepOver: number,
  allowCleanupStep = true
): { path: Point[]; stepUsed: number } | null {
  const exactStepPath = offsetClosedPath(currentPath, -preferredStepOver);
  if (
    exactStepPath &&
    exactStepPath.length >= 4 &&
    !pathsEquivalent(currentPath, exactStepPath) &&
    isValidInwardPocketPath(basePath, currentPath, exactStepPath)
  ) {
    return { path: exactStepPath, stepUsed: preferredStepOver };
  }

  if (!allowCleanupStep) {
    return null;
  }

  let low = 0.001;
  let high = preferredStepOver;
  let best: { path: Point[]; stepUsed: number } | null = null;

  for (let index = 0; index < 12; index += 1) {
    const candidateStepOver = (low + high) / 2;
    const nextPath = offsetClosedPath(currentPath, -candidateStepOver);
    const isValid =
      nextPath &&
      nextPath.length >= 4 &&
      !pathsEquivalent(currentPath, nextPath) &&
      isValidInwardPocketPath(basePath, currentPath, nextPath);

    if (isValid && nextPath) {
      best = { path: nextPath, stepUsed: candidateStepOver };
      low = candidateStepOver;
    } else {
      high = candidateStepOver;
    }
  }

  return best;
}

export function buildPocketContourPaths(basePath: Point[], stepOver: number): Point[][] {
  if (!Array.isArray(basePath) || basePath.length < 4) {
    return [];
  }

  const safeStepOver = Math.abs(Number(stepOver) || 0);
  if (safeStepOver <= 0.0001) {
    return [basePath];
  }

  const paths: Point[][] = [basePath];
  let currentPath = basePath;
  let usedCleanupStep = false;

  for (let index = 0; index < 500; index += 1) {
    const nextPath = findNextPocketPath(basePath, currentPath, safeStepOver, !usedCleanupStep);
    if (!nextPath) {
      break;
    }

    paths.push(nextPath.path);
    currentPath = nextPath.path;

    if (nextPath.stepUsed < safeStepOver - 0.0001) {
      usedCleanupStep = true;
      break;
    }
  }

  return paths;
}

export function buildRectPocketContourPaths(
  rect: RectBounds,
  cornerRadius: number,
  stepOver: number,
  cornerSegments: number
): Point[][] {
  const safeStepOver = Math.abs(Number(stepOver) || 0);
  if (safeStepOver <= 0.0001) {
    return [buildRoundedRectPath(rect, cornerRadius, cornerSegments)];
  }

  const paths: Point[][] = [];
  let currentRect: RectBounds = { ...rect };
  let currentCornerRadius = clampRectCornerRadius(cornerRadius, currentRect.width, currentRect.height);

  for (let index = 0; index < 500; index += 1) {
    if (currentRect.width <= 0.0001 || currentRect.height <= 0.0001) {
      break;
    }

    const path = buildRoundedRectPath(currentRect, currentCornerRadius, cornerSegments);
    if (path.length < 4) {
      break;
    }

    paths.push(path);

    currentRect = {
      x: currentRect.x + safeStepOver,
      y: currentRect.y + safeStepOver,
      width: currentRect.width - safeStepOver * 2,
      height: currentRect.height - safeStepOver * 2,
    };
    currentCornerRadius = clampRectCornerRadius(
      Math.max(0, currentCornerRadius - safeStepOver),
      currentRect.width,
      currentRect.height
    );
  }

  return paths;
}
