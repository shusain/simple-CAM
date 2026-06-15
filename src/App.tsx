import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CamCanvas from './components/CamCanvas';
import ControlPanel from './components/ControlPanel';
import OperationsPanel from './components/OperationsPanel';
import { generateMarlinGcode } from './utils/gcode';
import { getOperationBounds, isClosedSketchPath, moveOperation, sanitizeOperation } from './utils/geometry';
import {
  normalizeMaterial,
  normalizeTool,
  resolveMaterialId,
} from './utils/tooling';
import type {
  CamProjectFile,
  HistoryState,
  MachineSettings,
  Material,
  OctoprintSettings,
  Operation,
  PastePreview,
  ToolMaterialProfile,
  Tool,
  ZoomRequest,
  SketchEditState,
} from './types';
import type { ElectronBridge } from './types/electron';
import './App.css';

const DEFAULT_SETTINGS: MachineSettings = {
  workWidth: 300,
  workHeight: 200,
  gridSize: 5,
  snapEnabled: true,
  activeMaterialId: 'material-generic',
  safeZ: 5,
  startEndZ: 15,
  drillDepth: -3,
  cutDepth: -2,
  rapidFeedRate: 2400,
  cutFeedRate: 600,
  plungeFeedRate: 220,
  spindleOn: false,
  spindleSpeed: 10000,
  circleSegments: 48,
};

const DEFAULT_TOOLS: Tool[] = [
  {
    id: 'tool-3.175mm-endmill',
    name: 'Endmill 3.175mm',
    diameter: 3.175,
    rapidFeedRate: 2400,
    cutFeedRate: 600,
    plungeFeedRate: 220,
    materialProfiles: {
      'material-generic': {
        cutFeedRate: 600,
        plungeFeedRate: 220,
        drillDepthPerPass: 1,
        cutDepthPerPass: 1,
      },
    },
  },
  {
    id: 'tool-1-8-drill',
    name: 'Drill 3.175mm',
    diameter: 3.175,
    rapidFeedRate: 1800,
    cutFeedRate: 350,
    plungeFeedRate: 180,
    materialProfiles: {
      'material-generic': {
        cutFeedRate: 350,
        plungeFeedRate: 180,
        drillDepthPerPass: 1,
        cutDepthPerPass: 1,
      },
    },
  },
];

const DEFAULT_MATERIALS: Material[] = [{ id: 'material-generic', name: 'Generic' }];

const TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'drill', label: 'Drill' },
  { id: 'line', label: 'Cut Line' },
  { id: 'sketch', label: 'Poly-Line' },
  { id: 'arc', label: 'Poly-Arc' },
  { id: 'rect', label: 'Cut Rect' },
  { id: 'circle', label: 'Cut Circle' },
] as const;

type ActiveTool = (typeof TOOLS)[number]['id'];

interface PreferencesData {
  settings?: Partial<MachineSettings>;
  materials?: Material[];
  tools?: Tool[];
  activeToolId?: string;
}

interface InitialState {
  settings: MachineSettings;
  materials: Material[];
  tools: Tool[];
  activeToolId: string;
}

interface OctoprintSettingsModalProps {
  isOpen: boolean;
  settings: OctoprintSettings;
  onClose: () => void;
  onSave: (settings: OctoprintSettings) => void;
}

interface SelectOptions {
  additive?: boolean;
  toggle?: boolean;
}

interface RepeatArgs {
  count: number;
  offsetX: number;
  offsetY: number;
}

interface MoveSelectedOperationsArgs {
  ids: string[];
  sourceOperations: Operation[];
  dx: number;
  dy: number;
}

type OperationsUpdater = Operation[] | ((current: Operation[]) => Operation[]);
type OperationUpdates = Partial<Operation>;
type OperationBounds = NonNullable<ReturnType<typeof getOperationBounds>>;

