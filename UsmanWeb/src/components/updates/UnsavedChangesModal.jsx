import React from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              flexShrink: 0
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <h2 id="unsaved-title" style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#92400e' }}>
              ⚠️ You have unsaved changes!
            </h2>
            <div style={{ fontSize: '11px', color: '#b45309' }}>
              Attendance Guard
            </div>
          </div>
        </div>

        <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.45, marginBottom: '12px' }}>
          Please save your work before updating the system. Refreshing now may cause you to lose your changes.
        </p>

        {reason && (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '11px',
              color: '#92400e',
              marginBottom: '14px',
              lineHeight: 1.35
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
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '11px',
              color: '#991b1b',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={13} className="spin" />
            <span>Attendance submission is in progress. Please wait a moment.</span>
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
              borderRadius: '8px',
              padding: '9px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <ArrowLeft size={14} />
            <span>Save / Finish Attendance First</span>
          </button>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={onConfirmRefresh}
              disabled={isRequestInFlight}
              style={{
                flex: 1,
                background: '#f1f5f9',
                color: isRequestInFlight ? '#94a3b8' : '#dc2626',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: isRequestInFlight ? 'not-allowed' : 'pointer',
                opacity: isRequestInFlight ? 0.6 : 1
              }}
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
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '11px',
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
