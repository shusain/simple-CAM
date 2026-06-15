import type {
  MachineSettings,
  Material,
  Tool,
  ToolMaterialProfile,
  ToolPreset,
} from '../types';

type RawRecord = Record<string, unknown>;

function toPositiveNumber(value: unknown, fallback: number | null): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function sanitizeId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function sanitizeMaterialId(value: unknown): string | undefined {
  return sanitizeId(value);
}

export function sanitizeToolId(value: unknown): string | undefined {
  return sanitizeId(value);
}

export function normalizeMaterial(material: Partial<Material> | null | undefined, fallbackId: string): Material {
  return {
    id: sanitizeMaterialId(material?.id) || fallbackId,
    name:
      typeof material?.name === 'string' && material.name.trim()
        ? material.name.trim()
        : 'Material',
  };
}

export function normalizeMaterialProfile(profile: unknown): ToolMaterialProfile | null {
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  const data = profile as RawRecord;
  const cutFeedRate = toPositiveNumber(data.cutFeedRate, null);
  const plungeFeedRate = toPositiveNumber(data.plungeFeedRate, null);
  const drillDepthPerPass = toPositiveNumber(data.drillDepthPerPass, null);
  const cutDepthPerPass = toPositiveNumber(data.cutDepthPerPass, null);

  if (
    cutFeedRate === null &&
    plungeFeedRate === null &&
    drillDepthPerPass === null &&
    cutDepthPerPass === null
  ) {
    return null;
  }

  return {
    cutFeedRate,
    plungeFeedRate,
    drillDepthPerPass,
    cutDepthPerPass,
  };
}

export function normalizeTool(tool: Partial<Tool> | null | undefined, fallbackId: string): Tool {
  const rawProfiles = tool?.materialProfiles;
  const materialProfiles: Record<string, ToolMaterialProfile> =
    rawProfiles && typeof rawProfiles === 'object'
      ? Object.fromEntries(
          Object.entries(rawProfiles)
            .map(([materialId, profile]) => [sanitizeMaterialId(materialId), normalizeMaterialProfile(profile)])
            .filter((entry): entry is [string, ToolMaterialProfile] => Boolean(entry[0] && entry[1]))
        )
      : {};

  return {
    id: sanitizeToolId(tool?.id) || fallbackId,
    name: tool?.name || 'Tool',
    diameter: toPositiveNumber(tool?.diameter, 3) ?? 3,
    rapidFeedRate: toPositiveNumber(tool?.rapidFeedRate, 2400) ?? 2400,
    cutFeedRate: toPositiveNumber(tool?.cutFeedRate, 600) ?? 600,
    plungeFeedRate: toPositiveNumber(tool?.plungeFeedRate, 220) ?? 220,
    materialProfiles,
  };
}

export function findMaterial(materials: Material[] | null | undefined, materialId: string | null | undefined): Material | null {
  if (!Array.isArray(materials) || materials.length === 0) {
    return null;
  }

  return materials.find((material) => material.id === materialId) || null;
}

export function resolveMaterialId(
  materials: Material[] | null | undefined,
  materialId: string | null | undefined,
  fallbackId: string | null | undefined
): string | null {
  if (findMaterial(materials, materialId)) {
    return materialId || null;
  }

  if (findMaterial(materials, fallbackId)) {
    return fallbackId || null;
  }

  return materials?.[0]?.id || fallbackId || null;
}

export function getToolMaterialProfile(tool: Tool | null | undefined, materialId: string | null | undefined): ToolMaterialProfile | null {
  if (!tool?.materialProfiles || !materialId) {
    return null;
  }

  return normalizeMaterialProfile(tool.materialProfiles[materialId]);
}

export function resolveToolPreset(
  tool: Tool | null | undefined,
  materialId: string | null | undefined,
  settings: Partial<MachineSettings> = {}
): ToolPreset {
  const profile = getToolMaterialProfile(tool, materialId);

  return {
    rapidFeedRate: tool?.rapidFeedRate ?? settings.rapidFeedRate ?? 2400,
    cutFeedRate: profile?.cutFeedRate ?? tool?.cutFeedRate ?? settings.cutFeedRate ?? 600,
    plungeFeedRate: profile?.plungeFeedRate ?? tool?.plungeFeedRate ?? settings.plungeFeedRate ?? 220,
    drillDepthPerPass: profile?.drillDepthPerPass ?? 1,
    cutDepthPerPass: profile?.cutDepthPerPass ?? 1,
  };
}
