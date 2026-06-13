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

function addHeader(lines, settings, operationCount) {
  const rapidFeed = num(settings.rapidFeedRate || 2400, 0);

  lines.push('; Simple CAM output');
  lines.push('; Target: Marlin (MPCNC)');
  lines.push(`; Operations: ${operationCount}`);
  lines.push(`; Work area: ${settings.workWidth} x ${settings.workHeight} mm`);
  lines.push('G21 ; mm units');
  lines.push('G90 ; absolute positioning');
  lines.push('G94 ; feed rate in units/min');
  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);

  if (settings.spindleOn) {
    lines.push(`M3 S${Math.round(settings.spindleSpeed || 0)}`);
  }

  lines.push('');
}

function addFooter(lines, settings) {
  const rapidFeed = num(settings.rapidFeedRate || 2400, 0);

  lines.push('');
  lines.push('; Program end');
  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
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

  lines.push('; Tool change required');
  lines.push(`; From: ${formatToolLabel(previousTool)} -> To: ${formatToolLabel(nextTool)}`);

  if (settings.spindleOn) {
    lines.push('M5');
  }

  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
  lines.push(`G0 X0 Y0 F${rapidFeed}`);
  lines.push(`M0 Change tool: ${formatToolLabel(nextTool)}`);

  if (settings.spindleOn) {
    lines.push(`M3 S${Math.round(settings.spindleSpeed || 0)}`);
  }

  lines.push('');
}

function appendDrill(lines, operation, settings, tool) {
  const rapidFeed = num(tool?.rapidFeedRate ?? settings.rapidFeedRate ?? 2400, 0);
  const plungeFeed = num(tool?.plungeFeedRate ?? settings.plungeFeedRate ?? 200, 0);
  const finalDepth = toNegativeDepth(operation.depth, settings.drillDepth);
  const peckDepth = toPositiveStep(settings.peckDepth, Math.abs(finalDepth));
  const pecks = buildIncrementDepths(finalDepth, peckDepth);

  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  lines.push(
    `; Drill @ X${num(operation.x)} Y${num(operation.y)} depth ${num(finalDepth)} peck ${num(peckDepth)}`
  );
  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
  lines.push(`G0 X${num(operation.x)} Y${num(operation.y)} F${rapidFeed}`);

  pecks.forEach((depth, index) => {
    lines.push(`G1 Z${num(depth)} F${plungeFeed}`);

    if (index < pecks.length - 1) {
      lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
      lines.push(`G0 X${num(operation.x)} Y${num(operation.y)} F${rapidFeed}`);
    }
  });

  lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
  lines.push('');
}

function appendCutPath(lines, pathPoints, operationDepth, settings, tool) {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
    return;
  }

  const rapidFeed = num(tool?.rapidFeedRate ?? settings.rapidFeedRate ?? 2400, 0);
  const plungeFeed = num(tool?.plungeFeedRate ?? settings.plungeFeedRate ?? 200, 0);
  const cutFeed = num(tool?.cutFeedRate ?? settings.cutFeedRate ?? 600, 0);
  const finalDepth = toNegativeDepth(operationDepth, settings.cutDepth);
  const passStep = toPositiveStep(settings.cutDepthPerPass, Math.abs(finalDepth));
  const passes = buildIncrementDepths(finalDepth, passStep);

  const start = pathPoints[0];
  passes.forEach((depth) => {
    lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
    lines.push(`G0 X${num(start.x)} Y${num(start.y)} F${rapidFeed}`);
    lines.push(`G1 Z${num(depth)} F${plungeFeed}`);

    for (let i = 1; i < pathPoints.length; i += 1) {
      const point = pathPoints[i];
      lines.push(`G1 X${num(point.x)} Y${num(point.y)} F${cutFeed}`);
    }

    lines.push(`G0 Z${num(settings.safeZ)} F${rapidFeed}`);
  });

  lines.push('');
}

function appendLineCut(lines, operation, settings, tool) {
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
    operation.depth,
    settings,
    tool
  );
}

function appendRectCut(lines, operation, settings, tool) {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  const baseRect = normalizeRectGeometry(operation.x, operation.y, operation.width, operation.height);
  const toolRadius = getToolRadius(tool);
  const offsetRect = {
    x: baseRect.x - toolRadius,
    y: baseRect.y - toolRadius,
    width: baseRect.width + toolRadius * 2,
    height: baseRect.height + toolRadius * 2,
  };
  const baseCorner = clampRectCornerRadius(operation.cornerRadius, baseRect.width, baseRect.height);
  const offsetCorner = clampRectCornerRadius(
    baseCorner + toolRadius,
    offsetRect.width,
    offsetRect.height
  );
  const cornerSegments = Math.max(2, Math.floor((settings.circleSegments || 48) / 4));

  lines.push(`; Cut rectangle (outside offset by tool radius ${num(toolRadius)}mm)`);
  lines.push(
    `; Nominal ${num(baseRect.width)} x ${num(baseRect.height)} mm, corner R${num(baseCorner)} -> path corner R${num(offsetCorner)}`
  );

  const path = buildRoundedRectPath(offsetRect, offsetCorner, cornerSegments);
  appendCutPath(lines, path, operation.depth, settings, tool);
}

function appendCircleCut(lines, operation, settings, tool) {
  if (tool) {
    lines.push(`; Tool: ${tool.name}  Diameter: ${num(tool.diameter)}mm`);
  }
  const toolRadius = getToolRadius(tool);
  const compensatedRadius = Math.max(0.1, operation.radius + toolRadius);
  lines.push(`; Cut circle nominal R${num(operation.radius)} (outside tool-center path R${num(compensatedRadius)})`);

  const segments = Math.max(8, Math.floor(settings.circleSegments || 48));
  const path = [];

  for (let i = 0; i <= segments; i += 1) {
    const theta = (Math.PI * 2 * i) / segments;
    path.push({
      x: operation.x + compensatedRadius * Math.cos(theta),
      y: operation.y + compensatedRadius * Math.sin(theta),
    });
  }

  appendCutPath(lines, path, operation.depth, settings, tool);
}

export function generateMarlinGcode({ operations, settings, tools }) {
  const lines = [];
  addHeader(lines, settings, operations.length);

  let previousTool = null;
  let previousToolKey = null;

  operations.forEach((operation) => {
    const tool = getOperationTool(operation, tools);
    const toolKey = getToolKey(tool);

    if (previousToolKey !== null && toolKey !== previousToolKey) {
      appendToolChange(lines, previousTool, tool, settings);
    }

    if (operation.type === 'drill') {
      appendDrill(lines, operation, settings, tool);
      previousTool = tool;
      previousToolKey = toolKey;
      return;
    }

    if (operation.type === 'line') {
      appendLineCut(lines, operation, settings, tool);
      previousTool = tool;
      previousToolKey = toolKey;
      return;
    }

    if (operation.type === 'rect') {
      appendRectCut(lines, operation, settings, tool);
      previousTool = tool;
      previousToolKey = toolKey;
      return;
    }

    if (operation.type === 'circle') {
      appendCircleCut(lines, operation, settings, tool);
      previousTool = tool;
      previousToolKey = toolKey;
    }
  });

  addFooter(lines, settings);
  return `${lines.join('\n')}\n`;
}

