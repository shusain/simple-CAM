import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OperationsPanel from './OperationsPanel';
import type { OperationsPanelProps } from './operationsPanel/types';
import {
  makeCircleOperation,
  makeDrillOperation,
  makeImportedMesh,
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
    importedMeshes: [],
    workWidth: 300,
    workHeight: 200,
    selectedOperation: overrides.selectedOperation ?? operations[0] ?? null,
    selectedImportedMesh: null,
    selectedOperationIds: overrides.selectedOperationIds ?? (operations[0] ? [operations[0].id] : []),
    materials,
    tools,
    onSelectOperation: vi.fn(),
    onSelectImportedMesh: vi.fn(),
    onCreateSurfaceRoughOperation: vi.fn(),
    onCreateSurfaceFinishOperation: vi.fn(),
    onUpdateOperation: vi.fn(),
    onConvertDrillToCircle: vi.fn(),
    onUpdateImportedMesh: vi.fn(),
    onDeleteImportedMesh: vi.fn(),
    onDeleteOperation: vi.fn(),
    onDeleteSelection: vi.fn(),
    onMoveOperation: vi.fn(),
    onMoveOperationToEdge: vi.fn(),
    onRepeatOperation: vi.fn(),
    isEditingSelectedSketch: false,
    selectedSketchSegmentIndex: null,
    onStartSketchEdit: vi.fn(),
    onStopSketchEdit: vi.fn(),
    onDeleteSelectedSketchSegment: vi.fn(),
    ...overrides,
  };
}

function getOperationMainButton(name: RegExp): HTMLElement {
  return screen
    .getAllByRole('button', { name })
    .find((button) => button.classList.contains('operation-main')) as HTMLElement;
}

