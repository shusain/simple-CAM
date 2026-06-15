import React, { useMemo, useState } from 'react';
import { resolveToolPreset } from '../utils/tooling';
import NumberField from './controlPanel/NumberField';
import MaterialManagerModal from './controlPanel/MaterialManagerModal';
import ToolManagerModal from './controlPanel/ToolManagerModal';
import type { ControlPanelProps } from './controlPanel/types';

export default function ControlPanel({
  settings,
  onSettingsChange,
  materials,
  tools,
  activeToolId,
  activeMaterialId,
  onSelectTool,
  onSelectMaterial,
  onAddMaterial,
  onUpdateMaterial,
  onDeleteMaterial,
  onAddTool,
  onUpdateTool,
  onUpdateToolMaterialProfile,
  onDeleteTool,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onExportGcode,
  canSendToOctoprint,
  onSendToOctoprint,
  onSendAndRunOctoprint,
  operationCount,
  onApplyDepthSettingsToAll,
  onApplyMaterialToAll,
  showToolpathPreview,
  onToggleToolpathPreview,
}: ControlPanelProps): React.JSX.Element {
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const activeTool = tools.find((tool) => tool.id === activeToolId) || tools[0];
  const activeMaterial = materials.find((material) => material.id === activeMaterialId) || materials[0];
  const activePreset = useMemo(
    () => resolveToolPreset(activeTool, activeMaterial?.id, settings),
    [activeMaterial?.id, activeTool, settings]
  );

  return (
    <div className="panel">
      <div className="section-block">
        <div className="section-header">Project</div>
        <div className="button-column">
          <button type="button" onClick={onNewProject}>
            New
          </button>
          <button type="button" onClick={onOpenProject}>
            Open
          </button>
          <button type="button" onClick={onSaveProject}>
            Save
          </button>
          <button type="button" className="accent" onClick={onExportGcode}>
            Export G-code
          </button>
          {canSendToOctoprint ? (
            <>
              <button type="button" onClick={onSendToOctoprint}>
                Send to OctoPrint
              </button>
              <button type="button" className="accent" onClick={onSendAndRunOctoprint}>
                Send + Run Job
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="section-block">
        <div className="section-header">Work area</div>
        <p className="section-note">Distance units are millimeters.</p>
        <NumberField
          label="Width"
          value={settings.workWidth}
          min={10}
          step={1}
          onChange={(value) => onSettingsChange({ workWidth: Math.max(10, value || 10) })}
        />
        <NumberField
          label="Height"
          value={settings.workHeight}
          min={10}
          step={1}
          onChange={(value) => onSettingsChange({ workHeight: Math.max(10, value || 10) })}
        />
      </div>

      <div className="section-block">
        <div className="section-header">Tools</div>
        <label className="field-row">
          <span>Active tool</span>
          <select value={activeToolId} onChange={(event) => onSelectTool(event.target.value)}>
            {tools.map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.name}
              </option>
            ))}
          </select>
        </label>
        {activeTool ? (
          <p className="section-note">
            Ø {activeTool.diameter} | {activeMaterial?.name || 'Material'} | Cut {activePreset.cutFeedRate} |
            {' '}Plunge {activePreset.plungeFeedRate}
          </p>
        ) : null}
        <button type="button" onClick={() => setIsToolModalOpen(true)}>
          Open Tool Manager
        </button>
      </div>

      <div className="section-block">
        <div className="section-header">Grid and snap</div>
        <p className="section-note">Distance units are millimeters.</p>
        <NumberField
          label="Grid size"
          value={settings.gridSize}
          min={0.1}
          step={0.1}
          onChange={(value) => onSettingsChange({ gridSize: Math.max(0.1, value || 0.1) })}
        />
        <label className="field-row checkbox-row">
          <span>Snap to grid</span>
          <input
            type="checkbox"
            checked={settings.snapEnabled}
            onChange={(event) => onSettingsChange({ snapEnabled: event.target.checked })}
          />
        </label>
      </div>

      <div className="section-block">
        <div className="section-header">Preview</div>
        <label className="field-row checkbox-row">
          <span>Show toolpath preview</span>
          <input
            type="checkbox"
            checked={showToolpathPreview}
            onChange={(event) => onToggleToolpathPreview(event.target.checked)}
          />
        </label>
        <p className="section-note">
          Shows the current planned XY tool-center path, rapid links, and retaining tab locations.
        </p>
      </div>

      <div className="section-block">
        <div className="section-header">Machine setup</div>
        <p className="section-note">Distance in mm. Feeds are in mm/min.</p>

        <div className="subsection-title">Material</div>
        <label className="field-row">
          <span>Active material</span>
          <select
            value={activeMaterialId}
            onChange={(event) => onSelectMaterial(event.target.value)}
          >
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setIsMaterialModalOpen(true)}>
          Open Material Manager
        </button>
        <button
          type="button"
          className="accent"
          onClick={onApplyMaterialToAll}
          disabled={operationCount === 0}
        >
          Apply material to all operations
        </button>
        <p className="section-note">
          Assigns the active material to every operation so each tool uses its material-specific feeds and
          stepdown settings.
        </p>

        <div className="subsection-title">Depth and Z</div>
        <NumberField
          label="Safe Z"
          value={settings.safeZ}
          step={0.1}
          onChange={(value) => onSettingsChange({ safeZ: value || 0 })}
        />
        <NumberField
          label="Start / end Z"
          value={settings.startEndZ}
          step={0.1}
          onChange={(value) => onSettingsChange({ startEndZ: value || 0 })}
        />
        <NumberField
          label="Drill depth"
          value={settings.drillDepth}
          step={0.1}
          onChange={(value) => onSettingsChange({ drillDepth: value || 0 })}
        />
        <NumberField
          label="Cut depth"
          value={settings.cutDepth}
          step={0.1}
          onChange={(value) => onSettingsChange({ cutDepth: value || 0 })}
        />
        <button
          type="button"
          className="accent"
          onClick={onApplyDepthSettingsToAll}
          disabled={operationCount === 0}
        >
          Apply depths to all operations
        </button>
        <p className="section-note">
          Updates all drill operations to the current drill depth and all cut operations to the current cut
          depth.
        </p>

        <div className="subsection-title">Feeds</div>
        <NumberField
          label="Rapid feed"
          value={settings.rapidFeedRate}
          min={1}
          step={1}
          onChange={(value) => onSettingsChange({ rapidFeedRate: Math.max(1, value || 1) })}
        />
        <NumberField
          label="Cut feed"
          value={settings.cutFeedRate}
          min={1}
          step={1}
          onChange={(value) => onSettingsChange({ cutFeedRate: Math.max(1, value || 1) })}
        />
        <NumberField
          label="Plunge feed"
          value={settings.plungeFeedRate}
          min={1}
          step={1}
          onChange={(value) => onSettingsChange({ plungeFeedRate: Math.max(1, value || 1) })}
        />

        <div className="subsection-title">Curve quality and spindle</div>
        <NumberField
          label="Circle segments"
          value={settings.circleSegments}
          min={8}
          step={1}
          onChange={(value) => onSettingsChange({ circleSegments: Math.max(8, Math.round(value || 8)) })}
        />
        <label className="field-row checkbox-row">
          <span>Emit spindle commands (M3/M5)</span>
          <input
            type="checkbox"
            checked={settings.spindleOn}
            onChange={(event) => onSettingsChange({ spindleOn: event.target.checked })}
          />
        </label>
        <NumberField
          label="Spindle speed"
          value={settings.spindleSpeed}
          min={0}
          step={100}
          onChange={(value) => onSettingsChange({ spindleSpeed: Math.max(0, Math.round(value || 0)) })}
        />
      </div>

      <ToolManagerModal
        isOpen={isToolModalOpen}
        onClose={() => setIsToolModalOpen(false)}
        tools={tools}
        materials={materials}
        settings={settings}
        activeToolId={activeToolId}
        activeMaterialId={activeMaterialId}
        onSelectTool={onSelectTool}
        onAddTool={onAddTool}
        onUpdateTool={onUpdateTool}
        onUpdateToolMaterialProfile={onUpdateToolMaterialProfile}
        onDeleteTool={onDeleteTool}
      />

      <MaterialManagerModal
        isOpen={isMaterialModalOpen}
        onClose={() => setIsMaterialModalOpen(false)}
        materials={materials}
        activeMaterialId={activeMaterialId}
        onSelectMaterial={onSelectMaterial}
        onAddMaterial={onAddMaterial}
        onUpdateMaterial={onUpdateMaterial}
        onDeleteMaterial={onDeleteMaterial}
      />
    </div>
  );
}
