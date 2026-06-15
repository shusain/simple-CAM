import React, { useEffect, useState } from 'react';
import type { OctoprintSettings } from '../types';
import type { OctoprintSettingsModalProps } from '../app/types';

export default function OctoprintSettingsModal({
  isOpen,
  settings,
  onClose,
  onSave,
}: OctoprintSettingsModalProps): React.JSX.Element | null {
  const [draft, setDraft] = useState<OctoprintSettings>(settings);

  useEffect(() => {
    if (isOpen) {
      setDraft(settings);
    }
  }, [isOpen, settings]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>OctoPrint Settings</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="section-note" style={{ marginBottom: 12 }}>
          Saved locally on this machine and not included in project files.
        </p>

        <label className="field-row">
          <span>OctoPrint URL</span>
          <input
            type="text"
            placeholder="http://octopi.local"
            value={draft.baseUrl}
            onChange={(event) => setDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
          />
        </label>

        <label className="field-row">
          <span>API Key</span>
          <input
            type="password"
            placeholder="OctoPrint API key"
            value={draft.apiKey}
            onChange={(event) => setDraft((prev) => ({ ...prev, apiKey: event.target.value }))}
          />
        </label>

        <div className="button-column" style={{ marginTop: 10 }}>
          <button type="button" className="accent" onClick={() => onSave(draft)}>
            Save OctoPrint Settings
          </button>
        </div>
      </div>
    </div>
  );
}
