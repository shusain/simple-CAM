import React, { useEffect, useMemo, useState } from 'react';
import { resolveToolPreset } from '../../utils/tooling';
import NumberField from './NumberField';
import type { ToolManagerModalProps } from './types';

export default function ToolManagerModal({
  isOpen,
  onClose,
  tools,
  materials,
  settings,
  activeToolId,
  activeMaterialId,
  onSelectTool,
  onAddTool,
  onUpdateTool,
  onUpdateToolMaterialProfile,
  onDeleteTool,
}: ToolManagerModalProps): React.JSX.Element | null {
  const [editingToolId, setEditingToolId] = useState(activeToolId);
  const [editingMaterialId, setEditingMaterialId] = useState(activeMaterialId);

  const editingTool = useMemo(
    () => tools.find((tool) => tool.id === editingToolId) || tools[0] || null,
    [editingToolId, tools]
  );
  const editingMaterial = useMemo(
    () => materials.find((material) => material.id === editingMaterialId) || materials[0] || null,
    [editingMaterialId, materials]
  );
  const materialPreset = useMemo(
    () => resolveToolPreset(editingTool, editingMaterial?.id, settings),
    [editingMaterial?.id, editingTool, settings]
  );

  useEffect(() => {
    setEditingToolId(activeToolId);
  }, [activeToolId]);

  useEffect(() => {
    setEditingMaterialId(activeMaterialId);
  }, [activeMaterialId]);

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
              <button type="button" onClick={onAddTool}>
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

              {editingMaterial ? (
                <>
                  <div className="subsection-title">Material preset</div>
                  <label className="field-row">
                    <span>Material</span>
                    <select
                      value={editingMaterial.id}
                      onChange={(event) => setEditingMaterialId(event.target.value)}
                    >
                      {materials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberField
                    label="Cut feed"
                    value={materialPreset.cutFeedRate}
                    min={1}
                    step={1}
                    onChange={(value) =>
                      onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                        cutFeedRate: Math.max(1, Math.round(value || 1)),
                      })
                    }
                  />
                  <NumberField
                    label="Plunge feed"
                    value={materialPreset.plungeFeedRate}
                    min={1}
                    step={1}
                    onChange={(value) =>
                      onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                        plungeFeedRate: Math.max(1, Math.round(value || 1)),
                      })
                    }
                  />
                  <NumberField
                    label="Drill depth / layer"
                    value={materialPreset.drillDepthPerPass}
                    min={0.1}
                    step={0.1}
                    onChange={(value) =>
                      onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                        drillDepthPerPass: Math.max(0.1, Math.abs(value) || 0.1),
                      })
                    }
                  />
                  <NumberField
                    label="Cut depth / layer"
                    value={materialPreset.cutDepthPerPass}
                    min={0.1}
                    step={0.1}
                    onChange={(value) =>
                      onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                        cutDepthPerPass: Math.max(0.1, Math.abs(value) || 0.1),
                      })
                    }
                  />
                  <p className="section-note">
                    Material presets only control cut feed, plunge feed, drill depth per layer, and cut
                    depth per layer for this tool. Final operation depth and rapid moves stay under machine
                    setup/tool defaults.
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
