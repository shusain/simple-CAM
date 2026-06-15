import type {
  CutSide,
  Operation,
  Point,
  RectBounds,
  SketchArcSegment,
  SketchOperation,
  SketchSegment,
} from '../types';
import { sanitizeMaterialId, sanitizeToolId } from './tooling';

type RawRecord = Record<string, unknown>;
type OperationBounds = { minX: number; minY: number; maxX: number; maxY: number };

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toOptionalPositiveNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function normalizeCutSideValue(value: unknown, fallback: CutSide = 'along'): CutSide {
  return value === 'inside' || value === 'outside' || value === 'along' ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeRect(x: number, y: number, width: number, height: number): RectBounds {
  let left = x;
  let top = y;
  let rectWidth = width;
  let rectHeight = height;

  if (rectWidth < 0) {
    left += rectWidth;
    rectWidth = Math.abs(rectWidth);
  }

  if (rectHeight < 0) {
    top += rectHeight;
    rectHeight = Math.abs(rectHeight);
  }

  return {
    x: left,
    y: top,
    width: rectWidth,
    height: rectHeight,
  };
}

export function snapValue(value: number, step: number): number {
  if (!step || step <= 0) {
    return value;
  }

  return Math.round(value / step) * step;
}

export function snapPoint(point: Point | null, snapEnabled: boolean, gridSize: number): Point | null {
  if (!point) return point;

  if (!snapEnabled || !gridSize || gridSize <= 0) {
    return point;
  }

  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeAngle(angle: number): number {
  const full = Math.PI * 2;
  let value = angle % full;
  if (value < 0) {
    value += full;
  }
  return value;
}

function pointsEqual(a: Point, b: Point, tolerance = 0.0001): boolean {
  return distance(a, b) <= tolerance;
}

function normalizeSketchPoint(point: Partial<Point> | null | undefined): Point | null {
  const x = toNumber(point?.x, NaN);
  const y = toNumber(point?.y, NaN);
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    return null;
  }
  return { x, y };
}

function normalizeLegacySketch(operation: RawRecord): { segments: SketchSegment[] } | null {
  const points = Array.isArray(operation.points)
    ? operation.points.map((point) => normalizeSketchPoint(point as Partial<Point>)).filter((point): point is Point => Boolean(point))
    : [];

  if (points.length < 2) {
    return null;
  }

  const segments: SketchSegment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    segments.push({
      type: 'line',
      x1: points[i - 1].x,
      y1: points[i - 1].y,
      x2: points[i].x,
      y2: points[i].y,
    });
  }

  return { segments };
}

function normalizeSketchSegment(segment: unknown): SketchSegment | null {
  if (!segment || typeof segment !== 'object') {
    return null;
  }

  const data = segment as RawRecord;

  if (data.type === 'line') {
    const start = normalizeSketchPoint({ x: data.x1 as number, y: data.y1 as number });
    const end = normalizeSketchPoint({
      x: (data.x2 ?? data.x) as number,
      y: (data.y2 ?? data.y) as number,
    });
    return start && end ? { type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y } : null;
  }

  if (data.type === 'arc') {
    const start = normalizeSketchPoint({ x: data.x1 as number, y: data.y1 as number });
    const end = normalizeSketchPoint({
      x: (data.x2 ?? data.x) as number,
      y: (data.y2 ?? data.y) as number,
    });
    const through = normalizeSketchPoint({ x: data.throughX as number, y: data.throughY as number });
    if (!start || !end || !through) {
      return null;
    }

    return {
      type: 'arc',
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      throughX: through.x,
      throughY: through.y,
    };
  }

  return null;
}

export function getSketchStartPoint(operation: Operation | null | undefined): Point | null {
  if (operation?.type !== 'sketch') {
    return null;
  }

  const segments = getSketchSegments(operation);
  if (segments.length > 0) {
    return { x: segments[0].x1, y: segments[0].y1 };
  }
  return null;
}

export function getSketchSegments(operation: Operation | RawRecord | null | undefined): SketchSegment[] {
  if (!operation || operation.type !== 'sketch') {
    return [];
  }

  if (Array.isArray((operation as SketchOperation).segments)) {
    return (operation as SketchOperation).segments
      .map((segment) => normalizeSketchSegment(segment))
      .filter((segment): segment is SketchSegment => Boolean(segment));
  }

  return normalizeLegacySketch(operation as RawRecord)?.segments || [];
}

