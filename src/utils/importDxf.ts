import type { Point, SketchOperation, SketchSegment } from '../types';
import {
  buildImportedSketchOperationFromSegments,
  type ImportOperationOptions,
  pointsEqual,
} from './importCommon';

interface DxfGroup {
  code: number;
  value: string;
}

interface ImportDxfPath {
  segments: SketchSegment[];
  closed: boolean;
}

export type ImportDxfOptions = ImportOperationOptions;

export interface ImportDxfResult {
  operations: SketchOperation[];
  warnings: string[];
}

interface PolylineVertex {
  x: number;
  y: number;
  bulge: number;
}

const SUPPORTED_UNITS_TO_MM: Record<number, number> = {
  0: 1,
  1: 25.4,
  2: 304.8,
  4: 1,
  5: 10,
  6: 1000,
  9: 0.0254,
  13: 0.001,
  14: 100,
};

function toNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getSegmentStart(segment: SketchSegment): Point {
  return { x: segment.x1, y: segment.y1 };
}

function getSegmentEnd(segment: SketchSegment): Point {
  return { x: segment.x2, y: segment.y2 };
}

function reverseSegment(segment: SketchSegment): SketchSegment {
  if (segment.type === 'arc') {
    return {
      ...segment,
      x1: segment.x2,
      y1: segment.y2,
      x2: segment.x1,
      y2: segment.y1,
    };
  }

  return {
    ...segment,
    x1: segment.x2,
    y1: segment.y2,
    x2: segment.x1,
    y2: segment.y1,
  };
}

function parseGroups(dxfText: string): DxfGroup[] {
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const groups: DxfGroup[] = [];

  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index].trim());
    if (!Number.isFinite(code)) {
      continue;
    }

    groups.push({
      code,
      value: lines[index + 1] ?? '',
    });
  }

  return groups;
}

function getSection(groups: DxfGroup[], name: string): DxfGroup[] {
  for (let index = 0; index < groups.length - 1; index += 1) {
    if (
      groups[index].code === 0 &&
      groups[index].value.trim().toUpperCase() === 'SECTION' &&
      groups[index + 1]?.code === 2 &&
      groups[index + 1]?.value.trim().toUpperCase() === name
    ) {
      const sectionGroups: DxfGroup[] = [];
      for (let cursor = index + 2; cursor < groups.length; cursor += 1) {
        if (groups[cursor].code === 0 && groups[cursor].value.trim().toUpperCase() === 'ENDSEC') {
          return sectionGroups;
        }
        sectionGroups.push(groups[cursor]);
      }
      return sectionGroups;
    }
  }

  return [];
}

function readFirstValue(groups: DxfGroup[], code: number): string | undefined {
  return groups.find((group) => group.code === code)?.value;
}

function readHeaderVariableValue(headerGroups: DxfGroup[], variableName: string): string | undefined {
  for (let index = 0; index < headerGroups.length - 1; index += 1) {
    if (headerGroups[index].code === 9 && headerGroups[index].value.trim().toUpperCase() === variableName) {
      return headerGroups[index + 1]?.value;
    }
  }

  return undefined;
}

function parseInsUnits(headerGroups: DxfGroup[], warnings: string[]): number {
  const insUnitsValue = Number(readHeaderVariableValue(headerGroups, '$INSUNITS')?.trim());
  if (Number.isFinite(insUnitsValue)) {
    const scale = SUPPORTED_UNITS_TO_MM[insUnitsValue];
    if (scale) {
      if (insUnitsValue === 0) {
        warnings.push('DXF had unitless coordinates; assuming millimeters.');
      }
      return scale;
    }

    warnings.push(`DXF INSUNITS=${insUnitsValue} is not explicitly supported; assuming millimeters.`);
    return 1;
  }

  const measurementValue = Number(readHeaderVariableValue(headerGroups, '$MEASUREMENT')?.trim());
  if (measurementValue === 1) {
    return 1;
  }
  if (measurementValue === 0) {
    warnings.push('DXF did not declare INSUNITS but is marked imperial via $MEASUREMENT; assuming inches.');
    return 25.4;
  }

  warnings.push('DXF did not declare INSUNITS; assuming millimeters.');
  return 1;
}

