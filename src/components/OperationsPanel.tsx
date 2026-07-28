import React, { useEffect, useRef, useState } from 'react';
import { analyzeSketchIntegrity, getSketchSegments, getSketchStartPoint } from '../utils/geometry';
import { getImportedMeshWorldBounds } from '../utils/importStl';
import {
  formatMillingToolGeometrySummary,
  getMillingToolMaxUsableDepth,
  getMillingToolTypeLabel,
} from '../utils/millingToolGeometry';
import {
  getDefaultChamferWidth,
  getDefaultVGrooveWidth,
  resolveChamferEdgePlan,
  resolveVGroovePlan,
} from '../utils/millingPathStrategy';
import { resolveLaserMaterialPreset } from '../utils/tooling';
import { TEXT_FONT_OPTIONS } from '../utils/text';
import NumericInput from './common/NumericInput';
import InfoDisclosure from './common/InfoDisclosure';
import type {
  CutSide,
  Operation,
} from '../types';
import { isPathOperation } from '../types';
import { CutSideEditor, DepthEditor } from './operationsPanel/controls';
import {
  formatOperationLabel,
  getImportedMeshName,
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
  const selectedOperationTool = selectedOperation
    ? tools.find((tool) => tool.id === selectedOperation.toolId) || null
    : null;
  const isLaserOperation = Boolean(selectedOperationTool?.isLaser);
  const selectedPathOperation = isPathOperation(selectedOperation) ? selectedOperation : null;
  const millingStrategy = selectedPathOperation?.millingStrategy || 'standard';
  const isVGroove = millingStrategy === 'v-groove';
  const isChamferEdge = millingStrategy === 'chamfer-edge';
  const isSpecialMillingStrategy = isVGroove || isChamferEdge;
  const selectedToolIsVBit =
    Boolean(selectedOperationTool && !selectedOperationTool.isLaser) &&
    selectedOperationTool?.millingGeometry.type === 'v-bit';
  const selectedToolIsChamfer =
    Boolean(selectedOperationTool && !selectedOperationTool.isLaser) &&
    selectedOperationTool?.millingGeometry.type === 'chamfer';
  const selectedPathSupportsChamfer =
    selectedPathOperation?.type === 'rect' ||
    selectedPathOperation?.type === 'circle' ||
    selectedPathOperation?.type === 'text' ||
    (selectedPathOperation?.type === 'sketch' &&
      Boolean(sketchIntegrity?.detectedClosed || selectedPathOperation.closed));
  const vGroovePlan = selectedPathOperation
    ? resolveVGroovePlan(selectedPathOperation, selectedOperationTool, -1)
    : null;
  const chamferEdgePlan = selectedPathOperation
    ? resolveChamferEdgePlan(selectedPathOperation, selectedOperationTool, -1)
    : null;
  const millingPathPlan = vGroovePlan || chamferEdgePlan;
  const millingToolMaxDepth =
    selectedOperationTool && !selectedOperationTool.isLaser
      ? getMillingToolMaxUsableDepth(selectedOperationTool)
      : 0;
  const selectedTargetDepth =
    millingPathPlan?.valid
      ? Math.abs(millingPathPlan.finalDepth)
      : Math.abs(Number(selectedOperation?.depth) || 0);
  const exceedsMillingToolDepth =
    millingToolMaxDepth > 0 && selectedTargetDepth > millingToolMaxDepth + 1e-6;
  const selectedLaserPreset = resolveLaserMaterialPreset(
    selectedOperationTool,
    selectedOperation?.materialId
  );
  const supportsLaserOutput =
    selectedOperation?.type === 'line' ||
    selectedOperation?.type === 'rect' ||
    selectedOperation?.type === 'circle' ||
    selectedOperation?.type === 'sketch' ||
    selectedOperation?.type === 'text' ||
    selectedOperation?.type === 'image-fill';
  const isImageFill = selectedOperation?.type === 'image-fill';
  const laserProcess =
    isImageFill
      ? 'etch'
      : selectedOperation?.laserProcess ||
        (selectedOperation?.type === 'text' ? 'etch' : 'cut');
  const laserPower =
    selectedOperation?.laserPower ??
    (laserProcess === 'etch'
      ? selectedLaserPreset.etchPowerMin
      : selectedLaserPreset.cutPowerMax);
  const laserSpeed =
    selectedOperation?.laserSpeed ??
    (laserProcess === 'etch'
      ? selectedLaserPreset.etchSpeedMax
      : selectedLaserPreset.cutSpeedMin);
  const laserPowerMin =
    laserProcess === 'etch'
      ? selectedLaserPreset.etchPowerMin
      : selectedLaserPreset.cutPowerMin;
  const laserPowerMax =
    laserProcess === 'etch'
      ? selectedLaserPreset.etchPowerMax
      : selectedLaserPreset.cutPowerMax;
  const imagePowerMin =
    selectedOperation?.type === 'image-fill'
      ? selectedOperation.laserPowerMin
      : laserPowerMin;
  const imagePowerMax =
    selectedOperation?.type === 'image-fill'
      ? selectedOperation.laserPowerMax
      : laserPowerMax;
  const laserSpeedMin =
    laserProcess === 'etch'
      ? selectedLaserPreset.etchSpeedMin
      : selectedLaserPreset.cutSpeedMin;
  const laserSpeedMax =
    laserProcess === 'etch'
      ? selectedLaserPreset.etchSpeedMax
      : selectedLaserPreset.cutSpeedMax;
  const effectiveSketchClosed =
    selectedOperation?.type === 'sketch'
      ? Boolean(sketchIntegrity?.detectedClosed || selectedOperation.closed)
      : false;
  const canLaserFill =
    selectedOperation?.type === 'rect' ||
    selectedOperation?.type === 'circle' ||
    selectedOperation?.type === 'text' ||
    (selectedOperation?.type === 'sketch' && effectiveSketchClosed);
  const sketchCutOptions: CutSide[] =
    selectedOperation?.type === 'sketch' && effectiveSketchClosed
      ? ['outside', 'inside', 'along']
      : ['along'];
  const shouldShowPocketControls =
    !isLaserOperation &&
    millingStrategy === 'standard' &&
    (selectedOperation?.type === 'rect' || selectedOperation?.type === 'circle');
  const shouldShowSketchPocketControls =
    !isLaserOperation &&
    millingStrategy === 'standard' &&
    selectedOperation?.type === 'sketch' &&
    effectiveSketchClosed;
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

      {activeTab === 'details' ? (
        <div className="details-units" role="note">
          Editor units: distance mm · feeds mm/min · angles ° · laser power %
        </div>
      ) : null}

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
            <span>Width</span>
            <input
              type="number"
              readOnly
              value={Number((selectedImportedMesh.localBounds.maxX - selectedImportedMesh.localBounds.minX).toFixed(3))}
            />
          </label>
          <label className="field-row">
            <span>Height</span>
            <input
              type="number"
              readOnly
              value={Number((selectedImportedMesh.localBounds.maxY - selectedImportedMesh.localBounds.minY).toFixed(3))}
            />
          </label>
          <label className="field-row">
            <span>Depth</span>
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
          <InfoDisclosure label="About mesh placement">
            Drag the STL silhouette in the 2D canvas or edit the center position here before surface roughing or finishing operations are generated.
          </InfoDisclosure>
        </div>
      ) : selectedOperation ? (
        <div className="operation-editor">
          <h3>Selected: {selectedOperation.type.toUpperCase()}</h3>

          {!isLaserOperation ? (
            <DepthEditor
              value={selectedOperation.depth}
              onChange={(value) => onUpdateOperation(selectedOperation.id, { depth: value })}
              label={isSpecialMillingStrategy ? 'Maximum depth' : 'Depth'}
            />
          ) : null}

          {!isLaserOperation && !isVGroove && (selectedOperation.type === 'rect' || selectedOperation.type === 'circle') ? (
            <CutSideEditor
              value={selectedOperation.cutSide || 'outside'}
              onChange={(value) =>
                onUpdateOperation(selectedOperation.id, {
                  cutSide: value,
                  pocketEnabled: value === 'inside' ? selectedOperation.pocketEnabled : false,
                })
              }
              options={isChamferEdge ? ['outside', 'inside'] : undefined}
            />
          ) : null}

          {!isLaserOperation && !isVGroove && selectedOperation.type === 'sketch' ? (
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
              options={isChamferEdge ? ['outside', 'inside'] : sketchCutOptions}
            />
          ) : null}

          {!isLaserOperation && !isVGroove && selectedOperation.type === 'text' ? (
            <CutSideEditor
              value={selectedOperation.cutSide || 'along'}
              onChange={(value) =>
                onUpdateOperation(selectedOperation.id, {
                  cutSide: value,
                })
              }
              options={isChamferEdge ? ['outside', 'inside'] : undefined}
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
              onChange={(event) => {
                const toolId = event.target.value;
                const nextTool = tools.find((tool) => tool.id === toolId);
                if (!nextTool?.isLaser) {
                  onUpdateOperation(selectedOperation.id, { toolId });
                  return;
                }
                const nextPreset = resolveLaserMaterialPreset(
                  nextTool,
                  selectedOperation.materialId
                );
                const nextProcess =
                  selectedOperation.type === 'image-fill' ||
                  (selectedOperation.type === 'text' && canLaserFill)
                    ? 'etch'
                    : 'cut';
                onUpdateOperation(selectedOperation.id, {
                  toolId,
                  laserProcess: nextProcess,
                  laserPower:
                    nextProcess === 'etch'
                      ? nextPreset.etchPowerMin
                      : nextPreset.cutPowerMax,
                  laserSpeed:
                    nextProcess === 'etch'
                      ? nextPreset.etchSpeedMax
                      : nextPreset.cutSpeedMin,
                  laserPasses: selectedOperation.laserPasses ?? 1,
                  laserLineInterval:
                    selectedOperation.laserLineInterval ??
                    Math.max(0.05, nextPreset.kerfDiameter),
                  laserOverscan: selectedOperation.laserOverscan ?? 2,
                  ...(selectedOperation.type === 'image-fill'
                    ? {
                        laserPowerMin: nextPreset.etchPowerMin,
                        laserPowerMax: nextPreset.etchPowerMax,
                      }
                    : {}),
                  millingStrategy: 'standard',
                  cutSide: 'along',
                  pocketEnabled: false,
                  tabsEnabled: false,
                });
              }}
            >
              {tools
                .filter(
                  (tool) =>
                    selectedOperation.type !== 'image-fill' || tool.isLaser
                )
                .map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.isLaser
                    ? `${tool.name} (laser, ${resolveLaserMaterialPreset(
                        tool,
                        selectedOperation.materialId
                      ).kerfDiameter}mm kerf)`
                    : `${tool.name} (${getMillingToolTypeLabel(
                        tool.millingGeometry.type
                      )}, Ø${tool.diameter}mm)`}
                </option>
              ))}
            </select>
          </label>

          {selectedPathOperation &&
          !isLaserOperation &&
          (selectedToolIsVBit || selectedToolIsChamfer || isSpecialMillingStrategy) ? (
            <>
              <div className="subsection-title">Milling strategy</div>
              <label className="field-row">
                <span>Strategy</span>
                <select
                  aria-label="Milling strategy"
                  value={millingStrategy}
                  onChange={(event) => {
                    const nextStrategy = event.target.value;
                    if (nextStrategy === 'standard' || !selectedOperationTool) {
                      onUpdateOperation(selectedOperation.id, {
                        millingStrategy: 'standard',
                      });
                      return;
                    }

                    const targetWidth =
                      nextStrategy === 'chamfer-edge'
                        ? getDefaultChamferWidth(
                            selectedPathOperation,
                            selectedOperationTool,
                            -1
                          )
                        : getDefaultVGrooveWidth(
                            selectedPathOperation,
                            selectedOperationTool,
                            -1
                          );
                    const updates: Partial<Operation> = {
                      millingStrategy:
                        nextStrategy === 'chamfer-edge' ? 'chamfer-edge' : 'v-groove',
                      millingTargetWidth: Number(targetWidth.toFixed(3)),
                    };
                    if ('cutSide' in selectedPathOperation) {
                      Object.assign(updates, {
                        cutSide:
                          nextStrategy === 'chamfer-edge'
                            ? selectedPathOperation.cutSide === 'inside'
                              ? 'inside'
                              : 'outside'
                            : 'along',
                        pocketEnabled: false,
                        tabsEnabled: false,
                      });
                    }
                    onUpdateOperation(selectedOperation.id, updates);
                  }}
                >
                  <option value="standard">Standard depth</option>
                  <option value="v-groove" disabled={!selectedToolIsVBit}>
                    Fixed-width V-groove
                  </option>
                  <option
                    value="chamfer-edge"
                    disabled={!selectedToolIsChamfer || !selectedPathSupportsChamfer}
                  >
                    Chamfer edge
                  </option>
                </select>
              </label>
              {isVGroove ? (
                <>
                  <NumericFieldRow
                    label="Groove width"
                    value={selectedPathOperation.millingTargetWidth ?? 0}
                    min={
                      selectedOperationTool?.millingGeometry.type === 'v-bit'
                        ? selectedOperationTool.millingGeometry.tipDiameter + 0.01
                        : 0.01
                    }
                    max={selectedOperationTool?.diameter}
                    step={0.1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        millingTargetWidth: Math.max(0.01, value || 0.01),
                      })
                    }
                  />
                  {vGroovePlan?.valid ? (
                    <>
                      <label className="field-row">
                        <span>Planned depth</span>
                        <input
                          aria-label="Planned V-groove depth"
                          type="text"
                          readOnly
                          value={Number(Math.abs(vGroovePlan.finalDepth).toFixed(3))}
                        />
                      </label>
                      <label className="field-row">
                        <span>Result width</span>
                        <input
                          aria-label="Planned V-groove width"
                          type="text"
                          readOnly
                          value={Number(vGroovePlan.actualWidth.toFixed(3))}
                        />
                      </label>
                    </>
                  ) : null}
                  {vGroovePlan?.issue ? (
                    <p className="tool-geometry-warning" role="alert">
                      {vGroovePlan.issue}
                    </p>
                  ) : null}
                  <InfoDisclosure label="About fixed-width V-grooves">
                    The requested surface width determines cutting depth from the V-bit tip
                    diameter and included angle. Maximum depth acts as a safety cap. This first
                    strategy follows the selected path at one groove width; area-clearing
                    V-carving will be a separate strategy.
                  </InfoDisclosure>
                </>
              ) : null}
              {isChamferEdge ? (
                <>
                  <NumericFieldRow
                    label="Chamfer width"
                    value={selectedPathOperation.millingTargetWidth ?? 0}
                    min={0.01}
                    max={selectedOperationTool?.diameter}
                    step={0.1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        millingTargetWidth: Math.max(0.01, value || 0.01),
                      })
                    }
                  />
                  {chamferEdgePlan?.valid ? (
                    <>
                      <label className="field-row">
                        <span>Planned depth</span>
                        <input
                          aria-label="Planned chamfer depth"
                          type="text"
                          readOnly
                          value={Number(Math.abs(chamferEdgePlan.finalDepth).toFixed(3))}
                        />
                      </label>
                      <label className="field-row">
                        <span>Result width</span>
                        <input
                          aria-label="Planned chamfer width"
                          type="text"
                          readOnly
                          value={Number(chamferEdgePlan.actualWidth.toFixed(3))}
                        />
                      </label>
                    </>
                  ) : null}
                  {chamferEdgePlan?.issue ? (
                    <p className="tool-geometry-warning" role="alert">
                      {chamferEdgePlan.issue}
                    </p>
                  ) : null}
                  <InfoDisclosure label="About chamfer edges">
                    Chamfer width determines vertical depth from the cutter&apos;s included angle.
                    The tool centerline is offset inside or outside by the tip radius so the lower
                    tip edge follows the selected boundary. Maximum depth remains a safety cap.
                  </InfoDisclosure>
                </>
              ) : null}
            </>
          ) : null}

          {selectedOperationTool && !isLaserOperation ? (
            <>
              <InfoDisclosure label="About milling tool geometry">
                <p>{formatMillingToolGeometrySummary(selectedOperationTool)}</p>
                <p>
                  Geometry-aware V-carve, chamfer, and ball-nose strategies are being introduced
                  incrementally. Current standard profile and pocket operations retain their
                  existing centerline behavior.
                </p>
              </InfoDisclosure>
              {exceedsMillingToolDepth ? (
                <p className="tool-geometry-warning" role="alert">
                  Target depth {selectedTargetDepth} mm exceeds this cutter&apos;s{' '}
                  {Number(millingToolMaxDepth.toFixed(3))} mm usable depth.
                </p>
              ) : null}
            </>
          ) : null}

          {isLaserOperation && supportsLaserOutput ? (
            <>
              <div className="subsection-title">Laser process</div>
              {!isImageFill ? (
              <label className="field-row">
                <span>Process</span>
                <select
                  aria-label="Laser process"
                  value={laserProcess}
                  onChange={(event) => {
                    const nextProcess = event.target.value === 'etch' ? 'etch' : 'cut';
                    onUpdateOperation(selectedOperation.id, {
                      laserProcess: nextProcess,
                      laserPower:
                        nextProcess === 'etch'
                          ? selectedLaserPreset.etchPowerMin
                          : selectedLaserPreset.cutPowerMax,
                      laserSpeed:
                        nextProcess === 'etch'
                          ? selectedLaserPreset.etchSpeedMax
                          : selectedLaserPreset.cutSpeedMin,
                      cutSide: 'along',
                      pocketEnabled: false,
                    });
                  }}
                >
                  <option value="cut">Cut — along path</option>
                  <option value="etch" disabled={!canLaserFill}>
                    Fill / etch
                  </option>
                </select>
              </label>
              ) : null}
              {isImageFill ? (
                <>
                  <NumericFieldRow
                    label="Minimum power"
                    value={imagePowerMin}
                    min={0}
                    max={imagePowerMax}
                    step={1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        laserPowerMin: Math.min(
                          imagePowerMax,
                          Math.max(0, value)
                        ),
                      })
                    }
                  />
                  <NumericFieldRow
                    label="Maximum power"
                    value={imagePowerMax}
                    min={imagePowerMin}
                    max={100}
                    step={1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        laserPowerMax: Math.min(
                          100,
                          Math.max(imagePowerMin, value)
                        ),
                      })
                    }
                  />
                </>
              ) : (
              <NumericFieldRow
                label="Laser power"
                value={laserPower}
                min={laserPowerMin}
                max={laserPowerMax}
                step={1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    laserPower: Math.min(laserPowerMax, Math.max(laserPowerMin, value)),
                  })
                }
              />
              )}
              <NumericFieldRow
                label="Laser speed"
                value={laserSpeed}
                min={laserSpeedMin}
                max={laserSpeedMax}
                step={1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    laserSpeed: Math.min(laserSpeedMax, Math.max(laserSpeedMin, value)),
                  })
                }
              />
              <NumericFieldRow
                label="Laser passes"
                value={selectedOperation.laserPasses ?? 1}
                min={1}
                step={1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    laserPasses: Math.max(1, Math.round(value || 1)),
                  })
                }
              />
              {laserProcess === 'etch' ? (
                <>
                  <NumericFieldRow
                    label="Line interval"
                    value={
                      selectedOperation.laserLineInterval ??
                      Math.max(0.05, selectedLaserPreset.kerfDiameter)
                    }
                    min={0.01}
                    step={0.01}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        laserLineInterval: Math.max(0.01, value || 0.01),
                      })
                    }
                  />
                  <NumericFieldRow
                    label="Overscan"
                    value={selectedOperation.laserOverscan ?? 2}
                    min={0}
                    step={0.1}
                    onChange={(value) =>
                      onUpdateOperation(selectedOperation.id, {
                        laserOverscan: Math.max(0, value),
                      })
                    }
                  />
                </>
              ) : null}
              <InfoDisclosure label="About laser output">
                <p>
                  {selectedOperationTool?.laserInlineMode === 'dynamic' ? 'M4 I dynamic' : 'M3 I continuous'}
                  {' '}mode · power {isImageFill ? imagePowerMin : laserPowerMin}–{isImageFill ? imagePowerMax : laserPowerMax}% maps to S0–S255
                  {' '}· material speed {laserSpeedMin}–{laserSpeedMax} mm/min
                  {' '}· approximate preview depth {selectedLaserPreset.depthPerPassAtFullPower} mm at 100% per pass
                </p>
                <p>
                  Laser paths leave Z at the current focus position. Use start G-code to establish
                  a focus height when the job begins with a laser tool.
                </p>
              </InfoDisclosure>
            </>
          ) : null}
          {isLaserOperation && !supportsLaserOutput ? (
            <p className="hint-text">
              First-pass laser output supports line, rectangle, circle, sketch, and text paths.
              This operation will be skipped during G-code export.
            </p>
          ) : null}

          {selectedOperation.type === 'image-fill' ? (
            <>
              <div className="subsection-title">Image placement</div>
              <label className="field-row">
                <span>Source</span>
                <input
                  type="text"
                  readOnly
                  value={`${selectedOperation.sourceName} (${selectedOperation.pixelWidth} × ${selectedOperation.pixelHeight}px)`}
                />
              </label>
              <NumericFieldRow
                label="X"
                value={selectedOperation.x}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, { x: value })
                }
              />
              <NumericFieldRow
                label="Y"
                value={selectedOperation.y}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, { y: value })
                }
              />
              <NumericFieldRow
                label="Width"
                value={selectedOperation.width}
                min={0.1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    width: Math.max(0.1, value || 0.1),
                  })
                }
              />
              <NumericFieldRow
                label="Height"
                value={selectedOperation.height}
                min={0.1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    height: Math.max(0.1, value || 0.1),
                  })
                }
              />
              <NumericFieldRow
                label="Rotation"
                value={
                  ((Number(selectedOperation.rotation) || 0) * 180) / Math.PI
                }
                step={1}
                onChange={(value) =>
                  onUpdateOperation(selectedOperation.id, {
                    rotation: (value * Math.PI) / 180,
                  })
                }
              />
              <button
                type="button"
                onClick={() => {
                  const aspect =
                    selectedOperation.pixelWidth /
                    Math.max(1, selectedOperation.pixelHeight);
                  onUpdateOperation(selectedOperation.id, {
                    height: selectedOperation.width / aspect,
                  });
                }}
              >
                Restore image aspect ratio
              </button>
              <InfoDisclosure label="About image engraving">
                Black pixels use maximum power, white pixels use minimum
                power, and intermediate grayscale values are mapped between
                them. Drag the image in the canvas or edit its placement and
                size here.
              </InfoDisclosure>
            </>
          ) : null}

          {selectedOperation.type === 'drill' ? (
            <>
              <NumericFieldRow label="X" value={selectedOperation.x} onChange={(value) => onUpdateOperation(selectedOperation.id, { x: value })} />
              <NumericFieldRow label="Y" value={selectedOperation.y} onChange={(value) => onUpdateOperation(selectedOperation.id, { y: value })} />
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
                label="Rotation"
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
              {!isLaserOperation &&
              millingStrategy === 'standard' &&
              selectedOperation.cutSide === 'outside' ? (
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
                    <span>Open gap</span>
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
                  {!isLaserOperation &&
                  millingStrategy === 'standard' &&
                  !shouldHideTabsForPocket ? (
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
                        <InfoDisclosure label="About sketch editing">
                          Drag sketch handles in the canvas. Click a segment in the canvas to select it for
                          deletion, or use the `Poly-Line` / `Poly-Arc` toolbar tool to place new replacement
                          segments by choosing their own start and end points.
                        </InfoDisclosure>
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
              {!isLaserOperation &&
              millingStrategy === 'standard' &&
              !shouldHideTabsForPocket ? (
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
              {!isLaserOperation &&
              millingStrategy === 'standard' &&
              !shouldHideTabsForPocket ? (
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
          <NumericFieldRow label="Offset X" value={repeatOffsetX} onChange={(value) => setRepeatOffsetX(value || 0)} />
          <NumericFieldRow label="Offset Y" value={repeatOffsetY} onChange={(value) => setRepeatOffsetY(value || 0)} />
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
              <InfoDisclosure label="About multi-selection">
                Multi-selection active. Drag selected geometry in the canvas to move as a group, or use the
                actions below.
              </InfoDisclosure>
              {allSelectedAreCircles ? (
                <>
                  <h3>Bulk edit circles</h3>
                  <NumericFieldRow
                    label="Radius"
                    value={bulkCircleRadiusValue}
                    min={0}
                    onChange={(value) => applyToSelectedCircles({ radius: Math.max(0, value || 0) })}
                  />
                  <NumericFieldRow
                    label="Pocket step-over"
                    value={bulkCircleStepOverValue}
                    min={0.1}
                    onChange={(value) => applyToSelectedCircles({ pocketStepOver: Math.max(0.1, value || 0.1) })}
                  />
                </>
              ) : null}
              <h3>Linear repeat</h3>
              <NumericFieldRow label="Copies" value={repeatCount} min={1} step={1} onChange={(value) => setRepeatCount(Math.max(1, Math.round(value || 1)))} />
              <NumericFieldRow label="Offset X" value={repeatOffsetX} onChange={(value) => setRepeatOffsetX(value || 0)} />
              <NumericFieldRow label="Offset Y" value={repeatOffsetY} onChange={(value) => setRepeatOffsetY(value || 0)} />
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
                <InfoDisclosure label="About imported meshes">
                  No cut operations yet. Imported meshes can be positioned here before generating STL-derived toolpaths.
                </InfoDisclosure>
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