function computeCircleFromThreePoints(start: Point, end: Point, through: Point): { center: Point; radius: number } | null {
  const ax = start.x;
  const ay = start.y;
  const bx = through.x;
  const by = through.y;
  const cx = end.x;
  const cy = end.y;

  const denominator = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    denominator;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    denominator;

  return {
    center: { x: ux, y: uy },
    radius: distance({ x: ux, y: uy }, start),
  };
}

function isAngleOnCounterClockwiseSweep(startAngle: number, viaAngle: number, endAngle: number): boolean {
  const start = normalizeAngle(startAngle);
  const via = normalizeAngle(viaAngle);
  const end = normalizeAngle(endAngle);
  const viaDelta = normalizeAngle(via - start);
  const endDelta = normalizeAngle(end - start);
  return viaDelta <= endDelta + 0.000001;
}

function flattenArcSegment(start: Point, segment: SketchArcSegment, circleSegments = 48): Point[] {
  const end = { x: segment.x2, y: segment.y2 };
  const through = { x: segment.throughX, y: segment.throughY };
  const circle = computeCircleFromThreePoints(start, end, through);

  if (!circle || circle.radius <= 0.000001) {
    return [end];
  }

  const startAngle = Math.atan2(start.y - circle.center.y, start.x - circle.center.x);
  const endAngle = Math.atan2(end.y - circle.center.y, end.x - circle.center.x);
  const throughAngle = Math.atan2(through.y - circle.center.y, through.x - circle.center.x);
  const counterClockwise = isAngleOnCounterClockwiseSweep(startAngle, throughAngle, endAngle);
  const rawSpan = counterClockwise
    ? normalizeAngle(endAngle - startAngle)
    : normalizeAngle(startAngle - endAngle);
  const steps = Math.max(6, Math.ceil((circleSegments * rawSpan) / (Math.PI * 2)));
  const points: Point[] = [];

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const theta = counterClockwise ? startAngle + rawSpan * t : startAngle - rawSpan * t;
    points.push({
      x: circle.center.x + Math.cos(theta) * circle.radius,
      y: circle.center.y + Math.sin(theta) * circle.radius,
    });
  }

  if (!pointsEqual(points[points.length - 1], end)) {
    points.push(end);
  }

  return points;
}

export function getSketchSubpaths(operation: Operation | RawRecord | null | undefined, circleSegments = 48): Point[][] {
  const segments = getSketchSegments(operation);
  if (segments.length === 0) {
    return [];
  }

  const subpaths: Point[][] = [];
  let currentPath: Point[] | null = null;
  let currentEnd: Point | null = null;

  segments.forEach((segment) => {
    const segmentStart = { x: segment.x1, y: segment.y1 };
    const segmentEnd = { x: segment.x2, y: segment.y2 };

    if (!currentPath || !currentEnd || !pointsEqual(currentEnd, segmentStart)) {
      currentPath = [{ ...segmentStart }];
      subpaths.push(currentPath);
    }

    if (segment.type === 'line') {
      currentPath.push(segmentEnd);
      currentEnd = segmentEnd;
      return;
    }

    const points = flattenArcSegment(segmentStart, segment, circleSegments);
    points.forEach((point) => currentPath?.push(point));
    currentEnd = segmentEnd;
  });

  if (operation?.type === 'sketch' && operation.closed && subpaths.length === 1) {
    const first = subpaths[0][0];
    const last = subpaths[0][subpaths[0].length - 1];
    if (!pointsEqual(first, last)) {
      subpaths[0].push({ ...first });
    }
  }

  return subpaths;
}

export function isClosedSketchPath(operation: Operation | RawRecord | null | undefined): boolean {
  const subpaths = getSketchSubpaths(operation);
  if (subpaths.length !== 1) {
    return false;
  }

  const path = subpaths[0];
  if (path.length < 3) {
    return false;
  }

  return pointsEqual(path[0], path[path.length - 1]);
}

export function getSketchPathPoints(operation: Operation | RawRecord | null | undefined, circleSegments = 48): Point[] {
  const subpaths = getSketchSubpaths(operation, circleSegments);
  if (subpaths.length === 0) {
    return [];
  }
  return subpaths[0];
}

