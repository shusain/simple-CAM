import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSettings } from '../test/factories';
import type { CamCanvasProps, ViewTransform } from './canvas/types';
import { getMiniMapGeometry } from './canvas/minimap';

const renderCanvasSceneMock = vi.fn();

vi.mock('./canvas/drawing', () => ({
  renderCanvasScene: (args: unknown) => renderCanvasSceneMock(args),
}));

import CamCanvas from './CamCanvas';

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 900,
            height: 600,
            top: 0,
            right: 900,
            bottom: 600,
            left: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          },
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }

  disconnect(): void {}
  unobserve(): void {}
}

function buildProps(overrides: Partial<CamCanvasProps> = {}): CamCanvasProps {
  return {
    activeTool: 'select',
    settings: makeSettings({ workWidth: 300, workHeight: 200 }),
    operations: [],
    importedMeshes: [],
    transformPreviewOperations: [],
    selectedOperationIds: [],
    selectedImportedMeshId: null,
    onSelectOperation: vi.fn(),
    onSelectImportedMesh: vi.fn(),
    onSetSelection: vi.fn(),
    onAddOperation: vi.fn(() => 'operation-1'),
    onPreviewMoveOperations: vi.fn(),
    onCommitMoveOperations: vi.fn(),
    onPreviewMoveImportedMesh: vi.fn(),
    onCommitMoveImportedMesh: vi.fn(),
    activeToolId: 'tool-1',
    activeMaterialId: 'material-1',
    defaultDrillDepth: -3,
    zoomRequest: null,
    pastePreview: null,
    onPlacePaste: vi.fn(),
    onPointerUpdate: vi.fn(),
    onCommitTransformPreview: vi.fn(),
    sketchEdit: {
      operationId: null,
      selectedSegmentIndex: null,
      isNewSketch: false,
    },
    onUpdateOperation: vi.fn(),
    onSelectSketchSegment: vi.fn(),
    onCancelSketchCreation: vi.fn(),
    showToolpathPreview: false,
    toolpathPreview: null,
    transformHint: null,
    ...overrides,
  };
}

function getLastTransform(): ViewTransform {
  const lastCall = renderCanvasSceneMock.mock.calls[
    renderCanvasSceneMock.mock.calls.length - 1
  ]?.[0] as
    | { transform: ViewTransform }
    | undefined;
  if (!lastCall) {
    throw new Error('Canvas scene was not rendered');
  }
  return lastCall.transform;
}

function prepareCanvas(canvas: HTMLCanvasElement): void {
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      right: 900,
      bottom: 600,
      width: 900,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() });
  Object.defineProperty(canvas, 'releasePointerCapture', { value: vi.fn() });
  Object.defineProperty(canvas, 'hasPointerCapture', { value: vi.fn(() => true) });
}

describe('CamCanvas viewport interactions', () => {
  beforeEach(() => {
    renderCanvasSceneMock.mockClear();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  it('keeps the status bar outside the measured drawable stage', () => {
    const { container } = render(<CamCanvas {...buildProps()} />);
    const stage = container.querySelector('.cam-canvas-stage');
    const status = container.querySelector('.canvas-overlay');

    expect(stage).toBeInTheDocument();
    expect(status).toBeInTheDocument();
    expect(stage?.nextElementSibling).toBe(status);
    expect(stage?.contains(status)).toBe(false);
  });

  it.each([
    { label: 'Alt-drag', button: 0, altKey: true },
    { label: 'middle-button drag', button: 1, altKey: false },
  ])('allows $label panning while the whole stock is fitted', ({ button, altKey }) => {
    const { container } = render(<CamCanvas {...buildProps()} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    prepareCanvas(canvas);
    const initialCenter = getLastTransform().center;

    fireEvent.pointerDown(canvas, {
      button,
      altKey,
      pointerId: 1,
      clientX: 450,
      clientY: 300,
    });
    fireEvent.pointerMove(canvas, {
      button,
      altKey,
      pointerId: 1,
      clientX: 700,
      clientY: 300,
    });

    expect(getLastTransform().center.x).toBeLessThan(initialCenter.x);
  });

  it('centers and drags the visible region from the minimap', () => {
    const { container } = render(<CamCanvas {...buildProps()} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    prepareCanvas(canvas);
    const geometry = getMiniMapGeometry(getLastTransform());

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 2,
      clientX: geometry.x + geometry.width * 0.25,
      clientY: geometry.y + geometry.height * 0.25,
    });

    expect(getLastTransform().center.x).toBeCloseTo(75);
    expect(getLastTransform().center.y).toBeCloseTo(150);

    fireEvent.pointerMove(canvas, {
      button: 0,
      pointerId: 2,
      clientX: geometry.x + geometry.width,
      clientY: geometry.y + geometry.height,
    });

    expect(getLastTransform().center).toEqual({ x: 300, y: 0 });
  });
});
