import { svgPathProperties } from 'svg-path-properties';
import type { Point, SketchOperation } from '../types';
import { buildImportedSketchOperationFromPoints, type ImportOperationOptions, pointsEqual } from './importCommon';

interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface ImportPolyline {
  points: Point[];
  closed: boolean;
}

export interface ImportSvgOptions {
  circleSegments: number;
}

export type ImportSvgOperationOptions = ImportSvgOptions & ImportOperationOptions;

export interface ImportSvgResult {
  operations: SketchOperation[];
  warnings: string[];
}

const IDENTITY_MATRIX: Matrix2D = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

const PATH_SAMPLE_CAP = 720;

function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function applyMatrix(point: Point, matrix: Matrix2D): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function parseNumberList(raw: string): number[] {
  return raw
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function buildTranslateMatrix(values: number[]): Matrix2D {
  return {
    ...IDENTITY_MATRIX,
    e: values[0] ?? 0,
    f: values[1] ?? 0,
  };
}

function buildScaleMatrix(values: number[]): Matrix2D {
  const sx = values[0] ?? 1;
  const sy = values[1] ?? sx;
  return {
    a: sx,
    b: 0,
    c: 0,
    d: sy,
    e: 0,
    f: 0,
  };
}

function buildRotateMatrix(values: number[]): Matrix2D {
  const angle = ((values[0] ?? 0) * Math.PI) / 180;
  const cx = values[1] ?? 0;
  const cy = values[2] ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotation: Matrix2D = {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: 0,
    f: 0,
  };

  if (cx === 0 && cy === 0) {
    return rotation;
  }

  return multiplyMatrices(
    buildTranslateMatrix([cx, cy]),
    multiplyMatrices(rotation, buildTranslateMatrix([-cx, -cy]))
  );
}

function parseTransform(transformRaw: string | null | undefined, warnings: string[]): Matrix2D {
  if (!transformRaw || !transformRaw.trim()) {
    return IDENTITY_MATRIX;
  }

  const pattern = /([a-zA-Z]+)\(([^)]*)\)/g;
  let match: RegExpExecArray | null = pattern.exec(transformRaw);
  let matrix = IDENTITY_MATRIX;

  while (match) {
    const name = match[1].trim().toLowerCase();
    const values = parseNumberList(match[2] || '');
    let next = IDENTITY_MATRIX;

    if (name === 'translate') {
      next = buildTranslateMatrix(values);
    } else if (name === 'scale') {
      next = buildScaleMatrix(values);
    } else if (name === 'rotate') {
      next = buildRotateMatrix(values);
    } else if (name === 'matrix' && values.length === 6) {
      next = {
        a: values[0],
        b: values[1],
        c: values[2],
        d: values[3],
        e: values[4],
        f: values[5],
      };
    } else {
      warnings.push(`Unsupported SVG transform "${match[1]}" was skipped.`);
    }

    matrix = multiplyMatrices(next, matrix);
    match = pattern.exec(transformRaw);
  }

  return matrix;
}

function parsePointPairs(raw: string): Point[] {
  const values = parseNumberList(raw);
  const points: Point[] = [];

  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index], y: values[index + 1] });
  }

  return points;
}

function buildRectPolyline(element: Element): ImportPolyline | null {
  const x = Number(element.getAttribute('x') || 0);
  const y = Number(element.getAttribute('y') || 0);
  const width = Number(element.getAttribute('width') || 0);
  const height = Number(element.getAttribute('height') || 0);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width === 0 || height === 0) {
    return null;
  }

  return {
    closed: true,
    points: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
  };
}

function buildCirclePolyline(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  circleSegments: number
): ImportPolyline | null {
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) {
    return null;
  }
  if (rx <= 0 || ry <= 0) {
    return null;
  }

  const segmentCount = Math.max(12, circleSegments);
  const points: Point[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const angle = (index / segmentCount) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    });
  }

  return { points, closed: true };
}

function buildPathPolyline(pathData: string, circleSegments: number): ImportPolyline | null {
  const trimmed = pathData.trim();
  if (!trimmed) {
    return null;
  }

  const properties = new svgPathProperties(trimmed);
  const totalLength = properties.getTotalLength();

  if (!Number.isFinite(totalLength)) {
    return null;
  }

  if (totalLength === 0) {
    const point = properties.getPointAtLength(0);
    return point ? { points: [{ x: point.x, y: point.y }], closed: false } : null;
  }

  const segmentCount = Math.max(
    12,
    Math.min(PATH_SAMPLE_CAP, Math.max(circleSegments, Math.ceil(totalLength / 2)))
  );
  const points: Point[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const point = properties.getPointAtLength((totalLength * index) / segmentCount);
    points.push({ x: point.x, y: point.y });
  }

  const closed = points.length > 2 && pointsEqual(points[0], points[points.length - 1]);
  if (closed) {
    points.pop();
  }

  return { points, closed };
}

