require('../../utils/pdfkitFontPatch');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const Employee = require('../../models/Employee');
const Shop = require('../../models/Shop');
const Attendance = require('../../models/Attendance');
const WeeklySalary = require('../../models/WeeklySalary');
const WeeklyRota = require('../../models/WeeklyRota');
const { getUKDateString, formatUKDate, getWeekRange, getDayOfWeekUK } = require('../../utils/calc');
const { findEmployee, findShop } = require('./rotaTools');
const { parseRelativeDate, extractShopName, extractWorker } = require('./naturalLanguageResolver');

// In-memory PDF buffer store (60 min TTL)
const pdfReportStore = new Map();
const PDF_TTL_MS = 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [token, item] of pdfReportStore.entries()) {
    if (item.expiresAt < now) {
      pdfReportStore.delete(token);
    }
  }
}, 5 * 60 * 1000).unref();

function storePdf(buffer, fileName, title, user) {
  const token = 'rotapdf_' + crypto.randomBytes(16).toString('hex');
  pdfReportStore.set(token, {
    buffer,
    fileName,
    title,
    userId: user?._id ? String(user._id) : null,
    createdAt: Date.now(),
    expiresAt: Date.now() + PDF_TTL_MS
  });
  return token;
}

function getStoredPdf(token) {
  if (!token || !pdfReportStore.has(token)) return null;
  const item = pdfReportStore.get(token);
  if (item.expiresAt < Date.now()) {
    pdfReportStore.delete(token);
    return null;
  }
  return item;
}

/**
 * 1. Build Worker Attendance PDF Report
 */
