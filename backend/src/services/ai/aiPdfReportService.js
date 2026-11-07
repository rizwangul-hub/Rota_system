require('../../utils/pdfkitFontPatch');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const Employee = require('../../models/Employee');
const Shop = require('../../models/Shop');
const Attendance = require('../../models/Attendance');
const WeeklySalary = require('../../models/WeeklySalary');
const WeeklyRota = require('../../models/WeeklyRota');
const { getUKDateString, formatUKDate, getWeekRange, getDayOfWeekUK } = require('../../utils/calc');
const { findEmployee, findShop } = require('./rotaTools');
const { parseRelativeDate, extractShopName, extractWorker } = require('./naturalLanguageResolver');
function isFinancialAuthorized(user) {
  const role = user?.role || '';
  return role === 'ADMIN' || role === 'SALARY_DISTRIBUTOR';
}

function isAdmin(user) {
  return (user?.role || '') === 'ADMIN';
}


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

function storeReportFile(buffer, fileName, title, user, mimeType = 'application/pdf', format = 'pdf') {
  const prefix = format === 'excel' ? 'rotaexcel_' : 'rotapdf_';
  const token = prefix + crypto.randomBytes(16).toString('hex');
  pdfReportStore.set(token, {
    buffer,
    fileName,
    title,
    userId: user?._id ? String(user._id) : null,
    mimeType: mimeType || (format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'),
    format,
    createdAt: Date.now(),
    expiresAt: Date.now() + PDF_TTL_MS
  });
  return token;
}

function storePdf(buffer, fileName, title, user) {
  return storeReportFile(buffer, fileName, title, user, 'application/pdf', 'pdf');
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

/**
 * 4. Build Worker Attendance Excel Buffer
 */
async function buildWorkerAttendanceExcelBuffer(worker, dateRange = {}, user) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PIXX Rota System AI Assistant';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Attendance Record');
  const canFinancial = isFinancialAuthorized(user);

  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Day', key: 'day', width: 12 },
    { header: 'Shop Location', key: 'shop', width: 18 },
    { header: 'Scheduled Shift', key: 'shift', width: 16 },
    { header: 'Arrival', key: 'reached', width: 12 },
    { header: 'Departure', key: 'left', width: 12 },
    { header: 'Late (Mins)', key: 'lateMinutes', width: 12 },
    { header: 'Hours Logged', key: 'hours', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Calculated Pay', key: 'pay', width: 16 },
    { header: 'Late Deduction', key: 'deduction', width: 16 },
    { header: 'Approval Status', key: 'approval', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 24 }
  ];

  sheet.spliceRows(1, 0,
    ['PIXX TECHNOLOGIES — WORKER ATTENDANCE STATEMENT'],
    ['Worker: ' + worker.name + ' (' + worker.employeeId + ') | Assigned Shop: ' + (worker.assignedShop?.name || 'Unassigned') + ' | Exported: ' + formatUKDate(new Date())],
    []
  );

  sheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  sheet.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF475569' } };

  const headerRow = sheet.getRow(4);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

  const query = { employee: worker._id };
  if (dateRange.startDate || dateRange.endDate) {
    query.dateString = {};
    if (dateRange.startDate) query.dateString.$gte = dateRange.startDate;
    if (dateRange.endDate) query.dateString.$lte = dateRange.endDate;
  }

  const records = await Attendance.find(query).sort({ dateString: -1 }).limit(100);

  records.forEach(r => {
    sheet.addRow({
      date: formatUKDate(r.dateString),
      day: r.dateString ? getDayOfWeekUK(r.dateString) : '—',
      shop: r.shopName || r.shop?.name || (r.status === 'Absent' ? 'Absent' : '—'),
      shift: r.status === 'Absent' ? 'OFF' : (r.shiftStart || '—') + ' – ' + (r.shiftEnd || '—'),
      reached: r.timeReached || '—',
      left: r.workerEndTime || '—',
      lateMinutes: r.lateMinutes || 0,
      hours: r.actualHours || 0,
      status: r.status,
      pay: canFinancial ? ('£' + (r.attendancePay || 0).toFixed(2)) : '[Restricted]',
      deduction: canFinancial ? ('£' + (r.lateDeduction || 0).toFixed(2)) : '[Restricted]',
      approval: r.approvalStatus || 'Pending Review',
      remarks: r.remarks || '—'
    });
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * 5. Build Weekly Payroll Excel Buffer
 */
async function buildWeeklyPayrollExcelBuffer(dateStr, user) {
  if (!isFinancialAuthorized(user)) {
    throw new Error('Permission Denied: Your role does not have authorization to export payroll statements.');
  }

  const range = getWeekRange(dateStr);
  const salaries = await WeeklySalary.find({ weekStartDateString: range.startDateString }).sort({ employeeName: 1 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PIXX Rota System AI Assistant';
  const sheet = workbook.addWorksheet('Weekly Payroll');

  sheet.columns = [
    { header: 'Worker Name', key: 'name', width: 20 },
    { header: 'Employee ID', key: 'id', width: 14 },
    { header: 'Shop', key: 'shop', width: 16 },
    { header: 'Working Days', key: 'days', width: 14 },
    { header: 'Actual Hours', key: 'hours', width: 14 },
    { header: 'Gross Daily Wages', key: 'gross', width: 18 },
    { header: 'Late Deductions', key: 'late', width: 16 },
    { header: 'Bonus', key: 'bonus', width: 14 },
    { header: 'Loan Deduction', key: 'loan', width: 16 },
    { header: 'Final Salary', key: 'final', width: 16 },
    { header: 'Total Paid', key: 'paid', width: 16 },
    { header: 'Balance Remaining', key: 'balance', width: 18 },
    { header: 'Payment Status', key: 'status', width: 16 }
  ];

  sheet.spliceRows(1, 0,
    ['PIXX TECHNOLOGIES — OFFICIAL WEEKLY PAYROLL STATEMENT'],
    ['Week: ' + range.weekLabel + ' (' + range.startDateString + ' to ' + range.endDateString + ') | Total Staff: ' + salaries.length],
    []
  );

  sheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  sheet.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF475569' } };

  const headerRow = sheet.getRow(4);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

  salaries.forEach(s => {
    sheet.addRow({
      name: s.employeeName,
      id: s.employeeId,
      shop: s.shopName || '—',
      days: s.workingDays,
      hours: s.actualHours,
      gross: '£' + (s.grossDailyWages || 0).toFixed(2),
      late: '£' + (s.lateDeductions || 0).toFixed(2),
      bonus: '£' + (s.bonus || 0).toFixed(2),
      loan: '£' + (s.loanDeduction || 0).toFixed(2),
      final: '£' + (s.finalSalary || 0).toFixed(2),
      paid: '£' + (s.totalPaid || 0).toFixed(2),
      balance: '£' + (s.balanceRemaining || 0).toFixed(2),
      status: s.status
    });
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * 6. Build Daily Attendance Excel Buffer
 */
async function buildDailyAttendanceExcelBuffer(dateStr, shop, user) {
  const query = { dateString: dateStr };
  if (shop) query.shop = shop._id;

  const records = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });
  const canFinancial = isFinancialAuthorized(user);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PIXX Rota System AI Assistant';
  const sheet = workbook.addWorksheet('Daily Attendance');

  sheet.columns = [
    { header: 'Worker Name', key: 'name', width: 20 },
    { header: 'Employee ID', key: 'id', width: 14 },
    { header: 'Shop Location', key: 'shop', width: 18 },
    { header: 'Scheduled Shift', key: 'shift', width: 16 },
    { header: 'Time In', key: 'timeIn', width: 12 },
    { header: 'Time Out', key: 'timeOut', width: 12 },
    { header: 'Hours Logged', key: 'hours', width: 14 },
    { header: 'Late Minutes', key: 'lateMinutes', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Calculated Pay', key: 'pay', width: 16 },
    { header: 'Late Deduction', key: 'deduction', width: 16 },
    { header: 'Approval Status', key: 'approval', width: 16 }
  ];

  sheet.spliceRows(1, 0,
    ['PIXX TECHNOLOGIES — DAILY ATTENDANCE REPORT (' + formatUKDate(dateStr) + ')'],
    ['Shop Filter: ' + (shop ? shop.name : 'All Shops') + ' | Total Logged: ' + records.length],
    []
  );

  sheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  sheet.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF475569' } };

  const headerRow = sheet.getRow(4);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

  records.forEach(r => {
    sheet.addRow({
      name: r.employeeName,
      id: r.employeeId,
      shop: r.status === 'Absent' ? 'Absent Workers' : (r.shopName || r.shop?.name || 'Other'),
      shift: r.status === 'Absent' ? 'OFF' : (r.shiftStart || '—') + ' – ' + (r.shiftEnd || '—'),
      timeIn: r.status === 'Absent' ? '—' : (r.timeReached || '—'),
      timeOut: r.status === 'Absent' ? '—' : (r.workerEndTime || '—'),
      hours: r.actualHours || 0,
      lateMinutes: r.lateMinutes || 0,
      status: r.status,
      pay: canFinancial ? ('£' + (r.attendancePay || 0).toFixed(2)) : '[Restricted]',
      deduction: canFinancial ? ('£' + (r.lateDeduction || 0).toFixed(2)) : '[Restricted]',
      approval: r.approvalStatus || 'Pending Review'
    });
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * Universal Report Dispatcher (generates PDF and/or Excel based on user request)
 */
async function generateAiReport(query, user, history = []) {
  const isExcel = /\b(excel|spreadsheet|xlsx|excel\s*sheet|in\s*excel|excel\s*report)\b/i.test(query);
  const isPdf = /\b(pdf|in\s*pdf|pdf\s*report|pdf\s*file)\b/i.test(query) || (!isExcel);

  const dateStr = parseRelativeDate(query) || getUKDateString(new Date());
  let shopName = extractShopName(query);
  let workerCandidate = await extractWorker(query);

  if (!workerCandidate && Array.isArray(history) && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const prevMsg = history[i]?.content || '';
      const prevCandidate = await extractWorker(prevMsg);
      if (prevCandidate) {
        workerCandidate = prevCandidate;
        break;
      }
    }
  }

  if (!shopName && Array.isArray(history) && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const prevMsg = history[i]?.content || '';
      const prevShop = extractShopName(prevMsg);
      if (prevShop) {
        shopName = prevShop;
        break;
      }
    }
  }

  let pdfReport = null;
  let excelReport = null;
  let message = '';

  // 1. Worker Attendance / Wage Statement
  if (workerCandidate) {
    const worker = await findEmployee(workerCandidate);
    if (worker) {
      if (isPdf) {
        const pdfBuf = await buildWorkerAttendancePdfBuffer(worker);
        const fileName = 'PIXX_Attendance_' + worker.employeeId + '_' + worker.name.replace(/\s+/g, '_') + '.pdf';
        const title = worker.name + ' — Attendance & Wage Statement';
        const token = storeReportFile(pdfBuf, fileName, title, user, 'application/pdf', 'pdf');
        pdfReport = { token, fileName, title, downloadUrl: '/api/ai/download-report/' + token };
      }
      if (isExcel) {
        const xlsBuf = await buildWorkerAttendanceExcelBuffer(worker, {}, user);
        const fileName = 'PIXX_Attendance_' + worker.employeeId + '_' + worker.name.replace(/\s+/g, '_') + '.xlsx';
        const title = worker.name + ' — Attendance Spreadsheet';
        const token = storeReportFile(xlsBuf, fileName, title, user, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel');
        excelReport = { token, fileName, title, downloadUrl: '/api/ai/download-report/' + token };
      }
      message = '📄 **Official statement generated for ' + worker.name + ' (' + worker.employeeId + ').**';
      return { success: true, message, pdfReport, excelReport };
    }
  }

  // 2. Weekly Payroll Report
  if (/\b(payroll|salary|salaries|weekly\s*salary|earnings)\b/i.test(query)) {
    if (!isFinancialAuthorized(user)) {
      return {
        success: false,
        message: '🔒 **Access Restricted:** Your user role (' + (user?.role || 'Guest') + ') is not authorized to export weekly payroll records.'
      };
    }
    const range = getWeekRange(dateStr);
    if (isPdf) {
      const pdfBuf = await buildWeeklyPayrollPdfBuffer(dateStr);
      const fileName = 'PIXX_Weekly_Payroll_' + range.startDateString + '.pdf';
      const title = 'Weekly Payroll Statement (' + range.weekLabel + ')';
      const token = storeReportFile(pdfBuf, fileName, title, user, 'application/pdf', 'pdf');
      pdfReport = { token, fileName, title, downloadUrl: '/api/ai/download-report/' + token };
    }
    if (isExcel) {
      const xlsBuf = await buildWeeklyPayrollExcelBuffer(dateStr, user);
      const fileName = 'PIXX_Weekly_Payroll_' + range.startDateString + '.xlsx';
      const title = 'Weekly Payroll Spreadsheet (' + range.weekLabel + ')';
      const token = storeReportFile(xlsBuf, fileName, title, user, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel');
      excelReport = { token, fileName, title, downloadUrl: '/api/ai/download-report/' + token };
    }
    message = '📄 **Weekly Payroll report generated for ' + range.weekLabel + '.**';
    return { success: true, message, pdfReport, excelReport };
  }

  // 3. Shop or Daily Attendance Report
  const shop = shopName ? await findShop(shopName) : null;
  const shopLabel = shop ? shop.name : 'All Shops';
  if (isPdf) {
    const pdfBuf = await buildDailyAttendancePdfBuffer(dateStr, shop);
    const fileName = 'PIXX_Daily_Attendance_' + (shop ? shop.name.replace(/\s+/g, '_') : 'All_Shops') + '_' + dateStr + '.pdf';
    const title = 'Daily Attendance Report — ' + shopLabel + ' (' + formatUKDate(dateStr) + ')';
    const token = storeReportFile(pdfBuf, fileName, title, user, 'application/pdf', 'pdf');
    pdfReport = { token, fileName, title, downloadUrl: '/api/ai/download-report/' + token };
  }
  if (isExcel) {
    const xlsBuf = await buildDailyAttendanceExcelBuffer(dateStr, shop, user);
    const fileName = 'PIXX_Daily_Attendance_' + (shop ? shop.name.replace(/\s+/g, '_') : 'All_Shops') + '_' + dateStr + '.xlsx';
    const title = 'Daily Attendance Spreadsheet — ' + shopLabel + ' (' + formatUKDate(dateStr) + ')';
    const token = storeReportFile(xlsBuf, fileName, title, user, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel');
    excelReport = { token, fileName, title, downloadUrl: '/api/ai/download-report/' + token };
  }
  message = '📄 **Daily Attendance report generated for ' + formatUKDate(dateStr) + ' (' + shopLabel + ').**';
  return { success: true, message, pdfReport, excelReport };
}

async function generateAiPdfReport(query, user) {
  return await generateAiReport(query, user);
}

module.exports = {
  generateAiPdfReport,
  generateAiReport,
  getStoredPdf,
  storeReportFile,
  storePdf
};
