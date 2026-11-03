import api from './api';

const DEFAULT_REMINDER = {
  time: '14:00',
  message: "Please remember to record today's staff attendance."
};

const LAST_REMINDER_DATE_KEY = 'attendance_reminder_last_date';

// Format 24-hour time "14:00" to "2:00 PM"
export function formatReminderTime12H(timeStr = '14:00') {
  if (!timeStr || !timeStr.includes(':')) return '2:00 PM';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return '2:00 PM';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  const minutes = m < 10 ? `0${m}` : m;
  return `${h}:${minutes} ${ampm}`;
}

// Gentle audio chime using Web Audio API (no external file needed)
export function playReminderChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.setValueAtTime(880, now + 0.15); // A5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440, now); // A4
    osc2.frequency.setValueAtTime(659.25, now + 0.15); // E5

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.85);
    osc2.stop(now + 0.85);
  } catch {
    // Audio playback not allowed or supported - ignore
  }
}

// Fetch reminder configuration set in Admin dashboard
export async function getAttendanceReminderConfig() {
  try {
    const res = await api.get('/settings/attendance-reminder');
    if (res.data?.success && res.data.reminder?.time) {
      return {
        time: res.data.reminder.time,
        message: res.data.reminder.message || DEFAULT_REMINDER.message
      };
    }
  } catch {
    // Fallback to default
  }
  return DEFAULT_REMINDER;
}

// Check notification permission status
export function getNotificationPermissionStatus() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission; // 'granted', 'denied', or 'default'
}

// Request permission from the user
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch {
    return Notification.permission;
  }
}

// Show native browser / service worker notification
export async function showAttendanceReminderNotification(title, message, isTest = false) {
  playReminderChime();

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const notificationOptions = {
    body: message,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: isTest ? 'attendance-reminder-test' : 'daily-attendance-reminder',
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: { url: window.location.origin }
  };

  try {
    // 1. Try Service Worker showNotification (works on mobile PWA & Android)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, notificationOptions);
        return true;
      }
    }
  } catch (swErr) {
    console.warn('Service worker notification failed, falling back to window Notification:', swErr);
  }

  try {
    // 2. Direct Window Notification fallback
    new Notification(title, notificationOptions);
    return true;
  } catch (notifErr) {
    console.warn('Direct notification failed:', notifErr);
    return false;
  }
}

// Start daily scheduler: monitors reminder time set in Admin dashboard
export function startDailyReminderScheduler({ onTrigger, onConfigLoaded }) {
  let reminderConfig = { ...DEFAULT_REMINDER };
  let active = true;

  const refreshConfig = async () => {
    const config = await getAttendanceReminderConfig();
    if (!active) return;
    reminderConfig = config;
    if (onConfigLoaded) onConfigLoaded(config);
  };

  // Initial fetch
  refreshConfig();

  // Re-fetch config from server every 10 minutes to stay synced with Admin changes
  const configInterval = setInterval(refreshConfig, 10 * 60 * 1000);

  // Check reminder trigger every 30 seconds
  const checkReminder = () => {
    if (!active) return;
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const [targetHourStr, targetMinuteStr] = (reminderConfig.time || '14:00').split(':');
    const targetHour = parseInt(targetHourStr, 10);
    const targetMinute = parseInt(targetMinuteStr, 10);

    const todayDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const lastFired = localStorage.getItem(LAST_REMINDER_DATE_KEY);

    // If current time matches configured time and hasn't fired yet today
    if (
      lastFired !== todayDateKey &&
      currentHour === targetHour &&
      currentMinute === targetMinute
    ) {
      localStorage.setItem(LAST_REMINDER_DATE_KEY, todayDateKey);

      const title = `⏰ Attendance Reminder (${formatReminderTime12H(reminderConfig.time)})`;
      const body = reminderConfig.message || DEFAULT_REMINDER.message;

      showAttendanceReminderNotification(title, body, false);

      if (onTrigger) {
        onTrigger({
          time: reminderConfig.time,
          formattedTime: formatReminderTime12H(reminderConfig.time),
          message: body
        });
      }
    }
  };

  const ticker = setInterval(checkReminder, 30 * 1000);

  // Also check on tab focus or visibility change
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      refreshConfig();
      checkReminder();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleVisibility);

  return {
    testNotification: async () => {
      await refreshConfig();
      const title = `🔔 Test Attendance Reminder (${formatReminderTime12H(reminderConfig.time)})`;
      const body = reminderConfig.message || DEFAULT_REMINDER.message;
      const shown = await showAttendanceReminderNotification(title, body, true);
      return { shown, config: reminderConfig };
    },
    getConfig: () => reminderConfig,
    refreshConfig,
    cleanup: () => {
      active = false;
      clearInterval(ticker);
      clearInterval(configInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    }
  };
}
