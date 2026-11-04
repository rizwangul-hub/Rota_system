import React from 'react';
import { ShieldAlert, RefreshCw, Clock, AlertTriangle } from 'lucide-react';

export default function CriticalUpdateModal({
  show,
  versionInfo,
  onUpdateNow,
  remainingSeconds,
  isExpired,
  refreshing = false
}) {
  if (!show) return null;

  const title = versionInfo?.title || '⚠️ Important System Update Required!';
  const message = versionInfo?.message ||
    'A critical system update is available.\n\nWe have made important improvements to system security, reliability, and functionality.\n\nPlease update your system to continue using the latest version.';
  const version = versionInfo?.version || '2.5.0';

  const formatCountdown = (secs) => {
    if (secs === null || secs === undefined || secs < 0) return null;
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const countdownText = formatCountdown(remainingSeconds);

  return (
    <div
      className="critical-update-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="critical-update-title"
    >
      <div className="critical-update-card">
        <div className="critical-badge-icon">
          <ShieldAlert size={32} />
        </div>

        <h2 id="critical-update-title" style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px', color: '#991b1b' }}>
          {title}
        </h2>

        <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', marginBottom: '12px' }}>
          Version {version} • High-Priority Security & System Update
        </div>

        {countdownText && (
          <div className="critical-deadline-pill">
            <Clock size={14} />
            <span>
              {isExpired
                ? 'Mandatory deadline has arrived. Please update now.'
                : `Mandatory enforcement deadline: ${countdownText}`}
            </span>
          </div>
        )}

        <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, marginBottom: '20px', whiteSpace: 'pre-line' }}>
          {message}
        </div>

        <button
          type="button"
          onClick={onUpdateNow}
          disabled={refreshing}
          className="btn-critical-update"
        >
          {refreshing ? (
            <RefreshCw size={16} className="spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          <span>{refreshing ? 'Reloading Updated Version...' : 'Update System Now'}</span>
        </button>

        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '12px' }}>
          Your user session will be preserved. Unsaved form changes will be checked before reloading.
        </div>
      </div>
    </div>
  );
}
