import type {
  LaserTestPatternOptions,
  MachineSettings,
  RectOperation,
  Tool,
} from '../types';
import { resolveLaserMaterialPreset } from './tooling';

interface BuildLaserTestPatternArgs {
  options: LaserTestPatternOptions;
  settings: Pick<MachineSettings, 'marginX' | 'marginY' | 'cutDepth'>;
  tool: Tool;
  materialId: string;
  createId: () => string;
}

function interpolate(min: number, max: number, index: number, count: number): number {
  return count <= 1 ? min : min + ((max - min) * index) / (count - 1);
}

export function buildLaserTestPattern({
  options,
  settings,
  tool,
  materialId,
  createId,
}: BuildLaserTestPatternArgs): RectOperation[] {
  const operations: RectOperation[] = [];
  const horizontalInset = options.process === 'etch' ? options.overscan : 0;
  const materialPreset = resolveLaserMaterialPreset(tool, materialId);

  for (let row = 0; row < options.rows; row += 1) {
    const power = interpolate(options.powerMin, options.powerMax, row, options.rows);
    for (let column = 0; column < options.columns; column += 1) {
      const speed = interpolate(options.speedMin, options.speedMax, column, options.columns);
      operations.push({
        id: createId(),
        type: 'rect',
        x:
          settings.marginX +
          horizontalInset +
          column * (options.rectangleWidth + options.gap),
        y: settings.marginY + row * (options.rectangleHeight + options.gap),
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
