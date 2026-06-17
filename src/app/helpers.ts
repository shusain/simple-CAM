import type { ImportedMesh, MachineSettings, Material, OctoprintSettings, Operation, Tool } from '../types';
import { moveOperation } from '../utils/geometry';
import { normalizeMaterial, normalizeTool, resolveMaterialId } from '../utils/tooling';
import {
  DEFAULT_MATERIALS,
  DEFAULT_OCTOPRINT_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_TOOLS,
  OCTOPRINT_WEB_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
} from './defaults';
import type { InitialState, OperationBounds, PreferencesData } from './types';

type OperationBoundsGetter = (operation: Operation) => OperationBounds | null;

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function fileNameFromPath(filePath?: string): string | null {
  if (!filePath) return null;
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || null;
}

export function offsetOperation(operation: Operation, dx: number, dy: number): Operation {
  return moveOperation(operation, dx, dy) as Operation;
}

export function loadPreferences(): PreferencesData | null {
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

export function savePreferences(preferences: PreferencesData): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore persistence errors.
  }
}

export function getInitialState(): InitialState {
  const stored = loadPreferences();
  const materialsRaw =
    Array.isArray(stored?.materials) && stored.materials.length > 0 ? stored.materials : DEFAULT_MATERIALS;
  const materials = materialsRaw.map((material, index) => normalizeMaterial(material, `material-${index}`));

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

  return { settings, materials, tools, activeToolId, importedMeshes: [] };
}

export function computeBounds(operations: Operation[], getBounds: OperationBoundsGetter): OperationBounds | null {
  const items = operations.map(getBounds).filter(Boolean) as OperationBounds[];
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

export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName?.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

export function operationsChanged(a: Operation[], b: Operation[]): boolean {
  if (a === b) return false;
  if (!Array.isArray(a) || !Array.isArray(b)) return true;
  if (a.length !== b.length) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function importedMeshesChanged(a: ImportedMesh[], b: ImportedMesh[]): boolean {
  if (a === b) return false;
  if (!Array.isArray(a) || !Array.isArray(b)) return true;
  if (a.length !== b.length) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function buildGcodeFileName(projectName: string): string {
  const base = (projectName || 'output').replace(/(\.cam\.json|\.cam|\.json|\.gcode)$/i, '');
  return `${base || 'output'}.gcode`;
}

export function normalizeOctoprintSettings(
  settings: Partial<OctoprintSettings> | null | undefined
): OctoprintSettings {
  const baseRaw = typeof settings?.baseUrl === 'string' ? settings.baseUrl.trim() : '';
  const hasScheme = /^https?:\/\//i.test(baseRaw);
  return {
    baseUrl: baseRaw ? (hasScheme ? baseRaw : `http://${baseRaw}`) : '',
    apiKey: typeof settings?.apiKey === 'string' ? settings.apiKey.trim() : '',
  };
}

export function loadBrowserOctoprintSettings(): OctoprintSettings {
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

export function saveBrowserOctoprintSettings(settings: Partial<OctoprintSettings>): void {
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
