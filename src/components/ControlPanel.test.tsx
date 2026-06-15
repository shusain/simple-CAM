import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ControlPanel from './ControlPanel';
import type { ControlPanelProps } from './controlPanel/types';
import { makeMaterial, makeSettings, makeTool } from '../test/factories';

function buildProps(overrides: Partial<ControlPanelProps> = {}): ControlPanelProps {
  const materials = overrides.materials ?? [
    makeMaterial({ id: 'material-1', name: 'Birch' }),
    makeMaterial({ id: 'material-2', name: 'Aluminum' }),
  ];
  const tools = overrides.tools ?? [
    makeTool({ id: 'tool-1', name: 'Endmill', diameter: 3.175 }),
    makeTool({ id: 'tool-2', name: 'Finisher', diameter: 1.5 }),
  ];

  return {
    settings: makeSettings(),
    onSettingsChange: vi.fn(),
    materials,
    tools,
    activeToolId: 'tool-1',
    activeMaterialId: 'material-1',
    onSelectTool: vi.fn(),
    onSelectMaterial: vi.fn(),
    onAddMaterial: vi.fn(),
    onUpdateMaterial: vi.fn(),
    onDeleteMaterial: vi.fn(),
    onAddTool: vi.fn(),
    onUpdateTool: vi.fn(),
    onUpdateToolMaterialProfile: vi.fn(),
    onDeleteTool: vi.fn(),
    onNewProject: vi.fn(),
    onOpenProject: vi.fn(),
    onSaveProject: vi.fn(),
    onExportGcode: vi.fn(),
    canSendToOctoprint: false,
    onSendToOctoprint: vi.fn(),
    onSendAndRunOctoprint: vi.fn(),
    operationCount: 2,
    onApplyDepthSettingsToAll: vi.fn(),
    onApplyMaterialToAll: vi.fn(),
    ...overrides,
  };
}

