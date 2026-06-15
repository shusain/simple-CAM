import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OctoprintSettingsModal from './OctoprintSettingsModal';

describe('OctoprintSettingsModal', () => {
  it('does not render while closed', () => {
    render(
      <OctoprintSettingsModal
        isOpen={false}
        settings={{ baseUrl: '', apiKey: '' }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByText('OctoPrint Settings')).toBeNull();
  });

  it('edits and saves draft settings', () => {
    const onSave = vi.fn();
    render(
      <OctoprintSettingsModal
        isOpen
        settings={{ baseUrl: 'http://octopi.local', apiKey: 'abc' }}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('OctoPrint URL'), { target: { value: 'http://printer.local' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save OctoPrint Settings' }));

    expect(onSave).toHaveBeenCalledWith({
      baseUrl: 'http://printer.local',
      apiKey: 'secret',
    });
  });

  it('resets the draft when reopened and closes on backdrop/cancel', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <OctoprintSettingsModal
        isOpen
        settings={{ baseUrl: 'http://one.local', apiKey: 'one' }}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('OctoPrint URL'), { target: { value: 'http://edited.local' } });

    rerender(
      <OctoprintSettingsModal
        isOpen={false}
        settings={{ baseUrl: 'http://two.local', apiKey: 'two' }}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );
    rerender(
      <OctoprintSettingsModal
        isOpen
        settings={{ baseUrl: 'http://two.local', apiKey: 'two' }}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByLabelText('OctoPrint URL')).toHaveValue('http://two.local');

    fireEvent.click(screen.getByText('OctoPrint Settings').closest('.modal-card')!.parentElement!);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
