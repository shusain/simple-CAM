import React from 'react';
import NumericInput from '../common/NumericInput';
import type { NumberFieldProps } from './types';

export default function NumberField({
  label,
  value,
  step = 'any',
  min,
  max,
  onChange,
}: NumberFieldProps): React.JSX.Element {
  return (
    <label className="field-row">
      <span>{label}</span>
      <NumericInput
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    </label>
  );
}
