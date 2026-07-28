import type { MaterialRemovalPreview } from './materialRemovalPreview';
import type { Point3D } from './toolpathPreview3d';

export interface MaterialRemovalMeshFace {
  points: Point3D[];
  surface: 'top' | 'side' | 'bottom';
  normal: Point3D;
}

export interface MaterialRemovalMesh {
  faces: MaterialRemovalMeshFace[];
  triangleCount: number;
}

const HEIGHT_TOLERANCE = 0.0001;

function pointsEqual(left: Point3D, right: Point3D): boolean {
  return (
    Math.abs(left.x - right.x) <= HEIGHT_TOLERANCE &&
    Math.abs(left.y - right.y) <= HEIGHT_TOLERANCE &&
    Math.abs(left.z - right.z) <= HEIGHT_TOLERANCE
  );
}

function getFaceNormal(points: Point3D[]): Point3D {
  if (points.length < 3) {
    return { x: 0, y: 0, z: 1 };
  }

  const first = points[0];
  const second = points[1];
  const third = points[2];
  const ab = {
    x: second.x - first.x,
    y: second.y - first.y,
    z: second.z - first.z,
  };
  const ac = {
    x: third.x - first.x,
    y: third.y - first.y,
    z: third.z - first.z,
  };
  const normal = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (length <= HEIGHT_TOLERANCE) {
    return { x: 0, y: 0, z: 1 };
  }
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  };
}

function interpolateAtHeight(
  start: Point3D,
  end: Point3D,
  height: number
): Point3D {
  const difference = end.z - start.z;
  const amount =
    Math.abs(difference) <= HEIGHT_TOLERANCE
      ? 0
      : (height - start.z) / difference;
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
    z: height,
  };
}

function clipPolygonAboveHeight(
  polygon: Point3D[],
  minimumHeight: number
): Point3D[] {
  const clipped: Point3D[] = [];

  polygon.forEach((current, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = current.z > minimumHeight + HEIGHT_TOLERANCE;
    const previousInside = previous.z > minimumHeight + HEIGHT_TOLERANCE;

    if (currentInside !== previousInside) {
      clipped.push(interpolateAtHeight(previous, current, minimumHeight));
    }
    if (currentInside) {
      clipped.push(current);
    }
  });

  return clipped.filter(
    (point, index) =>
      index === 0 || !pointsEqual(point, clipped[index - 1])
  );
}

function addFace(
  faces: MaterialRemovalMeshFace[],
  points: Point3D[],
  surface: MaterialRemovalMeshFace['surface']
): void {
  const deduped = points.filter(
    (point, index) =>
      index === 0 || !pointsEqual(point, points[index - 1])
  );
  if (
    deduped.length > 2 &&
    pointsEqual(deduped[0], deduped[deduped.length - 1])
  ) {
    deduped.pop();
  }
  if (deduped.length < 3) {
    return;
  }
  faces.push({
    points: deduped,
    surface,
    normal: getFaceNormal(deduped),
  });
}

function addClippedTopAndBottom(
  faces: MaterialRemovalMeshFace[],
  triangle: [Point3D, Point3D, Point3D],
  bottomZ: number
): void {
  const top = clipPolygonAboveHeight(triangle, bottomZ);
  if (top.length < 3) {
    return;
  }

  addFace(faces, top, 'top');
  addFace(
    faces,
    [...top]
      .reverse()
      .map((point) => ({ x: point.x, y: point.y, z: bottomZ })),
    'bottom'
  );
}

interface ModePoint {
  point: Point3D;
  mode: number;
}

function midpoint(left: Point3D, right: Point3D): Point3D {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: (left.z + right.z) / 2,
  };
}

