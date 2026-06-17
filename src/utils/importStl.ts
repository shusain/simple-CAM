import type { ImportedMesh, MeshBounds3D, MeshPoint3D, MeshTriangle } from '../types';

export interface ImportStlOptions {
  createId: () => string;
  filePath?: string;
  fileName?: string;
  workWidth: number;
  workHeight: number;
}

export interface ImportStlResult {
  mesh: ImportedMesh | null;
  warnings: string[];
}

interface RawTriangle {
  a: MeshPoint3D;
  b: MeshPoint3D;
  c: MeshPoint3D;
}

function fileNameFromPath(filePath?: string): string {
  if (!filePath) {
    return 'Imported STL';
  }

  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || 'Imported STL';
}

function parseVertex(line: string): MeshPoint3D | null {
  const match = line.match(/^\s*vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/i);
  if (!match) {
    return null;
  }

  const x = Number(match[1]);
  const y = Number(match[2]);
  const z = Number(match[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return { x, y, z };
}

function parseAsciiStl(contents: string): RawTriangle[] {
  const vertices = contents
    .split(/\r?\n/)
    .map((line) => parseVertex(line))
    .filter((vertex): vertex is MeshPoint3D => Boolean(vertex));

  const triangles: RawTriangle[] = [];
  for (let index = 0; index + 2 < vertices.length; index += 3) {
    triangles.push({
      a: vertices[index],
      b: vertices[index + 1],
      c: vertices[index + 2],
    });
  }

  return triangles;
}

function computeBounds(triangles: RawTriangle[]): MeshBounds3D {
  const points = triangles.flatMap((triangle) => [triangle.a, triangle.b, triangle.c]);
  return points.reduce<MeshBounds3D>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y),
      minZ: Math.min(bounds.minZ, point.z),
      maxZ: Math.max(bounds.maxZ, point.z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    }
  );
}

function normalizeTriangles(triangles: RawTriangle[], bounds: MeshBounds3D): MeshTriangle[] {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const topZ = bounds.maxZ;

  function normalizePoint(point: MeshPoint3D): MeshPoint3D {
    return {
      x: point.x - centerX,
      y: point.y - centerY,
      z: point.z - topZ,
    };
  }

  return triangles.map((triangle) => ({
    a: normalizePoint(triangle.a),
    b: normalizePoint(triangle.b),
    c: normalizePoint(triangle.c),
  }));
}

function sanitizeBounds(bounds: MeshBounds3D): MeshBounds3D {
  return {
    minX: Number.isFinite(bounds.minX) ? bounds.minX : 0,
    maxX: Number.isFinite(bounds.maxX) ? bounds.maxX : 0,
    minY: Number.isFinite(bounds.minY) ? bounds.minY : 0,
    maxY: Number.isFinite(bounds.maxY) ? bounds.maxY : 0,
    minZ: Number.isFinite(bounds.minZ) ? bounds.minZ : 0,
    maxZ: Number.isFinite(bounds.maxZ) ? bounds.maxZ : 0,
  };
}

export function getImportedMeshWorldBounds(mesh: ImportedMesh): MeshBounds3D {
  return {
    minX: mesh.localBounds.minX + mesh.placement.x,
    maxX: mesh.localBounds.maxX + mesh.placement.x,
    minY: mesh.localBounds.minY + mesh.placement.y,
    maxY: mesh.localBounds.maxY + mesh.placement.y,
    minZ: mesh.localBounds.minZ,
    maxZ: mesh.localBounds.maxZ,
  };
}

export function offsetImportedMesh(mesh: ImportedMesh, dx: number, dy: number): ImportedMesh {
  return {
    ...mesh,
    placement: {
      x: mesh.placement.x + dx,
      y: mesh.placement.y + dy,
    },
  };
}

function pointInTriangle2d(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): boolean {
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) <= 0.000001) {
    return false;
  }

  const alpha = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
  const beta = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
  const gamma = 1 - alpha - beta;
  return alpha >= -0.0001 && beta >= -0.0001 && gamma >= -0.0001;
}

export function hitTestImportedMesh(mesh: ImportedMesh, point: { x: number; y: number }): boolean {
  const bounds = getImportedMeshWorldBounds(mesh);
  if (
    point.x < bounds.minX ||
    point.x > bounds.maxX ||
    point.y < bounds.minY ||
    point.y > bounds.maxY
  ) {
    return false;
  }

  return mesh.triangles.some((triangle) =>
    pointInTriangle2d(
      point,
      { x: triangle.a.x + mesh.placement.x, y: triangle.a.y + mesh.placement.y },
      { x: triangle.b.x + mesh.placement.x, y: triangle.b.y + mesh.placement.y },
      { x: triangle.c.x + mesh.placement.x, y: triangle.c.y + mesh.placement.y }
    )
  );
}

export function importStlModel(contents: string, options: ImportStlOptions): ImportStlResult {
  const warnings: string[] = [];
  const trimmed = contents.trim();
  if (!trimmed) {
    return {
      mesh: null,
      warnings: ['STL import failed: file contents were empty'],
    };
  }

  const triangles = parseAsciiStl(trimmed);
  if (triangles.length === 0) {
    return {
      mesh: null,
      warnings: ['STL import failed: only ASCII STL is supported in this first pass'],
    };
  }

  const sourceBounds = sanitizeBounds(computeBounds(triangles));
  const normalizedTriangles = normalizeTriangles(triangles, sourceBounds);
  const localBounds = sanitizeBounds(computeBounds(normalizedTriangles));

  const mesh: ImportedMesh = {
    id: options.createId(),
    type: 'stl',
    name: options.fileName || fileNameFromPath(options.filePath),
    filePath: options.filePath,
    units: 'mm',
    triangleCount: triangles.length,
    placement: {
      x: options.workWidth / 2,
      y: options.workHeight / 2,
    },
    localBounds,
    triangles: normalizedTriangles,
  };

  if (mesh.localBounds.minZ > 0.0001 || mesh.localBounds.maxZ > 0.0001) {
    warnings.push('Imported mesh Z normalization did not place the mesh top at Z0');
  }

  return { mesh, warnings };
}
