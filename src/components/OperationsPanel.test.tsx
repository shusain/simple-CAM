import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OperationsPanel from './OperationsPanel';
import type { OperationsPanelProps } from './operationsPanel/types';
import {
  makeCircleOperation,
  makeDrillOperation,
  makeLineOperation,
  makeMaterial,
  makeRectOperation,
  makeSketchOperation,
  makeTool,
} from '../test/factories';

function buildProps(overrides: Partial<OperationsPanelProps> = {}): OperationsPanelProps {
  const materials = [makeMaterial({ id: 'material-1', name: 'Birch' })];
  const tools = [makeTool({ id: 'tool-1', name: 'Endmill', diameter: 3.175 })];
  const operations = overrides.operations ?? [makeRectOperation({ id: 'rect-1', toolId: 'tool-1', materialId: 'material-1' })];

  return {
    operations,
    selectedOperation: overrides.selectedOperation ?? operations[0] ?? null,
    selectedOperationIds: overrides.selectedOperationIds ?? (operations[0] ? [operations[0].id] : []),
    materials,
    tools,
    onSelectOperation: vi.fn(),
    onUpdateOperation: vi.fn(),
    onDeleteOperation: vi.fn(),
    onDeleteSelection: vi.fn(),
    onMoveOperation: vi.fn(),
    onRepeatOperation: vi.fn(),
    isEditingSelectedSketch: false,
    selectedSketchSegmentIndex: null,
    onStartSketchEdit: vi.fn(),
    onStopSketchEdit: vi.fn(),
    onDeleteSelectedSketchSegment: vi.fn(),
    ...overrides,
  };
}