async function buildWorkerAttendancePdfBuffer(worker, dateRange = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const query = { employee: worker._id };
      if (dateRange.startDate || dateRange.endDate) {
        query.dateString = {};
        if (dateRange.startDate) query.dateString.$gte = dateRange.startDate;
        if (dateRange.endDate) query.dateString.$lte = dateRange.endDate;
      }

      const records = await Attendance.find(query).sort({ dateString: -1 }).limit(30);

      // Header Banner
      doc.rect(36, 36, 523, 56).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
        .text('PIXX TECHNOLOGIES — WORKER ATTENDANCE STATEMENT', 48, 48);
      doc.fontSize(10).font('Helvetica').fillColor('#94a3b8')
        .text(`Generated on ${formatUKDate(new Date())} • Official Attendance & Wage Record`, 48, 70);

      // Worker Info Card
      doc.rect(36, 102, 523, 64).fill('#f8fafc').stroke('#e2e8f0');
      doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold')
        .text(`${worker.name} (${worker.employeeId})`, 48, 112);

      doc.fontSize(9).font('Helvetica').fillColor('#475569')
        .text(`Assigned Shop: ${worker.assignedShop?.name || 'Unassigned'}`, 48, 130)
        .text(`Daily Wage: £${worker.dailyWage || 0}   •   Hourly Rate: £${((worker.dailyWage || 0) / 9).toFixed(2)}/hr`, 48, 144);

      doc.fillColor('#475569')
        .text(`Status: ${worker.employmentStatus || 'Active'}`, 340, 130)
        .text(`Phone: ${worker.phone || '—'}`, 340, 144);

      // Summary Metrics Row
      const totalPresent = records.filter(r => r.status === 'Present').length;
      const totalLate = records.filter(r => r.status === 'Late').length;
      const totalAbsent = records.filter(r => r.status === 'Absent').length;
      const totalHours = records.reduce((s, r) => s + (r.actualHours || 0), 0);
      const totalPay = records.reduce((s, r) => s + (r.attendancePay || 0), 0);
      const totalDeductions = records.reduce((s, r) => s + (r.lateDeduction || 0), 0);

      let y = 176;
      const metrics = [
        { label: 'Total Shifts', val: records.length, col: '#1e293b' },
        { label: 'Present / Late', val: `${totalPresent} / ${totalLate}`, col: '#15803d' },
        { label: 'Absent', val: totalAbsent, col: '#dc2626' },
        { label: 'Total Hours', val: `${totalHours.toFixed(1)} hrs`, col: '#2563eb' },
        { label: 'Total Pay', val: `£${totalPay.toFixed(2)}`, col: '#15803d' }
      ];

      const boxWidth = 98;
      metrics.forEach((m, idx) => {
        const x = 36 + idx * (boxWidth + 8);
        doc.rect(x, y, boxWidth, 42).fill('#f1f5f9').stroke('#cbd5e1');
        doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text(m.label, x + 6, y + 8, { width: boxWidth - 12, align: 'center' });
        doc.fillColor(m.col).fontSize(11).font('Helvetica-Bold').text(String(m.val), x + 6, y + 22, { width: boxWidth - 12, align: 'center' });
      });

      // Attendance Records Table
      y = 230;
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('Attendance Activity Logs', 36, y);
      y += 16;

      // Table Header
      doc.rect(36, y, 523, 20).fill('#1e293b');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text('Date', 42, y + 6)
        .text('Shop', 110, y + 6)
        .text('Shift', 200, y + 6)
        .text('Actual (In–Out)', 270, y + 6)
        .text('Late Min', 360, y + 6)
        .text('Hours', 415, y + 6)
        .text('Status', 460, y + 6)
        .text('Pay', 510, y + 6);
      y += 20;

      if (records.length === 0) {
        doc.fillColor('#64748b').fontSize(10).font('Helvetica').text('No attendance records found for this period.', 42, y + 10);
      } else {
        records.forEach((r, idx) => {
          if (y > 750) {
            doc.addPage();
            y = 36;
          }
          const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(36, y, 523, 18).fill(bg).stroke('#e2e8f0');

          let statusColor = '#15803d';
          if (r.status === 'Late') statusColor = '#d97706';
          if (r.status === 'Absent') statusColor = '#dc2626';

          doc.fillColor('#0f172a').fontSize(8).font('Helvetica')
            .text(formatUKDate(r.dateString), 42, y + 5)
            .text(r.shopName || '—', 110, y + 5, { width: 85, ellipsis: true })
            .text(`${r.shiftStart}–${r.shiftEnd}`, 200, y + 5)
            .text(r.status === 'Absent' ? '—' : `${r.timeReached || '—'}–${r.workerEndTime || '—'}`, 270, y + 5)
            .text(r.lateMinutes ? `${r.lateMinutes}m` : '0', 360, y + 5)
            .text(String(r.actualHours || 0), 415, y + 5)
            .fillColor(statusColor).font('Helvetica-Bold').text(r.status, 460, y + 5)
            .fillColor('#0f172a').font('Helvetica').text(`£${(r.attendancePay || 0).toFixed(2)}`, 510, y + 5);

          y += 18;
        });
      }

      // Footer
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
        .text(`PixxTechnologies Rota Management System • Attendance Verification Statement • ${new Date().toISOString().slice(0, 10)}`, 36, 792, { align: 'center', width: 523 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 2. Build Daily Attendance PDF Report (All Shops or Single Shop)
 */
async function buildDailyAttendancePdfBuffer(dateStr, targetShop = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const query = { dateString: dateStr };
      if (targetShop) query.shop = targetShop._id;

      const records = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });

      // Header Banner
      doc.rect(36, 36, 523, 56).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
        .text('PIXX TECHNOLOGIES — DAILY ATTENDANCE REPORT', 48, 48);
      doc.fontSize(10).font('Helvetica').fillColor('#94a3b8')
        .text(`Date: ${formatUKDate(dateStr)} • Location: ${targetShop ? targetShop.name : 'All Shops Combined'}`, 48, 70);

      // Summary Bar
      const present = records.filter(r => r.status === 'Present').length;
      const late = records.filter(r => r.status === 'Late').length;
      const half = records.filter(r => r.status === 'Half').length;
      const absent = records.filter(r => r.status === 'Absent').length;
      const totalHours = records.reduce((s, r) => s + (r.actualHours || 0), 0);
      const totalWages = records.reduce((s, r) => s + (r.attendancePay || 0), 0);

      let y = 100;
      doc.rect(36, y, 523, 36).fill('#eff6ff').stroke('#bfdbfe');
      doc.fillColor('#1e40af').fontSize(9).font('Helvetica-Bold')
        .text(`Total Logged: ${records.length}   |   Present: ${present}   |   Late: ${late}   |   Half-Day: ${half}   |   Absent: ${absent}   |   Total Hours: ${totalHours.toFixed(1)}   |   Total Wages: £${totalWages.toFixed(2)}`, 44, y + 12);

      y = 148;
      // Table Header
      doc.rect(36, y, 523, 20).fill('#1e293b');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text('Worker Name', 42, y + 6)
        .text('ID', 150, y + 6)
        .text('Shop', 200, y + 6)
        .text('Arrival', 285, y + 6)
        .text('Leave', 340, y + 6)
        .text('Hours', 395, y + 6)
        .text('Status', 440, y + 6)
        .text('Wage Pay', 500, y + 6);
      y += 20;

      if (records.length === 0) {
        doc.fillColor('#64748b').fontSize(10).font('Helvetica').text('No attendance records found for this date.', 42, y + 10);
      } else {
        records.forEach((r, idx) => {
          if (y > 720) {
            doc.addPage();
            y = 36;
          }
          const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(36, y, 523, 18).fill(bg).stroke('#e2e8f0');

          let statusColor = '#15803d';
          if (r.status === 'Late') statusColor = '#d97706';
          if (r.status === 'Absent') statusColor = '#dc2626';

          doc.fillColor('#0f172a').fontSize(8).font('Helvetica')
            .text(r.employeeName || '—', 42, y + 5, { width: 105, ellipsis: true })
            .text(r.employeeId || '—', 150, y + 5)
            .text(r.shopName || (r.status === 'Absent' ? 'OFF' : '—'), 200, y + 5, { width: 80, ellipsis: true })
            .text(r.status === 'Absent' ? '—' : (r.timeReached || '—'), 285, y + 5)
            .text(r.status === 'Absent' ? '—' : (r.workerEndTime || '—'), 340, y + 5)
            .text(String(r.actualHours || 0), 395, y + 5)
            .fillColor(statusColor).font('Helvetica-Bold').text(r.status, 440, y + 5)
            .fillColor('#0f172a').font('Helvetica').text(`£${(r.attendancePay || 0).toFixed(2)}`, 500, y + 5);

          y += 18;
        });
      }

      // Verification Signatures area
      y += 24;
      if (y > 700) {
        doc.addPage();
        y = 40;
      }
      doc.rect(36, y, 523, 56).fill('#f8fafc').stroke('#cbd5e1');
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text('Management Verification & Approval Signatures', 44, y + 8);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica')
        .text('Usman Salahuddin\nAttendance Operator', 44, y + 26)
        .text('Sarfraz Khan\nAttendance Checker & Approver', 220, y + 26)
        .text('Pixx Management\nAdmin Authorization', 400, y + 26);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 3. Build Weekly Payroll Statement PDF
 */
async function buildWeeklyPayrollPdfBuffer(weekStart) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const range = getWeekRange(weekStart);
      const salaries = await WeeklySalary.find({ weekStartDateString: range.startDateString }).sort({ employeeName: 1 });

      // Header Banner
      doc.rect(36, 36, 523, 56).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
        .text('PIXX TECHNOLOGIES — WEEKLY PAYROLL STATEMENT', 48, 48);
      doc.fontSize(10).font('Helvetica').fillColor('#94a3b8')
        .text(`Payroll Period: ${range.weekLabel} • Total Employees: ${salaries.length}`, 48, 70);

      const totalGross = salaries.reduce((s, r) => s + (r.grossDailyWages || 0), 0);
      const totalDeductions = salaries.reduce((s, r) => s + (r.lateDeductions || 0) + (r.loanDeduction || 0), 0);
      const totalNet = salaries.reduce((s, r) => s + (r.finalSalary || 0), 0);
      const totalPaid = salaries.reduce((s, r) => s + (r.totalPaid || 0), 0);
      const totalBalance = salaries.reduce((s, r) => s + (r.balanceRemaining || 0), 0);

      let y = 100;
      doc.rect(36, y, 523, 34).fill('#ecfdf5').stroke('#a7f3d0');
      doc.fillColor('#065f46').fontSize(9).font('Helvetica-Bold')
        .text(`Total Gross: £${totalGross.toFixed(2)}   |   Deductions: £${totalDeductions.toFixed(2)}   |   Net Payable: £${totalNet.toFixed(2)}   |   Paid: £${totalPaid.toFixed(2)}   |   Remaining: £${totalBalance.toFixed(2)}`, 44, y + 12);

      y = 144;
      // Table Header
      doc.rect(36, y, 523, 20).fill('#1e293b');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
        .text('Employee', 42, y + 6)
        .text('ID', 140, y + 6)
        .text('Shop', 190, y + 6)
        .text('Days', 260, y + 6)
        .text('Hours', 295, y + 6)
        .text('Gross', 345, y + 6)
        .text('Deductions', 400, y + 6)
        .text('Final Salary', 465, y + 6)
        .text('Status', 520, y + 6);
      y += 20;

      salaries.forEach((s, idx) => {
        if (y > 750) {
          doc.addPage();
          y = 36;
        }
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        doc.rect(36, y, 523, 18).fill(bg).stroke('#e2e8f0');

        doc.fillColor('#0f172a').fontSize(8).font('Helvetica')
          .text(s.employeeName || '—', 42, y + 5, { width: 95, ellipsis: true })
          .text(s.employeeId || '—', 140, y + 5)
          .text(s.shopName || '—', 190, y + 5, { width: 65, ellipsis: true })
          .text(String(s.workingDays || 0), 260, y + 5)
          .text(String(s.actualHours || 0), 295, y + 5)
          .text(`£${(s.grossDailyWages || 0).toFixed(2)}`, 345, y + 5)
          .text(`£${((s.lateDeductions || 0) + (s.loanDeduction || 0)).toFixed(2)}`, 400, y + 5)
          .font('Helvetica-Bold').text(`£${(s.finalSalary || 0).toFixed(2)}`, 465, y + 5)
          .font('Helvetica').text(s.status || 'Generated', 520, y + 5, { width: 35, ellipsis: true });

        y += 18;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Main dispatcher to generate AI PDF Report based on user query
 */
async function generateAiPdfReport(query, user) {
  const dateStr = parseRelativeDate(query) || getUKDateString(new Date());
  const shopName = extractShopName(query);
  const workerCandidate = await extractWorker(query);

  // 1. Worker Specific Attendance or Salary Report
  if (workerCandidate) {
    const worker = await findEmployee(workerCandidate);
    if (worker) {
      const buffer = await buildWorkerAttendancePdfBuffer(worker);
      const fileName = `PIXX_Attendance_${worker.employeeId}_${worker.name.replace(/\s+/g, '_')}.pdf`;
      const title = `${worker.name} — Attendance & Wage Statement`;
      const token = storePdf(buffer, fileName, title, user);
      return {
        success: true,
        message: `📄 **I have generated the PDF Statement for ${worker.name} (${worker.employeeId}).**\n\nYou can click the button below to download the official PDF report.`,
        pdfReport: {
          token,
          fileName,
          title,
          downloadUrl: `/api/ai/download-report/${token}`
        }
      };
    }
  }

  // 2. Weekly Payroll PDF Report
  if (/\b(payroll|salary|salaries|weekly\s*salary|earnings)\b/i.test(query)) {
    const buffer = await buildWeeklyPayrollPdfBuffer(dateStr);
    const range = getWeekRange(dateStr);
    const fileName = `PIXX_Weekly_Payroll_${range.startDateString}.pdf`;
    const title = `Weekly Payroll Statement (${range.weekLabel})`;
    const token = storePdf(buffer, fileName, title, user);
    return {
      success: true,
      message: `📄 **I have generated the Weekly Payroll Statement for ${range.weekLabel}.**\n\nClick below to download the official PDF report.`,
      pdfReport: {
        token,
        fileName,
        title,
        downloadUrl: `/api/ai/download-report/${token}`
      }
    };
  }

  // 3. Shop or Daily Attendance Report
  const shop = shopName ? await findShop(shopName) : null;
  const buffer = await buildDailyAttendancePdfBuffer(dateStr, shop);
  const fileName = `PIXX_Daily_Attendance_${shop ? shop.name.replace(/\s+/g, '_') : 'All_Shops'}_${dateStr}.pdf`;
  const title = `Daily Attendance Report — ${shop ? shop.name : 'All Shops'} (${formatUKDate(dateStr)})`;
  const token = storePdf(buffer, fileName, title, user);

  return {
    success: true,
    message: `📄 **I have generated the Daily Attendance PDF Report for ${formatUKDate(dateStr)} (${shop ? shop.name : 'All Shops'}).**\n\nClick below to download your report.`,
    pdfReport: {
      token,
      fileName,
      title,
      downloadUrl: `/api/ai/download-report/${token}`
    }
  };
}

module.exports = {
  generateAiPdfReport,
  getStoredPdf
};
