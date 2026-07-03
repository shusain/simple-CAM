import React, { useEffect, useRef, useState } from 'react';
import { analyzeSketchIntegrity, getSketchSegments, getSketchStartPoint } from '../utils/geometry';
import { getImportedMeshWorldBounds } from '../utils/importStl';
import { TEXT_FONT_OPTIONS } from '../utils/text';
import NumericInput from './common/NumericInput';
import type {
  CutSide,
  Operation,
} from '../types';
import { CutSideEditor, DepthEditor } from './operationsPanel/controls';
import {
  formatOperationLabel,
  getImportedMeshName,
  getMaterialName,
  getToolName,
  updateSketchSegment,
  updateSketchStart,
} from './operationsPanel/helpers';
import type { OperationsPanelProps } from './operationsPanel/types';

interface NumericFieldRowProps {
  label: string;
  value: number | string;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}

function NumericFieldRow({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: NumericFieldRowProps): React.JSX.Element {
  return (
    <label className="field-row">
      <span>{label}</span>
      <NumericInput
        aria-label={label}
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={onChange}
      />
    </label>
  );
}

export default function OperationsPanel({
  operations,
  importedMeshes,
  workWidth,
  workHeight,
  selectedOperation,
  selectedImportedMesh,
  selectedOperationIds,
  materials,
  tools,
  onSelectOperation,
  onSelectImportedMesh,
  onCreateSurfaceRoughOperation,
  onCreateSurfaceFinishOperation,
  onUpdateOperation,
  onConvertDrillToCircle,
  onUpdateImportedMesh,
  onDeleteImportedMesh,
  onDeleteOperation,
  onDeleteSelection,
  onMoveOperation,
  onMoveOperationToEdge,
  onRepeatOperation,
  isEditingSelectedSketch,
  selectedSketchSegmentIndex,
  onStartSketchEdit,
  onStopSketchEdit,
  onDeleteSelectedSketchSegment,
}: OperationsPanelProps): React.JSX.Element {
  const [repeatCount, setRepeatCount] = useState(1);
  const [repeatOffsetX, setRepeatOffsetX] = useState(10);
  const [repeatOffsetY, setRepeatOffsetY] = useState(0);
  const [showSegmentDetails, setShowSegmentDetails] = useState(false);
  const rectCornerMax =
    selectedOperation?.type === 'rect'
      ? Math.max(
          0,
          Math.min(
            Math.abs(Number(selectedOperation.width) || 0),
            Math.abs(Number(selectedOperation.height) || 0)
          ) / 2
        )
      : 0;
  const selectedCount = selectedOperationIds?.length || 0;
  const selectedOperations = operations.filter((operation) => selectedOperationIds?.includes(operation.id));
  const selectedCircleOperations = selectedOperations.filter((operation) => operation.type === 'circle');
  const allSelectedAreCircles = selectedCount > 1 && selectedCircleOperations.length === selectedCount;
  const hasImportedMeshSelection = Boolean(selectedImportedMesh);
  const hasDetailsSelection = selectedCount > 0 || hasImportedMeshSelection;
  const importedMeshBounds = selectedImportedMesh ? getImportedMeshWorldBounds(selectedImportedMesh) : null;
  const sketchStart = selectedOperation?.type === 'sketch' ? getSketchStartPoint(selectedOperation) : null;
  const sketchSegments = selectedOperation?.type === 'sketch' ? getSketchSegments(selectedOperation) : [];
  const sketchIntegrity = selectedOperation?.type === 'sketch' ? analyzeSketchIntegrity(selectedOperation) : null;
  const selectedSurfaceMesh =
    selectedOperation?.type === 'surface-rough' || selectedOperation?.type === 'surface-finish'
      ? importedMeshes.find((mesh) => mesh.id === selectedOperation.meshId) || null
      : null;
  const effectiveSketchClosed =
    selectedOperation?.type === 'sketch'
      ? Boolean(sketchIntegrity?.detectedClosed || selectedOperation.closed)
      : false;
  const sketchCutOptions: CutSide[] =
    selectedOperation?.type === 'sketch' && effectiveSketchClosed
      ? ['outside', 'inside', 'along']
      : ['along'];
  const shouldShowPocketControls =
    selectedOperation?.type === 'rect' || selectedOperation?.type === 'circle';
  const shouldShowSketchPocketControls =
    selectedOperation?.type === 'sketch' && effectiveSketchClosed;
  const shouldHideTabsForPocket =
    (selectedOperation?.type === 'rect' || selectedOperation?.type === 'circle' || selectedOperation?.type === 'sketch') &&
    selectedOperation.pocketEnabled &&
    selectedOperation.cutSide === 'inside';
  const [activeTab, setActiveTab] = useState<'list' | 'details'>(hasDetailsSelection ? 'details' : 'list');
  const previousSelectedCountRef = useRef(hasDetailsSelection ? 1 : 0);

  useEffect(() => {
    const previousSelectedCount = previousSelectedCountRef.current;
    const currentSelectedCount = hasDetailsSelection ? 1 : 0;

    if (!hasDetailsSelection) {
      setActiveTab('list');
    } else if (previousSelectedCount === 0) {
      setActiveTab('details');
    }

    previousSelectedCountRef.current = currentSelectedCount;
  }, [hasDetailsSelection]);

  useEffect(() => {
    setShowSegmentDetails(false);
  }, [selectedOperation?.id]);

  function getSharedNumericValue(values: number[]): number | '' {
    if (values.length === 0) {
      return '';
    }

    const [first] = values;
    return values.every((value) => Math.abs(value - first) <= 0.0001) ? first : '';
  }

  const bulkCircleRadiusValue = allSelectedAreCircles
    ? getSharedNumericValue(selectedCircleOperations.map((operation) => operation.radius))
    : '';
  const bulkCircleStepOverValue = allSelectedAreCircles
    ? getSharedNumericValue(selectedCircleOperations.map((operation) => operation.pocketStepOver))
    : '';

  function applyToSelectedCircles(updates: { radius?: number; pocketStepOver?: number }): void {
    selectedCircleOperations.forEach((operation) => {
      onUpdateOperation(operation.id, updates);
    });
  }

  return (
    <div className="panel">
      <div className="panel-tabs" role="tablist" aria-label="Operations panel">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'list'}
          className={`panel-tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          Operations
        </button>
        {hasDetailsSelection ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'details'}
            className={`panel-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
        ) : null}
      </div>

      {activeTab === 'details' ? (selectedImportedMesh ? (
        <div className="operation-editor">
          <h3>Selected: STL MESH</h3>
          <label className="field-row">
            <span>Name</span>
            <input type="text" readOnly value={selectedImportedMesh.name} />
          </label>
          <label className="field-row">
            <span>Units</span>
            <input type="text" readOnly value={selectedImportedMesh.units.toUpperCase()} />
          </label>
          <label className="field-row">
            <span>Triangles</span>
            <input type="number" readOnly value={selectedImportedMesh.triangleCount} />
          </label>

          <h3>Placement</h3>
          <NumericFieldRow
            label="Center X"
            value={selectedImportedMesh.placement.x}
            onChange={(value) =>
              onUpdateImportedMesh(selectedImportedMesh.id, {
                placement: {
                  ...selectedImportedMesh.placement,
                  x: value,
                },
              })
            }
          />
          <NumericFieldRow
            label="Center Y"
            value={selectedImportedMesh.placement.y}
            onChange={(value) =>
              onUpdateImportedMesh(selectedImportedMesh.id, {
                placement: {
                  ...selectedImportedMesh.placement,
                  y: value,
                },
              })
            }
          />

          <h3>Mesh size</h3>
          <label className="field-row">
            <span>Width (mm)</span>
            <input
              type="number"
              readOnly
              value={Number((selectedImportedMesh.localBounds.maxX - selectedImportedMesh.localBounds.minX).toFixed(3))}
            />
          </label>
          <label className="field-row">
            <span>Height (mm)</span>
            <input
              type="number"
              readOnly
              value={Number((selectedImportedMesh.localBounds.maxY - selectedImportedMesh.localBounds.minY).toFixed(3))}
            />
          </label>
          <label className="field-row">
            <span>Depth (mm)</span>
            <input
              type="number"
              readOnly
              value={Number((selectedImportedMesh.localBounds.maxZ - selectedImportedMesh.localBounds.minZ).toFixed(3))}
            />
          </label>

          {importedMeshBounds ? (
            <>
              <h3>Stock placement</h3>
              <label className="field-row">
                <span>Min X</span>
                <input type="number" readOnly value={Number(importedMeshBounds.minX.toFixed(3))} />
              </label>
              <label className="field-row">
                <span>Max X</span>
                <input type="number" readOnly value={Number(importedMeshBounds.maxX.toFixed(3))} />
              </label>
              <label className="field-row">
                <span>Min Y</span>
                <input type="number" readOnly value={Number(importedMeshBounds.minY.toFixed(3))} />
              </label>
              <label className="field-row">
                <span>Max Y</span>
                <input type="number" readOnly value={Number(importedMeshBounds.maxY.toFixed(3))} />
              </label>
              <label className="field-row">
                <span>Top Z</span>
                <input type="number" readOnly value={Number(importedMeshBounds.maxZ.toFixed(3))} />
              </label>
              <label className="field-row">
                <span>Bottom Z</span>
                <input type="number" readOnly value={Number(importedMeshBounds.minZ.toFixed(3))} />
              </label>
            </>
          ) : null}

          <div className="button-column">
            <button
              type="button"
              className="accent"
              onClick={() =>
                onUpdateImportedMesh(selectedImportedMesh.id, {
                  placement: {
                    x: workWidth / 2,
                    y: workHeight / 2,
                  },
                })
              }
            >
              Center on stock
            </button>
            <button
              type="button"
              onClick={() => onSelectImportedMesh(selectedImportedMesh.id)}
            >
              Select in canvas
            </button>
            <button
              type="button"
              className="accent"
              onClick={() => onCreateSurfaceRoughOperation(selectedImportedMesh.id)}
            >
              Create surface roughing
            </button>
            <button
              type="button"
              onClick={() => onCreateSurfaceFinishOperation(selectedImportedMesh.id)}
            >
              Create surface finishing
            </button>
            <button type="button" className="danger" onClick={() => onDeleteImportedMesh(selectedImportedMesh.id)}>
              Delete imported mesh
            </button>
          </div>
          <p className="hint-text">
            Drag the STL silhouette in the 2D canvas or edit the center position here before surface roughing or finishing operations are generated.
          </p>
        </div>
      ) : selectedOperation ? (
        <div className="operation-editor">
          <h3>Selected: {selectedOperation.type.toUpperCase()}</h3>

          <DepthEditor
            value={selectedOperation.depth}
            onChange={(value) => onUpdateOperation(selectedOperation.id, { depth: value })}
          />

          {selectedOperation.type === 'rect' || selectedOperation.type === 'circle' ? (
            <CutSideEditor
              value={selectedOperation.cutSide || 'outside'}
              onChange={(value) =>
                onUpdateOperation(selectedOperation.id, {
                  cutSide: value,
                  pocketEnabled: value === 'inside' ? selectedOperation.pocketEnabled : false,
                })
              }
            />
          ) : null}

          {selectedOperation.type === 'sketch' ? (
            <CutSideEditor
              value={selectedOperation.cutSide || (effectiveSketchClosed ? 'outside' : 'along')}
              onChange={(value) =>
                onUpdateOperation(selectedOperation.id, {
                  closed: effectiveSketchClosed ? true : selectedOperation.closed,
                  cutSide: value,
                  pocketEnabled: value === 'inside' ? selectedOperation.pocketEnabled : false,
                })
              }
              disabled={!effectiveSketchClosed}
              options={sketchCutOptions}
            />
          ) : null}

          {selectedOperation.type === 'text' ? (
            <CutSideEditor
              value={selectedOperation.cutSide || 'along'}
              onChange={(value) =>
                onUpdateOperation(selectedOperation.id, {
                  cutSide: value,
                })
              }
            />
          ) : null}

          {selectedOperation.type === 'surface-rough' || selectedOperation.type === 'surface-finish' ? (
            <>
              <label className="field-row">
                <span>Mesh</span>
                <input
                  type="text"
                  readOnly
                  value={
                    selectedSurfaceMesh?.name ||
                    getImportedMeshName(selectedOperation.meshId, importedMeshes)
                  }
                />
              </label>
              <NumericFieldRow
                label="Step-over"
                value={selectedOperation.stepOver}
                min={0.1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    stepOver: Math.max(0.1, value || 0.1),
                  })
                }
              />
              {selectedOperation.type === 'surface-rough' ? (
                <NumericFieldRow
                  label="Stock to leave"
                  value={selectedOperation.stockToLeave}
                  min={0}
                  onChange={(value) =>
                    onUpdateOperation(selectedOperation.id, {
                      stockToLeave: Math.max(0, value || 0),
                    })
                  }
                />
              ) : (
                <label className="field-row">
                  <span>Finish pattern</span>
                  <select
                    value={selectedOperation.pattern}
                    onChange={(event) =>
                      onUpdateOperation(selectedOperation.id, {
                        pattern: event.target.value as 'x' | 'y' | 'crosshatch',
                      })
                    }
                  >
                    <option value="crosshatch">Crosshatch</option>
                    <option value="x">X raster</option>
                    <option value="y">Y raster</option>
                  </select>
                </label>
              )}
            </>
          ) : null}

          <label className="field-row">
            <span>Tool</span>
            <select
              value={selectedOperation.toolId || ''}
              onChange={(event) => onUpdateOperation(selectedOperation.id, { toolId: event.target.value })}
            >
              {tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.name} (Ø{tool.diameter}mm)
                </option>
              ))}
            </select>
          </label>

          <label className="field-row">
            <span>Material</span>
            <select
              value={selectedOperation.materialId || ''}
              onChange={(event) => onUpdateOperation(selectedOperation.id, { materialId: event.target.value })}
            >
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>

          {selectedOperation.type === 'drill' ? (
            <>
              <NumericFieldRow label="X (mm)" value={selectedOperation.x} onChange={(value) => onUpdateOperation(selectedOperation.id, { x: value })} />
              <NumericFieldRow label="Y (mm)" value={selectedOperation.y} onChange={(value) => onUpdateOperation(selectedOperation.id, { y: value })} />
              <button
                type="button"
                className="accent"
                onClick={() => onConvertDrillToCircle(selectedOperation.id)}
              >
                Convert to inside cut circle
              </button>
            </>
          ) : null}

          {selectedOperation.type === 'line' ? (
            <>
              <NumericFieldRow label="X1" value={selectedOperation.x1} onChange={(value) => onUpdateOperation(selectedOperation.id, { x1: value })} />
              <NumericFieldRow label="Y1" value={selectedOperation.y1} onChange={(value) => onUpdateOperation(selectedOperation.id, { y1: value })} />
              <NumericFieldRow label="X2" value={selectedOperation.x2} onChange={(value) => onUpdateOperation(selectedOperation.id, { x2: value })} />
              <NumericFieldRow label="Y2" value={selectedOperation.y2} onChange={(value) => onUpdateOperation(selectedOperation.id, { y2: value })} />
            </>
          ) : null}

          {selectedOperation.type === 'text' ? (
            <>
              <NumericFieldRow label="Anchor X" value={selectedOperation.x} onChange={(value) => onUpdateOperation(selectedOperation.id, { x: value })} />
              <NumericFieldRow label="Anchor Y" value={selectedOperation.y} onChange={(value) => onUpdateOperation(selectedOperation.id, { y: value })} />
              <label className="field-row" style={{ alignItems: 'flex-start' }}>
                <span>Text</span>
                <textarea
                  aria-label="Text"
                  value={selectedOperation.text}
                  rows={4}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, {
                      text: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field-row">
                <span>Font</span>
                <select
                  value={selectedOperation.fontId}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, {
                      fontId: event.target.value,
                    })
                  }
                >
                  {TEXT_FONT_OPTIONS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
              <NumericFieldRow
                label="Font size"
                value={selectedOperation.fontSize}
                min={0.1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    fontSize: Math.max(0.1, value || 0.1),
                  })
                }
              />
              <NumericFieldRow
                label="Line height"
                value={selectedOperation.lineHeight}
                min={0.5}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    lineHeight: Math.max(0.5, value || 0.5),
                  })
                }
              />
              <NumericFieldRow
                label="Rotation (deg)"
                value={(selectedOperation.rotation * 180) / Math.PI}
                step={1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    rotation: (value * Math.PI) / 180,
                  })
                }
              />
              <NumericFieldRow
                label="Scale X"
                value={selectedOperation.scaleX}
                step={0.1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    scaleX: Math.abs(value) <= 0.0001 ? 0.1 : value,
                  })
                }
              />
              <NumericFieldRow
                label="Scale Y"
                value={selectedOperation.scaleY}
                step={0.1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    scaleY: Math.abs(value) <= 0.0001 ? 0.1 : value,
                  })
                }
              />
              {selectedOperation.cutSide === 'outside' ? (
                <>
                  <label className="field-row checkbox-row">
                    <span>Retaining tabs</span>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedOperation.tabsEnabled)}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, { tabsEnabled: event.target.checked })
                      }
                    />
                  </label>
                  {selectedOperation.tabsEnabled ? (
                    <>
                      <NumericFieldRow
                        label="Tab count"
                        value={selectedOperation.tabCount ?? 2}
                        min={1}
                        step={1}
                        onChange={(value) =>
                          onUpdateOperation(selectedOperation.id, {
                            tabCount: Math.max(1, Math.round(value || 1)),
                          })
                        }
                      />
                      <NumericFieldRow
                        label="Tab width"
                        value={selectedOperation.tabWidth ?? 1}
                        min={0.1}
                        onChange={(value) =>
                          onUpdateOperation(selectedOperation.id, {
                            tabWidth: Math.max(0.1, value || 0.1),
                          })
                        }
                      />
                      <NumericFieldRow
                        label="Tab height"
                        value={selectedOperation.tabHeight ?? 1}
                        min={0.1}
                        onChange={(value) =>
                          onUpdateOperation(selectedOperation.id, {
                            tabHeight: Math.max(0.1, value || 0.1),
                          })
                        }
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {selectedOperation.type === 'sketch' ? (
            <>
              <label className="field-row">
                <span>Segments</span>
                <input type="number" value={sketchSegments.length} readOnly />
              </label>
              {sketchStart ? (
                <>
                  <h3>Sketch start</h3>
                  <NumericFieldRow
                    label="Start X"
                    value={sketchStart.x}
                    onChange={(value) => updateSketchStart(selectedOperation, { x: value }, onUpdateOperation)}
                  />
                  <NumericFieldRow
                    label="Start Y"
                    value={sketchStart.y}
                    onChange={(value) => updateSketchStart(selectedOperation, { y: value }, onUpdateOperation)}
                  />
                </>
              ) : null}
              <label className="field-row checkbox-row">
                <span>Closed path</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedOperation.closed)}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, {
                      closed: event.target.checked,
                      cutSide: event.target.checked
                        ? selectedOperation.cutSide || 'outside'
                        : 'along',
                      tabsEnabled: event.target.checked ? selectedOperation.tabsEnabled : false,
                      pocketEnabled: event.target.checked ? selectedOperation.pocketEnabled : false,
                    })
                  }
                  disabled={sketchSegments.length < 2 || !sketchStart}
                />
              </label>
              {sketchIntegrity ? (
                <>
                  <h3>Sketch integrity</h3>
                  <label className="field-row">
                    <span>Detected path</span>
                    <input
                      type="text"
                      readOnly
                      value={
                        sketchIntegrity.detectedClosed
                          ? 'Closed'
                          : sketchIntegrity.segmentCount === 0
                            ? 'Empty'
                            : 'Open'
                      }
                    />
                  </label>
                  <label className="field-row">
                    <span>Subpaths</span>
                    <input type="number" readOnly value={sketchIntegrity.subpathCount} />
                  </label>
                  <label className="field-row">
                    <span>Open gap (mm)</span>
                    <input
                      type="number"
                      readOnly
                      value={sketchIntegrity.openGap === null ? 0 : Number(sketchIntegrity.openGap.toFixed(3))}
                    />
                  </label>
                  {sketchIntegrity.detectedClosed !== sketchIntegrity.storedClosed ? (
                    <p className="hint-text">
                      Stored closed state does not match detected geometry. Review the path before generating
                      toolpaths.
                    </p>
                  ) : null}
                  {sketchIntegrity.issues.length > 0 ? (
                    <div className="button-column">
                      {sketchIntegrity.issues.map((issue) => (
                        <p key={`${selectedOperation.id}-${issue.code}`} className="hint-text">
                          {issue.message}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="hint-text">No integrity issues detected in the current sketch geometry.</p>
                  )}
                </>
              ) : null}
              {effectiveSketchClosed ? (
                <>
                  {shouldShowSketchPocketControls ? (
                    <>
                      <label className="field-row checkbox-row">
                        <span>Clear area</span>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedOperation.pocketEnabled && selectedOperation.cutSide === 'inside')}
                          onChange={(event) =>
                            onUpdateOperation(selectedOperation.id, {
                              closed: true,
                              cutSide: event.target.checked ? 'inside' : selectedOperation.cutSide,
                              pocketEnabled: event.target.checked,
                            })
                          }
                        />
                      </label>
                      {selectedOperation.pocketEnabled ? (
                        <NumericFieldRow
                          label="Step-over"
                          value={selectedOperation.pocketStepOver}
                          min={0.1}
                          onChange={(value) =>
                            onUpdateOperation(selectedOperation.id, {
                              pocketStepOver: Math.max(0.1, value || 0.1),
                            })
                          }
                        />
                      ) : null}
                    </>
                  ) : null}
                  {!shouldHideTabsForPocket ? (
                    <>
                      <label className="field-row checkbox-row">
                        <span>Retaining tabs</span>
                        <input
                          type="checkbox"
                          checked={Boolean(selectedOperation.tabsEnabled)}
                          onChange={(event) =>
                            onUpdateOperation(selectedOperation.id, { tabsEnabled: event.target.checked })
                          }
                        />
                      </label>
                      {selectedOperation.tabsEnabled ? (
                        <>
                          <NumericFieldRow
                            label="Tab count"
                            value={selectedOperation.tabCount ?? 2}
                            min={1}
                            step={1}
                            onChange={(value) =>
                              onUpdateOperation(selectedOperation.id, {
                                tabCount: Math.max(1, Math.round(value || 1)),
                              })
                            }
                          />
                          <NumericFieldRow
                            label="Tab width"
                            value={selectedOperation.tabWidth ?? 1}
                            min={0.1}
                            onChange={(value) =>
                              onUpdateOperation(selectedOperation.id, {
                                tabWidth: Math.max(0.1, value || 0.1),
                              })
                            }
                          />
                          <NumericFieldRow
                            label="Tab height"
                            value={selectedOperation.tabHeight ?? 1}
                            min={0.1}
                            onChange={(value) =>
                              onUpdateOperation(selectedOperation.id, {
                                tabHeight: Math.max(0.1, value || 0.1),
                              })
                            }
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
              {sketchSegments.length > 0 ? (
                <>
                  <h3>Sketch edit</h3>
                  <div className="button-column">
                    {isEditingSelectedSketch ? (
                      <>
                        <button type="button" className="accent" onClick={onStopSketchEdit}>
                          Finish sketch edit
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={onDeleteSelectedSketchSegment}
                          disabled={!Number.isInteger(selectedSketchSegmentIndex)}
                        >
                          Delete selected segment
                        </button>
                        <p className="hint-text">
                          Drag sketch handles in the canvas. Click a segment in the canvas to select it for
                          deletion, or use the `Poly-Line` / `Poly-Arc` toolbar tool to place new replacement
                          segments by choosing their own start and end points.
                        </p>
                      </>
                    ) : (
                      <button type="button" className="accent" onClick={onStartSketchEdit}>
                        Edit sketch
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="panel-section-toggle"
                    onClick={() => setShowSegmentDetails((current) => !current)}
                  >
                    {showSegmentDetails ? 'Hide segment details' : 'Edit segments'}
                  </button>
                  {showSegmentDetails ? (
                    <>
                      <h3>Segments</h3>
                      {sketchSegments.map((segment, index) => (
                        <div
                          key={`${selectedOperation.id}-segment-${index}`}
                          style={{
                            padding: 8,
                            marginBottom: 8,
                            border: index === selectedSketchSegmentIndex ? '1px solid #38bdf8' : '1px solid #334155',
                            borderRadius: 8,
                            background: index === selectedSketchSegmentIndex ? '#082f49' : 'transparent',
                          }}
                        >
                          <label className="field-row">
                            <span>Segment {index + 1}</span>
                            <input type="text" value={segment.type.toUpperCase()} readOnly />
                          </label>
                          <NumericFieldRow
                            label="Start X"
                            value={segment.x1}
                            onChange={(value) =>
                              updateSketchSegment(selectedOperation, index, { x1: value }, onUpdateOperation)
                            }
                          />
                          <NumericFieldRow
                            label="Start Y"
                            value={segment.y1}
                            onChange={(value) =>
                              updateSketchSegment(selectedOperation, index, { y1: value }, onUpdateOperation)
                            }
                          />
                          <NumericFieldRow
                            label="End X"
                            value={segment.x2}
                            onChange={(value) =>
                              updateSketchSegment(selectedOperation, index, { x2: value }, onUpdateOperation)
                            }
                          />
                          <NumericFieldRow
                            label="End Y"
                            value={segment.y2}
                            onChange={(value) =>
                              updateSketchSegment(selectedOperation, index, { y2: value }, onUpdateOperation)
                            }
                          />
                          {segment.type === 'arc' ? (
                            <>
                              <NumericFieldRow
                                label="Through X"
                                value={segment.throughX}
                                onChange={(value) =>
                                  updateSketchSegment(selectedOperation, index, { throughX: value }, onUpdateOperation)
                                }
                              />
                              <NumericFieldRow
                                label="Through Y"
                                value={segment.throughY}
                                onChange={(value) =>
                                  updateSketchSegment(selectedOperation, index, { throughY: value }, onUpdateOperation)
                                }
                              />
                            </>
                          ) : null}
                        </div>
                      ))}
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {selectedOperation.type === 'rect' ? (
            <>
              <NumericFieldRow label="X" value={selectedOperation.x} onChange={(value) => onUpdateOperation(selectedOperation.id, { x: value })} />
              <NumericFieldRow label="Y" value={selectedOperation.y} onChange={(value) => onUpdateOperation(selectedOperation.id, { y: value })} />
              <NumericFieldRow label="Width" value={selectedOperation.width} onChange={(value) => onUpdateOperation(selectedOperation.id, { width: value })} />
              <NumericFieldRow label="Height" value={selectedOperation.height} onChange={(value) => onUpdateOperation(selectedOperation.id, { height: value })} />
              <NumericFieldRow
                label="Corner radius"
                value={selectedOperation.cornerRadius ?? 0}
                min={0}
                max={rectCornerMax}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    cornerRadius: Math.min(Math.max(0, value || 0), rectCornerMax),
                  })
                }
              />
              {shouldShowPocketControls ? (
                <>
                  <label className="field-row checkbox-row">
                    <span>Clear area</span>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedOperation.pocketEnabled && selectedOperation.cutSide === 'inside')}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, {
                          cutSide: event.target.checked ? 'inside' : selectedOperation.cutSide,
                          pocketEnabled: event.target.checked,
                        })
                      }
                    />
                  </label>
                  {selectedOperation.pocketEnabled ? (
                    <NumericFieldRow
                      label="Step-over"
                      value={selectedOperation.pocketStepOver}
                      min={0.1}
                      onChange={(value) =>
                        onUpdateOperation(selectedOperation.id, {
                          pocketStepOver: Math.max(0.1, value || 0.1),
                        })
                      }
                    />
                  ) : null}
                </>
              ) : null}
              {!shouldHideTabsForPocket ? (
                <>
              <label className="field-row checkbox-row">
                <span>Retaining tabs</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedOperation.tabsEnabled)}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { tabsEnabled: event.target.checked })
                  }
                />
              </label>
              {selectedOperation.tabsEnabled ? (
                <>
                  <NumericFieldRow
                    label="Tab count"
                    value={selectedOperation.tabCount ?? 2}
                    min={1}
                    step={1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        tabCount: Math.max(1, Math.round(value || 1)),
                      })
                    }
                  />
                  <NumericFieldRow
                    label="Tab width"
                    value={selectedOperation.tabWidth ?? 1}
                    min={0.1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        tabWidth: Math.max(0.1, value || 0.1),
                      })
                    }
                  />
                  <NumericFieldRow
                    label="Tab height"
                    value={selectedOperation.tabHeight ?? 1}
                    min={0.1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        tabHeight: Math.max(0.1, value || 0.1),
                      })
                    }
                  />
                </>
              ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {selectedOperation.type === 'circle' ? (
            <>
              <NumericFieldRow label="Center X" value={selectedOperation.x} onChange={(value) => onUpdateOperation(selectedOperation.id, { x: value })} />
              <NumericFieldRow label="Center Y" value={selectedOperation.y} onChange={(value) => onUpdateOperation(selectedOperation.id, { y: value })} />
              <NumericFieldRow
                label="Radius"
                value={selectedOperation.radius}
                min={0.1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    radius: Math.max(0.1, value || 0.1),
                  })
                }
              />
              {shouldShowPocketControls ? (
                <>
                  <label className="field-row checkbox-row">
                    <span>Clear area</span>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedOperation.pocketEnabled && selectedOperation.cutSide === 'inside')}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, {
                          cutSide: event.target.checked ? 'inside' : selectedOperation.cutSide,
                          pocketEnabled: event.target.checked,
                        })
                      }
                    />
                  </label>
                  {selectedOperation.pocketEnabled ? (
                    <NumericFieldRow
                      label="Step-over"
                      value={selectedOperation.pocketStepOver}
                      min={0.1}
                      onChange={(value) =>
                        onUpdateOperation(selectedOperation.id, {
                          pocketStepOver: Math.max(0.1, value || 0.1),
                        })
                      }
                    />
                  ) : null}
                </>
              ) : null}
              {!shouldHideTabsForPocket ? (
                <>
              <label className="field-row checkbox-row">
                <span>Retaining tabs</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedOperation.tabsEnabled)}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { tabsEnabled: event.target.checked })
                  }
                />
              </label>
              {selectedOperation.tabsEnabled ? (
                <>
                  <NumericFieldRow
                    label="Tab count"
                    value={selectedOperation.tabCount ?? 2}
                    min={1}
                    step={1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        tabCount: Math.max(1, Math.round(value || 1)),
                      })
                    }
                  />
                  <NumericFieldRow
                    label="Tab width"
                    value={selectedOperation.tabWidth ?? 1}
                    min={0.1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        tabWidth: Math.max(0.1, value || 0.1),
                      })
                    }
                  />
                  <NumericFieldRow
                    label="Tab height"
                    value={selectedOperation.tabHeight ?? 1}
                    min={0.1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        tabHeight: Math.max(0.1, value || 0.1),
                      })
                    }
                  />
                </>
              ) : null}
                </>
              ) : null}
            </>
          ) : null}

          <button
            className="danger"
            type="button"
            onClick={() => onDeleteOperation(selectedOperation.id)}
          >
            Delete operation
          </button>

          <h3>Linear repeat</h3>
          <NumericFieldRow label="Copies" value={repeatCount} min={1} step={1} onChange={(value) => setRepeatCount(Math.max(1, Math.round(value || 1)))} />
          <NumericFieldRow label="Offset X (mm)" value={repeatOffsetX} onChange={(value) => setRepeatOffsetX(value || 0)} />
          <NumericFieldRow label="Offset Y (mm)" value={repeatOffsetY} onChange={(value) => setRepeatOffsetY(value || 0)} />
          <button
            type="button"
            className="accent"
            onClick={() =>
              onRepeatOperation({
                count: repeatCount,
                offsetX: repeatOffsetX,
                offsetY: repeatOffsetY,
              })
            }
          >
            Repeat selected
          </button>
        </div>
      ) : (
        <div className="operation-editor">
          {selectedCount > 1 ? (
            <>
              <h3>Selected: {selectedCount} operations</h3>
              <p className="hint-text">
                Multi-selection active. Drag selected geometry in the canvas to move as a group, or use the
                actions below.
              </p>
              {allSelectedAreCircles ? (
                <>
                  <h3>Bulk edit circles</h3>
                  <NumericFieldRow
                    label="Radius (mm)"
                    value={bulkCircleRadiusValue}
                    min={0}
                    onChange={(value) => applyToSelectedCircles({ radius: Math.max(0, value || 0) })}
                  />
                  <NumericFieldRow
                    label="Pocket step-over (mm)"
                    value={bulkCircleStepOverValue}
                    min={0.1}
                    onChange={(value) => applyToSelectedCircles({ pocketStepOver: Math.max(0.1, value || 0.1) })}
                  />
                </>
              ) : null}
              <h3>Linear repeat</h3>
              <NumericFieldRow label="Copies" value={repeatCount} min={1} step={1} onChange={(value) => setRepeatCount(Math.max(1, Math.round(value || 1)))} />
              <NumericFieldRow label="Offset X (mm)" value={repeatOffsetX} onChange={(value) => setRepeatOffsetX(value || 0)} />
              <NumericFieldRow label="Offset Y (mm)" value={repeatOffsetY} onChange={(value) => setRepeatOffsetY(value || 0)} />
              <div className="button-column">
                <button
                  type="button"
                  className="accent"
                  onClick={() =>
                    onRepeatOperation({
                      count: repeatCount,
                      offsetX: repeatOffsetX,
                      offsetY: repeatOffsetY,
                    })
                  }
                >
                  Repeat selected
                </button>
                <button type="button" className="danger" onClick={onDeleteSelection}>
                  Delete selection
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="hint-text">Select an operation to edit exact dimensions and depth.</p>
            </>
          )}
        </div>
      )) : null}

      {activeTab === 'list' ? (
        <>
          <h2>Operations list</h2>
          {operations.length === 0 && importedMeshes.length === 0 ? (
              <p className="hint-text">No operations yet. Use tools above to place drill points or cut paths.</p>
          ) : (
            <>
              {operations.length === 0 && importedMeshes.length > 0 ? (
                <p className="hint-text">
                  No cut operations yet. Imported meshes can be positioned here before generating STL-derived toolpaths.
                </p>
              ) : null}
              <ul className="operations-list">
              {importedMeshes.map((mesh) => {
                const isSelected = selectedImportedMesh?.id === mesh.id;
                return (
                  <li key={mesh.id}>
                    <div className={`operation-item ${isSelected ? 'selected' : ''}`}>
                      <button
                        type="button"
                        className="operation-main"
                        onClick={() => onSelectImportedMesh(mesh.id)}
                      >
                        <span className="operation-type">STL</span>
                        <span>{mesh.name}</span>
                        <span className="operation-tool">{mesh.triangleCount} tris</span>
                        <span className="operation-tool">
                          {Number((mesh.localBounds.maxX - mesh.localBounds.minX).toFixed(1))} x{' '}
                          {Number((mesh.localBounds.maxY - mesh.localBounds.minY).toFixed(1))} x{' '}
                          {Number((mesh.localBounds.maxZ - mesh.localBounds.minZ).toFixed(1))}
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
              {operations.map((operation, index) => {
                const isSelected = selectedOperationIds?.includes(operation.id);
                return (
                  <li key={operation.id}>
                    <div className={`operation-item ${isSelected ? 'selected' : ''}`}>
                      <button
                        type="button"
                        className="operation-main"
                        onDoubleClick={() => {
                          onSelectOperation(operation.id);
                          setActiveTab('details');
                        }}
                        onClick={(event) =>
                          onSelectOperation(operation.id, {
                            additive: false,
                            toggle: Boolean((event.ctrlKey || event.metaKey) && !event.shiftKey),
                            range: event.shiftKey,
                          })
                        }
                      >
                        <span className="operation-type">{operation.type.toUpperCase()}</span>
                        <span>{formatOperationLabel(operation)}</span>
                        <span className="operation-tool">{getToolName(operation.toolId, tools)}</span>
                        <span className="operation-tool">{getMaterialName(operation.materialId, materials)}</span>
                      </button>
                      <div className="operation-order-controls">
                        <button
                          type="button"
                          onClick={() => onMoveOperationToEdge(operation.id, 'top')}
                          disabled={index === 0}
                          title="Move to top"
                          aria-label={`Move ${formatOperationLabel(operation)} to top`}
                        >
                          ⇤
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveOperation(operation.id, -1)}
                          disabled={index === 0}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveOperation(operation.id, 1)}
                          disabled={index === operations.length - 1}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveOperationToEdge(operation.id, 'bottom')}
                          disabled={index === operations.length - 1}
                          title="Move to bottom"
                          aria-label={`Move ${formatOperationLabel(operation)} to bottom`}
                        >
                          ⇥
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              </ul>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