function buildLineSegment(start: Point, end: Point): SketchSegment | null {
  if (distance(start, end) <= 0.0001) {
    return null;
  }

  return {
    type: 'line',
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  };
}

function buildArcSegment(start: Point, through: Point, end: Point): SketchSegment | null {
  if (distance(start, end) <= 0.0001) {
    return null;
  }

  return {
    type: 'arc',
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    throughX: through.x,
    throughY: through.y,
  };
}

function buildBulgeSegment(start: Point, end: Point, bulge: number): SketchSegment | null {
  if (!Number.isFinite(bulge) || Math.abs(bulge) <= 0.000001) {
    return buildLineSegment(start, end);
  }

  const chord = distance(start, end);
  if (chord <= 0.0001) {
    return null;
  }

  const theta = 4 * Math.atan(bulge);
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const normalLeft = {
    x: -dy / chord,
    y: dx / chord,
  };
  const centerOffset = (chord * (1 - bulge * bulge)) / (4 * bulge);
  const center = {
    x: midpoint.x + normalLeft.x * centerOffset,
    y: midpoint.y + normalLeft.y * centerOffset,
  };
  const radius = distance(center, start);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const throughAngle = startAngle + theta / 2;
  const through = {
    x: center.x + Math.cos(throughAngle) * radius,
    y: center.y + Math.sin(throughAngle) * radius,
  };

  return buildArcSegment(start, through, end);
}

function buildCenterArcSegment(
  center: Point,
  radius: number,
  startAngleRadians: number,
  endAngleRadians: number
): SketchSegment | null {
  if (!Number.isFinite(radius) || radius <= 0) {
    return null;
  }

  let sweep = endAngleRadians - startAngleRadians;
  while (sweep <= 0) {
    sweep += Math.PI * 2;
  }

  const start = {
    x: center.x + Math.cos(startAngleRadians) * radius,
    y: center.y + Math.sin(startAngleRadians) * radius,
  };
  const end = {
    x: center.x + Math.cos(endAngleRadians) * radius,
    y: center.y + Math.sin(endAngleRadians) * radius,
  };
  const throughAngle = startAngleRadians + sweep / 2;
  const through = {
    x: center.x + Math.cos(throughAngle) * radius,
    y: center.y + Math.sin(throughAngle) * radius,
  };

  return buildArcSegment(start, through, end);
}

