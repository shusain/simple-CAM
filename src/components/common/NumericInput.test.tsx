import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NumericInput from './NumericInput';

describe('NumericInput', () => {
  it('allows clearing and retyping without committing invalid intermediate values', () => {
    const onChange = vi.fn();
    render(<NumericInput aria-label="Depth" value={-3} step={0.1} onChange={onChange} />);

    const input = screen.getByLabelText('Depth');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '-' } });
    fireEvent.change(input, { target: { value: '-4.5' } });

    expect(onChange).toHaveBeenCalledWith(-4.5);
  });

  it('restores the last committed value when left blank on blur', () => {
    const onChange = vi.fn();
    render(<NumericInput aria-label="Offset X" value={10} step={0.1} onChange={onChange} />);

    const input = screen.getByLabelText('Offset X') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(input.value).toBe('10');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps committed values against min and max', () => {
    const onChange = vi.fn();
    render(<NumericInput aria-label="Radius" value={4} min={0.1} max={6} step={0.1} onChange={onChange} />);

    const input = screen.getByLabelText('Radius');
    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith(0.1);

    fireEvent.change(input, { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith(6);
  });
});
