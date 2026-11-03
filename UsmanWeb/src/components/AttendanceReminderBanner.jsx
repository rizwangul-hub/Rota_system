import React, { useState } from 'react';
import { Bell, BellRing, Clock, Check, X, AlertCircle } from 'lucide-react';
import { formatReminderTime12H, requestNotificationPermission } from '../services/notificationService';

export default function AttendanceReminderBanner({
  reminderConfig,
  permissionStatus,
  onPermissionChange,
  activeAlert,
  onDismissAlert,
  onOpenReminderModal
}) {
  const [dismissPrompt, setDismissPrompt] = useState(false);

  const formattedTime = formatReminderTime12H(reminderConfig?.time || '14:00');

  // Case 1: Active 2:00 PM reminder triggered!
  if (activeAlert) {
    return (
      <div style={{
        margin: '0 0 16px 0',
        background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)',
        color: '#ffffff',
        borderRadius: '16px',
        padding: '14px 16px',
        boxShadow: '0 8px 20px -3px rgba(220, 38, 38, 0.4)',
        border: '1px solid #f87171',
        animation: 'bounceIn 0.3s ease-out',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex'
            }}>
              <BellRing size={20} color="#ffffff" className="spin-slow" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800 }}>
                ⏰ Daily Attendance Reminder ({activeAlert.formattedTime || formattedTime})
              </div>
              <div style={{ fontSize: '11px', color: '#fee2e2' }}>
                Admin Reminder Scheduled for {activeAlert.formattedTime || formattedTime}
              </div>
            </div>
          </div>

          <button
            onClick={onDismissAlert}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#fee2e2',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '13px', lineHeight: 1.35, color: '#fef2f2', fontWeight: 600 }}>
          {activeAlert.message || reminderConfig?.message || "Please remember to record today's staff attendance."}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
          <button
            onClick={() => {
              onDismissAlert();
              const el = document.getElementById('workers-list-header');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              flex: 1,
              backgroundColor: '#ffffff',
              color: '#991b1b',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Record Attendance Now
          </button>
          <button
            onClick={onDismissAlert}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Case 2: Notification permission prompt banner (if default and not dismissed)
  if (permissionStatus === 'default' && !dismissPrompt) {
    return (
      <div style={{
        margin: '0 0 16px 0',
        backgroundColor: '#1e293b',
        border: '1px solid #3b82f6',
        borderRadius: '14px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            backgroundColor: '#1e3a8a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#60a5fa',
            flexShrink: 0
          }}>
            <Bell size={18} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
              Enable {formattedTime} Attendance Reminder
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Get daily alert on your device to submit attendance
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={async () => {
              const res = await requestNotificationPermission();
              if (onPermissionChange) onPermissionChange(res);
            }}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Enable
          </button>
          <button
            onClick={() => setDismissPrompt(true)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex'
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