describe('ControlPanel', () => {
  it('invokes project and apply-to-all actions', () => {
    const props = buildProps();
    render(<ControlPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export G-code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply material to all operations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply depths to all operations' }));

    expect(props.onNewProject).toHaveBeenCalledTimes(1);
    expect(props.onOpenProject).toHaveBeenCalledTimes(1);
    expect(props.onSaveProject).toHaveBeenCalledTimes(1);
    expect(props.onExportGcode).toHaveBeenCalledTimes(1);
    expect(props.onApplyMaterialToAll).toHaveBeenCalledTimes(1);
    expect(props.onApplyDepthSettingsToAll).toHaveBeenCalledTimes(1);
  });

  it('updates settings and selections through form inputs', () => {
    const onSettingsChange = vi.fn();
    const onSelectTool = vi.fn();
    const onSelectMaterial = vi.fn();

    render(
      <ControlPanel
        {...buildProps({
          onSettingsChange,
          onSelectTool,
          onSelectMaterial,
        })}
      />
    );

    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Grid size'), { target: { value: '0' } });
    fireEvent.click(screen.getByLabelText('Snap to grid'));
    fireEvent.change(screen.getByLabelText('Active tool'), { target: { value: 'tool-2' } });
    fireEvent.change(screen.getByLabelText('Active material'), { target: { value: 'material-2' } });
    fireEvent.change(screen.getByLabelText('Circle segments'), { target: { value: '3' } });

    expect(onSettingsChange).toHaveBeenCalledWith({ workWidth: 10 });
    expect(onSettingsChange).toHaveBeenCalledWith({ gridSize: 0.1 });
    expect(onSettingsChange).toHaveBeenCalledWith({ snapEnabled: false });
    expect(onSelectTool).toHaveBeenCalledWith('tool-2');
    expect(onSelectMaterial).toHaveBeenCalledWith('material-2');
    expect(onSettingsChange).toHaveBeenCalledWith({ circleSegments: 8 });
  });

  it('updates the remaining machine setup and feed fields', () => {
    const onSettingsChange = vi.fn();

    render(<ControlPanel {...buildProps({ onSettingsChange })} />);

    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Safe Z'), { target: { value: '6.5' } });
    fireEvent.change(screen.getByLabelText('Start / end Z'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Drill depth'), { target: { value: '-4.5' } });
    fireEvent.change(screen.getByLabelText('Cut depth'), { target: { value: '-2.5' } });
    fireEvent.change(screen.getByLabelText('Rapid feed'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Cut feed'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Plunge feed'), { target: { value: '0' } });
    fireEvent.click(screen.getByLabelText('Emit spindle commands (M3/M5)'));
    fireEvent.change(screen.getByLabelText('Spindle speed'), { target: { value: '-100' } });

    expect(onSettingsChange).toHaveBeenCalledWith({ workHeight: 25 });
    expect(onSettingsChange).toHaveBeenCalledWith({ safeZ: 6.5 });
    expect(onSettingsChange).toHaveBeenCalledWith({ startEndZ: 12 });
    expect(onSettingsChange).toHaveBeenCalledWith({ drillDepth: -4.5 });
    expect(onSettingsChange).toHaveBeenCalledWith({ cutDepth: -2.5 });
    expect(onSettingsChange).toHaveBeenCalledWith({ rapidFeedRate: 1 });
    expect(onSettingsChange).toHaveBeenCalledWith({ cutFeedRate: 1 });
    expect(onSettingsChange).toHaveBeenCalledWith({ plungeFeedRate: 1 });
    expect(onSettingsChange).toHaveBeenCalledWith({ spindleOn: true });
    expect(onSettingsChange).toHaveBeenCalledWith({ spindleSpeed: 0 });
  });

  it('shows OctoPrint actions only when enabled', () => {
    const props = buildProps({ canSendToOctoprint: true });
    render(<ControlPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send to OctoPrint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send + Run Job' }));

    expect(props.onSendToOctoprint).toHaveBeenCalledTimes(1);
    expect(props.onSendAndRunOctoprint).toHaveBeenCalledTimes(1);
  });

  it('disables apply-all buttons when there are no operations', () => {
    render(<ControlPanel {...buildProps({ operationCount: 0 })} />);

    expect(screen.getByRole('button', { name: 'Apply material to all operations' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply depths to all operations' })).toBeDisabled();
  });

  it('opens the tool manager and updates tool/material presets', () => {
    const onAddTool = vi.fn();
    const onDeleteTool = vi.fn();
    const onUpdateTool = vi.fn();
    const onUpdateToolMaterialProfile = vi.fn();
    const onSelectTool = vi.fn();

    render(
      <ControlPanel
        {...buildProps({
          onAddTool,
          onDeleteTool,
          onUpdateTool,
          onUpdateToolMaterialProfile,
          onSelectTool,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Tool Manager' }));
    const modal = (screen.getByText('Tool Manager').closest('.modal-card') ?? document.body) as HTMLElement;

    fireEvent.click(within(modal).getByRole('button', { name: 'FinisherØ 1.5' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Add Tool' }));
    fireEvent.change(within(modal).getByLabelText('Name'), { target: { value: 'Finisher XL' } });
    const cutFeedInputs = within(modal).getAllByLabelText('Cut feed');
    fireEvent.change(cutFeedInputs[0], { target: { value: '450' } });
    fireEvent.change(cutFeedInputs[1], { target: { value: '320' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete Tool' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Set Active Tool' }));

    expect(onAddTool).toHaveBeenCalledTimes(1);
    expect(onUpdateTool).toHaveBeenCalledWith('tool-2', { name: 'Finisher XL' });
    expect(onUpdateTool).toHaveBeenCalledWith('tool-2', { cutFeedRate: 450 });
    expect(onUpdateToolMaterialProfile).toHaveBeenCalledWith('tool-2', 'material-1', { cutFeedRate: 320 });
    expect(onDeleteTool).toHaveBeenCalledWith('tool-2');
    expect(onSelectTool).toHaveBeenCalledWith('tool-2');
  });

  it('opens the material manager and updates materials', () => {
    const onAddMaterial = vi.fn();
    const onDeleteMaterial = vi.fn();
    const onUpdateMaterial = vi.fn();
    const onSelectMaterial = vi.fn();

    render(
      <ControlPanel
        {...buildProps({
          onAddMaterial,
          onDeleteMaterial,
          onUpdateMaterial,
          onSelectMaterial,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Material Manager' }));
    const modal = (screen.getByText('Material Manager').closest('.modal-card') ?? document.body) as HTMLElement;

    fireEvent.click(within(modal).getByRole('button', { name: 'Aluminum' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Add Material' }));
    fireEvent.change(within(modal).getByLabelText('Name'), { target: { value: '6061' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete Material' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Set Active Material' }));

    expect(onAddMaterial).toHaveBeenCalledTimes(1);
    expect(onUpdateMaterial).toHaveBeenCalledWith('material-2', { name: '6061' });
    expect(onDeleteMaterial).toHaveBeenCalledWith('material-2');
    expect(onSelectMaterial).toHaveBeenCalledWith('material-2');
  });

  it('falls back to the first tool and material when the active ids are missing', () => {
    render(
      <ControlPanel
        {...buildProps({
          activeToolId: 'missing-tool',
          activeMaterialId: 'missing-material',
        })}
      />
    );

    expect(screen.getByText(/Ø 3.175 \| Birch \| Cut/i)).toBeInTheDocument();
  });
});
