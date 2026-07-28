import React, { useState } from 'react';
import {
  Box,
  FileInput,
  FileOutput,
  FilePlus2,
  FolderOpen,
  Image as ImageIcon,
  Save,
  Target,
} from 'lucide-react';
import NumberField from './controlPanel/NumberField';
import MaterialManagerModal from './controlPanel/MaterialManagerModal';
import ToolManagerModal from './controlPanel/ToolManagerModal';
import LaserTestPatternModal from './controlPanel/LaserTestPatternModal';
import InfoDisclosure from './common/InfoDisclosure';
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
  onCreateLaserTestPattern,
  onNewProject,
  onOpenProject,
  onImportSvg,
  onImportDxf,
  onImportStl,
  onImportDrl,
  onImportRasterImage,
  onSaveProject,
  onExportGcode,
  canSendToOctoprint,
  onSendToOctoprint,
  onSendAndRunOctoprint,
  operationCount,
  onApplyDepthSettingsToAll,
}: ControlPanelProps): React.JSX.Element {
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isLaserTestModalOpen, setIsLaserTestModalOpen] = useState(false);
  const activeTool = tools.find((tool) => tool.id === activeToolId) || tools[0];
  const activeMaterial = materials.find((material) => material.id === activeMaterialId) || materials[0];

  return (
    <div className="panel">
      <div className="section-block">
        <div className="section-header">Project</div>
        <div className="subsection-title">Project files</div>
        <div className="project-action-row project-file-actions" aria-label="Project file actions">
          <button type="button" className="icon-button" aria-label="New project" title="New project" onClick={onNewProject}>
            <FilePlus2 aria-hidden="true" size={18} />
          </button>
          <button type="button" className="icon-button" aria-label="Open project" title="Open project" onClick={onOpenProject}>
            <FolderOpen aria-hidden="true" size={18} />
          </button>
          <button type="button" className="icon-button" aria-label="Save project" title="Save project" onClick={onSaveProject}>
            <Save aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="subsection-title">Import geometry</div>
        <div className="project-action-row import-actions" aria-label="Import actions">
          <button
            type="button"
            className="icon-button import-svg-button"
            aria-label="Import SVG"
            title="Import SVG"
            onClick={onImportSvg}
          >
            <FileInput aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            className="icon-button import-dxf-button"
            aria-label="Import DXF"
            title="Import DXF"
            onClick={onImportDxf}
          >
            <FileInput aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            className="icon-button import-stl-button"
            aria-label="Import STL"
            title="Import STL"
            onClick={onImportStl}
          >
            <Box aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            className="icon-button import-drl-button"
            aria-label="Import DRL / Excellon"
            title="Import DRL / Excellon"
            onClick={onImportDrl}
          >
            <Target aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            className="icon-button import-raster-image-button"
            aria-label="Import raster image"
            title="Import raster image for laser engraving"
            onClick={onImportRasterImage}
          >
            <ImageIcon aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="subsection-title">Output</div>
        <div className="button-column">
          <button
            type="button"
            className="accent"
            aria-label="Export G-code"
            title="Export G-code"
            onClick={onExportGcode}
          >
            <span className="tool-button-content">
              <FileOutput aria-hidden="true" size={16} />
              <span>Export G-code</span>
            </span>
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
        <div className="section-header">Machine setup</div>
        <p className="section-note">Distance in mm. Feeds are in mm/min.</p>

        <div className="subsection-title">Material</div>
        <label className="field-row">
          <span>Job material</span>
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

        <div className="subsection-title">Tool</div>
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
        <button type="button" onClick={() => setIsToolModalOpen(true)}>
          Open Tool Manager
        </button>
        {activeTool?.isLaser ? (
          <button type="button" className="accent" onClick={() => setIsLaserTestModalOpen(true)}>
            Create laser test pattern
          </button>
        ) : null}

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
          value={Math.abs(settings.drillDepth)}
          step={0.1}
          onChange={(value) => onSettingsChange({ drillDepth: -Math.abs(value || 0) })}
        />
        <NumberField
          label="Cut depth"
          value={Math.abs(settings.cutDepth)}
          step={0.1}
          onChange={(value) => onSettingsChange({ cutDepth: -Math.abs(value || 0) })}
        />
        <button
          type="button"
          className="accent"
          title="Updates all drill operations to the current drill depth and all cut operations to the current cut depth."
          onClick={onApplyDepthSettingsToAll}
          disabled={operationCount === 0}
        >
          Apply depths to all operations
        </button>

        <div className="subsection-title">Feeds</div>
        <NumberField
          label="Rapid feed XY"
          value={settings.rapidFeedRate}
          min={1}
          step={1}
          onChange={(value) => onSettingsChange({ rapidFeedRate: Math.max(1, value || 1) })}
        />
        <NumberField
          label="Rapid feed Z"
          value={settings.rapidFeedRateZ}
          min={1}
          step={1}
          onChange={(value) => onSettingsChange({ rapidFeedRateZ: Math.max(1, value || 1) })}
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

      <div className="section-block">
        <div className="section-header">G-code start / end</div>
        <InfoDisclosure label="About start and end G-code">
          Start code is emitted after the job comments. End code is emitted after safe shutdown and
          return moves.
        </InfoDisclosure>
        <label className="gcode-field">
          <span>Start G-code</span>
          <textarea
            aria-label="Start G-code"
            rows={5}
            spellCheck={false}
            value={settings.startGcode}
            onChange={(event) => onSettingsChange({ startGcode: event.target.value })}
          />
        </label>
        <label className="gcode-field">
          <span>End G-code</span>
          <textarea
            aria-label="End G-code"
            rows={4}
            spellCheck={false}
            value={settings.endGcode}
            onChange={(event) => onSettingsChange({ endGcode: event.target.value })}
          />
        </label>
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
        <NumberField
          label="Stock thickness"
          value={settings.stockThickness}
          min={0.1}
          step={0.1}
          onChange={(value) =>
            onSettingsChange({ stockThickness: Math.max(0.1, value || 0.1) })
          }
        />
        <NumberField
          label="Margin X"
          value={settings.marginX}
          min={0}
          step={0.1}
          onChange={(value) => onSettingsChange({ marginX: Math.max(0, value || 0) })}
        />
        <NumberField
          label="Margin Y"
          value={settings.marginY}
          min={0}
          step={0.1}
          onChange={(value) => onSettingsChange({ marginY: Math.max(0, value || 0) })}
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
      {activeTool?.isLaser ? (
        <LaserTestPatternModal
          isOpen={isLaserTestModalOpen}
          tool={activeTool}
          material={activeMaterial}
          onClose={() => setIsLaserTestModalOpen(false)}
          onCreate={onCreateLaserTestPattern}
        />
      ) : null}
    </div>
  );
}
