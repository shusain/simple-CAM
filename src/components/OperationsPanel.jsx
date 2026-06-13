import React, { useState } from 'react';

function formatOperationLabel(operation) {
  if (operation.type === 'drill') {
    return `Drill @ X${operation.x.toFixed(2)} Y${operation.y.toFixed(2)}`;
  }

  if (operation.type === 'line') {
    return `Line (${operation.x1.toFixed(1)}, ${operation.y1.toFixed(1)}) → (${operation.x2.toFixed(
      1
    )}, ${operation.y2.toFixed(1)})`;
  }

  if (operation.type === 'rect') {
    const cornerRadius = Math.max(0, Number(operation.cornerRadius) || 0);
    return `Rect ${Math.abs(operation.width).toFixed(1)} x ${Math.abs(operation.height).toFixed(1)} mm R${cornerRadius.toFixed(1)}`;
  }

  if (operation.type === 'circle') {
    return `Circle R${operation.radius.toFixed(2)} @ X${operation.x.toFixed(1)} Y${operation.y.toFixed(1)}`;
  }

  return operation.type;
}

function getToolName(toolId, tools) {
  const tool = tools.find((item) => item.id === toolId);
  return tool ? `${tool.name} (Ø${tool.diameter}mm)` : 'Unassigned tool';
}

function DepthEditor({ value, onChange }) {
  return (
    <label className="field-row">
      <span>Depth (mm)</span>
      <input
        type="number"
        step="0.1"
        value={value ?? ''}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function OperationsPanel({
  operations,
  selectedOperation,
  selectedOperationIds,
  tools,
  onSelectOperation,
  onUpdateOperation,
  onDeleteOperation,
  onDeleteSelection,
  onMoveOperation,
  onRepeatOperation,
}) {
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

  return (
    <div className="panel">
      {selectedOperation ? (
        <div className="operation-editor">
          <h3>Selected: {selectedOperation.type.toUpperCase()}</h3>

          <DepthEditor
            value={selectedOperation.depth}
            onChange={(value) => onUpdateOperation(selectedOperation.id, { depth: value })}
          />

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
              <div className="button-column">
                <button type="button" onClick={onRepeatOperation ? () => onRepeatOperation({ count: 1, offsetX: 10, offsetY: 0 }) : undefined}>
                  Quick repeat +10mm X
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

