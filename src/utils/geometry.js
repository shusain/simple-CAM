function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toOptionalPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

import { sanitizeMaterialId, sanitizeToolId } from './tooling';

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeRect(x, y, width, height) {
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

export function snapValue(value, step) {
  if (!step || step <= 0) {
    return value;
  }

  return Math.round(value / step) * step;
}

export function snapPoint(point, snapEnabled, gridSize) {
  if (!point) return point;

  if (!snapEnabled || !gridSize || gridSize <= 0) {
    return point;
  }

  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeAngle(angle) {
  const full = Math.PI * 2;
  let value = angle % full;
  if (value < 0) {
    value += full;
  }
  return value;
}

function pointsEqual(a, b, tolerance = 0.0001) {
  return distance(a, b) <= tolerance;
}

function normalizeSketchPoint(point) {
  const x = toNumber(point?.x, NaN);
  const y = toNumber(point?.y, NaN);
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    return null;
  }
  return { x, y };
}

function normalizeLegacySketch(operation) {
  const points = Array.isArray(operation?.points)
    ? operation.points.map(normalizeSketchPoint).filter(Boolean)
    : [];

  if (points.length < 2) {
    return null;
  }

  return {
    start: points[0],
    segments: points.slice(1).map((point) => ({
      type: 'line',
      x: point.x,
      y: point.y,
    })),
  };
}

function normalizeSketchSegment(segment) {
  if (!segment || typeof segment !== 'object') {
    return null;
  }

  if (segment.type === 'line') {
    const end = normalizeSketchPoint(segment);
    return end ? { type: 'line', x: end.x, y: end.y } : null;
  }

  if (segment.type === 'arc') {
    const end = normalizeSketchPoint(segment);
    const through = normalizeSketchPoint({ x: segment.throughX, y: segment.throughY });
    if (!end || !through) {
      return null;
    }

    return {
      type: 'arc',
      x: end.x,
      y: end.y,
      throughX: through.x,
      throughY: through.y,
    };
  }

  return null;
}

export function getSketchStartPoint(operation) {
  if (operation?.type !== 'sketch') {
    return null;
  }

  const start = normalizeSketchPoint(operation.start);
  return start || normalizeLegacySketch(operation)?.start || null;
}

export function getSketchSegments(operation) {
  if (operation?.type !== 'sketch') {
    return [];
  }

  if (Array.isArray(operation.segments)) {
    return operation.segments.map(normalizeSketchSegment).filter(Boolean);
  }

  return normalizeLegacySketch(operation)?.segments || [];
}

function computeCircleFromThreePoints(start, end, through) {
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

function isAngleOnCounterClockwiseSweep(startAngle, viaAngle, endAngle) {
  const start = normalizeAngle(startAngle);
  const via = normalizeAngle(viaAngle);
  const end = normalizeAngle(endAngle);
  const viaDelta = normalizeAngle(via - start);
  const endDelta = normalizeAngle(end - start);
  return viaDelta <= endDelta + 0.000001;
}

function flattenArcSegment(start, segment, circleSegments = 48) {
  const end = { x: segment.x, y: segment.y };
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
  const points = [];

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

export function getSketchPathPoints(operation, circleSegments = 48) {
  const start = getSketchStartPoint(operation);
  const segments = getSketchSegments(operation);
  if (!start) {
    return [];
  }
  if (segments.length === 0) {
    return [{ ...start }];
  }

  const path = [{ ...start }];
  let current = start;

  segments.forEach((segment) => {
    if (segment.type === 'line') {
      const end = { x: segment.x, y: segment.y };
      path.push(end);
      current = end;
      return;
    }

    if (segment.type === 'arc') {
      const points = flattenArcSegment(current, segment, circleSegments);
      points.forEach((point) => path.push(point));
      current = { x: segment.x, y: segment.y };
    }
  });

  if (operation?.closed && path.length > 2 && !pointsEqual(path[path.length - 1], start)) {
    path.push({ ...start });
  }

  return path;
}

export function getOperationBounds(operation) {
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

  if (operation.type === 'sketch') {
    const path = getSketchPathPoints(operation);
    if (path.length === 0) return null;
    return path.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxX: Math.max(acc.maxX, point.x),
        maxY: Math.max(acc.maxY, point.y),
      }),
      { minX: path[0].x, minY: path[0].y, maxX: path[0].x, maxY: path[0].y }
    );
  }

  return null;
}

