// Format UK display date: e.g. "Tue, 03/11/2026"
export function formatUKDisplayDate(dateObj) {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${dayNames[d.getDay()]}, ${day}/${month}/${year}`;
}

// Format YYYY-MM-DD
export function toDateString(dateObj) {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
}

// Format 24-hr "18:30" or "14:00" to 12-hr "6:30 PM" or "2:00 PM"
export function formatTime12Hour(value) {
  if (!value || typeof value !== 'string') return '';
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return value;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return value;

  // Auto-correct stored 1..7 (01:00 - 07:59) that represent afternoon/evening PM (13:00 - 19:59)
  // In retail shop operations (9 AM - 7 PM), 1:00 to 7:00 is always PM
  if (hours >= 1 && hours <= 7) {
    hours += 12;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${match[2]} ${period}`;
}

// Smart parse time input with auto-detection for AM / PM
// Rule:
// - Times between 8:00 and 11:59 -> automatically considered AM (e.g. 8:50 AM -> 08:50)
// - Times between 12:00 and 7:59 (12, 1, 2, 3, 4, 5, 6, 7) -> automatically considered PM (e.g. 2:00 PM -> 14:00)
// - For end times (leaving/shift end): hours 1..11 are PM
export function parseTimeInput(value, fieldType) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // 1. Handle flexible formats: "2", "2pm", "2 pm", "2:00", "2:00 pm", "02:00", "14:00", "8:50", "9:00 am"
  const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(trimmed);
  if (!timeRegex) return null;

  let hours = Number(timeRegex[1]);
  const minutes = timeRegex[2] !== undefined ? Number(timeRegex[2]) : 0;
  let period = (timeRegex[3] || '').toUpperCase();

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  // If already 24-hour (> 12), format directly
  if (hours > 12) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Auto-detection rules:
  // If fieldType is 'end' (shift end / worker departure)
  if (fieldType === 'end') {
    if (!period) {
      period = (hours >= 1 && hours <= 11) || hours === 12 ? 'PM' : 'AM';
    } else if (hours >= 1 && hours <= 11) {
      // In retail, worker never leaves at 1 AM - 11 AM
      period = 'PM';
    }
  } else {
    // Arrival / shift start:
    // User rule:
    // - Between 12 and 7 (12, 1, 2, 3, 4, 5, 6, 7): consider in PM
    // - Between 8 and 11:59: consider in AM
    if (hours >= 1 && hours <= 7) {
      // 1:00 to 7:00 is afternoon/evening PM (half-day shifts, afternoon arrivals)
      period = 'PM';
    } else if (hours >= 8 && hours <= 11) {
      // 8:00 to 11:59 is morning AM (early shop opening 8:50, regular 9:00, etc.)
      if (!period) {
        period = 'AM';
      }
    } else if (hours === 12) {
      // 12:00 is noon PM
      if (!period) {
        period = 'PM';
      }
    }
  }

  // Calculate 24-hour representation
  let hour24 = hours;
  if (period === 'PM') {
    hour24 = (hours % 12) + 12;
  } else if (period === 'AM') {
    hour24 = hours % 12;
  }

  return `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Calculate Sunday weekStart (YYYY-MM-DD) for any given date
export function getSundayWeekStart(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay(); // 0 is Sunday
  const diff = -day;
  const sunday = new Date(d);
  sunday.setDate(d.getDate() + diff);
  return toDateString(sunday);
}
