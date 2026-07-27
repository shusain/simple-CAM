import type { Point } from '../types';

export interface LaserFillSegment {
  start: Point;
  end: Point;
}

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= 0.000001 && Math.abs(a.y - b.y) <= 0.000001;
}

function getClosedEdges(path: Point[]): Array<[Point, Point]> {
  if (!Array.isArray(path) || path.length < 3) {
    return [];
  }

  const edges: Array<[Point, Point]> = [];
  for (let index = 1; index < path.length; index += 1) {
    edges.push([path[index - 1], path[index]]);
  }
  if (!pointsEqual(path[0], path[path.length - 1])) {
    edges.push([path[path.length - 1], path[0]]);
  }
  return edges;
}

export function buildLaserFillSegments(
  contours: Point[][],
  lineInterval: number
): LaserFillSegment[] {
  const edges = contours.flatMap(getClosedEdges);
  if (edges.length === 0) {
    return [];
  }

  const yValues = edges.flatMap(([start, end]) => [start.y, end.y]);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const height = maxY - minY;
  if (!Number.isFinite(height) || height <= 0.000001) {
    return [];
  }

  const interval = Math.max(0.01, Math.abs(Number(lineInterval) || 0.1));
  const rows: number[] = [];
  if (height <= interval) {
    rows.push((minY + maxY) / 2);
  } else {
    for (let y = minY + interval / 2; y < maxY - 0.000001; y += interval) {
      rows.push(y);
    }
  }

  const segments: LaserFillSegment[] = [];
  rows.forEach((y, rowIndex) => {
    const intersections: number[] = [];

    edges.forEach(([start, end]) => {
      const crosses =
        (start.y <= y && end.y > y) ||
        (end.y <= y && start.y > y);
      if (!crosses) {
        return;
      }

      const ratio = (y - start.y) / (end.y - start.y);
      intersections.push(start.x + (end.x - start.x) * ratio);
    });

    intersections.sort((a, b) => a - b);
    for (let index = 1; index < intersections.length; index += 2) {
      const left = intersections[index - 1];
      const right = intersections[index];
      if (right - left <= 0.000001) {
        continue;
      }

      segments.push(
        rowIndex % 2 === 0
          ? { start: { x: left, y }, end: { x: right, y } }
          : { start: { x: right, y }, end: { x: left, y } }
      );
    }
  });

  return segments;
}
