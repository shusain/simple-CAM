import type { CutSide } from './common';

export interface BaseOperation {
  id: string;
  depth: number;
  toolId?: string;
  materialId?: string;
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

export interface RectOperation extends BaseOperation, TabbedCutFields {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
  cutSide: CutSide;
}

export interface CircleOperation extends BaseOperation, TabbedCutFields {
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

export interface SketchOperation extends BaseOperation, TabbedCutFields {
  type: 'sketch';
  segments: SketchSegment[];
  closed: boolean;
  cutSide: CutSide;
}

export type Operation =
  | DrillOperation
  | LineOperation
  | RectOperation
  | CircleOperation
  | SketchOperation;
