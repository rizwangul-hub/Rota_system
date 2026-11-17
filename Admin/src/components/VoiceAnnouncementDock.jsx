import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Loader2, CheckCircle2, AlertCircle, X, Sliders } from 'lucide-react';
import { useAnnouncement } from '../context/AnnouncementContext';
import VoiceAnnouncementSettingsModal from './VoiceAnnouncementSettingsModal';

export default function VoiceAnnouncementDock() {
  const { settings, updateSettings, activeOperations, recentNotification } = useAnnouncement();
  const [showSettings, setShowSettings] = useState(false);
  const [visibleNotification, setVisibleNotification] = useState(null);

  // Manage temporary display of recent notifications
  useEffect(() => {
    if (recentNotification) {
      setVisibleNotification(recentNotification);
      const timer = setTimeout(() => {
        setVisibleNotification(null);
      }, 5500);
      return () => clearTimeout(timer);
    }
  }, [recentNotification]);

  const activeOpList = Object.values(activeOperations);
  const hasActiveOp = activeOpList.length > 0;
  const currentOp = activeOpList[0];

  // If no active operation and no recent notification, don't show the floating dock
  if (!hasActiveOp && !visibleNotification) {
    return (
      <>
        {showSettings && (
          <VoiceAnnouncementSettingsModal onClose={() => setShowSettings(false)} />
        )}
      </>
    );
  }

  const toggleSound = () => {
    updateSettings({ enabled: !settings.enabled });
  };

  return (
    <>
      <div
        className="voice-announcement-dock"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99990,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '380px',
          minWidth: '290px',
          pointerEvents: 'auto',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Active In-Progress Operation Card */}
        {hasActiveOp && currentOp && (
          <div
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              borderRadius: '12px',
              padding: '12px 16px',
              border: '1.5px solid #2563eb',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(37, 99, 235, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(37, 99, 235, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Loader2 size={20} color="#60a5fa" className="spin-slow" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#93c5fd',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                >
                  {currentOp.actor}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Processing...</span>
              </div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: '2px'
                }}
              >
                {currentOp.label}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={toggleSound}
                title={settings.enabled ? 'Mute announcements' : 'Enable announcements'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: settings.enabled ? '#60a5fa' : '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px'
                }}
              >
                {settings.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
          </div>
        )}

        {/* Recent Completion / Status Notification Card */}
        {!hasActiveOp && visibleNotification && (
          <div
            style={{
              background: visibleNotification.type === 'error' ? '#450a0a' : '#064e3b',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '12px 16px',
              border: `1.5px solid ${visibleNotification.type === 'error' ? '#ef4444' : '#10b981'}`,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: visibleNotification.type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {visibleNotification.type === 'error' ? (
                <AlertCircle size={18} color="#f87171" />
              ) : (
                <CheckCircle2 size={18} color="#34d399" />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: visibleNotification.type === 'error' ? '#fca5a5' : '#a7f3d0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px'
                  }}
                >
                  {visibleNotification.actor}
                </span>
              </div>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  marginTop: '1px',
                  lineHeight: 1.3
                }}
              >
                {visibleNotification.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVisibleNotification(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#cbd5e1',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px'
              }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {showSettings && (
        <VoiceAnnouncementSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
