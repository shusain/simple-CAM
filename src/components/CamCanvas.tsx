import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  clamp,
  deriveSketchState,
  distance,
  getOperationBounds,
  getSketchSegments,
  hitTestOperation,
  normalizeRect,
  snapPoint,
} from '../utils/geometry';
import type {
  DrawDraft,
  Operation,
  Point,
  SelectBoxState,
  SketchOperation,
} from '../types';
import type {
  CamCanvasProps,
  InteractionState,
  SketchArcInsertDraft,
  ViewState,
  ViewportSize,
} from './canvas/types';
import { buildTransform, canvasToWorld, clampCenter } from './canvas/viewport';
import { renderCanvasScene } from './canvas/drawing';
import { buildCanvasOverlayHints } from './canvas/overlay';
import {
  buildNextArcInsertDraft,
  buildNextLineInsertDraft,
  buildStandaloneSegment,
  createEmptyInteractionState,
  defocusActiveEditor,
  findSketchHandleHit,
  findSketchSegmentHit,
  getDraftSketchCurrentPoint,
  isSketchTool,
  offsetOperation,
  rectsOverlap,
  switchSketchInsertDraftMode,
  updateSketchHandle,
} from './canvas/sketchEditing';

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 14;

export default function CamCanvas({
  activeTool,
  settings,
  operations,
  transformPreviewOperations,
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
  onPointerUpdate,
  onCommitTransformPreview,
  sketchEdit,
  onUpdateOperation,
  onSelectSketchSegment,
  showToolpathPreview,
  toolpathPreview,
  transformHint,
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

    setSketchArcInsertDraft((current) => switchSketchInsertDraftMode(current, activeTool));
  }, [activeTool, editingSketchOperation]);

  function finishOpenSketchDraft(currentDraft: Extract<DrawDraft, { type: 'sketch' }>): void {
    const segments = currentDraft.segments || [];
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
        pocketEnabled: false,
        pocketStepOver: 0,
        depth: settings.cutDepth,
        toolId: activeToolId,
        materialId: activeMaterialId,
      });
      onSelectOperation(id);
    }
    setDraft(null);
  }

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
  const overlayHints = useMemo(
    () =>
      buildCanvasOverlayHints({
        activeTool,
        draft,
        editingSketchOperation,
        pastePreview,
        transformHint,
      }),
    [activeTool, draft, editingSketchOperation, pastePreview, transformHint]
  );

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
    renderCanvasScene({
      canvas,
      transform,
      gridSize: settings.gridSize,
      workHeight: settings.workHeight,
      workWidth: settings.workWidth,
      operations,
      transformPreviewOperations,
      toolpathPreview: showToolpathPreview ? toolpathPreview : null,
      selectedIds: selectedSet,
      pastePreviewOperations,
      draft,
      selectBox,
      editingSketchOperation,
      selectedSegmentIndex: sketchEdit.selectedSegmentIndex,
      pointerMm,
      activeTool,
      sketchArcInsertDraft,
    });
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
    showToolpathPreview,
    transformPreviewOperations,
    toolpathPreview,
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
        if (draft?.type === 'sketch') {
          event.preventDefault();
          finishOpenSketchDraft(draft);
          return;
        }
        if (editingSketchOperation && sketchArcInsertDraft) {
          event.preventDefault();
          setSketchArcInsertDraft(null);
          return;
        }
        interactionRef.current = createEmptyInteractionState();
        setDraft(null);
        setSelectBox(null);
        return;
      }

      if (event.key === 'Enter' && draft?.type === 'sketch') {
        event.preventDefault();
        finishOpenSketchDraft(draft);
        return;
      }

      if (event.key === 'Enter' && editingSketchOperation && sketchArcInsertDraft) {
        event.preventDefault();
        setSketchArcInsertDraft(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeMaterialId,
    activeToolId,
    draft,
    editingSketchOperation,
    finishOpenSketchDraft,
    onAddOperation,
    onSelectOperation,
    settings.cutDepth,
    sketchArcInsertDraft,
  ]);

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

    const rawPoint = getPointerPoint(event, false);
    const point = getPointerPoint(event, true);
    setPointerMm(point);
    onPointerUpdate(point);

    if (editingSketchOperation) {
      if (activeTool === 'select') {
        const handleToleranceMm = Math.max(1.5, 8 / transform.scale);
        const handleHit = findSketchHandleHit(editingSketchOperation, rawPoint, handleToleranceMm, transform.scale);
        if (handleHit) {
          interactionRef.current = {
            mode: 'drag-handle',
            pointerId: event.pointerId,
            start: rawPoint,
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

        const segmentHit = findSketchSegmentHit(editingSketchOperation, rawPoint, Math.max(1.5, 6 / transform.scale));
        if (segmentHit) {
          onSelectSketchSegment(segmentHit.index);
          return;
        }
        onSelectSketchSegment(null);
        return;
      }

      if (activeTool === 'sketch') {
        const closeToleranceMm = Math.max(1.5, 10 / transform.scale);
        const nextInsert = buildNextLineInsertDraft(sketchArcInsertDraft, point, closeToleranceMm);

        if (nextInsert.newSegment) {
          onUpdateOperation(
            editingSketchOperation.id,
            deriveSketchState(editingSketchOperation, [
              ...getSketchSegments(editingSketchOperation),
              nextInsert.newSegment,
            ])
          );
          if (event.detail >= 2) {
            setSketchArcInsertDraft(null);
          } else {
            setSketchArcInsertDraft(nextInsert.nextDraft);
          }
        } else {
          setSketchArcInsertDraft(nextInsert.nextDraft);
        }
        return;
      }

      if (activeTool === 'arc') {
        const closeToleranceMm = Math.max(1.5, 10 / transform.scale);
        const nextInsert = buildNextArcInsertDraft(sketchArcInsertDraft, point, closeToleranceMm);

        if (nextInsert.newSegment) {
          onUpdateOperation(
            editingSketchOperation.id,
            deriveSketchState(editingSketchOperation, [
              ...getSketchSegments(editingSketchOperation),
              nextInsert.newSegment,
            ])
          );
          if (event.detail >= 2) {
            setSketchArcInsertDraft(null);
          } else {
            setSketchArcInsertDraft(nextInsert.nextDraft);
          }
        } else {
          setSketchArcInsertDraft(nextInsert.nextDraft);
        }
        return;
      }
    }

    if (pastePreview && activeTool === 'select' && event.button === 0) {
      onPlacePaste(point);
      return;
    }

    if (transformPreviewOperations.length > 0 && event.button === 0) {
      onCommitTransformPreview();
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
          pocketEnabled: false,
          pocketStepOver: 0,
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
          pocketEnabled: false,
          pocketStepOver: 0,
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
    const rawPoint = getPointerPoint(event, false);
    const point = getPointerPoint(event, true);
    setPointerMm(point);
    onPointerUpdate(point);
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
      onUpdateOperation(editingSketchOperation.id, deriveSketchState(updated, updated.segments));
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
          pocketEnabled: false,
          pocketStepOver: 0,
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
          pocketEnabled: false,
          pocketStepOver: 0,
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
        {overlayHints.map((hint) => (
          <span key={hint}>{hint}</span>
        ))}
      </div>
    </div>
  );
}
