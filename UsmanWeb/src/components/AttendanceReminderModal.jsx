import React, { useState } from 'react';
import { Bell, BellRing, CheckCircle2, AlertTriangle, X, Play, Clock, Volume2 } from 'lucide-react';
import {
  formatReminderTime12H,
  requestNotificationPermission,
  getNotificationPermissionStatus,
  playReminderChime
} from '../services/notificationService';

export default function AttendanceReminderModal({
  isOpen,
  onClose,
  reminderConfig,
  onSendTestNotification,
  permissionStatus,
  onPermissionChange
}) {
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [requestingPerm, setRequestingPerm] = useState(false);

  if (!isOpen) return null;

  const formattedTime = formatReminderTime12H(reminderConfig?.time || '14:00');
  const message = reminderConfig?.message || "Please remember to record today's staff attendance.";

  const handleRequestPermission = async () => {
    setRequestingPerm(true);
    try {
      const res = await requestNotificationPermission();
      if (onPermissionChange) onPermissionChange(res);
      if (res === 'granted') {
        playReminderChime();
      }
    } finally {
      setRequestingPerm(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestSuccess(false);
    try {
      if (onSendTestNotification) {
        await onSendTestNotification();
      }
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 4000);
    } finally {
      setTesting(false);
    }
  };

  const isGranted = permissionStatus === 'granted';
  const isDenied = permissionStatus === 'denied';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: '#0f172a',
        borderRadius: '20px',
        border: '1px solid #334155',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        color: '#f8fafc'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: '#1e3a8a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa'
            }}>
              <BellRing size={20} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800 }}>Attendance Reminders</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Scheduled via Admin Dashboard</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Scheduled Time Card */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '16px',
            color: '#ffffff',
            boxShadow: '0 8px 16px -4px rgba(37, 99, 235, 0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Clock size={13} />
              Daily Reminder Time
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', letterSpacing: '-0.5px' }}>
              {formattedTime}
            </div>
            <div style={{ fontSize: '11px', color: '#bfdbfe', marginTop: '2px' }}>
              24-hour time: {reminderConfig?.time || '14:00'} (Configured in Admin Dashboard)
            </div>
          </div>

          {/* Reminder Message Card */}
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '12px',
            padding: '12px 14px',
            border: '1px solid #334155',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
              Notification Message
            </div>
            <div style={{ fontSize: '13px', color: '#e2e8f0', fontStyle: 'italic', lineHeight: 1.4 }}>
              "{message}"
            </div>
          </div>

          {/* Permission Status */}
          <div style={{
            padding: '12px 14px',
            borderRadius: '12px',
            marginBottom: '16px',
            backgroundColor: isGranted ? 'rgba(34, 197, 94, 0.1)' : isDenied ? 'rgba(239, 68, 68, 0.1)' : 'rgba(234, 179, 8, 0.1)',
            border: `1px solid ${isGranted ? '#22c55e' : isDenied ? '#ef4444' : '#eab308'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isGranted ? (
                <CheckCircle2 size={18} color="#22c55e" />
              ) : (
                <AlertTriangle size={18} color={isDenied ? '#ef4444' : '#eab308'} />
              )}
              <div style={{ fontSize: '13px', fontWeight: 700, color: isGranted ? '#86efac' : isDenied ? '#fca5a5' : '#fde047' }}>
                {isGranted
                  ? 'Notifications Allowed'
                  : isDenied
                  ? 'Notifications Blocked in Browser'
                  : 'Notification Permission Needed'}
              </div>
            </div>

            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '6px', lineHeight: 1.4 }}>
              {isGranted
                ? `You will receive a daily notification banner and chime at ${formattedTime} to record attendance.`
                : isDenied
                ? 'Your browser or device has blocked notifications for this site. Tap the lock/info icon in your browser URL bar and set Notifications to "Allow".'
                : 'Click below to allow notifications so you receive the daily attendance alert at ' + formattedTime + '.'}
            </div>

            {!isGranted && !isDenied && (
              <button
                type="button"
                onClick={handleRequestPermission}
                disabled={requestingPerm}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  backgroundColor: '#eab308',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Bell size={14} />
                <span>{requestingPerm ? 'Requesting...' : 'Allow Notifications Now'}</span>
              </button>
            )}
          </div>

          {/* Test Notification Feedback */}
          {testSuccess && (
            <div style={{
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid #22c55e',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '14px',
              fontSize: '12px',
              color: '#86efac',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CheckCircle2 size={16} />
              <span>Test notification & chime sent! Check your device notification tray.</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              style={{
                flex: 1,
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #3b82f6',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: testing ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Volume2 size={15} color="#60a5fa" />
              <span>{testing ? 'Sending...' : 'Test Notification'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
