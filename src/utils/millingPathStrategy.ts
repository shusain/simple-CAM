import type { PathOperation, Tool } from '../types';
import {
  getMillingToolHeightAtRadius,
  getMillingToolMaxUsableDepth,
  getMillingToolRadiusAtHeight,
} from './millingToolGeometry';

export interface VGroovePlan {
  strategy: 'v-groove';
  valid: boolean;
  targetWidth: number;
  actualWidth: number;
  finalDepth: number;
  maximumDepth: number;
  limitedByDepth: boolean;
  issue: string | null;
}

export interface ChamferEdgePlan {
  strategy: 'chamfer-edge';
  valid: boolean;
  targetWidth: number;
  actualWidth: number;
  finalDepth: number;
  maximumDepth: number;
  compensationRadius: number;
  limitedByDepth: boolean;
  issue: string | null;
}

export type MillingPathPlan = VGroovePlan | ChamferEdgePlan;

function positiveMagnitude(value: unknown, fallback: number): number {
  const numeric = Math.abs(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Math.abs(fallback);
}

function normalizeDerivedDimension(value: number): number {
  return Number(value.toFixed(12));
}

export function resolveVGroovePlan(
  operation: PathOperation,
  tool: Tool | null | undefined,
  fallbackDepth: number
): VGroovePlan | null {
  if (operation.millingStrategy !== 'v-groove') {
    return null;
  }

  const targetWidth = Number(operation.millingTargetWidth);
  const operationDepth = positiveMagnitude(operation.depth, fallbackDepth);

  if (!tool || tool.isLaser || tool.millingGeometry.type !== 'v-bit') {
    return {
      strategy: 'v-groove',
      valid: false,
      targetWidth: Number.isFinite(targetWidth) ? targetWidth : 0,
      actualWidth: 0,
      finalDepth: 0,
      maximumDepth: 0,
      limitedByDepth: false,
      issue: 'V-groove strategy requires a V-bit milling tool.',
    };
  }

  const tipDiameter = tool.millingGeometry.tipDiameter;
  const usableDepth = getMillingToolMaxUsableDepth(tool);
  const maximumDepth = Math.min(operationDepth, usableDepth);

  if (!Number.isFinite(targetWidth) || targetWidth <= tipDiameter + 1e-6) {
    return {
      strategy: 'v-groove',
      valid: false,
      targetWidth: Number.isFinite(targetWidth) ? targetWidth : 0,
      actualWidth: tipDiameter,
      finalDepth: 0,
      maximumDepth,
      limitedByDepth: false,
      issue: `Groove width must be greater than the ${tipDiameter} mm tip diameter.`,
    };
  }

  if (maximumDepth <= 0) {
    return {
      strategy: 'v-groove',
      valid: false,
      targetWidth,
      actualWidth: tipDiameter,
      finalDepth: 0,
      maximumDepth,
      limitedByDepth: false,
      issue: 'V-groove maximum depth must be greater than zero.',
    };
  }

  const desiredRadius = targetWidth / 2;
  const requiredDepth = getMillingToolHeightAtRadius(tool, desiredRadius);
  const finalDepthMagnitude = Math.min(requiredDepth, maximumDepth);
  const actualWidth = getMillingToolRadiusAtHeight(tool, finalDepthMagnitude) * 2;
  const limitedByDepth = actualWidth < targetWidth - 1e-6;

  return {
    strategy: 'v-groove',
    valid: true,
    targetWidth,
    actualWidth,
    finalDepth: -finalDepthMagnitude,
    maximumDepth,
    limitedByDepth,
    issue: limitedByDepth
      ? `The configured depth limit produces a ${Number(
          actualWidth.toFixed(3)
        )} mm groove instead of ${Number(targetWidth.toFixed(3))} mm.`
      : null,
  };
}

export function applyVGroovePlan(
  operation: PathOperation,
  plan: VGroovePlan
): PathOperation {
  const planned = {
    ...operation,
    depth: plan.finalDepth,
  } as PathOperation;

  if ('cutSide' in planned) {
    planned.cutSide = 'along';
  }
  if ('pocketEnabled' in planned) {
    planned.pocketEnabled = false;
  }
  if ('tabsEnabled' in planned) {
    planned.tabsEnabled = false;
  }

  return planned;
}

export function getDefaultVGrooveWidth(
  operation: PathOperation,
  tool: Tool,
  fallbackDepth: number
): number {
  const maximumDepth = Math.min(
    positiveMagnitude(operation.depth, fallbackDepth),
    getMillingToolMaxUsableDepth(tool)
  );
  return getMillingToolRadiusAtHeight(tool, maximumDepth) * 2;
}

export function resolveChamferEdgePlan(
  operation: PathOperation,
  tool: Tool | null | undefined,
  fallbackDepth: number
): ChamferEdgePlan | null {
  if (operation.millingStrategy !== 'chamfer-edge') {
    return null;
  }

  const targetWidth = Number(operation.millingTargetWidth);
  const operationDepth = positiveMagnitude(operation.depth, fallbackDepth);

  if (!tool || tool.isLaser || tool.millingGeometry.type !== 'chamfer') {
    return {
      strategy: 'chamfer-edge',
      valid: false,
      targetWidth: Number.isFinite(targetWidth) ? targetWidth : 0,
      actualWidth: 0,
      finalDepth: 0,
      maximumDepth: 0,
      compensationRadius: 0,
      limitedByDepth: false,
      issue: 'Chamfer-edge strategy requires a chamfer milling tool.',
    };
  }

  const cutSide = 'cutSide' in operation ? operation.cutSide : 'along';
  const closed =
    operation.type === 'rect' ||
    operation.type === 'circle' ||
    operation.type === 'text' ||
    (operation.type === 'sketch' && operation.closed);
  if (!closed || (cutSide !== 'inside' && cutSide !== 'outside')) {
    return {
      strategy: 'chamfer-edge',
      valid: false,
      targetWidth: Number.isFinite(targetWidth) ? targetWidth : 0,
      actualWidth: 0,
      finalDepth: 0,
      maximumDepth: 0,
      compensationRadius: tool.millingGeometry.tipDiameter / 2,
      limitedByDepth: false,
      issue: 'Chamfer-edge strategy requires a closed inside or outside path.',
    };
  }

  const usableDepth = getMillingToolMaxUsableDepth(tool);
  const maximumDepth = Math.min(operationDepth, usableDepth);
  const compensationRadius = tool.millingGeometry.tipDiameter / 2;

  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    return {
      strategy: 'chamfer-edge',
      valid: false,
      targetWidth: Number.isFinite(targetWidth) ? targetWidth : 0,
      actualWidth: 0,
      finalDepth: 0,
      maximumDepth,
      compensationRadius,
      limitedByDepth: false,
      issue: 'Chamfer width must be greater than zero.',
    };
  }

  if (maximumDepth <= 0) {
    return {
      strategy: 'chamfer-edge',
      valid: false,
      targetWidth,
      actualWidth: 0,
      finalDepth: 0,
      maximumDepth,
      compensationRadius,
      limitedByDepth: false,
      issue: 'Chamfer maximum depth must be greater than zero.',
    };
  }

  const slope = Math.tan((tool.millingGeometry.includedAngle * Math.PI) / 360);
  const requiredDepth = slope > 0 ? targetWidth / slope : Number.POSITIVE_INFINITY;
  const finalDepthMagnitude = normalizeDerivedDimension(
    Math.min(requiredDepth, maximumDepth)
  );
  const actualWidth = normalizeDerivedDimension(finalDepthMagnitude * slope);
  const limitedByDepth = actualWidth < targetWidth - 1e-6;

  return {
    strategy: 'chamfer-edge',
    valid: true,
    targetWidth,
    actualWidth,
    finalDepth: -finalDepthMagnitude,
    maximumDepth,
    compensationRadius,
    limitedByDepth,
    issue: limitedByDepth
      ? `The configured depth limit produces a ${Number(
          actualWidth.toFixed(3)
        )} mm chamfer instead of ${Number(targetWidth.toFixed(3))} mm.`
      : null,
  };
}

