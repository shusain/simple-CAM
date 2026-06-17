import type { ImportedMesh, Material, MachineSettings, OctoprintSettings, Operation, Tool } from '../types';
import type { getOperationBounds } from '../utils/geometry';

export interface PreferencesData {
  settings?: Partial<MachineSettings>;
  materials?: Material[];
  tools?: Tool[];
  activeToolId?: string;
}

export interface InitialState {
  settings: MachineSettings;
  materials: Material[];
  tools: Tool[];
  activeToolId: string;
  importedMeshes: ImportedMesh[];
}

export interface SelectOptions {
  additive?: boolean;
  toggle?: boolean;
}

export interface RepeatArgs {
  count: number;
  offsetX: number;
  offsetY: number;
}

export interface MoveSelectedOperationsArgs {
  ids: string[];
  sourceOperations: Operation[];
  dx: number;
  dy: number;
}

export type OperationsUpdater = Operation[] | ((current: Operation[]) => Operation[]);
export type OperationUpdates = Partial<Operation>;
export type OperationBounds = NonNullable<ReturnType<typeof getOperationBounds>>;

export interface OctoprintSettingsModalProps {
  isOpen: boolean;
  settings: OctoprintSettings;
  onClose: () => void;
  onSave: (settings: OctoprintSettings) => void;
}
