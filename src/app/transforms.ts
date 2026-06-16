import type { Operation, Point, TransformAxis, TransformMode, TransformSession } from '../types';
import { constrainDeltaToAxis, distance, getOperationsCenter, transformOperation } from '../utils/geometry';

export interface ResolvedTransform {
  dx: number;
  dy: number;
  angleRadians: number;
  scaleX: number;
  scaleY: number;
}

function parseNumericInput(input: string): number | null {
  if (!input.trim()) {
    return null;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

export function beginTransformSession(
  mode: TransformMode,
  operations: Operation[],
  operationIds: string[],
  anchorPoint: Point | null
): TransformSession | null {
  const pivot = getOperationsCenter(operations);
  if (!pivot) {
    return null;
  }

  const anchor = anchorPoint || { x: pivot.x, y: pivot.y };
  return {
    mode,
    axis: null,
    input: '',
    sourceOperations: operations.map((operation) => ({ ...operation })),
    operationIds: [...operationIds],
    pivot: { x: pivot.x, y: pivot.y },
    anchorPoint: anchor,
    currentPoint: anchor,
  };
}

export function resolveTransform(session: TransformSession): ResolvedTransform {
  const rawDelta = {
    x: session.currentPoint.x - session.anchorPoint.x,
    y: session.currentPoint.y - session.anchorPoint.y,
  };
  const axisDelta = constrainDeltaToAxis(rawDelta, session.axis);
  const numericValue = parseNumericInput(session.input);

  if (session.mode === 'move') {
    if (numericValue === null) {
      return {
        dx: axisDelta.x,
        dy: axisDelta.y,
        angleRadians: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    if (session.axis === 'x') {
      return {
        dx: numericValue,
        dy: 0,
        angleRadians: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    if (session.axis === 'y') {
      return {
        dx: 0,
        dy: numericValue,
        angleRadians: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    const length = Math.sqrt(rawDelta.x * rawDelta.x + rawDelta.y * rawDelta.y);
    const direction =
      length <= 0.000001
        ? { x: 1, y: 0 }
        : {
            x: rawDelta.x / length,
            y: rawDelta.y / length,
          };
    return {
      dx: direction.x * numericValue,
      dy: direction.y * numericValue,
      angleRadians: 0,
      scaleX: 1,
      scaleY: 1,
    };
  }

  if (session.mode === 'rotate') {
    if (numericValue !== null) {
      return {
        dx: 0,
        dy: 0,
        angleRadians: (numericValue * Math.PI) / 180,
        scaleX: 1,
        scaleY: 1,
      };
    }

    const startAngle = Math.atan2(session.anchorPoint.y - session.pivot.y, session.anchorPoint.x - session.pivot.x);
    const currentAngle = Math.atan2(session.currentPoint.y - session.pivot.y, session.currentPoint.x - session.pivot.x);

    return {
      dx: 0,
      dy: 0,
      angleRadians: currentAngle - startAngle,
      scaleX: 1,
      scaleY: 1,
    };
  }

  if (numericValue !== null) {
    if (session.axis === 'x') {
      return {
        dx: 0,
        dy: 0,
        angleRadians: 0,
        scaleX: numericValue,
        scaleY: 1,
      };
    }
    if (session.axis === 'y') {
      return {
        dx: 0,
        dy: 0,
        angleRadians: 0,
        scaleX: 1,
        scaleY: numericValue,
      };
    }
    return {
      dx: 0,
      dy: 0,
      angleRadians: 0,
      scaleX: numericValue,
      scaleY: numericValue,
    };
  }

  if (session.axis === 'x') {
    const startDx = session.anchorPoint.x - session.pivot.x;
    const currentDx = session.currentPoint.x - session.pivot.x;
    const factor = Math.abs(startDx) <= 0.000001 ? 1 : currentDx / startDx;
    return {
      dx: 0,
      dy: 0,
      angleRadians: 0,
      scaleX: factor,
      scaleY: 1,
    };
  }

  if (session.axis === 'y') {
    const startDy = session.anchorPoint.y - session.pivot.y;
    const currentDy = session.currentPoint.y - session.pivot.y;
    const factor = Math.abs(startDy) <= 0.000001 ? 1 : currentDy / startDy;
    return {
      dx: 0,
      dy: 0,
      angleRadians: 0,
      scaleX: 1,
      scaleY: factor,
    };
  }

  const startDistance = distance(session.anchorPoint, session.pivot);
  const currentDistance = distance(session.currentPoint, session.pivot);
  const factor = startDistance <= 0.000001 ? 1 : currentDistance / startDistance;
  return {
    dx: 0,
    dy: 0,
    angleRadians: 0,
    scaleX: factor,
    scaleY: factor,
  };
}

export function buildTransformPreview(session: TransformSession, circleSegments = 48): Operation[] {
  const resolved = resolveTransform(session);
  return session.sourceOperations.map((operation) =>
    transformOperation(operation, {
      ...resolved,
      pivot: session.pivot,
      circleSegments,
    }) as Operation
  );
}

export function formatTransformStatus(session: TransformSession): string {
  const axisText = session.axis ? ` ${session.axis.toUpperCase()}` : '';
  const inputText = session.input ? ` [${session.input}]` : '';
  const modeLabel = session.mode === 'move' ? 'Grab' : session.mode === 'rotate' ? 'Rotate' : 'Scale';
  if (session.mode === 'rotate') {
    return `${modeLabel}${inputText} | move mouse, type degrees, Enter confirm, Esc cancel`;
  }
  return `${modeLabel}${axisText}${inputText} | move mouse, X/Y axis lock, type value, Enter confirm, Esc cancel`;
}

export function isTransformInputKey(key: string): boolean {
  return /^[0-9.\-]$/.test(key);
}

export function normalizeTransformAxis(
  mode: TransformMode,
  currentAxis: TransformAxis,
  requestedAxis: Exclude<TransformAxis, null>
): TransformAxis {
  if (mode === 'rotate') {
    return null;
  }
  return currentAxis === requestedAxis ? null : requestedAxis;
}
