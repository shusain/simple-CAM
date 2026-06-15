import type { Material, Operation, Tool } from '../../types';

export interface RepeatArgs {
  count: number;
  offsetX: number;
  offsetY: number;
}

export interface OperationsPanelProps {
  operations: Operation[];
  selectedOperation: Operation | null;
  selectedOperationIds: string[];
  materials: Material[];
  tools: Tool[];
  onSelectOperation: (id: string | null, options?: { additive?: boolean; toggle?: boolean }) => void;
  onUpdateOperation: (id: string, updates: Partial<Operation>) => void;
  onDeleteOperation: (id: string) => void;
  onDeleteSelection: () => void;
  onMoveOperation: (id: string, direction: number) => void;
  onRepeatOperation: (args: RepeatArgs) => void;
  isEditingSelectedSketch: boolean;
  selectedSketchSegmentIndex: number | null;
  onStartSketchEdit: () => void;
  onStopSketchEdit: () => void;
  onDeleteSelectedSketchSegment: () => void;
}
