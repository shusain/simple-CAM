import type { Point, RectOperation, Tool } from '../../types';
import { distanceBetween, getClosedPathLength, interpolatePoint } from './path';
import type { PathOperation, TabRange } from './shared';

function mergeRanges(ranges: TabRange[], totalLength: number): TabRange[] {
  if (!Array.isArray(ranges) || ranges.length === 0 || totalLength <= 0) {
    return [];
  }

  const expanded: TabRange[] = [];
  ranges.forEach((range) => {
    if (!range) return;
    let start = Number(range.start);
    let end = Number(range.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    if (start < 0) {
      start = 0;
    }
    if (end > totalLength) {
      end = totalLength;
    }
    if (end <= start) return;
    expanded.push({ start, end });
  });

  expanded.sort((a, b) => a.start - b.start);
  const merged: TabRange[] = [];
  expanded.forEach((range) => {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      return;
    }
    last.end = Math.max(last.end, range.end);
  });
  return merged;
}

function buildEvenTabRanges(totalLength: number, tabCount: number, tabWidth: number, toolDiameter = 0): TabRange[] {
  if (totalLength <= 0 || tabCount < 1 || tabWidth <= 0) {
    return [];
  }

  const compensatedWidth = Math.max(tabWidth, tabWidth + Math.max(0, toolDiameter));
  const safeWidth = Math.min(compensatedWidth, totalLength / tabCount);
  const ranges: TabRange[] = [];
  for (let i = 0; i < tabCount; i += 1) {
    const center = ((i + 0.5) * totalLength) / tabCount;
    ranges.push({
      start: center - safeWidth / 2,
      end: center + safeWidth / 2,
    });
  }
  return mergeRanges(ranges, totalLength);
}

function buildRectTabRanges(pathPoints: Point[], operation: RectOperation, toolDiameter = 0): TabRange[] {
  const totalLength = getClosedPathLength(pathPoints);
  const tabCount = Math.max(1, Math.round(Number(operation.tabCount) || 1));
  const tabWidth = Math.max(0.1, Math.abs(Number(operation.tabWidth) || 1));

  if (tabCount > 4) {
    return buildEvenTabRanges(totalLength, tabCount, tabWidth, toolDiameter);
  }

  const lengths: Array<{ index: number; start: number; length: number }> = [];
  let cursor = 0;
  for (let i = 1; i < pathPoints.length; i += 1) {
    const segmentLength = distanceBetween(pathPoints[i - 1], pathPoints[i]);
    lengths.push({
      index: i - 1,
      start: cursor,
      length: segmentLength,
    });
    cursor += segmentLength;
  }

  const sorted = [...lengths].sort((a, b) => b.length - a.length || a.index - b.index);
  const compensatedWidth = Math.max(tabWidth, tabWidth + Math.max(0, toolDiameter));
  const ranges: TabRange[] = [];
  for (let i = 0; i < tabCount; i += 1) {
    const segment = sorted[i % sorted.length];
    const slot = Math.floor(i / sorted.length);
    const slotsForSegment = Math.floor((tabCount - 1 - (i % sorted.length)) / sorted.length) + 1;
    const center = segment.start + ((slot + 1) * segment.length) / (slotsForSegment + 1);
    ranges.push({
      start: center - compensatedWidth / 2,
      end: center + compensatedWidth / 2,
    });
  }

  return mergeRanges(ranges, totalLength);
}

export function getTabRanges(pathPoints: Point[], operation: PathOperation, tool: Tool | null): TabRange[] {
  if (!('tabsEnabled' in operation) || !operation.tabsEnabled) {
    return [];
  }

  const totalLength = getClosedPathLength(pathPoints);
  const tabCount = Math.max(1, Math.round(Number(operation.tabCount) || 1));
  const tabWidth = Math.max(0.1, Math.abs(Number(operation.tabWidth) || 1));
  const toolDiameter = Math.max(0, Number(tool?.diameter) || 0);

  if (operation.type === 'rect') {
    return buildRectTabRanges(pathPoints, operation, toolDiameter);
  }

  if (operation.type === 'circle') {
    return buildEvenTabRanges(totalLength, tabCount, tabWidth, toolDiameter);
  }

  if (operation.type === 'sketch' && operation.closed) {
    return buildEvenTabRanges(totalLength, tabCount, tabWidth, toolDiameter);
  }

  return [];
}

export function appendPathWithTabs(
  lines: string[],
  pathPoints: Point[],
  depth: number,
  liftedDepth: number,
  cutFeed: string,
  plungeFeed: string,
  tabRanges: TabRange[]
): void {
  let traveled = 0;
  let rangeIndex = 0;
  let liftedForTab = false;
  let activeTabNumber = 0;

  for (let i = 1; i < pathPoints.length; i += 1) {
    const start = pathPoints[i - 1];
    const end = pathPoints[i];
    const segmentLength = distanceBetween(start, end);
    const segmentStart = traveled;
    const segmentEnd = traveled + segmentLength;

    while (rangeIndex < tabRanges.length && tabRanges[rangeIndex].end <= segmentStart) {
      rangeIndex += 1;
    }

    if (segmentLength <= 0.000001 || rangeIndex >= tabRanges.length || tabRanges[rangeIndex].start >= segmentEnd) {
      lines.push(`G1 X${end.x.toFixed(3)} Y${end.y.toFixed(3)} F${cutFeed}`);
      traveled = segmentEnd;
      continue;
    }

    let cursor = segmentStart;
    while (rangeIndex < tabRanges.length) {
      const range = tabRanges[rangeIndex];
      if (range.start >= segmentEnd) {
        break;
      }

      const tabStart = Math.max(cursor, range.start);
      if (tabStart > cursor + 0.000001) {
        const tabStartPoint = interpolatePoint(start, end, tabStart - segmentStart);
        lines.push(`G1 X${tabStartPoint.x.toFixed(3)} Y${tabStartPoint.y.toFixed(3)} F${cutFeed}`);
      }

      if (!liftedForTab) {
        activeTabNumber = rangeIndex + 1;
        lines.push(`; Tab ${activeTabNumber} start`);
        lines.push(`G1 Z${liftedDepth.toFixed(3)} F${plungeFeed}`);
        liftedForTab = true;
      }

      const tabEnd = Math.min(segmentEnd, range.end);
      const tabEndPoint = interpolatePoint(start, end, tabEnd - segmentStart);
      lines.push(`G1 X${tabEndPoint.x.toFixed(3)} Y${tabEndPoint.y.toFixed(3)} F${cutFeed}`);

      cursor = tabEnd;
      if (range.end <= segmentEnd) {
        lines.push(`; Tab ${activeTabNumber} end`);
        lines.push(`G1 Z${depth.toFixed(3)} F${plungeFeed}`);
        liftedForTab = false;
        rangeIndex += 1;
      } else {
        break;
      }
    }

    if (cursor < segmentEnd - 0.000001) {
      lines.push(`G1 X${end.x.toFixed(3)} Y${end.y.toFixed(3)} F${cutFeed}`);
    }

    traveled = segmentEnd;
  }
}
