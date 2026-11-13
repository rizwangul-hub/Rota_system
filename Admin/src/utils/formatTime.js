export function formatTime12Hour(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value || '');
  if (!match) return value || '';

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return value;

  // Retail day shifts (shop open 9 AM - 7 PM): hours 1..7 are PM (13:00 - 19:59)
  if (hours >= 1 && hours <= 7) {
    hours += 12;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${match[2]} ${period}`;
}
