import type { DrawDraft, PastePreview, SketchOperation } from '../../types';
import type { CanvasTool } from './types';

interface BuildCanvasOverlayHintsArgs {
  activeTool: CanvasTool;
  draft: DrawDraft | null;
  editingSketchOperation: SketchOperation | null;
  pastePreview: PastePreview | null;
  transformHint: string | null;
}

export function buildCanvasOverlayHints({
  activeTool,
  draft,
  editingSketchOperation,
  pastePreview,
  transformHint,
}: BuildCanvasOverlayHintsArgs): string[] {
  const hints: string[] = ['Pan: Alt/middle/right drag to pan'];

  if (transformHint) {
    hints.unshift(transformHint);
    return hints;
  }

  if (pastePreview) {
    hints.unshift('Paste mode: click to place copied operations (Esc to cancel)');
    return hints;
  }

  if (draft?.type === 'sketch') {
    hints.unshift('Sketch in progress: click to chain segments, click the first point to close, Enter to finish open');
    return hints;
  }

  if (editingSketchOperation) {
    if (activeTool === 'select') {
      hints.unshift('Sketch select (Ctrl+1): drag handles to move points, click a segment to select it');
      return hints;
    }

    if (activeTool === 'sketch') {
      hints.unshift(
        'Poly-Line (Ctrl+2): click to chain replacement segments, click the first point to close, Enter, Esc, or double-click to finish open'
      );
      return hints;
    }

    if (activeTool === 'arc') {
      hints.unshift(
        'Poly-Arc (Ctrl+3): click an end point, then a bulge point, click the first point to close, Enter, Esc, or double-click to finish open'
      );
      return hints;
    }
  }

  switch (activeTool) {
    case 'select':
      hints.unshift('Select (Ctrl+1): Shift + click adds selection, drag empty space for box select');
      return hints;
    case 'drill':
      hints.unshift('Drill (Ctrl+2): click to place a drill operation');
      return hints;
    case 'line':
      hints.unshift('Cut Line (Ctrl+3): click and drag to define a line cut');
      return hints;
    case 'text':
      hints.unshift('Text (Ctrl+4): click to place editable text');
      return hints;
    case 'sketch':
      hints.unshift(
        'New Sketch (Ctrl+5): click to place the first point, continue clicking to build the path, then click the first point again to close it'
      );
      return hints;
    case 'arc':
      hints.unshift('Poly-Arc: start or edit a sketch first, then place arc end and bulge points');
      return hints;
    case 'rect':
      hints.unshift('Cut Rect (Ctrl+6): click and drag to define a rectangle profile');
      return hints;
    case 'circle':
      hints.unshift('Cut Circle (Ctrl+7): click and drag from center to define the radius');
      return hints;
    default:
      return hints;
  }
}
