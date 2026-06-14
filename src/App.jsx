import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CamCanvas from './components/CamCanvas';
import ControlPanel from './components/ControlPanel';
import OperationsPanel from './components/OperationsPanel';
import { generateMarlinGcode } from './utils/gcode';
import { sanitizeOperation } from './utils/geometry';
import {
  normalizeMaterial,
  normalizeTool,
  resolveMaterialId,
  resolveToolPreset,
} from './utils/tooling';
import './App.css';

const DEFAULT_SETTINGS = {
  workWidth: 300,
  workHeight: 200,
  gridSize: 5,
  snapEnabled: true,
  activeMaterialId: 'material-generic',
  safeZ: 5,
  startEndZ: 15,
  drillDepth: -3,
  peckDepth: 1,
  cutDepth: -2,
  cutDepthPerPass: 1,
  rapidFeedRate: 2400,
  cutFeedRate: 600,
  plungeFeedRate: 220,
  spindleOn: false,
  spindleSpeed: 10000,
  circleSegments: 48,
};

const DEFAULT_TOOLS = [
  {
    id: 'tool-3.175mm-endmill',
    name: 'Endmill 3.175mm',
    diameter: 3.175,
    rapidFeedRate: 2400,
    cutFeedRate: 600,
    plungeFeedRate: 220,
    materialProfiles: {
      'material-generic': {
        rapidFeedRate: 2400,
        cutFeedRate: 600,
        plungeFeedRate: 220,
        drillDepth: -3,
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
        rapidFeedRate: 1800,
        cutFeedRate: 350,
        plungeFeedRate: 180,
        drillDepth: -3,
        cutDepthPerPass: 1,
      },
    },
  },
];

const DEFAULT_MATERIALS = [{ id: 'material-generic', name: 'Generic' }];

const TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'drill', label: 'Drill' },
  { id: 'line', label: 'Cut Line' },
  { id: 'rect', label: 'Cut Rect' },
  { id: 'circle', label: 'Cut Circle' },
];

const HISTORY_LIMIT = 200;
const PREFERENCES_STORAGE_KEY = 'simple-cam.preferences.v1';
const OCTOPRINT_WEB_STORAGE_KEY = 'simple-cam.octoprint.v1';
const DEFAULT_OCTOPRINT_SETTINGS = {
  baseUrl: '',
  apiKey: '',
};

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function fileNameFromPath(filePath) {
  if (!filePath) return null;
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || null;
}

function offsetOperation(operation, dx, dy) {
  if (operation.type === 'drill') {
    return { ...operation, x: operation.x + dx, y: operation.y + dy };
  }

  if (operation.type === 'line') {
    return {
      ...operation,
      x1: operation.x1 + dx,
      y1: operation.y1 + dy,
      x2: operation.x2 + dx,
      y2: operation.y2 + dy,
    };
  }

  if (operation.type === 'rect') {
    return { ...operation, x: operation.x + dx, y: operation.y + dy };
  }

  if (operation.type === 'circle') {
    return { ...operation, x: operation.x + dx, y: operation.y + dy };
  }

  return operation;
}

function loadPreferences() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function savePreferences(preferences) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore persistence errors.
  }
}

function getInitialState() {
  const stored = loadPreferences();
  const materialsRaw =
    Array.isArray(stored?.materials) && stored.materials.length > 0 ? stored.materials : DEFAULT_MATERIALS;
  const materials = materialsRaw.map((material, index) =>
    normalizeMaterial(material, `material-${index}`)
  );

  const settings = { ...DEFAULT_SETTINGS, ...(stored?.settings || {}) };
  settings.activeMaterialId = resolveMaterialId(materials, settings.activeMaterialId, DEFAULT_SETTINGS.activeMaterialId);

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

function operationBounds(operation) {
  if (operation.type === 'drill') {
    return { minX: operation.x, minY: operation.y, maxX: operation.x, maxY: operation.y };
  }

  if (operation.type === 'line') {
    return {
      minX: Math.min(operation.x1, operation.x2),
      minY: Math.min(operation.y1, operation.y2),
      maxX: Math.max(operation.x1, operation.x2),
      maxY: Math.max(operation.y1, operation.y2),
    };
  }

  if (operation.type === 'rect') {
    const x1 = operation.x;
    const y1 = operation.y;
    const x2 = operation.x + operation.width;
    const y2 = operation.y + operation.height;
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    };
  }

  if (operation.type === 'circle') {
    return {
      minX: operation.x - operation.radius,
      minY: operation.y - operation.radius,
      maxX: operation.x + operation.radius,
      maxY: operation.y + operation.radius,
    };
  }

  return null;
}

