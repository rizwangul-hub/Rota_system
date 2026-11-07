const { getAiConfig, AiError } = require('./aiConfig');
const { ALL_ROTA_TOOL_DECLARATIONS, executeRotaTool } = require('./rotaTools');
const {
  isGreetingOrHelp,
  getGreetingResponse,
  isPdfReportRequest,
  resolveIntentAndToolCall
} = require('./naturalLanguageResolver');
const { generateAiPdfReport } = require('./aiPdfReportService');
const { getUKDateString } = require('../../utils/calc');

const SYSTEM_INSTRUCTION = `You are the AI Workforce, Rota & Payroll Assistant for Pixx Technologies Ltd (UK Rota Management System).
Your job is to answer questions about any worker, any shop, or any day/date, and provide complete, verified details from the system database.

ACTIVE DIRECTORY:
- Active Workers: Shiva (PIXX001), Qasim (PIXX002), Arslan Bhai (PIXX003), Sam (PIXX004), Fardin (PIXX005), Shafique (PIXX006), Ash (PIXX007), Ubaid (PIXX008), Anas (PIXX009), Dave (PIXX010), Wali Ullah (PIXX011), Zamad (PIXX012), Shahzad (PIXX013), Ali Bhai (PIXX014), Jebran (PIXX015), Abdullah (PIXX016), Sajid (PIXX017).
- Key Operators / Managers: Usman Salahuddin (Attendance Operator), Sarfraz Khan (Attendance Checker & Approver), Adeel Ahmed (Operator).
- Retail Stores / Shops: Station (STAT), Camden (CAMD), Chelsea (CHEL), Edgware (EDGW), Southwark (SOUT), Leebridge (LEEB).

TOOL SELECTION RULES:
1. Salary / Payroll / Pay / Earnings / Tankhwah:
   - Call 'getWorkerSalaryAndPayroll'.
   - If a month is mentioned (e.g. October, "give me ubaid salary report of october month"), set startDate to '2026-10-01' and endDate to '2026-10-31'.
   - Do NOT call getWorkerDetails when the user asks about salary or payroll.

2. Attendance / Shifts / Duty / Monthly or Daily Work Report:
   - Call 'getWorkerAttendance'.
   - If a specific date is mentioned (e.g. "31 October", "on whicht shop Shafique work on 31 October"), set date to '2026-10-31'.
   - If a month or range is mentioned (e.g. "give me october report fo ubaid"), set startDate to '2026-10-01' and endDate to '2026-10-31'.

3. General Worker Profile / Bio:
   - Only call 'getWorkerDetails' if the user asks generic profile or contact questions (e.g. "who is Ubaid", "what is Ubaid", "tell me about Shiva").

4. Shop & Company Attendance / Rota:
   - Call 'getShopDailyAttendance' for a shop on a date.
   - Call 'getShopWeeklyRota' for a shop's weekly schedule.
   - Call 'getDailyAttendanceOverview' for all-shop daily attendance.

GUIDELINES:
- Understand English, Roman Urdu, and Urdu questions seamlessly (e.g. "Shiva ki attendance batao", "Camden shop mein kal kon tha", "on whicht shop Shafique work on 31 October", "give me october report fo ubaid").
- NEVER confuse ordinary words (like "october", "whicht", "report", "duty") as worker names. Always match against the active directory.
- When answering which shop a worker worked at on a date, state the shop name clearly and prominently.
- Format all financial figures in British Pounds (£).
- Always format tabular data (attendance logs, staff lists, weekly salaries) in clean Markdown tables.
- If the user explicitly asks for a PDF report ("in PDF", "give me in PDF", "PDF download", "PDF do"), summarize the information and confirm the PDF has been generated.`;

/**
 * Format raw tool output into beautiful Markdown
 */
