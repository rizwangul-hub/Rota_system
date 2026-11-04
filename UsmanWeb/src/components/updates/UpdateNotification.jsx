import React, { useState } from 'react';
import { Rocket, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function UpdateNotification({
  show,
  versionInfo,
  onRefreshNow,
  onLater,
  refreshing = false
}) {
  const [showNotes, setShowNotes] = useState(false);

  if (!show) return null;

  const title = versionInfo?.title || '🚀 System Update Available!';
  const message = versionInfo?.message ||
    'We have improved the system with new features, enhancements, and bug fixes.\n\nPlease refresh the system to experience the latest improvements.';
  const version = versionInfo?.version || '2.5.0';
  const releaseNotes = Array.isArray(versionInfo?.releaseNotes) && versionInfo.releaseNotes.length > 0
    ? versionInfo.releaseNotes
    : null;

  return (
    <div className="normal-update-banner" role="alert">
      <div className="update-banner-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="update-banner-icon">
            <Rocket size={18} />
          </div>
          <div>
            <div className="update-banner-title">{title}</div>
            <div className="update-banner-subtitle">
              Version {version} • Production Deployment
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLater}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex'
          }}
          title="Remind me later"
        >
          <X size={15} />
        </button>
      </div>

      <div className="update-banner-body">
        {message}
      </div>

      {releaseNotes && (
        <div>
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0,
              marginBottom: '6px'
            }}
          >
            <span>{showNotes ? 'Hide Release Notes' : 'View Release Notes'}</span>
            {showNotes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showNotes && (
            <div className="update-banner-release-notes">
              <strong style={{ fontSize: '11px' }}>What's New in v{version}:</strong>
              <ul>
                {releaseNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="update-banner-actions">
        <button
          type="button"
          onClick={onRefreshNow}
          disabled={refreshing}
          className="btn-update-refresh"
        >
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          <span>{refreshing ? 'Updating...' : 'Refresh Now'}</span>
        </button>

        <button
          type="button"
          onClick={onLater}
          disabled={refreshing}
          className="btn-update-later"
        >
          Later
        </button>
      </div>
    </div>
  );
}
