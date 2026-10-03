const mongoose = require('mongoose');

/**
 * Safely validate and return a MongoDB ObjectId or null
 */
function safeObjectId(id) {
  if (!id || typeof id !== 'string') return null;
  const cleaned = id.trim();
  if (['all', 'undefined', 'null', 'none', ''].includes(cleaned)) return null;
  return mongoose.Types.ObjectId.isValid(cleaned) ? cleaned : null;
}

/**
 * Business Calculation Engine for PixxTechnologies Bicycle Shops (UK)
 */

/**
 * Parse "HH:mm" or "HH:mm:ss" into minutes from start of day
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Format minutes from start of day into "HH:mm"
 */
function minutesToTime(totalMinutes) {
  const normalized = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Calculate scheduled shift hours from shiftStart ("09:00") and shiftEnd ("19:00")
 */
function calculateScheduledHours(shiftStart, shiftEnd) {
  if (!shiftStart || !shiftEnd) return 0;
  const startMin = timeToMinutes(shiftStart);
  const endMin = timeToMinutes(shiftEnd);
  const diffMin = Math.max(0, endMin - startMin);
  return Number((diffMin / 60).toFixed(2));
}

/**
 * Calculate actual worked hours from timeReached and workerEndTime
 */
function calculateWorkedHours(timeReached, workerEndTime, fallbackScheduledHours = 0, status = 'Present') {
  if (status === 'Absent') return 0;
  if (!timeReached || !workerEndTime) return fallbackScheduledHours;
  const startMin = timeToMinutes(timeReached);
  const endMin = timeToMinutes(workerEndTime);
  const diffMin = Math.max(0, endMin - startMin);
  return Number((diffMin / 60).toFixed(2));
}

/**
 * Calculate lateness in minutes
 */
function calculateLateMinutes(shiftStart, timeReached) {
  if (!shiftStart || !timeReached) return 0;
  const startMin = timeToMinutes(shiftStart);
  const reachedMin = timeToMinutes(timeReached);
  return Math.max(0, reachedMin - startMin);
}

/**
 * Calculate early departure in minutes (leaving before shiftEnd)
 */
function calculateEarlyLeaveMinutes(shiftEnd, workerEndTime) {
  if (!shiftEnd || !workerEndTime) return 0;
  const endMin = timeToMinutes(shiftEnd);
  const leftMin = timeToMinutes(workerEndTime);
  return Math.max(0, endMin - leftMin);
}

/**
 * Core lateness, early leave & wage calculation:
 *
 * Daily wage = £50 (or custom employee daily wage)
 * Scheduled hours = shiftEnd - shiftStart (e.g. 10 hours) -> Hourly rate = £50 / 10 = £5/hr
 *
 * ARRIVAL LATENESS:
 * IF Late Minutes <= gracePeriodMinutes (default 15):
 *   Arrival Deduction = £0
 * IF Late Minutes > gracePeriodMinutes:
 *   Arrival Deduction = Hourly Rate * (Late Minutes / 60)
 *
 * EARLY DEPARTURE:
 * IF Worker left before shiftEnd:
 *   Early Leave Deduction = Hourly Rate * (Early Leave Minutes / 60)
 *
 * Total Deduction = Arrival Deduction + Early Leave Deduction
 * Attendance Pay = Math.max(0, Base Pay - Total Deduction)
 */
function calculateAttendanceRecord({
  dailyWage = 0,
  shiftStart = '09:00',
  shiftEnd = '19:00',
  timeReached = '09:00',
  workerEndTime = '19:00',
  status = 'Present',
  gracePeriodMinutes = 15,
}) {
  const wage = (Number(dailyWage) && Number(dailyWage) > 0) ? Number(dailyWage) : 50;
  const scheduledHours = calculateScheduledHours(shiftStart, shiftEnd);
  const hourlyWage = scheduledHours > 0 ? Number((wage / scheduledHours).toFixed(4)) : 0;

  if (status === 'Absent') {
    return {
      scheduledHours,
      actualHours: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      hourlyWage,
      lateDeduction: 0,
      arrivalDeduction: 0,
      earlyLeaveDeduction: 0,
      attendancePay: 0,
      status: 'Absent'
    };
  }

  const lateMinutes = calculateLateMinutes(shiftStart, timeReached);
  const earlyLeaveMinutes = calculateEarlyLeaveMinutes(shiftEnd, workerEndTime);

  let computedStatus = status;
  if (!status || status === 'Present' || status === 'Late') {
    computedStatus = lateMinutes > gracePeriodMinutes ? 'Late' : 'Present';
  }

  let arrivalDeduction = 0;
  if (lateMinutes > gracePeriodMinutes) {
    arrivalDeduction = Number((hourlyWage * (lateMinutes / 60)).toFixed(2));
  }

  let earlyLeaveDeduction = 0;
  if (earlyLeaveMinutes > 0 && computedStatus !== 'Half') {
    earlyLeaveDeduction = Number((hourlyWage * (earlyLeaveMinutes / 60)).toFixed(2));
  }

  const totalDeduction = Number((arrivalDeduction + earlyLeaveDeduction).toFixed(2));

  let basePay = wage;
  if (computedStatus === 'Half') {
    basePay = Number((wage / 2).toFixed(2));
  }

  const attendancePay = Number(Math.max(0, basePay - totalDeduction).toFixed(2));
  const actualHours = calculateWorkedHours(timeReached, workerEndTime, scheduledHours, computedStatus);

  return {
    scheduledHours,
    actualHours,
    lateMinutes,
    earlyLeaveMinutes,
    hourlyWage: Number(hourlyWage.toFixed(2)),
    lateDeduction: totalDeduction,
    arrivalDeduction,
    earlyLeaveDeduction,
    attendancePay,
    status: computedStatus
  };
}

/**
 * Get day of week (0=Sunday ... 6=Saturday) in UK London time
 */
function getDayOfWeekUK(dateInput = new Date()) {
  try {
    let d;
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      d = new Date(`${dateInput}T12:00:00Z`);
    } else {
      d = new Date(dateInput || Date.now());
    }
    if (isNaN(d.getTime())) d = new Date();
    const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/London', weekday: 'short' }).format(d);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[dayStr] !== undefined ? map[dayStr] : d.getDay();
  } catch {
    return 0;
  }
}

