import type { ImageFillOperation, Point } from '../types';

const MAX_IMPORT_DIMENSION = 1024;

export interface ImportedRasterImage {
  sourceName: string;
  pixelWidth: number;
  pixelHeight: number;
  grayscaleData: string;
}

export interface RasterPowerSample {
  end: Point;
  powerPercent: number;
  outputPower: number;
}

export interface RasterScanRow {
  start: Point;
  end: Point;
  samples: RasterPowerSample[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function encodeGrayscaleBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function decodeGrayscaleBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function importRasterImageDataUrl(
  dataUrl: string,
  sourceName: string
): Promise<ImportedRasterImage> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Raster image decoding requires the desktop or browser renderer');
  }

  const image = new Image();
  image.src = dataUrl;
  if (typeof image.decode === 'function') {
    await image.decode();
  } else {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to decode the selected image'));
    });
  }

  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const scale = Math.min(
    1,
    MAX_IMPORT_DIMENSION / Math.max(sourceWidth, sourceHeight)
  );
  const pixelWidth = Math.max(1, Math.round(sourceWidth * scale));
  const pixelHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Unable to create an image decoding canvas');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pixelWidth, pixelHeight);
  context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
  const imageData = context.getImageData(0, 0, pixelWidth, pixelHeight);
  const grayscale = new Uint8Array(pixelWidth * pixelHeight);

  for (let index = 0; index < grayscale.length; index += 1) {
    const offset = index * 4;
    const alpha = imageData.data[offset + 3] / 255;
    const luminance =
      imageData.data[offset] * 0.2126 +
      imageData.data[offset + 1] * 0.7152 +
      imageData.data[offset + 2] * 0.0722;
    grayscale[index] = Math.round(luminance * alpha + 255 * (1 - alpha));
  }

  return {
    sourceName,
    pixelWidth,
    pixelHeight,
    grayscaleData: encodeGrayscaleBytes(grayscale),
  };
}

export function getRasterPowerPercent(
  luminance: number,
  minimumPower: number,
  maximumPower: number
): number {
  const minimum = clamp(Number(minimumPower) || 0, 0, 100);
  const maximum = clamp(Number(maximumPower) || 0, minimum, 100);
  const darkness = 1 - clamp(luminance, 0, 255) / 255;
  return minimum + darkness * (maximum - minimum);
}

export function rasterPowerPercentToS(powerPercent: number): number {
  return Math.round((clamp(powerPercent, 0, 100) / 100) * 255);
}

export function buildRasterScanRows(
  operation: ImageFillOperation,
  options: { includePowerSamples?: boolean } = {}
): RasterScanRow[] {
  const width = Math.max(0.01, Math.abs(Number(operation.width) || 0.01));
  const height = Math.max(0.01, Math.abs(Number(operation.height) || 0.01));
  const interval = Math.max(
    0.01,
    Number(operation.laserLineInterval) || 0.1
  );
  const columns = Math.max(1, Math.ceil(width / interval));
  const rows = Math.max(1, Math.ceil(height / interval));
  const includePowerSamples = options.includePowerSamples !== false;
  const grayscale = includePowerSamples
    ? decodeGrayscaleBytes(operation.grayscaleData)
    : null;
  const sourceWidth = Math.max(1, Math.round(operation.pixelWidth));
  const sourceHeight = Math.max(1, Math.round(operation.pixelHeight));
  const result: RasterScanRow[] = [];
  const center = {
    x: operation.x + width / 2,
    y: operation.y + height / 2,
  };
  const angle = Number(operation.rotation) || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toWorld = (point: Point): Point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  };

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const sourceY = Math.min(
      sourceHeight - 1,
      Math.floor(((rowIndex + 0.5) / rows) * sourceHeight)
    );
    const y =
      operation.y + height - ((rowIndex + 0.5) / rows) * height;
    const leftToRight = rowIndex % 2 === 0;
    const samples: RasterPowerSample[] = [];

    if (includePowerSamples) {
      for (let scanIndex = 0; scanIndex < columns; scanIndex += 1) {
        const columnIndex = leftToRight
          ? scanIndex
          : columns - scanIndex - 1;
        const sourceX = Math.min(
          sourceWidth - 1,
          Math.floor(((columnIndex + 0.5) / columns) * sourceWidth)
        );
        const luminance =
          grayscale?.[sourceY * sourceWidth + sourceX] ?? 255;
        const powerPercent = getRasterPowerPercent(
          luminance,
          operation.laserPowerMin,
          operation.laserPowerMax
        );
        const boundaryIndex = leftToRight
          ? scanIndex + 1
          : columns - scanIndex - 1;
        samples.push({
          end: toWorld({
            x: operation.x + (boundaryIndex / columns) * width,
            y,
          }),
          powerPercent,
          outputPower: rasterPowerPercentToS(powerPercent),
        });
      }
    }

    const rowEnd = toWorld({
      x: leftToRight ? operation.x + width : operation.x,
      y,
    });

    result.push({
      start: toWorld({
        x: leftToRight ? operation.x : operation.x + width,
        y,
      }),
      end: samples[samples.length - 1]?.end || rowEnd,
      samples,
    });
  }

  return result;
}

const previewCanvasCache = new Map<string, HTMLCanvasElement>();

export function getRasterPreviewCanvas(
  operation: ImageFillOperation
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const cacheKey = `${operation.id}:${operation.pixelWidth}x${operation.pixelHeight}:${operation.grayscaleData.length}`;
  const cached = previewCanvasCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const width = Math.max(1, Math.round(operation.pixelWidth));
  const height = Math.max(1, Math.round(operation.pixelHeight));
  const grayscale = decodeGrayscaleBytes(operation.grayscaleData);
  if (grayscale.length < width * height) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const imageData = context.createImageData(width, height);
  for (let index = 0; index < width * height; index += 1) {
    const value = grayscale[index];
    const offset = index * 4;
    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
    imageData.data[offset + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  previewCanvasCache.set(cacheKey, canvas);
  return canvas;
}
