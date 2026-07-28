import React, { useEffect, useMemo, useState } from 'react';
import {
  changeMillingToolType,
  getMillingToolMaxUsableDepth,
  getMillingToolTypeLabel,
  normalizeMillingToolGeometry,
} from '../../utils/millingToolGeometry';
import { resolveLaserMaterialPreset, resolveToolPreset } from '../../utils/tooling';
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
  const laserMaterialPreset = useMemo(
    () => resolveLaserMaterialPreset(editingTool, editingMaterial?.id),
    [editingMaterial?.id, editingTool]
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
                    <span className="tool-meta">
                      {tool.isLaser
                        ? 'Laser'
                        : `${getMillingToolTypeLabel(tool.millingGeometry.type)} · Ø ${tool.diameter}`}
                    </span>
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
              <label className="field-row">
                <span>Tool type</span>
                <select
                  aria-label="Tool type"
                  value={editingTool.isLaser ? 'laser' : 'mill'}
                  onChange={(event) =>
                    onUpdateTool(editingTool.id, { isLaser: event.target.value === 'laser' })
                  }
                >
                  <option value="mill">Mill / drill</option>
                  <option value="laser">Laser</option>
                </select>
              </label>
              {!editingTool.isLaser ? (
                <>
                  <div className="subsection-title">Cutter geometry</div>
                  <label className="field-row">
                    <span>Geometry</span>
                    <select
                      aria-label="Milling geometry"
                      value={editingTool.millingGeometry.type}
                      onChange={(event) => {
                        const type =
                          event.target.value === 'ball-nose' ||
                          event.target.value === 'v-bit' ||
                          event.target.value === 'chamfer'
                            ? event.target.value
                            : 'flat-end';
                        onUpdateTool(editingTool.id, {
                          millingGeometry: changeMillingToolType(
                            editingTool.millingGeometry,
                            type,
                            editingTool.diameter
                          ),
                        });
                      }}
                    >
                      <option value="flat-end">Flat end mill</option>
                      <option value="ball-nose">Ball nose</option>
                      <option value="v-bit">V-bit / V-carve</option>
                      <option value="chamfer">Chamfer mill</option>
                    </select>
                  </label>
                  <NumberField
                    label={
                      editingTool.millingGeometry.type === 'v-bit' ||
                      editingTool.millingGeometry.type === 'chamfer'
                        ? 'Maximum diameter'
                        : 'Cutting diameter'
                    }
                    value={editingTool.diameter}
                    min={0.01}
                    step={0.01}
                    onChange={(value) => {
                      const diameter = Math.max(0.01, value || 0.01);
                      onUpdateTool(editingTool.id, {
                        diameter,
                        millingGeometry: normalizeMillingToolGeometry(
                          editingTool.millingGeometry,
                          diameter
                        ),
                      });
                    }}
                  />
                  <NumberField
                    label={
                      editingTool.millingGeometry.type === 'chamfer'
                        ? 'Cutting height'
                        : 'Cutting length'
                    }
                    value={editingTool.millingGeometry.cuttingLength}
                    min={0.01}
                    step={0.1}
                    onChange={(value) =>
                      onUpdateTool(editingTool.id, {
                        millingGeometry: normalizeMillingToolGeometry(
                          {
                            ...editingTool.millingGeometry,
                            cuttingLength: Math.max(0.01, value || 0.01),
                          },
                          editingTool.diameter
                        ),
                      })
                    }
                  />
                  {editingTool.millingGeometry.type === 'v-bit' ||
                  editingTool.millingGeometry.type === 'chamfer' ? (
                    <>
                      <NumberField
                        label="Tip diameter"
                        value={editingTool.millingGeometry.tipDiameter}
                        min={0}
                        max={editingTool.diameter}
                        step={0.01}
                        onChange={(value) =>
                          onUpdateTool(editingTool.id, {
                            millingGeometry: {
                              ...editingTool.millingGeometry,
                              tipDiameter: Math.min(
                                editingTool.diameter,
                                Math.max(0, value)
                              ),
                            },
                          })
                        }
                      />
                      <NumberField
                        label="Included angle"
                        value={editingTool.millingGeometry.includedAngle}
                        min={1}
                        max={179}
                        step={1}
                        onChange={(value) =>
                          onUpdateTool(editingTool.id, {
                            millingGeometry: {
                              ...editingTool.millingGeometry,
                              includedAngle: Math.min(179, Math.max(1, value || 1)),
                            },
                          })
                        }
                      />
                      <p className="section-note">
                        Included angle is measured between the two cutting faces. The configured
                        profile allows up to{' '}
                        {Number(getMillingToolMaxUsableDepth(editingTool).toFixed(3))} mm usable
                        depth before reaching its diameter or cutting-height limit.
                      </p>
                    </>
                  ) : editingTool.millingGeometry.type === 'ball-nose' ? (
                    <p className="section-note">
                      Ball radius is half the cutting diameter. Surface contact and result preview
                      use the rounded tip profile.
                    </p>
                  ) : (
                    <p className="section-note">
                      Flat end mills use the full cutting radius from the tool tip through the
                      configured cutting length.
                    </p>
                  )}
                </>
              ) : null}
              <NumberField
                label="Rapid feed"
                value={editingTool.rapidFeedRate}
                min={1}
                step={1}
                onChange={(value) =>
                  onUpdateTool(editingTool.id, { rapidFeedRate: Math.max(1, Math.round(value || 1)) })
                }
              />
              {editingTool.isLaser ? (
                <>
                  <label className="field-row">
                    <span>Inline mode</span>
                    <select
                      aria-label="Inline mode"
                      value={editingTool.laserInlineMode}
                      onChange={(event) =>
                        onUpdateTool(editingTool.id, {
                          laserInlineMode:
                            event.target.value === 'dynamic' ? 'dynamic' : 'continuous',
                        })
                      }
                    >
                      <option value="continuous">M3 I continuous</option>
                      <option value="dynamic">M4 I dynamic</option>
                    </select>
                  </label>
                  <p className="section-note">
                    Power is shown as 0–100% and exported as S0–S255. Material presets constrain
                    recommended cut and fill/etch settings.
                  </p>
                  {editingTool.laserInlineMode === 'dynamic' ? (
                    <p className="section-note">
                      This Marlin build derives effective M4 dynamic power from feed rate. Use M3
                      continuous mode when the requested power percentage must map exactly to S.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
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
                </>
              )}
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
                  {editingTool.isLaser ? (
                    <>
                      <NumberField
                        label="Kerf diameter"
                        value={laserMaterialPreset.kerfDiameter}
                        min={0.01}
                        step={0.01}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserKerfDiameter: Math.max(0.01, value || 0.01),
                          })
                        }
                      />
                      <div className="subsection-title">Cut range</div>
                      <NumberField
                        label="Speed min"
                        value={laserMaterialPreset.cutSpeedMin}
                        min={1}
                        step={1}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserCutSpeedMin: Math.min(
                              laserMaterialPreset.cutSpeedMax,
                              Math.max(1, Math.round(value || 1))
                            ),
                          })
                        }
                      />
                      <NumberField
                        label="Speed max"
                        value={laserMaterialPreset.cutSpeedMax}
                        min={1}
                        step={1}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserCutSpeedMax: Math.max(
                              laserMaterialPreset.cutSpeedMin,
                              Math.round(value || 1)
                            ),
                          })
                        }
                      />
                      <NumberField
                        label="Power min (%)"
                        value={laserMaterialPreset.cutPowerMin}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserCutPowerMin: Math.min(
                              laserMaterialPreset.cutPowerMax,
                              Math.max(0, value)
                            ),
                          })
                        }
                      />
                      <NumberField
                        label="Power max (%)"
                        value={laserMaterialPreset.cutPowerMax}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserCutPowerMax: Math.max(
                              laserMaterialPreset.cutPowerMin,
                              Math.min(100, value)
                            ),
                          })
                        }
                      />

                      <div className="subsection-title">Fill / etch range</div>
                      <NumberField
                        label="Fill speed min"
                        value={laserMaterialPreset.etchSpeedMin}
                        min={1}
                        step={1}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserEtchSpeedMin: Math.min(
                              laserMaterialPreset.etchSpeedMax,
                              Math.max(1, Math.round(value || 1))
                            ),
                          })
                        }
                      />
                      <NumberField
                        label="Fill speed max"
                        value={laserMaterialPreset.etchSpeedMax}
                        min={1}
                        step={1}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserEtchSpeedMax: Math.max(
                              laserMaterialPreset.etchSpeedMin,
                              Math.round(value || 1)
                            ),
                          })
                        }
                      />
                      <NumberField
                        label="Fill power min (%)"
                        value={laserMaterialPreset.etchPowerMin}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserEtchPowerMin: Math.min(
                              laserMaterialPreset.etchPowerMax,
                              Math.max(0, value)
                            ),
                          })
                        }
                      />
                      <NumberField
                        label="Fill power max (%)"
                        value={laserMaterialPreset.etchPowerMax}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(value) =>
                          onUpdateToolMaterialProfile(editingTool.id, editingMaterial.id, {
                            laserEtchPowerMax: Math.max(
                              laserMaterialPreset.etchPowerMin,
                              Math.min(100, value)
                            ),
                          })
                        }
                      />
                    </>
                  ) : (
                    <>
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
                        Material presets control cut feed, plunge feed, and pass depths for this
                        tool. Final operation depth and rapid moves stay under machine setup/tool
                        defaults.
                      </p>
                    </>
                  )}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
