import React, { useEffect, useMemo, useState } from 'react';
import type { MaterialManagerModalProps } from './types';

export default function MaterialManagerModal({
  isOpen,
  onClose,
  materials,
  activeMaterialId,
  onSelectMaterial,
  onAddMaterial,
  onUpdateMaterial,
  onDeleteMaterial,
}: MaterialManagerModalProps): React.JSX.Element | null {
  const [editingMaterialId, setEditingMaterialId] = useState(activeMaterialId);

  const editingMaterial = useMemo(
    () => materials.find((material) => material.id === editingMaterialId) || materials[0] || null,
    [editingMaterialId, materials]
  );

  useEffect(() => {
    setEditingMaterialId(activeMaterialId);
  }, [activeMaterialId]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Material Manager</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="tool-manager-grid">
          <div>
            <p className="section-note">Manage stock materials available to the job and tool presets.</p>
            <ul className="tool-list">
              {materials.map((material) => (
                <li key={material.id}>
                  <button
                    type="button"
                    className={`tool-list-item ${editingMaterialId === material.id ? 'active' : ''}`}
                    onClick={() => setEditingMaterialId(material.id)}
                  >
                    <span>{material.name}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="button-column">
              <button type="button" onClick={onAddMaterial}>
                Add Material
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => editingMaterial && onDeleteMaterial(editingMaterial.id)}
                disabled={materials.length <= 1 || !editingMaterial}
              >
                Delete Material
              </button>
            </div>
          </div>

          {editingMaterial ? (
            <div>
              <div className="section-header">Edit material</div>
              <label className="field-row">
                <span>Name</span>
                <input
                  type="text"
                  value={editingMaterial.name}
                  onChange={(event) => onUpdateMaterial(editingMaterial.id, { name: event.target.value })}
                />
              </label>
              <button
                type="button"
                className="accent"
                onClick={() => {
                  onSelectMaterial(editingMaterial.id);
                  onClose();
                }}
              >
                Set Job Material
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
