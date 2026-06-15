import { getSketchSubpaths } from './geometry';
import { resolveToolPreset } from './tooling';

function num(value, digits = 3) {
  return Number(value).toFixed(digits);
}

function toNegativeDepth(value, fallbackDepth) {
  const source = Number.isFinite(value) ? Number(value) : Number(fallbackDepth);
  const finite = Number.isFinite(source) ? source : -1;
  return finite <= 0 ? finite : -finite;
}

function toPositiveStep(value, fallbackStep) {
  const source = Number.isFinite(value) ? Number(value) : Number(fallbackStep);
  const finite = Number.isFinite(source) ? Math.abs(source) : Math.abs(fallbackStep || 1);
  return Math.max(0.001, finite);
}

function buildIncrementDepths(targetNegativeDepth, increment) {
  const target = Math.abs(targetNegativeDepth);
  const step = toPositiveStep(increment, target || 1);

  const depths = [];
  let current = 0;

  while (current < target) {
    current = Math.min(target, current + step);
    depths.push(-current);
  }

  if (depths.length === 0) {
    depths.push(targetNegativeDepth);
  }

  return depths;
}

function getStartEndZ(settings) {
  const value = Number(settings.startEndZ);
  if (Number.isFinite(value)) {
    return value;
  }
  return Number(settings.safeZ) || 5;
}

