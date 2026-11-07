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

SYSTEM CONTEXT & CAPABILITIES:
- The system manages 6 retail bike shops in London: Station Cycles, Camden Cycles, Chelsea Cycles, Edgware Cycles, Southwark Cycles, and Leebridge Cycles.
- Roles include Admin, Attendance Operator (Usman Salahuddin), and Attendance Checker (Sarfraz Khan).
- Shift hours are typically 9 hours (e.g. 09:00 AM to 06:00 PM / 07:00 PM). Lateness is calculated with a 15-minute grace period.
- Weekly salaries are generated every week with deductions for lateness/early leave, bonuses, and loan deductions.
- Understand English, Roman Urdu, and Urdu questions seamlessly (e.g. "Shiva ki attendance batao", "Camden shop mein kal kon tha", "Kis kis ka salary ban gaya", "Aaj ki attendance summary").
- When a user asks for information, call the appropriate database tool to retrieve live, accurate records.
- Format all financial figures in British Pounds (£).
- Always format tabular data (like attendance logs, staff lists, daily shop logs) in clean Markdown tables.
- If the user explicitly asks for a PDF report ("in PDF", "give me in PDF", "PDF download", "PDF do"), provide a clear, concise summary and indicate that the PDF has been generated.`;

/**
 * Format raw tool output into beautiful Markdown
 */
function formatToolResult(toolName, result) {
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
    let out = `### 📋 Attendance Records: ${result.workerName} (${result.workerId})\n\n`;
    if (result.summary) {
      const s = result.summary;
      out += `**Summary:** Present: **${s.totalPresent}** | Late: **${s.totalLate}** | Half-Day: **${s.totalHalf}** | Absent: **${s.totalAbsent}** | Total Hours: **${s.totalHoursLogged} hrs** | Total Earned: **${s.totalEarned}**\n\n`;
    }

    if (result.records.length === 0) {
      out += `_No attendance entries logged for this period._\n`;
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
    let out = `### 💰 Weekly Payroll Breakdown: ${result.workerName} (${result.workerId})\n\n`;
    if (result.salaries.length === 0) {
      out += `_No salary calculations generated for this worker yet._\n`;
      return out;
    }

    out += `| Week Range | Days | Hours | Gross Wages | Deductions | Final Salary | Status |\n|---|---|---|---|---|---|---|\n`;
    result.salaries.forEach(s => {
      out += `| ${s.week} | ${s.workingDays} | ${s.actualHours}h | ${s.grossWages} | ${s.lateDeductions} | **${s.finalSalary}** | ${s.status} |\n`;
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
      const candidateModels = [config.model, 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
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
            signal: AbortSignal.timeout(15000),
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
    calls = resolveIntentAndToolCall(trimmed);
  }

  // 5. Execute resolved tools against the database
  const toolResults = [];
  const textOutputs = [];

  for (const call of calls) {
    try {
      const res = await executeRotaTool(call.name, call.args, user);
      toolResults.push({ name: call.name, args: call.args, result: res });
      textOutputs.push(formatToolResult(call.name, res));
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
