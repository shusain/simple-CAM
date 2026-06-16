import React, { useEffect, useMemo, useRef, useState } from 'react';

interface NumericInputProps {
  value: number | string;
  onChange?: (value: number) => void;
  step?: number | 'any';
  min?: number;
  max?: number;
  disabled?: boolean;
  readOnly?: boolean;
  'aria-label'?: string;
}

function isPartialNumericValue(value: string): boolean {
  return /^-?\d*(\.\d*)?$/.test(value);
}

function parseNumericValue(value: string): number | null {
  if (!value.trim() || value === '-' || value === '.' || value === '-.') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumericValue(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === 'number') {
    next = Math.max(min, next);
  }
  if (typeof max === 'number') {
    next = Math.min(max, next);
  }
  return next;
}

function formatNumericValue(value: number | string): string {
  return typeof value === 'number' ? String(value) : value;
}

export default function NumericInput({
  value,
  onChange,
  step = 'any',
  min,
  max,
  disabled = false,
  readOnly = false,
  'aria-label': ariaLabel,
}: NumericInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(() => formatNumericValue(value));
  const isFocusedRef = useRef(false);
  const lastCommittedValue = useMemo(() => formatNumericValue(value), [value]);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(lastCommittedValue);
    }
  }, [lastCommittedValue]);

  function commit(nextDraft: string): void {
    const parsed = parseNumericValue(nextDraft);
    if (parsed === null) {
      setDraft(lastCommittedValue);
      return;
    }

    const nextValue = clampNumericValue(parsed, min, max);
    onChange?.(nextValue);
    setDraft(String(nextValue));
  }

  return (
    <input
      type="text"
      inputMode={step === 1 ? 'numeric' : 'decimal'}
      aria-label={ariaLabel}
      value={draft}
      disabled={disabled}
      readOnly={readOnly}
      onFocus={() => {
        isFocusedRef.current = true;
      }}
      onBlur={() => {
        isFocusedRef.current = false;
        commit(draft);
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        if (!isPartialNumericValue(nextDraft)) {
          return;
        }

        setDraft(nextDraft);
        const parsed = parseNumericValue(nextDraft);
        if (parsed !== null) {
          onChange?.(clampNumericValue(parsed, min, max));
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(draft);
          (event.currentTarget as HTMLInputElement).blur();
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(lastCommittedValue);
          (event.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}