function distanceBetween(a, b) {
  const dx = (b.x || 0) - (a.x || 0);
  const dy = (b.y || 0) - (a.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function interpolatePoint(a, b, distance) {
  const length = distanceBetween(a, b);
  if (length <= 0.000001) {
    return { x: a.x, y: a.y };
  }

  const ratio = clamp01(distance / length);
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getClosedPathLength(pathPoints) {
  let total = 0;
  for (let i = 1; i < pathPoints.length; i += 1) {
    total += distanceBetween(pathPoints[i - 1], pathPoints[i]);
  }
  return total;
}

function mergeRanges(ranges, totalLength) {
  if (!Array.isArray(ranges) || ranges.length === 0 || totalLength <= 0) {
    return [];
  }

  const expanded = [];
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
  const merged = [];
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

function buildEvenTabRanges(totalLength, tabCount, tabWidth, toolDiameter = 0) {
  if (totalLength <= 0 || tabCount < 1 || tabWidth <= 0) {
    return [];
  }

  const compensatedWidth = Math.max(tabWidth, tabWidth + Math.max(0, toolDiameter));
  const safeWidth = Math.min(compensatedWidth, totalLength / tabCount);
  const ranges = [];
  for (let i = 0; i < tabCount; i += 1) {
    const center = ((i + 0.5) * totalLength) / tabCount;
    ranges.push({
      start: center - safeWidth / 2,
      end: center + safeWidth / 2,
    });
  }
  return mergeRanges(ranges, totalLength);
}

function buildRectTabRanges(pathPoints, operation, toolDiameter = 0) {
  const totalLength = getClosedPathLength(pathPoints);
  const tabCount = Math.max(1, Math.round(Number(operation.tabCount) || 1));
  const tabWidth = Math.max(0.1, Math.abs(Number(operation.tabWidth) || 1));

  if (tabCount > 4) {
    return buildEvenTabRanges(totalLength, tabCount, tabWidth, toolDiameter);
  }

  const lengths = [];
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
  const ranges = [];
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

function getTabRanges(pathPoints, operation, tool) {
  if (!operation?.tabsEnabled) {
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

function appendPathWithTabs(lines, pathPoints, depth, liftedDepth, cutFeed, plungeFeed, tabRanges) {
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
      lines.push(`G1 X${num(end.x)} Y${num(end.y)} F${cutFeed}`);
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
        lines.push(`G1 X${num(tabStartPoint.x)} Y${num(tabStartPoint.y)} F${cutFeed}`);
      }

      if (!liftedForTab) {
        activeTabNumber = rangeIndex + 1;
        lines.push(`; Tab ${activeTabNumber} start`);
        lines.push(`G1 Z${num(liftedDepth)} F${plungeFeed}`);
        liftedForTab = true;
      }

      const tabEnd = Math.min(segmentEnd, range.end);
      const tabEndPoint = interpolatePoint(start, end, tabEnd - segmentStart);
      lines.push(`G1 X${num(tabEndPoint.x)} Y${num(tabEndPoint.y)} F${cutFeed}`);

      cursor = tabEnd;
      if (range.end <= segmentEnd) {
        lines.push(`; Tab ${activeTabNumber} end`);
        lines.push(`G1 Z${num(depth)} F${plungeFeed}`);
        liftedForTab = false;
        rangeIndex += 1;
      } else {
        break;
      }
    }

    if (cursor < segmentEnd - 0.000001) {
      lines.push(`G1 X${num(end.x)} Y${num(end.y)} F${cutFeed}`);
    }

    traveled = segmentEnd;
  }
}

function addHeader(lines, settings, operationCount) {
  const rapidFeed = num(settings.rapidFeedRate || 2400, 0);
  const startEndZ = num(getStartEndZ(settings));

  lines.push('; Simple CAM output');
  lines.push('; Target: Marlin (MPCNC)');
  lines.push(`; Operations: ${operationCount}`);
  lines.push(`; Work area: ${settings.workWidth} x ${settings.workHeight} mm`);
  lines.push('G21 ; mm units');
  lines.push('G90 ; absolute positioning');
  lines.push('G94 ; feed rate in units/min');
  lines.push(`G0 Z${startEndZ} F${rapidFeed}`);

  if (settings.spindleOn) {
    lines.push(`M3 S${Math.round(settings.spindleSpeed || 0)}`);
  }

  lines.push('');
}

function addFooter(lines, settings) {
  const rapidFeed = num(settings.rapidFeedRate || 2400, 0);
  const startEndZ = num(getStartEndZ(settings));

  lines.push('');
  lines.push('; Program end');
  lines.push(`G0 Z${startEndZ} F${rapidFeed}`);
  lines.push(`G0 X0 Y0 F${rapidFeed}`);

  if (settings.spindleOn) {
    lines.push('M5');
  }

  lines.push('M2');
}

function getOperationTool(operation, tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null;
  }

  const match = tools.find((tool) => tool.id === operation.toolId);
  return match || null;
}

function getToolRadius(tool) {
  const diameter = Number(tool?.diameter);
  if (!Number.isFinite(diameter) || diameter <= 0) {
    return 0;
  }
  return diameter / 2;
}

function getCutSide(operation, fallback = 'along') {
  return operation?.cutSide === 'inside' || operation?.cutSide === 'outside' || operation?.cutSide === 'along'
    ? operation.cutSide
    : fallback;
}

function normalizeRectGeometry(x, y, width, height) {
  let left = Number(x) || 0;
  let bottom = Number(y) || 0;
  let rectWidth = Number(width) || 0;
  let rectHeight = Number(height) || 0;

  if (rectWidth < 0) {
    left += rectWidth;
    rectWidth = Math.abs(rectWidth);
  }

  if (rectHeight < 0) {
    bottom += rectHeight;
    rectHeight = Math.abs(rectHeight);
  }

  return {
    x: left,
    y: bottom,
    width: rectWidth,
    height: rectHeight,
  };
}

function clampRectCornerRadius(radius, width, height) {
  const maxCorner = Math.max(0, Math.min(Math.abs(width), Math.abs(height)) / 2);
  const raw = Number(radius);
  const safe = Number.isFinite(raw) ? Math.abs(raw) : 0;
  return Math.min(safe, maxCorner);
}

function appendArc(path, cx, cy, radius, startAngle, endAngle, segments) {
  const count = Math.max(2, Math.floor(segments || 2));
  const span = endAngle - startAngle;
  const r = Math.abs(Number(radius) || 0);
  for (let i = 1; i <= count; i += 1) {
    const theta = startAngle + (span * i) / count;
    path.push({
      x: cx + Math.cos(theta) * r,
      y: cy + Math.sin(theta) * r,
    });
  }
}

function pointsEqual(a, b, tolerance = 0.0001) {
  return distanceBetween(a, b) <= tolerance;
}

function getClosedPolylinePoints(pathPoints) {
  if (!Array.isArray(pathPoints) || pathPoints.length < 4) {
    return null;
  }

  const points = pointsEqual(pathPoints[0], pathPoints[pathPoints.length - 1])
    ? pathPoints.slice(0, -1)
    : [...pathPoints];

  return points.length >= 3 ? points : null;
}

function getSignedArea(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function intersectInfiniteLines(a1, a2, b1, b2) {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denominator = dax * dby - day * dbx;

  if (Math.abs(denominator) <= 0.000001) {
    return null;
  }

  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denominator;
  return {
    x: a1.x + dax * t,
    y: a1.y + day * t,
  };
}

function offsetClosedPath(pathPoints, offsetDistance) {
  const points = getClosedPolylinePoints(pathPoints);
  if (!points || Math.abs(offsetDistance) <= 0.000001) {
    return points ? [...points, points[0]] : null;
  }

  const orientation = getSignedArea(points) >= 0 ? 1 : -1;
  const offsetPoints = [];

  for (let i = 0; i < points.length; i += 1) {
    const previous = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];

    const prevDx = current.x - previous.x;
    const prevDy = current.y - previous.y;
    const nextDx = next.x - current.x;
    const nextDy = next.y - current.y;
    const prevLength = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
    const nextLength = Math.sqrt(nextDx * nextDx + nextDy * nextDy);

    if (prevLength <= 0.000001 || nextLength <= 0.000001) {
      return null;
    }

    const prevLeftNormal = { x: -prevDy / prevLength, y: prevDx / prevLength };
    const nextLeftNormal = { x: -nextDy / nextLength, y: nextDx / nextLength };
    const sideSign = offsetDistance >= 0 ? 1 : -1;
    const magnitude = Math.abs(offsetDistance);
    const prevNormal = {
      x: prevLeftNormal.x * -orientation * sideSign,
      y: prevLeftNormal.y * -orientation * sideSign,
    };
    const nextNormal = {
      x: nextLeftNormal.x * -orientation * sideSign,
      y: nextLeftNormal.y * -orientation * sideSign,
    };

    const prevLineStart = { x: previous.x + prevNormal.x * magnitude, y: previous.y + prevNormal.y * magnitude };
    const prevLineEnd = { x: current.x + prevNormal.x * magnitude, y: current.y + prevNormal.y * magnitude };
    const nextLineStart = { x: current.x + nextNormal.x * magnitude, y: current.y + nextNormal.y * magnitude };
    const nextLineEnd = { x: next.x + nextNormal.x * magnitude, y: next.y + nextNormal.y * magnitude };

    const intersection = intersectInfiniteLines(prevLineStart, prevLineEnd, nextLineStart, nextLineEnd);
    if (intersection) {
      offsetPoints.push(intersection);
      continue;
    }

    const averageNormal = {
      x: prevNormal.x + nextNormal.x,
      y: prevNormal.y + nextNormal.y,
    };
    const averageLength = Math.sqrt(
      averageNormal.x * averageNormal.x + averageNormal.y * averageNormal.y
    );

    if (averageLength <= 0.000001) {
      offsetPoints.push({
        x: current.x + prevNormal.x * magnitude,
        y: current.y + prevNormal.y * magnitude,
      });
      continue;
    }

    offsetPoints.push({
      x: current.x + (averageNormal.x / averageLength) * magnitude,
      y: current.y + (averageNormal.y / averageLength) * magnitude,
    });
  }

  if (offsetPoints.length < 3) {
    return null;
  }

  return [...offsetPoints, offsetPoints[0]];
}

function buildRoundedRectPath(rect, cornerRadius, cornerSegments) {
  const width = Math.max(0, rect.width || 0);
  const height = Math.max(0, rect.height || 0);
  const radius = clampRectCornerRadius(cornerRadius, width, height);

  if (width <= 0 || height <= 0) {
    return [];
  }

  if (radius <= 0.0001) {
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + width, y: rect.y },
      { x: rect.x + width, y: rect.y + height },
      { x: rect.x, y: rect.y + height },
      { x: rect.x, y: rect.y },
    ];
  }

  const x = rect.x;
  const y = rect.y;
  const r = radius;
  const path = [{ x: x + r, y }];

  path.push({ x: x + width - r, y });
  appendArc(path, x + width - r, y + r, r, -Math.PI / 2, 0, cornerSegments);

  path.push({ x: x + width, y: y + height - r });
  appendArc(path, x + width - r, y + height - r, r, 0, Math.PI / 2, cornerSegments);

  path.push({ x: x + r, y: y + height });
  appendArc(path, x + r, y + height - r, r, Math.PI / 2, Math.PI, cornerSegments);

  path.push({ x, y: y + r });
  appendArc(path, x + r, y + r, r, Math.PI, (Math.PI * 3) / 2, cornerSegments);

  path.push({ x: x + r, y });
  return path;
}

function getToolKey(tool) {
  if (tool?.id) {
    return `tool:${tool.id}`;
  }
  return 'tool:none';
}

function formatToolLabel(tool) {
  if (!tool) {
    return 'Unassigned tool';
  }
  return `${tool.name} (Ø${num(tool.diameter)}mm)`;
}

function appendToolChange(lines, previousTool, nextTool, settings) {
  const rapidFeed = num(settings.rapidFeedRate || 2400, 0);
  const startEndZ = num(getStartEndZ(settings));

  lines.push('; Tool change required');
  lines.push(`; From: ${formatToolLabel(previousTool)} -> To: ${formatToolLabel(nextTool)}`);

  if (settings.spindleOn) {
    lines.push('M5');
  }

  lines.push(`G0 Z${startEndZ} F${rapidFeed}`);
  lines.push(`G0 X0 Y0 F${rapidFeed}`);
  lines.push(`M0 Change tool: ${formatToolLabel(nextTool)}`);

  if (settings.spindleOn) {
    lines.push(`M3 S${Math.round(settings.spindleSpeed || 0)}`);
  }

  lines.push('');
}

function appendEntryMove(lines, startPoint, rapidFeed, settings, useStartEndClearance) {
  if (useStartEndClearance) {
    lines.push(`G0 X${num(startPoint.x)} Y${num(startPoint.y)} F${rapidFeed}`);
    lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
    return;
  }

  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
  lines.push(`G0 X${num(startPoint.x)} Y${num(startPoint.y)} F${rapidFeed}`);
}

function appendDrill(lines, operation, settings, tool, useStartEndClearance = false) {
  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const rapidFeed = num(preset.rapidFeedRate, 0);
  const plungeFeed = num(preset.plungeFeedRate, 0);
  const finalDepth = toNegativeDepth(operation.depth, preset.drillDepth);
  const peckDepth = toPositiveStep(settings.peckDepth, Math.abs(finalDepth));
  const pecks = buildIncrementDepths(finalDepth, peckDepth);
  const peckRetractZ = 1;

  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  lines.push(
    `; Drill @ X${num(operation.x)} Y${num(operation.y)} depth ${num(finalDepth)} peck ${num(peckDepth)}`
  );
  appendEntryMove(lines, { x: operation.x, y: operation.y }, rapidFeed, settings, useStartEndClearance);

  pecks.forEach((depth, index) => {
    lines.push(`G1 Z${num(depth)} F${plungeFeed}`);

    if (index < pecks.length - 1) {
      lines.push(`G0 Z${num(peckRetractZ)} F${rapidFeed}`);
      lines.push(`G0 X${num(operation.x)} Y${num(operation.y)} F${rapidFeed}`);
    }
  });

  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
  lines.push('');
}

function appendCutPath(lines, pathPoints, operation, settings, tool, useStartEndClearance = false) {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
    return;
  }

  const preset = resolveToolPreset(tool, operation.materialId, settings);
  const rapidFeed = num(preset.rapidFeedRate, 0);
  const plungeFeed = num(preset.plungeFeedRate, 0);
  const cutFeed = num(preset.cutFeedRate, 0);
  const finalDepth = toNegativeDepth(operation.depth, settings.cutDepth);
  const passStep = toPositiveStep(preset.cutDepthPerPass, Math.abs(finalDepth));
  const passes = buildIncrementDepths(finalDepth, passStep);
  const tabRanges = getTabRanges(pathPoints, operation, tool);
  const tabHeight = Math.max(0.1, Math.abs(Number(operation.tabHeight) || 1));

  const start = pathPoints[0];
  passes.forEach((depth, index) => {
    appendEntryMove(lines, start, rapidFeed, settings, useStartEndClearance && index === 0);
    lines.push(`G1 Z${num(depth)} F${plungeFeed}`);

    const liftedDepth = operation.tabsEnabled ? Math.min(-0.001, depth + tabHeight) : depth;
    if (operation.tabsEnabled && liftedDepth !== depth && tabRanges.length > 0) {
      appendPathWithTabs(lines, pathPoints, depth, liftedDepth, cutFeed, plungeFeed, tabRanges);
    } else {
      for (let i = 1; i < pathPoints.length; i += 1) {
        const point = pathPoints[i];
        lines.push(`G1 X${num(point.x)} Y${num(point.y)} F${cutFeed}`);
      }
    }

    lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
  });

  lines.push('');
}

