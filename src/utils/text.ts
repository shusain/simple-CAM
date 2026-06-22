import LiberationSansRegular from '../assets/fonts/LiberationSans-Regular.ttf';
import LiberationSerifRegular from '../assets/fonts/LiberationSerif-Regular.ttf';
import DejaVuSansRegular from '../assets/fonts/DejaVuSans-Regular.ttf';
import type { Point, TextOperation } from '../types';

const opentype: any = require('opentype.js');

export interface TextFontOption {
  id: string;
  label: string;
  source: string;
}

export interface TextContour {
  points: Point[];
  isHole: boolean;
}

export const TEXT_FONT_OPTIONS: TextFontOption[] = [
  { id: 'liberation-sans', label: 'Liberation Sans', source: LiberationSansRegular },
  { id: 'liberation-serif', label: 'Liberation Serif', source: LiberationSerifRegular },
  { id: 'dejavu-sans', label: 'DejaVu Sans', source: DejaVuSansRegular },
];

const DEFAULT_TEXT = 'TEXT';
const DEFAULT_FONT_ID = TEXT_FONT_OPTIONS[0].id;
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_LINE_HEIGHT = 1.2;

const fontCache = new Map<string, any>();

interface PathCommand {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

function pointsNearlyEqual(a: Point, b: Point, tolerance = 0.0001): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function getFontSource(fontId: string): string {
  return TEXT_FONT_OPTIONS.find((font) => font.id === fontId)?.source || TEXT_FONT_OPTIONS[0].source;
}

function decodeDataUrl(source: string): ArrayBuffer {
  const base64 = source.split(',')[1] || '';
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(base64, 'base64');
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function loadFontArrayBuffer(source: string): ArrayBuffer {
  if (source.startsWith('data:')) {
    return decodeDataUrl(source);
  }

  const nodeRequire = new Function(
    'try { return typeof require !== "undefined" ? require : null; } catch { return null; }'
  )() as NodeRequire | null;
  if (!nodeRequire) {
    throw new Error('Font asset could not be loaded in this environment.');
  }

  const fs = nodeRequire('fs') as typeof import('fs');
  const path = nodeRequire('path') as typeof import('path');
  const resolved = source.startsWith('/') ? path.join(process.cwd(), source.slice(1)) : source;
  const buffer = fs.readFileSync(resolved);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function getFont(fontId: string): any {
  const resolvedId = TEXT_FONT_OPTIONS.some((font) => font.id === fontId) ? fontId : DEFAULT_FONT_ID;
  const cached = fontCache.get(resolvedId);
  if (cached) {
    return cached;
  }

  const parsed = opentype.parse(loadFontArrayBuffer(getFontSource(resolvedId)));
  fontCache.set(resolvedId, parsed);
  return parsed;
}

function sampleQuadratic(start: Point, control: Point, end: Point, segments: number): Point[] {
  const points: Point[] = [];
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const oneMinusT = 1 - t;
    points.push({
      x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x,
      y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * control.y + t * t * end.y,
    });
  }
  return points;
}

function sampleCubic(start: Point, control1: Point, control2: Point, end: Point, segments: number): Point[] {
  const points: Point[] = [];
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const oneMinusT = 1 - t;
    points.push({
      x:
        oneMinusT * oneMinusT * oneMinusT * start.x +
        3 * oneMinusT * oneMinusT * t * control1.x +
        3 * oneMinusT * t * t * control2.x +
        t * t * t * end.x,
      y:
        oneMinusT * oneMinusT * oneMinusT * start.y +
        3 * oneMinusT * oneMinusT * t * control1.y +
        3 * oneMinusT * t * t * control2.y +
        t * t * t * end.y,
    });
  }
  return points;
}

function flattenPathCommands(commands: PathCommand[], fontSize: number): Point[][] {
  const curveSegments = Math.max(8, Math.round(fontSize / 2));
  const contours: Point[][] = [];
  let current: Point[] = [];
  let cursor: Point | null = null;
  let contourStart: Point | null = null;

  commands.forEach((command) => {
    if (command.type === 'M' && typeof command.x === 'number' && typeof command.y === 'number') {
      if (current.length > 1) {
        contours.push(current);
      }
      current = [{ x: command.x, y: command.y }];
      cursor = { x: command.x, y: command.y };
      contourStart = { x: command.x, y: command.y };
      return;
    }

    if (!cursor) {
      return;
    }

    if (command.type === 'L' && typeof command.x === 'number' && typeof command.y === 'number') {
      current.push({ x: command.x, y: command.y });
      cursor = { x: command.x, y: command.y };
      return;
    }

    if (
      command.type === 'Q' &&
      typeof command.x === 'number' &&
      typeof command.y === 'number' &&
      typeof command.x1 === 'number' &&
      typeof command.y1 === 'number'
    ) {
      current.push(
        ...sampleQuadratic(cursor, { x: command.x1, y: command.y1 }, { x: command.x, y: command.y }, curveSegments)
      );
      cursor = { x: command.x, y: command.y };
      return;
    }

    if (
      command.type === 'C' &&
      typeof command.x === 'number' &&
      typeof command.y === 'number' &&
      typeof command.x1 === 'number' &&
      typeof command.y1 === 'number' &&
      typeof command.x2 === 'number' &&
      typeof command.y2 === 'number'
    ) {
      current.push(
        ...sampleCubic(
          cursor,
          { x: command.x1, y: command.y1 },
          { x: command.x2, y: command.y2 },
          { x: command.x, y: command.y },
          curveSegments
        )
      );
      cursor = { x: command.x, y: command.y };
      return;
    }

    if (command.type === 'Z' && contourStart) {
      const last = current[current.length - 1];
      if (!last || Math.hypot(last.x - contourStart.x, last.y - contourStart.y) > 0.0001) {
        current.push({ ...contourStart });
      }
      if (current.length > 1) {
        contours.push(current);
      }
      current = [];
      cursor = null;
      contourStart = null;
    }
  });

  if (current.length > 1) {
    contours.push(current);
  }

  return contours;
}

function getContourBounds(contours: Point[][]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const points = contours.flat();
  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: points[0].x, minY: points[0].y, maxX: points[0].x, maxY: points[0].y }
  );
}

