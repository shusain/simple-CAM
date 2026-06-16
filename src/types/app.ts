import type { Point } from './common';
import type { Operation, SketchSegment } from './operations';

export interface OctoprintSettings {
  baseUrl: string;
  apiKey: string;
}

export interface SketchEditState {
  operationId: string | null;
  selectedSegmentIndex: number | null;
  isNewSketch: boolean;
}

export interface ZoomRequest {
  token: number;
  action: 'in' | 'out' | 'reset';
}

export interface PastePreview {
  operations: Operation[];
  anchor: Point;
}

export type TransformMode = 'move' | 'rotate' | 'scale';

export type TransformAxis = 'x' | 'y' | null;

export interface TransformSession {
  mode: TransformMode;
  axis: TransformAxis;
  input: string;
  sourceOperations: Operation[];
  operationIds: string[];
  pivot: Point;
  anchorPoint: Point;
  currentPoint: Point;
}

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface SketchHandle {
  kind: 'start' | 'end' | 'through';
  segmentIndex: number;
  point: Point;
}

export interface SelectBoxState {
  start: Point;
  current: Point;
}

export interface SketchDraft {
  type: 'sketch';
  startPoint: Point;
  segments: SketchSegment[];
  current: Point;
  pendingArcEnd: Point | null;
}

export interface LineDraft {
  type: 'line';
  start: Point;
  current: Point;
}

export interface RectDraft {
  type: 'rect';
  start: Point;
  current: Point;
}

export interface CircleDraft {
  type: 'circle';
  start: Point;
  current: Point;
}

export type DrawDraft = LineDraft | RectDraft | CircleDraft | SketchDraft;