function computeBounds(operations) {
  const items = operations.map(operationBounds).filter(Boolean);
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

function isEditableElement(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName?.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

function operationsChanged(a, b) {
  if (a === b) return false;
  if (!Array.isArray(a) || !Array.isArray(b)) return true;
  if (a.length !== b.length) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}

function buildGcodeFileName(projectName) {
  const base = (projectName || 'output').replace(/\.(cam|json|gcode)$/i, '');
  return `${base || 'output'}.gcode`;
}

function normalizeOctoprintSettings(settings) {
  const baseRaw = typeof settings?.baseUrl === 'string' ? settings.baseUrl.trim() : '';
  const hasScheme = /^https?:\/\//i.test(baseRaw);
  return {
    baseUrl: baseRaw ? (hasScheme ? baseRaw : `http://${baseRaw}`) : '',
    apiKey: typeof settings?.apiKey === 'string' ? settings.apiKey.trim() : '',
  };
}

function loadBrowserOctoprintSettings() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_OCTOPRINT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(OCTOPRINT_WEB_STORAGE_KEY);
    if (!raw) return DEFAULT_OCTOPRINT_SETTINGS;
    const parsed = JSON.parse(raw);
    return normalizeOctoprintSettings(parsed);
  } catch {
    return DEFAULT_OCTOPRINT_SETTINGS;
  }
}

