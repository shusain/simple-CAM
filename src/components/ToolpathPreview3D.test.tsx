import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToolpathPreview3D from './ToolpathPreview3D';
import { makeImportedMesh } from '../test/factories';
import type { ToolpathPreview3D as ToolpathPreview3DData } from '../utils/toolpathPreview3d';

const preview: ToolpathPreview3DData = {
  segments: [
    {
      kind: 'rapid',
      operationId: 'job-start',
      operationType: 'job',
      points: [
        { x: 0, y: 0, z: 8 },
        { x: 20, y: 0, z: 8 },
      ],
    },
    {
      kind: 'cut',
      operationId: 'op-1',
      operationType: 'line',
      points: [
        { x: 20, y: 0, z: -1 },
        { x: 30, y: 10, z: -1 },
      ],
    },
  ],
  markers: [
    { kind: 'start', point: { x: 0, y: 0, z: 8 } },
    { kind: 'end', point: { x: 30, y: 10, z: -1 } },
  ],
  bounds: {
    minX: 0,
    maxX: 30,
    minY: 0,
    maxY: 10,
    minZ: -1,
    maxZ: 8,
  },
};

describe('ToolpathPreview3D', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders playback controls and the animated tool marker', () => {
    render(<ToolpathPreview3D preview={preview} />);

    expect(screen.getByRole('img', { name: '3D toolpath preview' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '3D preview playback controls' })).toBeInTheDocument();
    expect(screen.getByLabelText('Animated tool')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('supports play, slow-mo, pause, and rewind controls', () => {
    render(<ToolpathPreview3D preview={preview} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Playing')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText('0%')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Slow-mo' }));
    expect(screen.getAllByText('Slow-mo')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Paused')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rewind' }));
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders imported STL mesh geometry in the 3D scene', () => {
    render(<ToolpathPreview3D preview={preview} importedMeshes={[makeImportedMesh()]} />);

    expect(screen.getByRole('img', { name: '3D toolpath preview' }).querySelectorAll('polygon').length).toBeGreaterThan(1);
  });
});
