const Employee = require('../../models/Employee');
const Shop = require('../../models/Shop');
const { getUKDateString } = require('../../utils/calc');

// In-memory employee and shop cache for fast, deterministic natural language matching
let cachedEmployees = [];
let cachedShops = [];
let lastCacheUpdate = 0;

async function refreshCache() {
  if (Date.now() - lastCacheUpdate < 60000 && cachedEmployees.length > 0) {
    return;
  }
  try {
    cachedEmployees = await Employee.find().select('name employeeId assignedShop dailyWage').lean();
    cachedShops = await Shop.find().select('name code').lean();
    lastCacheUpdate = Date.now();
  } catch (err) {
    console.warn('[AI Natural Language Resolver] Cache update error:', err.message);
  }
}

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

function isExcelReportRequest(text) {
  const t = (text || '').toLowerCase();
  return /\b(excel|spreadsheet|xlsx|excel\s*sheet|in\s*excel|excel\s*file|excel\s*do|excel\s*bhejo|excel\s*report|make\s*excel)\b/i.test(t);
}

// Standard English & Roman Urdu month dictionary with common phonetic variations and typos
const MONTH_NAMES = {
  january: '01', jan: '01', januray: '01', janury: '01',
  february: '02', feb: '02', feburary: '02',
  march: '03', mar: '03',
  april: '04', apr: '04',
  may: '05',
  june: '06', jun: '06',
  july: '07', jul: '07',
  august: '08', aug: '08', agust: '08',
  september: '09', sep: '09', sept: '09', septmbr: '09', septembr: '09',
  october: '10', oct: '10', octobe: '10', octber: '10', octo: '10',
  november: '11', nov: '11', nobember: '11', novmber: '11', novembr: '11',
  december: '12', dec: '12', decembr: '12', dicember: '12'
};

function findMonthInfo(word) {
  if (!word) return null;
  const w = word.toLowerCase().trim();
  if (MONTH_NAMES[w]) {
    return { num: MONTH_NAMES[w], name: w };
  }
  // Prefix or fuzzy check for truncated month typos
  if (w.startsWith('octob') || w.startsWith('oct')) return { num: '10', name: 'october' };
  if (w.startsWith('novem') || w.startsWith('nov') || w.startsWith('nobem')) return { num: '11', name: 'november' };
  if (w.startsWith('decem') || w.startsWith('dec') || w.startsWith('dicem')) return { num: '12', name: 'december' };
  if (w.startsWith('janua') || w.startsWith('jan')) return { num: '01', name: 'january' };
  if (w.startsWith('febru') || w.startsWith('feb')) return { num: '02', name: 'february' };
  if (w.startsWith('march') || w.startsWith('mar')) return { num: '03', name: 'march' };
  if (w.startsWith('april') || w.startsWith('apr')) return { num: '04', name: 'april' };
  if (w === 'may') return { num: '05', name: 'may' };
  if (w.startsWith('june') || w.startsWith('jun')) return { num: '06', name: 'june' };
  if (w.startsWith('july') || w.startsWith('jul')) return { num: '07', name: 'july' };
  if (w.startsWith('augus') || w.startsWith('aug')) return { num: '08', name: 'august' };
  if (w.startsWith('septe') || w.startsWith('sept')) return { num: '09', name: 'september' };
  return null;
}

/**
 * Intelligent date and period parser for natural language
 * Handles:
 * - "31 October", "31st Oct", "October 31" -> { type: 'exact_date', dateStr: '2026-10-31' }
 * - "october", "octobe", "october month", "in october" -> { type: 'month_range', startDate: '2026-10-01', endDate: '2026-10-31' }
 * - "today", "aaj" -> { type: 'exact_date', dateStr: ... }
 * - "yesterday", "kal" -> { type: 'exact_date', dateStr: ... }
 * - "2026-10-31", "31/10/2026"
 */
