const { getUKDateString, getWeekRange } = require('../../utils/calc');

// Greetings detector
function isGreetingOrHelp(text) {
  const t = (text || '').trim().toLowerCase();
  return /^(hi|hello|hey|salam|assalam|aoa|kese ho|kaise ho|help|madad|capabilities|what can you do|tum kya kar sakte ho|options|start)\b/i.test(t);
}

function getGreetingResponse() {
  return `👋 **Hello! I am your AI Workforce & Finance Assistant for the Pixx Rota System.**

I can instantly provide full details and export PDF reports for:

1. **Any Worker**: Attendance history, arrival & departure times, late minutes, daily wages, weekly salary calculations, deductions, and loan balances (e.g. *"Show me Shiva's attendance"*, *"Qasim ka salary breakdown"*, *"Usman details"*).
2. **Any Shop**: Daily attendance logs, staffing coverage, assigned staff, weekly rota schedule, and shop labour costs (e.g. *"Who worked at Camden yesterday?"*, *"Chelsea weekly rota"*, *"Shop 1 attendance"*).
3. **Any Day / Date**: Complete daily attendance summary, who was late or absent, hours logged, and manager approval status (e.g. *"Show me today's attendance"*, *"Who was absent on Friday?"*, *"2026-11-05 attendance overview"*).
4. **Instant PDF Reports**: Just say **"Give me in PDF"** and I will generate and download an official report right here! (e.g. *"Give me Rizwan's attendance in PDF"*, *"Today's attendance report in PDF"*).

How can I help you today?`;
}

// Check if message is a request for a PDF report
function isPdfReportRequest(text) {
  const t = (text || '').toLowerCase();
  return /\b(pdf|download\s*pdf|export\s*pdf|in\s*pdf|pdf\s*file|pdf\s*bhejo|pdf\s*do|pdf\s*chahiye|pdf\s*generate|generate\s*pdf|make\s*pdf)\b/i.test(t);
}

// Parse date from natural language (relative or explicit)
function parseRelativeDate(text) {
  const t = (text || '').toLowerCase();
  const now = new Date();

  if (/\b(today|aaj|current\s*day)\b/i.test(t)) {
    return getUKDateString(now);
  }

  if (/\b(yesterday|kal|pichla\s*din|guzra\s*kal)\b/i.test(t)) {
    const y = new Date(now);
    y.setUTCDate(y.getUTCDate() - 1);
    return getUKDateString(y);
  }

  // ISO date YYYY-MM-DD
  const isoMatch = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  // UK date DD/MM/YYYY or DD-MM-YYYY
  const ukMatch = t.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (ukMatch) {
    const day = ukMatch[1].padStart(2, '0');
    const month = ukMatch[2].padStart(2, '0');
    const year = ukMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Day of week (e.g. Monday, Tuesday...)
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    const dName = days[i];
    if (new RegExp(`\\b${dName}\\b`, 'i').test(t)) {
      // Find the most recent day of this name
      const currentDay = now.getUTCDay();
      let diff = currentDay - i;
      if (diff < 0) diff += 7;
      const target = new Date(now);
      target.setUTCDate(target.getUTCDate() - diff);
      return getUKDateString(target);
    }
  }

  return null;
}

// Known shops in Pixx system
const KNOWN_SHOPS = [
  { name: 'Station', regex: /\b(station|stat)\b/i },
  { name: 'Camden', regex: /\b(camden|camd)\b/i },
  { name: 'Chelsea', regex: /\b(chelsea|chel)\b/i },
  { name: 'Edgware', regex: /\b(edgware|edgw)\b/i },
  { name: 'Southwark', regex: /\b(southwark|sout)\b/i },
  { name: 'Leebridge', regex: /\b(leebridge|leabridge|labridge|lea\s*bridge)\b/i }
];

function extractShopName(text) {
  for (const shop of KNOWN_SHOPS) {
    if (shop.regex.test(text)) {
      return shop.name;
    }
  }
  return null;
}

