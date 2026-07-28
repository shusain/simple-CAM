import { describe, expect, it } from 'vitest';
import { generateMarlinGcode } from './gcode';
import {
  makeCircleOperation,
  makeDrillOperation,
  makeImportedMesh,
  makeImageFillOperation,
  makeLineOperation,
  makeSketchOperation,
  makeRectOperation,
  makeSettings,
  makeSurfaceFinishOperation,
  makeSurfaceRoughOperation,
  makeTextOperation,
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

  it('allows Z rapids to use a different feed than XY rapids', () => {
    const gcode = normalizeGcode(
      generateMarlinGcode({
        operations: [makeDrillOperation({ x: 12, y: 34, depth: -2 })],
        settings: makeSettings({ startEndZ: 15, safeZ: 5, rapidFeedRate: 2400, rapidFeedRateZ: 500 }),
        tools: [makeTool()],
      })
    );

    expect(gcode).toContain('G0 Z15.000 F500');
    expect(gcode).toContain('G0 X12.000 Y34.000 F2400');
    expect(gcode).toContain('G0 Z5.000 F500');
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
    expect(gcode).toContain('M0 Change tool: Tool B (Flat end mill, Ø1.000mm)');
  });

  it('warns when an operation exceeds the configured milling profile depth', () => {
    const vBit = makeTool({
      diameter: 10,
      millingGeometry: {
        type: 'v-bit',
        cuttingLength: 2,
        tipDiameter: 0,
        includedAngle: 90,
      },
    });
    const gcode = generateMarlinGcode({
      operations: [makeLineOperation({ depth: -3, toolId: vBit.id })],
      settings: makeSettings(),
      tools: [vBit],
    });

    expect(gcode).toContain(
      '; WARNING: target depth 3.000mm exceeds 2.000mm usable tool depth'
    );
    expect(gcode).toContain('; Tool geometry: V-bit / V-carve');
  });

  it('uses V-bit geometry to derive fixed-width V-groove depth', () => {
    const vBit = makeTool({
      id: 'v-bit-1',
      diameter: 12,
      millingGeometry: {
        type: 'v-bit',
        cuttingLength: 20,
        tipDiameter: 0.2,
        includedAngle: 60,
      },
    });
    const gcode = generateMarlinGcode({
      operations: [
        makeLineOperation({
          toolId: vBit.id,
          depth: -8,
          millingStrategy: 'v-groove',
          millingTargetWidth: 6,
        }),
      ],
      settings: makeSettings(),
      tools: [vBit],
    });

    expect(gcode).toContain(
      '; V-groove: target width 6.000mm, result width 6.000mm, depth 5.023mm'
    );
    expect(gcode).toContain('G1 Z-5.023 F220');
    expect(gcode).toContain('; Cut line');
  });

  it('skips V-groove output when the selected tool is incompatible', () => {
    const flatTool = makeTool();
    const gcode = generateMarlinGcode({
      operations: [
        makeLineOperation({
          toolId: flatTool.id,
          millingStrategy: 'v-groove',
          millingTargetWidth: 3,
        }),
      ],
      settings: makeSettings(),
      tools: [flatTool],
    });

    expect(gcode).toContain(
      '; Skipped line V-groove: V-groove strategy requires a V-bit milling tool.'
    );
    expect(gcode).not.toContain('; Cut line');
  });

  it('uses chamfer geometry for depth and tip-radius edge compensation', () => {
    const chamferMill = makeTool({
      id: 'chamfer-1',
      diameter: 10,
      millingGeometry: {
        type: 'chamfer',
        cuttingLength: 10,
        tipDiameter: 2,
        includedAngle: 90,
      },
    });
    const gcode = generateMarlinGcode({
      operations: [
        makeRectOperation({
          x: 10,
          y: 10,
          width: 20,
          height: 10,
          toolId: chamferMill.id,
          depth: -3,
          cutSide: 'outside',
          millingStrategy: 'chamfer-edge',
          millingTargetWidth: 2,
        }),
      ],
      settings: makeSettings(),
      tools: [chamferMill],
    });

    expect(gcode).toContain(
      '; Chamfer edge: target width 2.000mm, result width 2.000mm, depth 2.000mm, tip compensation 1.000mm'
    );
    expect(gcode).toContain('; Tool radius compensation 1.000mm');
    expect(gcode).toContain('G0 X10.000 Y9.000 F2400');
    expect(gcode).toContain('G1 Z-2.000 F220');
  });

  it('skips chamfer output for an open path', () => {
    const chamferMill = makeTool({
      millingGeometry: {
        type: 'chamfer',
        cuttingLength: 10,
        tipDiameter: 1,
        includedAngle: 90,
      },
    });
    const gcode = generateMarlinGcode({
      operations: [
        makeLineOperation({
          millingStrategy: 'chamfer-edge',
          millingTargetWidth: 1,
        }),
      ],
      settings: makeSettings(),
      tools: [chamferMill],
    });

    expect(gcode).toContain(
      '; Skipped line chamfer edge: Chamfer-edge strategy requires a closed inside or outside path.'
    );
    expect(gcode).not.toContain('; Cut line');
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

  it('emits editable start/end blocks', () => {
    const gcode = generateMarlinGcode({
      operations: [makeLineOperation()],
      settings: makeSettings({
        startGcode: 'G21\nG90\n; custom start',
        endGcode: '; custom end\nM2',
      }),
      tools: [makeTool()],
    });

    expect(gcode).toContain('G21\nG90\n; custom start');
    expect(gcode).toContain('; custom end\nM2');
  });

  it('emits Marlin continuous inline laser power with travel power disabled', () => {
    const laser = makeTool({
      id: 'laser-1',
      name: 'Diode laser',
      isLaser: true,
      laserInlineMode: 'continuous',
    });
    const gcode = generateMarlinGcode({
      operations: [
        makeLineOperation({
          toolId: laser.id,
          laserProcess: 'cut',
          laserPower: 50,
          laserSpeed: 7000,
          laserPasses: 2,
        }),
      ],
      settings: makeSettings({ spindleOn: true }),
      tools: [laser],
    });

    expect(gcode).toContain('; Laser power scale: 0-100% maps to S0-S255');
    expect(gcode).toContain('; Laser cut: 50.0% => S128, F7000, 2 pass(es)');
    expect(gcode).toContain('M3 I S0 ; enable Marlin inline mode with laser off');
    expect(gcode.match(/M3 S128/g)).toHaveLength(2);
    expect(gcode).toContain('G1 X10.000 Y0.000 F7000');
    expect(gcode).toContain('M5 I ; clear Marlin inline laser mode');
    expect(gcode).not.toContain('M3 S10000');
    expect(gcode.indexOf('G0 Z15.000')).toBeGreaterThan(gcode.indexOf('; Program end'));
  });

  it('supports Marlin dynamic inline laser mode', () => {
    const laser = makeTool({
      id: 'laser-dynamic',
      isLaser: true,
      laserInlineMode: 'dynamic',
    });
    const gcode = generateMarlinGcode({
      operations: [
        makeRectOperation({
          toolId: laser.id,
          x: 5,
          laserProcess: 'etch',
          laserPower: 30,
          laserSpeed: 6000,
          laserLineInterval: 5,
          laserOverscan: 2,
        }),
      ],
      settings: makeSettings(),
      tools: [laser],
    });

    expect(gcode).toContain('M4 I S0 ; enable Marlin inline mode with laser off');
    expect(gcode).toContain('M4 S77');
    expect(gcode).toContain('; Laser etch: 30.0% => S77, F6000, 1 pass(es)');
    expect(gcode).toContain('; Raster fill: 5.000mm interval, 2.000mm overscan');
    expect(gcode).toContain('G0 X3.000 Y2.500 F2400');
    expect(gcode).toContain('G1 X5.000 Y2.500 F6000');
    expect(gcode).toContain('G1 X25.000 Y2.500 F6000');
    expect(gcode).toContain('G1 X27.000 Y2.500 F6000');
    expect(gcode.indexOf('M4 I S0')).toBeLessThan(gcode.indexOf('G0 X3.000 Y2.500'));
    expect(gcode.indexOf('G1 X5.000 Y2.500')).toBeLessThan(gcode.indexOf('M4 S77'));
    expect(gcode.indexOf('M4 S77')).toBeLessThan(gcode.indexOf('G1 X25.000 Y2.500'));
    expect(gcode).toContain('M5\nG1 X27.000 Y2.500 F6000');
  });

  it('maps raster-image brightness to synchronized inline laser power', () => {
    const laser = makeTool({
      id: 'laser-1',
      name: 'Diode laser',
      isLaser: true,
      laserInlineMode: 'continuous',
    });
    const gcode = generateMarlinGcode({
      operations: [
        makeImageFillOperation({
          toolId: laser.id,
          laserSpeed: 3000,
          laserPowerMin: 0,
          laserPowerMax: 100,
          laserLineInterval: 1,
        }),
      ],
      settings: makeSettings(),
      tools: [laser],
    });

    expect(gcode).toContain('; Tool: Diode laser  Raster image fill');
    expect(gcode).toContain('; Image: gradient.png');
    expect(gcode).toContain(
      '; Grayscale power: 0.0-100.0% maps to S0-S255, F3000'
    );
    expect(gcode).toContain(
      'M3 I S0 ; enable Marlin inline mode with laser off'
    );
    expect(gcode).toContain('G1 X0.000 Y0.500 F3000');
    expect(gcode).toContain(
      'M3 S255\nG1 X1.000 Y0.500 F3000\nM3 S0\nG1 X2.000 Y0.500 F3000'
    );
    expect(gcode).toContain('M5 I ; clear Marlin inline laser mode');
  });

  it('generates outline cuts for editable text operations', () => {
    const gcode = generateMarlinGcode({
      operations: [makeTextOperation({ text: 'A', fontSize: 8, cutSide: 'outside' })],
      settings: makeSettings(),
      tools: [makeTool()],
    });

    expect(gcode).toContain('; Cut text "A"');
    expect(gcode).toContain('; Text contour 1');
    expect(gcode).toContain('G1 Z-1.000 F220');
  });

  it('adds retaining tabs to outside text cuts on each pass', () => {
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

    const gcode = generateMarlinGcode({
      operations: [
        makeTextOperation({
          text: 'A',
          fontSize: 8,
          cutSide: 'outside',
          depth: -2,
          tabsEnabled: true,
          tabCount: 1,
          tabWidth: 1,
          tabHeight: 0.5,
        }),
      ],
      settings: makeSettings(),
      tools: [tool],
    });

    expect(gcode).toContain('; Tab 1 start');
    expect(gcode).toContain('; Tab 1 end');
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

  it('emits G3 arcs for circle contours instead of linearized G1 segments', () => {
    const gcode = generateMarlinGcode({
      operations: [makeCircleOperation({ x: 5, y: 5, radius: 4, cutSide: 'along' })],
      settings: makeSettings(),
      tools: [makeTool()],
    });

    expect(gcode).toContain('; Cut circle (along path)');
    expect(gcode).toContain('G3 X1.000 Y5.000 I-4.000 J0.000 F600');
    expect(gcode).toMatch(/G3 X9\.000 Y5\.000 I4\.000 J-?0\.000 F600/);
  });

  it('preserves tabs on circular contours while using arc moves', () => {
    const gcode = generateMarlinGcode({
      operations: [
        makeCircleOperation({
          cutSide: 'along',
          tabsEnabled: true,
          tabCount: 2,
          tabWidth: 1,
          tabHeight: 0.5,
        }),
      ],
      settings: makeSettings({ cutDepth: -3 }),
      tools: [makeTool()],
    });

    expect(gcode).toContain('; Tab 1 start');
    expect(gcode).toContain('; Tab 1 end');
    expect(gcode).toContain('G3 ');
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

  it('emits concentric arc pocket contours for circles', () => {
    const gcode = generateMarlinGcode({
      operations: [
        makeCircleOperation({
          radius: 10,
          cutSide: 'inside',
          pocketEnabled: true,
          pocketStepOver: 1,
        }),
      ],
      settings: makeSettings(),
      tools: [makeTool({ diameter: 4 })],
    });

    expect(gcode).toContain('; Pocket circle (inside clear area, stepover 1.000mm)');
    expect(gcode).toContain('; Pocket contour 2');
    expect(gcode).toContain('G3 ');
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

  it('emits raster XYZ moves for STL surface roughing operations', () => {
    const gcode = normalizeGcode(
      generateMarlinGcode({
        operations: [
          makeSurfaceRoughOperation({
            depth: -2,
            stepOver: 2,
            stockToLeave: 0.5,
            meshId: 'mesh-1',
            toolId: 'tool-1',
            materialId: 'mat-1',
          }),
        ],
        settings: makeSettings({ safeZ: 5, startEndZ: 8 }),
        tools: [
          makeTool({
            id: 'tool-1',
            diameter: 4,
            materialProfiles: {
              'mat-1': {
                cutFeedRate: 300,
                plungeFeedRate: 120,
                cutDepthPerPass: 1,
                drillDepthPerPass: 1,
              },
            },
          }),
        ],
        importedMeshes: [
          makeImportedMesh({
            id: 'mesh-1',
            placement: { x: 20, y: 20 },
            localBounds: {
              minX: -5,
              maxX: 5,
              minY: -4,
              maxY: 4,
              minZ: -2,
              maxZ: 0,
            },
            triangles: [
              {
                a: { x: -5, y: -4, z: -2 },
                b: { x: 5, y: -4, z: -2 },
                c: { x: 5, y: 4, z: -2 },
              },
              {
                a: { x: -5, y: -4, z: -2 },
                b: { x: 5, y: 4, z: -2 },
                c: { x: -5, y: 4, z: -2 },
              },
            ],
          }),
        ],
      })
    );

    expect(gcode).toContain('; Surface roughing pass 1 (-1.000mm)');
    expect(gcode).toContain('; Surface roughing pass 2 (-2.000mm)');
    expect(gcode.some((line) => /^G1 X.+ Y.+ Z-1\.500 F300$/.test(line))).toBe(true);
  });

  it('emits raster XYZ moves for STL surface finishing operations', () => {
    const gcode = normalizeGcode(
      generateMarlinGcode({
        operations: [
          makeSurfaceFinishOperation({
            depth: -2,
            stepOver: 2,
            meshId: 'mesh-1',
            toolId: 'tool-1',
            materialId: 'mat-1',
          }),
        ],
        settings: makeSettings({ safeZ: 5, startEndZ: 8 }),
        tools: [
          makeTool({
            id: 'tool-1',
            diameter: 4,
            materialProfiles: {
              'mat-1': {
                cutFeedRate: 300,
                plungeFeedRate: 120,
                cutDepthPerPass: 1,
                drillDepthPerPass: 1,
              },
            },
          }),
        ],
        importedMeshes: [
          makeImportedMesh({
            id: 'mesh-1',
            placement: { x: 20, y: 20 },
            localBounds: {
              minX: -5,
              maxX: 5,
              minY: -4,
              maxY: 4,
              minZ: -2,
              maxZ: 0,
            },
            triangles: [
              {
                a: { x: -5, y: -4, z: -2 },
                b: { x: 5, y: -4, z: -2 },
                c: { x: 5, y: 4, z: 0 },
              },
              {
                a: { x: -5, y: -4, z: -2 },
                b: { x: 5, y: 4, z: 0 },
                c: { x: -5, y: 4, z: 0 },
              },
            ],
          }),
        ],
      })
    );

    expect(gcode).toContain('; Surface finishing pass 1 (-1.000mm)');
    expect(gcode).toContain('; Surface finishing pass 2 (-2.000mm)');
    expect(gcode.some((line) => /^G1 X.+ Y.+ Z0\.000 F300$/.test(line))).toBe(true);
    expect(gcode.some((line) => /^G1 X.+ Y.+ Z-2\.000 F300$/.test(line))).toBe(true);
  });
});