const HISTORY_LIMIT = 200;
const PREFERENCES_STORAGE_KEY = 'simple-cam.preferences.v1';
const OCTOPRINT_WEB_STORAGE_KEY = 'simple-cam.octoprint.v1';
const DEFAULT_OCTOPRINT_SETTINGS: OctoprintSettings = {
  baseUrl: '',
  apiKey: '',
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function fileNameFromPath(filePath?: string): string | null {
  if (!filePath) return null;
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || null;
}

function offsetOperation(operation: Operation, dx: number, dy: number): Operation {
  return moveOperation(operation, dx, dy) as Operation;
}

function loadPreferences(): PreferencesData | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PreferencesData) : null;
  } catch {
    return null;
  }
}

function savePreferences(preferences: PreferencesData): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore persistence errors.
  }
}

function getInitialState(): InitialState {
  const stored = loadPreferences();
  const materialsRaw =
    Array.isArray(stored?.materials) && stored.materials.length > 0 ? stored.materials : DEFAULT_MATERIALS;
  const materials = materialsRaw.map((material, index) =>
    normalizeMaterial(material, `material-${index}`)
  );

  const settings: MachineSettings = { ...DEFAULT_SETTINGS, ...(stored?.settings || {}) };
  settings.activeMaterialId =
    resolveMaterialId(materials, settings.activeMaterialId, DEFAULT_SETTINGS.activeMaterialId) ||
    DEFAULT_SETTINGS.activeMaterialId;

  const toolsRaw = Array.isArray(stored?.tools) && stored.tools.length > 0 ? stored.tools : DEFAULT_TOOLS;
  const tools = toolsRaw.map((tool, index) => normalizeTool(tool, `tool-${index}`));

  const activeToolId =
    stored?.activeToolId && tools.some((tool) => tool.id === stored.activeToolId)
      ? stored.activeToolId
      : tools[0].id;

  return {
    settings,
    materials,
    tools,
    activeToolId,
  };
}

function computeBounds(operations: Operation[]): OperationBounds | null {
  const items = operations.map(getOperationBounds).filter(Boolean) as OperationBounds[];
  if (items.length === 0) return null;

  return items.reduce(
    (acc, item) => ({
      minX: Math.min(acc.minX, item.minX),
      minY: Math.min(acc.minY, item.minY),
      maxX: Math.max(acc.maxX, item.maxX),
      maxY: Math.max(acc.maxY, item.maxY),
    }),
    items[0]
  );
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName?.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function operationsChanged(a: Operation[], b: Operation[]): boolean {
  if (a === b) return false;
  if (!Array.isArray(a) || !Array.isArray(b)) return true;
  if (a.length !== b.length) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}

function buildGcodeFileName(projectName: string): string {
  const base = (projectName || 'output').replace(/\.(cam|json|gcode)$/i, '');
  return `${base || 'output'}.gcode`;
}

function normalizeOctoprintSettings(settings: Partial<OctoprintSettings> | null | undefined): OctoprintSettings {
  const baseRaw = typeof settings?.baseUrl === 'string' ? settings.baseUrl.trim() : '';
  const hasScheme = /^https?:\/\//i.test(baseRaw);
  return {
    baseUrl: baseRaw ? (hasScheme ? baseRaw : `http://${baseRaw}`) : '',
    apiKey: typeof settings?.apiKey === 'string' ? settings.apiKey.trim() : '',
  };
}

function loadBrowserOctoprintSettings(): OctoprintSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_OCTOPRINT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(OCTOPRINT_WEB_STORAGE_KEY);
    if (!raw) return DEFAULT_OCTOPRINT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<OctoprintSettings>;
    return normalizeOctoprintSettings(parsed);
  } catch {
    return DEFAULT_OCTOPRINT_SETTINGS;
  }
}

function saveBrowserOctoprintSettings(settings: Partial<OctoprintSettings>): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      OCTOPRINT_WEB_STORAGE_KEY,
      JSON.stringify(normalizeOctoprintSettings(settings))
    );
  } catch {
    // Ignore persistence errors.
  }
}

