import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const camCanvasMock = vi.fn((props: { showToolpathPreview: boolean }) => (
  <div data-testid="cam-canvas">{props.showToolpathPreview ? 'preview-on' : 'preview-off'}</div>
));

const buildToolpathPreviewMock = vi.fn(() => ({ segments: [], markers: [] }));

vi.mock('./components/CamCanvas', () => ({
  default: (props: { showToolpathPreview: boolean }) => camCanvasMock(props),
}));

vi.mock('./components/ControlPanel', () => ({
  default: (props: { onImportSvg: () => void; onImportDxf: () => void; onImportStl: () => void }) => (
    <div data-testid="control-panel">
      <button type="button" onClick={props.onImportSvg}>
        Import SVG
      </button>
      <button type="button" onClick={props.onImportDxf}>
        Import DXF
      </button>
      <button type="button" onClick={props.onImportStl}>
        Import STL
      </button>
    </div>
  ),
}));

vi.mock('./components/OperationsPanel', () => ({
  default: () => <div data-testid="operations-panel" />,
}));

vi.mock('./components/OctoprintSettingsModal', () => ({
  default: () => null,
}));

vi.mock('./utils/toolpathPreview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/toolpathPreview')>();
  return {
    ...actual,
    buildToolpathPreview: () => buildToolpathPreviewMock(),
  };
});

import App from './App';

describe('App', () => {
  beforeEach(() => {
    camCanvasMock.mockClear();
    buildToolpathPreviewMock.mockClear();
    delete (window as Window & { electron?: unknown }).electron;
  });

  it('renders the preview toggle in the view controls and toggles canvas preview state', () => {
    render(<App />);

    const previewButton = screen.getByRole('button', { name: 'Preview' });

    expect(previewButton).toHaveClass('tool-button', 'active');
    expect(screen.getByTestId('cam-canvas')).toHaveTextContent('preview-on');
    expect(camCanvasMock).toHaveBeenLastCalledWith(expect.objectContaining({ showToolpathPreview: true }));
    expect(buildToolpathPreviewMock).toHaveBeenCalled();

    fireEvent.click(previewButton);

    expect(previewButton).toHaveClass('tool-button');
    expect(previewButton).not.toHaveClass('active');
    expect(screen.getByTestId('cam-canvas')).toHaveTextContent('preview-off');
    expect(camCanvasMock).toHaveBeenLastCalledWith(expect.objectContaining({ showToolpathPreview: false }));
  });

  it('switches the viewport between 2D canvas mode and 3D preview mode', () => {
    render(<App />);

    expect(screen.getByTestId('cam-canvas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '3D preview' }));

    expect(screen.queryByTestId('cam-canvas')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '3D toolpath preview' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2D view' }));

    expect(screen.getByTestId('cam-canvas')).toBeInTheDocument();
  });

  it('shows sketch-first topbar tools outside of sketch edit mode', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Sketch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Poly-Arc' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cut Rect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cut Circle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('title', 'Select (Ctrl+1)');
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute('title', 'Text (Ctrl+4)');
    expect(screen.getByRole('button', { name: 'New Sketch' })).toHaveAttribute('title', 'Poly-Line (Ctrl+5)');
  });

  it('creates a sketch and enters sketch edit tools when clicking New Sketch', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'New Sketch' }));

    expect(screen.getByRole('button', { name: 'Poly-Line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poly-Arc' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish sketch edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel Sketch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Sketch' })).not.toBeInTheDocument();
  });

  it('cancels an empty sketch from the toolbar action', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'New Sketch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Sketch' }));

    expect(screen.getByRole('button', { name: 'New Sketch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Sketch' })).not.toBeInTheDocument();
  });

  it('cancels an empty sketch with escape', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'New Sketch' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'New Sketch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Sketch' })).not.toBeInTheDocument();
  });

  it('starts a new sketch from ctrl+number and exposes sketch edit tools', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: '5', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Poly-Line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poly-Arc' })).toBeInTheDocument();
  });

  it('switches between sketch edit tools with ctrl+number hotkeys', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: '5', ctrlKey: true });
    fireEvent.keyDown(window, { key: '3', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Poly-Arc' })).toHaveClass('active');

    fireEvent.keyDown(window, { key: '1', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Select' })).toHaveClass('active');
  });

  it('prompts for the import cut mode after selecting an SVG file', async () => {
    (window as Window & { electron?: unknown }).electron = {
      openSvgImport: vi.fn().mockResolvedValue({
        canceled: false,
        filePath: '/tmp/sample.svg',
        contents: '<svg><rect x="0" y="0" width="10" height="5" /></svg>',
      }),
    };

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Import SVG' }));

    expect(await screen.findByRole('dialog', { name: 'Choose import cut type' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cut outside' }));

    expect(screen.queryByRole('dialog', { name: 'Choose import cut type' })).not.toBeInTheDocument();
    expect(screen.getByText(/Imported 1 sketch path\(s\) from sample\.svg/i)).toBeInTheDocument();
  });

  it('imports an STL and reports the triangle count', async () => {
    (window as Window & { electron?: unknown }).electron = {
      openStlImport: vi.fn().mockResolvedValue({
        canceled: false,
        filePath: '/tmp/hold-down.stl',
        contents: `
solid sample
  facet normal 0 0 1
    outer loop
      vertex -1 -1 0
      vertex 1 -1 0
      vertex 1 1 0
    endloop
  endfacet
endsolid sample
        `,
      }),
    };

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Import STL' }));

    expect(await screen.findByText(/Imported STL hold-down\.stl \(1 triangle\(s\)\)/i)).toBeInTheDocument();
  });
});
