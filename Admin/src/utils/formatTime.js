export function formatTime12Hour(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!match) return value || '';

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return value;

  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${match[2]} ${period}`;
}
