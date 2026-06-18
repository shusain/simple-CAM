import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ImportedMesh } from '../types';
import type { Point3D, ToolpathPreview3D } from '../utils/toolpathPreview3d';
import { buildPlaybackLegs, getPlaybackPoint } from './toolpathPreview3d/playback';
import { buildSceneBounds, projectScene } from './toolpathPreview3d/projection';

interface ToolpathPreview3DProps {
  preview: ToolpathPreview3D;
  importedMeshes?: ImportedMesh[];
}

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 640;
const PADDING = 48;
const MIN_PITCH = -1.56;
const MAX_PITCH = 1.56;
const PLAYBACK_TICK_MS = 16;
const PLAYBACK_MIN_DURATION_MS = 4500;
const PLAYBACK_MAX_DURATION_MS = 24000;
const PLAYBACK_SLOW_RATE = 0.25;
const TOOL_CONE_HEIGHT = 8;
const TOOL_CONE_RADIUS = 5.5;

export default function ToolpathPreview3D({
  preview,
  importedMeshes = [],
}: ToolpathPreview3DProps): React.JSX.Element {
  const [yaw, setYaw] = useState(-0.85);
  const [pitch, setPitch] = useState(-0.6);
  const [zoom, setZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackDistance, setPlaybackDistance] = useState(0);
  const dragStartRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const playback = useMemo(() => buildPlaybackLegs(preview), [preview]);
  const playbackDurationMs = useMemo(() => {
    if (playback.totalLength <= 0) {
      return PLAYBACK_MIN_DURATION_MS;
    }

    return Math.max(
      PLAYBACK_MIN_DURATION_MS,
      Math.min(PLAYBACK_MAX_DURATION_MS, playback.totalLength * 35)
    );
  }, [playback.totalLength]);
  const playbackPoint = useMemo(
    () => getPlaybackPoint(playback.legs, playback.totalLength, playbackDistance),
    [playback, playbackDistance]
  );
  const playbackProgress = playback.totalLength > 0 ? playbackDistance / playback.totalLength : 0;

  useEffect(() => {
    setIsPlaying(false);
    setPlaybackRate(1);
    setPlaybackDistance(0);
  }, [preview]);

  useEffect(() => {
    if (!isPlaying || playback.totalLength <= 0) {
      return undefined;
    }

    const distancePerTick = (playback.totalLength / playbackDurationMs) * PLAYBACK_TICK_MS * playbackRate;
    const timerId = window.setInterval(() => {
      setPlaybackDistance((current) => {
        const next = Math.min(playback.totalLength, current + distancePerTick);
        if (next >= playback.totalLength) {
          setIsPlaying(false);
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);

    return () => window.clearInterval(timerId);
  }, [isPlaying, playback.totalLength, playbackDurationMs, playbackRate]);

  const sceneBounds = useMemo(() => buildSceneBounds(preview, importedMeshes), [preview, importedMeshes]);

  const center = useMemo<Point3D>(
    () => ({
      x: (sceneBounds.minX + sceneBounds.maxX) / 2,
      y: (sceneBounds.minY + sceneBounds.maxY) / 2,
      z: (sceneBounds.minZ + sceneBounds.maxZ) / 2,
    }),
    [sceneBounds]
  );

  const fitRadius = useMemo(() => {
    const width = sceneBounds.maxX - sceneBounds.minX;
    const height = sceneBounds.maxY - sceneBounds.minY;
    const depth = sceneBounds.maxZ - sceneBounds.minZ;
    return Math.max(1, Math.hypot(width, height, depth) / 2);
  }, [sceneBounds]);

  const projected = useMemo(
    () =>
      projectScene({
        preview,
        importedMeshes,
        center,
        yaw,
        pitch,
        zoom,
        fitRadius,
        viewWidth: VIEW_WIDTH,
        viewHeight: VIEW_HEIGHT,
        padding: PADDING,
        gizmoOffset: 84,
        toolConeHeight: TOOL_CONE_HEIGHT,
        toolConeRadius: TOOL_CONE_RADIUS,
        playbackPoint,
        sceneBounds,
      }),
    [center, fitRadius, importedMeshes, pitch, playbackPoint, preview, sceneBounds, yaw, zoom]
  );

  function getSegmentColor(kind: string): string {
    if (kind === 'rapid') return '#7dd3fc';
    if (kind === 'plunge') return '#f59e0b';
    return '#22c55e';
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>): void {
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      yaw,
      pitch,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    if (!dragStartRef.current) {
      return;
    }

    const dx = event.clientX - dragStartRef.current.x;
    const dy = event.clientY - dragStartRef.current.y;
    setYaw(dragStartRef.current.yaw + dx * 0.01);
    setPitch(Math.max(MIN_PITCH, Math.min(MAX_PITCH, dragStartRef.current.pitch + dy * 0.01)));
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>): void {
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>): void {
    event.preventDefault();
    setZoom((current) => Math.max(0.4, Math.min(5, current * (event.deltaY > 0 ? 0.92 : 1.08))));
  }

  function handlePlay(): void {
    if (playback.totalLength <= 0) {
      return;
    }
    if (playbackDistance >= playback.totalLength) {
      setPlaybackDistance(0);
    }
    setPlaybackRate(1);
    setIsPlaying(true);
  }

  function handleSlowMotion(): void {
    if (playback.totalLength <= 0) {
      return;
    }
    if (playbackDistance >= playback.totalLength) {
      setPlaybackDistance(0);
    }
    setPlaybackRate(PLAYBACK_SLOW_RATE);
    setIsPlaying(true);
  }

  function handlePause(): void {
    setIsPlaying(false);
  }

  function handleRewind(): void {
    setIsPlaying(false);
    setPlaybackDistance(0);
    setPlaybackRate(1);
  }

  const playbackLabel = isPlaying ? (playbackRate < 1 ? 'Slow-mo' : 'Playing') : 'Paused';

  return (
    <div className="preview3d-shell">
      <div className="preview3d-toolbar">
        <span>3D Preview</span>
        <span className="preview3d-hint">Drag to orbit, wheel to zoom</span>
      </div>
      <div className="preview3d-stage">
        <svg
          className="preview3d-canvas"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label="3D toolpath preview"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        >
          <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#08111f" />

          {projected.bounds.map((edge, index) => (
            <polyline
              key={`bounds-${index}`}
              points={edge.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="#334155"
              strokeDasharray="6 6"
              strokeWidth="1"
            />
          ))}

          {projected.meshes.map((triangle, index) => (
            <polygon
              key={`mesh-triangle-${index}`}
              points={triangle.points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="rgba(96, 165, 250, 0.22)"
              stroke="rgba(125, 211, 252, 0.45)"
              strokeWidth="0.8"
            />
          ))}

          {projected.segments.map((segment, index) => (
            <polyline
              key={`${segment.operationId || 'job'}-${segment.kind}-${index}`}
              points={segment.projected.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={getSegmentColor(segment.kind)}
              strokeDasharray={segment.kind === 'rapid' ? '8 6' : undefined}
              strokeWidth={segment.kind === 'cut' ? 2.2 : 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={segment.kind === 'rapid' ? 0.85 : 1}
            />
          ))}

          {projected.markers.map((marker) => (
            <circle
              key={`${marker.kind}-${marker.projected.x}-${marker.projected.y}-${marker.projected.depth}`}
              cx={marker.projected.x}
              cy={marker.projected.y}
              r={marker.kind === 'start' ? 5 : 4}
              fill={marker.kind === 'start' ? '#f43f5e' : '#f8fafc'}
              stroke="#020617"
              strokeWidth="1.5"
            />
          ))}

          {projected.tool ? (
            <g aria-label="Animated tool">
              <line
                x1={projected.tool.baseCenter.x}
                y1={projected.tool.baseCenter.y}
                x2={projected.tool.tip.x}
                y2={projected.tool.tip.y}
                stroke="#f8fafc"
                strokeWidth="1.5"
                opacity="0.9"
              />
              <polygon
                points={[
                  `${projected.tool.tip.x},${projected.tool.tip.y}`,
                  `${projected.tool.baseLeft.x},${projected.tool.baseLeft.y}`,
                  `${projected.tool.baseRight.x},${projected.tool.baseRight.y}`,
                ].join(' ')}
                fill={getSegmentColor(projected.tool.kind)}
                stroke="#e2e8f0"
                strokeWidth="1.1"
                opacity="0.95"
              />
            </g>
          ) : null}

          <g aria-label="3D orientation gizmo">
            <circle cx="84" cy={VIEW_HEIGHT - 84} r="22" fill="rgba(2, 6, 23, 0.72)" stroke="#334155" strokeWidth="1.2" />
            {projected.gizmo.map((axis) => (
              <g key={axis.id}>
                <line
                  x1={axis.start.x}
                  y1={axis.start.y}
                  x2={axis.end.x}
                  y2={axis.end.y}
                  stroke={axis.color}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <circle cx={axis.end.x} cy={axis.end.y} r="3.5" fill={axis.color} />
                <text
                  x={axis.end.x + 8}
                  y={axis.end.y + 4}
                  fill={axis.color}
                  fontSize="12"
                  fontWeight="700"
                >
                  {axis.label}
                </text>
              </g>
            ))}
          </g>
        </svg>

        <div className="preview3d-overlay" role="group" aria-label="3D preview playback controls">
          <div className="preview3d-playback">
            <button type="button" className="tool-button" onClick={handlePlay} disabled={playback.totalLength <= 0}>
              Play
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={handleSlowMotion}
              disabled={playback.totalLength <= 0}
            >
              Slow-mo
            </button>
            <button type="button" className="tool-button" onClick={handlePause}>
              Pause
            </button>
            <button type="button" className="tool-button" onClick={handleRewind}>
              Rewind
            </button>
          </div>
          <div className="preview3d-playback-status">
            <span>{playbackLabel}</span>
            <span>{Math.round(playbackProgress * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
