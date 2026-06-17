import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { importDxfToSketchOperations } from './importDxf';

function buildOptions() {
  let counter = 0;
  return {
    depth: -2,
    closedPathMode: 'outside' as const,
    toolId: 'tool-1',
    toolDiameter: 3.175,
    materialId: 'material-1',
    createId: () => `dxf-${counter += 1}`,
  };
}

function wrapEntities(entities: string, header = '9\n$INSUNITS\n70\n4'): string {
  return `0
SECTION
2
HEADER
${header}
0
ENDSEC
0
SECTION
2
ENTITIES
${entities}
0
ENDSEC
0
EOF`;
}

describe('importDxfToSketchOperations', () => {
  it('imports a line entity as an open along-path sketch', () => {
    const dxf = wrapEntities(`0
LINE
10
0
20
0
11
10
21
5`);

    const result = importDxfToSketchOperations(dxf, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      closed: false,
      cutSide: 'along',
    });
    expect(result.operations[0].segments).toHaveLength(1);
  });

  it('imports a closed lwpolyline with the requested cut mode', () => {
    const dxf = wrapEntities(`0
LWPOLYLINE
70
1
10
0
20
0
10
10
20
0
10
10
20
10
10
0
20
10`);

    const result = importDxfToSketchOperations(dxf, {
      ...buildOptions(),
      closedPathMode: 'inside',
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      closed: true,
      cutSide: 'inside',
      pocketEnabled: false,
    });
    expect(result.operations[0].segments).toHaveLength(4);
  });

  it('imports circles as closed pocket-capable sketches', () => {
    const dxf = wrapEntities(`0
CIRCLE
10
5
20
5
40
3`);

    const result = importDxfToSketchOperations(dxf, {
      ...buildOptions(),
      closedPathMode: 'pocket',
    });

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      closed: true,
      cutSide: 'inside',
      pocketEnabled: true,
    });
    expect(result.operations[0].segments).toHaveLength(4);
    expect(result.operations[0].pocketStepOver).toBeCloseTo(1.5875);
  });

  it('imports arc entities as sketch arc segments', () => {
    const dxf = wrapEntities(`0
ARC
10
0
20
0
40
5
50
0
51
90`);

    const result = importDxfToSketchOperations(dxf, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].segments).toHaveLength(1);
    expect(result.operations[0].segments[0].type).toBe('arc');
  });

  it('imports legacy polyline entities', () => {
    const dxf = wrapEntities(`0
POLYLINE
70
1
0
VERTEX
10
0
20
0
0
VERTEX
10
10
20
0
0
VERTEX
10
10
20
10
0
VERTEX
10
0
20
10
0
SEQEND`);

    const result = importDxfToSketchOperations(dxf, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      closed: true,
      cutSide: 'outside',
    });
    expect(result.operations[0].segments).toHaveLength(4);
  });

  it('chains connected line entities into a single closed sketch', () => {
    const dxf = wrapEntities(`0
LINE
10
0
20
0
11
10
21
0
0
LINE
10
10
20
0
11
10
21
10
0
LINE
10
10
20
10
11
0
21
10
0
LINE
10
0
20
10
11
0
21
0`);

    const result = importDxfToSketchOperations(dxf, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      closed: true,
      cutSide: 'outside',
    });
    expect(result.operations[0].segments).toHaveLength(4);
  });

  it('applies INSUNITS scaling when importing', () => {
    const dxf = wrapEntities(
      `0
LINE
10
1
20
0
11
2
21
0`,
      '9\n$INSUNITS\n70\n1'
    );

    const result = importDxfToSketchOperations(dxf, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].segments[0]).toMatchObject({
      x1: 25.4,
      x2: 50.8,
    });
  });

  it('warns for unsupported entities', () => {
    const dxf = wrapEntities(`0
SPLINE
8
0
0
LINE
10
0
20
0
11
2
21
0`);

    const result = importDxfToSketchOperations(dxf, buildOptions());

    expect(result.operations).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes('Unsupported DXF entity "SPLINE"'))).toBe(true);
  });

  it('imports the Onshape Release 14 hold-down sample without unit warnings', () => {
    const dxf = fs.readFileSync('src/test/samples/hold-down.dxf', 'utf8');

    const result = importDxfToSketchOperations(dxf, buildOptions());

    expect(result.operations).toHaveLength(11);
    expect(result.warnings).toEqual([]);

    const circleOperations = result.operations.filter((operation) => operation.segments.length === 4);
    const outerProfile = result.operations.find((operation) => operation.segments.length === 8);

    expect(circleOperations).toHaveLength(10);
    expect(outerProfile).toBeTruthy();
    expect(outerProfile?.closed).toBe(true);
    expect(outerProfile?.segments.filter((segment) => segment.type === 'arc')).toHaveLength(4);
  });
});
