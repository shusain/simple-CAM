import React from 'react';
import NumericInput from '../common/NumericInput';
import type { CutSide } from '../../types';

interface DepthEditorProps {
  value: number | undefined;
  onChange: (value: number) => void;
  label?: string;
}

interface CutSideEditorProps {
  value: CutSide | undefined;
  onChange: (value: CutSide) => void;
  disabled?: boolean;
  options?: CutSide[];
}

export function DepthEditor({ value, onChange, label = 'Depth' }: DepthEditorProps): React.JSX.Element {
  return (
    <label className="field-row">
      <span>{label}</span>
      <NumericInput
        aria-label={label}
        value={value == null ? '' : Math.abs(value)}
        step={0.1}
        onChange={(nextValue) => onChange(-Math.abs(nextValue))}
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
