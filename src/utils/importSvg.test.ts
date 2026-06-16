import { describe, expect, it } from 'vitest';
import { importSvgToSketchOperations } from './importSvg';

function buildOptions() {
  let counter = 0;
  return {
    circleSegments: 24,
    depth: -2,
    closedPathMode: 'outside' as const,
    toolId: 'tool-1',
    toolDiameter: 3.175,
    materialId: 'material-1',
    createId: () => `imported-${counter += 1}`,
  };
}

describe('importSvgToSketchOperations', () => {
  it('imports a rectangle as a closed sketch', () => {
    const svg = '<svg><rect x="10" y="20" width="30" height="15" /></svg>';
    const result = importSvgToSketchOperations(svg, buildOptions());

    expect(result.warnings).toEqual([]);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].closed).toBe(true);
    expect(result.operations[0].segments).toHaveLength(4);
    expect(result.operations[0].cutSide).toBe('outside');
  });

  it('imports polyline geometry as an open sketch', () => {
    const svg = '<svg><polyline points="0,0 10,0 10,5" /></svg>';
    const result = importSvgToSketchOperations(svg, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].closed).toBe(false);
    expect(result.operations[0].segments).toHaveLength(2);
    expect(result.operations[0].cutSide).toBe('along');
  });

  it('imports closed geometry with the requested inside cut mode', () => {
    const svg = '<svg><polygon points="0,0 10,0 10,10 0,10" /></svg>';
    const result = importSvgToSketchOperations(svg, {
      ...buildOptions(),
      closedPathMode: 'inside',
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].closed).toBe(true);
    expect(result.operations[0].cutSide).toBe('inside');
    expect(result.operations[0].pocketEnabled).toBe(false);
  });

  it('imports closed geometry with the requested along-path cut mode', () => {
    const svg = '<svg><polygon points="0,0 10,0 10,10 0,10" /></svg>';
    const result = importSvgToSketchOperations(svg, {
      ...buildOptions(),
      closedPathMode: 'along',
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].cutSide).toBe('along');
    expect(result.operations[0].pocketEnabled).toBe(false);
  });

  it('imports closed geometry as a pocket when requested', () => {
    const svg = '<svg><polygon points="0,0 10,0 10,10 0,10" /></svg>';
    const result = importSvgToSketchOperations(svg, {
      ...buildOptions(),
      closedPathMode: 'pocket',
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].cutSide).toBe('inside');
    expect(result.operations[0].pocketEnabled).toBe(true);
    expect(result.operations[0].pocketStepOver).toBeCloseTo(1.5875);
  });

  it('keeps open imported geometry on along-path even when a closed cut mode is selected', () => {
    const svg = '<svg><polyline points="0,0 10,0 10,5" /></svg>';
    const result = importSvgToSketchOperations(svg, {
      ...buildOptions(),
      closedPathMode: 'inside',
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].closed).toBe(false);
    expect(result.operations[0].cutSide).toBe('along');
    expect(result.operations[0].pocketEnabled).toBe(false);
  });

  it('samples curved path geometry into sketch segments', () => {
    const svg = '<svg><path d="M 0 0 C 20 0 20 20 0 20 Z" /></svg>';
    const result = importSvgToSketchOperations(svg, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].closed).toBe(true);
    expect(result.operations[0].segments.length).toBeGreaterThan(8);
  });

  it('applies simple transforms while importing', () => {
    const svg = '<svg><g transform="translate(5,10)"><line x1="0" y1="0" x2="10" y2="0" /></g></svg>';
    const result = importSvgToSketchOperations(svg, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].segments[0]).toMatchObject({
      x1: 5,
      x2: 15,
    });
  });

  it('returns warnings for unsupported elements', () => {
    const svg = '<svg><text x="0" y="0">Hello</text><line x1="0" y1="0" x2="5" y2="0" /></svg>';
    const result = importSvgToSketchOperations(svg, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes('Unsupported SVG element "text"'))).toBe(true);
  });
});
