import type {
  LaserTestPatternOptions,
  MachineSettings,
  Operation,
  TextOperation,
  Tool,
} from '../types';
import { resolveLaserMaterialPreset } from './tooling';

interface BuildLaserTestPatternArgs {
  options: LaserTestPatternOptions;
  settings: Pick<MachineSettings, 'marginX' | 'marginY' | 'cutDepth'>;
  tool: Tool;
  materialId: string;
  materialName?: string;
  createId: () => string;
}

function interpolate(min: number, max: number, index: number, count: number): number {
  return count <= 1 ? min : min + ((max - min) * index) / (count - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatValue(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.max(...text.split(/\r?\n/).map((line) => line.length), 1) * fontSize * 0.62;
}

interface TextSettings {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  scaleX?: number;
  rotation?: number;
}

export function buildLaserTestPattern({
  options,
  settings,
  tool,
  materialId,
  materialName,
  createId,
}: BuildLaserTestPatternArgs): Operation[] {
  const operations: Operation[] = [];
  const horizontalInset = options.process === 'etch' ? options.overscan : 0;
  const materialPreset = resolveLaserMaterialPreset(tool, materialId);
  const gridWidth =
    options.columns * options.rectangleWidth +
    Math.max(0, options.columns - 1) * options.gap;
  const gridHeight =
    options.rows * options.rectangleHeight +
    Math.max(0, options.rows - 1) * options.gap;
  const labelFontSize = clamp(
    Math.min(options.rectangleWidth, options.rectangleHeight) * 0.32,
    1.8,
    4
  );
  const titleFontSize = clamp(gridWidth / 16, 3.5, 6);
  const summaryFontSize = clamp(titleFontSize * 0.55, 1.8, 3);
  const axisFontSize = clamp(labelFontSize * 1.05, 1.8, 4);
  const axisGap = Math.max(1, labelFontSize * 0.5);
  const powerLabels = Array.from({ length: options.rows }, (_, row) =>
    `${formatValue(interpolate(options.powerMin, options.powerMax, row, options.rows))}%`
  );
  const powerLabelWidth = Math.max(
    ...powerLabels.map((label) => estimateTextWidth(label, labelFontSize))
  );
  const gridX =
    settings.marginX +
    axisFontSize +
    axisGap +
    powerLabelWidth +
    axisGap +
    horizontalInset;
  const gridY =
    settings.marginY +
    axisFontSize +
    axisGap +
    labelFontSize +
    axisGap;

  function addLabel({
    x,
    y,
    text,
    fontSize,
    scaleX = 1,
    rotation = 0,
  }: TextSettings): void {
    const operation: TextOperation = {
      id: createId(),
      type: 'text',
      x,
      y,
      text,
      fontId: 'liberation-sans',
      fontSize,
      lineHeight: 1.25,
      rotation,
      scaleX,
      scaleY: 1,
      depth: settings.cutDepth,
      toolId: tool.id,
      materialId,
      cutSide: 'along',
      tabsEnabled: false,
      tabCount: 2,
      tabWidth: 1,
      tabHeight: 1,
      pocketEnabled: false,
      pocketStepOver: Math.max(0.1, materialPreset.kerfDiameter),
      laserProcess: 'cut',
      laserPower: options.labelPower,
      laserSpeed: options.labelSpeed,
      laserPasses: 1,
      laserLineInterval: Math.max(0.01, materialPreset.kerfDiameter),
      laserOverscan: 0,
    };
    operations.push(operation);
  }

  const processLabel = options.process === 'etch' ? 'ETCH' : 'CUT';
  const title = `LASER TEST PATTERN${materialName ? ` - ${materialName.toUpperCase()}` : ''}`;
  const summaryLines = [
    `${processLabel} | SPEED ${formatValue(options.speedMin)}-${formatValue(options.speedMax)} MM/MIN | POWER ${formatValue(options.powerMin)}-${formatValue(options.powerMax)}%`,
    `LABELS ALONG PATH | ${formatValue(options.labelPower)}% POWER | ${formatValue(options.labelSpeed)} MM/MIN`,
    `GRID ${options.columns}X${options.rows} | CELL ${formatValue(options.rectangleWidth)}X${formatValue(options.rectangleHeight)} MM | GAP ${formatValue(options.gap)} MM`,
    ...(options.process === 'etch'
      ? [
          `INTERVAL ${formatValue(options.lineInterval)} MM | OVERSCAN ${formatValue(options.overscan)} MM`,
        ]
      : []),
  ];
  const summary = summaryLines.join('\n');
  const titleScaleX = Math.min(1, gridWidth / estimateTextWidth(title, titleFontSize));
  const summaryScaleX = Math.min(
    1,
    gridWidth / estimateTextWidth(summary, summaryFontSize)
  );
  const summaryY = gridY + gridHeight + axisGap;
  const summaryHeight = summaryLines.length * summaryFontSize * 1.25;
  const titleY = summaryY + summaryHeight + axisGap * 0.5;

  addLabel({
    x: gridX,
    y: titleY,
    text: title,
    fontSize: titleFontSize,
    scaleX: titleScaleX,
  });
  addLabel({
    x: gridX,
    y: summaryY,
    text: summary,
    fontSize: summaryFontSize,
    scaleX: summaryScaleX,
  });

  const speedAxisWidth = estimateTextWidth('SPEED', axisFontSize);
  const speedAxisScaleX = Math.min(1, gridWidth / speedAxisWidth);
  addLabel({
    x: gridX + (gridWidth - speedAxisWidth * speedAxisScaleX) / 2,
    y: settings.marginY,
    text: 'SPEED',
    fontSize: axisFontSize,
    scaleX: speedAxisScaleX,
  });

  const powerAxisHeight = estimateTextWidth('POWER', axisFontSize);
  const powerAxisScaleX = Math.min(1, gridHeight / powerAxisHeight);
  addLabel({
    x: settings.marginX + axisFontSize,
    y: gridY + (gridHeight - powerAxisHeight * powerAxisScaleX) / 2,
    text: 'POWER',
    fontSize: axisFontSize,
    scaleX: powerAxisScaleX,
    rotation: Math.PI / 2,
  });

  for (let column = 0; column < options.columns; column += 1) {
    const speedLabel = formatValue(
      interpolate(options.speedMin, options.speedMax, column, options.columns)
    );
    const labelWidth = estimateTextWidth(speedLabel, labelFontSize);
    const labelScaleX = Math.min(1, options.rectangleWidth / labelWidth);
    const scaledLabelWidth = labelWidth * labelScaleX;
    addLabel({
      x:
        gridX +
        column * (options.rectangleWidth + options.gap) +
        (options.rectangleWidth - scaledLabelWidth) / 2,
      y: settings.marginY + axisFontSize + axisGap,
      text: speedLabel,
      fontSize: labelFontSize,
      scaleX: labelScaleX,
    });
  }

  for (let row = 0; row < options.rows; row += 1) {
    addLabel({
      x: settings.marginX + axisFontSize + axisGap,
      y:
        gridY +
        row * (options.rectangleHeight + options.gap) +
        Math.max(0, (options.rectangleHeight - labelFontSize) / 2),
      text: powerLabels[row],
      fontSize: labelFontSize,
    });
  }

  for (let row = 0; row < options.rows; row += 1) {
    const power = interpolate(options.powerMin, options.powerMax, row, options.rows);
    for (let column = 0; column < options.columns; column += 1) {
      const speed = interpolate(options.speedMin, options.speedMax, column, options.columns);
      operations.push({
        id: createId(),
        type: 'rect',
        x: gridX + column * (options.rectangleWidth + options.gap),
        y: gridY + row * (options.rectangleHeight + options.gap),
        width: options.rectangleWidth,
        height: options.rectangleHeight,
        cornerRadius: 0,
        depth: settings.cutDepth,
        toolId: tool.id,
        materialId,
        cutSide: 'along',
        tabsEnabled: false,
        tabCount: 2,
        tabWidth: 1,
        tabHeight: 1,
        pocketEnabled: false,
        pocketStepOver: Math.max(0.1, materialPreset.kerfDiameter),
        laserProcess: options.process,
        laserPower: power,
        laserSpeed: speed,
        laserPasses: 1,
        laserLineInterval: options.lineInterval,
        laserOverscan: options.process === 'etch' ? options.overscan : 0,
      });
    }
  }

  return operations;
}
