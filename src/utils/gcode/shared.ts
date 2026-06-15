import type { CircleOperation, LineOperation, RectOperation, SketchOperation } from '../../types';

export type TabRange = { start: number; end: number };

export type PathOperation = LineOperation | RectOperation | CircleOperation | SketchOperation;
