import { describe, expect, it, vi } from 'vitest';
import {
  buildNextArcInsertDraft,
  buildNextLineInsertDraft,
  buildDraftSketchOperation,
  buildStandaloneSegment,
  createEmptyInteractionState,
  defocusActiveEditor,
  findSketchHandleHit,
  findSketchSegmentHit,
  getDraftSketchCurrentPoint,
  getSketchHandleDisplayMap,
  getSketchHandles,
  getSketchSegmentOperations,
  isSketchTool,
  offsetOperation,
  rectsOverlap,
  switchSketchInsertDraftMode,
  updateSketchHandle,
} from './sketchEditing';
import type { DrawDraft } from '../../types';
import { makeDrillOperation, makeSketchOperation } from '../../test/factories';

describe('canvas sketchEditing helpers', () => {
  it('creates empty interaction state and identifies sketch tools', () => {
    expect(createEmptyInteractionState()).toEqual({
      mode: null,
      pointerId: null,
      start: null,
      startCenter: null,
      startClient: null,
      selectedIds: null,
      sourceOperations: null,
      additive: false,
      handle: null,
    });
    expect(isSketchTool('sketch')).toBe(true);
    expect(isSketchTool('arc')).toBe(true);
    expect(isSketchTool('select')).toBe(false);
  });

  it('defocuses editable active elements when present', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const blurSpy = vi.spyOn(input, 'blur');

    defocusActiveEditor();
    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it('builds current draft sketch points and preview operations', () => {
    const draft: DrawDraft = {
      type: 'sketch',
      startPoint: { x: 0, y: 0 },
      current: { x: 5, y: 0 },
      segments: [],
      pendingArcEnd: null,
    };

    expect(getDraftSketchCurrentPoint(draft)).toEqual({ x: 0, y: 0 });
    expect(buildDraftSketchOperation(draft, true)).toMatchObject({
      type: 'sketch',
      segments: [{ type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }],
    });

    const arcDraft: DrawDraft = {
      type: 'sketch',
      startPoint: { x: 0, y: 0 },
      segments: [{ type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }],
      current: { x: 7, y: 3 },
      pendingArcEnd: { x: 10, y: 0 },
    };
    expect(getDraftSketchCurrentPoint(arcDraft)).toEqual({ x: 5, y: 0 });
    const preview = buildDraftSketchOperation(arcDraft, true);
    expect(preview?.segments[preview.segments.length - 1]).toMatchObject({
      type: 'arc',
      x1: 5,
      y1: 0,
      x2: 10,
      y2: 0,
      throughX: 7,
      throughY: 3,
    });
    expect(buildDraftSketchOperation(null)).toBeNull();
  });

  it('builds standalone segments and segment operation wrappers', () => {
    expect(buildStandaloneSegment({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual({
      type: 'line',
      x1: 0,
      y1: 0,
      x2: 3,
      y2: 0,
    });
    expect(buildStandaloneSegment({ x: 0, y: 0 }, { x: 3, y: 0 }, 'arc', { x: 1, y: 2 })).toEqual({
      type: 'arc',
      x1: 0,
      y1: 0,
      x2: 3,
      y2: 0,
      throughX: 1,
      throughY: 2,
    });

    const sketch = makeSketchOperation({
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 },
        { type: 'arc', x1: 5, y1: 0, x2: 5, y2: 5, throughX: 7, throughY: 2 },
      ],
    });
    expect(getSketchSegmentOperations(sketch)).toHaveLength(2);
  });

  it('chains edit-mode poly-line inserts until closed or cancelled', () => {
    const started = buildNextLineInsertDraft(null, { x: 1, y: 1 }, 1.5);
    expect(started).toEqual({
      nextDraft: {
        mode: 'sketch',
        startPoint: { x: 1, y: 1 },
        chainStartPoint: { x: 1, y: 1 },
      },
      newSegment: null,
    });

    const continued = buildNextLineInsertDraft(started.nextDraft, { x: 4, y: 1 }, 1.5);
    expect(continued.newSegment).toMatchObject({ type: 'line', x1: 1, y1: 1, x2: 4, y2: 1 });
    expect(continued.nextDraft).toMatchObject({
      mode: 'sketch',
      startPoint: { x: 4, y: 1 },
      chainStartPoint: { x: 1, y: 1 },
    });

    const closed = buildNextLineInsertDraft(continued.nextDraft, { x: 1.2, y: 1.1 }, 1.5);
    expect(closed.newSegment).toMatchObject({ type: 'line', x1: 4, y1: 1, x2: 1, y2: 1 });
    expect(closed.nextDraft).toBeNull();
  });

  it('chains edit-mode poly-arc inserts until closed or cancelled', () => {
    const started = buildNextArcInsertDraft(null, { x: 1, y: 1 }, 1.5);
    expect(started).toEqual({
      nextDraft: {
        mode: 'arc',
        startPoint: { x: 1, y: 1 },
        chainStartPoint: { x: 1, y: 1 },
      },
      newSegment: null,
    });

    const pickedEnd = buildNextArcInsertDraft(started.nextDraft, { x: 4, y: 1 }, 1.5);
    expect(pickedEnd.nextDraft).toMatchObject({
      mode: 'arc',
      startPoint: { x: 1, y: 1 },
      endPoint: { x: 4, y: 1 },
      chainStartPoint: { x: 1, y: 1 },
    });

    const continued = buildNextArcInsertDraft(pickedEnd.nextDraft, { x: 2.5, y: 3 }, 1.5);
    expect(continued.newSegment).toMatchObject({
      type: 'arc',
      x1: 1,
      y1: 1,
      x2: 4,
      y2: 1,
      throughX: 2.5,
      throughY: 3,
    });
    expect(continued.nextDraft).toMatchObject({
      mode: 'arc',
      startPoint: { x: 4, y: 1 },
      chainStartPoint: { x: 1, y: 1 },
    });

    const pickedCloseEnd = buildNextArcInsertDraft(continued.nextDraft, { x: 1.1, y: 1.2 }, 1.5);
    expect(pickedCloseEnd.nextDraft).toMatchObject({
      mode: 'arc',
      startPoint: { x: 4, y: 1 },
      endPoint: { x: 1, y: 1 },
      chainStartPoint: { x: 1, y: 1 },
    });

    const closed = buildNextArcInsertDraft(pickedCloseEnd.nextDraft, { x: 2, y: -1 }, 1.5);
    expect(closed.newSegment).toMatchObject({
      type: 'arc',
      x1: 4,
      y1: 1,
      x2: 1,
      y2: 1,
      throughX: 2,
      throughY: -1,
    });
    expect(closed.nextDraft).toBeNull();
  });

  it('preserves the current sketch chain start when switching between line and arc tools', () => {
    expect(
      switchSketchInsertDraftMode(
        {
          mode: 'arc',
          startPoint: { x: 8, y: 3 },
          chainStartPoint: { x: 1, y: 1 },
          endPoint: { x: 10, y: 3 },
        },
        'sketch'
      )
    ).toEqual({
      mode: 'sketch',
      startPoint: { x: 8, y: 3 },
      chainStartPoint: { x: 1, y: 1 },
    });

    expect(
      switchSketchInsertDraftMode(
        {
          mode: 'sketch',
          startPoint: { x: 8, y: 3 },
          chainStartPoint: { x: 1, y: 1 },
        },
        'arc'
      )
    ).toEqual({
      mode: 'arc',
      startPoint: { x: 8, y: 3 },
      chainStartPoint: { x: 1, y: 1 },
    });
  });

  it('creates handles, display map, and hit detection for sketch elements', () => {
    const sketch = makeSketchOperation({
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 0, y2: 0 },
        { type: 'arc', x1: 0, y1: 0, x2: 5, y2: 0, throughX: 2, throughY: 2 },
      ],
    });

    const handles = getSketchHandles(sketch);
    expect(handles).toHaveLength(5);

    const displayMap = getSketchHandleDisplayMap(handles, 2);
    expect(displayMap.size).toBe(5);

    const hitHandle = findSketchHandleHit(sketch, displayMap.get(handles[0])!, 1, 2);
    expect(hitHandle).toMatchObject({ kind: 'start', segmentIndex: 0 });

    const segmentHit = findSketchSegmentHit(
      makeSketchOperation({
        segments: [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }],
      }),
      { x: 5, y: 0.2 },
      1
    );
    expect(segmentHit?.index).toBe(0);
  });

  it('updates sketch handles across shared endpoints and arc through points', () => {
    const sketch = makeSketchOperation({
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 },
        { type: 'line', x1: 5, y1: 0, x2: 5, y2: 5 },
        { type: 'arc', x1: 5, y1: 5, x2: 0, y2: 5, throughX: 2.5, throughY: 7 },
      ],
    });

    const movedShared = updateSketchHandle(
      sketch,
      { kind: 'end', segmentIndex: 0, point: { x: 5, y: 0 } },
      { x: 6, y: 1 }
    );
    expect(movedShared.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x2: 6, y2: 1 }),
        expect.objectContaining({ x1: 6, y1: 1 }),
      ])
    );

    const movedThrough = updateSketchHandle(
      sketch,
      { kind: 'through', segmentIndex: 2, point: { x: 2.5, y: 7 } },
      { x: 3, y: 8 }
    );
    expect(movedThrough.segments[2]).toMatchObject({ throughX: 3, throughY: 8 });
  });

  it('offsets operations and checks rectangle overlap', () => {
    expect(offsetOperation(makeDrillOperation({ x: 1, y: 2 }), 4, -1)).toMatchObject({ x: 5, y: 1 });
    expect(rectsOverlap({ minX: 0, minY: 0, maxX: 5, maxY: 5 }, { minX: 4, minY: 4, maxX: 8, maxY: 8 })).toBe(true);
    expect(rectsOverlap({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: 2, minY: 2, maxX: 3, maxY: 3 })).toBe(false);
  });
});
