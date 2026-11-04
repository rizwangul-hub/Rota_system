import React from 'react';
import { Rocket, AlertTriangle } from 'lucide-react';
import { useSystemUpdate } from '../../context/SystemUpdateContext';

export default function UpdateNavbarBadge() {
  const { updateAvailable, updateType, openUpdateDialog } = useSystemUpdate();

  if (!updateAvailable) return null;

  const isCritical = updateType === 'critical';

  return (
    <button
      type="button"
      onClick={openUpdateDialog}
      className={`navbar-update-pill ${isCritical ? 'critical' : ''}`}
      title={isCritical ? 'Critical system update required! Click to view details.' : 'New version available. Click to review and refresh.'}
      aria-label="New system update available"
    >
      {isCritical ? (
        <AlertTriangle size={13} color="#dc2626" />
      ) : (
        <Rocket size={13} color="#2563eb" />
      )}
      <span>{isCritical ? 'Update Required!' : 'Update Available'}</span>
    </button>
  );
}
