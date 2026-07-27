import type { CutSide } from './common';

export interface BaseOperation {
  id: string;
  depth: number;
  toolId?: string;
  materialId?: string;
  laserProcess?: 'cut' | 'etch';
  laserPower?: number;
  laserSpeed?: number;
  laserPasses?: number;
  laserLineInterval?: number;
  laserOverscan?: number;
}

export interface DrillOperation extends BaseOperation {
  type: 'drill';
  x: number;
  y: number;
}

export interface LineOperation extends BaseOperation {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TabbedCutFields {
  tabsEnabled: boolean;
  tabCount: number;
  tabWidth: number;
  tabHeight: number;
}

export interface PocketFields {
  pocketEnabled: boolean;
  pocketStepOver: number;
}

export interface RectOperation extends BaseOperation, TabbedCutFields, PocketFields {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
  cutSide: CutSide;
}

export interface CircleOperation extends BaseOperation, TabbedCutFields, PocketFields {
  type: 'circle';
  x: number;
  y: number;
  radius: number;
  cutSide: CutSide;
}

export interface SketchLineSegment {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SketchArcSegment {
  type: 'arc';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  throughX: number;
  throughY: number;
}

export type SketchSegment = SketchLineSegment | SketchArcSegment;

export interface SketchOperation extends BaseOperation, TabbedCutFields, PocketFields {
  type: 'sketch';
  segments: SketchSegment[];
  closed: boolean;
  cutSide: CutSide;
}

export interface TextOperation extends BaseOperation, TabbedCutFields, PocketFields {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontId: string;
  fontSize: number;
  lineHeight: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  cutSide: CutSide;
}

export interface SurfaceOperationBase extends BaseOperation {
  meshId: string;
  stepOver: number;
}

export interface SurfaceRoughOperation extends SurfaceOperationBase {
  type: 'surface-rough';
  stockToLeave: number;
}

export interface SurfaceFinishOperation extends SurfaceOperationBase {
  type: 'surface-finish';
  pattern: 'x' | 'y' | 'crosshatch';
}

export type PathOperation =
  | LineOperation
  | RectOperation
  | CircleOperation
  | SketchOperation
  | TextOperation;

export type SurfaceOperation =
  | SurfaceRoughOperation
  | SurfaceFinishOperation;

export type Operation =
  | DrillOperation
  | PathOperation
  | SurfaceOperation;

export type OperationInput =
  | Omit<DrillOperation, 'id'>
  | Omit<LineOperation, 'id'>
  | Omit<RectOperation, 'id'>
  | Omit<CircleOperation, 'id'>
  | Omit<SketchOperation, 'id'>
  | Omit<TextOperation, 'id'>
  | Omit<SurfaceRoughOperation, 'id'>
  | Omit<SurfaceFinishOperation, 'id'>;

export function isSurfaceOperation(
  operation: Operation | null | undefined
): operation is SurfaceOperation {
  return operation?.type === 'surface-rough' || operation?.type === 'surface-finish';
}

export function isPathOperation(
  operation: Operation | null | undefined
): operation is PathOperation {
  return (
    operation?.type === 'line' ||
    operation?.type === 'rect' ||
    operation?.type === 'circle' ||
    operation?.type === 'sketch' ||
    operation?.type === 'text'
  );
}
