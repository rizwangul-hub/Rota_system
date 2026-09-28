const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const METHODS = ['MANUAL', 'AI_TEXT', 'AI_VOICE'];

function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getWeek(value) {
  if (!isDateKey(value)) throw new Error('weekStart must be a valid YYYY-MM-DD date.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.getUTCDay() !== 1) throw new Error('weekStart must be a Monday.');
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 6);
  return { weekStart: value, weekEnd: end.toISOString().slice(0, 10) };
}

function dateInWeek(dateKey, weekStart) {
  if (!isDateKey(dateKey)) return false;
  const offset = (Date.parse(`${dateKey}T00:00:00.000Z`) - Date.parse(`${weekStart}T00:00:00.000Z`)) / 86400000;
  return Number.isInteger(offset) && offset >= 0 && offset <= 6;
}

function minutes(time) {
  if (typeof time !== 'string' || !TIME_KEY.test(time)) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function validateIntervals(intervals = []) {
  if (!Array.isArray(intervals)) return 'Availability intervals must be an array.';
  const normalized = [];
  for (const interval of intervals) {
    const start = minutes(interval?.startTime);
    const end = minutes(interval?.endTime);
    if (start === null || end === null || end <= start) return 'Availability intervals need valid times with endTime after startTime.';
    normalized.push({ start, end });
  }
  normalized.sort((a, b) => a.start - b.start);
  if (normalized.some((interval, index) => index > 0 && interval.start < normalized[index - 1].end)) {
    return 'Availability intervals must not overlap.';
  }
  return null;
}

function validatePayload(assignments, targets, method) {
  if (!Array.isArray(assignments)) return 'assignments must be an array.';
  if (targets !== undefined && !Array.isArray(targets)) return 'staffingTargets must be an array.';
  if (!METHODS.includes(method)) return 'generationMethod must be MANUAL, AI_TEXT, or AI_VOICE.';
  for (const assignment of assignments) {
    if (!assignment || !assignment.employeeId || !assignment.shopId) return 'Each assignment requires employeeId and shopId.';
    if (!isDateKey(assignment.dateKey)) return 'Each assignment requires a valid dateKey in YYYY-MM-DD format.';
    if (minutes(assignment.startTime) === null || minutes(assignment.endTime) === null ||
        minutes(assignment.endTime) <= minutes(assignment.startTime)) {
      return 'Each assignment needs valid startTime and endTime, with endTime after startTime.';
    }
    if (assignment.locked !== undefined && typeof assignment.locked !== 'boolean') return 'locked must be a boolean.';
  }
  for (const target of targets || []) {
    if (!target || !target.shopId || !isDateKey(target.dateKey) ||
        !Number.isInteger(target.targetWorkers) || target.targetWorkers < 0) {
      return 'Each staffing target requires a valid dateKey, shopId, and non-negative integer targetWorkers.';
    }
  }
  return null;
}

module.exports = { DATE_KEY, TIME_KEY, METHODS, isDateKey, getWeek, dateInWeek, minutes, validateIntervals, validatePayload };
