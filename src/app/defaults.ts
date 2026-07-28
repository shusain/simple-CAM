import type { MachineSettings, Material, OctoprintSettings, Tool } from '../types';

export const DEFAULT_SETTINGS: MachineSettings = {
  workWidth: 300,
  workHeight: 200,
  stockThickness: 12.7,
  marginX: 0,
  marginY: 0,
  gridSize: 5,
  snapEnabled: true,
  activeMaterialId: 'material-generic',
  safeZ: 5,
  startEndZ: 15,
  drillDepth: -3,
  cutDepth: -2,
  rapidFeedRate: 2400,
  rapidFeedRateZ: 2400,
  cutFeedRate: 600,
  plungeFeedRate: 220,
  spindleOn: false,
  spindleSpeed: 10000,
  circleSegments: 48,
  startGcode: 'G21 ; mm units\nG90 ; absolute positioning\nG94 ; feed rate in units/min',
  endGcode: 'M2',
};

export const DEFAULT_TOOLS: Tool[] = [
  {
    id: 'tool-3.175mm-endmill',
    name: 'Endmill 3.175mm',
    diameter: 3.175,
    millingGeometry: {
      type: 'flat-end',
      cuttingLength: 12.7,
      tipDiameter: 0,
      includedAngle: 60,
    },
    rapidFeedRate: 2400,
    cutFeedRate: 600,
    plungeFeedRate: 220,
    isLaser: false,
    laserInlineMode: 'continuous',
    materialProfiles: {
      'material-generic': {
        cutFeedRate: 600,
        plungeFeedRate: 220,
        drillDepthPerPass: 1,
        cutDepthPerPass: 1,
        laserKerfDiameter: null,
        laserDepthPerPassAtFullPower: null,
        laserCutSpeedMin: null,
        laserCutSpeedMax: null,
        laserCutPowerMin: null,
        laserCutPowerMax: null,
        laserEtchSpeedMin: null,
        laserEtchSpeedMax: null,
        laserEtchPowerMin: null,
        laserEtchPowerMax: null,
      },
    },
  },
  {
    id: 'tool-1-8-drill',
    name: 'Drill 3.175mm',
    diameter: 3.175,
    millingGeometry: {
      type: 'flat-end',
      cuttingLength: 12.7,
      tipDiameter: 0,
      includedAngle: 60,
    },
    rapidFeedRate: 1800,
    cutFeedRate: 350,
    plungeFeedRate: 180,
    isLaser: false,
    laserInlineMode: 'continuous',
    materialProfiles: {
      'material-generic': {
        cutFeedRate: 350,
        plungeFeedRate: 180,
        drillDepthPerPass: 1,
        cutDepthPerPass: 1,
        laserKerfDiameter: null,
        laserDepthPerPassAtFullPower: null,
        laserCutSpeedMin: null,
        laserCutSpeedMax: null,
        laserCutPowerMin: null,
        laserCutPowerMax: null,
        laserEtchSpeedMin: null,
        laserEtchSpeedMax: null,
        laserEtchPowerMin: null,
        laserEtchPowerMax: null,
      },
    },
  },
];

export const DEFAULT_MATERIALS: Material[] = [{ id: 'material-generic', name: 'Generic' }];

export const TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'drill', label: 'Drill' },
  { id: 'line', label: 'Cut Line' },
  { id: 'text', label: 'Text' },
  { id: 'sketch', label: 'Poly-Line' },
  { id: 'arc', label: 'Poly-Arc' },
  { id: 'rect', label: 'Cut Rect' },
  { id: 'circle', label: 'Cut Circle' },
] as const;

export const HISTORY_LIMIT = 200;
export const PREFERENCES_STORAGE_KEY = 'simple-cam.preferences.v2';
export const OCTOPRINT_WEB_STORAGE_KEY = 'simple-cam.octoprint.v1';
export const DEFAULT_OCTOPRINT_SETTINGS: OctoprintSettings = {
  baseUrl: '',
  apiKey: '',
};

export type ActiveTool = (typeof TOOLS)[number]['id'];
