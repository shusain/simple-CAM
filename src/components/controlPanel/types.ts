import type { MachineSettings, Material, Tool, ToolMaterialProfile } from '../../types';

export interface NumberFieldProps {
  label: string;
  value: number;
  step?: number | 'any';
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

export interface ToolManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tools: Tool[];
  materials: Material[];
  settings: MachineSettings;
  activeToolId: string;
  activeMaterialId: string;
  onSelectTool: (toolId: string) => void;
  onAddTool: () => void;
  onUpdateTool: (toolId: string, updates: Partial<Tool>) => void;
  onUpdateToolMaterialProfile: (
    toolId: string,
    materialId: string,
    updates: Partial<ToolMaterialProfile>
  ) => void;
  onDeleteTool: (toolId: string) => void;
}

export interface MaterialManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: Material[];
  activeMaterialId: string;
  onSelectMaterial: (materialId: string) => void;
  onAddMaterial: () => void;
  onUpdateMaterial: (materialId: string, updates: Partial<Material>) => void;
  onDeleteMaterial: (materialId: string) => void;
}

export interface ControlPanelProps {
  settings: MachineSettings;
  onSettingsChange: (updates: Partial<MachineSettings>) => void;
  materials: Material[];
  tools: Tool[];
  activeToolId: string;
  activeMaterialId: string;
  onSelectTool: (toolId: string) => void;
  onSelectMaterial: (materialId: string) => void;
  onAddMaterial: () => void;
  onUpdateMaterial: (materialId: string, updates: Partial<Material>) => void;
  onDeleteMaterial: (materialId: string) => void;
  onAddTool: () => void;
  onUpdateTool: (toolId: string, updates: Partial<Tool>) => void;
  onUpdateToolMaterialProfile: (
    toolId: string,
    materialId: string,
    updates: Partial<ToolMaterialProfile>
  ) => void;
  onDeleteTool: (toolId: string) => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onImportSvg: () => void;
  onImportDxf: () => void;
  onImportStl: () => void;
  onSaveProject: () => void;
  onExportGcode: () => void;
  canSendToOctoprint: boolean;
  onSendToOctoprint: () => void;
  onSendAndRunOctoprint: () => void;
  operationCount: number;
  onApplyDepthSettingsToAll: () => void;
  onApplyMaterialToAll: () => void;
}