function parseDateOrPeriod(text) {
  const t = (text || '').toLowerCase();
  const now = new Date();
  const defaultYear = String(now.getUTCFullYear() || 2026);

  // 1. Relative keywords
  if (/\b(today|aaj|current\s*day)\b/i.test(t)) {
    return { type: 'exact_date', dateStr: getUKDateString(now) };
  }
  if (/\b(yesterday|kal|pichla\s*din|guzra\s*kal)\b/i.test(t)) {
    const y = new Date(now);
    y.setUTCDate(y.getUTCDate() - 1);
    return { type: 'exact_date', dateStr: getUKDateString(y) };
  }

  // 2. ISO date YYYY-MM-DD
  const isoMatch = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    return { type: 'exact_date', dateStr: isoMatch[1] };
  }

  // 3. UK date DD/MM/YYYY or DD-MM-YYYY
  const ukMatch = t.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (ukMatch) {
    const day = ukMatch[1].padStart(2, '0');
    const month = ukMatch[2].padStart(2, '0');
    const year = ukMatch[3];
    return { type: 'exact_date', dateStr: `${year}-${month}-${day}` };
  }

  // 4. "31 October", "31st Oct", "31 octobe"
  const dayMonthMatch = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\b/);
  if (dayMonthMatch) {
    const day = dayMonthMatch[1].padStart(2, '0');
    const monthWord = dayMonthMatch[2];
    const mInfo = findMonthInfo(monthWord);
    if (mInfo) {
      return { type: 'exact_date', dateStr: `${defaultYear}-${mInfo.num}-${day}` };
    }
  }

  // 5. "October 31", "Oct 31st", "Octobe 31"
  const monthDayMatch = t.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDayMatch) {
    const monthWord = monthDayMatch[1];
    const day = monthDayMatch[2].padStart(2, '0');
    const mInfo = findMonthInfo(monthWord);
    if (mInfo) {
      return { type: 'exact_date', dateStr: `${defaultYear}-${mInfo.num}-${day}` };
    }
  }

  // 6. Standalone month (e.g. "october", "octobe", "month of octobe", "october month", "in october")
  const tokens = t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const mInfo = findMonthInfo(token);
    if (mInfo) {
      const yr = Number(defaultYear);
      const m = Number(mInfo.num);
      const lastDay = new Date(Date.UTC(yr, m, 0)).getUTCDate();
      return {
        type: 'month_range',
        monthNum: mInfo.num,
        monthName: mInfo.name,
        startDate: `${defaultYear}-${mInfo.num}-01`,
        endDate: `${defaultYear}-${mInfo.num}-${String(lastDay).padStart(2, '0')}`
      };
    }
  }

  // 7. Day of week (e.g. Monday, Tuesday...)
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    const dName = days[i];
    if (new RegExp(`\\b${dName}\\b`, 'i').test(t)) {
      const currentDay = now.getUTCDay();
      let diff = currentDay - i;
      if (diff < 0) diff += 7;
      const target = new Date(now);
      target.setUTCDate(target.getUTCDate() - diff);
      return { type: 'exact_date', dateStr: getUKDateString(target) };
    }
  }

  return null;
}