function addMixedModeTriangle(
  faces: MaterialRemovalMeshFace[],
  vertices: [ModePoint, ModePoint, ModePoint],
  bottomZ: number
): void {
  const nonFlat = vertices.filter((vertex) => vertex.mode !== 1);
  const nonFlatCenterHeight =
    nonFlat.reduce((sum, vertex) => sum + vertex.point.z, 0) /
    Math.max(1, nonFlat.length);
  const center = {
    x:
      vertices.reduce((sum, vertex) => sum + vertex.point.x, 0) /
      vertices.length,
    y:
      vertices.reduce((sum, vertex) => sum + vertex.point.y, 0) /
      vertices.length,
  };

  function regionHeight(
    ownerIndex: number,
    neighborIndex?: number
  ): number {
    const owner = vertices[ownerIndex];
    if (owner.mode === 1) {
      return owner.point.z;
    }
    if (neighborIndex === undefined) {
      return nonFlatCenterHeight;
    }
    const neighbor = vertices[neighborIndex];
    return neighbor.mode === 1
      ? owner.point.z
      : (owner.point.z + neighbor.point.z) / 2;
  }

  vertices.forEach((vertex, index) => {
    const previousIndex = (index + 2) % 3;
    const nextIndex = (index + 1) % 3;
    const previousMidpoint = midpoint(
      vertices[previousIndex].point,
      vertex.point
    );
    const nextMidpoint = midpoint(
      vertex.point,
      vertices[nextIndex].point
    );
    const region = [
      vertex.point,
      {
        x: nextMidpoint.x,
        y: nextMidpoint.y,
        z: regionHeight(index, nextIndex),
      },
      {
        x: center.x,
        y: center.y,
        z: regionHeight(index),
      },
      {
        x: previousMidpoint.x,
        y: previousMidpoint.y,
        z: regionHeight(index, previousIndex),
      },
    ];
    const top = clipPolygonAboveHeight(region, bottomZ);
    if (top.length < 3) {
      return;
    }
    addFace(faces, top, 'top');
    addFace(
      faces,
      [...top]
        .reverse()
        .map((point) => ({ ...point, z: bottomZ })),
      'bottom'
    );
  });

  vertices.forEach((vertex, index) => {
    const nextIndex = (index + 1) % 3;
    const next = vertices[nextIndex];
    if (vertex.mode !== 1 && next.mode !== 1) {
      return;
    }

    const edgeMidpoint = midpoint(vertex.point, next.point);
    const firstMidHeight = Math.max(
      bottomZ,
      regionHeight(index, nextIndex)
    );
    const firstCenterHeight = Math.max(
      bottomZ,
      regionHeight(index)
    );
    const secondMidHeight = Math.max(
      bottomZ,
      regionHeight(nextIndex, index)
    );
    const secondCenterHeight = Math.max(
      bottomZ,
      regionHeight(nextIndex)
    );
    if (
      Math.abs(firstMidHeight - secondMidHeight) <= HEIGHT_TOLERANCE &&
      Math.abs(firstCenterHeight - secondCenterHeight) <=
        HEIGHT_TOLERANCE
    ) {
      return;
    }

    addFace(
      faces,
      [
        {
          x: edgeMidpoint.x,
          y: edgeMidpoint.y,
          z: firstMidHeight,
        },
        {
          x: center.x,
          y: center.y,
          z: firstCenterHeight,
        },
        {
          x: center.x,
          y: center.y,
          z: secondCenterHeight,
        },
        {
          x: edgeMidpoint.x,
          y: edgeMidpoint.y,
          z: secondMidHeight,
        },
      ],
      'side'
    );
  });
}

function addOuterWall(
  faces: MaterialRemovalMeshFace[],
  start: Point3D,
  end: Point3D,
  bottomZ: number
): void {
  if (
    start.z <= bottomZ + HEIGHT_TOLERANCE &&
    end.z <= bottomZ + HEIGHT_TOLERANCE
  ) {
    return;
  }

  addFace(
    faces,
    [
      start,
      end,
      { x: end.x, y: end.y, z: bottomZ },
      { x: start.x, y: start.y, z: bottomZ },
    ],
    'side'
  );
}

