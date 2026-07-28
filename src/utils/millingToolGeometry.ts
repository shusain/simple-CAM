import type { MillingToolGeometry, MillingToolType, Tool } from '../types';

const DEFAULT_INCLUDED_ANGLE = 60;
const DEFAULT_CHAMFER_ANGLE = 90;
const MIN_INCLUDED_ANGLE = 1;
const MAX_INCLUDED_ANGLE = 179;

type RawRecord = Record<string, unknown>;

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isMillingToolType(value: unknown): value is MillingToolType {
  return value === 'flat-end' || value === 'ball-nose' || value === 'v-bit' || value === 'chamfer';
}

export function getDefaultMillingToolGeometry(
  type: MillingToolType = 'flat-end',
  diameter = 3.175
): MillingToolGeometry {
  const safeDiameter = positiveNumber(diameter, 3.175);
  return {
    type,
    cuttingLength: Math.max(safeDiameter, safeDiameter * 4),
    tipDiameter: type === 'v-bit' || type === 'chamfer' ? Math.min(0.2, safeDiameter) : 0,
    includedAngle: type === 'chamfer' ? DEFAULT_CHAMFER_ANGLE : DEFAULT_INCLUDED_ANGLE,
  };
}

export function normalizeMillingToolGeometry(
  value: unknown,
  diameter: number
): MillingToolGeometry {
  const safeDiameter = positiveNumber(diameter, 3);
  const data = value && typeof value === 'object' ? (value as RawRecord) : {};
  const type = isMillingToolType(data.type) ? data.type : 'flat-end';
  const defaults = getDefaultMillingToolGeometry(type, safeDiameter);
  const tapered = type === 'v-bit' || type === 'chamfer';
  const cuttingLength = positiveNumber(data.cuttingLength, defaults.cuttingLength);

  return {
    type,
    cuttingLength: type === 'ball-nose' ? Math.max(safeDiameter / 2, cuttingLength) : cuttingLength,
    tipDiameter: tapered
      ? clamp(finiteNumber(data.tipDiameter, defaults.tipDiameter), 0, safeDiameter)
      : 0,
    includedAngle: tapered
      ? clamp(
          finiteNumber(data.includedAngle, defaults.includedAngle),
          MIN_INCLUDED_ANGLE,
          MAX_INCLUDED_ANGLE
        )
      : defaults.includedAngle,
  };
}

export function changeMillingToolType(
  geometry: MillingToolGeometry,
  type: MillingToolType,
  diameter: number
): MillingToolGeometry {
  return normalizeMillingToolGeometry(
    {
      ...geometry,
      type,
      tipDiameter:
        type === 'v-bit' || type === 'chamfer'
          ? geometry.tipDiameter || Math.min(0.2, Math.max(0.01, diameter))
          : 0,
      includedAngle:
        type === 'chamfer' && geometry.type !== 'chamfer'
          ? DEFAULT_CHAMFER_ANGLE
          : type === 'v-bit' && geometry.type !== 'v-bit'
            ? DEFAULT_INCLUDED_ANGLE
            : geometry.includedAngle,
    },
    diameter
  );
}

export function getMillingToolTypeLabel(type: MillingToolType): string {
  switch (type) {
    case 'ball-nose':
      return 'Ball nose';
    case 'v-bit':
      return 'V-bit / V-carve';
    case 'chamfer':
      return 'Chamfer mill';
    default:
      return 'Flat end mill';
  }
}

