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
});
