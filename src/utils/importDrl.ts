import type { DrillOperation, Tool } from '../types';

export interface ImportDrlOptions {
  createId: () => string;
  depth: number;
  activeToolId?: string;
  tools?: Tool[];
  materialId?: string;
}

export interface ImportDrlResult {
  operations: DrillOperation[];
  warnings: string[];
}

type Units = 'mm' | 'inch';

interface ParsedToolDefinition {
  code: string;
  diameterMm: number | null;
}

interface ParsedHole {
  x: number;
  y: number;
  toolCode: string | null;
}

const TOOL_MATCH_TOLERANCE_MM = 0.05;

function convertToMillimeters(value: number, units: Units): number {
  return units === 'inch' ? value * 25.4 : value;
}

function parseCoordinateValue(raw: string, units: Units): number | null {
  if (!raw) {
    return null;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (raw.includes('.')) {
    return convertToMillimeters(numeric, units);
  }

  // KiCad typically emits decimal coordinates, but accept integer forms as a
  // simple fallback for common Excellon zero-suppressed exports.
  const scale = units === 'inch' ? 10000 : 1000;
  return convertToMillimeters(numeric / scale, units);
}

function stripComment(line: string): string {
  return line.replace(/;.*$/, '').trim();
}

function findBestToolId(
  diameterMm: number | null,
  tools: Tool[],
  activeToolId: string | undefined
): string | undefined {
  if (diameterMm !== null) {
    const match = tools
      .map((tool) => ({
        id: tool.id,
        difference: Math.abs((Number(tool.diameter) || 0) - diameterMm),
      }))
      .sort((a, b) => a.difference - b.difference)[0];

    if (match && match.difference <= TOOL_MATCH_TOLERANCE_MM) {
      return match.id;
    }
  }

  return activeToolId || tools[0]?.id;
}

export function importDrlToDrillOperations(
  contents: string,
  options: ImportDrlOptions
): ImportDrlResult {
  const warnings: string[] = [];
  const operations: DrillOperation[] = [];

  if (!contents.trim()) {
    return {
      operations,
      warnings: ['DRL import failed: file contents were empty'],
    };
  }

  const lines = contents.replace(/\r/g, '').split('\n');
  let units: Units = 'mm';
  let convertedFromInches = false;
  let currentToolCode: string | null = null;
  let lastX: number | null = null;
  let lastY: number | null = null;
  const parsedHoles: ParsedHole[] = [];
  const toolDefinitions = new Map<string, ParsedToolDefinition>();
  const missingToolWarnings = new Set<string>();

  lines.forEach((rawLine) => {
    const line = stripComment(rawLine);
    if (!line || line === '%' || line === 'M48' || line === 'M30') {
      return;
    }

    if (/^METRIC/i.test(line) || /^M71$/i.test(line)) {
      units = 'mm';
      return;
    }

    if (/^INCH/i.test(line) || /^M72$/i.test(line)) {
      units = 'inch';
      convertedFromInches = true;
      return;
    }

    const toolDefinitionMatch = line.match(/^T(\d+)(?:C([+-]?\d*\.?\d+))$/i);
    if (toolDefinitionMatch) {
      const code = `T${toolDefinitionMatch[1]}`;
      const diameterRaw = Number(toolDefinitionMatch[2]);
      toolDefinitions.set(code, {
        code,
        diameterMm: Number.isFinite(diameterRaw) ? convertToMillimeters(diameterRaw, units) : null,
      });
      return;
    }

    const toolSelectMatch = line.match(/^T(\d+)$/i);
    if (toolSelectMatch) {
      currentToolCode = `T${toolSelectMatch[1]}`;
      return;
    }

    const coordinateMatch = line.match(/^(?:X([+-]?\d*\.?\d+))?(?:Y([+-]?\d*\.?\d+))?$/i);
    if (!coordinateMatch || (!coordinateMatch[1] && !coordinateMatch[2])) {
      return;
    }

    const nextX = coordinateMatch[1] ? parseCoordinateValue(coordinateMatch[1], units) : lastX;
    const nextY = coordinateMatch[2] ? parseCoordinateValue(coordinateMatch[2], units) : lastY;

    if (nextX === null || nextY === null) {
      warnings.push(`Skipped malformed drill coordinate "${line}"`);
      return;
    }

    lastX = nextX;
    lastY = nextY;

    if (!currentToolCode && !missingToolWarnings.has('missing-tool')) {
      missingToolWarnings.add('missing-tool');
      warnings.push('Some drill hits did not declare a tool, so the active tool was assigned');
    }

    parsedHoles.push({
      x: nextX,
      y: nextY,
      toolCode: currentToolCode,
    });
  });

  if (parsedHoles.length === 0) {
    return {
      operations,
      warnings: warnings.length > 0 ? warnings : ['DRL import failed: no drill hits were found'],
    };
  }

  const unmatchedDiameterWarnings = new Set<string>();

  parsedHoles.forEach((hole) => {
    const toolDefinition = hole.toolCode ? toolDefinitions.get(hole.toolCode) || null : null;
    const diameterMm = toolDefinition?.diameterMm ?? null;
    const toolId = findBestToolId(diameterMm, options.tools || [], options.activeToolId);

    if (
      hole.toolCode &&
      diameterMm !== null &&
      !toolId
    ) {
      const key = `${hole.toolCode}:${diameterMm.toFixed(3)}`;
      if (!unmatchedDiameterWarnings.has(key)) {
        unmatchedDiameterWarnings.add(key);
        warnings.push(
          `No matching tool exists for ${hole.toolCode} (${diameterMm.toFixed(3)}mm); imported drills were left unassigned`
        );
      }
    }

    operations.push({
      id: options.createId(),
      type: 'drill',
      x: hole.x,
      y: hole.y,
      depth: options.depth,
      toolId,
      materialId: options.materialId,
    });
  });

  if (convertedFromInches) {
    warnings.push('Converted DRL coordinates from inches to millimeters');
  }

  return { operations, warnings };
}