function buildCircleSegments(center: Point, radius: number): SketchSegment[] {
  const segments: SketchSegment[] = [];
  const quarter = Math.PI / 2;

  for (let index = 0; index < 4; index += 1) {
    const segment = buildCenterArcSegment(center, radius, index * quarter, (index + 1) * quarter);
    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}

function collectPolylineVertices(groups: DxfGroup[], scale: number): PolylineVertex[] {
  const vertices: PolylineVertex[] = [];
  let current: PolylineVertex | null = null;

  groups.forEach((group) => {
    if (group.code === 10) {
      current = {
        x: toNumber(group.value) * scale,
        y: 0,
        bulge: 0,
      };
      vertices.push(current);
      return;
    }

    if (!current) {
      return;
    }

    if (group.code === 20) {
      current.y = toNumber(group.value) * scale;
    } else if (group.code === 42) {
      current.bulge = toNumber(group.value);
    }
  });

  return vertices.filter((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.y));
}

function buildSegmentsFromVertices(vertices: PolylineVertex[], closed: boolean): SketchSegment[] {
  const segments: SketchSegment[] = [];
  const segmentCount = closed ? vertices.length : vertices.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const segment = buildBulgeSegment(
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
      start.bulge
    );
    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}

function parseLineEntity(groups: DxfGroup[], scale: number): ImportDxfPath | null {
  const start = {
    x: toNumber(readFirstValue(groups, 10)) * scale,
    y: toNumber(readFirstValue(groups, 20)) * scale,
  };
  const end = {
    x: toNumber(readFirstValue(groups, 11)) * scale,
    y: toNumber(readFirstValue(groups, 21)) * scale,
  };
  const segment = buildLineSegment(start, end);
  return segment ? { segments: [segment], closed: false } : null;
}

function parseArcEntity(groups: DxfGroup[], scale: number): ImportDxfPath | null {
  const center = {
    x: toNumber(readFirstValue(groups, 10)) * scale,
    y: toNumber(readFirstValue(groups, 20)) * scale,
  };
  const radius = toNumber(readFirstValue(groups, 40)) * scale;
  const startAngle = (toNumber(readFirstValue(groups, 50)) * Math.PI) / 180;
  let endAngle = (toNumber(readFirstValue(groups, 51)) * Math.PI) / 180;

  if (![center.x, center.y, radius, startAngle, endAngle].every(Number.isFinite)) {
    return null;
  }

  while (endAngle <= startAngle) {
    endAngle += Math.PI * 2;
  }

  const segment = buildCenterArcSegment(center, radius, startAngle, endAngle);
  return segment ? { segments: [segment], closed: false } : null;
}

function parseCircleEntity(groups: DxfGroup[], scale: number): ImportDxfPath | null {
  const center = {
    x: toNumber(readFirstValue(groups, 10)) * scale,
    y: toNumber(readFirstValue(groups, 20)) * scale,
  };
  const radius = toNumber(readFirstValue(groups, 40)) * scale;

  if (![center.x, center.y, radius].every(Number.isFinite) || radius <= 0) {
    return null;
  }

  return {
    segments: buildCircleSegments(center, radius),
    closed: true,
  };
}

function parseLwPolylineEntity(groups: DxfGroup[], scale: number): ImportDxfPath | null {
  const flags = Math.round(toNumber(readFirstValue(groups, 70)) || 0);
  const closed = (flags & 1) === 1;
  const vertices = collectPolylineVertices(groups, scale);
  const segments = buildSegmentsFromVertices(vertices, closed);

  return segments.length > 0 ? { segments, closed } : null;
}

function parseLegacyPolylineEntity(
  groups: DxfGroup[],
  startIndex: number,
  scale: number,
  warnings: string[]
): { path: ImportDxfPath | null; nextIndex: number } {
  let cursor = startIndex + 1;
  const headerGroups: DxfGroup[] = [];

  while (cursor < groups.length && groups[cursor].code !== 0) {
    headerGroups.push(groups[cursor]);
    cursor += 1;
  }

  const flags = Math.round(toNumber(readFirstValue(headerGroups, 70)) || 0);
  if ((flags & 8) === 8 || (flags & 16) === 16 || (flags & 64) === 64) {
    warnings.push('3D/polyface DXF POLYLINE entities are not supported yet.');
    while (cursor < groups.length) {
      if (groups[cursor].code === 0 && groups[cursor].value.trim().toUpperCase() === 'SEQEND') {
        return { path: null, nextIndex: cursor + 1 };
      }
      cursor += 1;
    }
    return { path: null, nextIndex: cursor };
  }

  const vertices: PolylineVertex[] = [];

  while (cursor < groups.length) {
    if (groups[cursor].code !== 0) {
      cursor += 1;
      continue;
    }

    const entityType = groups[cursor].value.trim().toUpperCase();
    if (entityType === 'SEQEND') {
      const closed = (flags & 1) === 1;
      const segments = buildSegmentsFromVertices(vertices, closed);
      return {
        path: segments.length > 0 ? { segments, closed } : null,
        nextIndex: cursor + 1,
      };
    }

    if (entityType !== 'VERTEX') {
      return { path: null, nextIndex: cursor };
    }

    cursor += 1;
    const vertexGroups: DxfGroup[] = [];
    while (cursor < groups.length && groups[cursor].code !== 0) {
      vertexGroups.push(groups[cursor]);
      cursor += 1;
    }

    const x = toNumber(readFirstValue(vertexGroups, 10)) * scale;
    const y = toNumber(readFirstValue(vertexGroups, 20)) * scale;
    const bulge = toNumber(readFirstValue(vertexGroups, 42));
    if (Number.isFinite(x) && Number.isFinite(y)) {
      vertices.push({ x, y, bulge: Number.isFinite(bulge) ? bulge : 0 });
    }
  }

  return { path: null, nextIndex: cursor };
}

function chainLooseSegments(segments: SketchSegment[]): ImportDxfPath[] {
  const remaining = [...segments];
  const paths: ImportDxfPath[] = [];

  while (remaining.length > 0) {
    const chain: SketchSegment[] = [remaining.shift() as SketchSegment];
    let extended = true;

    while (extended && remaining.length > 0) {
      extended = false;
      const chainStart = getSegmentStart(chain[0]);
      const chainEnd = getSegmentEnd(chain[chain.length - 1]);

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const candidateStart = getSegmentStart(candidate);
        const candidateEnd = getSegmentEnd(candidate);

        if (pointsEqual(chainEnd, candidateStart)) {
          chain.push(candidate);
        } else if (pointsEqual(chainEnd, candidateEnd)) {
          chain.push(reverseSegment(candidate));
        } else if (pointsEqual(chainStart, candidateEnd)) {
          chain.unshift(candidate);
        } else if (pointsEqual(chainStart, candidateStart)) {
          chain.unshift(reverseSegment(candidate));
        } else {
          continue;
        }

        remaining.splice(index, 1);
        extended = true;
        break;
      }
    }

    const closed = chain.length > 1 && pointsEqual(getSegmentStart(chain[0]), getSegmentEnd(chain[chain.length - 1]));
    paths.push({ segments: chain, closed });
  }

  return paths;
}