describe('OperationsPanel', () => {
  it('separates the operations list and selected details into tabs', () => {
    const rect = makeRectOperation({ id: 'rect-tabbed' });

    render(
      <OperationsPanel
        {...buildProps({
          operations: [rect],
          selectedOperation: rect,
          selectedOperationIds: [rect.id],
        })}
      />
    );

    expect(screen.getByRole('tab', { name: 'Operations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByText('Operations list')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Operations' }));

    expect(screen.getByText('Operations list')).toBeInTheDocument();
    expect(screen.queryByLabelText('Depth')).not.toBeInTheDocument();
  });

  it('renders rect editing controls and updates toolpath/tabs fields', () => {
    const onUpdateOperation = vi.fn();
    render(<OperationsPanel {...buildProps({ onUpdateOperation })} />);

    expect(screen.getByLabelText('Clear area')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Toolpath'), { target: { value: 'inside' } });
    expect(onUpdateOperation).toHaveBeenCalledWith('rect-1', { cutSide: 'inside', pocketEnabled: false });

    fireEvent.click(screen.getByLabelText('Retaining tabs'));
    expect(onUpdateOperation).toHaveBeenCalledWith('rect-1', { tabsEnabled: true });
  });

  it('shows positive depth values in the editor while storing negative depths internally', () => {
    const rect = makeRectOperation({ id: 'rect-depth', depth: -3 });
    const onUpdateOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [rect],
          selectedOperation: rect,
          selectedOperationIds: [rect.id],
          onUpdateOperation,
        })}
      />
    );

    expect(screen.getByLabelText('Depth')).toHaveValue('3');
    fireEvent.change(screen.getByLabelText('Depth'), { target: { value: '4.5' } });
    expect(onUpdateOperation).toHaveBeenCalledWith('rect-depth', { depth: -4.5 });
  });

  it('shows milling geometry details and warns when target depth exceeds the cutter profile', () => {
    const operation = makeRectOperation({
      id: 'deep-v-cut',
      depth: -3,
      toolId: 'v-bit-1',
    });
    const vBit = makeTool({
      id: 'v-bit-1',
      diameter: 10,
      millingGeometry: {
        type: 'v-bit',
        cuttingLength: 2,
        tipDiameter: 0,
        includedAngle: 90,
      },
    });

    render(
      <OperationsPanel
        {...buildProps({
          operations: [operation],
          selectedOperation: operation,
          selectedOperationIds: [operation.id],
          tools: [vBit],
        })}
      />
    );

    const geometryInfo = screen.getByLabelText('About milling tool geometry');
    fireEvent.click(geometryInfo);
    expect(screen.getByText(/V-bit \/ V-carve · max Ø10 mm/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Target depth 3 mm exceeds this cutter's 2 mm usable depth."
    );
  });

  it('edits a fixed-width V-groove and shows its geometry-derived result', () => {
    const onUpdateOperation = vi.fn();
    const operation = makeLineOperation({
      id: 'v-groove-line',
      toolId: 'v-bit-1',
      depth: -8,
      millingStrategy: 'v-groove',
      millingTargetWidth: 6,
    });
    const vBit = makeTool({
      id: 'v-bit-1',
      diameter: 12,
      millingGeometry: {
        type: 'v-bit',
        cuttingLength: 20,
        tipDiameter: 0.2,
        includedAngle: 60,
      },
    });

    render(
      <OperationsPanel
        {...buildProps({
          operations: [operation],
          selectedOperation: operation,
          selectedOperationIds: [operation.id],
          tools: [vBit],
          onUpdateOperation,
        })}
      />
    );

    expect(screen.getByLabelText('Maximum depth')).toHaveValue('8');
    expect(screen.getByLabelText('Milling strategy')).toHaveValue('v-groove');
    expect(screen.getByLabelText('Groove width')).toHaveValue('6');
    expect(screen.getByLabelText('Planned V-groove depth')).toHaveValue('5.023');
    expect(screen.getByLabelText('Planned V-groove width')).toHaveValue('6');
    expect(screen.queryByLabelText('Toolpath')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Groove width'), {
      target: { value: '7' },
    });
    expect(onUpdateOperation).toHaveBeenCalledWith('v-groove-line', {
      millingTargetWidth: 7,
    });
  });

  it('edits a chamfer edge and shows depth plus tip-compensated result', () => {
    const onUpdateOperation = vi.fn();
    const operation = makeRectOperation({
      id: 'chamfer-rect',
      toolId: 'chamfer-1',
      depth: -3,
      cutSide: 'outside',
      millingStrategy: 'chamfer-edge',
      millingTargetWidth: 2,
      tabsEnabled: false,
      pocketEnabled: false,
    });
    const chamferMill = makeTool({
      id: 'chamfer-1',
      diameter: 10,
      millingGeometry: {
        type: 'chamfer',
        cuttingLength: 10,
        tipDiameter: 2,
        includedAngle: 90,
      },
    });

    render(
      <OperationsPanel
        {...buildProps({
          operations: [operation],
          selectedOperation: operation,
          selectedOperationIds: [operation.id],
          tools: [chamferMill],
          onUpdateOperation,
        })}
      />
    );

    expect(screen.getByLabelText('Maximum depth')).toHaveValue('3');
    expect(screen.getByLabelText('Milling strategy')).toHaveValue('chamfer-edge');
    expect(screen.getByLabelText('Chamfer width')).toHaveValue('2');
    expect(screen.getByLabelText('Planned chamfer depth')).toHaveValue('2');
    expect(screen.getByLabelText('Planned chamfer width')).toHaveValue('2');
    expect(screen.getByLabelText('Toolpath')).toHaveValue('outside');
    expect(screen.queryByText('Retaining tabs')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Clear area')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Chamfer width'), {
      target: { value: '2.5' },
    });
    expect(onUpdateOperation).toHaveBeenCalledWith('chamfer-rect', {
      millingTargetWidth: 2.5,
    });
  });

  it('shows laser cut and etch parameters instead of depth controls', () => {
    const operation = makeRectOperation({
      id: 'laser-rect',
      toolId: 'laser-1',
      laserProcess: 'etch',
      laserPower: 35,
      laserSpeed: 4200,
      laserPasses: 2,
      laserLineInterval: 0.15,
      laserOverscan: 2,
    });
    const laser = makeTool({
      id: 'laser-1',
      name: 'Laser',
      isLaser: true,
      laserInlineMode: 'dynamic',
    });
    const onUpdateOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [operation],
          selectedOperation: operation,
          selectedOperationIds: [operation.id],
          tools: [laser],
          onUpdateOperation,
        })}
      />
    );

    expect(screen.queryByLabelText('Depth')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Laser process')).toHaveValue('etch');
    expect(screen.getByLabelText('Laser power')).toHaveValue('35');
    expect(screen.getByLabelText('Laser speed')).toHaveValue('4200');
    expect(screen.getByLabelText('Laser passes')).toHaveValue('2');
    expect(screen.getByLabelText('Line interval')).toHaveValue('0.15');
    expect(screen.getByLabelText('Overscan')).toHaveValue('2');
    expect(screen.getByText(/M4 I dynamic/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Editor units: distance mm · feeds mm/min · angles ° · laser power %'
    );

    const laserInfo = screen.getByLabelText('About laser output');
    expect(laserInfo.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(laserInfo);
    expect(laserInfo.closest('details')).toHaveAttribute('open');

    fireEvent.change(screen.getByLabelText('Laser power'), { target: { value: '45' } });
    expect(onUpdateOperation).toHaveBeenCalledWith('laser-rect', { laserPower: 45 });
  });

  it('offers drill conversion into an inside-cut circle operation', () => {
    const drill = makeDrillOperation({ id: 'drill-convert', x: 12, y: 18 });
    const onConvertDrillToCircle = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [drill],
          selectedOperation: drill,
          selectedOperationIds: [drill.id],
          onConvertDrillToCircle,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Convert to inside cut circle' }));

    expect(onConvertDrillToCircle).toHaveBeenCalledWith('drill-convert');
  });

  it('shows pocket controls for inside rounded rectangles', () => {
    const rect = makeRectOperation({
      id: 'rect-rounded',
      cornerRadius: 3,
    });

    render(
      <OperationsPanel
        {...buildProps({
          operations: [rect],
          selectedOperation: rect,
          selectedOperationIds: [rect.id],
        })}
      />
    );

    expect(screen.getByLabelText('Clear area')).toBeInTheDocument();
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

    expect(screen.queryByLabelText('Through X')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit segments' }));
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

  it('keeps sketch segment coordinates collapsed until requested', () => {
    const sketch = makeSketchOperation({
      id: 'sketch-collapsed',
      segments: [{ type: 'line', x1: 1, y1: 2, x2: 3, y2: 4 }],
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

    expect(screen.queryByLabelText('End X')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit segments' }));
    expect(screen.getAllByLabelText('Start X')).toHaveLength(2);
    expect(screen.getAllByLabelText('Start Y')).toHaveLength(2);
    expect(screen.getByLabelText('End X')).toBeInTheDocument();
    expect(screen.getByLabelText('End Y')).toBeInTheDocument();
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

  it('creates STL surface operations from imported mesh details and edits their fields', () => {
    const importedMesh = makeImportedMesh({ id: 'mesh-1', name: 'Hold Down' });
    const roughOperation = {
      id: 'surface-rough-1',
      type: 'surface-rough' as const,
      meshId: 'mesh-1',
      depth: -3,
      stepOver: 1.5,
      stockToLeave: 0.25,
      toolId: 'tool-1',
      materialId: 'material-1',
    };
    const onCreateSurfaceRoughOperation = vi.fn();
    const onCreateSurfaceFinishOperation = vi.fn();
    const onUpdateOperation = vi.fn();

    const { rerender } = render(
      <OperationsPanel
        {...buildProps({
          operations: [],
          importedMeshes: [importedMesh],
          selectedOperation: null,
          selectedImportedMesh: importedMesh,
          selectedOperationIds: [],
          onCreateSurfaceRoughOperation,
          onCreateSurfaceFinishOperation,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create surface roughing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create surface finishing' }));

    expect(onCreateSurfaceRoughOperation).toHaveBeenCalledWith('mesh-1');
    expect(onCreateSurfaceFinishOperation).toHaveBeenCalledWith('mesh-1');

    rerender(
      <OperationsPanel
        {...buildProps({
          operations: [roughOperation],
          importedMeshes: [importedMesh],
          selectedOperation: roughOperation,
          selectedOperationIds: [roughOperation.id],
          selectedImportedMesh: null,
          onUpdateOperation,
        })}
      />
    );

    expect(screen.getByDisplayValue('Hold Down')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Step-over'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Stock to leave'), { target: { value: '0.4' } });

    expect(onUpdateOperation).toHaveBeenCalledWith('surface-rough-1', { stepOver: 2 });
    expect(onUpdateOperation).toHaveBeenCalledWith('surface-rough-1', { stockToLeave: 0.4 });
  });

  it('edits surface finishing pattern settings', () => {
    const importedMesh = makeImportedMesh({ id: 'mesh-1', name: 'Hold Down' });
    const finishOperation = {
      id: 'surface-finish-1',
      type: 'surface-finish' as const,
      meshId: 'mesh-1',
      depth: -3,
      stepOver: 0.8,
      pattern: 'crosshatch' as const,
      toolId: 'tool-1',
      materialId: 'material-1',
    };
    const onUpdateOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [finishOperation],
          importedMeshes: [importedMesh],
          selectedOperation: finishOperation,
          selectedOperationIds: [finishOperation.id],
          selectedImportedMesh: null,
          onUpdateOperation,
        })}
      />
    );

    expect(screen.getByDisplayValue('Hold Down')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Finish pattern'), { target: { value: 'y' } });
    fireEvent.change(screen.getByLabelText('Step-over'), { target: { value: '0.4' } });

    expect(onUpdateOperation).toHaveBeenCalledWith('surface-finish-1', { pattern: 'y' });
    expect(onUpdateOperation).toHaveBeenCalledWith('surface-finish-1', { stepOver: 0.4 });
  });

  it('treats geometrically closed sketches as closed for cut-side and pocket controls', () => {
    const sketch = makeSketchOperation({
      id: 'sketch-detected-closed',
      closed: false,
      cutSide: 'outside',
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
        { type: 'line', x1: 10, y1: 10, x2: 0, y2: 10 },
        { type: 'line', x1: 0, y1: 10, x2: 0, y2: 0 },
      ],
    });
    const onUpdateOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [sketch],
          selectedOperation: sketch,
          selectedOperationIds: [sketch.id],
          onUpdateOperation,
        })}
      />
    );

    expect(screen.getByLabelText('Toolpath')).toBeEnabled();
    expect(screen.getByLabelText('Clear area')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Clear area'));
    expect(onUpdateOperation).toHaveBeenCalledWith('sketch-detected-closed', {
      closed: true,
      cutSide: 'inside',
      pocketEnabled: true,
    });
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
    fireEvent.change(screen.getByLabelText('Offset X'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText('Offset Y'), { target: { value: '-4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Repeat selected' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selection' }));

    expect(onRepeatOperation).toHaveBeenCalledWith({ count: 3, offsetX: 12.5, offsetY: -4 });
    expect(onDeleteSelection).toHaveBeenCalledTimes(1);
  });

  it('supports bulk editing shared circle values across a multi-selection', () => {
    const circleA = makeCircleOperation({ id: 'circle-a', radius: 4, pocketStepOver: 1.5 });
    const circleB = makeCircleOperation({ id: 'circle-b', radius: 4, pocketStepOver: 1.5 });
    const onUpdateOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [circleA, circleB],
          selectedOperation: null,
          selectedOperationIds: [circleA.id, circleB.id],
          onUpdateOperation,
        })}
      />
    );

    expect(screen.getByLabelText('Radius')).toHaveValue('4');
    expect(screen.getByLabelText('Pocket step-over')).toHaveValue('1.5');

    fireEvent.change(screen.getByLabelText('Radius'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Pocket step-over'), { target: { value: '2.25' } });

    expect(onUpdateOperation).toHaveBeenCalledWith('circle-a', { radius: 6 });
    expect(onUpdateOperation).toHaveBeenCalledWith('circle-b', { radius: 6 });
    expect(onUpdateOperation).toHaveBeenCalledWith('circle-a', { pocketStepOver: 2.25 });
    expect(onUpdateOperation).toHaveBeenCalledWith('circle-b', { pocketStepOver: 2.25 });
  });

  it('shows blank bulk circle fields when selected values are mixed', () => {
    const circleA = makeCircleOperation({ id: 'circle-a', radius: 4, pocketStepOver: 1.5 });
    const circleB = makeCircleOperation({ id: 'circle-b', radius: 6, pocketStepOver: 2 });

    render(
      <OperationsPanel
        {...buildProps({
          operations: [circleA, circleB],
          selectedOperation: null,
          selectedOperationIds: [circleA.id, circleB.id],
        })}
      />
    );

    expect(screen.getByLabelText('Radius')).toHaveValue('');
    expect(screen.getByLabelText('Pocket step-over')).toHaveValue('');
  });

  it('selects and reorders operations from the list', () => {
    const rect = makeRectOperation({ id: 'rect-a' });
    const circle = makeCircleOperation({ id: 'circle-b' });
    const onSelectOperation = vi.fn();
    const onMoveOperation = vi.fn();
    const onMoveOperationToEdge = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [rect, circle],
          selectedOperation: rect,
          selectedOperationIds: [rect.id],
          onSelectOperation,
          onMoveOperation,
          onMoveOperationToEdge,
        })}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Operations' }));
    fireEvent.click(getOperationMainButton(/CIRCLE/i));
    expect(onSelectOperation).toHaveBeenCalledWith('circle-b', { additive: false, toggle: false, range: false });

    const moveButtons = screen.getAllByTitle(/Move (up|down)/);
    fireEvent.click(moveButtons[1]);
    fireEvent.click(moveButtons[2]);
    fireEvent.click(screen.getAllByTitle('Move to bottom')[0] as HTMLElement);
    fireEvent.click(screen.getAllByTitle('Move to top')[1] as HTMLElement);
    expect(onMoveOperation).toHaveBeenNthCalledWith(1, 'rect-a', 1);
    expect(onMoveOperation).toHaveBeenNthCalledWith(2, 'circle-b', -1);
    expect(onMoveOperationToEdge).toHaveBeenNthCalledWith(1, 'rect-a', 'bottom');
    expect(onMoveOperationToEdge).toHaveBeenNthCalledWith(2, 'circle-b', 'top');
  });

  it('supports browser-style range/toggle selection and double-click to details', () => {
    const rect = makeRectOperation({ id: 'rect-a' });
    const circle = makeCircleOperation({ id: 'circle-b' });
    const drill = makeDrillOperation({ id: 'drill-c' });
    const onSelectOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [rect, circle, drill],
          selectedOperation: rect,
          selectedOperationIds: [rect.id],
          onSelectOperation,
        })}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Operations' }));
    fireEvent.click(getOperationMainButton(/CIRCLE/i), { shiftKey: true });
    fireEvent.click(getOperationMainButton(/DRILL/i), { ctrlKey: true });
    fireEvent.doubleClick(getOperationMainButton(/RECT/i));

    expect(onSelectOperation).toHaveBeenNthCalledWith(1, 'circle-b', { additive: false, toggle: false, range: true });
    expect(onSelectOperation).toHaveBeenNthCalledWith(2, 'drill-c', { additive: false, toggle: true, range: false });
    expect(onSelectOperation).toHaveBeenLastCalledWith('rect-a');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
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

    expect(screen.getByRole('tab', { name: 'Operations' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Details' })).not.toBeInTheDocument();
    expect(screen.getByText('No operations yet. Use tools above to place drill points or cut paths.')).toBeInTheDocument();
  });

  it('shows imported STL meshes in the list and details panel', () => {
    const mesh = makeImportedMesh({ id: 'mesh-hold-down', name: 'Hold Down STL' });
    const onSelectImportedMesh = vi.fn();
    const onUpdateImportedMesh = vi.fn();
    const onDeleteImportedMesh = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [],
          importedMeshes: [mesh],
          selectedOperation: null,
          selectedImportedMesh: mesh,
          selectedOperationIds: [],
          onSelectImportedMesh,
          onUpdateImportedMesh,
          onDeleteImportedMesh,
        })}
      />
    );

    expect(screen.getByText('Selected: STL MESH')).toBeInTheDocument();
    expect(screen.getByLabelText('Triangles')).toHaveValue(2);
    fireEvent.change(screen.getByLabelText('Center X'), { target: { value: '125' } });
    expect(onUpdateImportedMesh).toHaveBeenCalledWith(
      'mesh-hold-down',
      expect.objectContaining({ placement: expect.objectContaining({ x: 125 }) })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Center on stock' }));
    expect(onUpdateImportedMesh).toHaveBeenCalledWith('mesh-hold-down', {
      placement: { x: 150, y: 100 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete imported mesh' }));
    expect(onDeleteImportedMesh).toHaveBeenCalledWith('mesh-hold-down');

    fireEvent.click(screen.getByRole('tab', { name: 'Operations' }));
    fireEvent.click(screen.getByRole('button', { name: /Hold Down STL/i }));
    expect(onSelectImportedMesh).toHaveBeenCalledWith('mesh-hold-down');
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

    fireEvent.change(screen.getByLabelText('X'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText('Y'), { target: { value: '7' } });
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

  it('shows inside-pocket controls for closed cutouts and hides tabs while clearing area', () => {
    const sketch = makeSketchOperation({
      id: 'sketch-pocket',
      closed: true,
      cutSide: 'inside',
      pocketEnabled: true,
      pocketStepOver: 0.8,
      tabsEnabled: true,
    });
    const onUpdateOperation = vi.fn();

    render(
      <OperationsPanel
        {...buildProps({
          operations: [sketch],
          selectedOperation: sketch,
          selectedOperationIds: [sketch.id],
          onUpdateOperation,
        })}
      />
    );

    expect(screen.getByLabelText('Clear area')).toBeChecked();
    expect(screen.getByLabelText('Step-over')).toHaveValue('0.8');
    expect(screen.queryByLabelText('Retaining tabs')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Step-over'), { target: { value: '1.25' } });
    expect(onUpdateOperation).toHaveBeenCalledWith('sketch-pocket', { pocketStepOver: 1.25 });
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
    fireEvent.click(screen.getByRole('tab', { name: 'Operations' }));
    fireEvent.click(getOperationMainButton(/RECT/i), { shiftKey: true });
    expect(onSelectOperation).toHaveBeenCalledWith('rect-b', { additive: false, toggle: false, range: true });
  });
});
