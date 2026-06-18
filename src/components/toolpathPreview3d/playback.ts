import type { Point3D, ToolpathPreview3D } from '../../utils/toolpathPreview3d';
import type { PlaybackLeg, PlaybackPoint } from './types';

function getDistance3d(start: Point3D, end: Point3D): number {
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

export function buildPlaybackLegs(preview: ToolpathPreview3D): { legs: PlaybackLeg[]; totalLength: number } {
  let cumulative = 0;
  const legs = preview.segments.flatMap((segment) =>
    segment.points.slice(1).flatMap((point, index) => {
      const start = segment.points[index];
      const length = getDistance3d(start, point);
      if (length <= 0.0001) {
        return [];
      }

      const leg: PlaybackLeg = {
        kind: segment.kind,
        start,
        end: point,
        length,
        cumulativeStart: cumulative,
      };
      cumulative += length;
      return [leg];
    })
  );

  return { legs, totalLength: cumulative };
}

export function getPlaybackPoint(
  legs: PlaybackLeg[],
  totalLength: number,
  distance: number
): PlaybackPoint | null {
  if (legs.length === 0) {
    return null;
  }

  if (distance <= 0) {
    return {
      kind: legs[0].kind,
      point: legs[0].start,
    };
  }

  if (distance >= totalLength) {
    const lastLeg = legs[legs.length - 1];
    return {
      kind: lastLeg.kind,
      point: lastLeg.end,
    };
  }

  const activeLeg = legs.find(
    (leg) => distance >= leg.cumulativeStart && distance <= leg.cumulativeStart + leg.length
  );
  if (!activeLeg) {
    const lastLeg = legs[legs.length - 1];
    return {
      kind: lastLeg.kind,
      point: lastLeg.end,
    };
  }

  const localDistance = distance - activeLeg.cumulativeStart;
  const ratio = activeLeg.length <= 0 ? 0 : localDistance / activeLeg.length;
  return {
    kind: activeLeg.kind,
    point: {
      x: activeLeg.start.x + (activeLeg.end.x - activeLeg.start.x) * ratio,
      y: activeLeg.start.y + (activeLeg.end.y - activeLeg.start.y) * ratio,
      z: activeLeg.start.z + (activeLeg.end.z - activeLeg.start.z) * ratio,
    },
  };
}