function buildFallbackContours(lines: string[], fontSize: number, lineHeight: number): Point[][] {
  const glyphWidth = fontSize * 0.6;
  const glyphGap = fontSize * 0.2;

  return lines.flatMap((line, lineIndex) => {
    let cursorX = 0;
    const topY = lineIndex * fontSize * lineHeight;

    return [...line].flatMap((character) => {
      if (character === ' ') {
        cursorX += glyphWidth + glyphGap;
        return [];
      }

      const contour = [
        { x: cursorX, y: topY },
        { x: cursorX + glyphWidth, y: topY },
        { x: cursorX + glyphWidth, y: topY + fontSize },
        { x: cursorX, y: topY + fontSize },
        { x: cursorX, y: topY },
      ];
      cursorX += glyphWidth + glyphGap;
      return [contour];
    });
  });
}

function sanitizeClosedContour(points: Point[]): Point[] {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const deduped = points.reduce<Point[]>((acc, point) => {
    if (acc.length === 0 || !pointsNearlyEqual(acc[acc.length - 1], point)) {
      acc.push(point);
    }
    return acc;
  }, []);

  if (deduped.length >= 2 && pointsNearlyEqual(deduped[0], deduped[deduped.length - 1])) {
    deduped.pop();
  }

  if (deduped.length < 3) {
    return [];
  }

  return [...deduped, { ...deduped[0] }];
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 0.000001) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function contourInteriorPoint(points: Point[]): Point {
  if (points.length < 3) {
    return points[0] || { x: 0, y: 0 };
  }
  return {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  };
}

function transformPoint(point: Point, operation: TextOperation): Point {
  const scaledX = operation.x + (point.x - operation.x) * operation.scaleX;
  const scaledY = operation.y + (point.y - operation.y) * operation.scaleY;
  const dx = scaledX - operation.x;
  const dy = scaledY - operation.y;
  const cos = Math.cos(operation.rotation || 0);
  const sin = Math.sin(operation.rotation || 0);
  return {
    x: operation.x + dx * cos - dy * sin,
    y: operation.y + dx * sin + dy * cos,
  };
}

function normalizeTextValue(value: string): string {
  if (typeof value !== 'string') {
    return DEFAULT_TEXT;
  }
  return value;
}

export function createDefaultTextOperation(x: number, y: number): Omit<TextOperation, 'id'> {
  return {
    type: 'text',
    x,
    y,
    text: DEFAULT_TEXT,
    fontId: DEFAULT_FONT_ID,
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: DEFAULT_LINE_HEIGHT,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    cutSide: 'along',
    tabsEnabled: false,
    tabCount: 2,
    tabWidth: 1,
    tabHeight: 1,
    pocketEnabled: false,
    pocketStepOver: 0,
    depth: -1,
  };
}

export function getTextOperationContours(operation: TextOperation): TextContour[] {
  const fontSize = Math.max(0.1, Math.abs(Number(operation.fontSize) || DEFAULT_FONT_SIZE));
  const lineHeight = Math.max(0.5, Number(operation.lineHeight) || DEFAULT_LINE_HEIGHT);
  const lines = normalizeTextValue(operation.text).split(/\r?\n/);

  let rawContours: Point[][];
  try {
    const font = getFont(operation.fontId);
    rawContours = lines.flatMap((line, index) => {
      const baselineY = index * fontSize * lineHeight;
      const path = font.getPath(line, 0, baselineY, fontSize);
      return flattenPathCommands((path.commands || []) as PathCommand[], fontSize);
    });
  } catch {
    rawContours = buildFallbackContours(lines, fontSize, lineHeight);
  }

  const bounds = getContourBounds(rawContours);
  if (!bounds) {
    return [];
  }

  const normalizedContours = rawContours
    .map((points) =>
      sanitizeClosedContour(
        points.map((point) => ({
          x: point.x - bounds.minX + operation.x,
          y: bounds.maxY - point.y + operation.y,
        }))
      )
    )
    .filter((points) => points.length >= 4);

  const holeFlags = normalizedContours.map((points, index) => {
    const sample = contourInteriorPoint(points);
    let depth = 0;
    normalizedContours.forEach((other, otherIndex) => {
      if (otherIndex === index) {
        return;
      }
      if (pointInPolygon(sample, other)) {
        depth += 1;
      }
    });
    return depth % 2 === 1;
  });

  return normalizedContours.map((points, index) => ({
    points: points.map((point) => transformPoint(point, operation)),
    isHole: holeFlags[index],
  }));
}

export function getTextOperationPathPoints(operation: TextOperation): Point[][] {
  return getTextOperationContours(operation).map((contour) => contour.points);
}