function parseRelativeDate(text) {
  const parsed = parseDateOrPeriod(text);
  if (parsed?.type === 'exact_date') return parsed.dateStr;
  if (parsed?.type === 'month_range') return parsed.startDate;
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

// Common aliases and phonetic misspellings for Pixx employees
const KNOWN_ALIASES = {
  // Arslan
  'arsaln': 'Arslan Bhai',
  'arslan': 'Arslan Bhai',
  'arsalan': 'Arslan Bhai',
  'aslan': 'Arslan Bhai',
  'arslanbhai': 'Arslan Bhai',
  'arsalanbhai': 'Arslan Bhai',
  // Shafique
  'shafik': 'Shafique',
  'shafiq': 'Shafique',
  'shafique': 'Shafique',
  'shafikbhai': 'Shafique',
  // Ubaid
  'ubaid': 'Ubaid',
  'ubad': 'Ubaid',
  'obaid': 'Ubaid',
  'ubayd': 'Ubaid',
  // Shiva
  'sheva': 'Shiva',
  'shiva': 'Shiva',
  'shiba': 'Shiva',
  // Qasim
  'qasim': 'Qasim',
  'kasim': 'Qasim',
  // Fardin
  'fardin': 'Fardin',
  'fardeen': 'Fardin',
  'ferdin': 'Fardin',
  // Ash
  'ash': 'Ash',
  'ashraf': 'Ash',
  // Anas
  'anas': 'Anas',
  'annas': 'Anas',
  // Dave
  'dave': 'Dave',
  'dev': 'Dave',
  // Wali Ullah
  'waliullah': 'Wali Ullah',
  'wali': 'Wali Ullah',
  'vali': 'Wali Ullah',
  // Zamad
  'zamad': 'Zamad',
  'zammad': 'Zamad',
  // Shahzad
  'shehzad': 'Shahzad',
  'shahzad': 'Shahzad',
  'shahzaad': 'Shahzad',
  // Ali Bhai
  'alibhai': 'Ali Bhai',
  'ali': 'Ali Bhai',
  // Usman
  'usman': 'Usman',
  'usma': 'Usman',
  'usmaan': 'Usman',
  // Sarfraz
  'sarfraz': 'Sarfraz',
  'sarfaraz': 'Sarfraz',
  // Adeel
  'adeel': 'Adeel',
  'adel': 'Adeel',
  'adil': 'Adeel',
  // Jebran
  'jebran': 'Jebran',
  'jibran': 'Jebran',
  // Abdullah
  'abdullah': 'Abdullah',
  'abdulla': 'Abdullah',
  // Sajid
  'sajid': 'Sajid'
};

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Hardcoded fallback list in case DB has not yet populated cache
const FALLBACK_EMPLOYEES = [
  'Shiva', 'Qasim', 'Arslan Bhai', 'Sam', 'Fardin', 'Shafique', 'Ash', 'Anas',
  'Dave', 'Wali Ullah', 'Zamad', 'Shahzad', 'Ali Bhai', 'Jebran', 'Abdullah',
  'Sajid', 'Ubaid', 'Usman', 'Sarfraz', 'Adeel', 'Arsalan'
];

/**
 * Robust Worker Identification:
 * Matches query against real employees in database, alias mapping, and fuzzy distance.
 * Avoids misidentifying English words (like "october", "whicht", "report") as workers!
 */
async function extractWorker(text) {
  await refreshCache();
  const t = (text || '').toLowerCase();
  const words = t.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  // 1. Check known multi-word alias pairs (e.g. "arslan bhai", "wali ullah", "ali bhai")
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (KNOWN_ALIASES[pair]) {
      return KNOWN_ALIASES[pair];
    }
  }

  // 2. Check known single-word aliases (e.g. "arsaln", "shafik", "ubad", "adel")
  for (const word of words) {
    if (KNOWN_ALIASES[word]) {
      return KNOWN_ALIASES[word];
    }
  }

  const empList = cachedEmployees.length > 0 ? cachedEmployees : FALLBACK_EMPLOYEES.map(name => ({ name }));

  // 3. Check for exact employeeId match (e.g. PIXX001)
  for (const emp of empList) {
    if (emp.employeeId && new RegExp(`\\b${emp.employeeId.toLowerCase()}\\b`, 'i').test(t)) {
      return emp.name;
    }
  }

  // 4. Check full employee name match (e.g. "Arslan Bhai", "Wali Ullah")
  for (const emp of empList) {
    if (emp.name) {
      const full = emp.name.toLowerCase();
      if (new RegExp(`\\b${full}\\b`, 'i').test(t)) {
        return emp.name;
      }
    }
  }

  // 5. Check first name (e.g. "Arslan", "Ali", "Wali", "Shafique", "Ubaid")
  for (const emp of empList) {
    if (emp.name) {
      const firstName = emp.name.toLowerCase().split(' ')[0];
      if (firstName.length >= 3 && new RegExp(`\\b${firstName}\\b`, 'i').test(t)) {
        return emp.name;
      }
    }
  }

  // 6. Fuzzy Levenshtein match for slight typos in first name (distance <= 2 for words >= 5 chars, distance <= 1 for 4 chars)
  for (const word of words) {
    if (word.length < 4) continue;
    // Don't fuzzy-match common calendar or functional words
    if (/^(today|yesterday|month|october|november|december|report|salary|hours|mints|minute|minutes|which|whicht|where|store|check|total|present|daily)$/i.test(word)) {
      continue;
    }
    for (const emp of empList) {
      const firstName = (emp.name || '').toLowerCase().split(' ')[0];
      if (firstName.length < 3) continue;
      const maxDist = firstName.length >= 5 ? 2 : 1;
      if (Math.abs(word.length - firstName.length) <= maxDist) {
        const dist = levenshteinDistance(word, firstName);
        if (dist <= maxDist) {
          return emp.name;
        }
      }
    }
  }

  return null;
}

