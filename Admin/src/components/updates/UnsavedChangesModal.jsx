import React from 'react';
import { AlertTriangle, X, RefreshCw, ArrowLeft } from 'lucide-react';

export default function UnsavedChangesModal({
  isOpen,
  reason,
  onSaveFinish,
  onConfirmRefresh,
  onCancel,
  isRequestInFlight = false
}) {
  if (!isOpen) return null;

  return (
    <div
      className="unsaved-guard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-title"
    >
      <div className="unsaved-guard-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              flexShrink: 0
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <div>
            <h2 id="unsaved-title" style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: '#92400e' }}>
              ⚠️ You have unsaved changes!
            </h2>
            <div style={{ fontSize: '12px', color: '#b45309' }}>
              System Update Refresh Guard
            </div>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, marginBottom: '14px' }}>
          Please save your work before updating the system. Refreshing now may cause you to lose your changes.
        </p>

        {reason && (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#92400e',
              marginBottom: '16px',
              lineHeight: 1.4
            }}
          >
            <strong>Detected:</strong> {reason}
          </div>
        )}

        {isRequestInFlight && (
          <div
            style={{
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#991b1b',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw size={14} className="spin" />
            <span>A server operation is in progress. Refreshing right now may interrupt this transaction.</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={onSaveFinish}
            style={{
              width: '100%',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <ArrowLeft size={15} />
            <span>Save / Finish Work First</span>
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onConfirmRefresh}
              disabled={isRequestInFlight}
              style={{
                flex: 1,
                background: '#f1f5f9',
                color: isRequestInFlight ? '#94a3b8' : '#dc2626',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isRequestInFlight ? 'not-allowed' : 'pointer',
                opacity: isRequestInFlight ? 0.6 : 1
              }}
              title={isRequestInFlight ? 'Wait for server request to finish first' : 'Discard unsaved changes and reload'}
            >
              Refresh Anyway
            </button>

            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                background: '#ffffff',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
