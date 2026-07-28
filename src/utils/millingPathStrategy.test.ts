import { describe, expect, it } from 'vitest';
import { makeLineOperation, makeRectOperation, makeTool } from '../test/factories';
import {
  applyMillingPathPlan,
  applyVGroovePlan,
  getDefaultChamferWidth,
  getDefaultVGrooveWidth,
  getMillingPathCompensationTool,
  resolveChamferEdgePlan,
  resolveVGroovePlan,
} from './millingPathStrategy';

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

describe('milling path strategies', () => {
  it('derives V-groove depth from target width and cutter geometry', () => {
    const operation = makeLineOperation({
      toolId: vBit.id,
      depth: -8,
      millingStrategy: 'v-groove',
      millingTargetWidth: 6,
    });

    const plan = resolveVGroovePlan(operation, vBit, -2);

    expect(plan).not.toBeNull();
    expect(plan).toMatchObject({
      valid: true,
      targetWidth: 6,
      actualWidth: 6,
      limitedByDepth: false,
      issue: null,
    });
    expect(plan?.finalDepth).toBeCloseTo(-5.02295, 4);
  });

  it('caps V-groove depth and reports the resulting narrower width', () => {
    const operation = makeLineOperation({
      toolId: vBit.id,
      depth: -3,
      millingStrategy: 'v-groove',
      millingTargetWidth: 8,
    });

    const plan = resolveVGroovePlan(operation, vBit, -2);

    expect(plan).toMatchObject({
      valid: true,
      targetWidth: 8,
      finalDepth: -3,
      maximumDepth: 3,
      limitedByDepth: true,
    });
    expect(plan?.actualWidth).toBeCloseTo(3.6641, 4);
    expect(plan?.issue).toContain('3.664 mm groove instead of 8 mm');
  });

  it('rejects incompatible tools and widths no larger than the tip', () => {
    const operation = makeLineOperation({
      millingStrategy: 'v-groove',
      millingTargetWidth: 0.2,
    });

    expect(resolveVGroovePlan(operation, makeTool(), -2)).toMatchObject({
      valid: false,
      issue: 'V-groove strategy requires a V-bit milling tool.',
    });
    expect(resolveVGroovePlan(operation, vBit, -2)).toMatchObject({
      valid: false,
      issue: 'Groove width must be greater than the 0.2 mm tip diameter.',
    });
  });

  it('applies a valid plan as an along-path cut without pockets or tabs', () => {
    const operation = makeRectOperation({
      toolId: vBit.id,
      depth: -8,
      millingStrategy: 'v-groove',
      millingTargetWidth: 6,
      cutSide: 'outside',
      pocketEnabled: true,
      tabsEnabled: true,
    });
    const plan = resolveVGroovePlan(operation, vBit, -2)!;
    const planned = applyVGroovePlan(operation, plan);

    expect(planned).toMatchObject({
      depth: plan.finalDepth,
      cutSide: 'along',
      pocketEnabled: false,
      tabsEnabled: false,
    });
  });

  it('uses the operation depth and cutter envelope for a default groove width', () => {
    const operation = makeLineOperation({ depth: -3 });

    expect(getDefaultVGrooveWidth(operation, vBit, -2)).toBeCloseTo(3.6641, 4);
  });

  it('derives chamfer depth and tip-radius compensation from target width', () => {
    const operation = makeRectOperation({
      toolId: chamferMill.id,
      depth: -3,
      cutSide: 'outside',
      millingStrategy: 'chamfer-edge',
      millingTargetWidth: 2,
    });
    const plan = resolveChamferEdgePlan(operation, chamferMill, -1);

    expect(plan).toMatchObject({
      valid: true,
      targetWidth: 2,
      actualWidth: 2,
      finalDepth: -2,
      maximumDepth: 3,
      compensationRadius: 1,
      limitedByDepth: false,
      issue: null,
    });
    expect(getMillingPathCompensationTool(operation, chamferMill)?.diameter).toBe(2);
    expect(applyMillingPathPlan(operation, plan!)).toMatchObject({
      depth: -2,
      cutSide: 'outside',
      pocketEnabled: false,
      tabsEnabled: false,
    });
  });

  it('limits chamfer width and rejects paths without a closed edge side', () => {
    const limited = makeRectOperation({
      depth: -1,
      cutSide: 'inside',
      millingStrategy: 'chamfer-edge',
      millingTargetWidth: 2,
    });
    const openLine = makeLineOperation({
      millingStrategy: 'chamfer-edge',
      millingTargetWidth: 1,
    });

    expect(resolveChamferEdgePlan(limited, chamferMill, -1)).toMatchObject({
      valid: true,
      finalDepth: -1,
      actualWidth: 1,
      limitedByDepth: true,
    });
    expect(resolveChamferEdgePlan(limited, chamferMill, -1)?.issue).toContain(
      '1 mm chamfer instead of 2 mm'
    );
    expect(resolveChamferEdgePlan(openLine, chamferMill, -1)).toMatchObject({
      valid: false,
      issue: 'Chamfer-edge strategy requires a closed inside or outside path.',
    });
    expect(resolveChamferEdgePlan(limited, vBit, -1)).toMatchObject({
      valid: false,
      issue: 'Chamfer-edge strategy requires a chamfer milling tool.',
    });
  });

  it('uses the operation depth and cutter slope for a default chamfer width', () => {
    const operation = makeRectOperation({ depth: -3 });

    expect(getDefaultChamferWidth(operation, chamferMill, -1)).toBeCloseTo(3);
  });
});
