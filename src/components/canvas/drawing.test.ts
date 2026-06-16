import { describe, expect, it, vi } from 'vitest';
import {
  drawDraft,
  drawGrid,
  drawMiniMap,
  drawOperation,
  drawSketchEditOverlay,
  drawToolpathPreview,
  renderCanvasScene,
} from './drawing';
import { buildTransform } from './viewport';
import { makeCircleOperation, makeDrillOperation, makeLineOperation, makeRectOperation, makeSettings, makeSketchOperation } from '../../test/factories';
import type { DrawDraft, Point } from '../../types';
import type { CanvasTool, SketchArcInsertDraft } from './types';
import type { ToolpathPreview } from '../../utils/toolpathPreview';

type MockCanvasContext = {
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  arcTo: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  setLineDash: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  globalAlpha: number;
  font: string;
};

function createMockContext(): CanvasRenderingContext2D {
  const ctx: MockCanvasContext = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
  };

  return ctx as unknown as CanvasRenderingContext2D;
}

function createTransform() {
  return buildTransform(
    { width: 400, height: 300 },
    makeSettings({ workWidth: 100, workHeight: 80 }),
    1,
    { x: 50, y: 40 }
  );
}

describe('canvas drawing helpers', () => {
  it('draws grids and all operation types including ghost styling', () => {
    const ctx = createMockContext();
    const transform = createTransform();

    drawGrid(ctx, transform, 10);
    drawOperation(ctx, transform, makeDrillOperation(), { ghost: true });
    drawOperation(ctx, transform, makeLineOperation(), { selected: true });
    drawOperation(ctx, transform, makeRectOperation({ cornerRadius: 2 }));
    drawOperation(ctx, transform, makeCircleOperation());
    drawOperation(
      ctx,
      transform,
      makeSketchOperation({
        segments: [
          { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
          { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
        ],
        closed: false,
      })
    );

    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 4]);
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.arcTo).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws line, rect, circle, and sketch drafts with pending arc markers', () => {
    const ctx = createMockContext();
    const transform = createTransform();
    const drafts: DrawDraft[] = [
      { type: 'line', start: { x: 0, y: 0 }, current: { x: 10, y: 5 } },
      { type: 'rect', start: { x: 2, y: 2 }, current: { x: 8, y: 6 } },
      { type: 'circle', start: { x: 5, y: 5 }, current: { x: 8, y: 9 } },
      {
        type: 'sketch',
        startPoint: { x: 0, y: 0 },
        current: { x: 12, y: 6 },
        pendingArcEnd: { x: 10, y: 8 },
        segments: [
          { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
          { type: 'arc', x1: 10, y1: 0, x2: 12, y2: 6, throughX: 14, throughY: 3 },
        ],
      },
    ];

    drafts.forEach((draft) => drawDraft(ctx, transform, draft));
    drawDraft(ctx, transform, null);

    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 4]);
    expect(ctx.strokeRect).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('draws sketch edit overlays for selected segments, handles, and line previews', () => {
    const ctx = createMockContext();
    const transform = createTransform();
    const operation = makeSketchOperation({
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'arc', x1: 10, y1: 0, x2: 10, y2: 10, throughX: 14, throughY: 5 },
      ],
      closed: false,
    });

    drawSketchEditOverlay(
      ctx,
      transform,
      operation,
      1,
      { x: 15, y: 12 },
      'sketch',
      { mode: 'sketch', startPoint: { x: 10, y: 10 } }
    );

    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([8, 6]);
    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 4]);
  });

  it('draws arc insertion previews with and without a fixed endpoint', () => {
    const ctx = createMockContext();
    const transform = createTransform();
    const operation = makeSketchOperation({ closed: false });
    const pointerMm: Point = { x: 16, y: 8 };
    const withEndPoint: SketchArcInsertDraft = {
      mode: 'arc',
      startPoint: { x: 10, y: 0 },
      endPoint: { x: 10, y: 10 },
    };
    const withoutEndPoint: SketchArcInsertDraft = {
      mode: 'arc',
      startPoint: { x: 4, y: 4 },
    };

    drawSketchEditOverlay(ctx, transform, operation, null, pointerMm, 'arc', withEndPoint);
    drawSketchEditOverlay(ctx, transform, operation, null, pointerMm, 'arc', withoutEndPoint);
    drawSketchEditOverlay(ctx, transform, null, null, pointerMm, 'arc', withoutEndPoint);

    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws toolpath preview segments and markers', () => {
    const ctx = createMockContext();
    const transform = createTransform();
    const preview: ToolpathPreview = {
      segments: [
        { kind: 'rapid', operationId: null, operationType: 'job', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] },
        { kind: 'cut', operationId: 'line-1', operationType: 'line', points: [{ x: 5, y: 5 }, { x: 12, y: 5 }] },
        { kind: 'tab', operationId: 'rect-1', operationType: 'rect', points: [{ x: 6, y: 5 }, { x: 8, y: 5 }] },
      ],
      markers: [
        { kind: 'start', operationId: null, operationType: 'job', point: { x: 0, y: 0 } },
        { kind: 'plunge', operationId: 'line-1', operationType: 'line', point: { x: 5, y: 5 } },
        { kind: 'drill', operationId: 'drill-1', operationType: 'drill', point: { x: 2, y: 2 } },
        { kind: 'end', operationId: null, operationType: 'job', point: { x: 10, y: 10 } },
      ],
    };

    drawToolpathPreview(ctx, transform, preview);

    expect(ctx.setLineDash).toHaveBeenCalledWith([8, 6]);
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws the minimap and renders a full canvas scene', () => {
    const ctx = createMockContext();
    const transform = createTransform();
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getContext', {
      value: vi.fn().mockReturnValue(ctx),
    });

    const operations = [
      makeDrillOperation(),
      makeLineOperation(),
      makeRectOperation({ cornerRadius: 1 }),
      makeCircleOperation(),
      makeSketchOperation({ closed: false }),
    ];

    drawMiniMap(ctx, transform, operations);
    renderCanvasScene({
      canvas,
      transform,
      gridSize: 10,
      workHeight: 80,
      workWidth: 100,
      operations,
      transformPreviewOperations: [makeLineOperation({ id: operations[1].id, x1: 3, y1: 3, x2: 13, y2: 3 })],
      toolpathPreview: null,
      selectedIds: new Set([operations[0].id]),
      pastePreviewOperations: [makeLineOperation({ id: 'line-ghost' })],
      draft: { type: 'line', start: { x: 0, y: 0 }, current: { x: 10, y: 10 } },
      selectBox: { start: { x: 2, y: 2 }, current: { x: 12, y: 8 } },
      editingSketchOperation: makeSketchOperation({ closed: false }),
      selectedSegmentIndex: 0,
      pointerMm: { x: 20, y: 20 },
      activeTool: 'arc' as CanvasTool,
      sketchArcInsertDraft: { mode: 'arc', startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } },
    });

    expect(canvas.width).toBe(transform.width);
    expect(canvas.height).toBe(transform.height);
    expect(ctx.fillText).toHaveBeenCalledWith('Minimap', expect.any(Number), expect.any(Number));
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it('returns early when a canvas context is unavailable', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getContext', {
      value: vi.fn().mockReturnValue(null),
    });

    expect(() =>
      renderCanvasScene({
        canvas,
        transform: createTransform(),
        gridSize: 10,
        workHeight: 80,
        workWidth: 100,
        operations: [],
        transformPreviewOperations: [],
        toolpathPreview: null,
        selectedIds: new Set(),
        pastePreviewOperations: [],
        draft: null,
        selectBox: null,
        editingSketchOperation: null,
        selectedSegmentIndex: null,
        pointerMm: { x: 0, y: 0 },
        activeTool: 'select',
        sketchArcInsertDraft: null,
      })
    ).not.toThrow();
  });
});
