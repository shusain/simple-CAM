import type {
  ImportedMesh,
  MachineSettings,
  Operation,
  Tool,
} from '../types';
import { getMillingToolHeightAtRadius } from './millingToolGeometry';
import { buildRasterScanRows } from './rasterImage';
import { resolveLaserMaterialPreset } from './tooling';
import {
  buildToolpathPreview3D,
  type Point3D,
  type ToolpathPreview3DSegment,
} from './toolpathPreview3d';

const DEFAULT_TARGET_CELL_SIZE = 1;
const DEFAULT_MAX_CELLS = 60_000;

export interface MaterialRemovalPreview {
  width: number;
  height: number;
  stockThickness: number;
  columns: number;
  rows: number;
  cellSizeX: number;
  cellSizeY: number;
  heights: Float32Array;
  /** 0 = untouched stock, 1 = flat/laser floor, 2 = smooth shaped-cutter envelope. */
  surfaceModes?: Uint8Array;
  minimumHeight: number;
  removedCellCount: number;
  simulatedOperationIds: string[];
  approximate: true;
  warnings: string[];
}

interface BuildMaterialRemovalPreviewArgs {
  operations: Operation[];
  settings: MachineSettings;
  tools: Tool[];
  importedMeshes?: ImportedMesh[];
  toolpathPreview?: ReturnType<typeof buildToolpathPreview3D>;
  targetCellSize?: number;
  maxCells?: number;
}

function positiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clampPercentage(value: unknown, fallback: number): number {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return Math.min(100, Math.max(0, resolved));
}

function buildGridDimensions(
  width: number,
  height: number,
  targetCellSize: number,
  maxCells: number
): {
  columns: number;
  rows: number;
  cellSizeX: number;
  cellSizeY: number;
  resolutionLimited: boolean;
} {
  const requestedColumns = Math.max(2, Math.ceil(width / targetCellSize) + 1);
  const requestedRows = Math.max(2, Math.ceil(height / targetCellSize) + 1);
  const requestedCells = requestedColumns * requestedRows;
  const resolutionScale =
    requestedCells > maxCells ? Math.sqrt(requestedCells / maxCells) : 1;
  const effectiveCellSize = targetCellSize * resolutionScale;
  const columns = Math.max(2, Math.ceil(width / effectiveCellSize) + 1);
  const rows = Math.max(2, Math.ceil(height / effectiveCellSize) + 1);

  return {
    columns,
    rows,
    cellSizeX: width / (columns - 1),
    cellSizeY: height / (rows - 1),
    resolutionLimited: resolutionScale > 1.0001,
  };
}

function sampleSegment(
  start: Point3D,
  end: Point3D,
  sampleSpacing: number,
  visit: (point: Point3D) => void
): void {
  const xyDistance = Math.hypot(end.x - start.x, end.y - start.y);
  const sampleCount =
    xyDistance <= 0.0001 ? 1 : Math.max(1, Math.ceil(xyDistance / sampleSpacing));

  for (let index = 0; index <= sampleCount; index += 1) {
    const amount = sampleCount === 0 ? 1 : index / sampleCount;
    visit({
      x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount,
      z: start.z + (end.z - start.z) * amount,
    });
  }
}

function shouldSimulateSegment(segment: ToolpathPreview3DSegment): boolean {
  return (
    (segment.kind === 'cut' || segment.kind === 'plunge') &&
    Boolean(segment.operationId)
  );
}

export function getMaterialRemovalHeight(
  preview: MaterialRemovalPreview,
  column: number,
  row: number
): number {
  const safeColumn = Math.max(0, Math.min(preview.columns - 1, Math.round(column)));
  const safeRow = Math.max(0, Math.min(preview.rows - 1, Math.round(row)));
  return preview.heights[safeRow * preview.columns + safeColumn];
}