function buildFlatMaterialRemovalMesh(
  preview: MaterialRemovalPreview
): MaterialRemovalMesh {
  const {
    width,
    height,
    stockThickness,
    columns,
    rows,
    cellSizeX,
    cellSizeY,
    heights,
    surfaceModes,
  } = preview;
  const bottomZ = -stockThickness;
  const faces: MaterialRemovalMeshFace[] = [];
  const visited = new Uint8Array(columns * rows);

  function indexAt(column: number, row: number): number {
    return row * columns + column;
  }

  function isSolid(column: number, row: number): boolean {
    return heights[indexAt(column, row)] > bottomZ + HEIGHT_TOLERANCE;
  }

  function matches(
    column: number,
    row: number,
    height: number,
    mode: number
  ): boolean {
    const index = indexAt(column, row);
    return (
      !visited[index] &&
      isSolid(column, row) &&
      Math.abs(heights[index] - height) <= HEIGHT_TOLERANCE &&
      (surfaceModes?.[index] || 0) === mode
    );
  }

  function cellBounds(
    startColumn: number,
    startRow: number,
    columnCount: number,
    rowCount: number
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    const endColumn = startColumn + columnCount - 1;
    const endRow = startRow + rowCount - 1;
    return {
      minX:
        startColumn === 0 ? 0 : (startColumn - 0.5) * cellSizeX,
      maxX:
        endColumn === columns - 1
          ? width
          : (endColumn + 0.5) * cellSizeX,
      minY: startRow === 0 ? 0 : (startRow - 0.5) * cellSizeY,
      maxY:
        endRow === rows - 1
          ? height
          : (endRow + 0.5) * cellSizeY,
    };
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = indexAt(column, row);
      if (visited[index] || !isSolid(column, row)) {
        continue;
      }

      const cellHeight = heights[index];
      const mode = surfaceModes?.[index] || 0;
      let columnCount = 1;
      while (
        column + columnCount < columns &&
        matches(column + columnCount, row, cellHeight, mode)
      ) {
        columnCount += 1;
      }

      let rowCount = 1;
      while (row + rowCount < rows) {
        let rowMatches = true;
        for (let offset = 0; offset < columnCount; offset += 1) {
          if (
            !matches(
              column + offset,
              row + rowCount,
              cellHeight,
              mode
            )
          ) {
            rowMatches = false;
            break;
          }
        }
        if (!rowMatches) {
          break;
        }
        rowCount += 1;
      }

      for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
        for (
          let columnOffset = 0;
          columnOffset < columnCount;
          columnOffset += 1
        ) {
          visited[
            indexAt(column + columnOffset, row + rowOffset)
          ] = 1;
        }
      }

      const bounds = cellBounds(
        column,
        row,
        columnCount,
        rowCount
      );
      addFace(
        faces,
        [
          { x: bounds.minX, y: bounds.minY, z: cellHeight },
          { x: bounds.maxX, y: bounds.minY, z: cellHeight },
          { x: bounds.maxX, y: bounds.maxY, z: cellHeight },
          { x: bounds.minX, y: bounds.maxY, z: cellHeight },
        ],
        'top'
      );
      addFace(
        faces,
        [
          { x: bounds.minX, y: bounds.maxY, z: bottomZ },
          { x: bounds.maxX, y: bounds.maxY, z: bottomZ },
          { x: bounds.maxX, y: bounds.minY, z: bottomZ },
          { x: bounds.minX, y: bounds.minY, z: bottomZ },
        ],
        'bottom'
      );
    }
  }

  function addBoundary(
    start: { x: number; y: number },
    end: { x: number; y: number },
    firstHeight: number,
    secondHeight: number
  ): void {
    const firstSolid = firstHeight > bottomZ + HEIGHT_TOLERANCE;
    const secondSolid = secondHeight > bottomZ + HEIGHT_TOLERANCE;
    if (!firstSolid && !secondSolid) {
      return;
    }
    const topZ = Math.max(firstHeight, secondHeight);
    const lowerZ =
      firstSolid && secondSolid
        ? Math.min(firstHeight, secondHeight)
        : bottomZ;
    if (topZ <= lowerZ + HEIGHT_TOLERANCE) {
      return;
    }
    addFace(
      faces,
      [
        { ...start, z: topZ },
        { ...end, z: topZ },
        { ...end, z: lowerZ },
        { ...start, z: lowerZ },
      ],
      'side'
    );
  }

  for (let row = 0; row < rows; row += 1) {
    const bounds = cellBounds(0, row, 1, 1);
    addBoundary(
      { x: 0, y: bounds.maxY },
      { x: 0, y: bounds.minY },
      heights[indexAt(0, row)],
      bottomZ
    );
    addBoundary(
      { x: width, y: bounds.minY },
      { x: width, y: bounds.maxY },
      heights[indexAt(columns - 1, row)],
      bottomZ
    );

    for (let column = 0; column < columns - 1; column += 1) {
      const boundaryX = (column + 0.5) * cellSizeX;
      addBoundary(
        { x: boundaryX, y: bounds.minY },
        { x: boundaryX, y: bounds.maxY },
        heights[indexAt(column, row)],
        heights[indexAt(column + 1, row)]
      );
    }
  }

  for (let column = 0; column < columns; column += 1) {
    const bounds = cellBounds(column, 0, 1, 1);
    addBoundary(
      { x: bounds.minX, y: 0 },
      { x: bounds.maxX, y: 0 },
      heights[indexAt(column, 0)],
      bottomZ
    );
    addBoundary(
      { x: bounds.maxX, y: height },
      { x: bounds.minX, y: height },
      heights[indexAt(column, rows - 1)],
      bottomZ
    );

    for (let row = 0; row < rows - 1; row += 1) {
      const boundaryY = (row + 0.5) * cellSizeY;
      addBoundary(
        { x: bounds.maxX, y: boundaryY },
        { x: bounds.minX, y: boundaryY },
        heights[indexAt(column, row)],
        heights[indexAt(column, row + 1)]
      );
    }
  }

  return {
    faces,
    triangleCount: faces.reduce(
      (count, face) => count + Math.max(1, face.points.length - 2),
      0
    ),
  };
}

