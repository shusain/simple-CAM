import type {
  CircleOperation,
  DrillOperation,
  LineOperation,
  MachineSettings,
  Material,
  RectOperation,
  SketchOperation,
  SketchSegment,
  Tool,
} from '../types';
import { DEFAULT_MATERIALS, DEFAULT_SETTINGS, DEFAULT_TOOLS } from '../app/defaults';

export function makeSettings(overrides: Partial<MachineSettings> = {}): MachineSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

export function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: 'material-1',
    name: 'Material 1',
    ...overrides,
  };
}

export function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    ...DEFAULT_TOOLS[0],
    materialProfiles: {
      ...DEFAULT_TOOLS[0].materialProfiles,
    },
    ...overrides,
  };
}

export function makeDrillOperation(overrides: Partial<DrillOperation> = {}): DrillOperation {
  return {
    id: 'drill-1',
    type: 'drill',
    x: 10,
    y: 20,
    depth: -3,
    toolId: DEFAULT_TOOLS[0].id,
    materialId: DEFAULT_MATERIALS[0].id,
    ...overrides,
  };
}

export function makeLineOperation(overrides: Partial<LineOperation> = {}): LineOperation {
  return {
    id: 'line-1',
    type: 'line',
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 0,
    depth: -2,
    toolId: DEFAULT_TOOLS[0].id,
    materialId: DEFAULT_MATERIALS[0].id,
    ...overrides,
  };
}

export function makeRectOperation(overrides: Partial<RectOperation> = {}): RectOperation {
  return {
    id: 'rect-1',
    type: 'rect',
    x: 0,
    y: 0,
    width: 20,
    height: 10,
    cornerRadius: 0,
    depth: -3,
    toolId: DEFAULT_TOOLS[0].id,
    materialId: DEFAULT_MATERIALS[0].id,
    cutSide: 'outside',
    tabsEnabled: false,
    tabCount: 2,
    tabWidth: 1,
    tabHeight: 1,
    ...overrides,
  };
}

export function makeCircleOperation(overrides: Partial<CircleOperation> = {}): CircleOperation {
  return {
    id: 'circle-1',
    type: 'circle',
    x: 5,
    y: 5,
    radius: 4,
    depth: -3,
    toolId: DEFAULT_TOOLS[0].id,
    materialId: DEFAULT_MATERIALS[0].id,
    cutSide: 'outside',
    tabsEnabled: false,
    tabCount: 2,
    tabWidth: 1,
    tabHeight: 1,
    ...overrides,
  };
}

export function makeSketchSegment(overrides: Partial<SketchSegment> = {}): SketchSegment {
  return {
    type: 'line',
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 0,
    ...overrides,
  } as SketchSegment;
}

export function makeSketchOperation(overrides: Partial<SketchOperation> = {}): SketchOperation {
  return {
    id: 'sketch-1',
    type: 'sketch',
    segments: [
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
      { type: 'line', x1: 10, y1: 10, x2: 0, y2: 10 },
      { type: 'line', x1: 0, y1: 10, x2: 0, y2: 0 },
    ],
    closed: true,
    depth: -3,
    toolId: DEFAULT_TOOLS[0].id,
    materialId: DEFAULT_MATERIALS[0].id,
    cutSide: 'outside',
    tabsEnabled: false,
    tabCount: 2,
    tabWidth: 1,
    tabHeight: 1,
    ...overrides,
  };
}

export function normalizeGcode(gcode: string): string[] {
  return gcode
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