function formatToolResult(toolName, result, originalQuery = '') {
  if (!result) return 'No data found.';
  if (result.error) {
    let out = `⚠️ **${result.error}**\n\n`;
    if (Array.isArray(result.availableWorkers) && result.availableWorkers.length) {
      out += `**Available Workers in System:**\n` + result.availableWorkers.map(w => `- ${w}`).join('\n');
    }
    if (Array.isArray(result.availableShops) && result.availableShops.length) {
      out += `**Available Shops:**\n` + result.availableShops.map(s => `- ${s}`).join('\n');
    }
    return out;
  }

  // 1. getWorkerDetails
  if (toolName === 'getWorkerDetails' && result.worker) {
    const w = result.worker;
    let out = `### 👤 Worker Profile: ${w.name} (${w.employeeId})\n\n`;
    out += `| Attribute | Details |\n|---|---|\n`;
    out += `| **Full Name** | ${w.name} |\n`;
    out += `| **Employee ID** | ${w.employeeId} |\n`;
    out += `| **Assigned Shop** | ${w.assignedShop} |\n`;
    out += `| **Daily Wage** | ${w.dailyWage} |\n`;
    out += `| **Hourly Rate** | ${w.hourlyWage} |\n`;
    out += `| **Status** | ${w.employmentStatus} |\n`;
    out += `| **Phone** | ${w.phone} |\n`;
    out += `| **Start Date** | ${w.startDate} |\n\n`;

    if (result.loans && result.loans.totalLoansCount > 0) {
      out += `**Loan & Advance Status:**\n- Total Loans Taken: ${result.loans.totalLoansCount} (${result.loans.totalLoanAmount})\n- Outstanding Balance: **${result.loans.remainingLoanBalance}**\n\n`;
    }

    if (result.latestPayroll) {
      const p = result.latestPayroll;
      out += `**Latest Payroll (${p.weekLabel}):**\n- Working Days: ${p.workingDays} | Hours: ${p.totalHours} hrs | Final Salary: **${p.finalSalary}** (${p.status})\n`;
    }
    return out;
  }

  // 2. getWorkerAttendance
  if (toolName === 'getWorkerAttendance' && result.records) {
    const q = (originalQuery || '').toLowerCase();
    const isLateQuery = /\b(late|lateness|mints?\s*late|late\s*mints?|minutes?\s*late|late\s*minutes?|deri)\b/i.test(q);
    const isAbsentQuery = /\b(absent|absents|absence|chutti|off\s*day|holidays?)\b/i.test(q);

    // Single-day specific attendance result (e.g. "on which shop Shafique work on 31 October")
    if (result.records.length === 1) {
      const r = result.records[0];
      let out = `### 📋 Attendance Log: ${result.workerName} (${result.workerId})\n\n`;
      if (r.status === 'Absent') {
        out += `On **${r.date}**, **${result.workerName}** was **ABSENT / OFF**.\n\n`;
      } else {
        out += `On **${r.date}**, **${result.workerName}** worked at **${r.shop} Cycles**.\n\n`;
      }
      out += `| Detail | Logged Information |\n|---|---|\n`;
      out += `| **Worker** | ${result.workerName} (${result.workerId}) |\n`;
      out += `| **Date** | ${r.date} |\n`;
      out += `| **Shop Location** | **${r.shop}** |\n`;
      out += `| **Shift Scheduled** | ${r.shiftStart} – ${r.shiftEnd} |\n`;
      out += `| **Actual Working Hours** | ${r.reachedTime} – ${r.leftTime} (${r.hours}h logged) |\n`;
      out += `| **Attendance Status** | **${r.status}** |\n`;
      out += `| **Lateness / Deductions** | ${r.lateMinutes ? `${r.lateMinutes} min late` : '0 min'} (${r.deduction}) |\n`;
      out += `| **Calculated Daily Pay** | **${r.pay}** |\n`;
      out += `| **Checker Approval** | ${r.approvalStatus} |\n`;
      if (r.remarks && r.remarks !== '—') {
        out += `| **Remarks** | ${r.remarks} |\n`;
      }
      return out;
    }

    const s = result.summary || {};
    let out = '';

    if (isLateQuery) {
      const totalMins = s.totalLateMinutes || 0;
      const hours = Math.floor(totalMins / 60);
      const remainingMins = totalMins % 60;
      const timeStr = hours > 0 ? `${hours} hr${hours > 1 ? 's' : ''} ${remainingMins} min${remainingMins !== 1 ? 's' : ''}` : `${totalMins} mins`;
      const minorDelays = Math.max(0, (result.lateRecords?.length || 0) - (s.totalLate || 0));

      out += `## ⏱️ Total Late Minutes: ${totalMins} Minutes (${timeStr})\n`;
      out += `**Worker:** **${result.workerName}** (${result.workerId}) | **Total Shifts Scanned:** ${result.totalRecords}\n\n`;

      out += `| Metric | Total Value |\n|---|---|\n`;
      out += `| **Total Late Duration** | **${totalMins} minutes** (${timeStr}) |\n`;
      out += `| **Official Late Shifts (>15 min grace)** | **${s.totalLate || 0} shifts** |\n`;
      out += `| **Minor Delay Shifts (within grace)** | **${minorDelays} shifts** |\n`;
      out += `| **Total Late Deductions** | **${s.totalLateDeductions || '£0.00'}** |\n`;
      out += `| **Total Present Days** | **${s.totalPresent || 0} days** |\n`;
      out += `| **Total Absent Days** | **${s.totalAbsent || 0} days** |\n`;
      out += `| **Total Logged Hours** | **${s.totalHoursLogged || 0} hrs** |\n`;
      out += `| **Total Calculated Pay** | **${s.totalEarned || '£0.00'}** |\n\n`;

      if (result.lateRecords && result.lateRecords.length > 0) {
        out += `### 🚨 Detailed Late Shifts Breakdown (${result.lateRecords.length} Shifts):\n`;
        out += `| Date | Shop | Shift Scheduled | Actual Arrival | Late Duration | Official Status | Deduction |\n|---|---|---|---|---|---|---|\n`;
        result.lateRecords.forEach(r => {
          out += `| **${r.date}** | ${r.shop} | ${r.shiftStart}–${r.shiftEnd} | ${r.reachedTime} | **${r.lateMinutes} mins late** | **${r.status}** | ${r.deduction} |\n`;
        });
        out += `\n`;
      } else {
        out += `_No late arrivals recorded for this worker in the specified period._\n\n`;
      }

      out += `### 📋 Complete Period Attendance Records:\n`;
    } else if (isAbsentQuery) {
      out += `## ❌ Total Absent Days: ${s.totalAbsent || 0} Days\n`;
      out += `**Worker:** **${result.workerName}** (${result.workerId}) | **Total Shifts:** ${result.totalRecords}\n\n`;

      out += `| Metric | Total Value |\n|---|---|\n`;
      out += `| **Total Absent Days** | **${s.totalAbsent || 0} days** |\n`;
      out += `| **Total Present Days** | **${s.totalPresent || 0} days** |\n`;
      out += `| **Total Late Shifts** | **${s.totalLate || 0} shifts** |\n`;
      out += `| **Total Logged Hours** | **${s.totalHoursLogged || 0} hrs** |\n`;
      out += `| **Total Calculated Pay** | **${s.totalEarned || '£0.00'}** |\n\n`;

      if (result.absentRecords && result.absentRecords.length > 0) {
        out += `### ❌ Absent Dates Breakdown:\n`;
        out += `| Date | Status | Shop | Remarks |\n|---|---|---|---|\n`;
        result.absentRecords.forEach(r => {
          out += `| **${r.date}** | **Absent** | ${r.shop} | ${r.remarks || '—'} |\n`;
        });
        out += `\n`;
      } else {
        out += `_No absences recorded for this worker in the specified period._\n\n`;
      }

      out += `### 📋 Complete Period Attendance Records:\n`;
    } else {
      out += `## 📋 Attendance Summary: ${result.workerName} (${result.workerId})\n\n`;
      if (result.summary) {
        out += `| Metric | Total Value |\n|---|---|\n`;
        out += `| **Total Present Days** | **${s.totalPresent} days** |\n`;
        out += `| **Total Late Shifts** | **${s.totalLate}** (${s.totalLateMinutes || 0} mins total) |\n`;
        out += `| **Total Absent Days** | **${s.totalAbsent} days** |\n`;
        out += `| **Total Hours Logged** | **${s.totalHoursLogged} hrs** |\n`;
        out += `| **Total Calculated Pay** | **${s.totalEarned}** |\n\n`;
      }
    }

    if (result.records.length === 0) {
      out += `_No attendance entries logged for ${result.workerName} for this period._\n`;
      return out;
    }

    out += `| Date | Shop | Shift | Arrival – Leave | Hours | Status | Pay | Approval |\n|---|---|---|---|---|---|---|---|\n`;
    result.records.forEach(r => {
      out += `| ${r.date} | ${r.shop} | ${r.shiftStart}–${r.shiftEnd} | ${r.reachedTime}–${r.leftTime} | ${r.hours}h | **${r.status}** | ${r.pay} | ${r.approvalStatus} |\n`;
    });
    return out;
  }

  // 3. getWorkerSalaryAndPayroll
  if (toolName === 'getWorkerSalaryAndPayroll' && result.salaries) {
    if (result.salaries.length === 0) {
      return `### 💰 Payroll Breakdown: ${result.workerName} (${result.workerId})\n\n_No salary calculations generated for this worker in the requested period._\n`;
    }

    const s = result.summary || {};
    let out = `## 💰 Total Salary: ${s.totalFinalSalary || '£0.00'}\n`;
    out += `**Worker:** **${result.workerName}** (${result.workerId}) | **Total Weeks:** ${result.salaries.length} weeks\n\n`;

    out += `| Metric | Total Value |\n|---|---|\n`;
    out += `| **Total Final Net Salary** | **${s.totalFinalSalary || '£0.00'}** |\n`;
    out += `| **Total Gross Daily Wages** | **${s.totalGrossWages || '£0.00'}** |\n`;
    out += `| **Total Deductions** | **${s.totalLateDeductions || '£0.00'}** |\n`;
    out += `| **Total Disbursed / Paid** | **${s.totalPaid || '£0.00'}** |\n`;
    out += `| **Total Remaining Balance** | **${s.totalBalanceRemaining || '£0.00'}** |\n\n`;

    out += `### 📅 Weekly Payroll Breakdown:\n`;
    out += `| Week Range | Days | Hours | Gross Wages | Deductions | Final Salary | Status |\n|---|---|---|---|---|---|---|\n`;
    result.salaries.forEach(w => {
      out += `| ${w.week} | ${w.workingDays} | ${w.actualHours}h | ${w.grossWages} | ${w.lateDeductions} | **${w.finalSalary}** | ${w.status} |\n`;
    });
    return out;
  }

  // 4. getShopDetails
  if (toolName === 'getShopDetails' && result.shop) {
    const s = result.shop;
    let out = `### 🏪 Shop Information: ${s.name} (${s.code})\n\n`;
    out += `| Detail | Value |\n|---|---|\n`;
    out += `| **Shop Name** | ${s.name} |\n`;
    out += `| **Shop Code** | ${s.code} |\n`;
    out += `| **Address** | ${s.address} |\n`;
    out += `| **Phone** | ${s.phone} |\n`;
    out += `| **Status** | ${s.status} |\n`;
    out += `| **Assigned Workers** | ${result.totalAssignedWorkers} active staff |\n\n`;

    if (result.assignedWorkers && result.assignedWorkers.length) {
      out += `**Assigned Staff Members:**\n`;
      result.assignedWorkers.forEach(w => {
        out += `- **${w.name}** (${w.employeeId}) — Wage: ${w.dailyWage}/day\n`;
      });
    }
    return out;
  }

  // 5. getShopDailyAttendance
  if (toolName === 'getShopDailyAttendance') {
    let out = `### 🏪 Daily Attendance at ${result.shopName} (${result.date})\n\n`;
    if (result.summary) {
      out += `**Staff on Duty:** ${result.summary.workersPresent} workers | **Total Logged Hours:** ${result.summary.totalHours} hrs | **Total Wages:** ${result.summary.totalDailyCost}\n\n`;
    }

    if (!result.workers || result.workers.length === 0) {
      out += `_No workers logged at ${result.shopName} on this date._\n`;
      return out;
    }

    out += `| Worker Name | ID | Arrival – Leave | Hours | Status | Daily Pay | Status |\n|---|---|---|---|---|---|---|\n`;
    result.workers.forEach(w => {
      out += `| **${w.workerName}** | ${w.employeeId} | ${w.actualTime} | ${w.hours}h | **${w.status}** | ${w.pay} | ${w.approvalStatus} |\n`;
    });
    return out;
  }

  // 6. getShopWeeklyRota
  if (toolName === 'getShopWeeklyRota') {
    let out = `### 📅 Weekly Rota Schedule for ${result.shopName} (${result.week})\n\n`;
    out += `**Status:** ${result.status} | **Total Scheduled Shifts:** ${result.totalAssignments}\n\n`;

    const dayMap = result.scheduleByDate || {};
    const dates = Object.keys(dayMap).sort();

    if (dates.length === 0) {
      out += `_No shifts scheduled for this shop in this week's rota._\n`;
      return out;
    }

    dates.forEach(dKey => {
      out += `#### 🗓️ ${dKey}\n`;
      out += `| Worker Name | ID | Shift Time | Scheduled Hours |\n|---|---|---|---|\n`;
      dayMap[dKey].forEach(s => {
        out += `| **${s.workerName}** | ${s.employeeId} | ${s.time} | ${s.hours} hrs |\n`;
      });
      out += `\n`;
    });
    return out;
  }

  // 7. getDailyAttendanceOverview
  if (toolName === 'getDailyAttendanceOverview') {
    let out = `### 📊 Daily Attendance Overview (${result.date})\n\n`;
    const s = result.summary || {};
    out += `**Totals:** Present: **${s.present || 0}** | Late: **${s.late || 0}** | Half-Day: **${s.half || 0}** | Absent: **${s.absent || 0}** | Total Hours: **${s.totalHours || 0}h** | Total Pay: **${s.totalWages || '£0'}**\n\n`;

    const shops = Object.keys(result.shopBreakdown || {});
    if (shops.length === 0) {
      out += `_No attendance records found for this date._\n`;
      return out;
    }

    shops.forEach(sName => {
      out += `#### 🏪 ${sName}\n`;
      out += `| Worker | ID | Time Logged | Hours | Status | Pay | Approval |\n|---|---|---|---|---|---|---|\n`;
      result.shopBreakdown[sName].forEach(w => {
        out += `| **${w.worker}** | ${w.id} | ${w.actual} | ${w.hours}h | **${w.status}** | ${w.pay} | ${w.approval} |\n`;
      });
      out += `\n`;
    });
    return out;
  }

  // 8. getWeeklyPayrollSummary
  if (toolName === 'getWeeklyPayrollSummary') {
    let out = `### 💼 Weekly Company Payroll Summary (${result.week})\n\n`;
    if (result.totals) {
      const t = result.totals;
      out += `| Payroll Metric | Amount |\n|---|---|\n`;
      out += `| **Total Staff Count** | ${result.totalStaff} employees |\n`;
      out += `| **Total Hours Logged** | ${t.totalHoursLogged} hrs |\n`;
      out += `| **Gross Wages** | ${t.totalGrossWages} |\n`;
      out += `| **Total Deductions** | ${t.totalDeductions} |\n`;
      out += `| **Total Bonuses** | ${t.totalBonuses} |\n`;
      out += `| **Net Payable Salary** | **${t.totalNetSalary}** |\n`;
      out += `| **Total Paid Out** | ${t.totalPaidOut} |\n`;
      out += `| **Outstanding Balance** | **${t.balanceRemaining}** |\n\n`;
    }

    if (result.staffSummary && result.staffSummary.length) {
      out += `**Staff Breakdown:**\n`;
      out += `| Worker | ID | Hours | Net Pay | Status |\n|---|---|---|---|---|\n`;
      result.staffSummary.forEach(st => {
        out += `| ${st.name} | ${st.id} | ${st.hours}h | **${st.finalPay}** | ${st.status} |\n`;
      });
    }
    return out;
  }

  // 9. getAllEmployeesSummary
  if (toolName === 'getAllEmployeesSummary') {
    let out = `### 👥 Active Staff Directory (${result.totalEmployees} Workers)\n\n`;
    out += `| Name | ID | Assigned Shop | Daily Wage | Phone | Status |\n|---|---|---|---|---|---|\n`;
    result.employees.forEach(e => {
      out += `| **${e.name}** | ${e.employeeId} | ${e.assignedShop} | ${e.dailyWage} | ${e.phone} | ${e.status} |\n`;
    });
    return out;
  }

  // 10. getAllShopsSummary
  if (toolName === 'getAllShopsSummary') {
    let out = `### 🏪 Pixx Retail Shops Directory (${result.totalShops} Stores)\n\n`;
    out += `| Shop Name | Code | Address | Active Assigned Staff | Status |\n|---|---|---|---|---|\n`;
    result.shops.forEach(s => {
      out += `| **${s.name}** | ${s.code} | ${s.address} | ${s.activeWorkersAssigned} | ${s.status} |\n`;
    });
    return out;
  }

  return JSON.stringify(result, null, 2);
}