function appendLineCut(lines, operation, settings, tool, useStartEndClearance = false) {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  lines.push('; Cut line');
  appendCutPath(
    lines,
    [
      { x: operation.x1, y: operation.y1 },
      { x: operation.x2, y: operation.y2 },
    ],
    operation,
    settings,
    tool,
    useStartEndClearance
  );
}

function appendRectCut(lines, operation, settings, tool, useStartEndClearance = false) {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  const baseRect = normalizeRectGeometry(operation.x, operation.y, operation.width, operation.height);
  const toolRadius = getToolRadius(tool);
  const cutSide = getCutSide(operation, 'outside');
  const offsetAmount = cutSide === 'outside' ? toolRadius : cutSide === 'inside' ? -toolRadius : 0;
  const offsetRect = {
    x: baseRect.x - offsetAmount,
    y: baseRect.y - offsetAmount,
    width: baseRect.width + offsetAmount * 2,
    height: baseRect.height + offsetAmount * 2,
  };
  const baseCorner = clampRectCornerRadius(operation.cornerRadius, baseRect.width, baseRect.height);
  const offsetCorner = clampRectCornerRadius(
    baseCorner + offsetAmount,
    offsetRect.width,
    offsetRect.height
  );
  const cornerSegments = Math.max(2, Math.floor((settings.circleSegments || 48) / 4));

  if (offsetRect.width <= 0.0001 || offsetRect.height <= 0.0001) {
    lines.push(`; Cut rectangle (${cutSide} requested, falling back to along path: tool too large for inside offset)`);
    appendCutPath(lines, buildRoundedRectPath(baseRect, baseCorner, cornerSegments), operation, settings, tool, useStartEndClearance);
    return;
  }

  lines.push(`; Cut rectangle (${cutSide} path)`);
  lines.push(`; Tool radius compensation ${num(offsetAmount)}mm`);
  lines.push(`; Nominal ${num(baseRect.width)} x ${num(baseRect.height)} mm, corner R${num(baseCorner)} -> path corner R${num(offsetCorner)}`);

  const path = buildRoundedRectPath(cutSide === 'along' ? baseRect : offsetRect, cutSide === 'along' ? baseCorner : offsetCorner, cornerSegments);
  appendCutPath(lines, path, operation, settings, tool, useStartEndClearance);
}

