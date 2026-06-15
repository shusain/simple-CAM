import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  clamp,
  distance,
  getOperationBounds,
  getSketchPathPoints,
  getSketchSubpaths,
  getSketchSegments,
  hitTestOperation,
  moveOperation,
  normalizeRect,
  snapPoint,
} from '../utils/geometry';
import type {
  CircleOperation,
  DrillOperation,
  DrawDraft,
  LineOperation,
  MachineSettings,
  Operation,
  PastePreview,
  Point,
  RectOperation,
  RectBounds,
  SelectBoxState,
  SketchArcSegment,
  SketchEditState,
  SketchHandle,
  SketchLineSegment,
  SketchOperation,
  SketchSegment,
  ZoomRequest,
} from '../types';

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 14;
const HANDLE_POINT_TOLERANCE = 0.0001;

type CanvasTool = 'select' | 'drill' | 'line' | 'sketch' | 'arc' | 'rect' | 'circle';
type SketchInsertTool = 'sketch' | 'arc';
type SketchPreviewOperation = SketchOperation;
type OperationInput =
  | Omit<DrillOperation, 'id'>
  | Omit<LineOperation, 'id'>
  | Omit<RectOperation, 'id'>
  | Omit<CircleOperation, 'id'>
  | Omit<SketchOperation, 'id'>;

interface ViewportSize {
  width: number;
  height: number;
}

interface BaseViewport extends ViewportSize {
  workWidth: number;
  workHeight: number;
  fitScale: number;
}

interface ViewState {
  zoom: number;
  center: Point;
}

interface ViewTransform extends BaseViewport {
  zoom: number;
  scale: number;
  viewWidth: number;
  viewHeight: number;
  center: Point;
  left: number;
  bottom: number;
  right: number;
  top: number;
}

interface SketchSegmentOperationItem {
  index: number;
  segment: SketchSegment;
  start: Point;
  operation: SketchPreviewOperation;
}

interface SketchArcInsertDraft {
  mode: SketchInsertTool;
  startPoint: Point;
  endPoint?: Point;
}

interface MoveSelectedOperationsArgs {
  ids: string[];
  sourceOperations: Operation[];
  dx: number;
  dy: number;
}

interface SelectOptions {
  additive?: boolean;
  toggle?: boolean;
}

interface InteractionState {
  mode: 'pan' | 'marquee' | 'drag-ops' | 'draw' | 'drag-handle' | null;
  pointerId: number | null;
  start: Point | null;
  startCenter: Point | null;
  startClient: Point | null;
  selectedIds: string[] | null;
  sourceOperations: Operation[] | null;
  additive: boolean;
  handle?: SketchHandle | null;
}

interface CamCanvasProps {
  activeTool: CanvasTool;
  settings: MachineSettings;
  operations: Operation[];
  selectedOperationIds: string[];
  onSelectOperation: (id: string | null, options?: SelectOptions) => void;
  onSetSelection: (ids: string[], options?: { additive?: boolean }) => void;
  onAddOperation: (operation: OperationInput) => string;
  onMoveOperations: (args: MoveSelectedOperationsArgs) => void;
  activeToolId: string;
  activeMaterialId: string;
  defaultDrillDepth: number;
  zoomRequest: ZoomRequest | null;
  pastePreview: PastePreview | null;
  onPlacePaste: (point: Point) => void;
  sketchEdit: SketchEditState;
  onUpdateOperation: (id: string, updates: Partial<Operation>) => void;
  onSelectSketchSegment: (segmentIndex: number | null) => void;
}

function createEmptyInteractionState(): InteractionState {
  return {
    mode: null,
    pointerId: null,
    start: null,
    startCenter: null,
    startClient: null,
    selectedIds: null,
    sourceOperations: null,
    additive: false,
    handle: null,
  };
}

function isSketchTool(tool: CanvasTool): tool is SketchInsertTool {
  return tool === 'sketch' || tool === 'arc';
}

function buildBaseViewport(
  containerWidth: number,
  containerHeight: number,
  workWidth: number,
  workHeight: number
): BaseViewport {
  const width = Math.max(200, containerWidth || 200);
  const height = Math.max(200, containerHeight || 200);
  const safeWorkWidth = Math.max(1, workWidth || 1);
  const safeWorkHeight = Math.max(1, workHeight || 1);
  const padding = 24;

  const fitScale = Math.min(
    (width - padding * 2) / safeWorkWidth,
    (height - padding * 2) / safeWorkHeight
  );

  return {
    width,
    height,
    workWidth: safeWorkWidth,
    workHeight: safeWorkHeight,
    fitScale: Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1,
  };
}

function clampCenter(
  center: Point,
  viewWidth: number,
  viewHeight: number,
  workWidth: number,
  workHeight: number
): Point {
  const minX = viewWidth / 2;
  const maxX = workWidth - viewWidth / 2;
  const minY = viewHeight / 2;
  const maxY = workHeight - viewHeight / 2;

  return {
    x: minX > maxX ? workWidth / 2 : clamp(center.x, minX, maxX),
    y: minY > maxY ? workHeight / 2 : clamp(center.y, minY, maxY),
  };
}

function buildTransform(
  size: ViewportSize,
  settings: MachineSettings,
  zoom: number,
  center: Point
): ViewTransform {
  const base = buildBaseViewport(size.width, size.height, settings.workWidth, settings.workHeight);
  const scale = base.fitScale * zoom;
  const viewWidth = base.width / scale;
  const viewHeight = base.height / scale;
  const clampedCenter = clampCenter(center, viewWidth, viewHeight, base.workWidth, base.workHeight);

  return {
    ...base,
    zoom,
    scale,
    viewWidth,
    viewHeight,
    center: clampedCenter,
    left: clampedCenter.x - viewWidth / 2,
    bottom: clampedCenter.y - viewHeight / 2,
    right: clampedCenter.x + viewWidth / 2,
    top: clampedCenter.y + viewHeight / 2,
  };
}

