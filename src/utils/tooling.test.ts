import { describe, expect, it } from 'vitest';
import {
  findMaterial,
  getToolMaterialProfile,
  normalizeMaterial,
  normalizeMaterialProfile,
  normalizeTool,
  laserPowerPercentToS,
  resolveLaserMaterialPreset,
  resolveMaterialId,
  resolveToolPreset,
} from './tooling';
import { makeMaterial, makeTool } from '../test/factories';

describe('tooling', () => {
  it('normalizes materials with trimmed names and fallback ids', () => {
    expect(normalizeMaterial({ id: '  ', name: '  Maple  ' }, 'material-fallback')).toEqual({
      id: 'material-fallback',
      name: 'Maple',
    });
  });

  it('drops empty material profiles and keeps valid numeric values', () => {
    expect(normalizeMaterialProfile({ foo: 'bar' })).toBeNull();
    expect(
      normalizeMaterialProfile({
        cutFeedRate: '450',
        plungeFeedRate: 120,
        drillDepthPerPass: '0',
        cutDepthPerPass: 2,
        laserKerfDiameter: '0.12',
        laserDepthPerPassAtFullPower: '1.5',
        laserCutPowerMin: 0,
        laserCutPowerMax: 120,
      })
    ).toMatchObject({
      cutFeedRate: 450,
      plungeFeedRate: 120,
      drillDepthPerPass: null,
      cutDepthPerPass: 2,
      laserKerfDiameter: 0.12,
      laserDepthPerPassAtFullPower: 1.5,
      laserCutPowerMin: 0,
      laserCutPowerMax: 100,
    });
  });

  it('normalizes tool defaults and sanitizes invalid material profile entries', () => {
    const tool = normalizeTool(
      {
        id: '  ',
        name: 'Test Tool',
        diameter: 'bad' as never,
        materialProfiles: {
          'material-a': {
            cutFeedRate: 500,
            plungeFeedRate: 100,
            drillDepthPerPass: null,
            cutDepthPerPass: null,
          },
          '': {
            cutFeedRate: 999,
            plungeFeedRate: null,
            drillDepthPerPass: null,
            cutDepthPerPass: null,
          },
        },
      },
      'tool-fallback'
    );

    expect(tool.id).toBe('tool-fallback');
    expect(tool.diameter).toBe(3);
    expect(tool.materialProfiles).toMatchObject({
      'material-a': expect.objectContaining({
        cutFeedRate: 500,
        plungeFeedRate: 100,
        drillDepthPerPass: null,
        cutDepthPerPass: null,
      }),
    });
    expect(tool).toMatchObject({
      isLaser: false,
      laserInlineMode: 'continuous',
      millingGeometry: {
        type: 'flat-end',
        cuttingLength: 12,
        tipDiameter: 0,
        includedAngle: 60,
      },
    });
  });

  it('normalizes the current milling geometry schema', () => {
    const tool = normalizeTool(
      {
        diameter: 12,
        millingGeometry: {
          type: 'v-bit',
          cuttingLength: 8,
          tipDiameter: 0.5,
          includedAngle: 60,
        },
      },
      'v-bit'
    );

    expect(tool).toMatchObject({
      diameter: 12,
      millingGeometry: {
        type: 'v-bit',
        cuttingLength: 8,
        tipDiameter: 0.5,
        includedAngle: 60,
      },
    });
  });

  it('normalizes laser inline mode and retains the tool diameter for legacy kerf fallback', () => {
    const tool = normalizeTool(
      {
        isLaser: true,
        diameter: 0.2,
        laserInlineMode: 'dynamic',
      },
      'laser'
    );

    expect(tool).toMatchObject({
      isLaser: true,
      diameter: 0.2,
      laserInlineMode: 'dynamic',
    });
    expect(resolveLaserMaterialPreset(tool, 'missing').kerfDiameter).toBe(0.2);
  });

  it('finds and resolves materials with fallback order', () => {
    const materials = [makeMaterial({ id: 'oak' }), makeMaterial({ id: 'pine' })];

    expect(findMaterial(materials, 'pine')?.id).toBe('pine');
    expect(resolveMaterialId(materials, 'missing', 'oak')).toBe('oak');
    expect(resolveMaterialId(materials, 'missing', 'also-missing')).toBe('oak');
    expect(resolveMaterialId([], 'missing', null)).toBeNull();
  });

  it('resolves tool presets with material profile precedence', () => {
    const tool = makeTool({
      rapidFeedRate: 2100,
      cutFeedRate: 700,
      plungeFeedRate: 200,
      materialProfiles: {
        maple: {
          cutFeedRate: 450,
          plungeFeedRate: 150,
          drillDepthPerPass: 0.8,
          cutDepthPerPass: 1.2,
        },
      },
    });

    expect(getToolMaterialProfile(tool, 'maple')).toMatchObject({
      cutFeedRate: 450,
      plungeFeedRate: 150,
      drillDepthPerPass: 0.8,
      cutDepthPerPass: 1.2,
    });

    expect(resolveToolPreset(tool, 'maple', { cutFeedRate: 999, plungeFeedRate: 999 })).toEqual({
      rapidFeedRate: 2100,
      cutFeedRate: 450,
      plungeFeedRate: 150,
      drillDepthPerPass: 0.8,
      cutDepthPerPass: 1.2,
    });
  });

  it('resolves material-specific laser ranges and maps percent power to S0-S255', () => {
    const tool = makeTool({
      isLaser: true,
      materialProfiles: {
        maple: {
          cutFeedRate: null,
          plungeFeedRate: null,
          drillDepthPerPass: null,
          cutDepthPerPass: null,
          laserKerfDiameter: 0.12,
          laserDepthPerPassAtFullPower: 1.25,
          laserCutSpeedMin: 300,
          laserCutSpeedMax: 900,
          laserCutPowerMin: 70,
          laserCutPowerMax: 100,
          laserEtchSpeedMin: 1800,
          laserEtchSpeedMax: 4200,
          laserEtchPowerMin: 15,
          laserEtchPowerMax: 45,
        },
      },
    });

    expect(resolveLaserMaterialPreset(tool, 'maple')).toEqual({
      kerfDiameter: 0.12,
      depthPerPassAtFullPower: 1.25,
      cutSpeedMin: 300,
      cutSpeedMax: 900,
      cutPowerMin: 70,
      cutPowerMax: 100,
      etchSpeedMin: 1800,
      etchSpeedMax: 4200,
      etchPowerMin: 15,
      etchPowerMax: 45,
    });
    expect(laserPowerPercentToS(0)).toBe(0);
    expect(laserPowerPercentToS(50)).toBe(128);
    expect(laserPowerPercentToS(100)).toBe(255);
  });
});
