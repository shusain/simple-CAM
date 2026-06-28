import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  Eye,
  MousePointer2,
  PenLine,
  Plus,
  Minus,
  RectangleHorizontal,
  Ruler,
  ScanSearch,
  Save,
  Target,
  Type,
  Workflow,
  XCircle,
} from 'lucide-react';
import CamCanvas from './components/CamCanvas';
import ControlPanel from './components/ControlPanel';
import OctoprintSettingsModal from './components/OctoprintSettingsModal';
import OperationsPanel from './components/OperationsPanel';
import ToolpathPreview3D from './components/ToolpathPreview3D';
import { generateMarlinGcode } from './utils/gcode';
import { deriveSketchState, getOperationBounds, getSketchSegments } from './utils/geometry';
import { getDefaultPocketStepOver } from './utils/pocketing';
import { resolveMaterialId } from './utils/tooling';
import { importSvgToSketchOperations } from './utils/importSvg';
import type {
  ImportedMesh,
  MachineSettings,
  Material,
  OctoprintSettings,
  Operation,
  PastePreview,
  SketchOperation,
  ToolMaterialProfile,
  Tool,
  ZoomRequest,
  SketchEditState,
  Point,
  OperationInput,
  SurfaceFinishOperation,
  SurfaceRoughOperation,
  TransformSession,
} from './types';
import { isSurfaceOperation } from './types';
import type { ElectronBridge } from './types/electron';
import {
  DEFAULT_OCTOPRINT_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_TOOLS,
  TOOLS,
  type ActiveTool,
} from './app/defaults';
import {
  buildGcodeFileName,
  computeBounds,
  fileNameFromPath,
  getInitialState,
  isEditableElement,
  loadBrowserOctoprintSettings,
  newId,
  normalizeOctoprintSettings,
  offsetOperation,
  operationsChanged,
  saveBrowserOctoprintSettings,
  savePreferences,
} from './app/helpers';
import { useOperationHistory } from './app/useOperationHistory';
import { buildProjectFile, hydrateProjectFile } from './app/project';
import {
  beginTransformSession,
  buildTransformPreview,
  formatTransformStatus,
  isTransformInputKey,
  normalizeTransformAxis,
} from './app/transforms';
import { buildToolpathPreview } from './utils/toolpathPreview';
import { buildToolpathPreview3D } from './utils/toolpathPreview3d';
import { importDxfToSketchOperations } from './utils/importDxf';
import { importDrlToDrillOperations } from './utils/importDrl';
import type { ImportCutMode } from './utils/importCommon';
import { importStlModel, offsetImportedMesh } from './utils/importStl';
import type {
  InitialState,
  MoveSelectedOperationsArgs,
  OperationUpdates,
  RepeatArgs,
  SelectOptions,
} from './app/types';
import './App.css';

interface VisibleTool {
  id: ActiveTool;
  label: string;
}

interface ToolbarButtonMeta {
  icon: React.JSX.Element;
  title?: string;
}

interface PendingImport {
  kind: 'svg' | 'dxf';
  filePath?: string;
  contents: string;
}

type ViewportMode = '2d' | '3d';

interface BrowserImportFile {
  filePath: string;
  contents: string;
}

function isCanvasSurfaceFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  return active instanceof HTMLElement && Boolean(active.closest('.cam-canvas-wrapper'));
}

function openBrowserImportFile(accept: string): Promise<BrowserImportFile | null> {
  if (typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    const cleanup = () => {
      input.value = '';
      input.remove();
    };

    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          resolve(null);
          return;
        }

        try {
          const contents = await file.text();
          cleanup();
          resolve({
            filePath: file.name,
            contents,
          });
        } catch (error) {
          cleanup();
          reject(error instanceof Error ? error : new Error('Unable to read selected file'));
        }
      },
      { once: true }
    );

    document.body.appendChild(input);
    input.click();
  });
}

function getToolButtonMeta(toolId: ActiveTool, hotkey: number): ToolbarButtonMeta {
  const title = `${toolId === 'sketch' ? 'Poly-Line' : toolId === 'arc' ? 'Poly-Arc' : TOOLS.find((tool) => tool.id === toolId)?.label || toolId} (Ctrl+${hotkey})`;

  switch (toolId) {
    case 'select':
      return { icon: <MousePointer2 aria-hidden="true" size={16} />, title };
    case 'drill':
      return { icon: <Target aria-hidden="true" size={16} />, title };
    case 'line':
      return { icon: <Ruler aria-hidden="true" size={16} />, title };
    case 'text':
      return { icon: <Type aria-hidden="true" size={16} />, title };
    case 'sketch':
      return { icon: <PenLine aria-hidden="true" size={16} />, title };
    case 'arc':
      return { icon: <Workflow aria-hidden="true" size={16} />, title };
    case 'rect':
      return { icon: <RectangleHorizontal aria-hidden="true" size={16} />, title };
    case 'circle':
      return { icon: <Circle aria-hidden="true" size={16} />, title };
  }
}