function worldToCanvas(point: Point, transform: ViewTransform): Point {
  return {
    x: (point.x - transform.left) * transform.scale,
    y: transform.height - (point.y - transform.bottom) * transform.scale,
  };
}

function canvasToWorld(xPx: number, yPx: number, transform: ViewTransform): Point {
  return {
    x: clamp(transform.left + xPx / transform.scale, 0, transform.workWidth),
    y: clamp(transform.bottom + (transform.height - yPx) / transform.scale, 0, transform.workHeight),
  };
}

function defocusActiveEditor() {
  if (typeof document === 'undefined') {
    return;
  }

  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return;
  }

  const tag = active.tagName.toLowerCase();
  const isEditable =
    active.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';

  if (isEditable && typeof active.blur === 'function') {
    active.blur();
  }
}

function offsetOperation(operation: Operation, dx: number, dy: number): Operation {
  return moveOperation(operation, dx, dy) as Operation;
}

function getDraftSketchCurrentPoint(draft: DrawDraft | null): Point | null {
  if (!draft || draft.type !== 'sketch') return null;
  const segments = draft.segments || [];
  if (segments.length === 0) {
    return draft.startPoint || null;
  }

  const last = segments[segments.length - 1];
  return { x: last.x2, y: last.y2 };
}

function buildDraftSketchOperation(
  draft: DrawDraft | null,
  includePreview = false
): SketchPreviewOperation | null {
  if (!draft || draft.type !== 'sketch' || !draft.startPoint) return null;

  const segments = [...(draft.segments || [])];
  const currentPoint = getDraftSketchCurrentPoint(draft);

  if (includePreview && currentPoint && draft.current) {
    if (draft.pendingArcEnd) {
      segments.push({
        type: 'arc',
        x1: currentPoint.x,
        y1: currentPoint.y,
        x2: draft.pendingArcEnd.x,
        y2: draft.pendingArcEnd.y,
        throughX: draft.current.x,
        throughY: draft.current.y,
      });
    } else if (distance(currentPoint, draft.current) > 0.05) {
      segments.push({
        type: 'line',
        x1: currentPoint.x,
        y1: currentPoint.y,
        x2: draft.current.x,
        y2: draft.current.y,
      });
    }
  }

  return {
    type: 'sketch',
    segments,
    closed: false,
    cutSide: 'along',
    tabsEnabled: false,
    tabCount: 2,
    tabWidth: 1,
    tabHeight: 1,
    id: 'draft-sketch',
    depth: 0,
  };
}

function buildStandaloneSegment(
  startPoint: Point,
  endPoint: Point,
  type: 'line' | 'arc' = 'line',
  throughPoint: Point | null = null
): SketchSegment {
  if (type === 'arc' && throughPoint) {
    return {
      type: 'arc',
      x1: startPoint.x,
      y1: startPoint.y,
      x2: endPoint.x,
      y2: endPoint.y,
      throughX: throughPoint.x,
      throughY: throughPoint.y,
    };
  }

  return {
    type: 'line',
    x1: startPoint.x,
    y1: startPoint.y,
    x2: endPoint.x,
    y2: endPoint.y,
  };
}

function getSketchSegmentOperations(operation: SketchOperation): SketchSegmentOperationItem[] {
  const segments = getSketchSegments(operation);
  if (segments.length === 0) {
    return [];
  }

  const items: SketchSegmentOperationItem[] = [];
  segments.forEach((segment, index) => {
    const segmentOperation: SketchPreviewOperation = {
      type: 'sketch',
      segments: [segment],
      closed: false,
      cutSide: 'along',
      tabsEnabled: false,
      tabCount: 2,
      tabWidth: 1,
      tabHeight: 1,
      id: `sketch-segment-${index}`,
      depth: 0,
    };
    items.push({
      index,
      segment,
      start: { x: segment.x1, y: segment.y1 },
      operation: segmentOperation,
    });
  });
  return items;
}

function getSketchHandles(operation: SketchOperation): SketchHandle[] {
  const handles: SketchHandle[] = [];

  getSketchSegments(operation).forEach((segment, index) => {
    handles.push({
      kind: 'start',
      segmentIndex: index,
      point: { x: segment.x1, y: segment.y1 },
    });
    handles.push({
      kind: 'end',
      segmentIndex: index,
      point: { x: segment.x2, y: segment.y2 },
    });
    if (segment.type === 'arc') {
      handles.push({
        kind: 'through',
        segmentIndex: index,
        point: { x: segment.throughX, y: segment.throughY },
      });
    }
  });

  return handles;
}

function getSketchHandleDisplayMap(handles: SketchHandle[], scale: number): Map<SketchHandle, Point> {
  const groups = new Map<string, Array<{ handle: SketchHandle; index: number }>>();
  const displayMap = new Map<SketchHandle, Point>();
  const ringRadiusMm = Math.max(0.8, 10 / Math.max(scale || 1, 0.0001));

  handles.forEach((handle, index) => {
    const key = `${handle.point.x.toFixed(4)}:${handle.point.y.toFixed(4)}`;
    const group = groups.get(key) || [];
    group.push({ handle, index });
    groups.set(key, group);
  });

  groups.forEach((group) => {
    if (group.length === 1) {
      displayMap.set(group[0].handle, group[0].handle.point);
      return;
    }

    group.forEach(({ handle }, index) => {
      const angle = (Math.PI * 2 * index) / group.length - Math.PI / 2;
      displayMap.set(handle, {
        x: handle.point.x + Math.cos(angle) * ringRadiusMm,
        y: handle.point.y + Math.sin(angle) * ringRadiusMm,
      });
    });
  });

  return displayMap;
}

function sketchPointsEqual(a: Point, b: Point, tolerance = HANDLE_POINT_TOLERANCE): boolean {
  return distance(a, b) <= tolerance;
}

