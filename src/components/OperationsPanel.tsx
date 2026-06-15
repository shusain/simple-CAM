import React, { useState } from 'react';
import { getSketchSegments, getSketchStartPoint } from '../utils/geometry';
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
  const sketchCutOptions: CutSide[] =
    selectedOperation?.type === 'sketch' && selectedOperation.closed
      ? ['outside', 'inside', 'along']
      : ['along'];

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
              onChange={(value) => onUpdateOperation(selectedOperation.id, { cutSide: value })}
            />
          ) : null}

          {selectedOperation.type === 'sketch' ? (
            <CutSideEditor
              value={selectedOperation.cutSide || (selectedOperation.closed ? 'outside' : 'along')}
              onChange={(value) => onUpdateOperation(selectedOperation.id, { cutSide: value })}
              disabled={!selectedOperation.closed}
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
              <label className="field-row">
                <span>X (mm)</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.x}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { x: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Y (mm)</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.y}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { y: Number(event.target.value) })
                  }
                />
              </label>
            </>
          ) : null}

          {selectedOperation.type === 'line' ? (
            <>
              <label className="field-row">
                <span>X1</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.x1}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { x1: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Y1</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.y1}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { y1: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>X2</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.x2}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { x2: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Y2</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.y2}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { y2: Number(event.target.value) })
                  }
                />
              </label>
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
                  <label className="field-row">
                    <span>Start X</span>
                    <input
                      type="number"
                      step="0.1"
                      value={sketchStart.x}
                      onChange={(event) =>
                        updateSketchStart(
                          selectedOperation,
                          { x: Number(event.target.value) },
                          onUpdateOperation
                        )
                      }
                    />
                  </label>
                  <label className="field-row">
                    <span>Start Y</span>
                    <input
                      type="number"
                      step="0.1"
                      value={sketchStart.y}
                      onChange={(event) =>
                        updateSketchStart(
                          selectedOperation,
                          { y: Number(event.target.value) },
                          onUpdateOperation
                        )
                      }
                    />
                  </label>
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
                    })
                  }
                  disabled={sketchSegments.length < 2 || !sketchStart}
                />
              </label>
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
                      <label className="field-row">
                        <span>End X</span>
                        <input
                          type="number"
                          step="0.1"
                          value={segment.x2}
                          onChange={(event) =>
                            updateSketchSegment(
                              selectedOperation,
                              index,
                              { x2: Number(event.target.value) },
                              onUpdateOperation
                            )
                          }
                        />
                      </label>
                      <label className="field-row">
                        <span>End Y</span>
                        <input
                          type="number"
                          step="0.1"
                          value={segment.y2}
                          onChange={(event) =>
                            updateSketchSegment(
                              selectedOperation,
                              index,
                              { y2: Number(event.target.value) },
                              onUpdateOperation
                            )
                          }
                        />
                      </label>
                      {segment.type === 'arc' ? (
                        <>
                          <label className="field-row">
                            <span>Through X</span>
                            <input
                              type="number"
                              step="0.1"
                              value={segment.throughX}
                              onChange={(event) =>
                                updateSketchSegment(
                                  selectedOperation,
                                  index,
                                  { throughX: Number(event.target.value) },
                                  onUpdateOperation
                                )
                              }
                            />
                          </label>
                          <label className="field-row">
                            <span>Through Y</span>
                            <input
                              type="number"
                              step="0.1"
                              value={segment.throughY}
                              onChange={(event) =>
                                updateSketchSegment(
                                  selectedOperation,
                                  index,
                                  { throughY: Number(event.target.value) },
                                  onUpdateOperation
                                )
                              }
                            />
                          </label>
                        </>
                      ) : null}
                    </div>
                  ))}
                </>
              ) : null}
              {selectedOperation.closed ? (
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
                      <label className="field-row">
                        <span>Tab count</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={selectedOperation.tabCount ?? 2}
                          onChange={(event) =>
                            onUpdateOperation(selectedOperation.id, {
                              tabCount: Math.max(1, Math.round(Number(event.target.value) || 1)),
                            })
                          }
                        />
                      </label>
                      <label className="field-row">
                        <span>Tab width</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={selectedOperation.tabWidth ?? 1}
                          onChange={(event) =>
                            onUpdateOperation(selectedOperation.id, {
                              tabWidth: Math.max(0.1, Number(event.target.value) || 0.1),
                            })
                          }
                        />
                      </label>
                      <label className="field-row">
                        <span>Tab height</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={selectedOperation.tabHeight ?? 1}
                          onChange={(event) =>
                            onUpdateOperation(selectedOperation.id, {
                              tabHeight: Math.max(0.1, Number(event.target.value) || 0.1),
                            })
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {selectedOperation.type === 'rect' ? (
            <>
              <label className="field-row">
                <span>X</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.x}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { x: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Y</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.y}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { y: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Width</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.width}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { width: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Height</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.height}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { height: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Corner radius</span>
                <input
                  type="number"
                  min="0"
                  max={rectCornerMax}
                  step="0.1"
                  value={selectedOperation.cornerRadius ?? 0}
                  onChange={(event) => {
                    const next = Math.max(0, Number(event.target.value) || 0);
                    onUpdateOperation(selectedOperation.id, {
                      cornerRadius: Math.min(next, rectCornerMax),
                    });
                  }}
                />
              </label>
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
                  <label className="field-row">
                    <span>Tab count</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={selectedOperation.tabCount ?? 2}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, {
                          tabCount: Math.max(1, Math.round(Number(event.target.value) || 1)),
                        })
                      }
                    />
                  </label>
                  <label className="field-row">
                    <span>Tab width</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={selectedOperation.tabWidth ?? 1}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, {
                          tabWidth: Math.max(0.1, Number(event.target.value) || 0.1),
                        })
                      }
                    />
                  </label>
                  <label className="field-row">
                    <span>Tab height</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={selectedOperation.tabHeight ?? 1}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, {
                          tabHeight: Math.max(0.1, Number(event.target.value) || 0.1),
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
            </>
          ) : null}

          {selectedOperation.type === 'circle' ? (
            <>
              <label className="field-row">
                <span>Center X</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.x}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { x: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Center Y</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedOperation.y}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, { y: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field-row">
                <span>Radius</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={selectedOperation.radius}
                  onChange={(event) =>
                    onUpdateOperation(selectedOperation.id, {
                      radius: Math.max(0.1, Number(event.target.value) || 0.1),
                    })
                  }
                />
              </label>
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
                  <label className="field-row">
                    <span>Tab count</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={selectedOperation.tabCount ?? 2}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, {
                          tabCount: Math.max(1, Math.round(Number(event.target.value) || 1)),
                        })
                      }
                    />
                  </label>
                  <label className="field-row">
                    <span>Tab width</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={selectedOperation.tabWidth ?? 1}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, {
                          tabWidth: Math.max(0.1, Number(event.target.value) || 0.1),
                        })
                      }
                    />
                  </label>
                  <label className="field-row">
                    <span>Tab height</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={selectedOperation.tabHeight ?? 1}
                      onChange={(event) =>
                        onUpdateOperation(selectedOperation.id, {
                          tabHeight: Math.max(0.1, Number(event.target.value) || 0.1),
                        })
                      }
                    />
                  </label>
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
          <label className="field-row">
            <span>Copies</span>
            <input
              type="number"
              min="1"
              step="1"
              value={repeatCount}
              onChange={(event) => setRepeatCount(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <label className="field-row">
            <span>Offset X (mm)</span>
            <input
              type="number"
              step="0.1"
              value={repeatOffsetX}
              onChange={(event) => setRepeatOffsetX(Number(event.target.value) || 0)}
            />
          </label>
          <label className="field-row">
            <span>Offset Y (mm)</span>
            <input
              type="number"
              step="0.1"
              value={repeatOffsetY}
              onChange={(event) => setRepeatOffsetY(Number(event.target.value) || 0)}
            />
          </label>
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
              <label className="field-row">
                <span>Copies</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={repeatCount}
                  onChange={(event) => setRepeatCount(Math.max(1, Number(event.target.value) || 1))}
                />
              </label>
              <label className="field-row">
                <span>Offset X (mm)</span>
                <input
                  type="number"
                  step="0.1"
                  value={repeatOffsetX}
                  onChange={(event) => setRepeatOffsetX(Number(event.target.value) || 0)}
                />
              </label>
              <label className="field-row">
                <span>Offset Y (mm)</span>
                <input
                  type="number"
                  step="0.1"
                  value={repeatOffsetY}
                  onChange={(event) => setRepeatOffsetY(Number(event.target.value) || 0)}
                />
              </label>
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
