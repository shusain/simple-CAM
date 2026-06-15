import { describe, expect, it, vi } from 'vitest';
import {
  formatOperationLabel,
  getMaterialName,
  getToolName,
  updateSketchSegment,
  updateSketchStart,
} from './helpers';
import {
  makeCircleOperation,
  makeDrillOperation,
  makeLineOperation,
  makeMaterial,
  makeRectOperation,
  makeSketchOperation,
  makeTool,
} from '../../test/factories';

describe('operationsPanel helpers', () => {
  it('formats operation labels by type', () => {
    expect(formatOperationLabel(makeDrillOperation({ x: 1, y: 2 }))).toBe('Drill @ X1.00 Y2.00');
    expect(formatOperationLabel(makeLineOperation({ x1: 0, y1: 1, x2: 2, y2: 3 }))).toContain('Line (0.0, 1.0)');
    expect(formatOperationLabel(makeRectOperation({ width: -20, height: 10, cornerRadius: 2 }))).toBe(
      'Rect 20.0 x 10.0 mm R2.0'
    );
    expect(formatOperationLabel(makeCircleOperation({ radius: 4, x: 5, y: 6 }))).toBe('Circle R4.00 @ X5.0 Y6.0');
    expect(formatOperationLabel(makeSketchOperation({ closed: true }))).toBe('Sketch closed (5 segments)');
  });

  it('resolves tool and material names with fallback labels', () => {
    expect(getToolName('tool-1', [makeTool({ id: 'tool-1', name: 'Bit', diameter: 2 })])).toBe('Bit (Ø2mm)');
    expect(getToolName('missing', [])).toBe('Unassigned tool');
    expect(getMaterialName('material-1', [makeMaterial({ id: 'material-1', name: 'MDF' })])).toBe('MDF');
    expect(getMaterialName('missing', [])).toBe('Unassigned material');
  });

  it('updates sketch start and specific segments', () => {
    const sketch = makeSketchOperation({
      id: 'sketch-1',
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'arc', x1: 10, y1: 0, x2: 10, y2: 10, throughX: 15, throughY: 5 },
      ],
    });
    const onUpdateOperation = vi.fn();

    updateSketchStart(sketch, { x: 2, y: 3 }, onUpdateOperation);
    expect(onUpdateOperation).toHaveBeenCalledWith(
      'sketch-1',
      expect.objectContaining({
        segments: expect.arrayContaining([expect.objectContaining({ x1: 2, y1: 3 })]),
      })
    );

    updateSketchSegment(sketch, 1, { throughX: 20, throughY: 8 }, onUpdateOperation);
    expect(onUpdateOperation).toHaveBeenCalledWith(
      'sketch-1',
      expect.objectContaining({
        segments: expect.arrayContaining([expect.objectContaining({ throughX: 20, throughY: 8 })]),
      })
    );
  });

  it('ignores empty sketch starts and updates line segments directly', () => {
    const emptySketch = makeSketchOperation({ id: 'empty-sketch', segments: [] });
    const lineSketch = makeSketchOperation({
      id: 'line-sketch',
      segments: [{ type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }],
    });
    const onUpdateOperation = vi.fn();

    updateSketchStart(emptySketch, { x: 10 }, onUpdateOperation);
    expect(onUpdateOperation).not.toHaveBeenCalled();

    updateSketchSegment(lineSketch, 0, { x2: 8, y2: 2 }, onUpdateOperation);
    expect(onUpdateOperation).toHaveBeenCalledWith(
      'line-sketch',
      expect.objectContaining({
        segments: [{ type: 'line', x1: 0, y1: 0, x2: 8, y2: 2 }],
      })
    );
  });
});