describe('OperationsPanel', () => {
  it('renders rect editing controls and updates toolpath/tabs fields', () => {
    const onUpdateOperation = vi.fn();
    render(<OperationsPanel {...buildProps({ onUpdateOperation })} />);

    fireEvent.change(screen.getByLabelText('Toolpath'), { target: { value: 'inside' } });
    expect(onUpdateOperation).toHaveBeenCalledWith('rect-1', { cutSide: 'inside' });

    fireEvent.click(screen.getByLabelText('Retaining tabs'));
    expect(onUpdateOperation).toHaveBeenCalledWith('rect-1', { tabsEnabled: true });
  });

  it('disables sketch toolpath selection for open sketches and starts edit mode', () => {
    const sketch = makeSketchOperation({
      id: 'sketch-1',
      closed: false,
      cutSide: 'along',
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
      ],
    });
    const onStartSketchEdit = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [sketch],
          selectedOperation: sketch,
          selectedOperationIds: [sketch.id],
          onStartSketchEdit,
        })}
      />
    );

    expect(screen.getByLabelText('Toolpath')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit sketch' }));
    expect(onStartSketchEdit).toHaveBeenCalledTimes(1);
  });

  it('shows sketch editing actions and updates sketch start/segment fields', () => {
    const sketch = makeSketchOperation({
      id: 'sketch-2',
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'arc', x1: 10, y1: 0, x2: 10, y2: 10, throughX: 14, throughY: 5 },
      ],
    });
    const onUpdateOperation = vi.fn();
    const onStopSketchEdit = vi.fn();
    const onDeleteSelectedSketchSegment = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [sketch],
          selectedOperation: sketch,
          selectedOperationIds: [sketch.id],
          isEditingSelectedSketch: true,
          selectedSketchSegmentIndex: 1,
          onUpdateOperation,
          onStopSketchEdit,
          onDeleteSelectedSketchSegment,
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('Start X'), { target: { value: '2' } });
    expect(onUpdateOperation).toHaveBeenCalledWith(
      'sketch-2',
      expect.objectContaining({
        segments: expect.arrayContaining([expect.objectContaining({ x1: 2, y1: 0 })]),
      })
    );

    fireEvent.change(screen.getByLabelText('Through X'), { target: { value: '15' } });
    expect(onUpdateOperation).toHaveBeenCalledWith(
      'sketch-2',
      expect.objectContaining({
        segments: expect.arrayContaining([expect.objectContaining({ throughX: 15 })]),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finish sketch edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected segment' }));
    expect(onStopSketchEdit).toHaveBeenCalledTimes(1);
    expect(onDeleteSelectedSketchSegment).toHaveBeenCalledTimes(1);
  });

  it('shows sketch integrity details for open and disconnected sketches', () => {
    const sketch = makeSketchOperation({
      id: 'sketch-integrity',
      closed: false,
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 },
        { type: 'line', x1: 20, y1: 0, x2: 25, y2: 0 },
      ],
    });

    render(
      <OperationsPanel
        {...buildProps({
          operations: [sketch],
          selectedOperation: sketch,
          selectedOperationIds: [sketch.id],
        })}
      />
    );

    expect(screen.getByDisplayValue('Open')).toBeInTheDocument();
    expect(screen.getByLabelText('Subpaths')).toHaveValue(2);
    expect(screen.getByText(/disconnected subpaths/i)).toBeInTheDocument();
    expect(screen.getByText(/start and end are/i)).toBeInTheDocument();
  });

  it('repeats or deletes multi-selection when no single operation is active', () => {
    const rect = makeRectOperation({ id: 'rect-a' });
    const circle = makeCircleOperation({ id: 'circle-b' });
    const onRepeatOperation = vi.fn();
    const onDeleteSelection = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [rect, circle],
          selectedOperation: null,
          selectedOperationIds: [rect.id, circle.id],
          onRepeatOperation,
          onDeleteSelection,
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('Copies'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Offset X (mm)'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText('Offset Y (mm)'), { target: { value: '-4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Repeat selected' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selection' }));

    expect(onRepeatOperation).toHaveBeenCalledWith({ count: 3, offsetX: 12.5, offsetY: -4 });
    expect(onDeleteSelection).toHaveBeenCalledTimes(1);
  });

  it('selects and reorders operations from the list', () => {
    const rect = makeRectOperation({ id: 'rect-a' });
    const circle = makeCircleOperation({ id: 'circle-b' });
    const onSelectOperation = vi.fn();
    const onMoveOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [rect, circle],
          selectedOperation: rect,
          selectedOperationIds: [rect.id],
          onSelectOperation,
          onMoveOperation,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /CIRCLE/i }));
    expect(onSelectOperation).toHaveBeenCalledWith('circle-b', { additive: false, toggle: false });

    const moveButtons = screen.getAllByTitle(/Move (up|down)/);
    fireEvent.click(moveButtons[1]);
    fireEvent.click(moveButtons[2]);
    expect(onMoveOperation).toHaveBeenNthCalledWith(1, 'rect-a', 1);
    expect(onMoveOperation).toHaveBeenNthCalledWith(2, 'circle-b', -1);
  });

  it('renders empty-state hints when there is no selection and no operations', () => {
    render(
      <OperationsPanel
        {...buildProps({
          operations: [],
          selectedOperation: null,
          selectedOperationIds: [],
        })}
      />
    );

    expect(screen.getByText('Select an operation to edit exact dimensions and depth.')).toBeInTheDocument();
    expect(screen.getByText('No operations yet. Use tools above to place drill points or cut paths.')).toBeInTheDocument();
  });

  it('updates drill coordinates and deletes the selected operation', () => {
    const drill = makeDrillOperation({ id: 'drill-a' });
    const onUpdateOperation = vi.fn();
    const onDeleteOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [drill],
          selectedOperation: drill,
          selectedOperationIds: [drill.id],
          onUpdateOperation,
          onDeleteOperation,
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('X (mm)'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText('Y (mm)'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete operation' }));

    expect(onUpdateOperation).toHaveBeenCalledWith('drill-a', { x: 12.5 });
    expect(onUpdateOperation).toHaveBeenCalledWith('drill-a', { y: 7 });
    expect(onDeleteOperation).toHaveBeenCalledWith('drill-a');
  });

  it('updates line endpoints and repeats the selected operation', () => {
    const line = makeLineOperation({ id: 'line-a' });
    const onUpdateOperation = vi.fn();
    const onRepeatOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [line],
          selectedOperation: line,
          selectedOperationIds: [line.id],
          onUpdateOperation,
          onRepeatOperation,
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('X1'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('Y1'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('X2'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Y2'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Repeat selected' }));

    expect(onUpdateOperation).toHaveBeenCalledWith('line-a', { x1: 1.5 });
    expect(onUpdateOperation).toHaveBeenCalledWith('line-a', { y1: 2.5 });
    expect(onUpdateOperation).toHaveBeenCalledWith('line-a', { x2: 8 });
    expect(onUpdateOperation).toHaveBeenCalledWith('line-a', { y2: 9 });
    expect(onRepeatOperation).toHaveBeenCalledWith({ count: 1, offsetX: 10, offsetY: 0 });
  });

  it('clamps circle radius and tab fields', () => {
    const circle = makeCircleOperation({ id: 'circle-tabs', tabsEnabled: true });
    const onUpdateOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [circle],
          selectedOperation: circle,
          selectedOperationIds: [circle.id],
          onUpdateOperation,
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('Radius'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Tab count'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Tab width'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Tab height'), { target: { value: '-1' } });

    expect(onUpdateOperation).toHaveBeenCalledWith('circle-tabs', { radius: 0.1 });
    expect(onUpdateOperation).toHaveBeenCalledWith('circle-tabs', { tabCount: 1 });
    expect(onUpdateOperation).toHaveBeenCalledWith('circle-tabs', { tabWidth: 0.1 });
    expect(onUpdateOperation).toHaveBeenCalledWith('circle-tabs', { tabHeight: 0.1 });
  });

  it('disables closing a sketch without a valid start point and supports shift-select in the list', () => {
    const invalidSketch = makeSketchOperation({ id: 'sketch-open', segments: [], closed: false });
    const other = makeRectOperation({ id: 'rect-b' });
    const onSelectOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [invalidSketch, other],
          selectedOperation: invalidSketch,
          selectedOperationIds: [invalidSketch.id],
          onSelectOperation,
        })}
      />
    );

    expect(screen.getByLabelText('Closed path')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /RECT/i }), { shiftKey: true });
    expect(onSelectOperation).toHaveBeenCalledWith('rect-b', { additive: true, toggle: true });
  });
});
