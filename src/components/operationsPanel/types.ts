import type { ImportedMesh, Material, Operation, Tool } from '../../types';

export interface RepeatArgs {
  count: number;
  offsetX: number;
  offsetY: number;
}

export interface OperationsPanelProps {
  operations: Operation[];
  importedMeshes: ImportedMesh[];
  workWidth: number;
  workHeight: number;
  selectedOperation: Operation | null;
  selectedImportedMesh: ImportedMesh | null;
  selectedOperationIds: string[];
  materials: Material[];
  tools: Tool[];
  onSelectOperation: (id: string | null, options?: { additive?: boolean; toggle?: boolean; range?: boolean }) => void;
  onSelectImportedMesh: (id: string | null) => void;
  onCreateSurfaceRoughOperation: (meshId: string) => void;
  onCreateSurfaceFinishOperation: (meshId: string) => void;
  onUpdateOperation: (id: string, updates: Partial<Operation>) => void;
  onConvertDrillToCircle: (id: string) => void;
  onUpdateImportedMesh: (id: string, updates: Partial<ImportedMesh>) => void;
  onDeleteImportedMesh: (id: string) => void;
  onDeleteOperation: (id: string) => void;
  onDeleteSelection: () => void;
  onMoveOperation: (id: string, direction: number) => void;
  onMoveOperationToEdge: (id: string, edge: 'top' | 'bottom') => void;
  onRepeatOperation: (args: RepeatArgs) => void;
  isEditingSelectedSketch: boolean;
  selectedSketchSegmentIndex: number | null;
  onStartSketchEdit: () => void;
  onStopSketchEdit: () => void;
  onDeleteSelectedSketchSegment: () => void;
}