export function getOperationBounds(operation: Operation | null | undefined): OperationBounds | null {
  if (!operation) return null;

  if (operation.type === 'drill') {
    return { minX: operation.x, minY: operation.y, maxX: operation.x, maxY: operation.y };
  }

  if (operation.type === 'line') {
    return {
      minX: Math.min(operation.x1, operation.x2),
      minY: Math.min(operation.y1, operation.y2),
      maxX: Math.max(operation.x1, operation.x2),
      maxY: Math.max(operation.y1, operation.y2),
    };
  }

  if (operation.type === 'rect') {
    const rect = normalizeRect(operation.x, operation.y, operation.width, operation.height);
    return {
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    };
  }

  if (operation.type === 'circle') {
    return {
      minX: operation.x - operation.radius,
      minY: operation.y - operation.radius,
      maxX: operation.x + operation.radius,
      maxY: operation.y + operation.radius,
    };
  }

  const points = getSketchSubpaths(operation).flat();
  if (points.length === 0) return null;
  return points.reduce<OperationBounds>(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: points[0].x, minY: points[0].y, maxX: points[0].x, maxY: points[0].y }
  );
}

export function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const px = point.x;
  const py = point.y;

  const abx = bx - ax;
  const aby = by - ay;
  const abLen2 = abx * abx + aby * aby;

  if (abLen2 === 0) {
    return distance(point, a);
  }

  let t = ((px - ax) * abx + (py - ay) * aby) / abLen2;
  t = clamp(t, 0, 1);

  const closest = {
    x: ax + t * abx,
    y: ay + t * aby,
  };

  return distance(point, closest);
}

function isPointInRect(point: Point, rect: RectBounds): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function hitTestOperation(operation: Operation | null | undefined, point: Point, tolerance = 2): boolean {
  if (!operation) return false;

  if (operation.type === 'drill') {
    return distance(point, { x: operation.x, y: operation.y }) <= tolerance * 1.5;
  }

  if (operation.type === 'line') {
    const a = { x: operation.x1, y: operation.y1 };
    const b = { x: operation.x2, y: operation.y2 };
    return pointToSegmentDistance(point, a, b) <= tolerance;
  }

  if (operation.type === 'rect') {
    const rect = normalizeRect(operation.x, operation.y, operation.width, operation.height);

    if (rect.width < tolerance || rect.height < tolerance) {
      return isPointInRect(point, rect);
    }

    const edges: [Point, Point][] = [
      [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }],
      [{ x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }],
      [{ x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }],
      [{ x: rect.x, y: rect.y + rect.height }, { x: rect.x, y: rect.y }],
    ];

    if (isPointInRect(point, rect)) {
      return true;
    }

    return edges.some(([a, b]) => pointToSegmentDistance(point, a, b) <= tolerance);
  }

  if (operation.type === 'circle') {
    const center = { x: operation.x, y: operation.y };
    const d = distance(point, center);
    return Math.abs(d - operation.radius) <= tolerance || d < operation.radius;
  }

  return getSketchSubpaths(operation).some((path) =>
    path.some((_, index) => index > 0 && pointToSegmentDistance(point, path[index - 1], path[index]) <= tolerance)
  );
}

export function moveOperation(operation: Operation | null | undefined, dx: number, dy: number): Operation | null | undefined {
  if (!operation) return operation;

  if (operation.type === 'drill') {
    return { ...operation, x: operation.x + dx, y: operation.y + dy };
  }

  if (operation.type === 'line') {
    return {
      ...operation,
      x1: operation.x1 + dx,
      y1: operation.y1 + dy,
      x2: operation.x2 + dx,
      y2: operation.y2 + dy,
    };
  }

  if (operation.type === 'rect') {
    return {
      ...operation,
      x: operation.x + dx,
      y: operation.y + dy,
    };
  }

  if (operation.type === 'circle') {
    return {
      ...operation,
      x: operation.x + dx,
      y: operation.y + dy,
    };
  }

  return {
    ...operation,
    segments: getSketchSegments(operation).map((segment) =>
      segment.type === 'arc'
        ? {
            ...segment,
            x1: segment.x1 + dx,
            y1: segment.y1 + dy,
            x2: segment.x2 + dx,
            y2: segment.y2 + dy,
            throughX: segment.throughX + dx,
            throughY: segment.throughY + dy,
          }
        : {
            ...segment,
            x1: segment.x1 + dx,
            y1: segment.y1 + dy,
            x2: segment.x2 + dx,
            y2: segment.y2 + dy,
          }
    ),
  };
}

