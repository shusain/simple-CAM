export interface MachineSettings {
  workWidth: number;
  workHeight: number;
  marginX: number;
  marginY: number;
  gridSize: number;
  snapEnabled: boolean;
  activeMaterialId: string;
  safeZ: number;
  startEndZ: number;
  drillDepth: number;
  cutDepth: number;
  rapidFeedRate: number;
  cutFeedRate: number;
  plungeFeedRate: number;
  spindleOn: boolean;
  spindleSpeed: number;
  circleSegments: number;
}

export interface Material {
  id: string;
  name: string;
}

export interface ToolMaterialProfile {
  cutFeedRate: number | null;
  plungeFeedRate: number | null;
  drillDepthPerPass: number | null;
  cutDepthPerPass: number | null;
}

export interface ToolPreset {
  rapidFeedRate: number;
  cutFeedRate: number;
  plungeFeedRate: number;
  drillDepthPerPass: number;
  cutDepthPerPass: number;
}

export interface Tool {
  id: string;
  name: string;
  diameter: number;
  rapidFeedRate: number;
  cutFeedRate: number;
  plungeFeedRate: number;
  materialProfiles: Record<string, ToolMaterialProfile>;
}
