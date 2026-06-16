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
  default: () => <div data-testid="control-panel" />,
}));

vi.mock('./components/OperationsPanel', () => ({
  default: () => <div data-testid="operations-panel" />,
}));

vi.mock('./components/OctoprintSettingsModal', () => ({
  default: () => null,
}));

vi.mock('./utils/toolpathPreview', () => ({
  buildToolpathPreview: () => buildToolpathPreviewMock(),
}));

import App from './App';

describe('App', () => {
  beforeEach(() => {
    camCanvasMock.mockClear();
    buildToolpathPreviewMock.mockClear();
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

  it('shows sketch-first topbar tools outside of sketch edit mode', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'New Sketch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Poly-Arc' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cut Rect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cut Circle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('title', 'Select (Ctrl+1)');
    expect(screen.getByRole('button', { name: 'New Sketch' })).toHaveAttribute('title', 'Poly-Line (Ctrl+4)');
  });

  it('creates a sketch and enters sketch edit tools when clicking New Sketch', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'New Sketch' }));

    expect(screen.getByRole('button', { name: 'Poly-Line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poly-Arc' })).toBeInTheDocument();
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

    fireEvent.keyDown(window, { key: '4', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Poly-Line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poly-Arc' })).toBeInTheDocument();
  });

  it('switches between sketch edit tools with ctrl+number hotkeys', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: '4', ctrlKey: true });
    fireEvent.keyDown(window, { key: '3', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Poly-Arc' })).toHaveClass('active');

    fireEvent.keyDown(window, { key: '1', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Select' })).toHaveClass('active');
  });
});