function findSketchHandleHit(
  operation: SketchOperation,
  point: Point,
  tolerance: number,
  scale: number
): SketchHandle | null {
  const handles = getSketchHandles(operation);
  const displayMap = getSketchHandleDisplayMap(handles, scale);
  return handles.find((handle) => distance(point, displayMap.get(handle) || handle.point) <= tolerance) || null;
}

function findSketchSegmentHit(
  operation: SketchOperation,
  point: Point,
  tolerance: number
): SketchSegmentOperationItem | null {
  const items = getSketchSegmentOperations(operation);
  for (const item of items) {
    if (hitTestOperation(item.operation, point, tolerance)) {
      return item;
    }
  }
  return null;
}

function getCurrentHandlePoint(
  operation: SketchOperation | null,
  handle: SketchHandle | null | undefined
): Point | null {
  if (!handle || operation?.type !== 'sketch' || !Number.isInteger(handle.segmentIndex)) {
    return handle?.point || null;
  }

  const segments = getSketchSegments(operation);
  const segment = segments[handle.segmentIndex];
  if (!segment) {
    return handle.point || null;
  }

  if (handle.kind === 'start') {
    return { x: segment.x1, y: segment.y1 };
  }

  if (handle.kind === 'end') {
    return { x: segment.x2, y: segment.y2 };
  }

  if (handle.kind === 'through' && segment.type === 'arc') {
    return { x: segment.throughX, y: segment.throughY };
  }

  return handle.point || null;
}

function updateSketchHandle(
  operation: SketchOperation,
  handle: SketchHandle | null | undefined,
  point: Point
): SketchOperation {
  if (!handle) {
    return operation;
  }

  const sourcePoint = getCurrentHandlePoint(operation, handle);
  if (!sourcePoint) {
    return operation;
  }

  const segments = getSketchSegments(operation).map((segment, index) => {
    let nextSegment = segment;

    if (handle.kind === 'through' && index === handle.segmentIndex && segment.type === 'arc') {
      return { ...segment, throughX: point.x, throughY: point.y };
    }

    if (sketchPointsEqual({ x: segment.x1, y: segment.y1 }, sourcePoint)) {
      nextSegment = { ...nextSegment, x1: point.x, y1: point.y };
    }

    if (sketchPointsEqual({ x: segment.x2, y: segment.y2 }, sourcePoint)) {
      nextSegment = { ...nextSegment, x2: point.x, y2: point.y };
    }

    return nextSegment;
  });

  return {
    ...operation,
    segments,
  };
}

function rectsOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function drawGrid(ctx: CanvasRenderingContext2D, transform: ViewTransform, gridSize: number): void {
  const step = Math.max(0.1, gridSize || 1);
  const startX = Math.floor(transform.left / step) * step;
  const endX = Math.ceil(transform.right / step) * step;
  const startY = Math.floor(transform.bottom / step) * step;
  const endY = Math.ceil(transform.top / step) * step;

  ctx.save();
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX + 0.0001; x += step) {
    if (x < 0 || x > transform.workWidth) continue;
    const p1 = worldToCanvas({ x, y: 0 }, transform);
    const p2 = worldToCanvas({ x, y: transform.workHeight }, transform);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (let y = startY; y <= endY + 0.0001; y += step) {
    if (y < 0 || y > transform.workHeight) continue;
    const p1 = worldToCanvas({ x: 0, y }, transform);
    const p2 = worldToCanvas({ x: transform.workWidth, y }, transform);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  ctx.restore();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius || 0, w / 2, h / 2));

  if (w <= 0 || h <= 0) return;

  if (r <= 0.001) {
    ctx.strokeRect(x, y, w, h);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.stroke();
}

