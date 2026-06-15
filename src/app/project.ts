import type { CamProjectFile, MachineSettings, Material, Operation, Tool } from '../types';
import { sanitizeOperation } from '../utils/geometry';
import { normalizeMaterial, normalizeTool, resolveMaterialId } from '../utils/tooling';
import { DEFAULT_MATERIALS, DEFAULT_SETTINGS, DEFAULT_TOOLS } from './defaults';

export interface HydratedProjectData {
  settings: MachineSettings;
  materials: Material[];
  tools: Tool[];
  activeToolId: string;
  operations: Operation[];
}

export function hydrateProjectFile(project: CamProjectFile, createId: () => string): HydratedProjectData {
  const settings: MachineSettings = { ...DEFAULT_SETTINGS, ...(project.settings || {}) };

  const materialsRaw =
    Array.isArray(project.materials) && project.materials.length > 0 ? project.materials : DEFAULT_MATERIALS;
  const materials = materialsRaw.map((material, index) => normalizeMaterial(material, `material-${index}`));

  settings.activeMaterialId =
    resolveMaterialId(materials, settings.activeMaterialId, DEFAULT_SETTINGS.activeMaterialId) ||
    DEFAULT_SETTINGS.activeMaterialId;

  const toolsRaw = Array.isArray(project.tools) && project.tools.length > 0 ? project.tools : DEFAULT_TOOLS;
  const tools = toolsRaw.map((tool, index) => normalizeTool(tool, `tool-${index}`));

  const activeToolId =
    project.activeToolId && tools.some((tool) => tool.id === project.activeToolId)
      ? project.activeToolId
      : tools[0].id;

  const operationsSource = Array.isArray(project.operations) ? project.operations : [];
  const operations =
    operationsSource.length > 0
      ? operationsSource
          .map((item) => sanitizeOperation(item))
          .filter((item): item is Operation => Boolean(item))
          .map((item) => ({
            ...item,
            id: item.id || createId(),
            toolId:
              item.toolId && tools.some((tool) => tool.id === item.toolId)
                ? item.toolId
                : activeToolId,
            materialId: resolveMaterialId(materials, item.materialId, settings.activeMaterialId) || undefined,
          }))
      : [];

  return {
    settings,
    materials,
    tools,
    activeToolId,
    operations,
  };
}

export function buildProjectFile(data: HydratedProjectData): CamProjectFile {
  return {
    version: 1,
    settings: data.settings,
    materials: data.materials,
    tools: data.tools,
    activeToolId: data.activeToolId,
    operations: data.operations,
  };
}
