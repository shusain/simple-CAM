function toPositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sanitizeId(value) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function sanitizeMaterialId(value) {
  return sanitizeId(value);
}

export function sanitizeToolId(value) {
  return sanitizeId(value);
}

export function normalizeMaterial(material, fallbackId) {
  return {
    id: sanitizeMaterialId(material?.id) || fallbackId,
    name:
      typeof material?.name === 'string' && material.name.trim()
        ? material.name.trim()
        : 'Material',
  };
}

export function normalizeMaterialProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  const rapidFeedRate = toPositiveNumber(profile.rapidFeedRate, null);
  const cutFeedRate = toPositiveNumber(profile.cutFeedRate, null);
  const plungeFeedRate = toPositiveNumber(profile.plungeFeedRate, null);
  const drillDepth = toFiniteNumber(profile.drillDepth, null);
  const cutDepthPerPass = toPositiveNumber(profile.cutDepthPerPass, null);

  if (
    rapidFeedRate === null &&
    cutFeedRate === null &&
    plungeFeedRate === null &&
    drillDepth === null &&
    cutDepthPerPass === null
  ) {
    return null;
  }

  return {
    rapidFeedRate,
    cutFeedRate,
    plungeFeedRate,
    drillDepth,
    cutDepthPerPass,
  };
}

export function normalizeTool(tool, fallbackId) {
  const rawProfiles = tool?.materialProfiles;
  const materialProfiles =
    rawProfiles && typeof rawProfiles === 'object'
      ? Object.fromEntries(
          Object.entries(rawProfiles)
            .map(([materialId, profile]) => [sanitizeMaterialId(materialId), normalizeMaterialProfile(profile)])
            .filter(([materialId, profile]) => Boolean(materialId && profile))
        )
      : {};

  return {
    id: sanitizeToolId(tool?.id) || fallbackId,
    name: tool?.name || 'Tool',
    diameter: toPositiveNumber(tool?.diameter, 3),
    rapidFeedRate: toPositiveNumber(tool?.rapidFeedRate, 2400),
    cutFeedRate: toPositiveNumber(tool?.cutFeedRate, 600),
    plungeFeedRate: toPositiveNumber(tool?.plungeFeedRate, 220),
    materialProfiles,
  };
}

export function findMaterial(materials, materialId) {
  if (!Array.isArray(materials) || materials.length === 0) {
    return null;
  }

  return materials.find((material) => material.id === materialId) || null;
}

export function resolveMaterialId(materials, materialId, fallbackId) {
  if (findMaterial(materials, materialId)) {
    return materialId;
  }

  if (findMaterial(materials, fallbackId)) {
    return fallbackId;
  }

  return materials?.[0]?.id || fallbackId || null;
}

export function getToolMaterialProfile(tool, materialId) {
  if (!tool?.materialProfiles || !materialId) {
    return null;
  }

  return normalizeMaterialProfile(tool.materialProfiles[materialId]);
}

export function resolveToolPreset(tool, materialId, settings = {}) {
  const profile = getToolMaterialProfile(tool, materialId);

  return {
    rapidFeedRate: profile?.rapidFeedRate ?? tool?.rapidFeedRate ?? settings.rapidFeedRate ?? 2400,
    cutFeedRate: profile?.cutFeedRate ?? tool?.cutFeedRate ?? settings.cutFeedRate ?? 600,
    plungeFeedRate: profile?.plungeFeedRate ?? tool?.plungeFeedRate ?? settings.plungeFeedRate ?? 220,
    drillDepth: profile?.drillDepth ?? settings.drillDepth ?? -1,
    cutDepthPerPass: profile?.cutDepthPerPass ?? settings.cutDepthPerPass ?? 1,
  };
}