/**
 * Intelligent Intent Resolver:
 * Dispatches to the exact tool with validated entities and date parameters.
 */
async function resolveIntentAndToolCall(message, history = [], user = {}) {
  const t = (message || '').trim().toLowerCase();
  let shopName = extractShopName(t);
  const period = parseDateOrPeriod(t);
  let workerName = await extractWorker(message);

  // Detect Comparative / Ranking Queries (e.g. "which worker is most active", "which worker late mint is more less then other", "who is most punctual")
  const isComparisonQuery = /\b(which\s*worker|which\s*employee|who\s*is\s*most|who\s*has\s*most|who\s*is\s*least|who\s*has\s*least|most\s*active|least\s*late|less\s*late|more\s*less|most\s*late|highest\s*late|minimum\s*late|lowest\s*late|most\s*punctual|best\s*punctuality|worst\s*punctuality|who\s*worked\s*most|who\s*worked\s*least|highest\s*hours|lowest\s*hours|most\s*shifts|least\s*shifts|most\s*absent|least\s*absent|sab\s*se\s*zyada|sab\s*se\s*kam|konsa\s*worker|konsa\s*employee|top\s*worker|top\s*workers|worker\s*ranking|compare\s*workers)\b/i.test(t);

  // Multi-turn Context Resolution (extract recent entity from history ONLY if not a comparison/ranking question and pronouns or short follow-ups used)
  const isPronounOrFollowup = !isComparisonQuery && !workerName && /\b(he|him|his|unka|unke|unki|uska|uske|uski|that person)\b/i.test(t);
  const isShortFollowup = !isComparisonQuery && !workerName && (isPdfReportRequest(t) || isExcelReportRequest(t) || /^(salary|late|mints|attendance|hours|shifts|record|statement)$/i.test(t.trim()) || (/^(how many|what is|give me|show)\s+(salary|late|mints|hours|shifts)\b/i.test(t)));

  if ((isPronounOrFollowup || isShortFollowup) && Array.isArray(history) && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const pastText = history[i]?.content || '';
      const pastWorker = await extractWorker(pastText);
      if (pastWorker) {
        workerName = pastWorker;
        break;
      }
      if (!shopName) {
        const pastShop = extractShopName(pastText);
        if (pastShop) shopName = pastShop;
      }
    }
  }

  const isSalaryQuery = /\b(salary|salaries|tankhwah|payroll|wage|wages|earnings|pay|paid|balance)\b/i.test(t);
  const isRotaQuery = /\b(rota|schedule|shift|planning|roster|planner)\b/i.test(t);
  const isAttendanceQuery = /\b(attendance|hazri|present|late|lateness|absent|hours|worked|checked|reached|left|time|duty|work|mints|minute|minutes|deri)\b/i.test(t);
  const isLedgerQuery = /\b(ledger|khatta|running\s*balance|ledger\s*statement|account\s*statement|running\s*account)\b/i.test(t);
  const isPaymentQuery = /\b(payment|payments|disburs|disbursement|cash\s*paid|bank\s*transfer|cash\s*vs\s*bank|was\s*paid|paid\s*out)\b/i.test(t);
  const isPendingQuery = /\b(pending|pending\s*review|unverified|unapproved|pending\s*attendance|needs\s*approval|to\s*be\s*checked|awaiting\s*check)\b/i.test(t);
  const isCheckedQuery = /\b(checked\s*attendance|verified\s*attendance|approved\s*attendance|finalized\s*attendance)\b/i.test(t);
  const isHoursQuery = /\b(opening\s*hours?|closing\s*hours?|opening\s*time|closing\s*time|shop\s*hours?|timing|timings)\b/i.test(t);
  const isAuditQuery = /\b(audit|audit\s*log|audit\s*trail|system\s*log|activity\s*log|who\s*changed|who\s*deleted)\b/i.test(t);
  const isBonusQuery = /\b(bonus|bonuses|sales\s*bonus|target\s*bonus|monthly\s*bonus)\b/i.test(t);
  const isLoanQuery = /\b(loan|loans|qarz|advance|advances|loan\s*balance)\b/i.test(t);

  // Security & Credential Queries Protection
  const isSecurityQuery = /\b(password|passwords|credential|credentials|login\s*detail|login\s*details|admin\s*login|secret|secrets|token|tokens|api\s*key|auth\s*token)\b/i.test(t);
  if (isSecurityQuery) {
    return [{
      name: 'securityNotice',
      args: { query: message }
    }];
  }

  // 0. Worker Comparison & Ranking Queries (e.g. "which worker is most active on shop", "which worker late mint is more less then other")
  if (isComparisonQuery) {
    let criteria = 'most_active';

    if (/\b(least\s*late|less\s*late|more\s*less|minimum\s*late|lowest\s*late|most\s*punctual|best\s*punctuality|kam\s*late|sab\s*se\s*kam\s*late|punctual)\b/i.test(t)) {
      criteria = 'least_late';
    } else if (/\b(most\s*late|highest\s*late|maximum\s*late|worst\s*punctuality|sab\s*se\s*zyada\s*late|zyada\s*late)\b/i.test(t)) {
      criteria = 'most_late';
    } else if (/\b(most\s*absent|highest\s*absence|sab\s*se\s*zyada\s*absent|most\s*absences)\b/i.test(t)) {
      criteria = 'most_absent';
    } else if (/\b(least\s*absent|lowest\s*absence|sab\s*se\s*kam\s*absent|fewest\s*absent)\b/i.test(t)) {
      criteria = 'least_absent';
    } else if (/\b(most\s*hours|highest\s*hours|most\s*worked|sab\s*se\s*zyada\s*ghante|sab\s*se\s*zyada\s*hours)\b/i.test(t)) {
      criteria = 'most_hours';
    } else {
      criteria = 'most_active';
    }

    const args = { criteria };
    if (shopName) args.shopName = shopName;
    if (period?.type === 'month_range') {
      args.startDate = period.startDate;
      args.endDate = period.endDate;
    } else if (period?.type === 'exact_date') {
      args.startDate = period.dateStr;
      args.endDate = period.dateStr;
    }

    return [{
      name: 'getWorkerRankingsAndComparison',
      args
    }];
  }

  // 1. Audit Trail Query (Admin only)
  if (isAuditQuery) {
    return [{
      name: 'getAuditHistory',
      args: { limit: 30 }
    }];
  }

  // 2. Bonus History Query
  if (isBonusQuery) {
    return [{
      name: 'getBonusHistory',
      args: { workerName, limit: 30 }
    }];
  }

  // 3. Loans Summary Query
  if (isLoanQuery) {
    return [{
      name: 'getLoansSummary',
      args: { workerName, limit: 30 }
    }];
  }

  // 4. Verification Queue: Pending Review Query
  if (isPendingQuery) {
    return [{
      name: 'getPendingAttendance',
      args: {
        shopName,
        date: period?.type === 'exact_date' ? period.dateStr : undefined,
        limit: 50
      }
    }];
  }

  // 5. Verified / Checked Attendance Query
  if (isCheckedQuery) {
    return [{
      name: 'getCheckedAttendance',
      args: {
        shopName,
        date: period?.type === 'exact_date' ? period.dateStr : undefined,
        limit: 50
      }
    }];
  }

  // 6. Shop Opening Hours / Operating Timings Query
  if (isHoursQuery) {
    return [{
      name: 'getShopOpeningHours',
      args: { shopName }
    }];
  }

  // 7. Salary Payments / Disbursement History Query
  if (isPaymentQuery) {
    const isCash = /\bcash\b/i.test(t);
    const isBank = /\bbank\b/i.test(t);
    return [{
      name: 'getSalaryPayments',
      args: {
        workerName,
        paymentMethod: isCash ? 'Cash' : (isBank ? 'Bank' : undefined),
        limit: 50
      }
    }];
  }

  // 8. Employee Ledger / Khatta Query
  if (isLedgerQuery && workerName) {
    const args = { workerName, limit: 50 };
    if (period?.type === 'month_range') {
      args.startDate = period.startDate;
      args.endDate = period.endDate;
    }
    return [{
      name: 'getEmployeeLedger',
      args
    }];
  }

  // 9. Worker Specific Queries
  if (workerName) {
    // A. Worker Salary / Payroll query
    if (isSalaryQuery) {
      const args = { workerName };
      if (period?.type === 'exact_date') {
        args.weekStart = period.dateStr;
      } else if (period?.type === 'month_range') {
        args.startDate = period.startDate;
        args.endDate = period.endDate;
      }
      return [{
        name: 'getWorkerSalaryAndPayroll',
        args
      }];
    }

    // B. Worker Attendance query with Date or Month
    if (period) {
      if (period.type === 'exact_date') {
        return [{
          name: 'getWorkerAttendance',
          args: {
            workerName,
            date: period.dateStr
          }
        }];
      }
      if (period.type === 'month_range') {
        return [{
          name: 'getWorkerAttendance',
          args: {
            workerName,
            startDate: period.startDate,
            endDate: period.endDate,
            limit: 40
          }
        }];
      }
    }

    // C. General worker attendance or rota query
    if (isAttendanceQuery || isRotaQuery) {
      return [{
        name: 'getWorkerAttendance',
        args: { workerName }
      }];
    }

    // D. General worker profile details
    return [{
      name: 'getWorkerDetails',
      args: { workerName }
    }];
  }

  // 10. Shop Specific Queries
  if (shopName) {
    if (isRotaQuery) {
      return [{
        name: 'getShopWeeklyRota',
        args: {
          shopName,
          weekStart: period?.type === 'exact_date' ? period.dateStr : undefined
        }
      }];
    }

    // Daily attendance at shop
    return [{
      name: 'getShopDailyAttendance',
      args: {
        shopName,
        date: period?.type === 'exact_date' ? period.dateStr : getUKDateString(new Date())
      }
    }];
  }

  // 11. Company-wide Payroll Query
  if (isSalaryQuery) {
    return [{
      name: 'getWeeklyPayrollSummary',
      args: {
        weekStart: period?.type === 'exact_date' ? period.dateStr : undefined
      }
    }];
  }

  // 12. Company-wide Weekly Rota Query
  if (isRotaQuery) {
    return [{
      name: 'getWeeklyRotaOverview',
      args: {
        weekStart: period?.type === 'exact_date' ? period.dateStr : undefined
      }
    }];
  }

  // 13. Daily Attendance Overview for a specific Date
  if (period?.type === 'exact_date') {
    return [{
      name: 'getDailyAttendanceOverview',
      args: { date: period.dateStr }
    }];
  }

  // 14. Explicit inquiry for today or general attendance overview
  const isExplicitTodayOrAttendance = /\b(today|aaj|attendance|hazri|who\s*is\s*working|duty\s*list|daily\s*report)\b/i.test(t);
  if (isAttendanceQuery || isExplicitTodayOrAttendance) {
    return [{
      name: 'getDailyAttendanceOverview',
      args: { date: getUKDateString(new Date()) }
    }];
  }

  // 15. Unknown or out-of-scope query fallback
  return [{
    name: 'clarifyOrOutOfScopeNotice',
    args: { query: message }
  }];
}

module.exports = {
  isGreetingOrHelp,
  getGreetingResponse,
  isPdfReportRequest,
  isExcelReportRequest,
  parseRelativeDate,
  parseDateOrPeriod,
  extractShopName,
  extractWorker,
  extractWorkerCandidate: extractWorker,
  resolveIntentAndToolCall
};