/**
 * Default shift hours for UK bicycle shops by day of week (0=Sunday, 1=Monday ... 6=Saturday)
 */
function getDefaultShiftTimesForDate(dateObj = new Date()) {
  const day = getDayOfWeekUK(dateObj);
  if (day === 0) {
    // Sunday: 11:00 AM - 5:00 PM (6 hours)
    return { shiftStart: '11:00', shiftEnd: '17:00' };
  } else if (day === 6) {
    // Saturday: 9:00 AM - 6:00 PM (9 hours)
    return { shiftStart: '09:00', shiftEnd: '18:00' };
  } else {
    // Monday - Friday: 9:00 AM - 7:00 PM (10 hours)
    return { shiftStart: '09:00', shiftEnd: '19:00' };
  }
}

/**
 * Format Date as UK standard DD/MM/YYYY
 */
function formatUKDate(dateInput) {
  if (!dateInput) return '';
  try {
    let d = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
      ? new Date(`${dateInput}T12:00:00Z`)
      : new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput || '');
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
  } catch {
    return String(dateInput || '');
  }
}

/**
 * Get date string "YYYY-MM-DD" in UK London time
 */
function getUKDateString(dateInput = new Date()) {
  try {
    let d = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
      ? new Date(`${dateInput}T12:00:00Z`)
      : new Date(dateInput || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);
    const year = parts.find(p => p.type === 'year')?.value || String(d.getFullYear());
    const month = parts.find(p => p.type === 'month')?.value || String(d.getMonth() + 1).padStart(2, '0');
    const day = parts.find(p => p.type === 'day')?.value || String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}


/**
 * Get Sunday and Saturday for a date (Weekly period: Sunday to Saturday)
 */
function getWeekRange(dateInput = new Date()) {
  let dateStr;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    dateStr = dateInput;
  } else if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
    const [d, m, y] = dateInput.split('/');
    dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  } else {
    dateStr = getUKDateString(dateInput);
  }

  // Parse YYYY-MM-DD
  const [year, month, dayOfMonth] = dateStr.split('-').map(Number);
  // Noon UTC avoids daylight saving shifts
  const utcDate = new Date(Date.UTC(year, month - 1, dayOfMonth, 12, 0, 0));
  const dayOfWeek = utcDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToSunday = -dayOfWeek;

  const sundayUtc = new Date(utcDate);
  sundayUtc.setUTCDate(utcDate.getUTCDate() + diffToSunday);

  const saturdayUtc = new Date(sundayUtc);
  saturdayUtc.setUTCDate(sundayUtc.getUTCDate() + 6);

  const startYear = sundayUtc.getUTCFullYear();
  const startMonth = String(sundayUtc.getUTCMonth() + 1).padStart(2, '0');
  const startDay = String(sundayUtc.getUTCDate()).padStart(2, '0');
  const startDateString = `${startYear}-${startMonth}-${startDay}`;

  const endYear = saturdayUtc.getUTCFullYear();
  const endMonth = String(saturdayUtc.getUTCMonth() + 1).padStart(2, '0');
  const endDay = String(saturdayUtc.getUTCDate()).padStart(2, '0');
  const endDateString = `${endYear}-${endMonth}-${endDay}`;

  const formattedStartDate = `${startDay}/${startMonth}/${startYear}`;
  const formattedEndDate = `${endDay}/${endMonth}/${endYear}`;
  const weekLabel = `${formattedStartDate} – ${formattedEndDate}`;
  const legacyWeekLabel = `${formattedStartDate} to ${formattedEndDate}`;

  return {
    startDate: new Date(`${startDateString}T00:00:00.000Z`),
    endDate: new Date(`${endDateString}T23:59:59.999Z`),
    startDateString,
    endDateString,
    formattedStartDate,
    formattedEndDate,
    weekLabel,
    legacyWeekLabel
  };
}

