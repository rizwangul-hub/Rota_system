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

// Format 24-hr "18:30" to 12-hr "6:30 PM"
export function formatTime12Hour(value) {
  if (!value || typeof value !== 'string') return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return value;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${match[2]} ${period}`;
}

// Smart parse time input with auto-detection for AM / PM
export function parseTimeInput(value, fieldType) {
  if (!value) return null;
  const trimmed = value.trim();

  // Handle 12-hour format with optional AM/PM (e.g. "9:30 AM", "6:00 PM", "6:00", "06:30")
  const twelveHour = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(trimmed);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    let period = (twelveHour[3] || '').toUpperCase();

    // Auto-detect AM/PM for shift end / leave times
    if (fieldType === 'end') {
      // In retail day shifts, shift ends (e.g. 5:00, 6:00, 6:30, 7:00, 8:00) are afternoon/evening PM
      if (hours >= 1 && hours <= 11) {
        period = 'PM';
      } else if (hours === 12) {
        period = 'PM';
      }
    } else if (fieldType === 'start') {
      // Shifts starting 7:00 - 11:59 are morning AM; 1:00 - 6:59 are afternoon PM
      if (!period) {
        period = (hours >= 7 && hours <= 11) ? 'AM' : 'PM';
      }
    } else if (!period) {
      period = (hours >= 1 && hours <= 6) ? 'PM' : 'AM';
    }

    const hour24 = (hours % 12) + (period === 'PM' ? 12 : 0);
    return `${String(hour24).padStart(2, '0')}:${twelveHour[2]}`;
  }

  // Handle bare 24-hour format
  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!twentyFourHour) return null;
  let hours = Number(twentyFourHour[1]);
  const minutes = Number(twentyFourHour[2]);
  if (hours > 23 || minutes > 59) return null;

  // Auto-correct accidental AM for end times
  if (fieldType === 'end' && hours >= 1 && hours <= 11) {
    hours += 12;
  }

  return `${String(hours).padStart(2, '0')}:${twentyFourHour[2]}`;
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