/**
 * Ask the Rota Assistant
 */
async function askRotaAssistant(message, history = [], user = {}) {
  const trimmed = (message || '').trim();

  // 1. Check for greeting or generic help
  if (isGreetingOrHelp(trimmed)) {
    return {
      success: true,
      message: getGreetingResponse(),
      toolCalls: [],
      engine: 'pixx-ai-assistant'
    };
  }

  // 2. Check for natural language PDF request
  if (isPdfReportRequest(trimmed)) {
    try {
      const pdfResult = await generateAiPdfReport(trimmed, user);
      if (pdfResult && pdfResult.success) {
        return {
          success: true,
          message: pdfResult.message,
          pdfReport: pdfResult.pdfReport,
          engine: 'pdf-generation-service'
        };
      }
    } catch (pdfErr) {
      console.warn('[AI PDF Generation Warning]:', pdfErr.message);
    }
  }

  // 3. Attempt Gemini API with function calling
  const config = getAiConfig();
  let calls = null;
  let engine = 'pixx-ai-resolver';

  if (config.enabled && config.configured) {
    try {
      const candidateModels = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', config.model];
      const todayUK = getUKDateString(new Date());
      const systemWithDate = `${SYSTEM_INSTRUCTION}\nToday in UK: ${todayUK}.`;

      const requestBody = {
        systemInstruction: { parts: [{ text: systemWithDate }] },
        contents: [
          ...history.slice(-6).map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          })),
          { role: 'user', parts: [{ text: trimmed }] }
        ],
        tools: [{ functionDeclarations: ALL_ROTA_TOOL_DECLARATIONS }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.1 }
      };

      for (const modelToTry of candidateModels) {
        try {
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToTry)}:generateContent?key=${config.key}`, {
            method: 'POST',
            signal: AbortSignal.timeout(10000),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (resp.ok) {
            const data = await resp.json();
            const parts = data?.candidates?.[0]?.content?.parts || [];
            const funcCalls = parts.filter(p => p.functionCall).map(p => ({
              name: p.functionCall.name,
              args: p.functionCall.args || {}
            }));

            if (funcCalls.length > 0) {
              calls = funcCalls;
              engine = `gemini (${modelToTry})`;
              break;
            }
          }
        } catch (modelErr) {
          console.warn(`[Gemini ${modelToTry} attempt failed]:`, modelErr.message);
        }
      }
    } catch (geminiOuterErr) {
      console.warn('[Gemini call bypassed, falling back to deterministic resolver]:', geminiOuterErr.message);
    }
  }

  // 4. Fallback to natural language intent resolver if LLM returned no calls
  if (!calls || calls.length === 0) {
    calls = await resolveIntentAndToolCall(trimmed);
  }

  // 5. Execute resolved tools against the database
  const toolResults = [];
  const textOutputs = [];

  for (const call of calls) {
    try {
      const res = await executeRotaTool(call.name, call.args, user);
      toolResults.push({ name: call.name, args: call.args, result: res });
      textOutputs.push(formatToolResult(call.name, res, trimmed));
    } catch (toolExecErr) {
      console.error(`[Tool Execution Error ${call.name}]:`, toolExecErr);
      textOutputs.push(`⚠️ Error retrieving information for ${call.name}: ${toolExecErr.message}`);
    }
  }

  let finalMessage = textOutputs.join('\n\n---\n\n');

  // If the query was asking about PDF, or if the user mentioned PDF, also generate a PDF companion!
  let pdfReport = null;
  if (isPdfReportRequest(trimmed)) {
    try {
      const pdfRes = await generateAiPdfReport(trimmed, user);
      if (pdfRes && pdfRes.pdfReport) {
        pdfReport = pdfRes.pdfReport;
        finalMessage += `\n\n📄 **Official PDF report has been generated!** Click the button below to download.`;
      }
    } catch {}
  }

  return {
    success: true,
    message: finalMessage,
    toolCalls: calls,
    pdfReport,
    engine,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  askRotaAssistant
};
