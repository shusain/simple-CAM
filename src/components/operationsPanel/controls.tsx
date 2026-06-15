import React from 'react';
import type { CutSide } from '../../types';

interface DepthEditorProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

interface CutSideEditorProps {
  value: CutSide | undefined;
  onChange: (value: CutSide) => void;
  disabled?: boolean;
  options?: CutSide[];
}

export function DepthEditor({ value, onChange }: DepthEditorProps): React.JSX.Element {
  return (
    <label className="field-row">
      <span>Depth (mm)</span>
      <input
        type="number"
        step="0.1"
        value={value ?? ''}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function CutSideEditor({
  value,
  onChange,
  disabled = false,
  options = ['inside', 'outside', 'along'],
}: CutSideEditorProps): React.JSX.Element {
  return (
    <label className="field-row">
      <span>Toolpath</span>
      <select
        value={value || 'along'}
        onChange={(event) => onChange(event.target.value as CutSide)}
        disabled={disabled}
      >
        {options.includes('outside') ? <option value="outside">Cut outside</option> : null}
        {options.includes('inside') ? <option value="inside">Cut inside</option> : null}
        <option value="along">Cut along path</option>
      </select>
    </label>
  );
}
