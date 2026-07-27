import React, { useEffect, useMemo, useState } from 'react';
import type { LaserTestPatternOptions, Material, Tool } from '../../types';
import { resolveLaserMaterialPreset } from '../../utils/tooling';
import NumberField from './NumberField';

interface LaserTestPatternModalProps {
  isOpen: boolean;
  tool: Tool;
  material: Material | null;
  onClose: () => void;
  onCreate: (options: LaserTestPatternOptions) => void;
}

export default function LaserTestPatternModal({
  isOpen,
  tool,
  material,
  onClose,
  onCreate,
}: LaserTestPatternModalProps): React.JSX.Element | null {
  const preset = useMemo(
    () => resolveLaserMaterialPreset(tool, material?.id),
    [material?.id, tool]
  );
  const [process, setProcess] = useState<'cut' | 'etch'>('etch');
  const [speedMin, setSpeedMin] = useState(preset.etchSpeedMin);
  const [speedMax, setSpeedMax] = useState(preset.etchSpeedMax);
  const [powerMin, setPowerMin] = useState(preset.etchPowerMin);
  const [powerMax, setPowerMax] = useState(preset.etchPowerMax);
  const [columns, setColumns] = useState(5);
  const [rows, setRows] = useState(5);
  const [rectangleWidth, setRectangleWidth] = useState(12);
  const [rectangleHeight, setRectangleHeight] = useState(12);
  const [gap, setGap] = useState(3);
  const [lineInterval, setLineInterval] = useState(Math.max(0.05, preset.kerfDiameter));
  const [overscan, setOverscan] = useState(2);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const isEtch = process === 'etch';
    setSpeedMin(isEtch ? preset.etchSpeedMin : preset.cutSpeedMin);
    setSpeedMax(isEtch ? preset.etchSpeedMax : preset.cutSpeedMax);
    setPowerMin(isEtch ? preset.etchPowerMin : preset.cutPowerMin);
    setPowerMax(isEtch ? preset.etchPowerMax : preset.cutPowerMax);
    setLineInterval(Math.max(0.05, preset.kerfDiameter));
  }, [isOpen, preset, process]);

  if (!isOpen) {
    return null;
  }

  function changeProcess(nextProcess: 'cut' | 'etch'): void {
    setProcess(nextProcess);
    const isEtch = nextProcess === 'etch';
    setSpeedMin(isEtch ? preset.etchSpeedMin : preset.cutSpeedMin);
    setSpeedMax(isEtch ? preset.etchSpeedMax : preset.cutSpeedMax);
    setPowerMin(isEtch ? preset.etchPowerMin : preset.cutPowerMin);
    setPowerMax(isEtch ? preset.etchPowerMax : preset.cutPowerMax);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card laser-test-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="laser-test-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="laser-test-title">Laser test pattern</h3>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="section-note">
          Speed increases left-to-right. Power increases bottom-to-top. The grid uses {tool.name}
          {material ? ` with ${material.name}` : ''}.
        </p>

        <label className="field-row laser-test-process">
          <span>Process</span>
          <select
            aria-label="Test process"
            value={process}
            onChange={(event) =>
              changeProcess(event.target.value === 'cut' ? 'cut' : 'etch')
            }
          >
            <option value="cut">Cut — along path</option>
            <option value="etch">Fill / etch</option>
          </select>
        </label>

        <div className="laser-test-axis-grid">
          <section className="laser-test-section">
            <div className="subsection-title">Power / rows</div>
            <NumberField
              label="Power min (%)"
              value={powerMin}
              min={0}
              max={100}
              step={1}
              onChange={setPowerMin}
            />
            <NumberField
              label="Power max (%)"
              value={powerMax}
              min={0}
              max={100}
              step={1}
              onChange={setPowerMax}
            />
            <NumberField
              label="Power rows"
              value={rows}
              min={1}
              max={20}
              step={1}
              onChange={(value) => setRows(Math.round(value))}
            />
          </section>

          <section className="laser-test-section">
            <div className="subsection-title">Speed / columns</div>
            <NumberField
              label="Speed min"
              value={speedMin}
              min={1}
              step={1}
              onChange={setSpeedMin}
            />
            <NumberField
              label="Speed max"
              value={speedMax}
              min={1}
              step={1}
              onChange={setSpeedMax}
            />
            <NumberField
              label="Speed columns"
              value={columns}
              min={1}
              max={20}
              step={1}
              onChange={(value) => setColumns(Math.round(value))}
            />
          </section>
        </div>

        <section className="laser-test-section laser-test-common">
          <div className="subsection-title">Square and grid settings</div>
          <div className="laser-test-common-grid">
            <NumberField
              label="Rectangle width"
              value={rectangleWidth}
              min={1}
              step={0.5}
              onChange={setRectangleWidth}
            />
            <NumberField
              label="Rectangle height"
              value={rectangleHeight}
              min={1}
              step={0.5}
              onChange={setRectangleHeight}
            />
            <NumberField label="Grid gap" value={gap} min={0} step={0.5} onChange={setGap} />
            {process === 'etch' ? (
              <>
                <NumberField
                  label="Line interval"
                  value={lineInterval}
                  min={0.01}
                  step={0.01}
                  onChange={setLineInterval}
                />
                <NumberField
                  label="Overscan"
                  value={overscan}
                  min={0}
                  step={0.1}
                  onChange={setOverscan}
                />
              </>
            ) : null}
          </div>
        </section>

        <button
          type="button"
          className="accent"
          onClick={() => {
            onCreate({
              process,
              speedMin: Math.min(speedMin, speedMax),
              speedMax: Math.max(speedMin, speedMax),
              powerMin: Math.min(powerMin, powerMax),
              powerMax: Math.max(powerMin, powerMax),
              columns: Math.max(1, Math.min(20, Math.round(columns))),
              rows: Math.max(1, Math.min(20, Math.round(rows))),
              rectangleWidth: Math.max(1, rectangleWidth),
              rectangleHeight: Math.max(1, rectangleHeight),
              gap: Math.max(0, gap),
              lineInterval: Math.max(0.01, lineInterval),
              overscan: Math.max(0, overscan),
            });
            onClose();
          }}
        >
          Create test grid
        </button>
      </div>
    </div>
  );
}
