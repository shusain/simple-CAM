import React from 'react';
import type { NumberFieldProps } from './types';

export default function NumberField({
  label,
  value,
  step = 'any',
  min,
  onChange,
}: NumberFieldProps): React.JSX.Element {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
