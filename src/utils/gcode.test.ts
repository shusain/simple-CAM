import { describe, expect, it } from 'vitest';
import { generateMarlinGcode } from './gcode';
import {
  makeCircleOperation,
  makeDrillOperation,
  makeLineOperation,
  makeSketchOperation,
  makeRectOperation,
  makeSettings,
  makeTool,
  normalizeGcode,
} from '../test/factories';

describe('generateMarlinGcode', () => {
  it('uses separate start/end height for the first entry move', () => {
    const gcode = normalizeGcode(
      generateMarlinGcode({
        operations: [makeDrillOperation({ x: 12, y: 34, depth: -2 })],
        settings: makeSettings({ startEndZ: 15, safeZ: 5 }),
        tools: [makeTool()],
      })
    );

    expect(gcode).toContain('G0 Z15.000 F2400');
    expect(gcode).toContain('G0 X12.000 Y34.000 F2400');
    expect(gcode).toContain('G0 Z5.000 F2400');
  });

  it('emits tool changes when consecutive operations use different tools', () => {
    const tools = [
      makeTool({ id: 'tool-a', name: 'Tool A', diameter: 3 }),
      makeTool({ id: 'tool-b', name: 'Tool B', diameter: 1 }),
    ];

    const gcode = generateMarlinGcode({
      operations: [
        makeDrillOperation({ toolId: 'tool-a' }),
        makeDrillOperation({ id: 'drill-2', x: 20, toolId: 'tool-b' }),
      ],
      settings: makeSettings(),
      tools,
    });

    expect(gcode).toContain('; Tool change required');
    expect(gcode).toContain('M0 Change tool: Tool B (Ø1.000mm)');
  });

  it('handles line cuts and spindle commands when enabled', () => {
    const gcode = generateMarlinGcode({
      operations: [makeLineOperation({ x1: 0, y1: 0, x2: 5, y2: 5 })],
      settings: makeSettings({ spindleOn: true, spindleSpeed: 12000 }),
      tools: [makeTool()],
    });

    expect(gcode).toContain('M3 S12000');
    expect(gcode).toContain('; Cut line');
    expect(gcode).toContain('G1 X5.000 Y5.000 F600');
    expect(gcode).toContain('M5');
  });

  it('leaves retaining tabs on every cutting pass', () => {
    const tool = makeTool({
      diameter: 2,
      materialProfiles: {
        'material-generic': {
          cutFeedRate: 600,
          plungeFeedRate: 220,
          drillDepthPerPass: 1,
          cutDepthPerPass: 1,
        },
      },
    });
    const operation = makeRectOperation({
      depth: -3,
      tabsEnabled: true,
      tabCount: 1,
      tabWidth: 1,
      tabHeight: 1,
    });

    const gcode = generateMarlinGcode({
      operations: [operation],
      settings: makeSettings({ cutDepth: -3 }),
      tools: [tool],
    });

    expect(gcode.match(/; Tab 1 start/g)).toHaveLength(3);
    expect(gcode.match(/; Tab 1 end/g)).toHaveLength(3);
  });

  it('includes tool radius compensation comments for outside rectangle cuts', () => {
    const gcode = generateMarlinGcode({
      operations: [makeRectOperation({ cutSide: 'outside' })],
      settings: makeSettings(),
      tools: [makeTool({ diameter: 3.175 })],
    });

    expect(gcode).toContain('; Cut rectangle (outside path)');
    expect(gcode).toContain('; Tool radius compensation 1.587mm');
  });

  it('falls back to along-path cuts when inside compensation is too large', () => {
    const tools = [makeTool({ diameter: 10 })];

    const rectGcode = generateMarlinGcode({
      operations: [makeRectOperation({ width: 6, height: 6, cutSide: 'inside' })],
      settings: makeSettings(),
      tools,
    });
    const circleGcode = generateMarlinGcode({
      operations: [makeCircleOperation({ radius: 3, cutSide: 'inside' })],
      settings: makeSettings(),
      tools,
    });

    expect(rectGcode).toContain('falling back to along path: tool too large for inside offset');
    expect(circleGcode).toContain('falling back to along path: tool too large for inside offset');
  });

  it('handles sketch subpaths including offset fallback and unassigned tools', () => {
    const firstToolOp = makeDrillOperation({ toolId: 'tool-b' });
    const degenerateClosedSketch = makeSketchOperation({
      toolId: 'tool-a',
      segments: [
        { type: 'line', x1: 0, y1: 0, x2: 0, y2: 0 },
        { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 },
        { type: 'line', x1: 5, y1: 0, x2: 0, y2: 0 },
      ],
      closed: true,
      cutSide: 'outside',
    });
    const openArcSketch = makeSketchOperation({
      segments: [
        { type: 'arc', x1: 0, y1: 0, x2: 10, y2: 0, throughX: 5, throughY: 5 },
        { type: 'line', x1: 20, y1: 0, x2: 25, y2: 0 },
      ],
      closed: false,
      cutSide: 'along',
      toolId: 'missing-tool',
    });

    const gcode = generateMarlinGcode({
      operations: [firstToolOp, degenerateClosedSketch, openArcSketch],
      settings: makeSettings(),
      tools: [makeTool({ id: 'tool-a' }), makeTool({ id: 'tool-b' })],
    });

    expect(gcode).toContain('Unassigned tool');
    expect(gcode).toContain('offset failed, falling back to along path');
    expect(gcode).toContain('; Cut sketch open path (2 subpath(s))');
    expect(gcode).toContain('; Sketch subpath 2');
  });

  it('emits pocket-clearing passes for inside cuts and suppresses tab comments', () => {
    const gcode = generateMarlinGcode({
      operations: [
        makeRectOperation({
          width: 18,
          height: 14,
          cutSide: 'inside',
          pocketEnabled: true,
          pocketStepOver: 1,
          tabsEnabled: true,
          tabCount: 2,
        }),
      ],
      settings: makeSettings(),
      tools: [makeTool({ diameter: 4 })],
    });

    expect(gcode).toContain('; Pocket rectangle (inside clear area, stepover 1.000mm)');
    expect(gcode).toContain('; Depth pass 2 (-2.000mm)');
    expect(gcode).toContain('; Pocket contour 2');
    expect(gcode).not.toContain('; Tab 1 start');
    expect(gcode).not.toContain('; Tab 1 end');
  });

  it('uses low retracts between depth passes and only returns to safe Z after the operation', () => {
    const tool = makeTool({
      diameter: 2,
      materialProfiles: {
        'material-generic': {
          cutFeedRate: 600,
          plungeFeedRate: 220,
          drillDepthPerPass: 1,
          cutDepthPerPass: 1,
        },
      },
    });

    const gcode = normalizeGcode(
      generateMarlinGcode({
        operations: [makeRectOperation({ depth: -3 })],
        settings: makeSettings({ safeZ: 5, cutDepth: -3 }),
        tools: [tool],
      })
    );

    const lowRetracts = gcode.filter((line) => line === 'G0 Z1.000 F2400');
    const safeRetracts = gcode.filter((line) => line === 'G0 Z5.000 F2400');

    expect(lowRetracts.length).toBeGreaterThanOrEqual(2);
    expect(safeRetracts.length).toBeGreaterThanOrEqual(2);
    expect(gcode).toContain('G0 Z1.000 F2400');
  });

  it('keeps pocket subpath transfers near the work and only retracts to safe Z after the final subpath', () => {
    const gcode = normalizeGcode(
      generateMarlinGcode({
        operations: [
          makeRectOperation({
            width: 18,
            height: 14,
            depth: -1,
            cutSide: 'inside',
            pocketEnabled: true,
            pocketStepOver: 1,
          }),
        ],
        settings: makeSettings({ safeZ: 5, cutDepth: -1 }),
        tools: [makeTool({ diameter: 4 })],
      })
    );

    const pocketContourTwoIndex = gcode.findIndex((line) => line === '; Pocket contour 2');
    expect(pocketContourTwoIndex).toBeGreaterThan(0);
    expect(gcode[pocketContourTwoIndex - 1]).toBe('G0 Z1.000 F2400');
    expect(gcode).toContain('G0 Z5.000 F2400');
  });

  it('cuts pocket contours across each depth layer instead of finishing one contour to full depth first', () => {
    const tool = makeTool({
      diameter: 4,
      materialProfiles: {
        'material-generic': {
          cutFeedRate: 600,
          plungeFeedRate: 220,
          drillDepthPerPass: 1,
          cutDepthPerPass: 1,
        },
      },
    });

    const gcode = normalizeGcode(
      generateMarlinGcode({
        operations: [
          makeRectOperation({
            width: 18,
            height: 14,
            depth: -3,
            cutSide: 'inside',
            pocketEnabled: true,
            pocketStepOver: 1,
          }),
        ],
        settings: makeSettings({ safeZ: 5, cutDepth: -3 }),
        tools: [tool],
      })
    );

    const depthPass1 = gcode.findIndex((line) => line === '; Depth pass 1 (-1.000mm)');
    const depthPass2 = gcode.findIndex((line) => line === '; Depth pass 2 (-2.000mm)');
    const contour2 = gcode.findIndex((line) => line === '; Pocket contour 2');

    expect(depthPass1).toBeGreaterThanOrEqual(0);
    expect(contour2).toBeGreaterThan(depthPass1);
    expect(depthPass2).toBeGreaterThan(contour2);
  });
});