export function getDefaultChamferWidth(
  operation: PathOperation,
  tool: Tool,
  fallbackDepth: number
): number {
  const maximumDepth = Math.min(
    positiveMagnitude(operation.depth, fallbackDepth),
    getMillingToolMaxUsableDepth(tool)
  );
  const slope = Math.tan((tool.millingGeometry.includedAngle * Math.PI) / 360);
  return normalizeDerivedDimension(maximumDepth * slope);
}

export function resolveMillingPathPlan(
  operation: PathOperation,
  tool: Tool | null | undefined,
  fallbackDepth: number
): MillingPathPlan | null {
  return (
    resolveVGroovePlan(operation, tool, fallbackDepth) ||
    resolveChamferEdgePlan(operation, tool, fallbackDepth)
  );
}

export function applyMillingPathPlan(
  operation: PathOperation,
  plan: MillingPathPlan
): PathOperation {
  if (plan.strategy === 'v-groove') {
    return applyVGroovePlan(operation, plan);
  }

  const planned = {
    ...operation,
    depth: plan.finalDepth,
  } as PathOperation;
  if ('pocketEnabled' in planned) {
    planned.pocketEnabled = false;
  }
  if ('tabsEnabled' in planned) {
    planned.tabsEnabled = false;
  }
  return planned;
}

export function getMillingPathCompensationTool(
  operation: PathOperation,
  tool: Tool | null
): Tool | null {
  if (
    operation.millingStrategy !== 'chamfer-edge' ||
    !tool ||
    tool.isLaser ||
    tool.millingGeometry.type !== 'chamfer'
  ) {
    return tool;
  }

  return {
    ...tool,
    diameter: tool.millingGeometry.tipDiameter,
  };
}
