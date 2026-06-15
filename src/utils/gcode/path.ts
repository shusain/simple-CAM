import type { CutSide, Point, RectBounds, Tool } from '../../types';

export function distanceBetween(a: Point, b: Point): number {
  const dx = (b.x || 0) - (a.x || 0);
  const dy = (b.y || 0) - (a.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function interpolatePoint(a: Point, b: Point, distanceValue: number): Point {
  const length = distanceBetween(a, b);
  if (length <= 0.000001) {
    return { x: a.x, y: a.y };
  }

  const ratio = clamp01(distanceValue / length);
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  };
}

export function getClosedPathLength(pathPoints: Point[]): number {
  let total = 0;
  for (let i = 1; i < pathPoints.length; i += 1) {
    total += distanceBetween(pathPoints[i - 1], pathPoints[i]);
  }
  return total;
}

export function getToolRadius(tool: Tool | null): number {
  const diameter = Number(tool?.diameter);
  if (!Number.isFinite(diameter) || diameter <= 0) {
    return 0;
  }
  return diameter / 2;
}

export function getCutSide(operation: { cutSide?: CutSide }, fallback: CutSide = 'along'): CutSide {
  return operation?.cutSide === 'inside' || operation?.cutSide === 'outside' || operation?.cutSide === 'along'
    ? operation.cutSide
    : fallback;
}

export function normalizeRectGeometry(x: number, y: number, width: number, height: number): RectBounds {
  let left = Number(x) || 0;
  let bottom = Number(y) || 0;
  let rectWidth = Number(width) || 0;
  let rectHeight = Number(height) || 0;

  if (rectWidth < 0) {
    left += rectWidth;
    rectWidth = Math.abs(rectWidth);
  }

  if (rectHeight < 0) {
    bottom += rectHeight;
    rectHeight = Math.abs(rectHeight);
  }

  return {
    x: left,
    y: bottom,
    width: rectWidth,
    height: rectHeight,
  };
}

export function clampRectCornerRadius(radius: number, width: number, height: number): number {
  const maxCorner = Math.max(0, Math.min(Math.abs(width), Math.abs(height)) / 2);
  const raw = Number(radius);
  const safe = Number.isFinite(raw) ? Math.abs(raw) : 0;
  return Math.min(safe, maxCorner);
}

function appendArc(
  path: Point[],
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number
): void {
  const count = Math.max(2, Math.floor(segments || 2));
  const span = endAngle - startAngle;
  const r = Math.abs(Number(radius) || 0);
  for (let i = 1; i <= count; i += 1) {
    const theta = startAngle + (span * i) / count;
    path.push({
      x: cx + Math.cos(theta) * r,
      y: cy + Math.sin(theta) * r,
    });
  }
}

export function pointsEqual(a: Point, b: Point, tolerance = 0.0001): boolean {
  return distanceBetween(a, b) <= tolerance;
}

function getClosedPolylinePoints(pathPoints: Point[]): Point[] | null {
  if (!Array.isArray(pathPoints) || pathPoints.length < 4) {
    return null;
  }

  const points = pointsEqual(pathPoints[0], pathPoints[pathPoints.length - 1])
    ? pathPoints.slice(0, -1)
    : [...pathPoints];

  return points.length >= 3 ? points : null;
}

function getSignedArea(points: Point[]): number {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function intersectInfiniteLines(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denominator = dax * dby - day * dbx;

  if (Math.abs(denominator) <= 0.000001) {
    return null;
  }

  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denominator;
  return {
    x: a1.x + dax * t,
    y: a1.y + day * t,
  };
}

export function offsetClosedPath(pathPoints: Point[], offsetDistance: number): Point[] | null {
  const points = getClosedPolylinePoints(pathPoints);
  if (!points || Math.abs(offsetDistance) <= 0.000001) {
    return points ? [...points, points[0]] : null;
  }

  const orientation = getSignedArea(points) >= 0 ? 1 : -1;
  const offsetPoints: Point[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const previous = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];

    const prevDx = current.x - previous.x;
    const prevDy = current.y - previous.y;
    const nextDx = next.x - current.x;
    const nextDy = next.y - current.y;
    const prevLength = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
    const nextLength = Math.sqrt(nextDx * nextDx + nextDy * nextDy);

    if (prevLength <= 0.000001 || nextLength <= 0.000001) {
      return null;
    }

    const prevLeftNormal = { x: -prevDy / prevLength, y: prevDx / prevLength };
    const nextLeftNormal = { x: -nextDy / nextLength, y: nextDx / nextLength };
    const sideSign = offsetDistance >= 0 ? 1 : -1;
    const magnitude = Math.abs(offsetDistance);
    const prevNormal = {
      x: prevLeftNormal.x * -orientation * sideSign,
      y: prevLeftNormal.y * -orientation * sideSign,
    };
    const nextNormal = {
      x: nextLeftNormal.x * -orientation * sideSign,
      y: nextLeftNormal.y * -orientation * sideSign,
    };

    const prevLineStart = { x: previous.x + prevNormal.x * magnitude, y: previous.y + prevNormal.y * magnitude };
    const prevLineEnd = { x: current.x + prevNormal.x * magnitude, y: current.y + prevNormal.y * magnitude };
    const nextLineStart = { x: current.x + nextNormal.x * magnitude, y: current.y + nextNormal.y * magnitude };
    const nextLineEnd = { x: next.x + nextNormal.x * magnitude, y: next.y + nextNormal.y * magnitude };

    const intersection = intersectInfiniteLines(prevLineStart, prevLineEnd, nextLineStart, nextLineEnd);
    if (intersection) {
      offsetPoints.push(intersection);
      continue;
    }

    const averageNormal = {
      x: prevNormal.x + nextNormal.x,
      y: prevNormal.y + nextNormal.y,
    };
    const averageLength = Math.sqrt(
      averageNormal.x * averageNormal.x + averageNormal.y * averageNormal.y
    );

    if (averageLength <= 0.000001) {
      offsetPoints.push({
        x: current.x + prevNormal.x * magnitude,
        y: current.y + prevNormal.y * magnitude,
      });
      continue;
    }

    offsetPoints.push({
      x: current.x + (averageNormal.x / averageLength) * magnitude,
      y: current.y + (averageNormal.y / averageLength) * magnitude,
    });
  }

  if (offsetPoints.length < 3) {
    return null;
  }

  return [...offsetPoints, offsetPoints[0]];
}

export function buildRoundedRectPath(rect: RectBounds, cornerRadius: number, cornerSegments: number): Point[] {
  const width = Math.max(0, rect.width || 0);
  const height = Math.max(0, rect.height || 0);
  const radius = clampRectCornerRadius(cornerRadius, width, height);

  if (width <= 0 || height <= 0) {
    return [];
  }

  if (radius <= 0.0001) {
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + width, y: rect.y },
      { x: rect.x + width, y: rect.y + height },
      { x: rect.x, y: rect.y + height },
      { x: rect.x, y: rect.y },
    ];
  }

  const x = rect.x;
  const y = rect.y;
  const r = radius;
  const path: Point[] = [{ x: x + r, y }];

  path.push({ x: x + width - r, y });
  appendArc(path, x + width - r, y + r, r, -Math.PI / 2, 0, cornerSegments);

  path.push({ x: x + width, y: y + height - r });
  appendArc(path, x + width - r, y + height - r, r, 0, Math.PI / 2, cornerSegments);

  path.push({ x: x + r, y: y + height });
  appendArc(path, x + r, y + height - r, r, Math.PI / 2, Math.PI, cornerSegments);

  path.push({ x, y: y + r });
  appendArc(path, x + r, y + r, r, Math.PI, (Math.PI * 3) / 2, cornerSegments);

  path.push({ x: x + r, y });
  return path;
}