export function pointToSegmentDistance(point, a, b) {
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

function isPointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function hitTestOperation(operation, point, tolerance = 2) {
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

    const edges = [
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

  if (operation.type === 'sketch') {
    const path = getSketchPathPoints(operation);
    for (let i = 1; i < path.length; i += 1) {
      if (pointToSegmentDistance(point, path[i - 1], path[i]) <= tolerance) {
        return true;
      }
    }
  }

  return false;
}

export function moveOperation(operation, dx, dy) {
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

  if (operation.type === 'sketch') {
    const start = getSketchStartPoint(operation);
    return {
      ...operation,
      start: start ? { x: start.x + dx, y: start.y + dy } : operation.start,
      segments: getSketchSegments(operation).map((segment) =>
        segment.type === 'arc'
          ? {
              ...segment,
              x: segment.x + dx,
              y: segment.y + dy,
              throughX: segment.throughX + dx,
              throughY: segment.throughY + dy,
            }
          : {
              ...segment,
              x: segment.x + dx,
              y: segment.y + dy,
            }
      ),
    };
  }

  return operation;
}

export function sanitizeOperation(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  if (raw.type === 'drill') {
    const x = toNumber(raw.x, NaN);
    const y = toNumber(raw.y, NaN);
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;

    return {
      id: raw.id,
      type: 'drill',
      x,
      y,
      depth: toNumber(raw.depth, undefined),
      toolId: sanitizeToolId(raw.toolId),
      materialId: sanitizeMaterialId(raw.materialId),
    };
  }

  if (raw.type === 'line') {
    const x1 = toNumber(raw.x1, NaN);
    const y1 = toNumber(raw.y1, NaN);
    const x2 = toNumber(raw.x2, NaN);
    const y2 = toNumber(raw.y2, NaN);
    if (![x1, y1, x2, y2].every(isFiniteNumber)) return null;

    return {
      id: raw.id,
      type: 'line',
      x1,
      y1,
      x2,
      y2,
      depth: toNumber(raw.depth, undefined),
      toolId: sanitizeToolId(raw.toolId),
      materialId: sanitizeMaterialId(raw.materialId),
    };
  }

  if (raw.type === 'rect') {
    const x = toNumber(raw.x, NaN);
    const y = toNumber(raw.y, NaN);
    const width = toNumber(raw.width, NaN);
    const height = toNumber(raw.height, NaN);
    if (![x, y, width, height].every(isFiniteNumber)) return null;
    const maxCorner = Math.max(0, Math.min(Math.abs(width), Math.abs(height)) / 2);
    const cornerRadius = clamp(Math.abs(toNumber(raw.cornerRadius, 0)), 0, maxCorner);

    return {
      id: raw.id,
      type: 'rect',
      x,
      y,
      width,
      height,
      cornerRadius,
      depth: toNumber(raw.depth, undefined),
      toolId: sanitizeToolId(raw.toolId),
      materialId: sanitizeMaterialId(raw.materialId),
      tabsEnabled: Boolean(raw.tabsEnabled),
      tabCount: Math.max(1, Math.round(toNumber(raw.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(raw.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(raw.tabHeight) ?? 1,
    };
  }

  if (raw.type === 'circle') {
    const x = toNumber(raw.x, NaN);
    const y = toNumber(raw.y, NaN);
    const radius = toNumber(raw.radius, NaN);
    if (![x, y, radius].every(isFiniteNumber)) return null;

    return {
      id: raw.id,
      type: 'circle',
      x,
      y,
      radius: Math.max(0.1, Math.abs(radius)),
      depth: toNumber(raw.depth, undefined),
      toolId: sanitizeToolId(raw.toolId),
      materialId: sanitizeMaterialId(raw.materialId),
      tabsEnabled: Boolean(raw.tabsEnabled),
      tabCount: Math.max(1, Math.round(toNumber(raw.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(raw.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(raw.tabHeight) ?? 1,
    };
  }

  if (raw.type === 'sketch') {
    const start = normalizeSketchPoint(raw.start) || normalizeLegacySketch(raw)?.start;
    const segments = Array.isArray(raw.segments)
      ? raw.segments.map(normalizeSketchSegment).filter(Boolean)
      : normalizeLegacySketch(raw)?.segments || [];

    if (!start || segments.length < 1) return null;

    return {
      id: raw.id,
      type: 'sketch',
      start,
      segments,
      closed: Boolean(raw.closed) && segments.length > 1,
      depth: toNumber(raw.depth, undefined),
      toolId: sanitizeToolId(raw.toolId),
      materialId: sanitizeMaterialId(raw.materialId),
      tabsEnabled: Boolean(raw.tabsEnabled),
      tabCount: Math.max(1, Math.round(toNumber(raw.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(raw.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(raw.tabHeight) ?? 1,
    };
  }

  return null;
}