function parseEntities(entityGroups: DxfGroup[], scale: number, warnings: string[]): ImportDxfPath[] {
  const closedPaths: ImportDxfPath[] = [];
  const looseSegments: SketchSegment[] = [];

  for (let index = 0; index < entityGroups.length; ) {
    if (entityGroups[index].code !== 0) {
      index += 1;
      continue;
    }

    const entityType = entityGroups[index].value.trim().toUpperCase();

    if (entityType === 'POLYLINE') {
      const parsed = parseLegacyPolylineEntity(entityGroups, index, scale, warnings);
      if (parsed.path) {
        if (parsed.path.closed) {
          closedPaths.push(parsed.path);
        } else {
          looseSegments.push(...parsed.path.segments);
        }
      }
      index = parsed.nextIndex;
      continue;
    }

    let cursor = index + 1;
    while (cursor < entityGroups.length && entityGroups[cursor].code !== 0) {
      cursor += 1;
    }
    const groups = entityGroups.slice(index + 1, cursor);

    let path: ImportDxfPath | null = null;
    if (entityType === 'LINE') {
      path = parseLineEntity(groups, scale);
    } else if (entityType === 'LWPOLYLINE') {
      path = parseLwPolylineEntity(groups, scale);
    } else if (entityType === 'ARC') {
      path = parseArcEntity(groups, scale);
    } else if (entityType === 'CIRCLE') {
      path = parseCircleEntity(groups, scale);
    } else if (!['VERTEX', 'SEQEND'].includes(entityType)) {
      warnings.push(`Unsupported DXF entity "${entityType}" was skipped.`);
    }

    if (path) {
      if (path.closed) {
        closedPaths.push(path);
      } else {
        looseSegments.push(...path.segments);
      }
    }

    index = cursor;
  }

  return [...closedPaths, ...chainLooseSegments(looseSegments)];
}

export function importDxfToSketchOperations(
  dxfText: string,
  options: ImportDxfOptions
): ImportDxfResult {
  const warnings: string[] = [];

  if (dxfText.includes('\u0000')) {
    return {
      operations: [],
      warnings: ['Binary DXF is not supported yet. Export the file as ASCII DXF and try again.'],
    };
  }

  const groups = parseGroups(dxfText);
  if (groups.length === 0) {
    return {
      operations: [],
      warnings: ['DXF parsing failed or did not contain readable ASCII group data.'],
    };
  }

  const headerGroups = getSection(groups, 'HEADER');
  const entityGroups = getSection(groups, 'ENTITIES');
  const unitScale = parseInsUnits(headerGroups, warnings);

  if (entityGroups.length === 0) {
    return {
      operations: [],
      warnings: warnings.length > 0 ? warnings : ['DXF did not contain an ENTITIES section.'],
    };
  }

  const paths = parseEntities(entityGroups, unitScale, warnings);
  const operations = paths
    .map((path) => buildImportedSketchOperationFromSegments(path.segments, path.closed, options))
    .filter((operation): operation is SketchOperation => Boolean(operation));

  if (operations.length === 0) {
    warnings.push('Imported DXF geometry did not produce any usable sketch operations.');
  }

  return { operations, warnings };
}
