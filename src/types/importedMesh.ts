import type { Point } from './common';

export interface MeshPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface MeshTriangle {
  a: MeshPoint3D;
  b: MeshPoint3D;
  c: MeshPoint3D;
}

export interface MeshBounds3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface ImportedMesh {
  id: string;
  type: 'stl';
  name: string;
  filePath?: string;
  units: 'mm';
  triangleCount: number;
  placement: Point;
  localBounds: MeshBounds3D;
  triangles: MeshTriangle[];
}