function saveBrowserOctoprintSettings(settings) {
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

function OctoprintSettingsModal({ isOpen, settings, onClose, onSave }) {
  const [draft, setDraft] = useState(settings);

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

export default function App() {
  const electron = typeof window !== 'undefined' ? window.electron : null;
  const initialState = useMemo(() => getInitialState(), []);

  const [settings, setSettings] = useState(initialState.settings);
  const [materials, setMaterials] = useState(initialState.materials);
  const [activeTool, setActiveTool] = useState('select');
  const [operationsHistory, setOperationsHistory] = useState({ past: [], present: [], future: [] });
  const [selectedIds, setSelectedIds] = useState([]);
  const [clipboard, setClipboard] = useState(null);
  const [pastePreview, setPastePreview] = useState(null);
  const [projectName, setProjectName] = useState('project.cam.json');
  const [status, setStatus] = useState('Ready');
  const [zoomRequest, setZoomRequest] = useState({ token: 0, action: 'reset' });
  const [tools, setTools] = useState(initialState.tools);
  const [activeToolId, setActiveToolId] = useState(initialState.activeToolId);
  const [octoprintSettings, setOctoprintSettings] = useState(DEFAULT_OCTOPRINT_SETTINGS);
  const [isOctoprintModalOpen, setIsOctoprintModalOpen] = useState(false);

  const operations = operationsHistory.present;
  const canUndo = operationsHistory.past.length > 0;
  const canRedo = operationsHistory.future.length > 0;

  const selectedOperations = useMemo(
    () => operations.filter((op) => selectedIds.includes(op.id)),
    [operations, selectedIds]
  );
  const activeMaterialId = resolveMaterialId(
    materials,
    settings.activeMaterialId,
    DEFAULT_SETTINGS.activeMaterialId
  );
  const activeMaterial = materials.find((material) => material.id === activeMaterialId) || materials[0] || null;
  const activeToolDefinition = tools.find((tool) => tool.id === activeToolId) || tools[0] || null;
  const activeToolPreset = useMemo(
    () => resolveToolPreset(activeToolDefinition, activeMaterialId, settings),
    [activeMaterialId, activeToolDefinition, settings]
  );

  const selectedOperation = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    return operations.find((op) => op.id === selectedIds[0]) || null;
  }, [operations, selectedIds]);

  const hasOctoprintSettings =
    Boolean(octoprintSettings.baseUrl && octoprintSettings.baseUrl.trim()) &&
    Boolean(octoprintSettings.apiKey && octoprintSettings.apiKey.trim());

  const commitOperations = useCallback((nextOrUpdater) => {
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

  const setOperationsDirect = useCallback((nextOperations) => {
    setOperationsHistory({ past: [], present: nextOperations, future: [] });
  }, []);

  const requestZoom = useCallback((action) => {
    setZoomRequest((prev) => ({ token: prev.token + 1, action }));
  }, []);

  const handleSelectOperation = useCallback((id, options = {}) => {
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

  const handleSetSelection = useCallback((ids, options = {}) => {
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
    (operation) => {
      const selectedToolId = operation.toolId || activeToolId || tools[0]?.id || null;
      const selectedMaterialId = resolveMaterialId(
        materials,
        operation.materialId,
        activeMaterialId
      );
      const id = newId();
      const nextOperation = { ...operation, toolId: selectedToolId, materialId: selectedMaterialId, id };
      commitOperations((prev) => [...prev, nextOperation]);
      setSelectedIds([id]);
      return id;
    },
    [activeMaterialId, activeToolId, commitOperations, materials, tools]
  );

  const updateOperation = useCallback(
    (id, updates) => {
      commitOperations((prev) => prev.map((op) => (op.id === id ? { ...op, ...updates } : op)));
    },
    [commitOperations]
  );

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

  const updateMaterial = useCallback((materialId, updates) => {
    setMaterials((prev) =>
      prev.map((material) => (material.id === materialId ? { ...material, ...updates } : material))
    );
  }, []);

  const deleteMaterial = useCallback(
    (materialId) => {
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

  const updateToolMaterialProfile = useCallback((toolId, materialId, updates) => {
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
  }, []);

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
    ({ ids, sourceOperations, dx, dy }) => {
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
    (id) => {
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
    (id, direction) => {
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

  const updateTool = useCallback((toolId, updates) => {
    setTools((prev) => prev.map((tool) => (tool.id === toolId ? { ...tool, ...updates } : tool)));
  }, []);

  const deleteTool = useCallback(
    (toolId) => {
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
    ({ count, offsetX, offsetY }) => {
      if (selectedOperations.length === 0 || !Number.isFinite(count) || count < 1) {
        return;
      }

      const repeats = Math.max(1, Math.floor(count));
      const dx = Number(offsetX) || 0;
      const dy = Number(offsetY) || 0;

      const clones = [];
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

    const cloned = selectedOperations.map((operation) => {
      const { id, ...rest } = operation;
      return { ...rest };
    });

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
    (targetPoint) => {
      if (!pastePreview?.operations?.length) {
        return;
      }

      const dx = targetPoint.x - pastePreview.anchor.x;
      const dy = targetPoint.y - pastePreview.anchor.y;

      const pasted = pastePreview.operations.map((operation) => ({
        ...offsetOperation(operation, dx, dy),
        id: newId(),
        toolId: operation.toolId || activeToolId,
        materialId: resolveMaterialId(materials, operation.materialId, activeMaterialId),
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

    const loaded = result.project || {};
    const loadedSettings = { ...DEFAULT_SETTINGS, ...(loaded.settings || {}) };
    if (typeof loadedSettings.drillDepth !== 'number' && typeof loadedSettings.peckDepth === 'number') {
      loadedSettings.drillDepth = loadedSettings.peckDepth;
    }
    if (typeof loadedSettings.peckDepth !== 'number') {
      loadedSettings.peckDepth = Math.max(0.1, Math.abs(loadedSettings.drillDepth || 1));
    }
    if (typeof loadedSettings.cutDepthPerPass !== 'number') {
      loadedSettings.cutDepthPerPass = Math.max(0.1, Math.abs(loadedSettings.cutDepth || 1));
    }

    const loadedMaterialsRaw =
      Array.isArray(loaded.materials) && loaded.materials.length > 0 ? loaded.materials : DEFAULT_MATERIALS;
    const loadedMaterials = loadedMaterialsRaw.map((material, index) =>
      normalizeMaterial(material, `material-${index}`)
    );
    loadedSettings.activeMaterialId = resolveMaterialId(
      loadedMaterials,
      loadedSettings.activeMaterialId,
      DEFAULT_SETTINGS.activeMaterialId
    );

    const loadedToolsRaw = Array.isArray(loaded.tools) && loaded.tools.length > 0 ? loaded.tools : DEFAULT_TOOLS;
    const loadedTools = loadedToolsRaw.map((tool, index) => normalizeTool(tool, `tool-${index}`));
    const loadedActiveToolId =
      loaded.activeToolId && loadedTools.some((tool) => tool.id === loaded.activeToolId)
        ? loaded.activeToolId
        : loadedTools[0].id;

    const loadedOperations = Array.isArray(loaded.operations)
      ? loaded.operations
          .map((item) => sanitizeOperation(item))
          .filter(Boolean)
          .map((item) => ({
            ...item,
            id: item.id || newId(),
            toolId:
              item.toolId && loadedTools.some((tool) => tool.id === item.toolId)
                ? item.toolId
                : loadedActiveToolId,
            materialId: resolveMaterialId(
              loadedMaterials,
              item.materialId,
              loadedSettings.activeMaterialId
            ),
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

    const result = await electron.saveProject({
      suggestedName: projectName,
      project: { version: 1, settings, materials, tools, activeToolId, operations },
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
    async (nextSettings) => {
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
    async (runAfterUpload) => {
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
    if (settings.activeMaterialId === activeMaterialId) {
      return;
    }

    setSettings((prev) => ({ ...prev, activeMaterialId }));
  }, [activeMaterialId, settings.activeMaterialId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOctoprintSettings() {
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

    loadOctoprintSettings();

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
    ].filter(Boolean);

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [electron, handleExport, handleNew, handleOpen, handleSave, openOctoprintSettings, requestZoom]);

  useEffect(() => {
    const onKeyDown = (event) => {
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
          {TOOLS.map((tool) => (
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
            onSettingsChange={(updates) => setSettings((prev) => ({ ...prev, ...updates }))}
            materials={materials}
            tools={tools}
            activeToolId={activeToolId}
            activeMaterialId={activeMaterialId}
            onSelectTool={setActiveToolId}
            onSelectMaterial={(materialId) =>
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
            defaultDrillDepth={activeToolPreset.drillDepth}
            zoomRequest={zoomRequest}
            pastePreview={pastePreview}
            onPlacePaste={placePastedOperations}
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
            onCopySelection={copySelection}
            onPasteSelection={beginPastePlacement}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
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
