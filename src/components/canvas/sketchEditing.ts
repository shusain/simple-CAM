import { distance, getSketchSegments, hitTestOperation, moveOperation } from '../../utils/geometry';
import type { DrawDraft, Operation, Point, SketchHandle, SketchOperation, SketchSegment } from '../../types';
import type {
  CanvasTool,
  InteractionState,
  SketchInsertTool,
  SketchArcInsertDraft,
  SketchPreviewOperation,
  SketchSegmentOperationItem,
} from './types';

const HANDLE_POINT_TOLERANCE = 0.0001;

export function createEmptyInteractionState(): InteractionState {
  return {
    mode: null,
    pointerId: null,
    start: null,
    startCenter: null,
    startClient: null,
    selectedIds: null,
    sourceOperations: null,
    importedMeshId: null,
    sourceImportedMesh: null,
    additive: false,
    handle: null,
  };
}

export function isSketchTool(tool: CanvasTool): tool is SketchInsertTool {
  return tool === 'sketch' || tool === 'arc';
}

export function defocusActiveEditor(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return;
  }

  const tag = active.tagName.toLowerCase();
  const isEditable = active.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
  if (isEditable && typeof active.blur === 'function') {
    active.blur();
  }
}

export function offsetOperation(operation: Operation, dx: number, dy: number): Operation {
  return moveOperation(operation, dx, dy) as Operation;
}

export function getDraftSketchCurrentPoint(draft: DrawDraft | null): Point | null {
  if (!draft || draft.type !== 'sketch') return null;
  const segments = draft.segments || [];
  if (segments.length === 0) {
    return draft.startPoint || null;
  }

  const last = segments[segments.length - 1];
  return { x: last.x2, y: last.y2 };
}

export function buildDraftSketchOperation(
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
    pocketEnabled: false,
    pocketStepOver: 0.5,
    id: 'draft-sketch',
    depth: 0,
  };
}

export function buildStandaloneSegment(
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

export function buildNextLineInsertDraft(
  draft: SketchArcInsertDraft | null,
  point: Point,
  closeTolerance: number
): { nextDraft: SketchArcInsertDraft | null; newSegment: SketchSegment | null } {
  if (!draft?.startPoint) {
    return {
      nextDraft: {
        mode: 'sketch',
        startPoint: point,
        chainStartPoint: point,
      },
      newSegment: null,
    };
  }

  const chainStartPoint = draft.chainStartPoint || draft.startPoint;
  const closeToCurrent = distance(point, draft.startPoint) <= 0.05;
  if (closeToCurrent) {
    return { nextDraft: draft, newSegment: null };
  }

  const canCloseToChainStart =
    distance(point, chainStartPoint) <= closeTolerance && distance(draft.startPoint, chainStartPoint) > 0.05;
  if (canCloseToChainStart) {
    return {
      nextDraft: null,
      newSegment: buildStandaloneSegment(draft.startPoint, chainStartPoint, 'line'),
    };
  }

  return {
    nextDraft: {
      mode: 'sketch',
      startPoint: point,
      chainStartPoint,
    },
    newSegment: buildStandaloneSegment(draft.startPoint, point, 'line'),
  };
}

export function buildNextArcInsertDraft(
  draft: SketchArcInsertDraft | null,
  point: Point,
  closeTolerance: number
): { nextDraft: SketchArcInsertDraft | null; newSegment: SketchSegment | null } {
  if (!draft?.startPoint) {
    return {
      nextDraft: {
        mode: 'arc',
        startPoint: point,
        chainStartPoint: point,
      },
      newSegment: null,
    };
  }

  const chainStartPoint = draft.chainStartPoint || draft.startPoint;
  if (!draft.endPoint) {
    const closeToCurrent = distance(point, draft.startPoint) <= 0.05;
    if (closeToCurrent) {
      return { nextDraft: draft, newSegment: null };
    }

    const targetPoint =
      distance(point, chainStartPoint) <= closeTolerance && distance(draft.startPoint, chainStartPoint) > 0.05
        ? chainStartPoint
        : point;

    return {
      nextDraft: {
        ...draft,
        endPoint: targetPoint,
        chainStartPoint,
      },
      newSegment: null,
    };
  }

  const newSegment = buildStandaloneSegment(draft.startPoint, draft.endPoint, 'arc', point);
  const closesChain = distance(draft.endPoint, chainStartPoint) <= closeTolerance;

  return {
    nextDraft: closesChain
      ? null
      : {
          mode: 'arc',
          startPoint: draft.endPoint,
          chainStartPoint,
        },
    newSegment,
  };
}

export function switchSketchInsertDraftMode(
  draft: SketchArcInsertDraft | null,
  mode: SketchInsertTool
): SketchArcInsertDraft | null {
  if (!draft) {
    return null;
  }

  if (draft.mode === mode) {
    return draft;
  }

  return {
    mode,
    startPoint: draft.startPoint,
    chainStartPoint: draft.chainStartPoint,
  };
}

export function getSketchSegmentOperations(operation: SketchOperation): SketchSegmentOperationItem[] {
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
      pocketEnabled: false,
      pocketStepOver: 0.5,
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

export function getSketchHandles(operation: SketchOperation): SketchHandle[] {
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

export function getSketchHandleDisplayMap(handles: SketchHandle[], scale: number): Map<SketchHandle, Point> {
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

export function findSketchHandleHit(
  operation: SketchOperation,
  point: Point,
  tolerance: number,
  scale: number
): SketchHandle | null {
  const handles = getSketchHandles(operation);
  const displayMap = getSketchHandleDisplayMap(handles, scale);
  return handles.find((handle) => distance(point, displayMap.get(handle) || handle.point) <= tolerance) || null;
}

export function findSketchSegmentHit(
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

export function updateSketchHandle(
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

export function rectsOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}
