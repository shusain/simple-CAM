import { describe, expect, it } from 'vitest';
import type { DrawDraft, SketchOperation } from '../../types';
import { buildCanvasOverlayHints } from './overlay';

function makeSketchDraft(): DrawDraft {
  return {
    type: 'sketch',
    startPoint: { x: 0, y: 0 },
    current: { x: 5, y: 0 },
    pendingArcEnd: null,
    segments: [],
  };
}

function makeEditingSketch(): SketchOperation {
  return {
    id: 'sketch-1',
    type: 'sketch',
    segments: [],
    closed: false,
    cutSide: 'along',
    tabsEnabled: false,
    tabCount: 2,
    tabWidth: 1,
    tabHeight: 1,
    pocketEnabled: false,
    pocketStepOver: 0.5,
    depth: -2,
  };
}

describe('buildCanvasOverlayHints', () => {
  it('shows select-specific guidance instead of static selection text for every tool', () => {
    const hints = buildCanvasOverlayHints({
      activeTool: 'drill',
      draft: null,
      editingSketchOperation: null,
      pastePreview: null,
      transformHint: null,
    });

    expect(hints[0]).toContain('Drill (Ctrl+2)');
    expect(hints.join(' ')).not.toContain('Shift + click adds selection');
    expect(hints).toContain('Pan: Alt/middle/right drag to pan');
  });

  it('prefers sketch-draft guidance while a sketch is being drawn', () => {
    const hints = buildCanvasOverlayHints({
      activeTool: 'sketch',
      draft: makeSketchDraft(),
      editingSketchOperation: null,
      pastePreview: null,
      transformHint: null,
    });

    expect(hints[0]).toContain('Sketch in progress');
  });

  it('shows edit-mode arc guidance for sketch arc insertion', () => {
    const hints = buildCanvasOverlayHints({
      activeTool: 'arc',
      draft: null,
      editingSketchOperation: makeEditingSketch(),
      pastePreview: null,
      transformHint: null,
    });

    expect(hints[0]).toContain('Poly-Arc (Ctrl+3)');
    expect(hints[0]).toContain('bulge point');
  });

  it('prioritizes paste mode messaging over tool-specific hints', () => {
    const hints = buildCanvasOverlayHints({
      activeTool: 'select',
      draft: null,
      editingSketchOperation: null,
      pastePreview: {
        anchor: { x: 0, y: 0 },
        operations: [],
      },
      transformHint: null,
    });

    expect(hints[0]).toContain('Paste mode');
  });

  it('prioritizes active transform hints over tool hints', () => {
    const hints = buildCanvasOverlayHints({
      activeTool: 'select',
      draft: null,
      editingSketchOperation: null,
      pastePreview: null,
      transformHint: 'Grab X [10]',
    });

    expect(hints[0]).toContain('Grab X [10]');
  });
});
