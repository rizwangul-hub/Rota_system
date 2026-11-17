import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, X, Play, Check, Sliders, Sparkles } from 'lucide-react';
import { useAnnouncement } from '../context/AnnouncementContext';

export default function VoiceAnnouncementSettingsModal({ onClose }) {
  const { settings, updateSettings, testAnnouncement, currentActorName, voices } = useAnnouncement();

  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleToggle = () => {
    const updated = { ...localSettings, enabled: !localSettings.enabled };
    setLocalSettings(updated);
    updateSettings(updated);
  };

  const handleVolumeChange = (e) => {
    const volume = parseFloat(e.target.value);
    const updated = { ...localSettings, volume };
    setLocalSettings(updated);
    updateSettings(updated);
  };

  const handleRateChange = (e) => {
    const rate = parseFloat(e.target.value);
    const updated = { ...localSettings, rate };
    setLocalSettings(updated);
    updateSettings(updated);
  };

  const handleVoiceChange = (e) => {
    const preferredVoiceURI = e.target.value || null;
    const updated = { ...localSettings, preferredVoiceURI };
    setLocalSettings(updated);
    updateSettings(updated);
  };

  const handleTest = () => {
    testAnnouncement(`${currentActorName} has successfully verified the operations. Voice announcements are active.`);
  };

  return (
    <div
      className="modal-backdrop active"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        style={{
          background: '#1e293b',
          color: '#f8fafc',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px #334155',
          overflow: 'hidden',
          animation: 'modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#0f172a'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(37, 99, 235, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Volume2 size={18} color="#60a5fa" />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                System Voice Announcements
              </h3>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                Spoken alerts for operations by {currentActorName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Main Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '10px',
              background: '#0f172a',
              border: '1px solid #334155'
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                Enable Voice Announcements
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Speaks when long-running tasks start & finish
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: 'none',
                background: localSettings.enabled ? '#2563eb' : '#475569',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {localSettings.enabled ? 'Enabled' : 'Muted'}
            </button>
          </div>

          {/* Volume Control */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>Volume</label>
              <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>
                {Math.round((localSettings.volume || 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={localSettings.volume || 1}
              onChange={handleVolumeChange}
              disabled={!localSettings.enabled}
              style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
            />
          </div>

          {/* Speed Rate Control */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>Speech Speed</label>
              <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>
                {(localSettings.rate || 0.95).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.25"
              step="0.05"
              value={localSettings.rate || 0.95}
              onChange={handleRateChange}
              disabled={!localSettings.enabled}
              style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
              <span>Gentle / Calm</span>
              <span>Normal</span>
              <span>Fast</span>
            </div>
          </div>

          {/* Voice Selection */}
          {voices && voices.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Voice Profile
              </label>
              <select
                value={localSettings.preferredVoiceURI || ''}
                onChange={handleVoiceChange}
                disabled={!localSettings.enabled}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <option value="">Default Natural English Voice (Auto)</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Test Button */}
          <button
            type="button"
            onClick={handleTest}
            disabled={!localSettings.enabled}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #3b82f6',
              background: 'rgba(37, 99, 235, 0.15)',
              color: '#93c5fd',
              fontWeight: 600,
              fontSize: '12.5px',
              cursor: localSettings.enabled ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: localSettings.enabled ? 1 : 0.5
            }}
          >
            <Play size={14} fill="#93c5fd" />
            <span>Play Test Spoken Announcement</span>
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: '#0f172a',
            borderTop: '1px solid #334155',
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
