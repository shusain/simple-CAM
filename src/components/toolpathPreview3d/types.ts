import type { Point3D } from '../../utils/toolpathPreview3d';

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
}

export interface AxisGizmo {
  id: 'x' | 'y' | 'z';
  label: string;
  color: string;
  start: ProjectedPoint;
  end: ProjectedPoint;
}

export interface PlaybackLeg {
  kind: 'rapid' | 'plunge' | 'cut';
  start: Point3D;
  end: Point3D;
  length: number;
  cumulativeStart: number;
}

export interface PlaybackPoint {
  kind: 'rapid' | 'plunge' | 'cut';
  point: Point3D;
}

export interface ProjectedTriangle {
  points: [ProjectedPoint, ProjectedPoint, ProjectedPoint];
  averageDepth: number;
}

export interface ProjectedTool {
  kind: 'rapid' | 'plunge' | 'cut';
  tip: ProjectedPoint;
  baseLeft: ProjectedPoint;
  baseRight: ProjectedPoint;
  baseCenter: ProjectedPoint;
}