function convertElementToPolyline(
  element: Element,
  circleSegments: number,
  warnings: string[]
): ImportPolyline | null {
  const tag = element.tagName.toLowerCase();

  if (tag === 'line') {
    const x1 = Number(element.getAttribute('x1') || 0);
    const y1 = Number(element.getAttribute('y1') || 0);
    const x2 = Number(element.getAttribute('x2') || 0);
    const y2 = Number(element.getAttribute('y2') || 0);
    return { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], closed: false };
  }

  if (tag === 'polyline' || tag === 'polygon') {
    const points = parsePointPairs(element.getAttribute('points') || '');
    if (points.length < 2) {
      return null;
    }
    return { points, closed: tag === 'polygon' };
  }

  if (tag === 'rect') {
    const rx = Number(element.getAttribute('rx') || 0);
    const ry = Number(element.getAttribute('ry') || 0);
    if (rx > 0 || ry > 0) {
      warnings.push('Rounded SVG rectangles are approximated as sharp-corner rectangles in this import pass.');
    }
    return buildRectPolyline(element);
  }

  if (tag === 'circle') {
    return buildCirclePolyline(
      Number(element.getAttribute('cx') || 0),
      Number(element.getAttribute('cy') || 0),
      Number(element.getAttribute('r') || 0),
      Number(element.getAttribute('r') || 0),
      circleSegments
    );
  }

  if (tag === 'ellipse') {
    return buildCirclePolyline(
      Number(element.getAttribute('cx') || 0),
      Number(element.getAttribute('cy') || 0),
      Number(element.getAttribute('rx') || 0),
      Number(element.getAttribute('ry') || 0),
      circleSegments
    );
  }

  if (tag === 'path') {
    return buildPathPolyline(element.getAttribute('d') || '', circleSegments);
  }

  if (!['svg', 'g'].includes(tag)) {
    warnings.push(`Unsupported SVG element "${tag}" was skipped.`);
  }

  return null;
}

function collectPolylines(
  element: Element,
  inheritedMatrix: Matrix2D,
  circleSegments: number,
  warnings: string[]
): ImportPolyline[] {
  const localMatrix = multiplyMatrices(
    parseTransform(element.getAttribute('transform'), warnings),
    inheritedMatrix
  );
  const current = convertElementToPolyline(element, circleSegments, warnings);
  const polylines: ImportPolyline[] = [];

  if (current) {
    const transformedPoints = current.points.map((point) => applyMatrix(point, localMatrix));
    polylines.push({ ...current, points: transformedPoints });
  }

  Array.from(element.children).forEach((child) => {
    polylines.push(...collectPolylines(child, localMatrix, circleSegments, warnings));
  });

  return polylines;
}

function flipImportedPoints(polylines: ImportPolyline[], minY: number, maxY: number): ImportPolyline[] {
  return polylines.map((polyline) => ({
    ...polyline,
    points: polyline.points.map((point) => ({
      x: point.x,
      y: minY + maxY - point.y,
    })),
  }));
}

export function importSvgToSketchOperations(
  svgText: string,
  options: ImportSvgOperationOptions
): ImportSvgResult {
  const warnings: string[] = [];
  const parser = new DOMParser();
  const document = parser.parseFromString(svgText, 'image/svg+xml');
  const parserError = document.querySelector('parsererror');

  if (parserError) {
    return {
      operations: [],
      warnings: ['SVG parsing failed.'],
    };
  }

  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    return {
      operations: [],
      warnings: ['File did not contain a root <svg> element.'],
    };
  }

  const rawPolylines = collectPolylines(root, IDENTITY_MATRIX, options.circleSegments, warnings).filter(
    (polyline) => polyline.points.length >= 2
  );

  if (rawPolylines.length === 0) {
    return {
      operations: [],
      warnings: warnings.length > 0 ? warnings : ['No importable SVG geometry was found.'],
    };
  }

  const allPoints = rawPolylines.flatMap((polyline) => polyline.points);
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const flipped = flipImportedPoints(rawPolylines, minY, maxY);

  const operations = flipped
    .map((polyline) => buildImportedSketchOperationFromPoints(polyline.points, polyline.closed, options))
    .filter((operation): operation is SketchOperation => Boolean(operation));

  if (operations.length === 0) {
    warnings.push('Imported SVG geometry did not produce any usable sketch operations.');
  }

  return { operations, warnings };
}