function drawOperation(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  operation: Operation,
  options: { selected?: boolean; ghost?: boolean } = {}
): void {
  const { selected = false, ghost = false } = options;
  const color = ghost ? '#38bdf8' : selected ? '#f97316' : '#22c55e';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = selected ? 2.6 : 1.6;
  if (ghost) {
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([5, 4]);
  }

  if (operation.type === 'drill') {
    const p = worldToCanvas({ x: operation.x, y: operation.y }, transform);
    const size = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - size, p.y);
    ctx.lineTo(p.x + size, p.y);
    ctx.moveTo(p.x, p.y - size);
    ctx.lineTo(p.x, p.y + size);
    ctx.stroke();
  }

  if (operation.type === 'line') {
    const a = worldToCanvas({ x: operation.x1, y: operation.y1 }, transform);
    const b = worldToCanvas({ x: operation.x2, y: operation.y2 }, transform);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  if (operation.type === 'rect') {
    const rect = normalizeRect(operation.x, operation.y, operation.width, operation.height);
    const topLeft = worldToCanvas({ x: rect.x, y: rect.y + rect.height }, transform);
    const radiusPx = Math.max(0, Number(operation.cornerRadius) || 0) * transform.scale;
    strokeRoundedRect(
      ctx,
      topLeft.x,
      topLeft.y,
      rect.width * transform.scale,
      rect.height * transform.scale,
      radiusPx
    );
  }

  if (operation.type === 'circle') {
    const center = worldToCanvas({ x: operation.x, y: operation.y }, transform);
    ctx.beginPath();
    ctx.arc(center.x, center.y, operation.radius * transform.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (operation.type === 'sketch') {
    const subpaths = getSketchSubpaths(operation);
    subpaths.forEach((path) => {
      if (path.length < 2) return;
      ctx.beginPath();
      const start = worldToCanvas(path[0], transform);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < path.length; i += 1) {
        const point = worldToCanvas(path[i], transform);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    });
  }

  ctx.restore();
}

function drawDraft(ctx: CanvasRenderingContext2D, transform: ViewTransform, draft: DrawDraft | null): void {
  if (!draft) return;

  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.4;

  if (draft.type === 'line') {
    const a = worldToCanvas(draft.start, transform);
    const b = worldToCanvas(draft.current, transform);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  if (draft.type === 'rect') {
    const rect = normalizeRect(
      draft.start.x,
      draft.start.y,
      draft.current.x - draft.start.x,
      draft.current.y - draft.start.y
    );
    const topLeft = worldToCanvas({ x: rect.x, y: rect.y + rect.height }, transform);
    strokeRoundedRect(ctx, topLeft.x, topLeft.y, rect.width * transform.scale, rect.height * transform.scale, 0);
  }

  if (draft.type === 'circle') {
    const center = worldToCanvas(draft.start, transform);
    const radiusMm = distance(draft.start, draft.current);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusMm * transform.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (draft.type === 'sketch') {
    const operation = buildDraftSketchOperation(draft, true);
    const path = operation ? getSketchPathPoints(operation) : [];
    if (path.length > 0) {
      ctx.beginPath();
      const start = worldToCanvas(path[0], transform);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < path.length; i += 1) {
        const point = worldToCanvas(path[i], transform);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();

      const draftPoints = [
        draft.startPoint,
        ...(draft.segments || []).flatMap((segment) =>
          segment.type === 'arc'
            ? [
                { x: segment.x2, y: segment.y2 },
                { x: segment.throughX, y: segment.throughY },
              ]
            : [{ x: segment.x2, y: segment.y2 }]
        ),
      ];
      draftPoints.filter(Boolean).forEach((point, index) => {
        const p = worldToCanvas(point, transform);
        ctx.beginPath();
        ctx.arc(p.x, p.y, index === 0 ? 4 : 3, 0, Math.PI * 2);
        ctx.stroke();
      });

      if (draft.pendingArcEnd) {
        const p = worldToCanvas(draft.pendingArcEnd, transform);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

function drawSketchEditOverlay(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  operation: SketchOperation | null,
  selectedSegmentIndex: number | null,
  pointerMm: Point,
  activeTool: CanvasTool,
  arcInsertDraft: SketchArcInsertDraft | null
): void {
  if (!operation) return;

  const selectedItem = Number.isInteger(selectedSegmentIndex)
    ? getSketchSegmentOperations(operation).find((item) => item.index === selectedSegmentIndex) || null
    : null;

  if (selectedItem) {
    const path = getSketchPathPoints(selectedItem.operation);
    if (path.length >= 2) {
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      const start = worldToCanvas(path[0], transform);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < path.length; i += 1) {
        const point = worldToCanvas(path[i], transform);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  const handles = getSketchHandles(operation);
  const handleDisplayMap = getSketchHandleDisplayMap(handles, transform.scale);
  ctx.save();
  handles.forEach((handle) => {
    const point = worldToCanvas(handleDisplayMap.get(handle) || handle.point, transform);
    ctx.beginPath();
    ctx.fillStyle =
      handle.kind === 'through' ? '#c084fc' : handle.kind === 'start' ? '#38bdf8' : '#f8fafc';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1.5;
    ctx.arc(point.x, point.y, handle.kind === 'start' ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  if (activeTool === 'sketch' && arcInsertDraft?.startPoint) {
    const preview = [arcInsertDraft.startPoint, pointerMm];
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    const startCanvas = worldToCanvas(preview[0], transform);
    const endCanvas = worldToCanvas(preview[1], transform);
    ctx.moveTo(startCanvas.x, startCanvas.y);
    ctx.lineTo(endCanvas.x, endCanvas.y);
    ctx.stroke();
  }

  if (activeTool === 'arc' && arcInsertDraft?.startPoint) {
    const start = arcInsertDraft.startPoint;
    if (arcInsertDraft?.endPoint) {
      const operationPreview: SketchPreviewOperation = {
        type: 'sketch',
        segments: [
          {
            type: 'arc',
            x1: start.x,
            y1: start.y,
            x2: arcInsertDraft.endPoint.x,
            y2: arcInsertDraft.endPoint.y,
            throughX: pointerMm.x,
            throughY: pointerMm.y,
          },
        ],
        closed: false,
        cutSide: 'along',
        tabsEnabled: false,
        tabCount: 2,
        tabWidth: 1,
        tabHeight: 1,
        id: 'arc-preview',
        depth: 0,
      };
      const path = getSketchPathPoints(operationPreview);
      if (path.length >= 2) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        const startCanvas = worldToCanvas(path[0], transform);
        ctx.moveTo(startCanvas.x, startCanvas.y);
        for (let i = 1; i < path.length; i += 1) {
          const point = worldToCanvas(path[i], transform);
          ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const startCanvas = worldToCanvas(start, transform);
      const endCanvas = worldToCanvas(pointerMm, transform);
      ctx.moveTo(startCanvas.x, startCanvas.y);
      ctx.lineTo(endCanvas.x, endCanvas.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  operations: Operation[]
): void {
  const maxWidth = 190;
  const maxHeight = 130;
  const scale = Math.min(maxWidth / transform.workWidth, maxHeight / transform.workHeight);
  const mapWidth = transform.workWidth * scale;
  const mapHeight = transform.workHeight * scale;
  const x = transform.width - mapWidth - 14;
  const y = 14;

  function toMap(point: Point): Point {
    return {
      x: x + point.x * scale,
      y: y + mapHeight - point.y * scale,
    };
  }

  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.fillRect(x - 8, y - 8, mapWidth + 16, mapHeight + 28);
  ctx.strokeRect(x - 8, y - 8, mapWidth + 16, mapHeight + 28);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Segoe UI';
  ctx.fillText('Minimap', x, y - 10);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, mapWidth, mapHeight);
  ctx.strokeStyle = '#475569';
  ctx.strokeRect(x, y, mapWidth, mapHeight);

  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1;

  operations.forEach((operation) => {
    if (operation.type === 'drill') {
      const p = toMap({ x: operation.x, y: operation.y });
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (operation.type === 'line') {
      const a = toMap({ x: operation.x1, y: operation.y1 });
      const b = toMap({ x: operation.x2, y: operation.y2 });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }

    if (operation.type === 'rect') {
      const rect = normalizeRect(operation.x, operation.y, operation.width, operation.height);
      const p = toMap({ x: rect.x, y: rect.y + rect.height });
      const radiusPx = Math.max(0, Number(operation.cornerRadius) || 0) * scale;
      strokeRoundedRect(ctx, p.x, p.y, rect.width * scale, rect.height * scale, radiusPx);
      return;
    }

    if (operation.type === 'circle') {
      const center = toMap({ x: operation.x, y: operation.y });
      ctx.beginPath();
      ctx.arc(center.x, center.y, operation.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (operation.type === 'sketch') {
      const subpaths = getSketchSubpaths(operation);
      subpaths.forEach((path) => {
        if (path.length < 2) return;
        ctx.beginPath();
        const start = toMap(path[0]);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < path.length; i += 1) {
          const point = toMap(path[i]);
          ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
      });
    }
  });

  const viewLeft = clamp(transform.left, 0, transform.workWidth);
  const viewRight = clamp(transform.right, 0, transform.workWidth);
  const viewBottom = clamp(transform.bottom, 0, transform.workHeight);
  const viewTop = clamp(transform.top, 0, transform.workHeight);

  const viewTopLeft = toMap({ x: viewLeft, y: viewTop });
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    viewTopLeft.x,
    viewTopLeft.y,
    Math.max(2, (viewRight - viewLeft) * scale),
    Math.max(2, (viewTop - viewBottom) * scale)
  );

  ctx.restore();
}

export default function CamCanvas({
  activeTool,
  settings,
  operations,
  selectedOperationIds,
  onSelectOperation,
  onSetSelection,
  onAddOperation,
  onMoveOperations,
  activeToolId,
  activeMaterialId,
  defaultDrillDepth,
  zoomRequest,
  pastePreview,
  onPlacePaste,
  sketchEdit,
  onUpdateOperation,
  onSelectSketchSegment,
}: CamCanvasProps): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionRef = useRef<InteractionState>(createEmptyInteractionState());
  const draftRef = useRef<DrawDraft | null>(null);

  const [size, setSize] = useState<ViewportSize>({ width: 900, height: 600 });
  const [draft, setDraft] = useState<DrawDraft | null>(null);
  const [selectBox, setSelectBox] = useState<SelectBoxState | null>(null);
  const [pointerMm, setPointerMm] = useState<Point>({ x: 0, y: 0 });
  const [sketchArcInsertDraft, setSketchArcInsertDraft] = useState<SketchArcInsertDraft | null>(null);
  const [view, setView] = useState<ViewState>({
    zoom: 1,
    center: {
      x: settings.workWidth / 2,
      y: settings.workHeight / 2,
    },
  });

  const selectedSet = useMemo(() => new Set(selectedOperationIds || []), [selectedOperationIds]);
  const editingSketchOperation = useMemo<SketchOperation | null>(
    () =>
      sketchEdit.operationId
        ? operations.find(
            (operation): operation is SketchOperation =>
              operation.id === sketchEdit.operationId && operation.type === 'sketch'
          ) || null
        : null,
    [operations, sketchEdit.operationId]
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!editingSketchOperation || !isSketchTool(activeTool)) {
      setSketchArcInsertDraft(null);
      return;
    }

    setSketchArcInsertDraft((current) => {
      if (!current || current.mode === activeTool) {
        return current;
      }
      return null;
    });
  }, [activeTool, editingSketchOperation]);

  const transform = useMemo(
    () => buildTransform(size, settings, view.zoom, view.center),
    [settings, size, view.center, view.zoom]
  );

  const pastePreviewOperations = useMemo<Operation[]>(() => {
    if (!pastePreview?.operations?.length) return [];
    const dx = pointerMm.x - pastePreview.anchor.x;
    const dy = pointerMm.y - pastePreview.anchor.y;
    return pastePreview.operations.map((operation) => offsetOperation(operation, dx, dy));
  }, [pastePreview, pointerMm.x, pointerMm.y]);

  useEffect(() => {
    if (!wrapperRef.current) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });

    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setView({
      zoom: 1,
      center: {
        x: settings.workWidth / 2,
        y: settings.workHeight / 2,
      },
    });
  }, [settings.workHeight, settings.workWidth]);

  useEffect(() => {
    if (!isSketchTool(activeTool) && draft?.type === 'sketch') {
      setDraft(null);
    }
  }, [activeTool, draft]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = transform.width;
    canvas.height = transform.height;

    ctx.clearRect(0, 0, transform.width, transform.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, transform.width, transform.height);

    drawGrid(ctx, transform, settings.gridSize);

    const borderTopLeft = worldToCanvas({ x: 0, y: settings.workHeight }, transform);
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      borderTopLeft.x,
      borderTopLeft.y,
      settings.workWidth * transform.scale,
      settings.workHeight * transform.scale
    );
    ctx.restore();

    operations.forEach((operation) => {
      drawOperation(ctx, transform, operation, { selected: selectedSet.has(operation.id) });
    });

    if (pastePreviewOperations.length > 0) {
      pastePreviewOperations.forEach((operation) => {
        drawOperation(ctx, transform, operation, { ghost: true });
      });
    }

    drawDraft(ctx, transform, draft);

    if (selectBox) {
      const rect = normalizeRect(
        selectBox.start.x,
        selectBox.start.y,
        selectBox.current.x - selectBox.start.x,
        selectBox.current.y - selectBox.start.y
      );
      const topLeft = worldToCanvas({ x: rect.x, y: rect.y + rect.height }, transform);
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(topLeft.x, topLeft.y, rect.width * transform.scale, rect.height * transform.scale);
      ctx.strokeRect(topLeft.x, topLeft.y, rect.width * transform.scale, rect.height * transform.scale);
      ctx.restore();
    }

    if (editingSketchOperation) {
      drawSketchEditOverlay(
        ctx,
        transform,
        editingSketchOperation,
        sketchEdit?.selectedSegmentIndex,
        pointerMm,
        activeTool,
        sketchArcInsertDraft
      );
    }

    drawMiniMap(ctx, transform, operations);

    const cursor = worldToCanvas(pointerMm, transform);
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(cursor.x, 0);
    ctx.lineTo(cursor.x, transform.height);
    ctx.moveTo(0, cursor.y);
    ctx.lineTo(transform.width, cursor.y);
    ctx.stroke();
    ctx.restore();
  }, [
    draft,
    operations,
    editingSketchOperation,
    pastePreviewOperations,
    pointerMm,
    selectBox,
    selectedSet,
    sketchArcInsertDraft,
    sketchEdit,
    settings.gridSize,
    settings.workHeight,
    settings.workWidth,
    transform,
  ]);

  const applyZoomAt = (factor: number, anchorPx: Point): void => {
    setView((previous) => {
      const nextZoom = clamp(previous.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const currentTransform = buildTransform(size, settings, previous.zoom, previous.center);
      const worldAtAnchor = canvasToWorld(anchorPx.x, anchorPx.y, currentTransform);
      const nextTransform = buildTransform(size, settings, nextZoom, previous.center);

      const newLeft = worldAtAnchor.x - anchorPx.x / nextTransform.scale;
      const newBottom = worldAtAnchor.y - (nextTransform.height - anchorPx.y) / nextTransform.scale;
      const targetCenter = {
        x: newLeft + nextTransform.viewWidth / 2,
        y: newBottom + nextTransform.viewHeight / 2,
      };

      return {
        zoom: nextZoom,
        center: clampCenter(
          targetCenter,
          nextTransform.viewWidth,
          nextTransform.viewHeight,
          nextTransform.workWidth,
          nextTransform.workHeight
        ),
      };
    });
  };

  useEffect(() => {
    if (!zoomRequest || !zoomRequest.token) return;

    if (zoomRequest.action === 'reset') {
      setView({
        zoom: 1,
        center: {
          x: settings.workWidth / 2,
          y: settings.workHeight / 2,
        },
      });
      return;
    }

    const anchor = { x: transform.width / 2, y: transform.height / 2 };
    if (zoomRequest.action === 'in') {
      applyZoomAt(1.2, anchor);
    }
    if (zoomRequest.action === 'out') {
      applyZoomAt(1 / 1.2, anchor);
    }
  }, [settings.workHeight, settings.workWidth, transform.height, transform.width, zoomRequest]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        interactionRef.current = createEmptyInteractionState();
        setDraft(null);
        setSelectBox(null);
        return;
      }

      if (event.key === 'Enter' && draft?.type === 'sketch') {
        event.preventDefault();
        const segments = draft.segments || [];
        if (segments.length >= 1) {
          const id = onAddOperation({
            type: 'sketch',
            segments,
            closed: false,
            cutSide: 'along',
            tabsEnabled: false,
            tabCount: 2,
            tabWidth: 1,
            tabHeight: 1,
            depth: settings.cutDepth,
            toolId: activeToolId,
            materialId: activeMaterialId,
          });
          onSelectOperation(id);
        }
        setDraft(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMaterialId, activeToolId, draft, onAddOperation, onSelectOperation, settings.cutDepth]);

  function getPointerPoint(event: React.PointerEvent<HTMLCanvasElement>, snap = true): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    const xPx = event.clientX - rect.left;
    const yPx = event.clientY - rect.top;
    const raw = canvasToWorld(xPx, yPx, transform);
    return snap ? (snapPoint(raw, settings.snapEnabled, settings.gridSize) as Point) : raw;
  }

  function startPan(event: React.PointerEvent<HTMLCanvasElement>): void {
    interactionRef.current = {
      mode: 'pan',
      pointerId: event.pointerId,
      start: null,
      startCenter: transform.center,
      startClient: { x: event.clientX, y: event.clientY },
      selectedIds: null,
      sourceOperations: null,
      additive: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startMarqueeSelection(event: React.PointerEvent<HTMLCanvasElement>, point: Point): void {
    interactionRef.current = {
      mode: 'marquee',
      pointerId: event.pointerId,
      start: point,
      startCenter: null,
      startClient: null,
      selectedIds: null,
      sourceOperations: null,
      additive: Boolean(event.shiftKey),
    };
    setSelectBox({ start: point, current: point });
    if (!event.shiftKey) {
      onSetSelection([]);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    event.preventDefault();
    defocusActiveEditor();

    if (event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey)) {
      startPan(event);
      return;
    }

    const point = getPointerPoint(event, true);
    setPointerMm(point);

    if (editingSketchOperation) {
      if (activeTool === 'select') {
        const handleToleranceMm = Math.max(1.5, 8 / transform.scale);
        const handleHit = findSketchHandleHit(editingSketchOperation, point, handleToleranceMm, transform.scale);
        if (handleHit) {
          interactionRef.current = {
            mode: 'drag-handle',
            pointerId: event.pointerId,
            start: point,
            startCenter: null,
            startClient: null,
            selectedIds: null,
            sourceOperations: null,
            additive: false,
            handle: handleHit,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }

        const segmentHit = findSketchSegmentHit(editingSketchOperation, point, Math.max(1.5, 6 / transform.scale));
        if (segmentHit) {
          onSelectSketchSegment(segmentHit.index);
          return;
        }
        onSelectSketchSegment(null);
        return;
      }

      if (activeTool === 'sketch') {
        if (!sketchArcInsertDraft?.startPoint) {
          setSketchArcInsertDraft({
            mode: 'sketch',
            startPoint: point,
          });
        } else {
          const newSegment = buildStandaloneSegment(sketchArcInsertDraft.startPoint, point, 'line');
          onUpdateOperation(editingSketchOperation.id, {
            segments: [...getSketchSegments(editingSketchOperation), newSegment],
            closed: false,
            tabsEnabled: false,
          });
          setSketchArcInsertDraft(null);
        }
        return;
      }

      if (activeTool === 'arc') {
        if (!sketchArcInsertDraft?.startPoint) {
          setSketchArcInsertDraft({
            mode: 'arc',
            startPoint: point,
          });
        } else if (!sketchArcInsertDraft?.endPoint) {
          setSketchArcInsertDraft({
            ...sketchArcInsertDraft,
            endPoint: point,
          });
        } else {
          const newSegment = buildStandaloneSegment(
            sketchArcInsertDraft.startPoint,
            sketchArcInsertDraft.endPoint,
            'arc',
            point
          );
          onUpdateOperation(editingSketchOperation.id, {
            segments: [...getSketchSegments(editingSketchOperation), newSegment],
            closed: false,
            tabsEnabled: false,
          });
          setSketchArcInsertDraft(null);
        }
        return;
      }
    }

    if (pastePreview && activeTool === 'select' && event.button === 0) {
      onPlacePaste(point);
      return;
    }

    if (activeTool === 'select') {
      const toleranceMm = Math.max(1.5, 6 / transform.scale);
      const hit = [...operations]
        .reverse()
        .find((operation) => hitTestOperation(operation, point, toleranceMm));

      if (!hit) {
        startMarqueeSelection(event, point);
        return;
      }

        if (event.shiftKey) {
          onSelectOperation(hit.id, { toggle: true, additive: true });
          interactionRef.current = createEmptyInteractionState();
          return;
        }

      const dragIds = selectedSet.has(hit.id) && (selectedOperationIds || []).length > 0
        ? selectedOperationIds
        : [hit.id];

      if (!selectedSet.has(hit.id)) {
        onSelectOperation(hit.id);
      }

      const dragIdSet = new Set(dragIds);
      const sourceOperations = operations
        .filter((operation) => dragIdSet.has(operation.id))
        .map((operation) => ({ ...operation }));

      interactionRef.current = {
        mode: 'drag-ops',
        pointerId: event.pointerId,
        start: point,
        startCenter: null,
        startClient: null,
        selectedIds: dragIds,
        sourceOperations,
        additive: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (activeTool === 'drill') {
      const id = onAddOperation({
        type: 'drill',
        x: point.x,
        y: point.y,
        depth: defaultDrillDepth,
        toolId: activeToolId,
        materialId: activeMaterialId,
      });
      onSelectOperation(id);
      return;
    }

    if (activeTool === 'sketch') {
      const closeToleranceMm = Math.max(1.5, 10 / transform.scale);
      const currentDraft = draftRef.current;
      if (!currentDraft || currentDraft.type !== 'sketch') {
        setDraft({ type: 'sketch', startPoint: point, segments: [], current: point, pendingArcEnd: null });
        return;
      }

      const currentPoint = getDraftSketchCurrentPoint(currentDraft) || currentDraft.startPoint;

      if ((currentDraft.segments?.length || 0) >= 2 && distance(point, currentDraft.startPoint) <= closeToleranceMm) {
        const closingSegments =
          currentPoint && distance(currentPoint, currentDraft.startPoint) > 0.05
            ? [...currentDraft.segments, buildStandaloneSegment(currentPoint, currentDraft.startPoint, 'line')]
            : currentDraft.segments;
        const id = onAddOperation({
          type: 'sketch',
          segments: closingSegments,
          closed: true,
          cutSide: 'outside',
          tabsEnabled: true,
          tabCount: 2,
          tabWidth: 1,
          tabHeight: 1,
          depth: settings.cutDepth,
          toolId: activeToolId,
          materialId: activeMaterialId,
        });
        onSelectOperation(id);
        setDraft(null);
        return;
      }

      if (currentPoint && distance(point, currentPoint) <= 0.05) {
        return;
      }

      setDraft({
        type: 'sketch',
        startPoint: currentDraft.startPoint,
        segments: [...(currentDraft.segments || []), buildStandaloneSegment(currentPoint, point, 'line')],
        current: point,
        pendingArcEnd: null,
      });
      return;
    }

    if (activeTool === 'arc') {
      const closeToleranceMm = Math.max(1.5, 10 / transform.scale);
      const currentDraft = draftRef.current;
      if (!currentDraft || currentDraft.type !== 'sketch') {
        setDraft({ type: 'sketch', startPoint: point, segments: [], current: point, pendingArcEnd: null });
        return;
      }

      const currentPoint = getDraftSketchCurrentPoint(currentDraft) || currentDraft.startPoint;
      if (!currentDraft.pendingArcEnd) {
        if (currentPoint && distance(point, currentPoint) <= 0.05) {
          return;
        }

        const targetPoint =
          (currentDraft.segments?.length || 0) >= 2 && distance(point, currentDraft.startPoint) <= closeToleranceMm
            ? currentDraft.startPoint
            : point;

        setDraft({
          ...currentDraft,
          current: point,
          pendingArcEnd: targetPoint,
        });
        return;
      }

      const nextSegments = [
        ...(currentDraft.segments || []),
        buildStandaloneSegment(currentPoint, currentDraft.pendingArcEnd, 'arc', point),
      ];

      if (distance(currentDraft.pendingArcEnd, currentDraft.startPoint) <= closeToleranceMm && nextSegments.length >= 2) {
        const id = onAddOperation({
          type: 'sketch',
          segments: nextSegments,
          closed: true,
          cutSide: 'outside',
          tabsEnabled: true,
          tabCount: 2,
          tabWidth: 1,
          tabHeight: 1,
          depth: settings.cutDepth,
          toolId: activeToolId,
          materialId: activeMaterialId,
        });
        onSelectOperation(id);
        setDraft(null);
        return;
      }

      setDraft({
        type: 'sketch',
        startPoint: currentDraft.startPoint,
        segments: nextSegments,
        current: currentDraft.pendingArcEnd,
        pendingArcEnd: null,
      });
      return;
    }

    if (activeTool === 'line' || activeTool === 'rect' || activeTool === 'circle') {
      interactionRef.current = {
        mode: 'draw',
        pointerId: event.pointerId,
        start: point,
        startCenter: null,
        startClient: null,
        selectedIds: null,
        sourceOperations: null,
        additive: false,
      };
      if (activeTool === 'line') {
        setDraft({ type: 'line', start: point, current: point });
      } else if (activeTool === 'rect') {
        setDraft({ type: 'rect', start: point, current: point });
      } else {
        setDraft({ type: 'circle', start: point, current: point });
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    const point = getPointerPoint(event, true);
    setPointerMm(point);
    const interaction = interactionRef.current;

    if (draft?.type === 'sketch') {
      setDraft((current) => (current?.type === 'sketch' ? { ...current, current: point } : current));
    }

    if (!interaction.mode) return;

    if (interaction.mode === 'pan') {
      if (!interaction.startClient || !interaction.startCenter) {
        return;
      }
      const dxPx = event.clientX - interaction.startClient.x;
      const dyPx = event.clientY - interaction.startClient.y;
      const targetCenter = {
        x: interaction.startCenter.x - dxPx / transform.scale,
        y: interaction.startCenter.y + dyPx / transform.scale,
      };

      setView((prev) => ({
        ...prev,
        center: clampCenter(
          targetCenter,
          transform.viewWidth,
          transform.viewHeight,
          transform.workWidth,
          transform.workHeight
        ),
      }));
      return;
    }

    if (interaction.mode === 'drag-handle' && editingSketchOperation) {
      const updated = updateSketchHandle(editingSketchOperation, interaction.handle, point);
      onUpdateOperation(editingSketchOperation.id, {
        segments: updated.segments,
      });
      return;
    }

    if (interaction.mode === 'drag-ops' && interaction.sourceOperations) {
      const startPoint = interaction.start;
      if (!startPoint || !interaction.selectedIds) {
        return;
      }
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      onMoveOperations({
        ids: interaction.selectedIds,
        sourceOperations: interaction.sourceOperations,
        dx,
        dy,
      });
      return;
    }

    if (interaction.mode === 'marquee') {
      setSelectBox((current) => (current ? { ...current, current: point } : { start: point, current: point }));
      return;
    }

    if (interaction.mode === 'draw') {
      setDraft((current) => (current ? { ...current, current: point } : current));
    }
  }

  function finalizeDraft(): void {
    if (!draft) return;

    if (draft.type === 'line' && distance(draft.start, draft.current) > 0.05) {
      const id = onAddOperation({
        type: 'line',
        x1: draft.start.x,
        y1: draft.start.y,
        x2: draft.current.x,
        y2: draft.current.y,
        depth: settings.cutDepth,
        toolId: activeToolId,
        materialId: activeMaterialId,
      });
      onSelectOperation(id);
    }

    if (draft.type === 'rect') {
      const rect = normalizeRect(
        draft.start.x,
        draft.start.y,
        draft.current.x - draft.start.x,
        draft.current.y - draft.start.y
      );
      if (rect.width > 0.05 && rect.height > 0.05) {
        const id = onAddOperation({
          type: 'rect',
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          cornerRadius: 0,
          cutSide: 'outside',
          tabsEnabled: true,
          tabCount: 2,
          tabWidth: 1,
          tabHeight: 1,
          depth: settings.cutDepth,
          toolId: activeToolId,
          materialId: activeMaterialId,
        });
        onSelectOperation(id);
      }
    }

    if (draft.type === 'circle') {
      const radius = distance(draft.start, draft.current);
      if (radius > 0.05) {
        const id = onAddOperation({
          type: 'circle',
          x: draft.start.x,
          y: draft.start.y,
          radius,
          cutSide: 'outside',
          tabsEnabled: true,
          tabCount: 2,
          tabWidth: 1,
          tabHeight: 1,
          depth: settings.cutDepth,
          toolId: activeToolId,
          materialId: activeMaterialId,
        });
        onSelectOperation(id);
      }
    }
  }

  function finalizeMarqueeSelection(): void {
    const interaction = interactionRef.current;
    if (!selectBox || interaction.mode !== 'marquee') return;

    const rect = normalizeRect(
      selectBox.start.x,
      selectBox.start.y,
      selectBox.current.x - selectBox.start.x,
      selectBox.current.y - selectBox.start.y
    );

    const selectionRect = {
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    };

    const ids = operations
      .filter((operation) => {
        const bounds = getOperationBounds(operation);
        return bounds ? rectsOverlap(bounds, selectionRect) : false;
      })
      .map((operation) => operation.id);

    onSetSelection(ids, { additive: interaction.additive });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    const interaction = interactionRef.current;
    if (interaction.mode === 'draw') {
      finalizeDraft();
    }
    if (interaction.mode === 'marquee') {
      finalizeMarqueeSelection();
    }

    interactionRef.current = createEmptyInteractionState();

    if (draft?.type !== 'sketch') {
      setDraft(null);
    }
    setSelectBox(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>): void {
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    applyZoomAt(factor, anchor);
  }

  return (
    <div className="cam-canvas-wrapper" ref={wrapperRef}>
      <canvas
        className="cam-canvas"
        ref={canvasRef}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />
      <div className="canvas-overlay">
        <span>
          Cursor: X {pointerMm.x.toFixed(2)} mm / Y {pointerMm.y.toFixed(2)} mm
        </span>
        <span>
          Zoom: {(transform.zoom * 100).toFixed(0)}% (Ctrl/Cmd + wheel or View menu)
        </span>
        <span>
          Shift + click adds selection, drag empty space for box select, Alt/middle/right drag to pan
        </span>
        {draft?.type === 'sketch' ? (
          <span>
            Sketch: line mode clicks add segments, arc mode uses end click + bulge click, click first point to
            close, Enter to finish open
          </span>
        ) : null}
        {pastePreview ? <span>Paste mode: click to place copied operations (Esc to cancel)</span> : null}
      </div>
    </div>
  );
}
