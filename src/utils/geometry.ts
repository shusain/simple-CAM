import type {
  CutSide,
  Operation,
  Point,
  RectBounds,
  SketchArcSegment,
  SketchOperation,
  SketchSegment,
  TransformAxis,
} from '../types';
import { isSurfaceOperation as isSurfaceOperationType } from '../types';
import { getDefaultPocketStepOver } from './pocketing';
import { sanitizeMaterialId, sanitizeToolId } from './tooling';
import { getTextOperationPathPoints } from './text';

type RawRecord = Record<string, unknown>;
type OperationBounds = { minX: number; minY: number; maxX: number; maxY: number };

export interface BoundsCenter extends Point {
  width: number;
  height: number;
}

export type SketchIntegrityIssueCode =
  | 'empty'
  | 'disconnected-subpaths'
  | 'open-gap'
  | 'zero-length-segment'
  | 'duplicate-segment';

export interface SketchIntegrityIssue {
  code: SketchIntegrityIssueCode;
  message: string;
  segmentIndexes?: number[];
  value?: number;
}

export interface SketchIntegrityReport {
  detectedClosed: boolean;
  storedClosed: boolean;
  segmentCount: number;
  subpathCount: number;
  startPoint: Point | null;
  endPoint: Point | null;
  openGap: number | null;
  zeroLengthSegmentIndexes: number[];
  duplicateSegmentIndexes: number[];
  issues: SketchIntegrityIssue[];
}

export interface DerivedSketchState {
  segments: SketchSegment[];
  closed: boolean;
  cutSide: CutSide;
  tabsEnabled: boolean;
}

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

function normalizeSurfaceFinishPattern(
  value: unknown,
  fallback: 'x' | 'y' | 'crosshatch' = 'crosshatch'
): 'x' | 'y' | 'crosshatch' {
  return value === 'x' || value === 'y' || value === 'crosshatch' ? value : fallback;
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

function rotatePoint(point: Point, pivot: Point, angleRadians: number): Point {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

function scalePoint(point: Point, pivot: Point, scaleX: number, scaleY: number): Point {
  return {
    x: pivot.x + (point.x - pivot.x) * scaleX,
    y: pivot.y + (point.y - pivot.y) * scaleY,
  };
}

function transformPoint(point: Point, pivot: Point, angleRadians: number, scaleX: number, scaleY: number): Point {
  const scaled = scalePoint(point, pivot, scaleX, scaleY);
  return angleRadians === 0 ? scaled : rotatePoint(scaled, pivot, angleRadians);
}

function circleToSketchSegments(
  operation: Extract<Operation, { type: 'circle' }>,
  circleSegments = 48
): SketchSegment[] {
  const steps = Math.max(12, Math.floor(circleSegments || 48));
  const points: Point[] = [];

  for (let index = 0; index < steps; index += 1) {
    const theta = (Math.PI * 2 * index) / steps;
    points.push({
      x: operation.x + Math.cos(theta) * operation.radius,
      y: operation.y + Math.sin(theta) * operation.radius,
    });
  }

  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return {
      type: 'line' as const,
      x1: point.x,
      y1: point.y,
      x2: next.x,
      y2: next.y,
    };
  });
}

function rectToSketchSegments(operation: Extract<Operation, { type: 'rect' }>): SketchSegment[] {
  const rect = normalizeRect(operation.x, operation.y, operation.width, operation.height);
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];

  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return {
      type: 'line' as const,
      x1: corner.x,
      y1: corner.y,
      x2: next.x,
      y2: next.y,
    };
  });
}