function formatValue(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function formatMillingToolGeometrySummary(
  tool: Pick<Tool, 'diameter' | 'millingGeometry'>
): string {
  const diameter = Math.max(0, Number(tool.diameter) || 0);
  const geometry = normalizeMillingToolGeometry(tool.millingGeometry, diameter);
  const label = getMillingToolTypeLabel(geometry.type);

  if (geometry.type === 'v-bit' || geometry.type === 'chamfer') {
    return `${label} · max Ø${formatValue(diameter)} mm · tip Ø${formatValue(
      geometry.tipDiameter
    )} mm · ${formatValue(geometry.includedAngle)}° included · ${formatValue(
      getMillingToolMaxUsableDepth({ diameter, millingGeometry: geometry })
    )} mm usable depth`;
  }

  if (geometry.type === 'ball-nose') {
    return `${label} · Ø${formatValue(diameter)} mm · R${formatValue(
      diameter / 2
    )} mm · ${formatValue(geometry.cuttingLength)} mm cutting length`;
  }

  return `${label} · Ø${formatValue(diameter)} mm · ${formatValue(
    geometry.cuttingLength
  )} mm cutting length`;
}

export function getMillingToolMaxUsableDepth(tool: Pick<Tool, 'diameter' | 'millingGeometry'>): number {
  const diameter = Math.max(0, Number(tool.diameter) || 0);
  const geometry = normalizeMillingToolGeometry(tool.millingGeometry, diameter);
  if (geometry.type !== 'v-bit' && geometry.type !== 'chamfer') {
    return geometry.cuttingLength;
  }

  const radialGrowth = Math.max(0, (diameter - geometry.tipDiameter) / 2);
  const slope = Math.tan((geometry.includedAngle * Math.PI) / 360);
  const profileDepth = slope > 0 ? radialGrowth / slope : 0;
  return Math.min(geometry.cuttingLength, profileDepth);
}

/**
 * Returns the cutter radius at an axial height measured upward from the tool tip.
 * Values beyond the usable cutting profile are clamped to that profile.
 */
export function getMillingToolRadiusAtHeight(
  tool: Pick<Tool, 'diameter' | 'millingGeometry'>,
  axialHeight: number
): number {
  const diameter = Math.max(0, Number(tool.diameter) || 0);
  const maxRadius = diameter / 2;
  const geometry = normalizeMillingToolGeometry(tool.millingGeometry, diameter);
  const height = clamp(
    finiteNumber(axialHeight, 0),
    0,
    getMillingToolMaxUsableDepth({ diameter, millingGeometry: geometry })
  );

  if (geometry.type === 'flat-end') {
    return maxRadius;
  }

  if (geometry.type === 'ball-nose') {
    const ballRadius = maxRadius;
    if (height >= ballRadius) {
      return ballRadius;
    }
    return Math.sqrt(Math.max(0, 2 * ballRadius * height - height * height));
  }

  const tipRadius = geometry.tipDiameter / 2;
  const slope = Math.tan((geometry.includedAngle * Math.PI) / 360);
  return Math.min(maxRadius, tipRadius + height * slope);
}

/**
 * Inverse of the radial cutter profile: axial height above the tip at a radius
 * from the tool centerline.
 */
export function getMillingToolHeightAtRadius(
  tool: Pick<Tool, 'diameter' | 'millingGeometry'>,
  radialDistance: number
): number {
  const diameter = Math.max(0, Number(tool.diameter) || 0);
  const maxRadius = diameter / 2;
  const geometry = normalizeMillingToolGeometry(tool.millingGeometry, diameter);
  const radius = clamp(finiteNumber(radialDistance, 0), 0, maxRadius);

  if (geometry.type === 'flat-end') {
    return 0;
  }

  if (geometry.type === 'ball-nose') {
    return Math.min(
      geometry.cuttingLength,
      maxRadius - Math.sqrt(Math.max(0, maxRadius * maxRadius - radius * radius))
    );
  }

  const tipRadius = geometry.tipDiameter / 2;
  if (radius <= tipRadius) {
    return 0;
  }
  const slope = Math.tan((geometry.includedAngle * Math.PI) / 360);
  return Math.min(
    getMillingToolMaxUsableDepth({ diameter, millingGeometry: geometry }),
    slope > 0 ? (radius - tipRadius) / slope : 0
  );
}

/**
 * Radius where a tapered cutter intersects the original stock surface at the
 * requested penetration depth.
 */
export function getMillingToolEffectiveRadiusAtDepth(
  tool: Pick<Tool, 'diameter' | 'millingGeometry'>,
  depth: number
): number {
  return getMillingToolRadiusAtHeight(tool, Math.abs(finiteNumber(depth, 0)));
}
