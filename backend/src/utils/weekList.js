const mongoose = require('mongoose');
const WeeklySalary = require('../models/WeeklySalary');
const Attendance = require('../models/Attendance');
const { getWeekRange, getUKDateString } = require('./calc');

/**
 * Returns a sorted, descending list of all available rota week labels (e.g. "18/10/2026 – 24/10/2026").
 * Always includes the current rota week, and aggregates historical weeks from WeeklySalary and Attendance records.
 */
async function getAvailableWeeksList() {
  let salaryWeeks = [];
  let attendanceDates = [];

  const isConnected = mongoose.connection && mongoose.connection.readyState === 1;

  if (isConnected) {
    try {
      if (typeof WeeklySalary.distinct === 'function') {
        salaryWeeks = (await WeeklySalary.distinct('weekLabel')) || [];
      }
    } catch (e) {
      salaryWeeks = [];
    }

    try {
      if (typeof Attendance.distinct === 'function') {
        attendanceDates = (await Attendance.distinct('dateString')) || [];
      }
    } catch (e) {
      attendanceDates = [];
    }
  }

  const weekSet = new Set();
  const currentWeek = getWeekRange(getUKDateString());
  weekSet.add(currentWeek.weekLabel);

  for (const w of salaryWeeks) {
    if (w && typeof w === 'string') {
      const normalized = w.includes(' to ') ? w.replace(' to ', ' – ') : w;
      weekSet.add(normalized);
    }
  }

  for (const d of attendanceDates) {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const range = getWeekRange(d);
      weekSet.add(range.weekLabel);
    }
  }

  return Array.from(weekSet).sort((a, b) => {
    const parseStart = (str) => {
      const part = String(str || '').split(/[–—-]|to/)[0].trim();
      const parts = part.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d).getTime() || 0;
      }
      return 0;
    };
    return parseStart(b) - parseStart(a);
  });
}

module.exports = {
  getAvailableWeeksList
};
