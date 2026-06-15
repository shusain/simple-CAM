import type { MachineSettings } from '../../types';

export function num(value: number, digits = 3): string {
  return Number(value).toFixed(digits);
}

export function toNegativeDepth(value: number, fallbackDepth: number): number {
  const source = Number.isFinite(value) ? Number(value) : Number(fallbackDepth);
  const finite = Number.isFinite(source) ? source : -1;
  return finite <= 0 ? finite : -finite;
}

export function toPositiveStep(value: number, fallbackStep: number): number {
  const source = Number.isFinite(value) ? Number(value) : Number(fallbackStep);
  const finite = Number.isFinite(source) ? Math.abs(source) : Math.abs(fallbackStep || 1);
  return Math.max(0.001, finite);
}

export function buildIncrementDepths(targetNegativeDepth: number, increment: number): number[] {
  const target = Math.abs(targetNegativeDepth);
  const step = toPositiveStep(increment, target || 1);

  const depths: number[] = [];
  let current = 0;

  while (current < target) {
    current = Math.min(target, current + step);
    depths.push(-current);
  }

  if (depths.length === 0) {
    depths.push(targetNegativeDepth);
  }

  return depths;
}

export function getStartEndZ(settings: MachineSettings): number {
  const value = Number(settings.startEndZ);
  if (Number.isFinite(value)) {
    return value;
  }
  return Number(settings.safeZ) || 5;
}