/**
 * Centralized calculation service for Final Weekly Salary (Phase 6)
 * Formula: Net Attendance Pay + Travel Allowance + Other Allowance + Bonus - Other Deductions
 */
function calculateFinalWeeklySalary({
  netAttendancePay = 0,
  travelAllowance = 0,
  otherAllowances = 0,
  bonus = 0,
  otherDeductions = 0
}) {
  const attendance = Number(Number(netAttendancePay || 0).toFixed(2));
  const travel = Number(Number(travelAllowance || 0).toFixed(2));
  const other = Number(Number(otherAllowances || 0).toFixed(2));
  const totalAllowances = Number((travel + other).toFixed(2));
  const bonusAmt = Number(Number(bonus || 0).toFixed(2));
  const deductions = Number(Number(otherDeductions || 0).toFixed(2));

  // Net Attendance Pay + Allowances + Bonus - Other Deductions
  const finalSalary = Number(Math.max(0, attendance + travel + other + bonusAmt - deductions).toFixed(2));

  return {
    netAttendancePay: attendance,
    travelAllowance: travel,
    otherAllowances: other,
    totalAllowances,
    bonus: bonusAmt,
    otherDeductions: deductions,
    finalSalary
  };
}

/**
 * Calculate a weekly salary breakdown from already-approved components.
 * Attendance pay must already include lateness deductions.
 */
function calculateWeeklySalaryComponents({
  netAttendancePay = 0,
  adjustments = [],
  bonus = 0
}) {
  const totals = adjustments.reduce((result, adjustment) => {
    const amount = Number(Number(adjustment.amount || 0).toFixed(2));
    if (adjustment.type === 'TRAVEL_ALLOWANCE') result.travelAllowance += amount;
    else if (adjustment.type === 'OTHER_ALLOWANCE') result.otherAllowances += amount;
    else if (['OTHER_DEDUCTION', 'MANUAL_DEDUCTION'].includes(adjustment.type)) {
      result.otherDeductions += amount;
    }
    return result;
  }, { travelAllowance: 0, otherAllowances: 0, otherDeductions: 0 });

  const calculation = calculateFinalWeeklySalary({
    netAttendancePay,
    travelAllowance: totals.travelAllowance,
    otherAllowances: totals.otherAllowances,
    bonus,
    otherDeductions: totals.otherDeductions
  });

  return {
    ...calculation,
    travelAllowance: Number(totals.travelAllowance.toFixed(2)),
    otherAllowances: Number(totals.otherAllowances.toFixed(2)),
    otherDeductions: Number(totals.otherDeductions.toFixed(2))
  };
}

module.exports = {
  safeObjectId,
  timeToMinutes,
  minutesToTime,
  calculateScheduledHours,
  calculateWorkedHours,
  calculateLateMinutes,
  calculateAttendanceRecord,
  getDefaultShiftTimesForDate,
  getDayOfWeekUK,
  formatUKDate,
  getUKDateString,
  getWeekRange,
  calculateFinalWeeklySalary,
  calculateWeeklySalaryComponents
};