export function sanitizeOperation(raw: unknown): Operation | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as RawRecord;

  if (data.type === 'drill') {
    const x = toNumber(data.x, NaN);
    const y = toNumber(data.y, NaN);
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;

    return {
      id: String(data.id ?? ''),
      type: 'drill',
      x,
      y,
      depth: toNumber(data.depth, undefined),
      toolId: sanitizeToolId(data.toolId),
      materialId: sanitizeMaterialId(data.materialId),
    };
  }

  if (data.type === 'line') {
    const x1 = toNumber(data.x1, NaN);
    const y1 = toNumber(data.y1, NaN);
    const x2 = toNumber(data.x2, NaN);
    const y2 = toNumber(data.y2, NaN);
    if (![x1, y1, x2, y2].every(isFiniteNumber)) return null;

    return {
      id: String(data.id ?? ''),
      type: 'line',
      x1,
      y1,
      x2,
      y2,
      depth: toNumber(data.depth, undefined),
      toolId: sanitizeToolId(data.toolId),
      materialId: sanitizeMaterialId(data.materialId),
    };
  }

  if (data.type === 'rect') {
    const x = toNumber(data.x, NaN);
    const y = toNumber(data.y, NaN);
    const width = toNumber(data.width, NaN);
    const height = toNumber(data.height, NaN);
    if (![x, y, width, height].every(isFiniteNumber)) return null;
    const maxCorner = Math.max(0, Math.min(Math.abs(width), Math.abs(height)) / 2);
    const cornerRadius = clamp(Math.abs(toNumber(data.cornerRadius, 0)), 0, maxCorner);

    return {
      id: String(data.id ?? ''),
      type: 'rect',
      x,
      y,
      width,
      height,
      cornerRadius,
      depth: toNumber(data.depth, undefined),
      toolId: sanitizeToolId(data.toolId),
      materialId: sanitizeMaterialId(data.materialId),
      cutSide: normalizeCutSideValue(data.cutSide, 'outside'),
      tabsEnabled: Boolean(data.tabsEnabled),
      tabCount: Math.max(1, Math.round(toNumber(data.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(data.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(data.tabHeight) ?? 1,
    };
  }

  if (data.type === 'circle') {
    const x = toNumber(data.x, NaN);
    const y = toNumber(data.y, NaN);
    const radius = toNumber(data.radius, NaN);
    if (![x, y, radius].every(isFiniteNumber)) return null;

    return {
      id: String(data.id ?? ''),
      type: 'circle',
      x,
      y,
      radius: Math.max(0.1, Math.abs(radius)),
      depth: toNumber(data.depth, undefined),
      toolId: sanitizeToolId(data.toolId),
      materialId: sanitizeMaterialId(data.materialId),
      cutSide: normalizeCutSideValue(data.cutSide, 'outside'),
      tabsEnabled: Boolean(data.tabsEnabled),
      tabCount: Math.max(1, Math.round(toNumber(data.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(data.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(data.tabHeight) ?? 1,
    };
  }

  if (data.type === 'sketch') {
    const segments = Array.isArray(data.segments)
      ? data.segments.map((segment) => normalizeSketchSegment(segment)).filter((segment): segment is SketchSegment => Boolean(segment))
      : normalizeLegacySketch(data)?.segments || [];

    if (segments.length < 1) return null;

    return {
      id: String(data.id ?? ''),
      type: 'sketch',
      segments,
      closed: Boolean(data.closed) && segments.length > 1,
      depth: toNumber(data.depth, undefined),
      toolId: sanitizeToolId(data.toolId),
      materialId: sanitizeMaterialId(data.materialId),
      cutSide: normalizeCutSideValue(data.cutSide, 'along'),
      tabsEnabled: Boolean(data.tabsEnabled),
      tabCount: Math.max(1, Math.round(toNumber(data.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(data.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(data.tabHeight) ?? 1,
    };
  }

  return null;
}
