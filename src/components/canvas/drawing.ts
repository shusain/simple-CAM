import { clamp, distance, getSketchPathPoints, getSketchSubpaths, normalizeRect } from '../../utils/geometry';
import { getTextOperationPathPoints } from '../../utils/text';
import type { ToolpathPreview } from '../../utils/toolpathPreview';
import type { DrawDraft, ImportedMesh, Operation, Point, SelectBoxState, SketchOperation } from '../../types';
import { getImportedMeshWorldBounds } from '../../utils/importStl';
import {
  buildDraftSketchOperation,
  getSketchHandleDisplayMap,
  getSketchHandles,
  getSketchSegmentOperations,
} from './sketchEditing';
import type { CanvasTool, SketchArcInsertDraft, SketchPreviewOperation, ViewTransform } from './types';
import { worldToCanvas } from './viewport';
import { getMiniMapGeometry, miniMapWorldToCanvas } from './minimap';

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

function drawDirectionArrows(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  points: Point[],
  color: string
): void {
  const arrowLength = 8;
  const arrowWidth = 4;

  ctx.save();
  ctx.fillStyle = color;

  for (let i = 1; i < points.length; i += 1) {
    const start = worldToCanvas(points[i - 1], transform);
    const end = worldToCanvas(points[i], transform);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (segmentLength < 20) {
      continue;
    }

    const ux = dx / segmentLength;
    const uy = dy / segmentLength;
    const midX = start.x + dx * 0.6;
    const midY = start.y + dy * 0.6;
    const baseX = midX - ux * arrowLength;
    const baseY = midY - uy * arrowLength;
    const perpX = -uy;
    const perpY = ux;

    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(baseX + perpX * arrowWidth, baseY + perpY * arrowWidth);
    ctx.lineTo(baseX - perpX * arrowWidth, baseY - perpY * arrowWidth);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export function drawGrid(ctx: CanvasRenderingContext2D, transform: ViewTransform, gridSize: number): void {
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

export function drawOperation(
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
    strokeRoundedRect(ctx, topLeft.x, topLeft.y, rect.width * transform.scale, rect.height * transform.scale, radiusPx);
  }

  if (operation.type === 'circle') {
    const center = worldToCanvas({ x: operation.x, y: operation.y }, transform);
    ctx.beginPath();
    ctx.arc(center.x, center.y, operation.radius * transform.scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (operation.type === 'text') {
    const subpaths = getTextOperationPathPoints(operation);
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

export function drawImportedMeshSilhouette(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  mesh: ImportedMesh,
  options: { selected?: boolean } = {}
): void {
  const { selected = false } = options;
  const fillColor = selected ? 'rgba(251, 146, 60, 0.24)' : 'rgba(96, 165, 250, 0.18)';
  const strokeColor = selected ? '#f97316' : '#60a5fa';
  const bounds = getImportedMeshWorldBounds(mesh);

  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = selected ? 2.2 : 1.4;

  const silhouette = new Path2D();
  mesh.triangles.forEach((triangle) => {
    const a = worldToCanvas(
      { x: triangle.a.x + mesh.placement.x, y: triangle.a.y + mesh.placement.y },
      transform
    );
    const b = worldToCanvas(
      { x: triangle.b.x + mesh.placement.x, y: triangle.b.y + mesh.placement.y },
      transform
    );
    const c = worldToCanvas(
      { x: triangle.c.x + mesh.placement.x, y: triangle.c.y + mesh.placement.y },
      transform
    );
    silhouette.moveTo(a.x, a.y);
    silhouette.lineTo(b.x, b.y);
    silhouette.lineTo(c.x, c.y);
    silhouette.closePath();
  });

  ctx.fill(silhouette);

  const topLeft = worldToCanvas({ x: bounds.minX, y: bounds.maxY }, transform);
  const width = (bounds.maxX - bounds.minX) * transform.scale;
  const height = (bounds.maxY - bounds.minY) * transform.scale;
  ctx.setLineDash(selected ? [8, 5] : []);
  ctx.strokeRect(topLeft.x, topLeft.y, width, height);

  const center = worldToCanvas(mesh.placement, transform);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(center.x - 8, center.y);
  ctx.lineTo(center.x + 8, center.y);
  ctx.moveTo(center.x, center.y - 8);
  ctx.lineTo(center.x, center.y + 8);
  ctx.stroke();

  ctx.restore();
}

export function drawToolpathPreview(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  preview: ToolpathPreview | null
): void {
  if (!preview) return;

  ctx.save();

  preview.segments.forEach((segment) => {
    if (!Array.isArray(segment.points) || segment.points.length < 2) {
      return;
    }

    let arrowColor = 'rgba(34, 211, 238, 0.9)';
    if (segment.kind === 'rapid') {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([8, 6]);
      arrowColor = 'rgba(56, 189, 248, 0.95)';
    } else if (segment.kind === 'tab') {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      arrowColor = 'rgba(250, 204, 21, 0.95)';
    } else {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([]);
      arrowColor = 'rgba(34, 211, 238, 0.95)';
    }

    ctx.beginPath();
    const start = worldToCanvas(segment.points[0], transform);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < segment.points.length; i += 1) {
      const point = worldToCanvas(segment.points[i], transform);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();

    if (segment.kind !== 'tab') {
      drawDirectionArrows(ctx, transform, segment.points, arrowColor);
    }
  });

  ctx.setLineDash([]);
  preview.markers.forEach((marker) => {
    const point = worldToCanvas(marker.point, transform);
    ctx.beginPath();

    if (marker.kind === 'start') {
      ctx.fillStyle = '#22c55e';
      ctx.strokeStyle = '#dcfce7';
      ctx.lineWidth = 1.5;
      ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }

    if (marker.kind === 'end') {
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#fee2e2';
      ctx.lineWidth = 1.5;
      ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }

    if (marker.kind === 'drill') {
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 1.8;
      ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x - 5, point.y);
      ctx.lineTo(point.x + 5, point.y);
      ctx.moveTo(point.x, point.y - 5);
      ctx.lineTo(point.x, point.y + 5);
      ctx.stroke();
      return;
    }

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.6;
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.restore();
}

export function drawDraft(ctx: CanvasRenderingContext2D, transform: ViewTransform, draft: DrawDraft | null): void {
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

export function drawSketchEditOverlay(
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
    ctx.fillStyle = handle.kind === 'through' ? '#c084fc' : handle.kind === 'start' ? '#38bdf8' : '#f8fafc';
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
        pocketEnabled: false,
        pocketStepOver: 0.5,
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

export function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  transform: ViewTransform,
  operations: Operation[],
  importedMeshes: ImportedMesh[]
): void {
  const geometry = getMiniMapGeometry(transform);
  const {
    x,
    y,
    width: mapWidth,
    height: mapHeight,
    scale,
  } = geometry;

  function toMap(point: Point): Point {
    return miniMapWorldToCanvas(point, transform, geometry);
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

    if (operation.type === 'text') {
      const subpaths = getTextOperationPathPoints(operation);
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

  ctx.fillStyle = 'rgba(96, 165, 250, 0.18)';
  ctx.strokeStyle = '#60a5fa';
  importedMeshes.forEach((mesh) => {
    const path = new Path2D();
    mesh.triangles.forEach((triangle) => {
      const a = toMap({ x: triangle.a.x + mesh.placement.x, y: triangle.a.y + mesh.placement.y });
      const b = toMap({ x: triangle.b.x + mesh.placement.x, y: triangle.b.y + mesh.placement.y });
      const c = toMap({ x: triangle.c.x + mesh.placement.x, y: triangle.c.y + mesh.placement.y });
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
      path.lineTo(c.x, c.y);
      path.closePath();
    });
    ctx.fill(path);
  });

  const viewLeft = clamp(transform.left, 0, transform.workWidth);
  const viewRight = clamp(transform.right, 0, transform.workWidth);
  const viewBottom = clamp(transform.bottom, 0, transform.workHeight);
  const viewTop = clamp(transform.top, 0, transform.workHeight);

  const viewTopLeft = toMap({ x: viewLeft, y: viewTop });
  const viewMapWidth = Math.max(2, (viewRight - viewLeft) * scale);
  const viewMapHeight = Math.max(2, (viewTop - viewBottom) * scale);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.fillRect(viewTopLeft.x, viewTopLeft.y, viewMapWidth, viewMapHeight);
  ctx.strokeRect(viewTopLeft.x, viewTopLeft.y, viewMapWidth, viewMapHeight);

  ctx.restore();
}

export function renderCanvasScene(args: {
  canvas: HTMLCanvasElement;
  transform: ViewTransform;
  gridSize: number;
  marginX?: number;
  marginY?: number;
  workHeight: number;
  workWidth: number;
  operations: Operation[];
  importedMeshes: ImportedMesh[];
  transformPreviewOperations: Operation[];
  toolpathPreview: ToolpathPreview | null;
  selectedIds: Set<string>;
  selectedImportedMeshId: string | null;
  pastePreviewOperations: Operation[];
  draft: DrawDraft | null;
  selectBox: SelectBoxState | null;
  editingSketchOperation: SketchOperation | null;
  selectedSegmentIndex: number | null;
  pointerMm: Point;
  activeTool: CanvasTool;
  sketchArcInsertDraft: SketchArcInsertDraft | null;
}): void {
  const {
    canvas,
    transform,
    gridSize,
    marginX = 0,
    marginY = 0,
    workHeight,
    workWidth,
    operations,
    importedMeshes,
    transformPreviewOperations,
    toolpathPreview,
    selectedIds,
    selectedImportedMeshId,
    pastePreviewOperations,
    draft,
    selectBox,
    editingSketchOperation,
    selectedSegmentIndex,
    pointerMm,
    activeTool,
    sketchArcInsertDraft,
  } = args;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = transform.width;
  canvas.height = transform.height;

  ctx.clearRect(0, 0, transform.width, transform.height);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, transform.width, transform.height);

  drawGrid(ctx, transform, gridSize);

  const borderTopLeft = worldToCanvas({ x: 0, y: workHeight }, transform);
  const clampedMarginX = Math.max(0, Math.min(Number(marginX) || 0, workWidth / 2));
  const clampedMarginY = Math.max(0, Math.min(Number(marginY) || 0, workHeight / 2));

  if (clampedMarginX > 0 || clampedMarginY > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(220, 38, 38, 0.16)';

    if (clampedMarginX > 0) {
      const leftTop = worldToCanvas({ x: 0, y: workHeight }, transform);
      ctx.fillRect(leftTop.x, leftTop.y, clampedMarginX * transform.scale, workHeight * transform.scale);

      const rightTop = worldToCanvas({ x: workWidth - clampedMarginX, y: workHeight }, transform);
      ctx.fillRect(rightTop.x, rightTop.y, clampedMarginX * transform.scale, workHeight * transform.scale);
    }

    if (clampedMarginY > 0) {
      const topLeft = worldToCanvas({ x: 0, y: workHeight }, transform);
      ctx.fillRect(topLeft.x, topLeft.y, workWidth * transform.scale, clampedMarginY * transform.scale);

      const bottomLeft = worldToCanvas({ x: 0, y: clampedMarginY }, transform);
      ctx.fillRect(bottomLeft.x, bottomLeft.y, workWidth * transform.scale, clampedMarginY * transform.scale);
    }

    const innerTopLeft = worldToCanvas({ x: clampedMarginX, y: workHeight - clampedMarginY }, transform);
    const innerWidth = Math.max(0, (workWidth - clampedMarginX * 2) * transform.scale);
    const innerHeight = Math.max(0, (workHeight - clampedMarginY * 2) * transform.scale);
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(innerTopLeft.x, innerTopLeft.y, innerWidth, innerHeight);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(borderTopLeft.x, borderTopLeft.y, workWidth * transform.scale, workHeight * transform.scale);
  ctx.restore();

  importedMeshes.forEach((mesh) => {
    drawImportedMeshSilhouette(ctx, transform, mesh, { selected: selectedImportedMeshId === mesh.id });
  });

  operations.forEach((operation) => {
    drawOperation(ctx, transform, operation, { selected: selectedIds.has(operation.id) });
  });

  transformPreviewOperations.forEach((operation) => {
    drawOperation(ctx, transform, operation, { selected: selectedIds.has(operation.id), ghost: true });
  });

  drawToolpathPreview(ctx, transform, toolpathPreview);

  pastePreviewOperations.forEach((operation) => {
    drawOperation(ctx, transform, operation, { ghost: true });
  });

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
      selectedSegmentIndex,
      pointerMm,
      activeTool,
      sketchArcInsertDraft
    );
  }

  drawMiniMap(ctx, transform, operations, importedMeshes);

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
}