function buildSketchFromSegments(source: Operation, segments: SketchSegment[], closed: boolean): SketchOperation {
  const tabsEnabled = 'tabsEnabled' in source ? Boolean(source.tabsEnabled) && closed : false;
  const cutSide = 'cutSide' in source ? normalizeCutSideValue(source.cutSide, closed ? 'outside' : 'along') : closed ? 'outside' : 'along';
  const preserveClosedCutSide = 'closed' in source ? Boolean(source.closed) : false;
  return {
    id: source.id,
    type: 'sketch',
    depth: source.depth,
    toolId: source.toolId,
    materialId: source.materialId,
    laserProcess: source.laserProcess,
    laserPower: source.laserPower,
    laserSpeed: source.laserSpeed,
    laserPasses: source.laserPasses,
    laserLineInterval: source.laserLineInterval,
    laserOverscan: source.laserOverscan,
    segments,
    closed,
    cutSide: closed ? preserveClosedCutSide ? cutSide : cutSide === 'along' ? 'outside' : cutSide : 'along',
    tabsEnabled,
    tabCount: 'tabCount' in source ? Math.max(1, Number(source.tabCount) || 1) : 2,
    tabWidth: 'tabWidth' in source ? Math.max(0.1, Number(source.tabWidth) || 1) : 1,
    tabHeight: 'tabHeight' in source ? Math.max(0.1, Number(source.tabHeight) || 1) : 1,
    pocketEnabled: 'pocketEnabled' in source ? Boolean(source.pocketEnabled) && closed : false,
    pocketStepOver:
      'pocketStepOver' in source
        ? toOptionalPositiveNumber(source.pocketStepOver) ?? getDefaultPocketStepOver()
        : getDefaultPocketStepOver(),
  };
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

export function getSketchStartPoint(operation: Operation | RawRecord | null | undefined): Point | null {
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

function reverseSketchSegment(segment: SketchSegment): SketchSegment {
  if (segment.type === 'arc') {
    return {
      type: 'arc',
      x1: segment.x2,
      y1: segment.y2,
      x2: segment.x1,
      y2: segment.y1,
      throughX: segment.throughX,
      throughY: segment.throughY,
    };
  }

  return {
    type: 'line',
    x1: segment.x2,
    y1: segment.y2,
    x2: segment.x1,
    y2: segment.y1,
  };
}

function getOrCreateSketchNodeId(nodes: Point[], point: Point): number {
  const existingIndex = nodes.findIndex((node) => pointsEqual(node, point));
  if (existingIndex >= 0) {
    return existingIndex;
  }

  nodes.push({ ...point });
  return nodes.length - 1;
}

function buildOrderedSketchSegments(segments: SketchSegment[]): SketchSegment[][] {
  if (segments.length === 0) {
    return [];
  }

  const nodes: Point[] = [];
  const edges = segments.map((segment, index) => {
    const start = { x: segment.x1, y: segment.y1 };
    const end = { x: segment.x2, y: segment.y2 };
    return {
      index,
      segment,
      startNode: getOrCreateSketchNodeId(nodes, start),
      endNode: getOrCreateSketchNodeId(nodes, end),
    };
  });

  const adjacency = new Map<number, number[]>();
  edges.forEach((edge, edgeIndex) => {
    adjacency.set(edge.startNode, [...(adjacency.get(edge.startNode) || []), edgeIndex]);
    adjacency.set(edge.endNode, [...(adjacency.get(edge.endNode) || []), edgeIndex]);
  });

  const unusedEdges = new Set(edges.map((_, index) => index));
  const orderedGroups: SketchSegment[][] = [];

  while (unusedEdges.size > 0) {
    const seedEdgeIndex = unusedEdges.values().next().value as number;
    const componentNodes = new Set<number>();
    const componentEdges = new Set<number>();
    const pendingNodes = [edges[seedEdgeIndex].startNode, edges[seedEdgeIndex].endNode];

    while (pendingNodes.length > 0) {
      const nodeId = pendingNodes.pop();
      if (nodeId === undefined || componentNodes.has(nodeId)) {
        continue;
      }
      componentNodes.add(nodeId);
      (adjacency.get(nodeId) || []).forEach((edgeIndex) => {
        if (!unusedEdges.has(edgeIndex) || componentEdges.has(edgeIndex)) {
          return;
        }
        componentEdges.add(edgeIndex);
        pendingNodes.push(edges[edgeIndex].startNode, edges[edgeIndex].endNode);
      });
    }

    while (true) {
      const remainingComponentEdges = [...componentEdges].filter((edgeIndex) => unusedEdges.has(edgeIndex));
      if (remainingComponentEdges.length === 0) {
        break;
      }

      const degreeMap = new Map<number, number>();
      remainingComponentEdges.forEach((edgeIndex) => {
        const edge = edges[edgeIndex];
        degreeMap.set(edge.startNode, (degreeMap.get(edge.startNode) || 0) + 1);
        degreeMap.set(edge.endNode, (degreeMap.get(edge.endNode) || 0) + 1);
      });

      const oddNode = [...degreeMap.entries()].find(([, degree]) => degree % 2 === 1)?.[0];
      const seedEdge = edges[remainingComponentEdges[0]];
      let currentNode = oddNode ?? seedEdge.startNode;
      const orderedSegments: SketchSegment[] = [];

      while (true) {
        const nextEdgeIndex = (adjacency.get(currentNode) || []).find(
          (edgeIndex) => componentEdges.has(edgeIndex) && unusedEdges.has(edgeIndex)
        );
        if (nextEdgeIndex === undefined) {
          break;
        }

        unusedEdges.delete(nextEdgeIndex);
        const edge = edges[nextEdgeIndex];
        if (edge.startNode === currentNode) {
          orderedSegments.push(edge.segment);
          currentNode = edge.endNode;
        } else {
          orderedSegments.push(reverseSketchSegment(edge.segment));
          currentNode = edge.startNode;
        }
      }

      if (orderedSegments.length > 0) {
        orderedGroups.push(orderedSegments);
      } else {
        break;
      }
    }
  }

  return orderedGroups;
}

export function getSketchSubpaths(operation: Operation | RawRecord | null | undefined, circleSegments = 48): Point[][] {
  const segments = getSketchSegments(operation);
  if (segments.length === 0) {
    return [];
  }

  const orderedGroups = buildOrderedSketchSegments(segments);
  const subpaths = orderedGroups.map((orderedSegments) => {
    const path: Point[] = [];

    orderedSegments.forEach((segment, index) => {
      const segmentStart = { x: segment.x1, y: segment.y1 };
      const segmentEnd = { x: segment.x2, y: segment.y2 };

      if (index === 0) {
        path.push({ ...segmentStart });
      }

      if (segment.type === 'line') {
        path.push(segmentEnd);
        return;
      }

      const points = flattenArcSegment(segmentStart, segment, circleSegments);
      points.forEach((point) => path.push(point));
    });

    return path;
  });

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

function normalizedSegmentKey(segment: SketchSegment): string {
  if (segment.type === 'arc') {
    return [
      segment.type,
      segment.x1.toFixed(4),
      segment.y1.toFixed(4),
      segment.x2.toFixed(4),
      segment.y2.toFixed(4),
      segment.throughX.toFixed(4),
      segment.throughY.toFixed(4),
    ].join(':');
  }

  return [
    segment.type,
    segment.x1.toFixed(4),
    segment.y1.toFixed(4),
    segment.x2.toFixed(4),
    segment.y2.toFixed(4),
  ].join(':');
}

export function analyzeSketchIntegrity(operation: Operation | RawRecord | null | undefined): SketchIntegrityReport {
  const storedClosed = Boolean(operation?.type === 'sketch' && operation.closed);
  const segments = getSketchSegments(operation);
  const subpaths = getSketchSubpaths(operation);
  const primaryPath = subpaths[0] || [];
  const startPoint = primaryPath[0] || getSketchStartPoint(operation);
  const endPoint = primaryPath.length > 0 ? primaryPath[primaryPath.length - 1] : null;
  const detectedClosed = isClosedSketchPath(operation);
  const openGap =
    startPoint && endPoint && !detectedClosed
      ? distance(startPoint, endPoint)
      : detectedClosed
        ? 0
        : null;

  const zeroLengthSegmentIndexes = segments
    .map((segment, index) =>
      distance({ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }) <= 0.0001 ? index : -1
    )
    .filter((index) => index >= 0);

  const duplicateSegmentIndexes: number[] = [];
  const seenSegmentIndexes = new Map<string, number>();
  segments.forEach((segment, index) => {
    const key = normalizedSegmentKey(segment);
    const firstIndex = seenSegmentIndexes.get(key);
    if (typeof firstIndex === 'number') {
      duplicateSegmentIndexes.push(index);
      return;
    }
    seenSegmentIndexes.set(key, index);
  });

  const issues: SketchIntegrityIssue[] = [];
  if (segments.length === 0) {
    issues.push({
      code: 'empty',
      message: 'Sketch has no segments.',
    });
  }

  if (subpaths.length > 1) {
    issues.push({
      code: 'disconnected-subpaths',
      message: `Sketch is split into ${subpaths.length} disconnected subpaths.`,
      value: subpaths.length,
    });
  }

  if (!detectedClosed && openGap !== null && openGap > 0.0001) {
    issues.push({
      code: 'open-gap',
      message: `Sketch start and end are ${openGap.toFixed(3)} mm apart.`,
      value: openGap,
    });
  }

  if (zeroLengthSegmentIndexes.length > 0) {
    issues.push({
      code: 'zero-length-segment',
      message: `Sketch has ${zeroLengthSegmentIndexes.length} zero-length segment(s).`,
      segmentIndexes: zeroLengthSegmentIndexes,
      value: zeroLengthSegmentIndexes.length,
    });
  }

  if (duplicateSegmentIndexes.length > 0) {
    issues.push({
      code: 'duplicate-segment',
      message: `Sketch has ${duplicateSegmentIndexes.length} duplicate segment(s).`,
      segmentIndexes: duplicateSegmentIndexes,
      value: duplicateSegmentIndexes.length,
    });
  }

  return {
    detectedClosed,
    storedClosed,
    segmentCount: segments.length,
    subpathCount: subpaths.length,
    startPoint,
    endPoint,
    openGap,
    zeroLengthSegmentIndexes,
    duplicateSegmentIndexes,
    issues,
  };
}

export function deriveSketchState(
  operation: SketchOperation,
  segments: SketchSegment[] = getSketchSegments(operation)
): DerivedSketchState {
  const nextOperation: SketchOperation = {
    ...operation,
    segments,
  };
  const closed = isClosedSketchPath(nextOperation);
  const currentCutSide = operation.cutSide;
  const wasClosed = Boolean(operation.closed);
  const cutSide: CutSide = closed
    ? currentCutSide === 'inside' || currentCutSide === 'outside'
      ? currentCutSide
      : wasClosed
        ? 'along'
        : 'outside'
    : 'along';

  return {
    segments,
    closed,
    cutSide,
    tabsEnabled: closed ? Boolean(operation.tabsEnabled) : false,
  };
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

  if (isSurfaceOperationType(operation)) {
    return null;
  }

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

  if (operation.type === 'text') {
    const points = getTextOperationPathPoints(operation).flat();
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

export function getOperationsCenter(operations: Operation[]): BoundsCenter | null {
  const bounds = operations
    .map((operation) => getOperationBounds(operation))
    .filter((bound): bound is OperationBounds => Boolean(bound));

  if (bounds.length === 0) {
    return null;
  }

  const merged = bounds.reduce<OperationBounds>(
    (acc, bound) => ({
      minX: Math.min(acc.minX, bound.minX),
      minY: Math.min(acc.minY, bound.minY),
      maxX: Math.max(acc.maxX, bound.maxX),
      maxY: Math.max(acc.maxY, bound.maxY),
    }),
    bounds[0]
  );

  return {
    x: (merged.minX + merged.maxX) / 2,
    y: (merged.minY + merged.maxY) / 2,
    width: merged.maxX - merged.minX,
    height: merged.maxY - merged.minY,
  };
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

  if (isSurfaceOperationType(operation)) {
    return false;
  }

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

  if (operation.type === 'text') {
    return getTextOperationPathPoints(operation).some((path) =>
      path.some((_, index) => index > 0 && pointToSegmentDistance(point, path[index - 1], path[index]) <= tolerance)
    );
  }

  return getSketchSubpaths(operation).some((path) =>
    path.some((_, index) => index > 0 && pointToSegmentDistance(point, path[index - 1], path[index]) <= tolerance)
  );
}

export function moveOperation(operation: Operation | null | undefined, dx: number, dy: number): Operation | null | undefined {
  if (!operation) return operation;

  if (isSurfaceOperationType(operation)) {
    return operation;
  }

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

  if (operation.type === 'text') {
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

export function rotateOperation(
  operation: Operation | null | undefined,
  angleRadians: number,
  pivot: Point
): Operation | null | undefined {
  if (!operation || Math.abs(angleRadians) <= 0.0000001) {
    return operation;
  }

  if (isSurfaceOperationType(operation)) {
    return operation;
  }

  if (operation.type === 'drill') {
    return { ...operation, ...rotatePoint({ x: operation.x, y: operation.y }, pivot, angleRadians) };
  }

  if (operation.type === 'line') {
    const start = rotatePoint({ x: operation.x1, y: operation.y1 }, pivot, angleRadians);
    const end = rotatePoint({ x: operation.x2, y: operation.y2 }, pivot, angleRadians);
    return {
      ...operation,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
  }

  if (operation.type === 'circle') {
    const center = rotatePoint({ x: operation.x, y: operation.y }, pivot, angleRadians);
    return {
      ...operation,
      x: center.x,
      y: center.y,
    };
  }

  if (operation.type === 'text') {
    const anchor = rotatePoint({ x: operation.x, y: operation.y }, pivot, angleRadians);
    return {
      ...operation,
      x: anchor.x,
      y: anchor.y,
      rotation: (operation.rotation || 0) + angleRadians,
    };
  }

  if (operation.type === 'rect') {
    const segments = rectToSketchSegments(operation).map((segment) => ({
      type: 'line' as const,
      ...(() => {
        const start = rotatePoint({ x: segment.x1, y: segment.y1 }, pivot, angleRadians);
        const end = rotatePoint({ x: segment.x2, y: segment.y2 }, pivot, angleRadians);
        return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
      })(),
    }));
    const sketch = buildSketchFromSegments(operation, segments, true);
    return {
      ...sketch,
      ...deriveSketchState(sketch, segments),
    };
  }

  const segments = getSketchSegments(operation).map((segment) => {
    const start = rotatePoint({ x: segment.x1, y: segment.y1 }, pivot, angleRadians);
    const end = rotatePoint({ x: segment.x2, y: segment.y2 }, pivot, angleRadians);
    if (segment.type === 'arc') {
      const through = rotatePoint({ x: segment.throughX, y: segment.throughY }, pivot, angleRadians);
      return {
        ...segment,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        throughX: through.x,
        throughY: through.y,
      };
    }

    return {
      ...segment,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
  });

  return {
    ...operation,
    ...deriveSketchState(operation, segments),
  };
}

export function scaleOperation(
  operation: Operation | null | undefined,
  scaleX: number,
  scaleY: number,
  pivot: Point,
  circleSegments = 48
): Operation | null | undefined {
  if (!operation || (Math.abs(scaleX - 1) <= 0.0000001 && Math.abs(scaleY - 1) <= 0.0000001)) {
    return operation;
  }

  if (isSurfaceOperationType(operation)) {
    return operation;
  }

  if (operation.type === 'drill') {
    return { ...operation, ...scalePoint({ x: operation.x, y: operation.y }, pivot, scaleX, scaleY) };
  }

  if (operation.type === 'line') {
    const start = scalePoint({ x: operation.x1, y: operation.y1 }, pivot, scaleX, scaleY);
    const end = scalePoint({ x: operation.x2, y: operation.y2 }, pivot, scaleX, scaleY);
    return {
      ...operation,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
  }

  if (operation.type === 'rect') {
    const origin = scalePoint({ x: operation.x, y: operation.y }, pivot, scaleX, scaleY);
    const farCorner = scalePoint(
      { x: operation.x + operation.width, y: operation.y + operation.height },
      pivot,
      scaleX,
      scaleY
    );
    const normalized = normalizeRect(origin.x, origin.y, farCorner.x - origin.x, farCorner.y - origin.y);
    return {
      ...operation,
      x: normalized.x,
      y: normalized.y,
      width: normalized.width,
      height: normalized.height,
      cornerRadius: Math.max(0, operation.cornerRadius * Math.min(Math.abs(scaleX), Math.abs(scaleY))),
    };
  }

  if (operation.type === 'circle') {
    const center = scalePoint({ x: operation.x, y: operation.y }, pivot, scaleX, scaleY);
    if (Math.abs(Math.abs(scaleX) - Math.abs(scaleY)) <= 0.000001) {
      return {
        ...operation,
        x: center.x,
        y: center.y,
        radius: operation.radius * Math.abs(scaleX),
      };
    }

    const transformedSegments = circleToSketchSegments(operation, circleSegments).map((segment) => {
      const start = scalePoint({ x: segment.x1, y: segment.y1 }, pivot, scaleX, scaleY);
      const end = scalePoint({ x: segment.x2, y: segment.y2 }, pivot, scaleX, scaleY);
      return {
        type: 'line' as const,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      };
    });
    const sketch = buildSketchFromSegments(operation, transformedSegments, true);
    return {
      ...sketch,
      ...deriveSketchState(sketch, transformedSegments),
    };
  }

  if (operation.type === 'text') {
    const anchor = scalePoint({ x: operation.x, y: operation.y }, pivot, scaleX, scaleY);
    const nextScaleX = (operation.scaleX || 1) * scaleX;
    const nextScaleY = (operation.scaleY || 1) * scaleY;
    return {
      ...operation,
      x: anchor.x,
      y: anchor.y,
      scaleX: Math.abs(nextScaleX) <= 0.000001 ? 0.0001 : nextScaleX,
      scaleY: Math.abs(nextScaleY) <= 0.000001 ? 0.0001 : nextScaleY,
    };
  }

  const segments = getSketchSegments(operation).map((segment) => {
    const start = scalePoint({ x: segment.x1, y: segment.y1 }, pivot, scaleX, scaleY);
    const end = scalePoint({ x: segment.x2, y: segment.y2 }, pivot, scaleX, scaleY);
    if (segment.type === 'arc') {
      const through = scalePoint({ x: segment.throughX, y: segment.throughY }, pivot, scaleX, scaleY);
      return {
        ...segment,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        throughX: through.x,
        throughY: through.y,
      };
    }

    return {
      ...segment,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
  });

  return {
    ...operation,
    ...deriveSketchState(operation, segments),
  };
}

export function transformOperation(
  operation: Operation | null | undefined,
  args: {
    dx?: number;
    dy?: number;
    angleRadians?: number;
    scaleX?: number;
    scaleY?: number;
    pivot?: Point;
    circleSegments?: number;
  }
): Operation | null | undefined {
  if (!operation) {
    return operation;
  }

  let next = operation;
  const dx = args.dx || 0;
  const dy = args.dy || 0;
  const angleRadians = args.angleRadians || 0;
  const scaleX = args.scaleX ?? 1;
  const scaleY = args.scaleY ?? 1;
  const pivot = args.pivot || { x: 0, y: 0 };

  if (dx !== 0 || dy !== 0) {
    next = moveOperation(next, dx, dy) as Operation;
  }
  if (scaleX !== 1 || scaleY !== 1) {
    next = scaleOperation(next, scaleX, scaleY, pivot, args.circleSegments) as Operation;
  }
  if (angleRadians !== 0) {
    next = rotateOperation(next, angleRadians, pivot) as Operation;
  }

  return next;
}

export function constrainDeltaToAxis(delta: Point, axis: TransformAxis): Point {
  if (axis === 'x') {
    return { x: delta.x, y: 0 };
  }
  if (axis === 'y') {
    return { x: 0, y: delta.y };
  }
  return delta;
}

export function sanitizeOperation(raw: unknown): Operation | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as RawRecord;
  const laserFields = {
    laserProcess:
      data.laserProcess === 'etch' ? 'etch' as const
        : data.laserProcess === 'cut' ? 'cut' as const
          : undefined,
    laserPower: Number.isFinite(Number(data.laserPower))
      ? clamp(Number(data.laserPower), 0, 100)
      : undefined,
    laserSpeed: toOptionalPositiveNumber(data.laserSpeed),
    laserPasses: Number.isFinite(Number(data.laserPasses))
      ? Math.max(1, Math.round(Number(data.laserPasses)))
      : undefined,
    laserLineInterval: toOptionalPositiveNumber(data.laserLineInterval),
    laserOverscan: Number.isFinite(Number(data.laserOverscan))
      ? Math.max(0, Number(data.laserOverscan))
      : undefined,
  };
  const millingStrategy =
    data.millingStrategy === 'v-groove'
      ? 'v-groove' as const
      : data.millingStrategy === 'chamfer-edge'
        ? 'chamfer-edge' as const
        : 'standard' as const;
  const millingFields = {
    millingStrategy,
    millingTargetWidth: toOptionalPositiveNumber(data.millingTargetWidth),
  };

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
      ...laserFields,
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
      ...laserFields,
      ...millingFields,
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
      ...laserFields,
      ...millingFields,
      cutSide:
        millingStrategy === 'v-groove'
          ? 'along'
          : normalizeCutSideValue(data.cutSide, 'outside'),
      tabsEnabled: millingStrategy === 'standard' ? Boolean(data.tabsEnabled) : false,
      tabCount: Math.max(1, Math.round(toNumber(data.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(data.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(data.tabHeight) ?? 1,
      pocketEnabled: millingStrategy === 'standard' ? Boolean(data.pocketEnabled) : false,
      pocketStepOver: toOptionalPositiveNumber(data.pocketStepOver) ?? getDefaultPocketStepOver(),
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
      ...laserFields,
      ...millingFields,
      cutSide:
        millingStrategy === 'v-groove'
          ? 'along'
          : normalizeCutSideValue(data.cutSide, 'outside'),
      tabsEnabled: millingStrategy === 'standard' ? Boolean(data.tabsEnabled) : false,
      tabCount: Math.max(1, Math.round(toNumber(data.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(data.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(data.tabHeight) ?? 1,
      pocketEnabled: millingStrategy === 'standard' ? Boolean(data.pocketEnabled) : false,
      pocketStepOver: toOptionalPositiveNumber(data.pocketStepOver) ?? getDefaultPocketStepOver(),
    };
  }

  if (data.type === 'surface-rough') {
    const depth = toNumber(data.depth, NaN);
    if (!isFiniteNumber(depth) || typeof data.meshId !== 'string' || !data.meshId.trim()) {
      return null;
    }

    return {
      id: String(data.id ?? ''),
      type: 'surface-rough',
      meshId: data.meshId,
      depth,
      stepOver: toOptionalPositiveNumber(data.stepOver) ?? getDefaultPocketStepOver(),
      stockToLeave: Math.max(0, toNumber(data.stockToLeave, 0.25)),
      toolId: sanitizeToolId(data.toolId),
      materialId: sanitizeMaterialId(data.materialId),
      ...laserFields,
    };
  }

  if (data.type === 'surface-finish') {
    const depth = toNumber(data.depth, NaN);
    if (!isFiniteNumber(depth) || typeof data.meshId !== 'string' || !data.meshId.trim()) {
      return null;
    }

    return {
      id: String(data.id ?? ''),
      type: 'surface-finish',
      meshId: data.meshId,
      depth,
      stepOver: toOptionalPositiveNumber(data.stepOver) ?? getDefaultPocketStepOver(),
      pattern: normalizeSurfaceFinishPattern(data.pattern),
      toolId: sanitizeToolId(data.toolId),
      materialId: sanitizeMaterialId(data.materialId),
      ...laserFields,
    };
  }

  if (data.type === 'text') {
    const x = toNumber(data.x, NaN);
    const y = toNumber(data.y, NaN);
    if (![x, y].every(isFiniteNumber)) return null;

    return {
      id: String(data.id ?? ''),
      type: 'text',
      x,
      y,
      text: typeof data.text === 'string' ? data.text : 'TEXT',
      fontId: typeof data.fontId === 'string' && data.fontId.trim() ? data.fontId : 'liberation-sans',
      fontSize: Math.max(0.1, Math.abs(toNumber(data.fontSize, 12))),
      lineHeight: Math.max(0.5, toNumber(data.lineHeight, 1.2)),
      rotation: toNumber(data.rotation, 0),
      scaleX: toNumber(data.scaleX, 1),
      scaleY: toNumber(data.scaleY, 1),
      depth: toNumber(data.depth, undefined),
      toolId: sanitizeToolId(data.toolId),
      materialId: sanitizeMaterialId(data.materialId),
      ...laserFields,
      ...millingFields,
      cutSide:
        millingStrategy === 'v-groove'
          ? 'along'
          : normalizeCutSideValue(data.cutSide, 'along'),
      tabsEnabled: millingStrategy === 'standard' ? Boolean(data.tabsEnabled) : false,
      tabCount: Math.max(1, Math.round(toNumber(data.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(data.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(data.tabHeight) ?? 1,
      pocketEnabled: millingStrategy === 'standard' ? Boolean(data.pocketEnabled) : false,
      pocketStepOver: toOptionalPositiveNumber(data.pocketStepOver) ?? getDefaultPocketStepOver(),
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
      ...laserFields,
      ...millingFields,
      cutSide:
        millingStrategy === 'v-groove'
          ? 'along'
          : normalizeCutSideValue(data.cutSide, 'along'),
      tabsEnabled: millingStrategy === 'standard' ? Boolean(data.tabsEnabled) : false,
      tabCount: Math.max(1, Math.round(toNumber(data.tabCount, 2))),
      tabWidth: toOptionalPositiveNumber(data.tabWidth) ?? 1,
      tabHeight: toOptionalPositiveNumber(data.tabHeight) ?? 1,
      pocketEnabled: millingStrategy === 'standard' ? Boolean(data.pocketEnabled) : false,
      pocketStepOver: toOptionalPositiveNumber(data.pocketStepOver) ?? getDefaultPocketStepOver(),
    };
  }

  return null;
}
