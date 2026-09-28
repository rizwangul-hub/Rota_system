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
  if (date.getUTCDay() !== 0) throw new Error('weekStart must be a Sunday.');
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
  if (assignments.length > 500) return 'A weekly rota cannot contain more than 500 assignments.';
  if (targets !== undefined && !Array.isArray(targets)) return 'staffingTargets must be an array.';
  if ((targets || []).length > 300) return 'A weekly rota cannot contain more than 300 staffing targets.';
  if (!METHODS.includes(method)) return 'generationMethod must be MANUAL, AI_TEXT, or AI_VOICE.';
  const targetKeys = new Set();
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
        !Number.isInteger(target.targetWorkers) || target.targetWorkers < 0 || target.targetWorkers > 100) {
      return 'Each staffing target requires a valid dateKey, shopId, and non-negative integer targetWorkers.';
    }
    const key = `${target.dateKey}:${target.shopId}`;
    if (targetKeys.has(key)) return 'Only one staffing target is allowed per shop and date.';
    targetKeys.add(key);
  }
  return null;
}

function findDuplicateEmployeeDates(assignments) {
  const seen = new Set();
  const duplicates = [];
  for (const assignment of assignments) {
    const key = `${assignment.employeeId}:${assignment.dateKey}`;
    if (seen.has(key)) duplicates.push({ employeeId: String(assignment.employeeId), dateKey: assignment.dateKey });
    seen.add(key);
  }
  return duplicates;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createAiRosterContext(employees, shops, instructionText) {
  const employeeIds = new Map();
  const shopIds = new Map();
  const employeeOptions = employees.map((employee, index) => {
    const workerKey = `worker-${index + 1}`;
    employeeIds.set(workerKey, String(employee._id));
    return { workerKey };
  });
  const shopOptions = shops.map((shop, index) => {
    const shopKey = `shop-${index + 1}`;
    shopIds.set(shopKey, String(shop._id));
    return { shopKey, name: shop.name, code: shop.code };
  });

  const references = [];
  const nameCounts = new Map();
  for (const employee of employees) {
    const name = String(employee.name || '').trim();
    if (name) nameCounts.set(name.toLowerCase(), (nameCounts.get(name.toLowerCase()) || 0) + 1);
  }
  employees.forEach((employee, index) => {
    const workerKey = `worker-${index + 1}`;
    const name = String(employee.name || '').trim();
    const employeeId = String(employee.employeeId || '').trim();
    if (name) {
      references.push({
        value: name,
        replacement: nameCounts.get(name.toLowerCase()) > 1 ? 'an employee with an ambiguous name' : workerKey
      });
    }
    if (employeeId) references.push({ value: employeeId, replacement: workerKey });
  });
  references.sort((left, right) => right.value.length - left.value.length);
  let sanitizedInstruction = String(instructionText || '');
  for (const reference of references) {
    sanitizedInstruction = sanitizedInstruction.replace(
      new RegExp(`\\b${escapeRegExp(reference.value)}\\b`, 'gi'),
      reference.replacement
    );
  }

  return { employeeOptions, shopOptions, employeeIds, shopIds, sanitizedInstruction };
}

function resolveAiAssignments(assignments, context) {
  if (!Array.isArray(assignments)) throw new Error('AI assignments must be an array.');
  return assignments.map(assignment => {
    const employeeId = context.employeeIds.get(assignment?.workerKey);
    const shopId = context.shopIds.get(assignment?.shopKey);
    if (!employeeId || !shopId) {
      throw new Error('AI output referenced an unknown employee or shop.');
    }
    return {
      employeeId,
      shopId,
      dateKey: assignment.dateKey,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      ...(assignment.locked === true ? { locked: true } : {})
    };
  });
}

module.exports = {
  DATE_KEY, TIME_KEY, METHODS, isDateKey, getWeek, dateInWeek, minutes,
  validateIntervals, validatePayload, findDuplicateEmployeeDates,
  createAiRosterContext, resolveAiAssignments
};
