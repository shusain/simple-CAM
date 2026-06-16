import React, { useState } from 'react';
import { analyzeSketchIntegrity, getSketchSegments, getSketchStartPoint } from '../utils/geometry';
import NumericInput from './common/NumericInput';
import type {
  CutSide,
  Operation,
} from '../types';
import { CutSideEditor, DepthEditor } from './operationsPanel/controls';
import {
  formatOperationLabel,
  getMaterialName,
  getToolName,
  updateSketchSegment,
  updateSketchStart,
} from './operationsPanel/helpers';
import type { OperationsPanelProps } from './operationsPanel/types';

interface NumericFieldRowProps {
  label: string;
  value: number;
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
  selectedOperation,
  selectedOperationIds,
  materials,
  tools,
  onSelectOperation,
  onUpdateOperation,
  onDeleteOperation,
  onDeleteSelection,
  onMoveOperation,
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
  const sketchStart = selectedOperation?.type === 'sketch' ? getSketchStartPoint(selectedOperation) : null;
  const sketchSegments = selectedOperation?.type === 'sketch' ? getSketchSegments(selectedOperation) : [];
  const sketchIntegrity = selectedOperation?.type === 'sketch' ? analyzeSketchIntegrity(selectedOperation) : null;
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

  return (
    <div className="panel">
      {selectedOperation ? (
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
      )}

      <h2>Operations list</h2>
      {operations.length === 0 ? (
        <p className="hint-text">No operations yet. Use tools above to place drill points or cut paths.</p>
      ) : (
        <ul className="operations-list">
          {operations.map((operation, index) => {
            const isSelected = selectedOperationIds?.includes(operation.id);
            return (
              <li key={operation.id}>
                <div className={`operation-item ${isSelected ? 'selected' : ''}`}>
                  <button
                    type="button"
                    className="operation-main"
                    onClick={(event) =>
                      onSelectOperation(operation.id, {
                        additive: event.shiftKey,
                        toggle: event.shiftKey,
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
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
