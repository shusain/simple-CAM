import type { Operation } from './operations';
import type { Material, MachineSettings, Tool } from './tooling';

export interface CamProjectFile {
  version: number;
  settings: MachineSettings;
  materials: Material[];
  tools: Tool[];
  activeToolId: string;
  operations: Operation[];
}
