import { describe, expect, it } from 'vitest';
import {
  makeImageFillOperation,
  makeLineOperation,
  makeSettings,
  makeTool,
} from '../test/factories';
import {
  buildMaterialRemovalPreview,
  getMaterialRemovalHeight,
} from './materialRemovalPreview';

function makeCuttingTool(type: 'flat-end' | 'ball-nose') {
  return makeTool({
    id: `tool-${type}`,
    diameter: 2,
    millingGeometry: {
      type,
      cuttingLength: 10,
      tipDiameter: 0,
      includedAngle: 60,
    },
    materialProfiles: {
      'material-1': {
        cutFeedRate: 300,
        plungeFeedRate: 120,
        cutDepthPerPass: 2,
        drillDepthPerPass: 2,
      },
    },
  });
}

describe('material removal preview', () => {
  it('subtracts a flat cutter sweep from explicit stock without changing distant cells', () => {
    const tool = makeCuttingTool('flat-end');
    const preview = buildMaterialRemovalPreview({
      operations: [
        makeLineOperation({
          x1: 2,
          y1: 5,
          x2: 8,
          y2: 5,
          depth: -2,
          toolId: tool.id,
          materialId: 'material-1',
        }),
      ],
      settings: makeSettings({
        workWidth: 10,
        workHeight: 10,
        stockThickness: 5,
      }),
      tools: [tool],
      targetCellSize: 0.25,
      maxCells: 10_000,
    });

    expect(preview.columns).toBe(41);
    expect(preview.rows).toBe(41);
    expect(preview.simulatedOperationIds).toEqual(['line-1']);
    expect(preview.removedCellCount).toBeGreaterThan(0);
    expect(getMaterialRemovalHeight(preview, 20, 20)).toBeCloseTo(-2);
    expect(getMaterialRemovalHeight(preview, 20, 0)).toBe(0);
  });

  it('uses the ball profile to produce a rounded cross-section', () => {
    const tool = makeCuttingTool('ball-nose');
    const preview = buildMaterialRemovalPreview({
      operations: [
        makeLineOperation({
          x1: 2,
          y1: 5,
          x2: 8,
          y2: 5,
          depth: -2,
          toolId: tool.id,
          materialId: 'material-1',
        }),
      ],
      settings: makeSettings({
        workWidth: 10,
        workHeight: 10,
        stockThickness: 5,
      }),
      tools: [tool],
      targetCellSize: 0.25,
      maxCells: 10_000,
    });

    const centerHeight = getMaterialRemovalHeight(preview, 20, 20);
    const sideHeight = getMaterialRemovalHeight(preview, 20, 24);

    expect(centerHeight).toBeCloseTo(-2);
    expect(sideHeight).toBeGreaterThan(centerHeight);
    expect(sideHeight).toBeLessThan(-1.4);
    expect(sideHeight).toBeGreaterThan(-1.7);
  });

  it('clamps milling removal at the stock bottom', () => {
    const mill = makeCuttingTool('flat-end');
    const settings = makeSettings({
      workWidth: 10,
      workHeight: 10,
      stockThickness: 1,
    });
    const milled = buildMaterialRemovalPreview({
      operations: [
        makeLineOperation({
          depth: -4,
          toolId: mill.id,
          materialId: 'material-1',
        }),
      ],
      settings,
      tools: [mill],
      targetCellSize: 0.5,
    });
    expect(milled.minimumHeight).toBe(-1);
  });

  it('scales laser depth by power and passes and clamps it at the stock bottom', () => {
    const laser = makeTool({
      id: 'laser-1',
      isLaser: true,
      diameter: 0.1,
      materialProfiles: {
        'material-1': {
          cutFeedRate: null,
          plungeFeedRate: null,
          cutDepthPerPass: null,
          drillDepthPerPass: null,
          laserKerfDiameter: 1,
          laserDepthPerPassAtFullPower: 2,
        },
      },
    });
    const preview = buildMaterialRemovalPreview({
      operations: [
        makeLineOperation({
          x1: 2,
          y1: 5,
          x2: 8,
          y2: 5,
          toolId: laser.id,
          materialId: 'material-1',
          laserProcess: 'cut',
          laserPower: 75,
          laserPasses: 2,
        }),
      ],
      settings: makeSettings({
        workWidth: 10,
        workHeight: 10,
        stockThickness: 3,
      }),
      tools: [laser],
      targetCellSize: 0.25,
      maxCells: 10_000,
    });

    expect(preview.minimumHeight).toBe(-3);
    expect(preview.simulatedOperationIds).toEqual(['line-1']);
    expect(getMaterialRemovalHeight(preview, 20, 20)).toBe(-3);
    expect(getMaterialRemovalHeight(preview, 20, 0)).toBe(0);
  });

  it('uses the calibrated material depth for a shallow laser operation', () => {
    const laser = makeTool({
      id: 'laser-1',
      isLaser: true,
      diameter: 0.1,
      materialProfiles: {
        'material-1': {
          cutFeedRate: null,
          plungeFeedRate: null,
          cutDepthPerPass: null,
          drillDepthPerPass: null,
          laserKerfDiameter: 1,
          laserDepthPerPassAtFullPower: 2,
        },
      },
    });
    const preview = buildMaterialRemovalPreview({
      operations: [
        makeLineOperation({
          x1: 2,
          y1: 5,
          x2: 8,
          y2: 5,
          toolId: laser.id,
          materialId: 'material-1',
          laserProcess: 'cut',
          laserPower: 25,
          laserPasses: 2,
        }),
      ],
      settings: makeSettings({
        workWidth: 10,
        workHeight: 10,
        stockThickness: 3,
      }),
      tools: [laser],
      targetCellSize: 0.25,
      maxCells: 10_000,
    });

    expect(preview.minimumHeight).toBeCloseTo(-1);
    expect(preview.simulatedOperationIds).toEqual(['line-1']);
    expect(getMaterialRemovalHeight(preview, 20, 20)).toBeCloseTo(-1);
  });

  it('varies raster image-fill depth with each grayscale-mapped power sample', () => {
    const laser = makeTool({
      id: 'laser-1',
      isLaser: true,
      diameter: 0.1,
      materialProfiles: {
        'material-generic': {
          cutFeedRate: null,
          plungeFeedRate: null,
          cutDepthPerPass: null,
          drillDepthPerPass: null,
          laserKerfDiameter: 0.5,
          laserDepthPerPassAtFullPower: 2,
        },
      },
    });
    const preview = buildMaterialRemovalPreview({
      operations: [
        makeImageFillOperation({
          x: 1,
          y: 0.5,
          width: 2,
          height: 1,
          toolId: laser.id,
          laserPowerMin: 10,
          laserPowerMax: 90,
          laserLineInterval: 1,
        }),
      ],
      settings: makeSettings({
        workWidth: 4,
        workHeight: 2,
        stockThickness: 3,
      }),
      tools: [laser],
      targetCellSize: 0.25,
      maxCells: 10_000,
    });

    expect(preview.simulatedOperationIds).toEqual(['image-fill-1']);
    expect(getMaterialRemovalHeight(preview, 6, 4)).toBeCloseTo(-1.8);
    expect(getMaterialRemovalHeight(preview, 10, 4)).toBeCloseTo(-0.2);
  });
});
