import { describe, expect, it } from 'vitest';
import { makeTool } from '../test/factories';
import { importDrlToDrillOperations } from './importDrl';

function buildOptions() {
  let counter = 0;
  return {
    createId: () => `drl-${counter += 1}`,
    depth: -2.5,
    activeToolId: 'active-tool',
    materialId: 'material-1',
    tools: [
      makeTool({ id: 'active-tool', name: 'Active Tool', diameter: 3.175 }),
      makeTool({ id: 'drill-0p8', name: '0.8mm Drill', diameter: 0.8 }),
      makeTool({ id: 'drill-1p0', name: '1.0mm Drill', diameter: 1.0 }),
    ],
  };
}

describe('importDrlToDrillOperations', () => {
  it('imports metric KiCad Excellon hits into drill operations', () => {
    const drl = `M48
; DRILL file
METRIC
T1C0.800
T2C1.000
%
G90
G05
T1
X10.000Y20.000
X11.500Y21.250
T2
X30.000Y40.500
M30`;

    const result = importDrlToDrillOperations(drl, buildOptions());

    expect(result.warnings).toEqual([]);
    expect(result.operations).toHaveLength(3);
    expect(result.operations[0]).toMatchObject({
      type: 'drill',
      x: 10,
      y: 20,
      depth: -2.5,
      toolId: 'drill-0p8',
      materialId: 'material-1',
    });
    expect(result.operations[1]).toMatchObject({
      x: 11.5,
      y: 21.25,
      toolId: 'drill-0p8',
    });
    expect(result.operations[2]).toMatchObject({
      x: 30,
      y: 40.5,
      toolId: 'drill-1p0',
    });
  });

  it('falls back to the active tool when the file tool diameter does not match an existing tool', () => {
    const drl = `M48
METRIC
T1C1.600
%
T1
X5.000Y7.000
M30`;

    const result = importDrlToDrillOperations(drl, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.toolId).toBe('active-tool');
    expect(result.warnings).toEqual([]);
  });

  it('converts inch coordinates to millimeters', () => {
    const drl = `M48
INCH
T1C0.0315
%
T1
X1.000Y2.000
M30`;

    const result = importDrlToDrillOperations(drl, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.x).toBeCloseTo(25.4);
    expect(result.operations[0]?.y).toBeCloseTo(50.8);
    expect(result.warnings).toContain('Converted DRL coordinates from inches to millimeters');
  });

  it('warns when coordinates appear before any tool selection', () => {
    const drl = `M48
METRIC
%
X10.000Y20.000
M30`;

    const result = importDrlToDrillOperations(drl, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.toolId).toBe('active-tool');
    expect(result.warnings).toContain('Some drill hits did not declare a tool, so the active tool was assigned');
  });
});