function appendCircleCut(lines, operation, settings, tool, useStartEndClearance = false) {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  const toolRadius = getToolRadius(tool);
  const cutSide = getCutSide(operation, 'outside');
  const offsetAmount = cutSide === 'outside' ? toolRadius : cutSide === 'inside' ? -toolRadius : 0;
  const compensatedRadius = operation.radius + offsetAmount;

  if (compensatedRadius <= 0.0001) {
    lines.push(`; Cut circle (${cutSide} requested, falling back to along path: tool too large for inside offset)`);
  } else {
    lines.push(`; Cut circle nominal R${num(operation.radius)} (${cutSide} tool-center path R${num(compensatedRadius)})`);
  }

  const segments = Math.max(8, Math.floor(settings.circleSegments || 48));
  const path = [];
  const pathRadius = compensatedRadius <= 0.0001 ? operation.radius : compensatedRadius;

  for (let i = 0; i <= segments; i += 1) {
    const theta = (Math.PI * 2 * i) / segments;
    path.push({
      x: operation.x + pathRadius * Math.cos(theta),
      y: operation.y + pathRadius * Math.sin(theta),
    });
  }

  appendCutPath(lines, path, operation, settings, tool, useStartEndClearance);
}

function appendSketchCut(lines, operation, settings, tool, useStartEndClearance = false) {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }

  const subpaths = getSketchSubpaths(operation, settings.circleSegments || 48);
  if (subpaths.length === 0) {
    return;
  }

  const cutSide = getCutSide(operation, operation.closed ? 'outside' : 'along');
  const toolRadius = getToolRadius(tool);
  lines.push(`; Cut sketch ${operation.closed ? 'closed' : 'open'} path (${subpaths.length} subpath(s))`);
  lines.push(`; Toolpath mode: ${operation.closed ? cutSide : 'along'}${operation.closed && cutSide !== 'along' ? `, tool radius compensation ${num(toolRadius)}mm` : ''}`);
  subpaths.forEach((path, index) => {
    if (path.length < 2) {
      return;
    }
    let plannedPath = path;
    if (operation.closed && cutSide !== 'along') {
      const offsetPath = offsetClosedPath(path, cutSide === 'outside' ? toolRadius : -toolRadius);
      if (offsetPath) {
        plannedPath = offsetPath;
      } else {
        lines.push(`; Sketch subpath ${index + 1} offset failed, falling back to along path`);
      }
    }
    lines.push(`; Sketch subpath ${index + 1}`);
    appendCutPath(lines, plannedPath, operation, settings, tool, useStartEndClearance && index === 0);
  });
}

export function generateMarlinGcode({ operations, settings, tools }) {
  const lines = [];
  addHeader(lines, settings, operations.length);

  let previousTool = null;
  let previousToolKey = null;
  let useStartEndClearance = true;

  operations.forEach((operation) => {
    const tool = getOperationTool(operation, tools);
    const toolKey = getToolKey(tool);

    if (previousToolKey !== null && toolKey !== previousToolKey) {
      appendToolChange(lines, previousTool, tool, settings);
      useStartEndClearance = true;
    }

    if (operation.type === 'drill') {
      appendDrill(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'line') {
      appendLineCut(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'rect') {
      appendRectCut(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'circle') {
      appendCircleCut(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
      return;
    }

    if (operation.type === 'sketch') {
      appendSketchCut(lines, operation, settings, tool, useStartEndClearance);
      previousTool = tool;
      previousToolKey = toolKey;
      useStartEndClearance = false;
    }
  });

  addFooter(lines, settings);
  return `${lines.join('\n')}\n`;
}