export function buildMaterialRemovalPreview({
  operations,
  settings,
  tools,
  importedMeshes = [],
  toolpathPreview,
  targetCellSize = DEFAULT_TARGET_CELL_SIZE,
  maxCells = DEFAULT_MAX_CELLS,
}: BuildMaterialRemovalPreviewArgs): MaterialRemovalPreview {
  const width = positiveNumber(settings.workWidth, 1);
  const height = positiveNumber(settings.workHeight, 1);
  const stockThickness = positiveNumber(settings.stockThickness, 1);
  const requestedCellSize = positiveNumber(
    targetCellSize,
    DEFAULT_TARGET_CELL_SIZE
  );
  const cellLimit = Math.max(4, Math.round(positiveNumber(maxCells, DEFAULT_MAX_CELLS)));
  const grid = buildGridDimensions(
    width,
    height,
    requestedCellSize,
    cellLimit
  );
  const heights = new Float32Array(grid.columns * grid.rows);
  const surfaceModes = new Uint8Array(grid.columns * grid.rows);
  const operationMap = new Map(operations.map((operation) => [operation.id, operation]));
  const toolMap = new Map(tools.map((tool) => [tool.id, tool]));
  const simulatedOperationIds = new Set<string>();
  const missingToolOperationIds = new Set<string>();
  const removedCells = new Set<number>();
  const stockBottom = -stockThickness;
  const cellHalfDiagonal =
    Math.hypot(grid.cellSizeX, grid.cellSizeY) / 2;
  const motionSampleSpacing =
    Math.max(0.05, Math.min(grid.cellSizeX, grid.cellSizeY) / 2);
  const toolpath =
    toolpathPreview ||
    buildToolpathPreview3D({
      operations,
      settings,
      tools,
      importedMeshes,
    });

  function applyToolAtPoint(point: Point3D, tool: Tool): void {
    if (point.z >= 0) {
      return;
    }

    const toolRadius = Math.max(0, Number(tool.diameter) || 0) / 2;
    if (toolRadius <= 0) {
      return;
    }

    const affectedRadius = toolRadius + cellHalfDiagonal;
    const minColumn = Math.max(
      0,
      Math.floor((point.x - affectedRadius) / grid.cellSizeX)
    );
    const maxColumn = Math.min(
      grid.columns - 1,
      Math.ceil((point.x + affectedRadius) / grid.cellSizeX)
    );
    const minRow = Math.max(
      0,
      Math.floor((point.y - affectedRadius) / grid.cellSizeY)
    );
    const maxRow = Math.min(
      grid.rows - 1,
      Math.ceil((point.y + affectedRadius) / grid.cellSizeY)
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      const y = row * grid.cellSizeY;
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const x = column * grid.cellSizeX;
        const centerDistance = Math.hypot(x - point.x, y - point.y);
        if (centerDistance > affectedRadius) {
          continue;
        }

        const profileRadius = Math.max(0, centerDistance - cellHalfDiagonal);
        const toolSurfaceZ =
          point.z + getMillingToolHeightAtRadius(tool, profileRadius);
        if (toolSurfaceZ >= 0) {
          continue;
        }

        const index = row * grid.columns + column;
        const nextHeight = Math.max(
          stockBottom,
          Math.min(heights[index], toolSurfaceZ)
        );
        if (nextHeight < heights[index] - 0.000001) {
          heights[index] = nextHeight;
          surfaceModes[index] =
            tool.millingGeometry.type === 'flat-end' ? 1 : 2;
          removedCells.add(index);
        }
      }
    }
  }

  function applyLaserKerfAtPoint(
    point: Point3D,
    kerfDiameter: number,
    removalDepth: number
  ): void {
    const kerfRadius = Math.max(0, kerfDiameter) / 2;
    const targetHeight = Math.max(stockBottom, -Math.max(0, removalDepth));
    if (kerfRadius <= 0 || targetHeight >= -0.000001) {
      return;
    }

    const affectedRadius = kerfRadius + cellHalfDiagonal;
    const minColumn = Math.max(
      0,
      Math.floor((point.x - affectedRadius) / grid.cellSizeX)
    );
    const maxColumn = Math.min(
      grid.columns - 1,
      Math.ceil((point.x + affectedRadius) / grid.cellSizeX)
    );
    const minRow = Math.max(
      0,
      Math.floor((point.y - affectedRadius) / grid.cellSizeY)
    );
    const maxRow = Math.min(
      grid.rows - 1,
      Math.ceil((point.y + affectedRadius) / grid.cellSizeY)
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      const y = row * grid.cellSizeY;
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const x = column * grid.cellSizeX;
        if (Math.hypot(x - point.x, y - point.y) > affectedRadius) {
          continue;
        }

        const index = row * grid.columns + column;
        if (heights[index] > targetHeight + 0.000001) {
          heights[index] = targetHeight;
          surfaceModes[index] = 1;
          removedCells.add(index);
        }
      }
    }
  }

  operations.forEach((operation) => {
    if (operation.type !== 'image-fill') {
      return;
    }

    const tool = operation.toolId ? toolMap.get(operation.toolId) : undefined;
    if (!tool) {
      missingToolOperationIds.add(operation.id);
      return;
    }
    if (!tool.isLaser) {
      return;
    }

    const preset = resolveLaserMaterialPreset(tool, operation.materialId);
    const passes = Math.max(1, Math.round(Number(operation.laserPasses) || 1));
    let rows: ReturnType<typeof buildRasterScanRows>;
    try {
      rows = buildRasterScanRows(operation);
    } catch {
      return;
    }

    simulatedOperationIds.add(operation.id);
    rows.forEach((row) => {
      let sampleStart = { ...row.start, z: 0 };
      row.samples.forEach((sample) => {
        const sampleEnd = { ...sample.end, z: 0 };
        const removalDepth =
          preset.depthPerPassAtFullPower *
          (clampPercentage(sample.powerPercent, 0) / 100) *
          passes;
        sampleSegment(
          sampleStart,
          sampleEnd,
          motionSampleSpacing,
          (point) =>
            applyLaserKerfAtPoint(point, preset.kerfDiameter, removalDepth)
        );
        sampleStart = sampleEnd;
      });
    });
  });

  toolpath.segments.forEach((segment) => {
    if (!shouldSimulateSegment(segment) || !segment.operationId) {
      return;
    }

    const operation = operationMap.get(segment.operationId);
    const tool = operation?.toolId ? toolMap.get(operation.toolId) : undefined;
    if (!operation || !tool) {
      if (operation && !tool) {
        missingToolOperationIds.add(operation.id);
      }
      return;
    }

    simulatedOperationIds.add(operation.id);
    if (tool.isLaser) {
      if (operation.type === 'image-fill') {
        return;
      }
      const laserProcess =
        operation.laserProcess ||
        (operation.type === 'text' ? 'etch' : 'cut');
      const preset = resolveLaserMaterialPreset(tool, operation.materialId);
      const fallbackPower =
        laserProcess === 'etch' ? preset.etchPowerMin : preset.cutPowerMax;
      const powerPercent = clampPercentage(
        operation.laserPower,
        fallbackPower
      );
      const passes = Math.max(
        1,
        Math.round(Number(operation.laserPasses) || 1)
      );
      const removalDepth =
        preset.depthPerPassAtFullPower * (powerPercent / 100) * passes;
      for (let index = 1; index < segment.points.length; index += 1) {
        sampleSegment(
          segment.points[index - 1],
          segment.points[index],
          motionSampleSpacing,
          (point) =>
            applyLaserKerfAtPoint(
              point,
              preset.kerfDiameter,
              removalDepth
            )
        );
      }
      return;
    }

    for (let index = 1; index < segment.points.length; index += 1) {
      sampleSegment(
        segment.points[index - 1],
        segment.points[index],
        motionSampleSpacing,
        (point) => applyToolAtPoint(point, tool)
      );
    }
  });

  let minimumHeight = 0;
  heights.forEach((value) => {
    minimumHeight = Math.min(minimumHeight, value);
  });

  const warnings: string[] = [];
  if (grid.resolutionLimited) {
    warnings.push(
      `Result preview resolution was limited to ${grid.columns} × ${grid.rows} samples.`
    );
  }
  if (missingToolOperationIds.size > 0) {
    warnings.push(
      `${missingToolOperationIds.size} milling operation(s) were skipped because their tool was unavailable.`
    );
  }
  return {
    width,
    height,
    stockThickness,
    columns: grid.columns,
    rows: grid.rows,
    cellSizeX: grid.cellSizeX,
    cellSizeY: grid.cellSizeY,
    heights,
    surfaceModes,
    minimumHeight,
    removedCellCount: removedCells.size,
    simulatedOperationIds: [...simulatedOperationIds],
    approximate: true,
    warnings,
  };
}