function OctoprintSettingsModal({ isOpen, settings, onClose, onSave }: OctoprintSettingsModalProps): React.JSX.Element | null {
  const [draft, setDraft] = useState<OctoprintSettings>(settings);

  useEffect(() => {
    if (isOpen) {
      setDraft(settings);
    }
  }, [isOpen, settings]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>OctoPrint Settings</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="section-note" style={{ marginBottom: 12 }}>
          Saved locally on this machine and not included in project files.
        </p>

        <label className="field-row">
          <span>OctoPrint URL</span>
          <input
            type="text"
            placeholder="http://octopi.local"
            value={draft.baseUrl}
            onChange={(event) => setDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
          />
        </label>

        <label className="field-row">
          <span>API Key</span>
          <input
            type="password"
            placeholder="OctoPrint API key"
            value={draft.apiKey}
            onChange={(event) => setDraft((prev) => ({ ...prev, apiKey: event.target.value }))}
          />
        </label>

        <div className="button-column" style={{ marginTop: 10 }}>
          <button type="button" className="accent" onClick={() => onSave(draft)}>
            Save OctoPrint Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App(): React.JSX.Element {
  const electron: ElectronBridge | null = typeof window !== 'undefined' ? window.electron || null : null;
  const initialState = useMemo<InitialState>(() => getInitialState(), []);

  const [settings, setSettings] = useState<MachineSettings>(initialState.settings);
  const [materials, setMaterials] = useState<Material[]>(initialState.materials);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [operationsHistory, setOperationsHistory] = useState<HistoryState<Operation[]>>({
    past: [],
    present: [],
    future: [],
  });
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
  });

  const operations = operationsHistory.present;

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
  const selectedOperation = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    return operations.find((op) => op.id === selectedIds[0]) || null;
  }, [operations, selectedIds]);
  const isEditingSelectedSketch =
    selectedOperation?.type === 'sketch' && sketchEdit.operationId === selectedOperation.id;

  const hasOctoprintSettings =
    Boolean(octoprintSettings.baseUrl && octoprintSettings.baseUrl.trim()) &&
    Boolean(octoprintSettings.apiKey && octoprintSettings.apiKey.trim());

  const commitOperations = useCallback((nextOrUpdater: OperationsUpdater) => {
    setOperationsHistory((previous) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(previous.present) : nextOrUpdater;
      if (!Array.isArray(next)) {
        return previous;
      }

      if (!operationsChanged(previous.present, next)) {
        return previous;
      }

      const past = [...previous.past, previous.present];
      if (past.length > HISTORY_LIMIT) {
        past.shift();
      }

      return {
        past,
        present: next,
        future: [],
      };
    });
  }, []);

  const setOperationsDirect = useCallback((nextOperations: Operation[]) => {
    setOperationsHistory({ past: [], present: nextOperations, future: [] });
  }, []);

  const requestZoom = useCallback((action: ZoomRequest['action']) => {
    setZoomRequest((prev) => ({ token: prev.token + 1, action }));
  }, []);

  const handleSelectOperation = useCallback((id: string | null, options: SelectOptions = {}) => {
    const additive = Boolean(options.additive);
    const toggle = Boolean(options.toggle);

    if (!id) {
      if (!additive) {
        setSelectedIds([]);
      }
      return;
    }

    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      if (toggle) {
        return exists ? prev.filter((item) => item !== id) : [...prev, id];
      }
      if (additive) {
        return exists ? prev : [...prev, id];
      }
      return [id];
    });
  }, []);

  const handleSetSelection = useCallback((ids: string[], options: { additive?: boolean } = {}) => {
    const additive = Boolean(options.additive);
    const unique = Array.from(new Set((ids || []).filter(Boolean)));

    setSelectedIds((prev) => {
      if (!additive) {
        return unique;
      }
      return Array.from(new Set([...prev, ...unique]));
    });
  }, []);

  const addOperation = useCallback(
    (operation: Omit<Operation, 'id'>) => {
      const selectedToolId = operation.toolId || activeToolId || tools[0]?.id || null;
      const selectedMaterialId = resolveMaterialId(
        materials,
        operation.materialId,
        activeMaterialId
      );
      const id = newId();
      const nextOperation = {
        ...operation,
        toolId: selectedToolId || undefined,
        materialId: selectedMaterialId || undefined,
        id,
      } as Operation;
      commitOperations((prev) => [...prev, nextOperation]);
      setSelectedIds([id]);
      return id;
    },
    [activeMaterialId, activeToolId, commitOperations, materials, tools]
  );

  const updateOperation = useCallback(
    (id: string, updates: OperationUpdates) => {
      commitOperations((prev) => prev.map((op) => (op.id === id ? ({ ...op, ...updates } as Operation) : op)));
    },
    [commitOperations]
  );

  const startSketchEdit = useCallback(() => {
    if (!selectedOperation || selectedOperation.type !== 'sketch') {
      return;
    }

    setSketchEdit({
      operationId: selectedOperation.id,
      selectedSegmentIndex: null,
    });
    setActiveTool('select');
  }, [selectedOperation]);

  const stopSketchEdit = useCallback(() => {
    if (selectedOperation?.type === 'sketch') {
      const closed = isClosedSketchPath(selectedOperation);
      updateOperation(selectedOperation.id, {
        closed,
        cutSide: closed ? selectedOperation.cutSide || 'outside' : 'along',
        tabsEnabled: closed ? selectedOperation.tabsEnabled : false,
      });
    }

    setSketchEdit({
      operationId: null,
      selectedSegmentIndex: null,
    });
  }, [selectedOperation, updateOperation]);

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

    updateOperation(selectedOperation.id, {
      segments: nextSegments,
      closed: false,
      tabsEnabled: false,
    });
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

  const moveSelectedOperations = useCallback(
    ({ ids, sourceOperations, dx, dy }: MoveSelectedOperationsArgs) => {
      const selected = Array.isArray(ids) ? ids : [];
      if (selected.length === 0) return;

      const sourceMap = new Map((sourceOperations || []).map((item) => [item.id, item]));
      const selectedSet = new Set(selected);

      commitOperations((prev) =>
        prev.map((operation) => {
          if (!selectedSet.has(operation.id)) {
            return operation;
          }
          const base = sourceMap.get(operation.id) || operation;
          return offsetOperation(base, dx, dy);
        })
      );
    },
    [commitOperations]
  );

  const deleteOperation = useCallback(
    (id: string) => {
      commitOperations((prev) => prev.filter((op) => op.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    },
    [commitOperations]
  );

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const selectedSet = new Set(selectedIds);
    commitOperations((prev) => prev.filter((op) => !selectedSet.has(op.id)));
    setSelectedIds([]);
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

    const bounds = computeBounds(selectedOperations);
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
    setSelectedIds([]);
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

    const loadedSettings: MachineSettings = { ...DEFAULT_SETTINGS, ...(loaded.settings || {}) };

    const loadedMaterialsRaw: Material[] =
      Array.isArray(loaded.materials) && loaded.materials.length > 0 ? loaded.materials : DEFAULT_MATERIALS;
    const loadedMaterials = loadedMaterialsRaw.map((material, index) =>
      normalizeMaterial(material, `material-${index}`)
    );
    loadedSettings.activeMaterialId =
      resolveMaterialId(
        loadedMaterials,
        loadedSettings.activeMaterialId,
        DEFAULT_SETTINGS.activeMaterialId
      ) || DEFAULT_SETTINGS.activeMaterialId;

    const loadedToolsRaw: Tool[] = Array.isArray(loaded.tools) && loaded.tools.length > 0 ? loaded.tools : DEFAULT_TOOLS;
    const loadedTools = loadedToolsRaw.map((tool, index) => normalizeTool(tool, `tool-${index}`));
    const loadedActiveToolId =
      loaded.activeToolId && loadedTools.some((tool) => tool.id === loaded.activeToolId)
        ? loaded.activeToolId
        : loadedTools[0].id;

    const loadedOperationsSource: Operation[] = Array.isArray(loaded.operations) ? loaded.operations : [];
    const loadedOperations: Operation[] = loadedOperationsSource.length > 0
      ? loadedOperationsSource
          .map((item) => sanitizeOperation(item))
          .filter((item): item is Operation => Boolean(item))
          .map((item) => ({
            ...item,
            id: item.id || newId(),
            toolId:
              item.toolId && loadedTools.some((tool) => tool.id === item.toolId)
                ? item.toolId
                : loadedActiveToolId,
            materialId:
              resolveMaterialId(
                loadedMaterials,
                item.materialId,
                loadedSettings.activeMaterialId
              ) || undefined,
          }))
      : [];

    setSettings(loadedSettings);
    setMaterials(loadedMaterials);
    setTools(loadedTools);
    setActiveToolId(loadedActiveToolId);
    setOperationsDirect(loadedOperations);
    setSelectedIds([]);
    setClipboard(null);
    setPastePreview(null);
    const filename = fileNameFromPath(result.filePath);
    if (filename) setProjectName(filename);
    setStatus(`Opened ${loadedOperations.length} operation(s)`);
  }, [electron, setOperationsDirect]);

  const handleSave = useCallback(async () => {
    if (!electron?.saveProject) {
      setStatus('Save is available in desktop mode only');
      return;
    }

    const project: CamProjectFile = { version: 1, settings, materials, tools, activeToolId, operations };
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
  }, [activeToolId, electron, materials, operations, projectName, settings, tools]);

  const handleExport = useCallback(async () => {
    const gcode = generateMarlinGcode({ operations, settings, tools });

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
  }, [electron, operations, settings, tools]);

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
      const gcode = generateMarlinGcode({ operations, settings, tools });
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
    [electron, operations, projectName, settings, tools]
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
          : { operationId: null, selectedSegmentIndex: null }
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
    if (!electron) return undefined;
    const unsubs = [
      electron.onMenuNew?.(handleNew),
      electron.onMenuOpen?.(handleOpen),
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
  }, [electron, handleExport, handleNew, handleOpen, handleSave, openOctoprintSettings, requestZoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (event.key === 'Escape' && pastePreview) {
        event.preventDefault();
        cancelPastePlacement();
        setStatus('Paste mode canceled');
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if (!mod) {
        return;
      }

      if (key === 'c') {
        event.preventDefault();
        copySelection();
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
    cancelPastePlacement,
    copySelection,
    deleteSelection,
    pastePreview,
    redo,
    selectedIds.length,
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
          {(isEditingSelectedSketch ? TOOLS.filter((tool) => ['select', 'sketch', 'arc'].includes(tool.id)) : TOOLS).map((tool) => (
            <button
              key={tool.id}
              type="button"
              className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => setActiveTool(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <div className="topbar-view-controls">
          <button type="button" className="tool-button" onClick={() => requestZoom('out')}>
            Zoom -
          </button>
          <button type="button" className="tool-button" onClick={() => requestZoom('in')}>
            Zoom +
          </button>
          <button type="button" className="tool-button" onClick={() => requestZoom('reset')}>
            Fit
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
          <CamCanvas
            activeTool={activeTool}
            settings={settings}
            operations={operations}
            selectedOperationIds={selectedIds}
            onSelectOperation={handleSelectOperation}
            onSetSelection={handleSetSelection}
            onAddOperation={addOperation}
            onMoveOperations={moveSelectedOperations}
            activeToolId={activeToolId}
            activeMaterialId={activeMaterialId}
            defaultDrillDepth={settings.drillDepth}
            zoomRequest={zoomRequest}
            pastePreview={pastePreview}
            onPlacePaste={placePastedOperations}
            sketchEdit={sketchEdit}
            onUpdateOperation={updateOperation}
            onSelectSketchSegment={selectSketchSegment}
          />
        </main>

        <aside className="right-pane">
          <OperationsPanel
            operations={operations}
            selectedOperation={selectedOperation}
            selectedOperationIds={selectedIds}
            materials={materials}
            tools={tools}
            onSelectOperation={handleSelectOperation}
            onUpdateOperation={updateOperation}
            onDeleteOperation={deleteOperation}
            onDeleteSelection={deleteSelection}
            onMoveOperation={moveOperation}
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

      <footer className="statusbar">
        <span>{status}</span>
        <span>{projectName}</span>
        <span>
          {operations.length} operation(s), {selectedIds.length} selected
        </span>
      </footer>
    </div>
  );
}
