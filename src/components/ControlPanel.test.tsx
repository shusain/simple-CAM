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
    onCreateLaserTestPattern: vi.fn(),
    onNewProject: vi.fn(),
    onOpenProject: vi.fn(),
    onImportSvg: vi.fn(),
    onImportDxf: vi.fn(),
    onImportStl: vi.fn(),
    onImportDrl: vi.fn(),
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

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import SVG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import DXF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import STL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import DRL / Excellon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export G-code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply material to all operations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply depths to all operations' }));

    expect(props.onNewProject).toHaveBeenCalledTimes(1);
    expect(props.onOpenProject).toHaveBeenCalledTimes(1);
    expect(props.onImportSvg).toHaveBeenCalledTimes(1);
    expect(props.onImportDxf).toHaveBeenCalledTimes(1);
    expect(props.onImportStl).toHaveBeenCalledTimes(1);
    expect(props.onImportDrl).toHaveBeenCalledTimes(1);
    expect(props.onSaveProject).toHaveBeenCalledTimes(1);
    expect(props.onExportGcode).toHaveBeenCalledTimes(1);
    expect(props.onApplyMaterialToAll).toHaveBeenCalledTimes(1);
    expect(props.onApplyDepthSettingsToAll).toHaveBeenCalledTimes(1);
  });

  it('groups project file, import, and output actions into separate subsections', () => {
    render(<ControlPanel {...buildProps()} />);

    const projectFiles = screen.getByLabelText('Project file actions');
    const imports = screen.getByLabelText('Import actions');

    expect(within(projectFiles).getByRole('button', { name: 'New project' })).toBeInTheDocument();
    expect(within(projectFiles).getByRole('button', { name: 'Open project' })).toBeInTheDocument();
    expect(within(projectFiles).getByRole('button', { name: 'Save project' })).toBeInTheDocument();
    expect(within(imports).getByRole('button', { name: 'Import SVG' })).toBeInTheDocument();
    expect(within(imports).getByRole('button', { name: 'Import STL' })).toBeInTheDocument();
    expect(screen.getByText('Output')).toHaveClass('subsection-title');
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

  it('renders the left panel sections in the expected order', () => {
    const { container } = render(<ControlPanel {...buildProps()} />);

    const headers = Array.from(container.querySelectorAll('.section-header')).map((element) => element.textContent?.trim());
    expect(headers).toEqual([
      'Project',
      'Grid and snap',
      'Machine setup',
      'G-code start / end',
      'Work area',
    ]);
  });

  it('updates the remaining machine setup and feed fields', () => {
    const onSettingsChange = vi.fn();

    render(<ControlPanel {...buildProps({ onSettingsChange })} />);

    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Stock thickness'), { target: { value: '6.35' } });
    fireEvent.change(screen.getByLabelText('Margin X'), { target: { value: '7.5' } });
    fireEvent.change(screen.getByLabelText('Margin Y'), { target: { value: '-4' } });
    fireEvent.change(screen.getByLabelText('Safe Z'), { target: { value: '6.5' } });
    fireEvent.change(screen.getByLabelText('Start / end Z'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Drill depth'), { target: { value: '-4.5' } });
    fireEvent.change(screen.getByLabelText('Cut depth'), { target: { value: '-2.5' } });
    fireEvent.change(screen.getByLabelText('Rapid feed XY'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Rapid feed Z'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Cut feed'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Plunge feed'), { target: { value: '0' } });
    fireEvent.click(screen.getByLabelText('Emit spindle commands (M3/M5)'));
    fireEvent.change(screen.getByLabelText('Spindle speed'), { target: { value: '-100' } });

    expect(onSettingsChange).toHaveBeenCalledWith({ workHeight: 25 });
    expect(onSettingsChange).toHaveBeenCalledWith({ stockThickness: 6.35 });
    expect(onSettingsChange).toHaveBeenCalledWith({ marginX: 7.5 });
    expect(onSettingsChange).toHaveBeenCalledWith({ marginY: 0 });
    expect(onSettingsChange).toHaveBeenCalledWith({ safeZ: 6.5 });
    expect(onSettingsChange).toHaveBeenCalledWith({ startEndZ: 12 });
    expect(onSettingsChange).toHaveBeenCalledWith({ drillDepth: -4.5 });
    expect(onSettingsChange).toHaveBeenCalledWith({ cutDepth: -2.5 });
    expect(onSettingsChange).toHaveBeenCalledWith({ rapidFeedRate: 1 });
    expect(onSettingsChange).toHaveBeenCalledWith({ rapidFeedRateZ: 1 });
    expect(onSettingsChange).toHaveBeenCalledWith({ cutFeedRate: 1 });
    expect(onSettingsChange).toHaveBeenCalledWith({ plungeFeedRate: 1 });
    expect(onSettingsChange).toHaveBeenCalledWith({ spindleOn: true });
    expect(onSettingsChange).toHaveBeenCalledWith({ spindleSpeed: 0 });
  });

  it('updates custom start and end G-code', () => {
    const onSettingsChange = vi.fn();

    render(<ControlPanel {...buildProps({ onSettingsChange })} />);

    fireEvent.change(screen.getByLabelText('Start G-code'), {
      target: { value: 'G28\nG92 X0 Y0' },
    });
    fireEvent.change(screen.getByLabelText('End G-code'), {
      target: { value: 'M5\nM2' },
    });

    expect(onSettingsChange).toHaveBeenCalledWith({ startGcode: 'G28\nG92 X0 Y0' });
    expect(onSettingsChange).toHaveBeenCalledWith({ endGcode: 'M5\nM2' });
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

  it('stores apply-all guidance on button tooltips instead of inline panel copy', () => {
    render(<ControlPanel {...buildProps()} />);

    expect(
      screen.getByRole('button', { name: 'Apply material to all operations' })
    ).toHaveAttribute(
      'title',
      'Assigns the active material to every operation so each tool uses its material-specific feeds and stepdown settings.'
    );
    expect(
      screen.getByRole('button', { name: 'Apply depths to all operations' })
    ).toHaveAttribute(
      'title',
      'Updates all drill operations to the current drill depth and all cut operations to the current cut depth.'
    );
    expect(screen.queryByText(/assigns the active material to every operation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/updates all drill operations to the current drill depth/i)).not.toBeInTheDocument();
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

    fireEvent.click(within(modal).getByRole('button', { name: /^Finisher/ }));
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

  it('shows laser-specific tool settings', () => {
    const onUpdateTool = vi.fn();
    const onUpdateToolMaterialProfile = vi.fn();
    const laser = makeTool({
      id: 'laser-1',
      name: 'Diode laser',
      isLaser: true,
      laserInlineMode: 'continuous',
      materialProfiles: {
        'material-1': {
          cutFeedRate: null,
          plungeFeedRate: null,
          drillDepthPerPass: null,
          cutDepthPerPass: null,
          laserKerfDiameter: 0.12,
          laserCutSpeedMin: 300,
          laserCutSpeedMax: 900,
          laserCutPowerMin: 70,
          laserCutPowerMax: 100,
          laserEtchSpeedMin: 1800,
          laserEtchSpeedMax: 4200,
          laserEtchPowerMin: 15,
          laserEtchPowerMax: 45,
        },
      },
    });

    render(
      <ControlPanel
        {...buildProps({
          tools: [laser, makeTool({ id: 'tool-2' })],
          activeToolId: laser.id,
          onUpdateTool,
          onUpdateToolMaterialProfile,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Tool Manager' }));
    const modal = (screen.getByText('Tool Manager').closest('.modal-card') ?? document.body) as HTMLElement;

    expect(within(modal).getByLabelText('Kerf diameter')).toHaveValue('0.12');
    expect(within(modal).queryByLabelText('Max speed')).not.toBeInTheDocument();
    expect(within(modal).getByLabelText('Speed min')).toHaveValue('300');
    expect(within(modal).getByLabelText('Power min (%)')).toHaveValue('70');
    expect(within(modal).getByLabelText('Fill speed max')).toHaveValue('4200');
    expect(within(modal).getByLabelText('Fill power max (%)')).toHaveValue('45');
    expect(within(modal).queryByLabelText('Plunge feed')).not.toBeInTheDocument();

    fireEvent.change(within(modal).getByLabelText('Inline mode'), {
      target: { value: 'dynamic' },
    });
    expect(onUpdateTool).toHaveBeenCalledWith('laser-1', {
      laserInlineMode: 'dynamic',
    });
    fireEvent.change(within(modal).getByLabelText('Power min (%)'), {
      target: { value: '75' },
    });
    expect(onUpdateToolMaterialProfile).toHaveBeenCalledWith(
      'laser-1',
      'material-1',
      { laserCutPowerMin: 75 }
    );
    fireEvent.change(within(modal).getByLabelText('Kerf diameter'), {
      target: { value: '0.15' },
    });
    expect(onUpdateToolMaterialProfile).toHaveBeenCalledWith(
      'laser-1',
      'material-1',
      { laserKerfDiameter: 0.15 }
    );
  });

  it('shows and updates geometry-specific milling tool settings', () => {
    const onUpdateTool = vi.fn();
    const vBit = makeTool({
      id: 'v-bit-1',
      name: '60 degree V-bit',
      diameter: 12,
      millingGeometry: {
        type: 'v-bit',
        cuttingLength: 8,
        tipDiameter: 0.2,
        includedAngle: 60,
      },
    });

    render(
      <ControlPanel
        {...buildProps({
          tools: [vBit],
          activeToolId: vBit.id,
          onUpdateTool,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Tool Manager' }));
    const modal = (screen.getByText('Tool Manager').closest('.modal-card') ??
      document.body) as HTMLElement;

    expect(within(modal).getByLabelText('Milling geometry')).toHaveValue('v-bit');
    expect(within(modal).getByLabelText('Maximum diameter')).toHaveValue('12');
    expect(within(modal).getByLabelText('Cutting length')).toHaveValue('8');
    expect(within(modal).getByLabelText('Tip diameter')).toHaveValue('0.2');
    expect(within(modal).getByLabelText('Included angle')).toHaveValue('60');
    expect(within(modal).getByText(/allows up to 8 mm usable depth/)).toBeInTheDocument();

    fireEvent.change(within(modal).getByLabelText('Included angle'), {
      target: { value: '90' },
    });
    expect(onUpdateTool).toHaveBeenCalledWith('v-bit-1', {
      millingGeometry: expect.objectContaining({
        type: 'v-bit',
        includedAngle: 90,
      }),
    });

    fireEvent.change(within(modal).getByLabelText('Milling geometry'), {
      target: { value: 'chamfer' },
    });
    expect(onUpdateTool).toHaveBeenCalledWith('v-bit-1', {
      millingGeometry: expect.objectContaining({
        type: 'chamfer',
        includedAngle: 90,
      }),
    });
  });

  it('creates configurable laser test-pattern settings', () => {
    const onCreateLaserTestPattern = vi.fn();
    const laser = makeTool({
      id: 'laser-1',
      name: 'Laser',
      isLaser: true,
    });

    render(
      <ControlPanel
        {...buildProps({
          tools: [laser],
          activeToolId: laser.id,
          onCreateLaserTestPattern,
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create laser test pattern' }));
    const modal = screen.getByRole('dialog', { name: 'Laser test pattern' });
    const powerSection = within(modal).getByText('Power / rows').closest('section') as HTMLElement;
    const speedSection = within(modal).getByText('Speed / columns').closest('section') as HTMLElement;
    const sharedSection = within(modal)
      .getByText('Square and grid settings')
      .closest('section') as HTMLElement;

    expect(within(powerSection).getByLabelText('Power min (%)')).toBeInTheDocument();
    expect(within(powerSection).getByLabelText('Power rows')).toBeInTheDocument();
    expect(within(speedSection).getByLabelText('Speed min')).toBeInTheDocument();
    expect(within(speedSection).getByLabelText('Speed columns')).toBeInTheDocument();
    expect(within(sharedSection).getByLabelText('Grid gap')).toBeInTheDocument();
    expect(within(sharedSection).getByLabelText('Label power (%)')).toHaveValue('15');
    expect(within(sharedSection).getByLabelText('Label speed')).toBeInTheDocument();
    expect(within(sharedSection).getByLabelText('Line interval')).toBeInTheDocument();
    expect(within(sharedSection).getByLabelText('Overscan')).toBeInTheDocument();

    fireEvent.change(within(modal).getByLabelText('Speed columns'), {
      target: { value: '3' },
    });
    fireEvent.change(within(modal).getByLabelText('Power rows'), {
      target: { value: '4' },
    });
    fireEvent.change(within(modal).getByLabelText('Overscan'), {
      target: { value: '2.5' },
    });
    fireEvent.change(within(modal).getByLabelText('Label power (%)'), {
      target: { value: '22' },
    });
    fireEvent.change(within(modal).getByLabelText('Label speed'), {
      target: { value: '1750' },
    });
    fireEvent.click(within(modal).getByRole('button', { name: 'Create test grid' }));

    expect(onCreateLaserTestPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        process: 'etch',
        columns: 3,
        rows: 4,
        overscan: 2.5,
        labelPower: 22,
        labelSpeed: 1750,
      })
    );
  });
});
