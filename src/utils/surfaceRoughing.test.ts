import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeImportedMesh, makeSettings, makeSurfaceFinishOperation, makeSurfaceRoughOperation, makeTool } from '../test/factories';
import { importStlModel } from './importStl';
import { buildSurfaceFinishPlan, buildSurfaceRoughPlan } from './surfaceRoughing';

describe('buildSurfaceRoughPlan', () => {
  it('builds raster passes that respect tool/material stepdown and stock to leave', () => {
    const mesh = makeImportedMesh({
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
    });
    const operation = makeSurfaceRoughOperation({
      meshId: mesh.id,
      depth: -2,
      stepOver: 2,
      stockToLeave: 0.5,
      toolId: 'tool-1',
      materialId: 'mat-1',
    });
    const tool = makeTool({
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
    });

    const plan = buildSurfaceRoughPlan(operation, mesh, makeSettings(), tool);

    expect(plan.passDepths).toEqual([-1, -2]);
    expect(plan.paths.length).toBeGreaterThan(0);
    expect(plan.paths.every((path) => path.points.length >= 2)).toBe(true);
    expect(plan.paths.some((path) => path.points.some((point) => point.z === -1))).toBe(true);
    expect(plan.paths.some((path) => path.points.some((point) => point.z === -2))).toBe(true);
    expect(plan.paths.some((path) => path.passIndex === 1)).toBe(true);
    expect(plan.scanAxis).toBe('x');
  });

  it('returns an empty plan when the referenced mesh is missing', () => {
    const plan = buildSurfaceRoughPlan(
      makeSurfaceRoughOperation(),
      null,
      makeSettings(),
      makeTool()
    );

    expect(plan.passDepths).toEqual([]);
    expect(plan.paths).toEqual([]);
  });

  it('builds roughing paths for the real hold-down STL sample', () => {
    const contents = fs.readFileSync('src/test/samples/hold-down.stl', 'utf8');
    const imported = importStlModel(contents, {
      createId: () => 'mesh-1',
      filePath: 'src/test/samples/hold-down.stl',
      workWidth: 200,
      workHeight: 200,
    });

    if (!imported.mesh) {
      throw new Error(imported.warnings.join('\n') || 'Expected STL mesh');
    }

    const plan = buildSurfaceRoughPlan(
      makeSurfaceRoughOperation({
        meshId: imported.mesh.id,
        depth: imported.mesh.localBounds.minZ,
        stepOver: 1.5875,
        stockToLeave: 0.25,
      }),
      imported.mesh,
      makeSettings(),
      makeTool({ diameter: 3.175 })
    );

    expect(plan.paths.length).toBeGreaterThan(0);
    expect(plan.paths.some((path) => path.points.some((point) => point.z < -0.5))).toBe(true);
  });

  it('builds finishing paths that stay on the imported mesh silhouette', () => {
    const mesh = makeImportedMesh({
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
    });

    const plan = buildSurfaceFinishPlan(
      makeSurfaceFinishOperation({
        meshId: mesh.id,
        depth: -2,
        stepOver: 2,
        toolId: 'tool-1',
        materialId: 'mat-1',
      }),
      mesh,
      makeSettings(),
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
      })
    );

    expect(plan.paths.length).toBeGreaterThan(0);
    expect(plan.paths.every((path) => path.points.length >= 2)).toBe(true);
    expect(plan.paths.every((path) => path.points.every((point) => point.x >= 15 && point.x <= 25))).toBe(true);
    expect(plan.paths.every((path) => path.points.every((point) => point.y >= 16 && point.y <= 24))).toBe(true);
    expect(plan.paths.some((path) => path.points.some((point) => point.z === 0))).toBe(true);
    expect(plan.paths.some((path) => path.points.some((point) => point.z < -1))).toBe(true);
  });

  it('raises ball-nose finishing centerlines to account for side contact on slopes', () => {
    const mesh = makeImportedMesh({
      placement: { x: 10, y: 10 },
      localBounds: {
        minX: -5,
        maxX: 5,
        minY: -3,
        maxY: 3,
        minZ: -5,
        maxZ: 0,
      },
      triangles: [
        {
          a: { x: -5, y: -3, z: -5 },
          b: { x: 5, y: -3, z: 0 },
          c: { x: 5, y: 3, z: 0 },
        },
        {
          a: { x: -5, y: -3, z: -5 },
          b: { x: 5, y: 3, z: 0 },
          c: { x: -5, y: 3, z: -5 },
        },
      ],
    });
    const operation = makeSurfaceFinishOperation({
      meshId: mesh.id,
      depth: -5,
      stepOver: 2,
      toolId: 'tool-1',
      materialId: 'mat-1',
    });
    const commonTool = {
      id: 'tool-1',
      diameter: 4,
      materialProfiles: {
        'mat-1': {
          cutFeedRate: 300,
          plungeFeedRate: 120,
          cutDepthPerPass: 5,
          drillDepthPerPass: 5,
        },
      },
    };
    const flatPlan = buildSurfaceFinishPlan(
      operation,
      mesh,
      makeSettings(),
      makeTool({
        ...commonTool,
        millingGeometry: {
          type: 'flat-end',
          cuttingLength: 10,
          tipDiameter: 0,
          includedAngle: 60,
        },
      })
    );
    const ballPlan = buildSurfaceFinishPlan(
      operation,
      mesh,
      makeSettings(),
      makeTool({
        ...commonTool,
        millingGeometry: {
          type: 'ball-nose',
          cuttingLength: 10,
          tipDiameter: 0,
          includedAngle: 60,
        },
      })
    );

    const findCenterPoint = (plan: typeof flatPlan) =>
      plan.paths
        .flatMap((path) => path.points)
        .find((point) => Math.abs(point.x - 10) < 0.0001 && Math.abs(point.y - 9) < 0.0001);
    const flatCenter = findCenterPoint(flatPlan);
    const ballCenter = findCenterPoint(ballPlan);

    expect(flatCenter?.z).toBeCloseTo(-2.5);
    expect(ballCenter?.z).toBeGreaterThan(-2.3);
    expect(ballCenter?.z).toBeLessThan(-2.2);
  });
});
