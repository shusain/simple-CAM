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
  rapidFeedRateZ: number;
  cutFeedRate: number;
  plungeFeedRate: number;
  spindleOn: boolean;
  spindleSpeed: number;
  circleSegments: number;
  startGcode: string;
  endGcode: string;
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
  laserKerfDiameter?: number | null;
  laserCutSpeedMin?: number | null;
  laserCutSpeedMax?: number | null;
  laserCutPowerMin?: number | null;
  laserCutPowerMax?: number | null;
  laserEtchSpeedMin?: number | null;
  laserEtchSpeedMax?: number | null;
  laserEtchPowerMin?: number | null;
  laserEtchPowerMax?: number | null;
}

export interface ToolPreset {
  rapidFeedRate: number;
  cutFeedRate: number;
  plungeFeedRate: number;
  drillDepthPerPass: number;
  cutDepthPerPass: number;
}

export interface LaserMaterialPreset {
  kerfDiameter: number;
  cutSpeedMin: number;
  cutSpeedMax: number;
  cutPowerMin: number;
  cutPowerMax: number;
  etchSpeedMin: number;
  etchSpeedMax: number;
  etchPowerMin: number;
  etchPowerMax: number;
}

export interface LaserTestPatternOptions {
  process: 'cut' | 'etch';
  speedMin: number;
  speedMax: number;
  powerMin: number;
  powerMax: number;
  columns: number;
  rows: number;
  rectangleWidth: number;
  rectangleHeight: number;
  gap: number;
  lineInterval: number;
  overscan: number;
  labelPower: number;
  labelSpeed: number;
}

export interface Tool {
  id: string;
  name: string;
  diameter: number;
  rapidFeedRate: number;
  cutFeedRate: number;
  plungeFeedRate: number;
  isLaser: boolean;
  laserInlineMode: 'continuous' | 'dynamic';
  materialProfiles: Record<string, ToolMaterialProfile>;
}
