import { describe, expect, it } from 'vitest';
import {
  findMaterial,
  getToolMaterialProfile,
  normalizeMaterial,
  normalizeMaterialProfile,
  normalizeTool,
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
      })
    ).toEqual({
      cutFeedRate: 450,
      plungeFeedRate: 120,
      drillDepthPerPass: null,
      cutDepthPerPass: 2,
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
    expect(tool.materialProfiles).toEqual({
      'material-a': {
        cutFeedRate: 500,
        plungeFeedRate: 100,
        drillDepthPerPass: null,
        cutDepthPerPass: null,
      },
    });
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

    expect(getToolMaterialProfile(tool, 'maple')).toEqual({
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
});
