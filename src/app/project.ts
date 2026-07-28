import type { CamProjectFile, ImportedMesh, MachineSettings, Material, Operation, Tool } from '../types';
import { sanitizeOperation } from '../utils/geometry';
import { normalizeMaterial, normalizeTool, resolveMaterialId } from '../utils/tooling';
import { DEFAULT_MATERIALS, DEFAULT_SETTINGS, DEFAULT_TOOLS } from './defaults';

export const CURRENT_PROJECT_VERSION = 2;

export interface HydratedProjectData {
  settings: MachineSettings;
  materials: Material[];
  tools: Tool[];
  activeToolId: string;
  operations: Operation[];
  importedMeshes: ImportedMesh[];
}

function sanitizeImportedMesh(raw: unknown): ImportedMesh | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Partial<ImportedMesh>;
  if (!Array.isArray(data.triangles) || data.triangles.length === 0) {
    return null;
  }

  const triangles = data.triangles
    .map((triangle) => {
      if (!triangle || typeof triangle !== 'object') {
        return null;
      }
      const a = (triangle as ImportedMesh['triangles'][number]).a;
      const b = (triangle as ImportedMesh['triangles'][number]).b;
      const c = (triangle as ImportedMesh['triangles'][number]).c;
      const points = [a, b, c].map((point) =>
        point &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.z)
          ? { x: Number(point.x), y: Number(point.y), z: Number(point.z) }
          : null
      );
      if (points.some((point) => point === null)) {
        return null;
      }
      return {
        a: points[0]!,
        b: points[1]!,
        c: points[2]!,
      };
    })
    .filter((triangle): triangle is ImportedMesh['triangles'][number] => Boolean(triangle));

  if (triangles.length === 0) {
    return null;
  }

  const localBounds = data.localBounds;
  if (
    !localBounds ||
    !Number.isFinite(localBounds.minX) ||
    !Number.isFinite(localBounds.maxX) ||
    !Number.isFinite(localBounds.minY) ||
    !Number.isFinite(localBounds.maxY) ||
    !Number.isFinite(localBounds.minZ) ||
    !Number.isFinite(localBounds.maxZ)
  ) {
    return null;
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : '',
    type: 'stl',
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported STL',
    filePath: typeof data.filePath === 'string' && data.filePath ? data.filePath : undefined,
    units: 'mm',
    triangleCount: Number.isFinite(data.triangleCount) ? Number(data.triangleCount) : triangles.length,
    placement: {
      x: Number.isFinite(data.placement?.x) ? Number(data.placement?.x) : 0,
      y: Number.isFinite(data.placement?.y) ? Number(data.placement?.y) : 0,
    },
    localBounds: {
      minX: Number(localBounds.minX),
      maxX: Number(localBounds.maxX),
      minY: Number(localBounds.minY),
      maxY: Number(localBounds.maxY),
      minZ: Number(localBounds.minZ),
      maxZ: Number(localBounds.maxZ),
    },
    triangles,
  };
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
  const importedMeshes = Array.isArray(project.importedMeshes)
    ? project.importedMeshes
        .map((item) => sanitizeImportedMesh(item))
        .filter((item): item is ImportedMesh => Boolean(item))
        .map((item) => ({
          ...item,
          id: item.id || createId(),
        }))
    : [];

  return {
    settings,
    materials,
    tools,
    activeToolId,
    operations,
    importedMeshes,
  };
}

export function buildProjectFile(data: HydratedProjectData): CamProjectFile {
  return {
    version: CURRENT_PROJECT_VERSION,
    settings: data.settings,
    materials: data.materials,
    tools: data.tools,
    activeToolId: data.activeToolId,
    operations: data.operations,
    importedMeshes: data.importedMeshes,
  };
}
