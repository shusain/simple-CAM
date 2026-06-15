import { getSketchSegments } from '../../utils/geometry';
import type {
  Material,
  Operation,
  SketchArcSegment,
  SketchLineSegment,
  SketchOperation,
  SketchSegment,
  Tool,
} from '../../types';

export function formatOperationLabel(operation: Operation): string {
  if (operation.type === 'drill') {
    return `Drill @ X${operation.x.toFixed(2)} Y${operation.y.toFixed(2)}`;
  }

  if (operation.type === 'line') {
    return `Line (${operation.x1.toFixed(1)}, ${operation.y1.toFixed(1)}) → (${operation.x2.toFixed(
      1
    )}, ${operation.y2.toFixed(1)})`;
  }

  if (operation.type === 'rect') {
    const cornerRadius = Math.max(0, Number(operation.cornerRadius) || 0);
    return `Rect ${Math.abs(operation.width).toFixed(1)} x ${Math.abs(operation.height).toFixed(1)} mm R${cornerRadius.toFixed(1)}`;
  }

  if (operation.type === 'circle') {
    return `Circle R${operation.radius.toFixed(2)} @ X${operation.x.toFixed(1)} Y${operation.y.toFixed(1)}`;
  }

  const segmentCount = getSketchSegments(operation).length + (operation.closed ? 1 : 0);
  return `Sketch ${operation.closed ? 'closed' : 'open'} (${segmentCount} segments)`;
}

export function getToolName(toolId: string | undefined, tools: Tool[]): string {
  const tool = tools.find((item) => item.id === toolId);
  return tool ? `${tool.name} (Ø${tool.diameter}mm)` : 'Unassigned tool';
}

export function getMaterialName(materialId: string | undefined, materials: Material[]): string {
  const material = materials.find((item) => item.id === materialId);
  return material ? material.name : 'Unassigned material';
}

export function updateSketchStart(
  operation: SketchOperation,
  updates: Partial<{ x: number; y: number }>,
  onUpdateOperation: (id: string, updates: Partial<Operation>) => void
): void {
  const segments = getSketchSegments(operation);
  if (segments.length === 0) return;

  const nextSegments: SketchSegment[] = segments.map((segment, index) => {
    if (index !== 0) {
      return segment;
    }

    return {
      ...segment,
      x1: updates.x ?? segment.x1,
      y1: updates.y ?? segment.y1,
    };
  });

  onUpdateOperation(operation.id, { segments: nextSegments });
}

export function updateSketchSegment(
  operation: SketchOperation,
  index: number,
  updates: Partial<SketchSegment>,
  onUpdateOperation: (id: string, updates: Partial<Operation>) => void
): void {
  const segments = getSketchSegments(operation);
  const next: SketchSegment[] = segments.map((segment, segmentIndex) => {
    if (segmentIndex !== index) {
      return segment;
    }

    if (segment.type === 'arc') {
      const arcUpdates = updates as Partial<SketchArcSegment>;
      return {
        type: 'arc',
        x1: arcUpdates.x1 ?? segment.x1,
        y1: arcUpdates.y1 ?? segment.y1,
        x2: arcUpdates.x2 ?? segment.x2,
        y2: arcUpdates.y2 ?? segment.y2,
        throughX: arcUpdates.throughX ?? segment.throughX,
        throughY: arcUpdates.throughY ?? segment.throughY,
      };
    }

    const lineUpdates = updates as Partial<SketchLineSegment>;
    return {
      type: 'line',
      x1: lineUpdates.x1 ?? segment.x1,
      y1: lineUpdates.y1 ?? segment.y1,
      x2: lineUpdates.x2 ?? segment.x2,
      y2: lineUpdates.y2 ?? segment.y2,
    };
  });

  onUpdateOperation(operation.id, { segments: next });
}