// Resolve user intent and return fallback tool calls if external LLM fails
function resolveIntentAndToolCall(message) {
  const t = (message || '').trim().toLowerCase();
  const shopName = extractShopName(t);
  const date = parseRelativeDate(t);

  // 1. Check for salary / payroll query
  if (/\b(salary|salaries|tankhwah|payroll|wage|wages|earnings|pay|bonus|paid|balance)\b/i.test(t)) {
    // Check if for specific worker
    const workerName = extractWorkerCandidate(t);
    if (workerName) {
      return [{
        name: 'getWorkerSalaryAndPayroll',
        args: { workerName }
      }];
    }
    return [{
      name: 'getWeeklyPayrollSummary',
      args: {}
    }];
  }

  // 2. Check for rota / schedule query
  if (/\b(rota|schedule|shift|planning|roster|roster|planner)\b/i.test(t)) {
    if (shopName) {
      return [{
        name: 'getShopWeeklyRota',
        args: { shopName }
      }];
    }
    const workerName = extractWorkerCandidate(t);
    if (workerName) {
      return [{
        name: 'getWorkerAttendance',
        args: { workerName }
      }];
    }
    return [{
      name: 'getWeeklyRotaOverview',
      args: {}
    }];
  }

  // 3. Check for attendance query
  if (/\b(attendance|hazri|present|late|absent|hours|worked|checked|reached|left|time)\b/i.test(t)) {
    const workerName = extractWorkerCandidate(t);
    if (workerName) {
      return [{
        name: 'getWorkerAttendance',
        args: { workerName, date }
      }];
    }
    if (shopName) {
      return [{
        name: 'getShopDailyAttendance',
        args: { shopName, date: date || getUKDateString(new Date()) }
      }];
    }
    return [{
      name: 'getDailyAttendanceOverview',
      args: { date: date || getUKDateString(new Date()) }
    }];
  }

  // 4. Check for shop-specific general queries
  if (shopName) {
    if (date || /\b(today|yesterday|kal|aaj)\b/i.test(t)) {
      return [{
        name: 'getShopDailyAttendance',
        args: { shopName, date: date || getUKDateString(new Date()) }
      }];
    }
    return [{
      name: 'getShopDetails',
      args: { shopName }
    }];
  }

  // 5. Check if query is about a specific worker profile
  const workerName = extractWorkerCandidate(t);
  if (workerName) {
    return [{
      name: 'getWorkerDetails',
      args: { workerName }
    }];
  }

  // 6. Default to daily attendance overview for today
  if (date) {
    return [{
      name: 'getDailyAttendanceOverview',
      args: { date }
    }];
  }

  return [{
    name: 'getDailyAttendanceOverview',
    args: { date: getUKDateString(new Date()) }
  }];
}

// Extract potential worker name tokens from text (excluding stop words and shop names)
const STOP_WORDS = new Set([
  'give', 'me', 'in', 'pdf', 'the', 'show', 'tell', 'what', 'who', 'is', 'a', 'an', 'and', 'or', 'for', 'of',
  'to', 'from', 'at', 'on', 'all', 'today', 'yesterday', 'kal', 'aaj', 'attendance', 'salary', 'rota', 'schedule',
  'details', 'report', 'wages', 'wage', 'hours', 'status', 'shop', 'station', 'camden', 'chelsea', 'edgware',
  'southwark', 'leebridge', 'leabridge', 'ka', 'ki', 'ke', 'ko', 'mein', 'par', 'tha', 'thi', 'the', 'batao',
  'dikhao', 'bhejo', 'do', 'chahiye', 'worker', 'employee', 'staff'
]);

function extractWorkerCandidate(text) {
  const words = text.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const candidates = words.filter(w => !STOP_WORDS.has(w.toLowerCase()) && w.length >= 3);
  if (candidates.length > 0) {
    return candidates[0];
  }
  return null;
}

module.exports = {
  isGreetingOrHelp,
  getGreetingResponse,
  isPdfReportRequest,
  parseRelativeDate,
  extractShopName,
  resolveIntentAndToolCall,
  extractWorkerCandidate
};
