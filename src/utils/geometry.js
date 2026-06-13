function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sanitizeToolId(value) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

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
    };
  }

  return null;
}