export default function App(): React.JSX.Element {
  const electron: ElectronBridge | null = typeof window !== 'undefined' ? window.electron || null : null;
  const initialState = useMemo<InitialState>(() => getInitialState(), []);

  const [settings, setSettings] = useState<MachineSettings>(initialState.settings);
  const [materials, setMaterials] = useState<Material[]>(initialState.materials);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<PastePreview | null>(null);
  const [pastePreview, setPastePreview] = useState<PastePreview | null>(null);
  const [projectName, setProjectName] = useState('project.cam.json');
  const [status, setStatus] = useState('Ready');
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest>({ token: 0, action: 'reset' });
  const [tools, setTools] = useState<Tool[]>(initialState.tools);
  const [activeToolId, setActiveToolId] = useState<string>(initialState.activeToolId);
  const [octoprintSettings, setOctoprintSettings] = useState<OctoprintSettings>(DEFAULT_OCTOPRINT_SETTINGS);
  const [isOctoprintModalOpen, setIsOctoprintModalOpen] = useState(false);
  const [sketchEdit, setSketchEdit] = useState<SketchEditState>({
    operationId: null,
    selectedSegmentIndex: null,
    isNewSketch: false,
  });
  const [showToolpathPreview, setShowToolpathPreview] = useState(true);
  const [transformSession, setTransformSession] = useState<TransformSession | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('2d');
  const [importedMeshes, setImportedMeshes] = useState<ImportedMesh[]>(initialState.importedMeshes);
  const [selectedImportedMeshId, setSelectedImportedMeshId] = useState<string | null>(null);
  const canvasPointerRef = useRef<Point | null>(null);
  const {
    operationsHistory,
    operations,
    commitOperations,
    previewOperations,
    resetOperations: setOperationsDirect,
    commitPreviewedOperations,
    setOperationsHistory,
  } = useOperationHistory();

  const selectedOperations = useMemo(
    () => operations.filter((op) => selectedIds.includes(op.id)),
    [operations, selectedIds]
  );
  const activeMaterialId =
    resolveMaterialId(
      materials,
      settings.activeMaterialId,
      DEFAULT_SETTINGS.activeMaterialId
    ) || DEFAULT_SETTINGS.activeMaterialId;
  const activeMaterial = materials.find((material) => material.id === activeMaterialId) || materials[0] || null;
  const selectedImportedMesh = useMemo(
    () => importedMeshes.find((mesh) => mesh.id === selectedImportedMeshId) || null,
    [importedMeshes, selectedImportedMeshId]
  );
  const selectedOperation = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    return operations.find((op) => op.id === selectedIds[0]) || null;
  }, [operations, selectedIds]);
  const editingSketchOperation = useMemo(
    () =>
      sketchEdit.operationId
        ? operations.find(
            (operation): operation is SketchOperation =>
              operation.id === sketchEdit.operationId && operation.type === 'sketch'
          ) || null
        : null,
    [operations, sketchEdit.operationId]
  );
  const toolpathPreview = useMemo(
    () => buildToolpathPreview({ operations, settings, tools, importedMeshes }),
    [importedMeshes, operations, settings, tools]
  );
  const toolpathPreview3D = useMemo(
    () => buildToolpathPreview3D({ operations, settings, tools, importedMeshes }),
    [importedMeshes, operations, settings, tools]
  );
  const transformPreviewOperations = useMemo(
    () => (transformSession ? buildTransformPreview(transformSession, settings.circleSegments) : []),
    [settings.circleSegments, transformSession]
  );
  const transformHint = useMemo(
    () => (transformSession ? formatTransformStatus(transformSession) : null),
    [transformSession]
  );
  const isEditingSelectedSketch =
    selectedOperation?.type === 'sketch' && sketchEdit.operationId === selectedOperation.id;
  const canCancelSketchCreation = Boolean(editingSketchOperation && sketchEdit.isNewSketch);
  const canCancelSketchWithEscape = Boolean(
    editingSketchOperation &&
      sketchEdit.isNewSketch &&
      getSketchSegments(editingSketchOperation).length === 0
  );
  const visibleTools = useMemo<VisibleTool[]>(() => {
    if (isEditingSelectedSketch) {
      return TOOLS
        .filter((tool) => ['select', 'sketch', 'arc'].includes(tool.id))
        .map((tool) => ({
          id: tool.id,
          label: tool.id === 'sketch' ? 'Poly-Line' : tool.id === 'arc' ? 'Poly-Arc' : tool.label,
        }));
    }

    return TOOLS
      .filter((tool) => tool.id !== 'arc')
      .map((tool) => ({
        id: tool.id,
        label: tool.id === 'sketch' ? 'New Sketch' : tool.label,
      }));
  }, [isEditingSelectedSketch]);

  const hasOctoprintSettings =
    Boolean(octoprintSettings.baseUrl && octoprintSettings.baseUrl.trim()) &&
    Boolean(octoprintSettings.apiKey && octoprintSettings.apiKey.trim());

  const completeImportedOperations = useCallback(
    (
      importKind: 'svg' | 'dxf',
      filePath: string | undefined,
      imported: { operations: SketchOperation[]; warnings: string[] }
    ) => {
      if (imported.operations.length === 0) {
        setStatus(imported.warnings[0] || `${importKind.toUpperCase()} import failed: no usable geometry found`);
        return;
      }

      commitOperations((previous) => [...previous, ...imported.operations]);
      setSelectedIds(imported.operations.map((operation) => operation.id));
      setActiveTool('select');
      const filename = fileNameFromPath(filePath) || importKind.toUpperCase();
      const warningText =
        imported.warnings.length > 0 ? ` (${imported.warnings.length} warning(s))` : '';
      setStatus(`Imported ${imported.operations.length} sketch path(s) from ${filename}${warningText}`);
    },
    [commitOperations]
  );

  const completeImportedDrills = useCallback(
    (
      filePath: string | undefined,
      imported: { operations: Operation[]; warnings: string[] }
    ) => {
      if (imported.operations.length === 0) {
        setStatus(imported.warnings[0] || 'DRL import failed: no drill hits were found');
        return;
      }

      commitOperations((previous) => [...previous, ...imported.operations]);
      setSelectedIds(imported.operations.map((operation) => operation.id));
      setSelectedImportedMeshId(null);
      setActiveTool('select');
      const filename = fileNameFromPath(filePath) || 'DRL';
      const warningText =
        imported.warnings.length > 0 ? ` (${imported.warnings.length} warning(s))` : '';
      setStatus(`Imported ${imported.operations.length} drill hit(s) from ${filename}${warningText}`);
    },
    [commitOperations]
  );

  const requestZoom = useCallback((action: ZoomRequest['action']) => {
    setZoomRequest((prev) => ({ token: prev.token + 1, action }));
  }, []);

  const handleSelectOperation = useCallback((id: string | null, options: SelectOptions = {}) => {
    const additive = Boolean(options.additive);
    const toggle = Boolean(options.toggle);
    const range = Boolean(options.range);

    if (!id) {
      if (!additive) {
        setSelectedIds([]);
        setSelectedImportedMeshId(null);
        setSelectionAnchorId(null);
      }
      return;
    }

    setSelectedIds((prev) => {
      if (range) {
        const anchorId =
          selectionAnchorId && operations.some((operation) => operation.id === selectionAnchorId)
            ? selectionAnchorId
            : prev[prev.length - 1] || id;
        const anchorIndex = operations.findIndex((operation) => operation.id === anchorId);
        const targetIndex = operations.findIndex((operation) => operation.id === id);

        if (anchorIndex >= 0 && targetIndex >= 0) {
          const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          return operations.slice(start, end + 1).map((operation) => operation.id);
        }
      }

      const exists = prev.includes(id);
      if (toggle) {
        return exists ? prev.filter((item) => item !== id) : [...prev, id];
      }
      if (additive) {
        return exists ? prev : [...prev, id];
      }
      return [id];
    });
    setSelectionAnchorId(id);
    setSelectedImportedMeshId(null);
  }, [operations, selectionAnchorId]);

  const handleSetSelection = useCallback((ids: string[], options: { additive?: boolean } = {}) => {
    const additive = Boolean(options.additive);
    const unique = Array.from(new Set((ids || []).filter(Boolean)));

    setSelectedIds((prev) => {
      if (!additive) {
        return unique;
      }
      return Array.from(new Set([...prev, ...unique]));
    });
    setSelectionAnchorId(unique[unique.length - 1] || null);
    if (unique.length > 0 || !additive) {
      setSelectedImportedMeshId(null);
    }
  }, []);

  const handleSelectImportedMesh = useCallback((id: string | null) => {
    setSelectedImportedMeshId(id);
    setSelectionAnchorId(null);
    if (id) {
      setSelectedIds([]);
      setActiveTool('select');
    }
  }, []);

  const previewMoveImportedMesh = useCallback((id: string, sourceMesh: ImportedMesh, dx: number, dy: number) => {
    setImportedMeshes((previous) =>
      previous.map((mesh) => (mesh.id === id ? offsetImportedMesh(sourceMesh, dx, dy) : mesh))
    );
  }, []);

  const commitMoveImportedMesh = useCallback((id: string, sourceMesh: ImportedMesh, dx: number, dy: number) => {
    setImportedMeshes((previous) =>
      previous.map((mesh) => (mesh.id === id ? offsetImportedMesh(sourceMesh, dx, dy) : mesh))
    );
    setStatus(`Moved ${sourceMesh.name}`);
  }, []);

  const updateImportedMesh = useCallback((id: string, updates: Partial<ImportedMesh>) => {
    setImportedMeshes((previous) =>
      previous.map((mesh) => (mesh.id === id ? { ...mesh, ...updates } : mesh))
    );
  }, []);

  const deleteImportedMesh = useCallback((id: string) => {
    setImportedMeshes((previous) => previous.filter((mesh) => mesh.id !== id));
      commitOperations((previous) =>
        previous.filter((operation) => !isSurfaceOperation(operation) || operation.meshId !== id)
      );
      setSelectedImportedMeshId((previous) => (previous === id ? null : previous));
      setSelectionAnchorId(null);
      setSelectedIds((previous) =>
        previous.filter((operationId) => {
        const operation = operations.find((item) => item.id === operationId);
        return !operation || !isSurfaceOperation(operation) || operation.meshId !== id;
      })
    );
    setStatus('Deleted imported mesh');
  }, [commitOperations, operations]);

  const addOperation = useCallback(
    (operation: OperationInput) => {
      const selectedToolId = operation.toolId || activeToolId || tools[0]?.id || null;
      const selectedTool = tools.find((tool) => tool.id === selectedToolId) || tools[0] || null;
      const selectedMaterialId = resolveMaterialId(
        materials,
        operation.materialId,
        activeMaterialId
      );
      const id = newId();
      const providedPocketStepOver =
        'pocketStepOver' in operation ? Number(operation.pocketStepOver) : Number.NaN;
      const nextOperation = {
        ...operation,
        toolId: selectedToolId || undefined,
        materialId: selectedMaterialId || undefined,
        ...('pocketEnabled' in operation
          ? {
              pocketEnabled: Boolean(operation.pocketEnabled),
              pocketStepOver:
                Number.isFinite(providedPocketStepOver) && providedPocketStepOver > 0
                  ? providedPocketStepOver
                  : getDefaultPocketStepOver(selectedTool?.diameter),
            }
          : {}),
        id,
      } as Operation;
      commitOperations((prev) => [...prev, nextOperation]);
      setSelectedIds([id]);
      setSelectionAnchorId(id);
      return id;
    },
    [activeMaterialId, activeToolId, commitOperations, materials, tools]
  );

  const addSurfaceOperation = useCallback(
    (meshId: string, mode: 'rough' | 'finish') => {
      const importedMesh = importedMeshes.find((mesh) => mesh.id === meshId);
      if (!importedMesh) {
        setStatus('Imported mesh no longer exists');
        return;
      }

      const selectedTool =
        tools.find((tool) => tool.id === activeToolId) || tools[0] || null;
      const defaultStepOver = getDefaultPocketStepOver(selectedTool?.diameter);
      const depth = Number(importedMesh.localBounds.minZ) || -1;

      if (mode === 'rough') {
        addOperation({
          type: 'surface-rough',
          meshId,
          depth,
          stepOver: defaultStepOver,
          stockToLeave: 0.25,
        } satisfies Omit<SurfaceRoughOperation, 'id'>);
        setStatus(`Created surface roughing operation for ${importedMesh.name}`);
        return;
      }

      addOperation({
        type: 'surface-finish',
        meshId,
        depth,
        stepOver: Math.max(0.1, defaultStepOver / 2),
        pattern: 'crosshatch',
      } satisfies Omit<SurfaceFinishOperation, 'id'>);
      setStatus(`Created surface finishing operation for ${importedMesh.name}`);
    },
    [activeToolId, addOperation, importedMeshes, tools]
  );

  const updateOperation = useCallback(
    (id: string, updates: OperationUpdates) => {
      commitOperations((prev) => prev.map((op) => (op.id === id ? ({ ...op, ...updates } as Operation) : op)));
    },
    [commitOperations]
  );

  const convertDrillToCircle = useCallback(
    (id: string) => {
      const drill = operations.find((operation) => operation.id === id && operation.type === 'drill');
      if (!drill || drill.type !== 'drill') {
        setStatus('Selected drill no longer exists');
        return;
      }

      const tool =
        tools.find((item) => item.id === drill.toolId) ||
        tools.find((item) => item.id === activeToolId) ||
        tools[0] ||
        null;
      const defaultRadius = Math.max(0.5, (Number(tool?.diameter) || 1) / 2);
      const nextId = newId();

      commitOperations((previous) =>
        previous.map((operation) =>
          operation.id === id
            ? ({
                id: nextId,
                type: 'circle',
                x: drill.x,
                y: drill.y,
                radius: defaultRadius,
                depth: drill.depth,
                cutSide: 'inside',
                tabsEnabled: false,
                tabCount: 2,
                tabWidth: 1,
                tabHeight: 1,
                pocketEnabled: true,
                pocketStepOver: 0,
                toolId: drill.toolId,
                materialId: drill.materialId,
              } as Operation)
            : operation
        )
      );
      setSelectedIds([nextId]);
      setSelectionAnchorId(nextId);
      setSelectedImportedMeshId(null);
      setActiveTool('select');
      setStatus('Converted drill to inside-cut circle in place');
    },
    [activeToolId, commitOperations, operations, tools]
  );

  const startSketchEdit = useCallback(() => {
    if (!selectedOperation || selectedOperation.type !== 'sketch') {
      return;
    }

    setSketchEdit({
      operationId: selectedOperation.id,
      selectedSegmentIndex: null,
      isNewSketch: false,
    });
    setActiveTool('select');
  }, [selectedOperation]);

  const beginNewSketch = useCallback(() => {
    const operation: Omit<SketchOperation, 'id'> = {
      type: 'sketch',
      segments: [],
      closed: false,
      cutSide: 'along',
      tabsEnabled: false,
      tabCount: 2,
      tabWidth: 1,
      tabHeight: 1,
      pocketEnabled: false,
      pocketStepOver: 0,
      depth: settings.cutDepth,
    };
    const id = addOperation(operation);

    setSketchEdit({
      operationId: id,
      selectedSegmentIndex: null,
      isNewSketch: true,
    });
    setActiveTool('sketch');
  }, [addOperation, settings.cutDepth]);

  const handleToolButtonClick = useCallback(
    (toolId: ActiveTool) => {
      if (!isEditingSelectedSketch && toolId === 'sketch') {
        beginNewSketch();
        return;
      }

      setActiveTool(toolId);
    },
    [beginNewSketch, isEditingSelectedSketch]
  );

  const handleToolHotkey = useCallback(
    (key: string): boolean => {
      if (!/^[1-9]$/.test(key)) {
        return false;
      }

      const index = Number(key) - 1;
      const visibleTool = visibleTools[index];
      if (!visibleTool) {
        return false;
      }

      handleToolButtonClick(visibleTool.id);
      return true;
    },
    [handleToolButtonClick, visibleTools]
  );

  const updateCanvasPointer = useCallback((point: Point) => {
    canvasPointerRef.current = point;
    setTransformSession((previous) => (previous ? { ...previous, currentPoint: point } : previous));
  }, []);

  const beginSelectionTransform = useCallback(
    (mode: TransformSession['mode']) => {
      if (selectedOperations.length === 0) {
        return;
      }

      const session = beginTransformSession(mode, selectedOperations, selectedIds, canvasPointerRef.current);
      if (!session) {
        return;
      }

      setTransformSession(session);
      setStatus(formatTransformStatus(session));
    },
    [selectedIds, selectedOperations]
  );

  const cancelTransformPreview = useCallback(() => {
    setTransformSession(null);
    setStatus('Transform canceled');
  }, []);

  const commitTransformPreview = useCallback(() => {
    if (!transformSession || transformPreviewOperations.length === 0) {
      return;
    }

    const nextMap = new Map(transformPreviewOperations.map((operation) => [operation.id, operation]));
    const targetIds = new Set(transformSession.operationIds);

    commitOperations((previous) =>
      previous.map((operation) => (targetIds.has(operation.id) ? nextMap.get(operation.id) || operation : operation))
    );
    setTransformSession(null);
    setStatus(`${transformSession.mode} applied to ${transformSession.operationIds.length} operation(s)`);
  }, [commitOperations, transformPreviewOperations, transformSession]);

  const stopSketchEdit = useCallback(() => {
    const editingOperation = operations.find(
      (operation): operation is Extract<Operation, { type: 'sketch' }> =>
        operation.id === sketchEdit.operationId && operation.type === 'sketch'
    );

    if (editingOperation) {
      const nextState = deriveSketchState(editingOperation);
      updateOperation(editingOperation.id, nextState);
    }

    setSketchEdit({
      operationId: null,
      selectedSegmentIndex: null,
      isNewSketch: false,
    });
  }, [operations, sketchEdit.operationId, updateOperation]);

  const cancelSketchCreation = useCallback(() => {
    if (!editingSketchOperation || !sketchEdit.isNewSketch) {
      return;
    }

    commitOperations((previous) =>
      previous.filter((operation) => operation.id !== editingSketchOperation.id)
    );
    setSelectedIds((previous) => previous.filter((id) => id !== editingSketchOperation.id));
    setSketchEdit({
      operationId: null,
      selectedSegmentIndex: null,
      isNewSketch: false,
    });
    setActiveTool('select');
    setStatus('Canceled sketch creation');
  }, [commitOperations, editingSketchOperation, sketchEdit.isNewSketch]);

  const selectSketchSegment = useCallback((segmentIndex: number | null) => {
    setSketchEdit((prev) => ({
      ...prev,
      selectedSegmentIndex: Number.isInteger(segmentIndex) ? segmentIndex : null,
    }));
  }, []);

  const deleteSelectedSketchSegment = useCallback(() => {
    if (!selectedOperation || selectedOperation.type !== 'sketch') {
      return;
    }

    const segmentIndex = sketchEdit.selectedSegmentIndex;
    if (segmentIndex === null || !Number.isInteger(segmentIndex)) {
      return;
    }

    const segments = Array.isArray(selectedOperation.segments) ? selectedOperation.segments : [];
    const nextSegments = segments.filter((_, index) => index !== segmentIndex);

    updateOperation(selectedOperation.id, deriveSketchState(selectedOperation, nextSegments));
    setSketchEdit((prev) => ({
      ...prev,
      selectedSegmentIndex: nextSegments.length === 0 ? null : Math.min(segmentIndex, nextSegments.length - 1),
    }));
  }, [selectedOperation, sketchEdit.selectedSegmentIndex, updateOperation]);

  const applyDepthSettingsToAll = useCallback(() => {
    if (operations.length === 0) {
      return;
    }

    commitOperations((prev) =>
      prev.map((operation) => ({
        ...operation,
        depth: operation.type === 'drill' ? settings.drillDepth : settings.cutDepth,
      }))
    );
    setStatus(`Applied current depth settings to ${operations.length} operation(s)`);
  }, [commitOperations, operations.length, settings.cutDepth, settings.drillDepth]);

  const addMaterial = useCallback(() => {
    const id = newId();
    setMaterials((prev) => [...prev, { id, name: `Material ${prev.length + 1}` }]);
    setSettings((prev) => ({ ...prev, activeMaterialId: id }));
  }, []);

  const updateMaterial = useCallback((materialId: string, updates: Partial<Material>) => {
    setMaterials((prev) =>
      prev.map((material) => (material.id === materialId ? { ...material, ...updates } : material))
    );
  }, []);

  const deleteMaterial = useCallback(
    (materialId: string) => {
      if (materials.length <= 1) return;
      const fallback = materials.find((material) => material.id !== materialId);
      if (!fallback) return;

      setMaterials((prev) => prev.filter((material) => material.id !== materialId));
      setSettings((prev) => ({
        ...prev,
        activeMaterialId: prev.activeMaterialId === materialId ? fallback.id : prev.activeMaterialId,
      }));
      commitOperations((prev) =>
        prev.map((operation) =>
          operation.materialId === materialId ? { ...operation, materialId: fallback.id } : operation
        )
      );
    },
    [commitOperations, materials]
  );

  const updateToolMaterialProfile = useCallback(
    (toolId: string, materialId: string, updates: Partial<ToolMaterialProfile>) => {
      setTools((prev) =>
        prev.map((tool) => {
          if (tool.id !== toolId) {
            return tool;
          }

          const currentProfile = tool.materialProfiles?.[materialId] || {};
          return {
            ...tool,
            materialProfiles: {
              ...(tool.materialProfiles || {}),
              [materialId]: {
                ...currentProfile,
                ...updates,
              },
            },
          };
        })
      );
    },
    []
  );

  const applyMaterialToAll = useCallback(() => {
    if (operations.length === 0) {
      return;
    }

    commitOperations((prev) =>
      prev.map((operation) => ({
        ...operation,
        materialId: activeMaterialId,
      }))
    );
    setStatus(`Applied ${activeMaterial?.name || 'material'} to ${operations.length} operation(s)`);
  }, [activeMaterial?.name, activeMaterialId, commitOperations, operations.length]);

  const previewMoveSelectedOperations = useCallback(
    ({ ids, sourceOperations, dx, dy }: MoveSelectedOperationsArgs) => {
      const selected = Array.isArray(ids) ? ids : [];
      if (selected.length === 0) return;

      const sourceMap = new Map((sourceOperations || []).map((item) => [item.id, item]));
      const selectedSet = new Set(selected);

      previewOperations(
        (sourceOperations || []).map((operation) => {
          if (!selectedSet.has(operation.id)) {
            return operation;
          }
          const base = sourceMap.get(operation.id) || operation;
          return offsetOperation(base, dx, dy);
        })
      );
    },
    [previewOperations]
  );

  const commitMoveSelectedOperations = useCallback(
    ({ ids, sourceOperations, dx, dy }: MoveSelectedOperationsArgs) => {
      const selected = Array.isArray(ids) ? ids : [];
      if (selected.length === 0 || !Array.isArray(sourceOperations) || sourceOperations.length === 0) return;

      const sourceMap = new Map((sourceOperations || []).map((item) => [item.id, item]));
      const selectedSet = new Set(selected);
      const nextOperations = sourceOperations.map((operation) => {
        if (!selectedSet.has(operation.id)) {
          return operation;
        }
        const base = sourceMap.get(operation.id) || operation;
        return offsetOperation(base, dx, dy);
      });

      if (!operationsChanged(sourceOperations, nextOperations)) {
        previewOperations(sourceOperations);
        return;
      }

      commitPreviewedOperations(sourceOperations, nextOperations);
    },
    [commitPreviewedOperations, previewOperations]
  );

  const deleteOperation = useCallback(
    (id: string) => {
      commitOperations((prev) => prev.filter((op) => op.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      setSelectionAnchorId((previous) => (previous === id ? null : previous));
    },
    [commitOperations]
  );

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    commitOperations((prev) => prev.filter((op) => !selectedSet.has(op.id)));
    setSelectedIds([]);
    setSelectionAnchorId(null);
    setStatus(`Deleted ${selectedIds.length} operation(s)`);
  }, [commitOperations, selectedIds]);

  const moveOperation = useCallback(
    (id: string, direction: number) => {
      commitOperations((prev) => {
        const index = prev.findIndex((op) => op.id === id);
        if (index < 0) return prev;

        const target = index + direction;
        if (target < 0 || target >= prev.length) return prev;

        const next = [...prev];
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        return next;
      });
    },
    [commitOperations]
  );

  const moveOperationToEdge = useCallback(
    (id: string, edge: 'top' | 'bottom') => {
      commitOperations((prev) => {
        const index = prev.findIndex((op) => op.id === id);
        if (index < 0) return prev;

        const next = [...prev];
        const [item] = next.splice(index, 1);
        if (!item) return prev;
        if (edge === 'top') {
          next.unshift(item);
        } else {
          next.push(item);
        }
        return next;
      });
    },
    [commitOperations]
  );

  const addTool = useCallback(() => {
    const source = tools.find((tool) => tool.id === activeToolId) || tools[0] || DEFAULT_TOOLS[0];
    const id = newId();
    const next = {
      ...source,
      id,
      name: `${source.name} Copy`,
    };
    setTools((prev) => [...prev, next]);
    setActiveToolId(id);
  }, [activeToolId, tools]);

  const updateTool = useCallback((toolId: string, updates: Partial<Tool>) => {
    setTools((prev) => prev.map((tool) => (tool.id === toolId ? { ...tool, ...updates } : tool)));
  }, []);

  const deleteTool = useCallback(
    (toolId: string) => {
      if (tools.length <= 1) return;
      const fallback = tools.find((tool) => tool.id !== toolId);
      if (!fallback) return;

      setTools((prev) => prev.filter((tool) => tool.id !== toolId));
      setActiveToolId((prev) => (prev === toolId ? fallback.id : prev));
      commitOperations((prev) =>
        prev.map((operation) =>
          operation.toolId === toolId ? { ...operation, toolId: fallback.id } : operation
        )
      );
    },
    [commitOperations, tools]
  );

  const repeatSelected = useCallback(
    ({ count, offsetX, offsetY }: RepeatArgs) => {
      if (selectedOperations.length === 0 || !Number.isFinite(count) || count < 1) {
        return;
      }

      const repeats = Math.max(1, Math.floor(count));
      const dx = Number(offsetX) || 0;
      const dy = Number(offsetY) || 0;

      const clones: Operation[] = [];
      for (let i = 1; i <= repeats; i += 1) {
        selectedOperations.forEach((operation) => {
          clones.push({
            ...offsetOperation(operation, dx * i, dy * i),
            id: newId(),
          });
        });
      }

      commitOperations((prev) => [...prev, ...clones]);
      setSelectedIds(clones.map((item) => item.id));
      setStatus(`Repeated ${selectedOperations.length} operation(s) ${repeats}x`);
    },
    [commitOperations, selectedOperations]
  );

  const copySelection = useCallback(() => {
    if (selectedOperations.length === 0) {
      return;
    }

    const bounds = computeBounds(selectedOperations, getOperationBounds);
    const anchor = bounds ? { x: bounds.minX, y: bounds.minY } : { x: 0, y: 0 };

    const cloned = selectedOperations.map((operation) => ({ ...operation }));

    setClipboard({ operations: cloned, anchor });
    setStatus(`Copied ${cloned.length} operation(s)`);
  }, [selectedOperations]);

  const beginPastePlacement = useCallback(() => {
    if (!clipboard?.operations?.length) {
      return;
    }
    setActiveTool('select');
    setPastePreview(clipboard);
    setStatus('Paste mode: click in canvas to place copied operations');
  }, [clipboard]);

  const cancelPastePlacement = useCallback(() => {
    setPastePreview(null);
  }, []);

  const placePastedOperations = useCallback(
    (targetPoint: { x: number; y: number }) => {
      if (!pastePreview?.operations?.length) {
        return;
      }

      const dx = targetPoint.x - pastePreview.anchor.x;
      const dy = targetPoint.y - pastePreview.anchor.y;

      const pasted: Operation[] = pastePreview.operations.map((operation) => ({
        ...offsetOperation(operation, dx, dy),
        id: newId(),
        toolId: operation.toolId || activeToolId,
        materialId: resolveMaterialId(materials, operation.materialId, activeMaterialId) || undefined,
      }));

      commitOperations((prev) => [...prev, ...pasted]);
      setSelectedIds(pasted.map((item) => item.id));
      setPastePreview(null);
      setStatus(`Placed ${pasted.length} pasted operation(s)`);
    },
    [activeMaterialId, activeToolId, commitOperations, materials, pastePreview]
  );

  const undo = useCallback(() => {
    setOperationsHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previousPresent = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previousPresent,
        future: [prev.present, ...prev.future],
      };
    });
    setStatus('Undo');
  }, []);

  const redo = useCallback(() => {
    setOperationsHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const [nextPresent, ...remainingFuture] = prev.future;
      return {
        past: [...prev.past, prev.present],
        present: nextPresent,
        future: remainingFuture,
      };
    });
    setStatus('Redo');
  }, []);

  const handleNew = useCallback(() => {
    setOperationsDirect([]);
    setImportedMeshes([]);
    setSelectedIds([]);
    setSelectedImportedMeshId(null);
    setClipboard(null);
    setPastePreview(null);
    setProjectName('project.cam.json');
    setStatus('Started new project');
  }, [setOperationsDirect]);

  const handleOpen = useCallback(async () => {
    if (!electron?.openProject) {
      setStatus('Open is available in desktop mode only');
      return;
    }
    const result = await electron.openProject();
    if (!result || result.canceled) return;
    if (result.error) {
      setStatus(`Open failed: ${result.error}`);
      return;
    }

    const loaded = result.project;
    if (!loaded) {
      setStatus('Open failed: project file was empty');
      return;
    }

    const hydrated = hydrateProjectFile(loaded, newId);

    setSettings(hydrated.settings);
    setMaterials(hydrated.materials);
    setTools(hydrated.tools);
    setActiveToolId(hydrated.activeToolId);
    setOperationsDirect(hydrated.operations);
    setImportedMeshes(hydrated.importedMeshes);
    setSelectedIds([]);
    setSelectedImportedMeshId(null);
    setClipboard(null);
    setPastePreview(null);
    const filename = fileNameFromPath(result.filePath);
    if (filename) setProjectName(filename);
    setStatus(`Opened ${hydrated.operations.length} operation(s)`);
  }, [electron, setOperationsDirect]);

  const handleImportSvg = useCallback(async () => {
    if (!electron?.openSvgImport) {
      try {
        const result = await openBrowserImportFile('.svg,image/svg+xml');
        if (!result) return;
        if (!result.contents) {
          setStatus('SVG import failed: file contents were empty');
          return;
        }

        setPendingImport({
          kind: 'svg',
          filePath: result.filePath,
          contents: result.contents,
        });
      } catch (error) {
        setStatus(`SVG import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return;
    }

    const result = await electron.openSvgImport();
    if (!result || result.canceled) {
      return;
    }
    if (result.error) {
      setStatus(`SVG import failed: ${result.error}`);
      return;
    }
    if (!result.contents) {
      setStatus('SVG import failed: file contents were empty');
      return;
    }

    setPendingImport({
      kind: 'svg',
      filePath: result.filePath,
      contents: result.contents,
    });
  }, [electron]);

  const handleImportDxf = useCallback(async () => {
    if (!electron?.openDxfImport) {
      try {
        const result = await openBrowserImportFile('.dxf,application/dxf');
        if (!result) return;
        if (!result.contents) {
          setStatus('DXF import failed: file contents were empty');
          return;
        }

        setPendingImport({
          kind: 'dxf',
          filePath: result.filePath,
          contents: result.contents,
        });
      } catch (error) {
        setStatus(`DXF import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return;
    }

    const result = await electron.openDxfImport();
    if (!result || result.canceled) {
      return;
    }
    if (result.error) {
      setStatus(`DXF import failed: ${result.error}`);
      return;
    }
    if (!result.contents) {
      setStatus('DXF import failed: file contents were empty');
      return;
    }

    setPendingImport({
      kind: 'dxf',
      filePath: result.filePath,
      contents: result.contents,
    });
  }, [electron]);

  const handleImportStl = useCallback(async () => {
    if (!electron?.openStlImport) {
      try {
        const result = await openBrowserImportFile('.stl,model/stl');
        if (!result) return;
        if (!result.contents) {
          setStatus('STL import failed: file contents were empty');
          return;
        }

        const imported = importStlModel(result.contents, {
          createId: newId,
          filePath: result.filePath,
          workWidth: settings.workWidth,
          workHeight: settings.workHeight,
        });

        if (!imported.mesh) {
          setStatus(imported.warnings[0] || 'STL import failed');
          return;
        }

        setImportedMeshes((previous) => [...previous, imported.mesh as ImportedMesh]);
        setSelectedImportedMeshId(imported.mesh.id);
        setSelectedIds([]);
        setViewportMode('2d');
        setActiveTool('select');
        setStatus(
          `Imported STL ${imported.mesh.name} (${imported.mesh.triangleCount} triangle(s))${
            imported.warnings.length > 0 ? ` (${imported.warnings.length} warning(s))` : ''
          }`
        );
      } catch (error) {
        setStatus(`STL import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return;
    }

    const result = await electron.openStlImport();
    if (!result || result.canceled) {
      return;
    }
    if (result.error) {
      setStatus(`STL import failed: ${result.error}`);
      return;
    }
    if (!result.contents) {
      setStatus('STL import failed: file contents were empty');
      return;
    }

    const imported = importStlModel(result.contents, {
      createId: newId,
      filePath: result.filePath,
      workWidth: settings.workWidth,
      workHeight: settings.workHeight,
    });

    if (!imported.mesh) {
      setStatus(imported.warnings[0] || 'STL import failed');
      return;
    }

    setImportedMeshes((previous) => [...previous, imported.mesh as ImportedMesh]);
    setSelectedImportedMeshId(imported.mesh.id);
    setSelectedIds([]);
    setViewportMode('2d');
    setActiveTool('select');
    setStatus(
      `Imported STL ${imported.mesh.name} (${imported.mesh.triangleCount} triangle(s))${
        imported.warnings.length > 0 ? ` (${imported.warnings.length} warning(s))` : ''
      }`
    );
  }, [electron, settings.workHeight, settings.workWidth]);

  const handleImportDrl = useCallback(async () => {
    if (!electron?.openDrlImport) {
      try {
        const result = await openBrowserImportFile('.drl,.txt,text/plain');
        if (!result) return;
        if (!result.contents) {
          setStatus('DRL import failed: file contents were empty');
          return;
        }

        const imported = importDrlToDrillOperations(result.contents, {
          createId: newId,
          depth: settings.drillDepth,
          activeToolId,
          tools,
          materialId: activeMaterialId,
        });

        completeImportedDrills(result.filePath, imported);
      } catch (error) {
        setStatus(`DRL import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return;
    }

    const result = await electron.openDrlImport();
    if (!result || result.canceled) {
      return;
    }
    if (result.error) {
      setStatus(`DRL import failed: ${result.error}`);
      return;
    }
    if (!result.contents) {
      setStatus('DRL import failed: file contents were empty');
      return;
    }

    const imported = importDrlToDrillOperations(result.contents, {
      createId: newId,
      depth: settings.drillDepth,
      activeToolId,
      tools,
      materialId: activeMaterialId,
    });

    completeImportedDrills(result.filePath, imported);
  }, [activeMaterialId, activeToolId, completeImportedDrills, electron, settings.drillDepth, tools]);

  const runPendingImport = useCallback(
    (cutMode: ImportCutMode) => {
      if (!pendingImport) {
        return;
      }

      const commonOptions = {
        createId: newId,
        depth: settings.cutDepth,
        closedPathMode: cutMode,
        toolId: activeToolId,
        toolDiameter: tools.find((tool) => tool.id === activeToolId)?.diameter,
        materialId: activeMaterialId,
      };

      const imported =
        pendingImport.kind === 'svg'
          ? importSvgToSketchOperations(pendingImport.contents, {
              ...commonOptions,
              circleSegments: settings.circleSegments,
            })
          : importDxfToSketchOperations(pendingImport.contents, commonOptions);

      setPendingImport(null);
      completeImportedOperations(pendingImport.kind, pendingImport.filePath, imported);
    },
    [
      activeMaterialId,
      activeToolId,
      completeImportedOperations,
      pendingImport,
      settings.circleSegments,
      settings.cutDepth,
      tools,
    ]
  );

  const handleSave = useCallback(async () => {
    if (!electron?.saveProject) {
      setStatus('Save is available in desktop mode only');
      return;
    }

    const project = buildProjectFile({ settings, materials, tools, activeToolId, operations, importedMeshes });
    const result = await electron.saveProject({
      suggestedName: projectName,
      project,
    });

    if (!result || result.canceled) return;
    if (result.error) {
      setStatus(`Save failed: ${result.error}`);
      return;
    }

    const filename = fileNameFromPath(result.filePath);
    if (filename) setProjectName(filename);
    setStatus(`Saved ${filename || projectName}`);
  }, [activeToolId, electron, importedMeshes, materials, operations, projectName, settings, tools]);

  const handleExport = useCallback(async () => {
    const gcode = generateMarlinGcode({ operations, settings, tools, importedMeshes });

    if (electron?.exportGcode) {
      const result = await electron.exportGcode({ suggestedName: 'output.gcode', gcode });
      if (!result || result.canceled) return;
      if (result.error) {
        setStatus(`Export failed: ${result.error}`);
        return;
      }
      setStatus(`Exported G-code (${operations.length} operation(s))`);
      return;
    }

    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.gcode';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Exported G-code download');
  }, [electron, importedMeshes, operations, settings, tools]);

  const openOctoprintSettings = useCallback(() => {
    setIsOctoprintModalOpen(true);
  }, []);

  const handleSaveOctoprintSettings = useCallback(
    async (nextSettings: OctoprintSettings) => {
      const normalized = normalizeOctoprintSettings(nextSettings);

      if (electron?.saveOctoprintSettings) {
        const result = await electron.saveOctoprintSettings({ settings: normalized });
        if (!result?.ok) {
          setStatus(`OctoPrint settings save failed: ${result?.error || 'Unknown error'}`);
          return;
        }

        setOctoprintSettings(normalizeOctoprintSettings(result.settings));
        setIsOctoprintModalOpen(false);
        setStatus('Saved OctoPrint settings');
        return;
      }

      saveBrowserOctoprintSettings(normalized);
      setOctoprintSettings(normalized);
      setIsOctoprintModalOpen(false);
      setStatus('Saved OctoPrint settings (browser mode)');
    },
    [electron]
  );

  const handleSendToOctoprint = useCallback(
    async (runAfterUpload: boolean) => {
      const gcode = generateMarlinGcode({ operations, settings, tools, importedMeshes });
      const fileName = buildGcodeFileName(projectName);

      if (!electron?.uploadToOctoprint) {
        setStatus('OctoPrint send is available in desktop mode only');
        return;
      }

      const result = await electron.uploadToOctoprint({
        gcode,
        fileName,
        runAfterUpload,
      });

      if (!result?.ok) {
        setStatus(`OctoPrint send failed: ${result?.error || 'Unknown error'}`);
        return;
      }

      setStatus(
        runAfterUpload
          ? `Sent and started job in OctoPrint (${fileName})`
          : `Sent to OctoPrint (${fileName})`
      );
    },
    [electron, importedMeshes, operations, projectName, settings, tools]
  );

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => operations.some((operation) => operation.id === id)));
  }, [operations]);

  useEffect(() => {
    if (!sketchEdit.operationId) {
      return;
    }

    const matching = operations.find((operation) => operation.id === sketchEdit.operationId);
    if (!matching || matching.type !== 'sketch') {
      stopSketchEdit();
    }
  }, [operations, sketchEdit.operationId, stopSketchEdit]);

  useEffect(() => {
    if (!selectedOperation || selectedOperation.type !== 'sketch' || selectedOperation.id !== sketchEdit.operationId) {
      setSketchEdit((prev) =>
        prev.operationId === null
          ? prev
          : { operationId: null, selectedSegmentIndex: null, isNewSketch: false }
      );
    }
  }, [selectedOperation, sketchEdit.operationId]);

  useEffect(() => {
    if (settings.activeMaterialId === activeMaterialId) {
      return;
    }

    setSettings((prev) => ({ ...prev, activeMaterialId }));
  }, [activeMaterialId, settings.activeMaterialId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOctoprintSettings(): Promise<void> {
      if (electron?.getOctoprintSettings) {
        const result = await electron.getOctoprintSettings();
        if (!cancelled && result?.ok) {
          setOctoprintSettings(normalizeOctoprintSettings(result.settings));
        }
        return;
      }

      if (!cancelled) {
        setOctoprintSettings(loadBrowserOctoprintSettings());
      }
    }

    void loadOctoprintSettings();

    return () => {
      cancelled = true;
    };
  }, [electron]);

  useEffect(() => {
    savePreferences({ settings, materials, tools, activeToolId });
  }, [activeToolId, materials, settings, tools]);

  useEffect(() => {
    if (!transformSession) {
      return;
    }

    const sameSelection =
      transformSession.operationIds.length === selectedIds.length &&
      transformSession.operationIds.every((id) => selectedIds.includes(id));

    if (!sameSelection) {
      setTransformSession(null);
      setStatus('Transform canceled');
    }
  }, [selectedIds, transformSession]);

  useEffect(() => {
    if (!electron) return undefined;
    const unsubs = [
      electron.onMenuNew?.(handleNew),
      electron.onMenuOpen?.(handleOpen),
      electron.onMenuImportSvg?.(handleImportSvg),
      electron.onMenuImportDxf?.(handleImportDxf),
      electron.onMenuImportStl?.(handleImportStl),
      electron.onMenuImportDrl?.(handleImportDrl),
      electron.onMenuSave?.(handleSave),
      electron.onMenuExportGcode?.(handleExport),
      electron.onMenuOctoprintSettings?.(openOctoprintSettings),
      electron.onMenuZoomIn?.(() => requestZoom('in')),
      electron.onMenuZoomOut?.(() => requestZoom('out')),
      electron.onMenuZoomReset?.(() => requestZoom('reset')),
    ].filter((fn): fn is () => void => Boolean(fn));

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [electron, handleExport, handleImportDrl, handleImportDxf, handleImportStl, handleImportSvg, handleNew, handleOpen, handleSave, openOctoprintSettings, requestZoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableElement(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (transformSession) {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelTransformPreview();
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          commitTransformPreview();
          return;
        }

        if ((key === 'x' || key === 'y') && transformSession.mode !== 'rotate') {
          event.preventDefault();
          setTransformSession((previous) =>
            previous
              ? {
                  ...previous,
                  axis: normalizeTransformAxis(previous.mode, previous.axis, key),
                }
              : previous
          );
          return;
        }

        if (key === 'g') {
          event.preventDefault();
          beginSelectionTransform('move');
          return;
        }

        if (key === 'r') {
          event.preventDefault();
          beginSelectionTransform('rotate');
          return;
        }

        if (key === 's') {
          event.preventDefault();
          beginSelectionTransform('scale');
          return;
        }

        if (event.key === 'Backspace') {
          event.preventDefault();
          setTransformSession((previous) => (previous ? { ...previous, input: previous.input.slice(0, -1) } : previous));
          return;
        }

        if (isTransformInputKey(event.key)) {
          event.preventDefault();
          setTransformSession((previous) => (previous ? { ...previous, input: `${previous.input}${event.key}` } : previous));
          return;
        }
      }

      if (event.key === 'Escape' && pastePreview) {
        event.preventDefault();
        cancelPastePlacement();
        setStatus('Paste mode canceled');
        return;
      }

      if (event.key === 'Escape' && canCancelSketchWithEscape) {
        event.preventDefault();
        cancelSketchCreation();
        return;
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        sketchEdit.operationId &&
        selectedOperation?.type === 'sketch' &&
        sketchEdit.operationId === selectedOperation.id &&
        sketchEdit.selectedSegmentIndex !== null
      ) {
        event.preventDefault();
        deleteSelectedSketchSegment();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if (!mod) {
        if (key === 'g') {
          event.preventDefault();
          beginSelectionTransform('move');
          return;
        }

        if (key === 'r') {
          event.preventDefault();
          beginSelectionTransform('rotate');
          return;
        }

        if (key === 's') {
          event.preventDefault();
          beginSelectionTransform('scale');
          return;
        }

        return;
      }

      if (handleToolHotkey(key)) {
        event.preventDefault();
        return;
      }

      if (key === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }

      if (key === 'a' && isCanvasSurfaceFocused()) {
        event.preventDefault();
        setSelectedIds(operations.map((operation) => operation.id));
        setSelectedImportedMeshId(null);
        setSelectionAnchorId(operations[0]?.id || null);
        return;
      }

      if (key === 'v') {
        event.preventDefault();
        beginPastePlacement();
        return;
      }

      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    beginPastePlacement,
    beginSelectionTransform,
    cancelTransformPreview,
    commitTransformPreview,
    cancelPastePlacement,
    cancelSketchCreation,
    canCancelSketchWithEscape,
    copySelection,
    deleteSelectedSketchSegment,
    deleteSelection,
    handleToolHotkey,
    operations,
    transformSession,
    setTransformSession,
    pastePreview,
    redo,
    selectedOperation,
    selectedIds.length,
    sketchEdit.operationId,
    sketchEdit.selectedSegmentIndex,
    undo,
  ]);

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="topbar-title-group">
          <h1 className="topbar-title">Simple CAM</h1>
          <span className="topbar-subtitle">MPCNC / Marlin pattern editor</span>
        </div>
        <div className="topbar-tools">
          {visibleTools.map((tool, index) => {
            const meta = getToolButtonMeta(tool.id, index + 1);
            return (
              <button
                key={tool.id}
                type="button"
                className={`tool-button icon-only-toolbar-button ${activeTool === tool.id ? 'active' : ''}`}
                aria-label={tool.label}
                title={meta.title}
                onClick={() => handleToolButtonClick(tool.id)}
              >
                {meta.icon}
              </button>
            );
          })}
          {isEditingSelectedSketch ? (
            <>
              <span className="topbar-tools-divider" aria-hidden="true" />
              <button
                type="button"
                className="tool-button icon-only-toolbar-button save-sketch-button"
                aria-label="Finish sketch edit"
                title="Finish sketch edit"
                onClick={stopSketchEdit}
              >
                <Save aria-hidden="true" size={16} />
              </button>
              {canCancelSketchCreation ? (
                <button
                  type="button"
                  className="tool-button danger icon-only-toolbar-button"
                  aria-label="Cancel Sketch"
                  title="Cancel in-progress sketch"
                  onClick={cancelSketchCreation}
                >
                  <XCircle aria-hidden="true" size={16} />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="topbar-view-controls">
          <div className="view-mode-toggle" role="group" aria-label="Viewport mode">
            <button
              type="button"
              className={`tool-button ${viewportMode === '2d' ? 'active' : ''}`}
              aria-label="2D view"
              title="2D drawing and editing view"
              onClick={() => setViewportMode('2d')}
            >
              2D
            </button>
            <button
              type="button"
              className={`tool-button ${viewportMode === '3d' ? 'active' : ''}`}
              aria-label="3D preview"
              title="3D toolpath preview"
              onClick={() => setViewportMode('3d')}
            >
              3D
            </button>
          </div>
          <button
            type="button"
            className={`tool-button ${showToolpathPreview ? 'active' : ''}`}
            aria-label="Preview"
            title="Preview toolpaths"
            onClick={() => setShowToolpathPreview((current) => !current)}
          >
            <span className="tool-button-content">
              <Eye aria-hidden="true" size={16} />
              <span>Preview</span>
            </span>
          </button>
          <button type="button" className="tool-button icon-only-toolbar-button" aria-label="Zoom out" title="Zoom out" onClick={() => requestZoom('out')}>
            <Minus aria-hidden="true" size={16} />
          </button>
          <button type="button" className="tool-button icon-only-toolbar-button" aria-label="Zoom in" title="Zoom in" onClick={() => requestZoom('in')}>
            <Plus aria-hidden="true" size={16} />
          </button>
          <button type="button" className="tool-button" aria-label="Fit" title="Fit workspace in view" onClick={() => requestZoom('reset')}>
            <span className="tool-button-content">
              <ScanSearch aria-hidden="true" size={16} />
              <span>Fit</span>
            </span>
          </button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="left-pane">
          <ControlPanel
            settings={settings}
            onSettingsChange={(updates: Partial<MachineSettings>) => setSettings((prev) => ({ ...prev, ...updates }))}
            materials={materials}
            tools={tools}
            activeToolId={activeToolId}
            activeMaterialId={activeMaterialId}
            onSelectTool={setActiveToolId}
            onSelectMaterial={(materialId: string) =>
              setSettings((prev) => ({ ...prev, activeMaterialId: materialId }))
            }
            onAddMaterial={addMaterial}
            onUpdateMaterial={updateMaterial}
            onDeleteMaterial={deleteMaterial}
            onAddTool={addTool}
            onUpdateTool={updateTool}
            onUpdateToolMaterialProfile={updateToolMaterialProfile}
            onDeleteTool={deleteTool}
            onNewProject={handleNew}
            onOpenProject={handleOpen}
            onImportSvg={handleImportSvg}
            onImportDxf={handleImportDxf}
            onImportStl={handleImportStl}
            onImportDrl={handleImportDrl}
            onSaveProject={handleSave}
            onExportGcode={handleExport}
            canSendToOctoprint={hasOctoprintSettings}
            onSendToOctoprint={() => handleSendToOctoprint(false)}
            onSendAndRunOctoprint={() => handleSendToOctoprint(true)}
            operationCount={operations.length}
            onApplyDepthSettingsToAll={applyDepthSettingsToAll}
            onApplyMaterialToAll={applyMaterialToAll}
          />
        </aside>

        <main className="center-pane">
          {viewportMode === '2d' ? (
            <CamCanvas
              activeTool={activeTool}
              settings={settings}
              operations={operations}
              importedMeshes={importedMeshes}
              transformPreviewOperations={transformPreviewOperations}
              selectedOperationIds={selectedIds}
              selectedImportedMeshId={selectedImportedMeshId}
              onSelectOperation={handleSelectOperation}
              onSelectImportedMesh={handleSelectImportedMesh}
              onSetSelection={handleSetSelection}
              onAddOperation={addOperation}
              onPreviewMoveOperations={previewMoveSelectedOperations}
              onCommitMoveOperations={commitMoveSelectedOperations}
              onPreviewMoveImportedMesh={previewMoveImportedMesh}
              onCommitMoveImportedMesh={commitMoveImportedMesh}
              activeToolId={activeToolId}
              activeMaterialId={activeMaterialId}
              defaultDrillDepth={settings.drillDepth}
              zoomRequest={zoomRequest}
              pastePreview={pastePreview}
              onPlacePaste={placePastedOperations}
              onPointerUpdate={updateCanvasPointer}
              onCommitTransformPreview={commitTransformPreview}
              sketchEdit={sketchEdit}
              onUpdateOperation={updateOperation}
              onSelectSketchSegment={selectSketchSegment}
              onCancelSketchCreation={cancelSketchCreation}
              showToolpathPreview={showToolpathPreview}
              toolpathPreview={toolpathPreview}
              transformHint={transformHint}
            />
          ) : (
            <ToolpathPreview3D preview={toolpathPreview3D} importedMeshes={importedMeshes} />
          )}
        </main>

        <aside className="right-pane">
          <OperationsPanel
            operations={operations}
            importedMeshes={importedMeshes}
            workWidth={settings.workWidth}
            workHeight={settings.workHeight}
            selectedOperation={selectedOperation}
            selectedImportedMesh={selectedImportedMesh}
            selectedOperationIds={selectedIds}
            materials={materials}
            tools={tools}
            onSelectOperation={handleSelectOperation}
            onSelectImportedMesh={handleSelectImportedMesh}
            onCreateSurfaceRoughOperation={(meshId) => addSurfaceOperation(meshId, 'rough')}
            onCreateSurfaceFinishOperation={(meshId) => addSurfaceOperation(meshId, 'finish')}
            onUpdateOperation={updateOperation}
            onConvertDrillToCircle={convertDrillToCircle}
            onUpdateImportedMesh={updateImportedMesh}
            onDeleteImportedMesh={deleteImportedMesh}
            onDeleteOperation={deleteOperation}
            onDeleteSelection={deleteSelection}
            onMoveOperation={moveOperation}
            onMoveOperationToEdge={moveOperationToEdge}
            onRepeatOperation={repeatSelected}
            isEditingSelectedSketch={isEditingSelectedSketch}
            selectedSketchSegmentIndex={sketchEdit.selectedSegmentIndex}
            onStartSketchEdit={startSketchEdit}
            onStopSketchEdit={stopSketchEdit}
            onDeleteSelectedSketchSegment={deleteSelectedSketchSegment}
          />
        </aside>
      </div>

      <OctoprintSettingsModal
        isOpen={isOctoprintModalOpen}
        settings={octoprintSettings}
        onClose={() => setIsOctoprintModalOpen(false)}
        onSave={handleSaveOctoprintSettings}
      />

      {pendingImport ? (
        <div className="modal-backdrop" onClick={() => setPendingImport(null)}>
          <div
            className="modal-card import-cut-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-cut-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="import-cut-modal-title">Choose import cut type</h3>
              <button type="button" onClick={() => setPendingImport(null)}>
                Cancel
              </button>
            </div>
            <p className="section-note">
              {pendingImport.kind.toUpperCase()} file selected. Choose how closed imported paths should be converted before the import runs.
            </p>
            <div className="import-cut-actions">
              <button type="button" onClick={() => runPendingImport('along')}>
                Along path
              </button>
              <button type="button" onClick={() => runPendingImport('outside')}>
                Cut outside
              </button>
              <button type="button" onClick={() => runPendingImport('inside')}>
                Cut inside
              </button>
              <button type="button" className="accent" onClick={() => runPendingImport('pocket')}>
                Clear area
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="statusbar">
        <span>{transformHint || status}</span>
        <span>{projectName}</span>
        <span>
          {operations.length} operation(s), {selectedIds.length} selected
        </span>
      </footer>
    </div>
  );
}