/**
 * Converts the cutter-swept height envelope into a continuous triangle mesh.
 * Stock-bottom regions are clipped out, so full-depth cuts create actual gaps
 * and disconnected mesh regions instead of a visible voxel floor.
 */
export function buildMaterialRemovalMesh(
  preview: MaterialRemovalPreview
): MaterialRemovalMesh {
  if (
    preview.surfaceModes &&
    !preview.surfaceModes.some((mode) => mode === 2)
  ) {
    return buildFlatMaterialRemovalMesh(preview);
  }

  const {
    width,
    height,
    stockThickness,
    columns,
    rows,
    cellSizeX,
    cellSizeY,
    heights,
    surfaceModes,
  } = preview;
  const bottomZ = -stockThickness;
  const faces: MaterialRemovalMeshFace[] = [];

  function gridPoint(column: number, row: number): Point3D {
    return {
      x: column === columns - 1 ? width : column * cellSizeX,
      y: row === rows - 1 ? height : row * cellSizeY,
      z: heights[row * columns + column],
    };
  }

  function gridMode(column: number, row: number): number {
    return surfaceModes?.[row * columns + column] || 0;
  }

  function addSurfaceTriangle(
    vertices: [ModePoint, ModePoint, ModePoint]
  ): void {
    const hasFlat = vertices.some((vertex) => vertex.mode === 1);
    const hasNonFlat = vertices.some((vertex) => vertex.mode !== 1);
    if (hasFlat && hasNonFlat) {
      addMixedModeTriangle(faces, vertices, bottomZ);
      return;
    }
    addClippedTopAndBottom(
      faces,
      vertices.map((vertex) => vertex.point) as [
        Point3D,
        Point3D,
        Point3D,
      ],
      bottomZ
    );
  }

  const cellColumns = columns - 1;
  const cellRows = rows - 1;
  const visited = new Uint8Array(cellColumns * cellRows);

  function cellIndex(column: number, row: number): number {
    return row * cellColumns + column;
  }

  function getUniformCellHeight(
    column: number,
    row: number
  ): number | null {
    const corners = [
      gridPoint(column, row),
      gridPoint(column + 1, row),
      gridPoint(column + 1, row + 1),
      gridPoint(column, row + 1),
    ];
    const minimum = Math.min(...corners.map((point) => point.z));
    const maximum = Math.max(...corners.map((point) => point.z));
    return maximum - minimum <= HEIGHT_TOLERANCE &&
      maximum > bottomZ + HEIGHT_TOLERANCE
      ? maximum
      : null;
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      if (visited[cellIndex(column, row)]) {
        continue;
      }

      const bottomLeft = gridPoint(column, row);
      const bottomRight = gridPoint(column + 1, row);
      const topRight = gridPoint(column + 1, row + 1);
      const topLeft = gridPoint(column, row + 1);
      const uniformHeight = getUniformCellHeight(column, row);

      if (uniformHeight !== null) {
        let columnCount = 1;
        while (column + columnCount < cellColumns) {
          const candidateColumn = column + columnCount;
          const candidateHeight = getUniformCellHeight(
            candidateColumn,
            row
          );
          if (
            visited[cellIndex(candidateColumn, row)] ||
            candidateHeight === null ||
            Math.abs(candidateHeight - uniformHeight) >
              HEIGHT_TOLERANCE
          ) {
            break;
          }
          columnCount += 1;
        }

        let rowCount = 1;
        while (row + rowCount < cellRows) {
          let matches = true;
          for (let offset = 0; offset < columnCount; offset += 1) {
            const candidateColumn = column + offset;
            const candidateRow = row + rowCount;
            const candidateHeight = getUniformCellHeight(
              candidateColumn,
              candidateRow
            );
            if (
              visited[cellIndex(candidateColumn, candidateRow)] ||
              candidateHeight === null ||
              Math.abs(candidateHeight - uniformHeight) >
                HEIGHT_TOLERANCE
            ) {
              matches = false;
              break;
            }
          }
          if (!matches) {
            break;
          }
          rowCount += 1;
        }

        for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
          for (
            let columnOffset = 0;
            columnOffset < columnCount;
            columnOffset += 1
          ) {
            visited[
              cellIndex(column + columnOffset, row + rowOffset)
            ] = 1;
          }
        }

        const mergedBottomLeft = gridPoint(column, row);
        const mergedBottomRight = gridPoint(
          column + columnCount,
          row
        );
        const mergedTopRight = gridPoint(
          column + columnCount,
          row + rowCount
        );
        const mergedTopLeft = gridPoint(column, row + rowCount);
        addFace(
          faces,
          [
            mergedBottomLeft,
            mergedBottomRight,
            mergedTopRight,
            mergedTopLeft,
          ],
          'top'
        );
        addFace(
          faces,
          [
            { ...mergedTopLeft, z: bottomZ },
            { ...mergedTopRight, z: bottomZ },
            { ...mergedBottomRight, z: bottomZ },
            { ...mergedBottomLeft, z: bottomZ },
          ],
          'bottom'
        );
      } else {
        visited[cellIndex(column, row)] = 1;
        addSurfaceTriangle([
          {
            point: bottomLeft,
            mode: gridMode(column, row),
          },
          {
            point: bottomRight,
            mode: gridMode(column + 1, row),
          },
          {
            point: topRight,
            mode: gridMode(column + 1, row + 1),
          },
        ]);
        addSurfaceTriangle([
          {
            point: bottomLeft,
            mode: gridMode(column, row),
          },
          {
            point: topRight,
            mode: gridMode(column + 1, row + 1),
          },
          {
            point: topLeft,
            mode: gridMode(column, row + 1),
          },
        ]);
      }
    }
  }

  for (let column = 0; column < columns - 1; column += 1) {
    addOuterWall(
      faces,
      gridPoint(column + 1, 0),
      gridPoint(column, 0),
      bottomZ
    );
    addOuterWall(
      faces,
      gridPoint(column, rows - 1),
      gridPoint(column + 1, rows - 1),
      bottomZ
    );
  }
  for (let row = 0; row < rows - 1; row += 1) {
    addOuterWall(
      faces,
      gridPoint(0, row),
      gridPoint(0, row + 1),
      bottomZ
    );
    addOuterWall(
      faces,
      gridPoint(columns - 1, row + 1),
      gridPoint(columns - 1, row),
      bottomZ
    );
  }

  return {
    faces,
    triangleCount: faces.reduce(
      (count, face) => count + Math.max(1, face.points.length - 2),
      0
    ),
  };
}
