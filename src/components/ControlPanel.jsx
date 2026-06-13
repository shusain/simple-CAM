import React, { useMemo, useState } from 'react';

function NumberField({ label, value, step = 'any', min, onChange }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToolManagerModal({
  isOpen,
  onClose,
  tools,
  activeToolId,
  onSelectTool,
  onAddTool,
  onUpdateTool,
  onDeleteTool,
}) {
  const [editingToolId, setEditingToolId] = useState(activeToolId);

  const editingTool = useMemo(
    () => tools.find((tool) => tool.id === editingToolId) || tools[0] || null,
    [editingToolId, tools]
  );

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Tool Manager</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="tool-manager-grid">
          <div>
            <p className="section-note">Choose which tool to edit or set as active.</p>
            <ul className="tool-list">
              {tools.map((tool) => (
                <li key={tool.id}>
                  <button
                    type="button"
                    className={`tool-list-item ${editingToolId === tool.id ? 'active' : ''}`}
                    onClick={() => setEditingToolId(tool.id)}
                  >
                    <span>{tool.name}</span>
                    <span className="tool-meta">Ø {tool.diameter}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="button-column">
              <button
                type="button"
                onClick={() => {
                  onAddTool();
                }}
              >
                Add Tool
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => editingTool && onDeleteTool(editingTool.id)}
                disabled={tools.length <= 1 || !editingTool}
              >
                Delete Tool
              </button>
            </div>
          </div>

          {editingTool ? (
            <div>
              <div className="section-header">Edit tool</div>
              <label className="field-row">
                <span>Name</span>
                <input
                  type="text"
                  value={editingTool.name}
                  onChange={(event) => onUpdateTool(editingTool.id, { name: event.target.value })}
                />
              </label>
              <NumberField
                label="Diameter"
                value={editingTool.diameter}
                min={0.01}
                step={0.01}
                onChange={(value) => onUpdateTool(editingTool.id, { diameter: Math.max(0.01, value || 0.01) })}
              />
              <NumberField
                label="Rapid feed"
                value={editingTool.rapidFeedRate}
                min={1}
                step={1}
                onChange={(value) =>
                  onUpdateTool(editingTool.id, { rapidFeedRate: Math.max(1, Math.round(value || 1)) })
                }
              />
              <NumberField
                label="Cut feed"
                value={editingTool.cutFeedRate}
                min={1}
                step={1}
                onChange={(value) =>
                  onUpdateTool(editingTool.id, { cutFeedRate: Math.max(1, Math.round(value || 1)) })
                }
              />
              <NumberField
                label="Plunge feed"
                value={editingTool.plungeFeedRate}
                min={1}
                step={1}
                onChange={(value) =>
                  onUpdateTool(editingTool.id, { plungeFeedRate: Math.max(1, Math.round(value || 1)) })
                }
              />
              <button
                type="button"
                className="accent"
                onClick={() => {
                  onSelectTool(editingTool.id);
                  onClose();
                }}
              >
                Set Active Tool
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ControlPanel({
  settings,
  onSettingsChange,
  tools,
  activeToolId,
  onSelectTool,
  onAddTool,
  onUpdateTool,
  onDeleteTool,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onExportGcode,
  canSendToOctoprint,
  onSendToOctoprint,
  onSendAndRunOctoprint,
}) {
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const activeTool = tools.find((tool) => tool.id === activeToolId) || tools[0];

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
            Ø {activeTool.diameter} | Cut {activeTool.cutFeedRate} | Plunge {activeTool.plungeFeedRate}
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
        <div className="section-header">Machine setup</div>
        <p className="section-note">Distance in mm. Feeds are in mm/min.</p>

        <div className="subsection-title">Depth and Z</div>
        <NumberField
          label="Safe Z"
          value={settings.safeZ}
          step={0.1}
          onChange={(value) => onSettingsChange({ safeZ: value || 0 })}
        />
        <NumberField
          label="Drill depth"
          value={settings.drillDepth}
          step={0.1}
          onChange={(value) => onSettingsChange({ drillDepth: value || 0 })}
        />
        <NumberField
          label="Peck depth"
          value={settings.peckDepth}
          min={0.1}
          step={0.1}
          onChange={(value) => onSettingsChange({ peckDepth: Math.max(0.1, Math.abs(value) || 0.1) })}
        />
        <NumberField
          label="Cut depth"
          value={settings.cutDepth}
          step={0.1}
          onChange={(value) => onSettingsChange({ cutDepth: value || 0 })}
        />
        <NumberField
          label="Cut depth / pass"
          value={settings.cutDepthPerPass}
          min={0.1}
          step={0.1}
          onChange={(value) =>
            onSettingsChange({ cutDepthPerPass: Math.max(0.1, Math.abs(value) || 0.1) })
          }
        />

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
        activeToolId={activeToolId}
        onSelectTool={onSelectTool}
        onAddTool={onAddTool}
        onUpdateTool={onUpdateTool}
        onDeleteTool={onDeleteTool}
      />
    </div>
  );
}

