import React from 'react';
import { Rocket, AlertTriangle } from 'lucide-react';
import { useSystemUpdate } from '../../context/SystemUpdateContext';

export default function UpdateHeaderBadge() {
  const { updateAvailable, updateType, openUpdateDialog } = useSystemUpdate();

  if (!updateAvailable) return null;

  const isCritical = updateType === 'critical';

  return (
    <button
      type="button"
      onClick={openUpdateDialog}
      className={`header-update-badge ${isCritical ? 'critical' : ''}`}
      title={isCritical ? 'Critical update required! Click to view details.' : 'New version available. Click to review and refresh.'}
      aria-label="System update available"
    >
      {isCritical ? (
        <AlertTriangle size={13} color="#f87171" />
      ) : (
        <Rocket size={13} color="#60a5fa" />
      )}
      <span style={{ fontSize: '11px' }}>{isCritical ? 'Update!' : 'Update'}</span>
    </button>
  );
}
