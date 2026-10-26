const mongoose = require('mongoose');
require('../utils/pdfkitFontPatch'); // Must be before PDFDocument — patches font resolution for Vercel
const Attendance = require('../models/Attendance');
const { sendServerError } = require('../utils/httpErrors');
const WeeklySalary = require('../models/WeeklySalary');
const SalaryPayment = require('../models/SalaryPayment');
const Bonus = require('../models/Bonus');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const LedgerTransaction = require('../models/LedgerTransaction');
const { recalculateEmployeeLedger } = require('../utils/ledgerHelper');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const {
  generateWhatsAppAttendanceText,
  formatTime12Hour,
  buildDailyAttendanceExcel,
  buildCommissionExcel,
  buildEmployeeMonthlyExcel,
  buildWeeklyAttendanceExcel,
  buildWeeklyAttendancePDF,
  buildWeeklySalaryExcel,
  buildWeeklySalaryPDF,
  buildWeeklySalaryDailyBreakdown,
  buildEmployeeMonthlyPDF,
  buildEmployeeYearlyExcel,
  buildEmployeeYearlyPDF,
  buildBonusPDF,
  buildShopLabourExcel,
  buildShopLabourPDF,
  buildPaymentsExcel,
  buildPaymentsPDF,
  buildLedgerExcel,
  buildLedgerPDF,
  buildSystemBackupPDF,
  buildSystemBackupExcel,
  getShopColor,
  sortDailyAttendanceRecords
} = require('../utils/reports');
const { getWeekRange, formatUKDate, getUKDateString, calculateAttendanceRecord, calculateWeeklySalaryComponents, safeObjectId, getDayOfWeekUK, resolveDailyWage } = require('../utils/calc');
const { logAction } = require('../utils/audit');
const {
  attendanceOperatorRecord,
  attendanceCheckerRecord
} = require('../utils/attendanceViews');

function attendanceReportFilename(shopName, dateString, extension) {
  const safeShopName = String(shopName || 'All-Shops')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'All-Shops';
  return `PIXX_Attendance_${safeShopName}_${dateString}.${extension}`;
}

function getMonthlyReportPeriod(month, year) {
  const now = new Date();
  const targetYear = year === undefined ? now.getFullYear() : Number(year);
  const targetMonth = month === undefined ? now.getMonth() + 1 : Number(month);
  if (!Number.isInteger(targetYear) || targetYear < 1900 || targetYear > 9999 ||
      !Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    return null;
  }
  const monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
  const monthEnd = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));
  const monthLabel = `${monthStart.toLocaleString('en-US', { timeZone: 'UTC', month: 'short' })}-${String(targetYear).slice(-2)}`;
  return { targetYear, targetMonth, monthStart, monthEnd, monthLabel };
}

// ============================================================
// 1. DAILY ATTENDANCE REPORT
// ============================================================

exports.getDailyAttendanceReport = async (req, res) => {
  try {
    const { date, shopId, employeeId, status, approvalStatus, search } = req.query;
    const dateStr = date ? getUKDateString(date) : getUKDateString(new Date());
    const query = { dateString: dateStr };

    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    if (status) query.status = status;
    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const records = await Attendance.find(query)
      .populate('employee')
      .populate('shop')
      .sort({ shopName: 1, employeeName: 1 });

    records.forEach(r => {
      const wage = (r.employee && r.employee.dailyWage !== undefined && r.employee.dailyWage !== null)
        ? Number(r.employee.dailyWage)
        : resolveDailyWage(r.dailyWage, r.employee?.dailyWage);
      r.dailyWage = wage;
      if (r.status !== 'Absent') {
        const calc = calculateAttendanceRecord({
          dailyWage: wage,
          shiftStart: r.shiftStart || '09:00',
          shiftEnd: r.shiftEnd || '19:00',
          timeReached: r.timeReached || '09:00',
          workerEndTime: r.workerEndTime || '19:00',
          status: r.status,
          gracePeriodMinutes: 15
        });
        r.hourlyWage = calc.hourlyWage;
        r.lateMinutes = calc.lateMinutes;
        r.lateDeduction = calc.lateDeduction;
        r.attendancePay = calc.attendancePay;
      }
    });

    const sortedRecords = sortDailyAttendanceRecords(records);

    const shopDoc = shopId ? await Shop.findById(shopId) : null;
    const shopName = shopDoc ? shopDoc.name : 'All Shops';

    const responseRecords = req.user.role === 'ATTENDANCE_OPERATOR'
      ? sortedRecords.map(attendanceOperatorRecord)
      : req.user.role === 'ATTENDANCE_CHECKER'
        ? sortedRecords.map(attendanceCheckerRecord)
        : sortedRecords;
    const whatsAppText = generateWhatsAppAttendanceText(formatUKDate(dateStr), responseRecords, shopName);

    const grouped = {};
    responseRecords.forEach(r => {
      const s = r.shopName || 'Shop';
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(r);
    });

    const summary = {
      totalEmployees: responseRecords.length,
      present: responseRecords.filter(r => r.status === 'Present').length,
      late: responseRecords.filter(r => r.status === 'Late').length,
      half: responseRecords.filter(r => r.status === 'Half').length,
      absent: responseRecords.filter(r => r.status === 'Absent').length,
      pendingReview: responseRecords.filter(r => r.approvalStatus === 'Pending Review' || r.approvalStatus === 'Draft').length,
      checked: responseRecords.filter(r => r.approvalStatus === 'Checked' || r.approvalStatus === 'Finalized').length,
      ...(req.user.role !== 'ATTENDANCE_OPERATOR' ? {
        totalScheduledHours: Number(records.reduce((sum, r) => sum + (r.scheduledHours || 0), 0).toFixed(2)),
        totalWorkedHours: Number(records.reduce((sum, r) => sum + (r.actualHours || 0), 0).toFixed(2))
      } : {}),
      ...(req.user.role === 'ADMIN' ? {
        totalDailyWages: Number(records.reduce((sum, r) => sum + (r.dailyWage || 0), 0).toFixed(2)),
        totalLateDeductions: Number(records.reduce((sum, r) => sum + (r.lateDeduction || 0), 0).toFixed(2)),
        totalAttendancePay: Number(records.reduce((sum, r) => sum + (r.attendancePay || 0), 0).toFixed(2))
      } : {})
    };

    res.json({
      success: true,
      date: dateStr,
      formattedDate: formatUKDate(dateStr),
      shopName,
      summary,
      grouped,
      records: responseRecords,
      whatsAppText
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to generate daily attendance report.');
  }
};

exports.exportDailyAttendanceExcel = async (req, res) => {
  try {
    const { date, shopId, employeeId, status, approvalStatus, search } = req.query;
    const dateStr = date ? getUKDateString(date) : getUKDateString(new Date());
    const query = { dateString: dateStr };

    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    if (status) query.status = status;
    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const records = await Attendance.find(query).populate('employee').populate('shop').sort({ shopName: 1, employeeName: 1 });
    records.forEach(r => {
      const wage = (r.employee && r.employee.dailyWage !== undefined && r.employee.dailyWage !== null)
        ? Number(r.employee.dailyWage)
        : resolveDailyWage(r.dailyWage, r.employee?.dailyWage);
      r.dailyWage = wage;
      if (r.status !== 'Absent') {
        const calc = calculateAttendanceRecord({
          dailyWage: wage,
          shiftStart: r.shiftStart || '09:00',
          shiftEnd: r.shiftEnd || '19:00',
          timeReached: r.timeReached || '09:00',
          workerEndTime: r.workerEndTime || '19:00',
          status: r.status,
          gracePeriodMinutes: 15
        });
        r.hourlyWage = calc.hourlyWage;
        r.lateDeduction = calc.lateDeduction;
        r.attendancePay = calc.attendancePay;
      }
    });
    const sortedRecords = sortDailyAttendanceRecords(records);
    const workbook = await buildDailyAttendanceExcel(sortedRecords, formatUKDate(dateStr));
    const shopDoc = shopId ? await Shop.findById(shopId).select('name') : null;

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'DailyAttendance',
      details: `Exported Daily Attendance Excel for ${dateStr}`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${attendanceReportFilename(shopDoc?.name || 'All-Shops', dateStr, 'xlsx')}"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export Excel.');
  }
};

exports.exportDailyAttendancePDF = async (req, res) => {
  try {
    const { date, shopId, employeeId, status, approvalStatus, search } = req.query;
    const dateStr = date ? getUKDateString(date) : getUKDateString(new Date());
    const query = { dateString: dateStr };

    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    if (status) query.status = status;
    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const records = await Attendance.find(query).populate('employee').populate('shop').sort({ shopName: 1, employeeName: 1 });
    records.forEach(r => {
      const wage = (r.employee && r.employee.dailyWage !== undefined && r.employee.dailyWage !== null)
        ? Number(r.employee.dailyWage)
        : resolveDailyWage(r.dailyWage, r.employee?.dailyWage);
      r.dailyWage = wage;
      if (r.status !== 'Absent') {
        const calc = calculateAttendanceRecord({
          dailyWage: wage,
          shiftStart: r.shiftStart || '09:00',
          shiftEnd: r.shiftEnd || '19:00',
          timeReached: r.timeReached || '09:00',
          workerEndTime: r.workerEndTime || '19:00',
          status: r.status,
          gracePeriodMinutes: 15
        });
        r.hourlyWage = calc.hourlyWage;
        r.lateDeduction = calc.lateDeduction;
        r.attendancePay = calc.attendancePay;
      }
    });
    const shopDoc = shopId ? await Shop.findById(shopId) : null;

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'DailyAttendance',
      details: `Exported Daily Attendance PDF for ${dateStr}`,
      req
    });

    const findAsset = (filename) => {
      const candidates = [
        path.join(__dirname, '../assets', filename),
        path.join(process.cwd(), 'backend/src/assets', filename),
        path.join(process.cwd(), 'src/assets', filename),
        path.join(process.cwd(), 'Admin/src/assets', filename),
        path.join(process.cwd(), '../Admin/src/assets', filename),
        path.join(__dirname, '../../Admin/src/assets', filename),
        path.join(__dirname, 'assets', filename)
      ];
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) return fs.readFileSync(p);
        } catch {}
      }
      return null;
    };
    const usmanSign = findAsset('usmansign.png') || findAsset('usmansign.jpeg');
    const sarfrazSign = findAsset('sarfrazsign.png');
    const adeelSign = findAsset('adeel.png') || findAsset('adeelsign.png');

    // Sort records: real shops first, absent records at the bottom
    const sortedRecords = sortDailyAttendanceRecords(records);

    // Group records by shop
    const shopGroups = {};
    sortedRecords.forEach(r => {
      const sName = r.status === 'Absent' ? 'ABSENT / OFF' : (r.shopName || 'Unknown Shop');
      if (!shopGroups[sName]) shopGroups[sName] = [];
      shopGroups[sName].push(r);
    });

    const sortedShopNames = Object.keys(shopGroups).sort((a, b) => {
      if (a === 'ABSENT / OFF') return 1;
      if (b === 'ABSENT / OFF') return -1;
      return a.localeCompare(b);
    });

    const totalPresent = records.filter(r => r.status === 'Present').length;
    const totalLate    = records.filter(r => r.status === 'Late').length;
    const totalHalf    = records.filter(r => r.status === 'Half').length;
    const totalAbsent  = records.filter(r => r.status === 'Absent').length;

    // Mobile-optimized A4 Portrait layout
    const doc = new PDFDocument({
      margin: 16,
      size: 'A4',
      layout: 'portrait',
      autoFirstPage: true
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    const PAGE_W = 563.28;
    const MARGIN_LEFT = 16;
    const DARK = '#0f172a';
    const BLUE = '#2563eb';
    const SLATE = '#64748b';
    const LIGHT_BORDER = '#e2e8f0';

    const formatTime12hPadded = (value) => {
      const match = /^(\d{1,2}):(\d{2})$/.exec(value || '');
      if (!match) return value || '--';
      const hours = Number(match[1]);
      if (hours > 23 || Number(match[2]) > 59) return value;
      const period = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${match[2]} ${period}`;
    };

    const formattedDate = formatUKDate(dateStr);

    let curY = 16;

    // ── HEADER BANNER ──────────────────────────────────────────
    doc.rect(MARGIN_LEFT, curY, PAGE_W, 48).fillAndStroke('#ffffff', '#cbd5e1');

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16)
       .text('PIXX ROTA', MARGIN_LEFT + 14, curY + 10, { lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b')
       .text('PixxTechnologies UK  •  Daily Workforce Attendance', MARGIN_LEFT + 14, curY + 30, { lineBreak: false });

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11.5)
       .text(formattedDate, MARGIN_LEFT + 200, curY + 10, { width: PAGE_W - 214, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#2563eb')
       .text(shopDoc ? `Shop: ${shopDoc.name}` : 'Times in 12-Hour UK Format  •  All Active Shops', MARGIN_LEFT + 200, curY + 29, { width: PAGE_W - 214, align: 'right', lineBreak: false });

    curY += 56;

    // ── 5 EXECUTIVE KPI CARDS ──────────────────────────────────
    const kpis = [
      { label: 'TOTAL STAFF', value: records.length, color: BLUE },
      { label: 'PRESENT',     value: totalPresent,   color: '#16a34a' },
      { label: 'LATE ARRIVALS', value: totalLate,    color: '#d97706' },
      { label: 'HALF DAY',    value: totalHalf,      color: '#0284c7' },
      { label: 'ABSENT / OFF', value: totalAbsent,   color: '#dc2626' }
    ];
    const kpiGap = 6;
    const kpiW = (PAGE_W - (kpis.length - 1) * kpiGap) / kpis.length;

    kpis.forEach((kpi, idx) => {
      const kx = MARGIN_LEFT + idx * (kpiW + kpiGap);
      doc.roundedRect(kx, curY, kpiW, 40, 4).fillAndStroke('#ffffff', LIGHT_BORDER);

      doc.fillColor(kpi.color).font('Helvetica-Bold').fontSize(15)
         .text(String(kpi.value), kx, curY + 6, { width: kpiW, align: 'center', lineBreak: false });
      doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(7.5)
         .text(kpi.label, kx, curY + 26, { width: kpiW, align: 'center', lineBreak: false });
    });

    curY += 48;

    const drawContinuationBanner = () => {
      doc.rect(MARGIN_LEFT, 16, PAGE_W, 26).fillAndStroke('#ffffff', '#cbd5e1');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10)
         .text('PIXX ROTA  •  DAILY ATTENDANCE (CONTINUED)', MARGIN_LEFT + 12, 24, { lineBreak: false });
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(9)
         .text(formattedDate, MARGIN_LEFT + 250, 24, { width: PAGE_W - 258, align: 'right', lineBreak: false });
    };

    // ── DYNAMIC ROW HEIGHT TO FILL PAGE ON MOBILE WITHOUT EMPTY BOTTOM ──
    const totalStaffCount = records.length || 1;
    const availableTableSpace = 755 - curY - (sortedShopNames.length * 44);
    const dynamicRowH = Math.floor(availableTableSpace / totalStaffCount);
    // Generous, mobile-friendly row height: between 25 and 32 pt
    const rowH = Math.max(25, Math.min(32, dynamicRowH));
    const sectionHeaderH = 22;
    const tableHeaderH = 16;

    // ── DRAW SHOP SECTIONS ──────────────────────────────────────
    for (const shopName of sortedShopNames) {
      const group = shopGroups[shopName];
      const isAbsentGroup = shopName === 'ABSENT / OFF';
      const sc = getShopColor(isAbsentGroup ? 'ABSENT / OFF' : shopName);

      // Check if we need page break
      if (curY + sectionHeaderH + tableHeaderH + rowH > doc.page.height - 45) {
        doc.addPage({ margin: 16, size: 'A4', layout: 'portrait' });
        drawContinuationBanner();
        curY = 50;
      }

      // 1. Shop Header Bar - Light print-friendly background with subtle border and crisp dark text
      const headerBg = isAbsentGroup ? '#fff5f5' : (sc.lightBg || '#f8fafc');
      const headerBorder = isAbsentGroup ? '#fecaca' : (sc.border || '#cbd5e1');
      const headerText = isAbsentGroup ? '#991b1b' : (sc.text || '#0f172a');
      const dotColor = isAbsentGroup ? '#dc2626' : (sc.primary || '#2563eb');

      doc.roundedRect(MARGIN_LEFT, curY, PAGE_W, sectionHeaderH, 3).fillAndStroke(headerBg, headerBorder);
      doc.circle(MARGIN_LEFT + 10, curY + 11, 3).fill(dotColor);

      doc.fillColor(headerText).font('Helvetica-Bold').fontSize(10)
         .text(
           isAbsentGroup ? 'ABSENT / OFF DUTY' : `${shopName.toUpperCase()} CYCLES`,
           MARGIN_LEFT + 18,
           curY + 5.5,
           { lineBreak: false }
         );

      const countText = isAbsentGroup
        ? `${group.length} Staff Off / Absent`
        : `${group.length} ${group.length === 1 ? 'Worker' : 'Workers'} on Duty`;

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(headerText)
         .text(countText, MARGIN_LEFT + 340, curY + 6.5, { width: PAGE_W - 350, align: 'right', lineBreak: false });

      curY += sectionHeaderH;

      // 2. Table Column Headers
      doc.rect(MARGIN_LEFT, curY, PAGE_W, tableHeaderH).fill(isAbsentGroup ? '#fee2e2' : '#f1f5f9');
      doc.fillColor(isAbsentGroup ? '#991b1b' : '#334155').font('Helvetica-Bold').fontSize(7.5);

      if (!isAbsentGroup) {
        doc.text('#', MARGIN_LEFT + 2, curY + 4, { width: 20, align: 'center', lineBreak: false });
        doc.text('WORKER NAME', MARGIN_LEFT + 24, curY + 4, { width: 156, lineBreak: false });
        doc.text('SCHEDULED SHIFT', MARGIN_LEFT + 182, curY + 4, { width: 96, align: 'center', lineBreak: false });
        doc.fillColor('#1d4ed8').text('ARRIVAL (TIME COME)', MARGIN_LEFT + 280, curY + 4, { width: 118, align: 'center', lineBreak: false });
        doc.fillColor('#334155');
        doc.text('LEFT AT', MARGIN_LEFT + 400, curY + 4, { width: 56, align: 'center', lineBreak: false });
        doc.text('WORKED', MARGIN_LEFT + 458, curY + 4, { width: 46, align: 'center', lineBreak: false });
        doc.text('STATUS', MARGIN_LEFT + 506, curY + 4, { width: 55, align: 'center', lineBreak: false });
      } else {
        doc.text('#', MARGIN_LEFT + 2, curY + 4, { width: 20, align: 'center', lineBreak: false });
        doc.text('WORKER NAME', MARGIN_LEFT + 24, curY + 4, { width: 176, lineBreak: false });
        doc.text('ASSIGNED SHOP', MARGIN_LEFT + 204, curY + 4, { width: 120, lineBreak: false });
        doc.text('STATUS', MARGIN_LEFT + 328, curY + 4, { width: 85, align: 'center', lineBreak: false });
        doc.text('NOTES / REMARKS', MARGIN_LEFT + 418, curY + 4, { width: 143, lineBreak: false });
      }

      curY += tableHeaderH;

      // 3. Table Rows
      group.forEach((r, idx) => {
        if (curY + rowH > doc.page.height - 40) {
          doc.addPage({ margin: 16, size: 'A4', layout: 'portrait' });
          drawContinuationBanner();
          curY = 50;

          doc.rect(MARGIN_LEFT, curY, PAGE_W, tableHeaderH).fill(isAbsentGroup ? '#fee2e2' : '#f1f5f9');
          doc.fillColor(isAbsentGroup ? '#991b1b' : '#334155').font('Helvetica-Bold').fontSize(7.5);
          if (!isAbsentGroup) {
            doc.text('#', MARGIN_LEFT + 2, curY + 4, { width: 20, align: 'center', lineBreak: false });
            doc.text('WORKER NAME', MARGIN_LEFT + 24, curY + 4, { width: 156, lineBreak: false });
            doc.text('SCHEDULED SHIFT', MARGIN_LEFT + 182, curY + 4, { width: 96, align: 'center', lineBreak: false });
            doc.fillColor('#1d4ed8').text('ARRIVAL (TIME COME)', MARGIN_LEFT + 280, curY + 4, { width: 118, align: 'center', lineBreak: false });
            doc.fillColor('#334155');
            doc.text('LEFT AT', MARGIN_LEFT + 400, curY + 4, { width: 56, align: 'center', lineBreak: false });
            doc.text('WORKED', MARGIN_LEFT + 458, curY + 4, { width: 46, align: 'center', lineBreak: false });
            doc.text('STATUS', MARGIN_LEFT + 506, curY + 4, { width: 55, align: 'center', lineBreak: false });
          } else {
            doc.text('#', MARGIN_LEFT + 2, curY + 4, { width: 20, align: 'center', lineBreak: false });
            doc.text('WORKER NAME', MARGIN_LEFT + 24, curY + 4, { width: 176, lineBreak: false });
            doc.text('ASSIGNED SHOP', MARGIN_LEFT + 204, curY + 4, { width: 120, lineBreak: false });
            doc.text('STATUS', MARGIN_LEFT + 328, curY + 4, { width: 85, align: 'center', lineBreak: false });
            doc.text('NOTES / REMARKS', MARGIN_LEFT + 418, curY + 4, { width: 143, lineBreak: false });
          }
          curY += tableHeaderH;
        }

        const isEven = idx % 2 === 0;
        const rowBg = isAbsentGroup
          ? (isEven ? '#fff5f5' : '#fef2f2')
          : (isEven ? '#ffffff' : '#f8fafc');

        doc.rect(MARGIN_LEFT, curY, PAGE_W, rowH).fill(rowBg);
        doc.strokeColor(LIGHT_BORDER).lineWidth(0.5)
           .moveTo(MARGIN_LEFT, curY + rowH).lineTo(MARGIN_LEFT + PAGE_W, curY + rowH).stroke();

        const textY = curY + (rowH - 12) / 2;

        if (!isAbsentGroup) {
          doc.fillColor(SLATE).font('Helvetica').fontSize(8.5)
             .text(String(idx + 1), MARGIN_LEFT + 2, textY + 1.5, { width: 20, align: 'center', lineBreak: false });

          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10)
             .text(r.employeeName || 'Unknown', MARGIN_LEFT + 24, textY, { width: 156, lineBreak: false });

          const shiftStr = (r.shiftStart && r.shiftEnd)
            ? `${formatTime12hPadded(r.shiftStart)} - ${formatTime12hPadded(r.shiftEnd)}`
            : '--';
          doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
             .text(shiftStr, MARGIN_LEFT + 182, textY + 1, { width: 96, align: 'center', lineBreak: false });

          // ARRIVAL (TIME COME) - PROMINENT FOR BOSS
          const isLate = r.status === 'Late' || (r.lateMinutes && r.lateMinutes > 0);
          if (r.timeReached) {
            const reachedStr = formatTime12hPadded(r.timeReached);
            if (isLate) {
              const lateBadgeText = r.lateMinutes ? `(+${r.lateMinutes}m)` : '(Late)';
              doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(10)
                 .text(`${reachedStr}  ${lateBadgeText}`, MARGIN_LEFT + 280, textY, { width: 118, align: 'center', lineBreak: false });
            } else {
              doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(10)
                 .text(`${reachedStr}  (On Time)`, MARGIN_LEFT + 280, textY, { width: 118, align: 'center', lineBreak: false });
            }
          } else {
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(8.5)
               .text('--', MARGIN_LEFT + 280, textY, { width: 118, align: 'center', lineBreak: false });
          }

          const leftStr = r.workerEndTime ? formatTime12hPadded(r.workerEndTime) : '--';
          doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
             .text(leftStr, MARGIN_LEFT + 400, textY + 1, { width: 56, align: 'center', lineBreak: false });

          const workedStr = (r.actualHours !== undefined && r.actualHours !== null)
            ? `${Number(r.actualHours).toFixed(1)}h`
            : '--';
          doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9.5)
             .text(workedStr, MARGIN_LEFT + 458, textY, { width: 46, align: 'center', lineBreak: false });

          // Status Badge Pill
          const pillW = 52;
          const pillH = 17;
          const pillX = MARGIN_LEFT + 508;
          const pillY = curY + (rowH - pillH) / 2;

          let pillBg = '#dcfce7';
          let pillFg = '#166534';
          let pillLabel = 'PRESENT';

          if (r.status === 'Late') {
            pillBg = '#fef3c7'; pillFg = '#b45309'; pillLabel = 'LATE';
          } else if (r.status === 'Half') {
            pillBg = '#e0f2fe'; pillFg = '#0369a1'; pillLabel = 'HALF';
          } else if (r.status === 'Absent') {
            pillBg = '#fee2e2'; pillFg = '#991b1b'; pillLabel = 'ABSENT';
          }

          doc.roundedRect(pillX, pillY, pillW, pillH, 4).fill(pillBg);
          doc.fillColor(pillFg).font('Helvetica-Bold').fontSize(8)
             .text(pillLabel, pillX, pillY + 4, { width: pillW, align: 'center', lineBreak: false });

        } else {
          // Absent row
          doc.fillColor('#991b1b').font('Helvetica').fontSize(8.5)
             .text(String(idx + 1), MARGIN_LEFT + 2, textY + 1.5, { width: 20, align: 'center', lineBreak: false });

          doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(10)
             .text(r.employeeName || 'Unknown', MARGIN_LEFT + 24, textY, { width: 176, lineBreak: false });

          doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
             .text(r.shopName || 'Not Assigned', MARGIN_LEFT + 204, textY + 1, { width: 120, lineBreak: false });

          const pillW = 75;
          const pillH = 17;
          const pillX = MARGIN_LEFT + 333;
          const pillY = curY + (rowH - pillH) / 2;
          doc.roundedRect(pillX, pillY, pillW, pillH, 4).fill('#fee2e2');
          doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(8)
             .text('ABSENT / OFF', pillX, pillY + 4, { width: pillW, align: 'center', lineBreak: false });

          doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(8)
             .text(r.remarks || 'Scheduled day off', MARGIN_LEFT + 418, textY + 1, { width: 143, lineBreak: false });
        }

        curY += rowH;
      });

      curY += 6;
    }

    // ── SIGNATURES / VERIFICATION SECTION ─────────────────────
    const sigBoxH = 60;
    const sigBoxW = (PAGE_W - 14) / 2;

    if (curY + sigBoxH > doc.page.height - 20) {
      doc.addPage({ margin: 16, size: 'A4', layout: 'portrait' });
      drawContinuationBanner();
      curY = 50;
    }

    // Anchor signatures to bottom of page when fitting on single page
    const sigY = Math.max(curY + 10, doc.page.height - 16 - sigBoxH);

    // Determine whether the report is exported by Adeel Ahmed or Usman / Admin / Sarfraz
    const reqUsername = String(req.user?.username || req.query.username || req.query.user || '').trim().toLowerCase();
    const reqFullName = String(req.user?.name || req.query.name || req.query.checker || req.query.taker || '').trim().toLowerCase();
    const isAdeel = reqUsername.includes('adeel') || reqUsername.includes('adel') || reqFullName.includes('adeel') || reqFullName.includes('adel');

    if (isAdeel) {
      // Box 1: Adeel Ahmed (Attendance Checker) in place of Usman
      doc.roundedRect(MARGIN_LEFT, sigY, sigBoxW, sigBoxH, 4).fillAndStroke('#ffffff', '#cbd5e1');
      doc.rect(MARGIN_LEFT, sigY, sigBoxW, 16).fill('#f1f5f9');
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
         .text('VERIFIED BY (ATTENDANCE CHECKER)', MARGIN_LEFT + 10, sigY + 4, { lineBreak: false });

      if (adeelSign) {
        try { doc.image(adeelSign, MARGIN_LEFT + 10, sigY + 20, { fit: [95, 28] }); } catch (e) {}
      }
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9.5)
         .text('Adeel Ahmed', MARGIN_LEFT + 115, sigY + 22, { lineBreak: false });
      doc.fillColor(SLATE).font('Helvetica').fontSize(7.5)
         .text('Attendance Checker  •  PixxTechnologies UK', MARGIN_LEFT + 115, sigY + 38, { lineBreak: false });
    } else {
      // Box 1: Usman Salahuddin (Attendance Taker)
      doc.roundedRect(MARGIN_LEFT, sigY, sigBoxW, sigBoxH, 4).fillAndStroke('#ffffff', '#cbd5e1');
      doc.rect(MARGIN_LEFT, sigY, sigBoxW, 16).fill('#f1f5f9');
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
         .text('SUBMITTED BY (ATTENDANCE TAKER)', MARGIN_LEFT + 10, sigY + 4, { lineBreak: false });

      if (usmanSign) {
        try { doc.image(usmanSign, MARGIN_LEFT + 10, sigY + 20, { fit: [95, 28] }); } catch (e) {}
      }
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9.5)
         .text('Usman Salahuddin', MARGIN_LEFT + 115, sigY + 22, { lineBreak: false });
      doc.fillColor(SLATE).font('Helvetica').fontSize(7.5)
         .text('Attendance Taker  •  PixxTechnologies UK', MARGIN_LEFT + 115, sigY + 38, { lineBreak: false });
    }

    // Box 2: Sarfraz Khan (Attendance Checker)
    const rightX = MARGIN_LEFT + sigBoxW + 14;
    doc.roundedRect(rightX, sigY, sigBoxW, sigBoxH, 4).fillAndStroke('#ffffff', '#cbd5e1');
    doc.rect(rightX, sigY, sigBoxW, 16).fill('#f1f5f9');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
       .text('VERIFIED BY (ATTENDANCE CHECKER)', rightX + 10, sigY + 4, { lineBreak: false });

    if (sarfrazSign) {
      try { doc.image(sarfrazSign, rightX + 10, sigY + 20, { fit: [95, 28] }); } catch (e) {}
    }
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9.5)
       .text('Sarfraz Khan', rightX + 115, sigY + 22, { lineBreak: false });
    doc.fillColor(SLATE).font('Helvetica').fontSize(7.5)
       .text('Attendance Checker  •  PixxTechnologies UK', rightX + 115, sigY + 38, { lineBreak: false });

    // Bottom footer: turn off bottom margin auto-page-break
    doc.page.margins.bottom = 0;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7)
       .text(
         `PIXX ROTA  •  Confidential Attendance Record  •  Date: ${formattedDate}`,
         MARGIN_LEFT,
         doc.page.height - 12,
         { width: PAGE_W, align: 'center', lineBreak: false }
       );

    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${attendanceReportFilename(shopDoc?.name || 'All-Shops', dateStr, 'pdf')}"`
    );
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Daily attendance PDF export failed:', error);
    return sendServerError(res, error, 'Failed to generate PDF: ' + (error?.message || 'Server error'));
  }
};

// ============================================================
// 2. WEEKLY ATTENDANCE REPORT (Sunday -> Saturday)
// ============================================================

function buildWeeklyAttendanceData(attendances) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const empMap = {};
  const shopAggMap = {};

  (attendances || []).forEach(a => {
    if (!a) return;
    const empObj = a.employee;
    const empKey = empObj
      ? (empObj._id ? empObj._id.toString() : empObj.toString())
      : (a.employeeId || a.employeeName || (a._id ? a._id.toString() : 'unknown'));

    const empName = a.employeeName || (empObj && empObj.name) || 'Worker';
    const sName = a.shopName || (a.shop && a.shop.name) || 'Shop';
    const empCode = a.employeeId || (empObj && empObj.employeeId) || '';

    if (!empMap[empKey]) {
      empMap[empKey] = {
        employee: empObj ? (empObj._id || empObj) : null,
        employeeName: empName,
        employeeId: empCode,
        shopId: a.shop ? (a.shop._id || a.shop) : null,
        shopName: sName,
        shopsList: [],
        shopBreakdown: {},
        dailySchedule: { Sun: 'Off', Mon: 'Off', Tue: 'Off', Wed: 'Off', Thu: 'Off', Fri: 'Off', Sat: 'Off' },
        workingDays: 0,
        presentDays: 0,
        lateDays: 0,
        halfDays: 0,
        absentDays: 0,
        scheduledHours: 0,
        actualHours: 0,
        lateMinutes: 0
      };
    }

    const rec = empMap[empKey];
    if (!rec.employeeId && empCode) rec.employeeId = empCode;

    const dateVal = a.dateString || a.date;
    const dayIdx = getDayOfWeekUK(dateVal);
    const dayName = dayNames[dayIdx];
    if (dayName) {
      if (a.status !== 'Absent') {
        rec.dailySchedule[dayName] = sName || 'Present';
      } else {
        rec.dailySchedule[dayName] = 'Off';
      }
    }

    const sched = Number(a.scheduledHours) || 0;
    const act = Number(a.actualHours) || 0;
    const lMin = Number(a.lateMinutes) || 0;

    if (a.status !== 'Absent') {
      rec.workingDays += 1;
      if (sName && sName !== 'Absent') {
        if (!rec.shopsList.includes(sName)) {
          rec.shopsList.push(sName);
        }
        if (!rec.shopBreakdown[sName]) {
          rec.shopBreakdown[sName] = { days: 0, hours: 0 };
        }
        rec.shopBreakdown[sName].days += 1;
        rec.shopBreakdown[sName].hours = Number((rec.shopBreakdown[sName].hours + act).toFixed(2));

        if (!shopAggMap[sName]) {
          shopAggMap[sName] = { shopName: sName, totalDays: 0, totalHours: 0, staffKeys: new Set() };
        }
        shopAggMap[sName].totalDays += 1;
        shopAggMap[sName].totalHours = Number((shopAggMap[sName].totalHours + act).toFixed(2));
        shopAggMap[sName].staffKeys.add(empKey);
      }
    }
    if (a.status === 'Present' || a.status === 'Late') rec.presentDays += 1;
    if (a.status === 'Late') rec.lateDays += 1;
    else if (a.status === 'Half') rec.halfDays += 1;
    else if (a.status === 'Absent') rec.absentDays += 1;

    rec.scheduledHours = Number((Number(rec.scheduledHours || 0) + sched).toFixed(2));
    rec.actualHours = Number((Number(rec.actualHours || 0) + act).toFixed(2));
    rec.lateMinutes = Number(rec.lateMinutes || 0) + lMin;
  });

  const records = Object.values(empMap);
  records.forEach(r => {
    if (r.shopsList && r.shopsList.length > 0) {
      r.shopName = r.shopsList.join(' / ');
    }
  });

  const shopSummaries = Object.values(shopAggMap).map(s => ({
    shopName: s.shopName,
    totalDays: s.totalDays,
    totalHours: Number(s.totalHours.toFixed(2)),
    staffCount: s.staffKeys.size
  })).sort((a, b) => b.totalHours - a.totalHours);

  const summary = {
    totalEmployees: records.length,
    totalWorkingDays: records.reduce((sum, r) => sum + (Number(r.workingDays) || 0), 0),
    totalPresent: records.reduce((sum, r) => sum + (Number(r.presentDays) || 0), 0),
    totalLate: records.reduce((sum, r) => sum + (Number(r.lateDays) || 0), 0),
    totalHalf: records.reduce((sum, r) => sum + (Number(r.halfDays) || 0), 0),
    totalAbsent: records.reduce((sum, r) => sum + (Number(r.absentDays) || 0), 0),
    totalScheduledHours: Number(records.reduce((sum, r) => sum + (Number(r.scheduledHours) || 0), 0).toFixed(2)),
    totalWorkedHours: Number(records.reduce((sum, r) => sum + (Number(r.actualHours) || 0), 0).toFixed(2)),
    totalLateMinutes: records.reduce((sum, r) => sum + (Number(r.lateMinutes) || 0), 0),
    shopSummaries
  };

  return { records, summary };
}

exports.getWeeklyAttendanceReport = async (req, res) => {
  try {
    const { weekLabel, date, shopId, employeeId } = req.query;
    let dateToUse = date;
    if (weekLabel && typeof weekLabel === 'string') {
      const firstPart = weekLabel.split(/–|-|to/)[0].trim();
      if (firstPart) dateToUse = firstPart;
    }
    const week = getWeekRange(dateToUse || new Date());
    const targetWeekLabel = weekLabel || week.weekLabel;

    const query = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ]
    };
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;

    const attendances = await Attendance.find(query)
      .populate('employee')
      .populate('shop')
      .sort({ shopName: 1, employeeName: 1, dateString: 1 });

    const { records, summary } = buildWeeklyAttendanceData(attendances);

    res.json({
      success: true,
      weekLabel: targetWeekLabel,
      startDateString: week.startDateString,
      endDateString: week.endDateString,
      summary,
      records
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to generate weekly attendance report.');
  }
};

exports.exportWeeklyAttendanceExcel = async (req, res) => {
  try {
    const { weekLabel, date, shopId, employeeId } = req.query;
    let dateToUse = date;
    if (weekLabel) {
      const firstPart = weekLabel.split(/–|-|to/)[0].trim();
      if (firstPart) dateToUse = firstPart;
    }
    const week = getWeekRange(dateToUse || new Date());
    const targetWeekLabel = weekLabel || week.weekLabel;

    const query = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ]
    };
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;

    const attendances = await Attendance.find(query).populate('employee').sort({ shopName: 1, employeeName: 1 });
    const { records, summary } = buildWeeklyAttendanceData(attendances);

    const workbook = await buildWeeklyAttendanceExcel(records, targetWeekLabel, summary);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'WeeklyAttendance',
      details: `Exported Weekly Attendance Excel for ${targetWeekLabel}`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Weekly_Attendance_${targetWeekLabel.replace(/[\/–\s]/g, '_')}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export weekly attendance Excel.');
  }
};

exports.exportWeeklyAttendancePDF = async (req, res) => {
  try {
    const { weekLabel, date, shopId, employeeId } = req.query;
    let dateToUse = date;
    if (weekLabel) {
      const firstPart = weekLabel.split(/–|-|to/)[0].trim();
      if (firstPart) dateToUse = firstPart;
    }
    const week = getWeekRange(dateToUse || new Date());
    const targetWeekLabel = weekLabel || week.weekLabel;

    const query = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ]
    };
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;

    const attendances = await Attendance.find(query).populate('employee').sort({ shopName: 1, employeeName: 1 });
    const { records, summary } = buildWeeklyAttendanceData(attendances);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'WeeklyAttendance',
      details: `Exported Weekly Attendance PDF for ${targetWeekLabel}`,
      req
    });

    buildWeeklyAttendancePDF(
      res,
      records,
      targetWeekLabel,
      summary,
      req.user.name || 'Admin'
    );
  } catch (error) {
    return sendServerError(res, error, 'Failed to export weekly attendance PDF.');
  }
};

exports.getWeeklyStaffReport = async (req, res) => {
  try {
    const { weekLabel, date } = req.query;
    const targetWeek = weekLabel || getWeekRange(date || new Date()).weekLabel;

    const salaries = await WeeklySalary.find({ weekLabel: targetWeek })
      .populate('employee')
      .populate('shop')
      .sort({ shopName: 1, employeeName: 1 });

    const groupedShops = {};
    salaries.forEach(s => {
      const sName = s.shopName || 'Other';
      if (!groupedShops[sName]) {
        groupedShops[sName] = {
          shopName: sName,
          staff: [],
          totalStaff: 0,
          totalWorkingHours: 0,
          totalGrossSalary: 0,
          totalDeductions: 0,
          totalAllowances: 0,
          totalBonus: 0,
          totalPayable: 0,
          totalPaid: 0
        };
      }

      groupedShops[sName].staff.push(s);
      groupedShops[sName].totalStaff += 1;
      groupedShops[sName].totalWorkingHours += s.actualHours || 0;
      groupedShops[sName].totalGrossSalary += s.grossDailyWages || 0;
      groupedShops[sName].totalDeductions += (s.lateDeductions || 0) + (s.manualDeductions || 0);
      groupedShops[sName].totalAllowances += (s.travelAllowance || 0) + (s.otherAllowances || 0);
      groupedShops[sName].totalBonus += s.bonus || 0;
      groupedShops[sName].totalPayable += s.finalSalary || 0;
      groupedShops[sName].totalPaid += s.totalPaid || 0;
    });

    res.json({
      success: true,
      weekLabel: targetWeek,
      shopGroups: Object.values(groupedShops),
      salaries
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch weekly staff report.');
  }
};

// ============================================================
// 3. WEEKLY SALARY REPORT
// ============================================================

async function fetchWeeklySalariesWithFallback({ weekLabel, date, shopId, employeeId, status, paymentStatus }) {
  let dateToUse = date;
  if (weekLabel) {
    const firstPart = weekLabel.split(/–|-|to/)[0].trim();
    if (firstPart) dateToUse = firstPart;
  }
  const week = getWeekRange(dateToUse || new Date());
  const targetWeekLabel = weekLabel || week.weekLabel;
  const altLabel = targetWeekLabel.includes(' – ')
    ? targetWeekLabel.replace(' – ', ' to ')
    : targetWeekLabel.replace(' to ', ' – ');

  const SYSTEM_START_DATE = new Date('2026-10-11T00:00:00.000Z');
  const query = {
    weekStartDate: { $gte: SYSTEM_START_DATE },
    $or: [
      { weekLabel: { $in: [targetWeekLabel, altLabel, week.weekLabel, week.legacyWeekLabel] } },
      { weekStartDateString: week.startDateString },
      { weekStartDate: { $gte: week.startDate, $lte: week.endDate } }
    ]
  };

  const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
  const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
  if (status) query.status = status;

  if (paymentStatus === 'PAID') {
    query.balanceRemaining = { $lte: 0 };
    query.finalSalary = { $gt: 0 };
  } else if (paymentStatus === 'PARTIALLY_PAID') {
    query.totalPaid = { $gt: 0 };
    query.balanceRemaining = { $gt: 0 };
  } else if (paymentStatus === 'UNPAID') {
    query.totalPaid = { $lte: 0 };
  }

  let salaries = await WeeklySalary.find(query)
    .populate('employee')
    .populate('shop')
    .sort({ shopName: 1, employeeName: 1 });

  if (salaries.length > 0) {
    const attQuery = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ]
    };
    if (sId) attQuery.shop = sId;
    if (eId) attQuery.employee = eId;

    const attendances = await Attendance.find(attQuery)
      .populate('employee')
      .sort({ dateString: 1 });
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const attendanceByEmployee = new Map();
    attendances.forEach(attendance => {
      const employee = attendance.employee;
      const employeeId = employee?._id
        ? employee._id.toString()
        : employee?.toString();
      if (!employeeId) return;
      const records = attendanceByEmployee.get(employeeId) || [];
      records.push({
        dateString: attendance.dateString || getUKDateString(attendance.date),
        dayOfWeek: dayNames[getDayOfWeekUK(attendance.dateString || attendance.date)],
        shopName: attendance.shopName || 'Shop',
        status: attendance.status,
        attendancePay: Number(attendance.attendancePay) || 0
      });
      attendanceByEmployee.set(employeeId, records);
    });

    salaries = salaries.map(salary => {
      const salaryData = typeof salary.toObject === 'function' ? salary.toObject() : salary;
      const employeeId = salaryData.employee?._id
        ? salaryData.employee._id.toString()
        : salaryData.employee?.toString();
      const recordsByDate = new Map();
      const savedRecords = salaryData.finalizationSnapshot?.attendanceBreakdown
        || salaryData.attendanceBreakdown
        || [];
      savedRecords.forEach(record => {
        if (record.dateString) recordsByDate.set(String(record.dateString).slice(0, 10), record);
      });
      (attendanceByEmployee.get(employeeId) || []).forEach(record => {
        recordsByDate.set(record.dateString, record);
      });
      const reportAttendanceBreakdown = [...recordsByDate.values()];
      const isPayrollLocked = ['FINALIZED', 'PAID', 'PARTIALLY_PAID']
        .includes(String(salaryData.status || '').toUpperCase().replaceAll(' ', '_'));
      if (isPayrollLocked) return { ...salaryData, reportAttendanceBreakdown };

      const attendancePayTotal = Number(reportAttendanceBreakdown
        .reduce((total, record) => total + (Number(record.attendancePay) || 0), 0)
        .toFixed(2));
      const netAttendancePay = salaryData.weeklySalaryOverride === undefined
        || salaryData.weeklySalaryOverride === null
        ? attendancePayTotal
        : Number(salaryData.weeklySalaryOverride);
      const recalculated = calculateWeeklySalaryComponents({
        netAttendancePay,
        adjustments: [
          { type: 'TRAVEL_ALLOWANCE', amount: salaryData.travelAllowance },
          { type: 'OTHER_ALLOWANCE', amount: salaryData.otherAllowances },
          { type: 'MANUAL_DEDUCTION', amount: salaryData.manualDeductions }
        ],
        bonus: salaryData.bonus
      });
      const totalPaid = Number(salaryData.totalPaid) || 0;
      return {
        ...salaryData,
        reportAttendanceBreakdown,
        netAttendancePay: recalculated.netAttendancePay,
        finalSalary: recalculated.finalSalary,
        balanceRemaining: Number(Math.max(0, recalculated.finalSalary - totalPaid).toFixed(2))
      };
    });
  }

  if (salaries.length === 0) {
    const attQuery = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ]
    };
    if (sId) attQuery.shop = sId;
    if (eId) attQuery.employee = eId;

    const attendances = await Attendance.find(attQuery).populate('employee').sort({ shopName: 1, employeeName: 1 });

    if (attendances.length > 0) {
      const empMap = {};
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      attendances.forEach(a => {
        const key = a.employee ? (a.employee._id ? a.employee._id.toString() : a.employee.toString()) : a.employeeName;
        if (!empMap[key]) {
          empMap[key] = {
            _id: 'calc_' + key,
            employee: a.employee,
            employeeId: a.employeeId || '',
            employeeName: a.employeeName || 'Worker',
            shop: a.shop,
            shopName: a.shopName || 'Shop',
            weekLabel: targetWeekLabel,
            netAttendancePay: 0,
            grossDailyWages: 0,
            travelAllowance: 0,
            otherAllowances: 0,
            bonus: 0,
            manualDeductions: 0,
            lateDeductions: 0,
            finalSalary: 0,
            totalPaid: 0,
            balanceRemaining: 0,
            attendanceBreakdown: [],
            status: 'Calculated'
          };
        }
        const rec = empMap[key];
        const effectiveWage = resolveDailyWage(a.dailyWage, a.employee?.dailyWage);
        const calcResult = calculateAttendanceRecord({
          dailyWage: effectiveWage,
          shiftStart: a.shiftStart || '09:00',
          shiftEnd: a.shiftEnd || '19:00',
          timeReached: a.timeReached || a.shiftStart || '09:00',
          workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
          status: a.status,
          gracePeriodMinutes: 15
        });
        rec.grossDailyWages = Number(rec.grossDailyWages || 0) + Number(effectiveWage || 0);
        rec.lateDeductions = Number(rec.lateDeductions || 0) + Number(calcResult.lateDeduction || 0);
        rec.netAttendancePay = Number(rec.netAttendancePay || 0) + Number(calcResult.attendancePay || 0);
        rec.attendanceBreakdown.push({
          dateString: a.dateString || (a.date instanceof Date ? a.date.toISOString().slice(0, 10) : ''),
          dayOfWeek: dayNames[getDayOfWeekUK(a.dateString || a.date)],
          status: a.status,
          attendancePay: Number(calcResult.attendancePay || 0)
        });
      });

      salaries = Object.values(empMap).map(rec => {
        rec.netAttendancePay = Number(Number(rec.netAttendancePay || 0).toFixed(2));
        rec.grossDailyWages = Number(Number(rec.grossDailyWages || 0).toFixed(2));
        rec.lateDeductions = Number(Number(rec.lateDeductions || 0).toFixed(2));
        rec.finalSalary = rec.netAttendancePay;
        rec.balanceRemaining = rec.netAttendancePay;
        return rec;
      });

      if (paymentStatus === 'PAID') {
        salaries = salaries.filter(s => s.balanceRemaining <= 0 && s.finalSalary > 0);
      } else if (paymentStatus === 'PARTIALLY_PAID') {
        salaries = salaries.filter(s => s.totalPaid > 0 && s.balanceRemaining > 0);
      } else if (paymentStatus === 'UNPAID') {
        salaries = salaries.filter(s => s.totalPaid <= 0);
      }
    }
  }

  return { salaries, targetWeekLabel, week };
}

exports.getWeeklySalaryReport = async (req, res) => {
  try {
    const { salaries, targetWeekLabel, week } = await fetchWeeklySalariesWithFallback(req.query);
    const weekDays = buildWeeklySalaryDailyBreakdown({}, week.startDateString);
    const salaryRows = salaries.map(salary => ({
      ...(typeof salary.toObject === 'function' ? salary.toObject() : salary),
      dailyAttendance: buildWeeklySalaryDailyBreakdown(salary, week.startDateString)
    }));

    const totals = {
      count: salaryRows.length,
      totalAttendancePay: Number(salaryRows.reduce((sum, s) => sum + (Number(s.netAttendancePay) || 0), 0).toFixed(2)),
      totalAllowances: Number(salaryRows.reduce((sum, s) => sum + (Number(s.travelAllowance) || 0) + (Number(s.otherAllowances) || 0), 0).toFixed(2)),
      totalBonus: Number(salaryRows.reduce((sum, s) => sum + (Number(s.bonus) || 0), 0).toFixed(2)),
      totalDeductions: Number(salaryRows.reduce((sum, s) => sum + (Number(s.manualDeductions) || 0), 0).toFixed(2)),
      totalFinalSalary: Number(salaryRows.reduce((sum, s) => sum + (Number(s.finalSalary) || 0), 0).toFixed(2)),
      totalPaid: Number(salaryRows.reduce((sum, s) => sum + (Number(s.totalPaid) || 0), 0).toFixed(2)),
      totalOutstanding: Number(salaryRows.reduce((sum, s) => sum + (Number(s.balanceRemaining) || 0), 0).toFixed(2)),
      dailyAttendance: weekDays.map((day, dayIndex) => ({
        dateString: day.dateString,
        attendancePay: Number(salaryRows.reduce((sum, salary) => sum + (salary.dailyAttendance[dayIndex]?.attendancePay || 0), 0).toFixed(2))
      }))
    };

    res.json({
      success: true,
      weekLabel: targetWeekLabel,
      weekStartDateString: week.startDateString,
      weekEndDateString: week.endDateString,
      count: salaryRows.length,
      totals,
      salaries: salaryRows
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch weekly salary report.');
  }
};

exports.exportWeeklySalaryExcel = async (req, res) => {
  try {
    const { salaries, targetWeekLabel, week } = await fetchWeeklySalariesWithFallback(req.query);
    const totals = {
      totalAttendancePay: Number(salaries.reduce((sum, s) => sum + (Number(s.netAttendancePay) || 0), 0).toFixed(2)),
      totalAllowances: Number(salaries.reduce((sum, s) => sum + (Number(s.travelAllowance) || 0) + (Number(s.otherAllowances) || 0), 0).toFixed(2)),
      totalBonus: Number(salaries.reduce((sum, s) => sum + (Number(s.bonus) || 0), 0).toFixed(2)),
      totalDeductions: Number(salaries.reduce((sum, s) => sum + (Number(s.manualDeductions) || 0), 0).toFixed(2)),
      totalFinalSalary: Number(salaries.reduce((sum, s) => sum + (Number(s.finalSalary) || 0), 0).toFixed(2)),
      totalPaid: Number(salaries.reduce((sum, s) => sum + (Number(s.totalPaid) || 0), 0).toFixed(2)),
      totalOutstanding: Number(salaries.reduce((sum, s) => sum + (Number(s.balanceRemaining) || 0), 0).toFixed(2))
    };

    const workbook = await buildWeeklySalaryExcel(salaries, targetWeekLabel, totals, week.startDateString);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'WeeklySalary',
      details: `Exported Weekly Salary Excel for ${targetWeekLabel}`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Weekly_Salary_${targetWeekLabel.replace(/[\/–\s]/g, '_')}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export weekly salary Excel.');
  }
};

exports.exportWeeklySalaryPDF = async (req, res) => {
  try {
    const { salaries, targetWeekLabel, week } = await fetchWeeklySalariesWithFallback(req.query);
    const totals = {
      totalAttendancePay: Number(salaries.reduce((sum, s) => sum + (Number(s.netAttendancePay) || 0), 0).toFixed(2)),
      totalAllowances: Number(salaries.reduce((sum, s) => sum + (Number(s.travelAllowance) || 0) + (Number(s.otherAllowances) || 0), 0).toFixed(2)),
      totalBonus: Number(salaries.reduce((sum, s) => sum + (Number(s.bonus) || 0), 0).toFixed(2)),
      totalDeductions: Number(salaries.reduce((sum, s) => sum + (Number(s.manualDeductions) || 0), 0).toFixed(2)),
      totalFinalSalary: Number(salaries.reduce((sum, s) => sum + (Number(s.finalSalary) || 0), 0).toFixed(2)),
      totalPaid: Number(salaries.reduce((sum, s) => sum + (Number(s.totalPaid) || 0), 0).toFixed(2)),
      totalOutstanding: Number(salaries.reduce((sum, s) => sum + (Number(s.balanceRemaining) || 0), 0).toFixed(2))
    };

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'WeeklySalary',
      details: `Exported Weekly Salary PDF for ${targetWeekLabel}`,
      req
    });

    await buildWeeklySalaryPDF(res, salaries, targetWeekLabel, totals, req.user?.name || 'Admin', week.startDateString);
  } catch (error) {
    return sendServerError(res, error, 'Failed to export weekly salary PDF.');
  }
};

// ============================================================
// 4. EMPLOYEE SALARY HISTORY
// ============================================================

exports.getEmployeeSalaryHistory = async (req, res) => {
  try {
    const { employeeId, dateFrom, dateTo } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });

    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const query = {
      employee: employeeId,
      status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] }
    };

    if (dateFrom && dateTo) {
      query.weekEndDate = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    }

    const salaries = await WeeklySalary.find(query).sort({ weekStartDate: -1 });

    const totals = {
      totalWeeks: salaries.length,
      totalFinalSalary: Number(salaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0).toFixed(2)),
      totalPaid: Number(salaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0).toFixed(2)),
      totalOutstanding: Number(salaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0).toFixed(2))
    };

    res.json({
      success: true,
      employee,
      totals,
      salaries
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve employee salary history.');
  }
};

// ============================================================
// 5. EMPLOYEE MONTHLY REPORT
// ============================================================

exports.getEmployeeMonthlyReport = async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });
    const period = getMonthlyReportPeriod(month, year);
    if (!period) return res.status(400).json({ success: false, message: 'Month must be between 1 and 12 and year must be valid.' });

    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const { targetYear, targetMonth, monthStart, monthEnd, monthLabel } = period;

    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1. Attendance Summary for Month
    const attendances = await Attendance.find({
      employee: employeeId,
      dateString: { $gte: startStr, $lte: endStr }
    }).populate('shop').sort({ dateString: 1 });

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyRecords = attendances.map(r => {
      const wage = resolveDailyWage(r.dailyWage, r.employee?.dailyWage);
      let calc = { hourlyWage: 0, lateMinutes: 0, lateDeduction: 0, attendancePay: 0 };
      if (r.status !== 'Absent') {
        calc = calculateAttendanceRecord({
          dailyWage: wage,
          shiftStart: r.shiftStart || '09:00',
          shiftEnd: r.shiftEnd || '19:00',
          timeReached: r.timeReached || r.shiftStart || '09:00',
          workerEndTime: r.workerEndTime || r.shiftEnd || '19:00',
          status: r.status,
          gracePeriodMinutes: 15
        });
      }
      r.hourlyWage = calc.hourlyWage;
      r.lateMinutes = calc.lateMinutes;
      r.lateDeduction = calc.lateDeduction;
      r.attendancePay = calc.attendancePay;

      const dayIdx = getDayOfWeekUK(r.dateString || r.date);
      return {
        dateString: r.dateString,
        formattedDate: formatUKDate(r.dateString || r.date),
        dayOfWeek: dayNames[dayIdx] || 'Mon',
        shopName: r.shopName || r.shop?.name || employee.assignedShop?.name || 'Shop',
        shiftStart: r.shiftStart || '09:00',
        shiftEnd: r.shiftEnd || '19:00',
        timeReached: r.timeReached || r.shiftStart || '09:00',
        workerEndTime: r.workerEndTime || r.shiftEnd || '19:00',
        actualHours: Number(r.actualHours || 0),
        status: r.status || 'Present',
        lateMinutes: calc.lateMinutes || 0,
        lateDeduction: calc.lateDeduction || 0,
        attendancePay: calc.attendancePay || 0
      };
    });

    const attendanceSummary = {
      totalRecords: attendances.length,
      workingDays: attendances.filter(a => a.status !== 'Absent').length,
      present: attendances.filter(a => a.status === 'Present').length,
      late: attendances.filter(a => a.status === 'Late').length,
      half: attendances.filter(a => a.status === 'Half').length,
      absent: attendances.filter(a => a.status === 'Absent').length,
      scheduledHours: Number(attendances.reduce((sum, a) => sum + (a.scheduledHours || 0), 0).toFixed(2)),
      actualHours: Number(attendances.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2)),
      lateMinutes: attendances.reduce((sum, a) => sum + (a.lateMinutes || 0), 0),
      lateDeduction: Number(attendances.reduce((sum, a) => sum + (a.lateDeduction || 0), 0).toFixed(2)),
      attendancePay: Number(attendances.reduce((sum, a) => sum + (a.attendancePay || 0), 0).toFixed(2))
    };

    // 2. Weekly Salaries overlapping this month
    const salaries = await WeeklySalary.find({
      employee: employeeId,
      weekEndDate: { $gte: monthStart, $lte: monthEnd }
    }).sort({ weekStartDate: 1 });

    // 3. Payments made in this month
    const payments = await SalaryPayment.find({
      employee: employeeId,
      paymentDate: { $gte: monthStart, $lte: monthEnd }
    }).sort({ paymentDate: 1 });

    const weeklyBreakdowns = [];
    let grandDays = 0;
    let grandWage = 0;
    let grandDed = 0;
    let grandBonus = 0;
    let grandTotal = 0;
    let grandCash = 0;
    let grandBank = 0;
    let grandPaid = 0;

    salaries.forEach(s => {
      const salPayments = payments.filter(p => p.weeklySalary?.toString() === s._id.toString());
      const cashPay = salPayments.filter(p => p.paymentMethod === 'Cash').reduce((sum, p) => sum + p.amount, 0);
      const bankPay = salPayments.filter(p => p.paymentMethod === 'Bank').reduce((sum, p) => sum + p.amount, 0);
      const paymentTotal = cashPay + bankPay;
      const latestPayDate = salPayments.length ? formatUKDate(salPayments[salPayments.length - 1].paymentDate) : '';

      grandDays += s.workingDays || 0;
      grandWage += s.grossDailyWages || 0;
      grandDed += (s.lateDeductions || 0) + (s.manualDeductions || 0);
      grandBonus += s.bonus || 0;
      grandTotal += s.finalSalary || 0;
      grandCash += cashPay;
      grandBank += bankPay;
      grandPaid += paymentTotal;

      weeklyBreakdowns.push({
        weekDates: s.weekLabel,
        days: s.workingDays,
        wage: s.grossDailyWages,
        ded: (s.lateDeductions || 0) + (s.manualDeductions || 0),
        bonus: s.bonus || 0,
        total: s.finalSalary,
        receivedDate: latestPayDate,
        cash: cashPay,
        bank: bankPay,
        paymentTotal,
        balance: s.balanceRemaining,
        status: s.status
      });
    });

    const balancePayable = Math.max(0, grandTotal - grandPaid);

    res.json({
      success: true,
      employeeName: employee.name,
      employeeId: employee.employeeId,
      shopName: employee.assignedShop?.name || 'Pixx Shop',
      monthLabel,
      attendanceSummary,
      weeklyBreakdowns,
      dailyRecords,
      grandTotal: {
        days: grandDays,
        wage: Number(grandWage.toFixed(2)),
        ded: Number(grandDed.toFixed(2)),
        bonus: Number(grandBonus.toFixed(2)),
        total: Number(grandTotal.toFixed(2)),
        cash: Number(grandCash.toFixed(2)),
        bank: Number(grandBank.toFixed(2)),
        paid: Number(grandPaid.toFixed(2))
      },
      balancePayable: Number(balancePayable.toFixed(2))
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to build employee monthly report.');
  }
};

exports.exportEmployeeMonthlyExcel = async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });
    const period = getMonthlyReportPeriod(month, year);
    if (!period) return res.status(400).json({ success: false, message: 'Month must be between 1 and 12 and year must be valid.' });
    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const { targetYear, targetMonth, monthStart, monthEnd, monthLabel } = period;

    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const attendances = await Attendance.find({ employee: employeeId, dateString: { $gte: startStr, $lte: endStr } }).populate('shop').sort({ dateString: 1 });
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyRecords = attendances.map(r => {
      const wage = resolveDailyWage(r.dailyWage, r.employee?.dailyWage);
      let calc = { hourlyWage: 0, lateMinutes: 0, lateDeduction: 0, attendancePay: 0 };
      if (r.status !== 'Absent') {
        calc = calculateAttendanceRecord({
          dailyWage: wage,
          shiftStart: r.shiftStart || '09:00',
          shiftEnd: r.shiftEnd || '19:00',
          timeReached: r.timeReached || r.shiftStart || '09:00',
          workerEndTime: r.workerEndTime || r.shiftEnd || '19:00',
          status: r.status,
          gracePeriodMinutes: 15
        });
      }
      const dayIdx = getDayOfWeekUK(r.dateString || r.date);
      return {
        dateString: r.dateString,
        formattedDate: formatUKDate(r.dateString || r.date),
        dayOfWeek: dayNames[dayIdx] || 'Mon',
        shopName: r.shopName || r.shop?.name || employee.assignedShop?.name || 'Shop',
        shiftStart: r.shiftStart || '09:00',
        shiftEnd: r.shiftEnd || '19:00',
        timeReached: r.timeReached || r.shiftStart || '09:00',
        workerEndTime: r.workerEndTime || r.shiftEnd || '19:00',
        actualHours: Number(r.actualHours || 0),
        status: r.status || 'Present',
        lateMinutes: calc.lateMinutes || 0,
        lateDeduction: calc.lateDeduction || 0,
        attendancePay: calc.attendancePay || 0
      };
    });

    const salaries = await WeeklySalary.find({
      employee: employeeId,
      weekEndDate: { $gte: monthStart, $lte: monthEnd }
    }).sort({ weekStartDate: 1 });

    const payments = await SalaryPayment.find({ employee: employeeId });

    const weeklyBreakdowns = [];
    let grandDays = 0, grandWage = 0, grandDed = 0, grandBonus = 0, grandTotal = 0, grandCash = 0, grandBank = 0, grandPaid = 0;

    salaries.forEach(s => {
      const salPayments = payments.filter(p => p.weeklySalary?.toString() === s._id.toString());
      const cashPay = salPayments.filter(p => p.paymentMethod === 'Cash').reduce((sum, p) => sum + p.amount, 0);
      const bankPay = salPayments.filter(p => p.paymentMethod === 'Bank').reduce((sum, p) => sum + p.amount, 0);
      const paymentTotal = cashPay + bankPay;
      const latestPayDate = salPayments.length ? formatUKDate(salPayments[salPayments.length - 1].paymentDate) : '';

      grandDays += s.workingDays || 0;
      grandWage += s.grossDailyWages || 0;
      grandDed += (s.lateDeductions || 0) + (s.manualDeductions || 0);
      grandBonus += s.bonus || 0;
      grandTotal += s.finalSalary || 0;
      grandCash += cashPay;
      grandBank += bankPay;
      grandPaid += paymentTotal;

      weeklyBreakdowns.push({
        weekDates: s.weekLabel,
        days: s.workingDays,
        wage: s.grossDailyWages,
        ded: (s.lateDeductions || 0) + (s.manualDeductions || 0),
        bonus: s.bonus || 0,
        total: s.finalSalary,
        receivedDate: latestPayDate,
        cash: cashPay,
        bank: bankPay,
        paymentTotal,
        balance: s.balanceRemaining
      });
    });

    const balancePayable = Math.max(0, grandTotal - grandPaid);
    const workbook = await buildEmployeeMonthlyExcel(
      employee.name,
      monthLabel,
      weeklyBreakdowns,
      { days: grandDays, wage: grandWage, ded: grandDed, bonus: grandBonus, total: grandTotal, cash: grandCash, bank: grandBank, paid: grandPaid },
      balancePayable,
      dailyRecords
    );

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'EmployeeMonthly',
      details: `Exported Monthly Report Excel for ${employee.name} (${monthLabel})`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const safeEmployeeName = employee.name.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Employee';
    res.setHeader('Content-Disposition', `attachment; filename="PIXX_${safeEmployeeName}_${monthLabel}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export employee monthly report Excel.');
  }
};

exports.exportEmployeeMonthlyPDF = async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });
    const period = getMonthlyReportPeriod(month, year);
    if (!period) return res.status(400).json({ success: false, message: 'Month must be between 1 and 12 and year must be valid.' });
    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const { targetYear, targetMonth, monthStart, monthEnd, monthLabel } = period;

    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const attendances = await Attendance.find({ employee: employeeId, dateString: { $gte: startStr, $lte: endStr } }).populate('shop').sort({ dateString: 1 });
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyRecords = attendances.map(r => {
      const wage = resolveDailyWage(r.dailyWage, r.employee?.dailyWage);
      let calc = { hourlyWage: 0, lateMinutes: 0, lateDeduction: 0, attendancePay: 0 };
      if (r.status !== 'Absent') {
        calc = calculateAttendanceRecord({
          dailyWage: wage,
          shiftStart: r.shiftStart || '09:00',
          shiftEnd: r.shiftEnd || '19:00',
          timeReached: r.timeReached || r.shiftStart || '09:00',
          workerEndTime: r.workerEndTime || r.shiftEnd || '19:00',
          status: r.status,
          gracePeriodMinutes: 15
        });
      }
      const dayIdx = getDayOfWeekUK(r.dateString || r.date);
      return {
        dateString: r.dateString,
        formattedDate: formatUKDate(r.dateString || r.date),
        dayOfWeek: dayNames[dayIdx] || 'Mon',
        shopName: r.shopName || r.shop?.name || employee.assignedShop?.name || 'Shop',
        shiftStart: r.shiftStart || '09:00',
        shiftEnd: r.shiftEnd || '19:00',
        timeReached: r.timeReached || r.shiftStart || '09:00',
        workerEndTime: r.workerEndTime || r.shiftEnd || '19:00',
        actualHours: Number(r.actualHours || 0),
        status: r.status || 'Present',
        lateMinutes: calc.lateMinutes || 0,
        lateDeduction: calc.lateDeduction || 0,
        attendancePay: calc.attendancePay || 0
      };
    });

    const attendanceSummary = {
      workingDays: attendances.filter(a => a.status !== 'Absent').length,
      present: attendances.filter(a => a.status === 'Present').length,
      late: attendances.filter(a => a.status === 'Late').length,
      half: attendances.filter(a => a.status === 'Half').length,
      absent: attendances.filter(a => a.status === 'Absent').length,
      actualHours: attendances.reduce((sum, a) => sum + (a.actualHours || 0), 0),
      lateDeduction: attendances.reduce((sum, a) => sum + (a.lateDeduction || 0), 0),
      attendancePay: attendances.reduce((sum, a) => sum + (a.attendancePay || 0), 0)
    };

    const salaries = await WeeklySalary.find({ employee: employeeId, weekEndDate: { $gte: monthStart, $lte: monthEnd } }).sort({ weekStartDate: 1 });
    const payments = await SalaryPayment.find({ employee: employeeId, paymentDate: { $gte: monthStart, $lte: monthEnd } });

    const weeklyBreakdowns = [];
    let grandDays = 0, grandWage = 0, grandDed = 0, grandBonus = 0, grandTotal = 0, grandCash = 0, grandBank = 0, grandPaid = 0;

    salaries.forEach(s => {
      const salPayments = payments.filter(p => p.weeklySalary?.toString() === s._id.toString());
      const cashPay = salPayments.filter(p => p.paymentMethod === 'Cash').reduce((sum, p) => sum + p.amount, 0);
      const bankPay = salPayments.filter(p => p.paymentMethod === 'Bank').reduce((sum, p) => sum + p.amount, 0);
      const paymentTotal = cashPay + bankPay;
      const latestPayDate = salPayments.length ? formatUKDate(salPayments[salPayments.length - 1].paymentDate) : '';

      grandDays += s.workingDays || 0;
      grandWage += s.grossDailyWages || 0;
      grandDed += (s.lateDeductions || 0) + (s.manualDeductions || 0);
      grandBonus += s.bonus || 0;
      grandTotal += s.finalSalary || 0;
      grandCash += cashPay;
      grandBank += bankPay;
      grandPaid += paymentTotal;

      weeklyBreakdowns.push({
        weekDates: s.weekLabel,
        days: s.workingDays,
        wage: s.grossDailyWages,
        ded: (s.lateDeductions || 0) + (s.manualDeductions || 0),
        bonus: s.bonus || 0,
        total: s.finalSalary,
        receivedDate: latestPayDate,
        cash: cashPay,
        bank: bankPay,
        paymentTotal,
        balance: s.balanceRemaining
      });
    });

    const balancePayable = Math.max(0, grandTotal - grandPaid);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'EmployeeMonthly',
      details: `Exported Monthly Report PDF for ${employee.name} (${monthLabel})`,
      req
    });

    buildEmployeeMonthlyPDF(
      res,
      employee.name,
      employee.employeeId,
      employee.assignedShop?.name || 'Pixx Shop',
      monthLabel,
      attendanceSummary,
      weeklyBreakdowns,
      { total: grandTotal, paid: grandPaid, cash: grandCash, bank: grandBank },
      balancePayable,
      req.user?.name || 'Admin',
      dailyRecords
    );
  } catch (error) {
    return sendServerError(res, error, 'Failed to export employee monthly report PDF.');
  }
};

// ============================================================
// 6. EMPLOYEE YEARLY REPORT
// ============================================================

async function fetchYearlyEmployeeData(employeeId, targetYear) {
  const yearStartStr = `${targetYear}-01-01`;
  const yearEndStr = `${targetYear}-12-31`;
  const yearStartDate = new Date(Date.UTC(targetYear, 0, 1));
  const yearEndDate = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));

  // Run all 3 queries in parallel — 1 single round-trip instead of 48 sequential queries!
  const [attendances, salaries, payments] = await Promise.all([
    Attendance.find({
      employee: employeeId,
      dateString: { $gte: yearStartStr, $lte: yearEndStr }
    }).populate('employee').lean(),
    WeeklySalary.find({
      employee: employeeId,
      status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
      $or: [
        { weekEndDate: { $gte: yearStartDate, $lte: yearEndDate } },
        { weekEndDateString: { $gte: yearStartStr, $lte: yearEndStr } }
      ]
    }).lean(),
    SalaryPayment.find({
      employee: employeeId,
      paymentDate: { $gte: yearStartDate, $lte: yearEndDate }
    }).lean()
  ]);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyRows = [];

  let totalWorkingDays = 0;
  let totalActualHours = 0;
  let totalAttendancePay = 0;
  let totalAllowances = 0;
  let totalBonus = 0;
  let totalDeductions = 0;
  let totalFinalSalary = 0;
  let totalPaid = 0;

  for (let m = 0; m < 12; m++) {
    const monthNumStr = String(m + 1).padStart(2, '0');
    const mAttendances = attendances.filter(a => a.dateString && a.dateString.slice(5, 7) === monthNumStr);
    const mWorkingDays = mAttendances.filter(a => a.status !== 'Absent').length;
    const mActualHours = Number(mAttendances.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2));
    const mAttendancePay = Number(mAttendances.reduce((sum, a) => {
      if (a.status === 'Absent') return sum;
      if (typeof a.attendancePay === 'number' && a.attendancePay > 0) return sum + a.attendancePay;
      const wage = resolveDailyWage(a.dailyWage, a.employee?.dailyWage);
      const calc = calculateAttendanceRecord({
        dailyWage: wage,
        shiftStart: a.shiftStart || '09:00',
        shiftEnd: a.shiftEnd || '19:00',
        timeReached: a.timeReached || a.shiftStart || '09:00',
        workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
        status: a.status,
        gracePeriodMinutes: 15
      });
      return sum + calc.attendancePay;
    }, 0).toFixed(2));

    const mSalaries = salaries.filter(s => {
      if (s.weekEndDateString) return s.weekEndDateString.slice(5, 7) === monthNumStr;
      if (s.weekEndDate) return new Date(s.weekEndDate).getUTCMonth() === m;
      return false;
    });

    const mAllowances = Number(mSalaries.reduce((sum, s) => sum + (s.travelAllowance || 0) + (s.otherAllowances || 0), 0).toFixed(2));
    const mBonus = Number(mSalaries.reduce((sum, s) => sum + (s.bonus || 0), 0).toFixed(2));
    const mDeductions = Number(mSalaries.reduce((sum, s) => sum + (s.manualDeductions || 0), 0).toFixed(2));
    const mFinalSalary = Number(mSalaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0).toFixed(2));

    const mPayments = payments.filter(p => p.paymentDate && new Date(p.paymentDate).getUTCMonth() === m);
    const mPaid = Number(mPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2));
    const mOutstanding = Number(Math.max(0, mFinalSalary - mPaid).toFixed(2));

    totalWorkingDays += mWorkingDays;
    totalActualHours += mActualHours;
    totalAttendancePay += mAttendancePay;
    totalAllowances += mAllowances;
    totalBonus += mBonus;
    totalDeductions += mDeductions;
    totalFinalSalary += mFinalSalary;
    totalPaid += mPaid;

    monthlyRows.push({
      monthNumber: m + 1,
      monthName: monthNames[m],
      workingDays: mWorkingDays,
      actualHours: mActualHours,
      attendancePay: mAttendancePay,
      allowances: mAllowances,
      bonus: mBonus,
      deductions: mDeductions,
      finalSalary: mFinalSalary,
      paid: mPaid,
      outstanding: mOutstanding
    });
  }

  const yearlyTotals = {
    totalWorkingDays,
    totalActualHours: Number(totalActualHours.toFixed(2)),
    totalAttendancePay: Number(totalAttendancePay.toFixed(2)),
    totalAllowances: Number(totalAllowances.toFixed(2)),
    totalBonus: Number(totalBonus.toFixed(2)),
    totalDeductions: Number(totalDeductions.toFixed(2)),
    totalFinalSalary: Number(totalFinalSalary.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalOutstanding: Number(Math.max(0, totalFinalSalary - totalPaid).toFixed(2))
  };

  return { monthlyRows, yearlyTotals };
}

exports.getEmployeeYearlyReport = async (req, res) => {
  try {
    const { employeeId, year } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });

    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const targetYear = Number(year) || new Date().getFullYear();
    const { monthlyRows, yearlyTotals } = await fetchYearlyEmployeeData(employeeId, targetYear);

    res.json({
      success: true,
      employeeName: employee.name,
      employeeId: employee.employeeId,
      shopName: employee.assignedShop?.name || 'Pixx Shop',
      year: targetYear,
      monthlyRows,
      yearlyTotals
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to generate employee yearly report.');
  }
};

exports.exportEmployeeYearlyExcel = async (req, res) => {
  try {
    const { employeeId, year } = req.query;
    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const targetYear = Number(year) || new Date().getFullYear();
    const { monthlyRows, yearlyTotals } = await fetchYearlyEmployeeData(employeeId, targetYear);

    const workbook = await buildEmployeeYearlyExcel(employee.name, employee.employeeId, employee.assignedShop?.name, targetYear, monthlyRows, yearlyTotals);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'EmployeeYearly',
      details: `Exported Annual Report Excel for ${employee.name} (${targetYear})`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Annual_${employee.name}_${targetYear}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export employee yearly report Excel.');
  }
};

exports.exportEmployeeYearlyPDF = async (req, res) => {
  try {
    const { employeeId, year } = req.query;
    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const targetYear = Number(year) || new Date().getFullYear();
    const { monthlyRows, yearlyTotals } = await fetchYearlyEmployeeData(employeeId, targetYear);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'EmployeeYearly',
      details: `Exported Annual Report PDF for ${employee.name} (${targetYear})`,
      req
    });

    buildEmployeeYearlyPDF(res, employee.name, employee.employeeId, employee.assignedShop?.name, targetYear, monthlyRows, yearlyTotals, req.user?.name || 'Admin');
  } catch (error) {
    return sendServerError(res, error, 'Failed to export employee yearly report PDF.');
  }
};

// ============================================================
// 7. BONUS / COMMISSION REPORT
// ============================================================

exports.getBonusReport = async (req, res) => {
  try {
    const { employeeId, month, year, shopId } = req.query;
    const query = {};

    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    if (month) query.month = month;
    if (year) query.year = Number(year);
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;

    const bonuses = await Bonus.find(query).sort({ year: -1, month: 1, employeeName: 1 });

    const totalSales = Number(bonuses.reduce((sum, b) => sum + (b.salesAmount || 0), 0).toFixed(2));
    const totalBonus = Number(bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0).toFixed(2));

    res.json({
      success: true,
      count: bonuses.length,
      totals: { totalSales, totalBonus },
      bonuses
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve bonus report.');
  }
};

exports.getEmployeeBonusHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const bonuses = await Bonus.find({ employee: employeeId }).sort({ year: 1, month: 1, createdAt: 1 });
    const totalBonus = Number(bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0).toFixed(2));

    res.json({
      success: true,
      employee,
      totalBonus,
      bonuses
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve employee bonus history.');
  }
};

exports.exportCommissionExcel = async (req, res) => {
  try {
    const { month = 'Aug', year = 2026, employeeId, shopId } = req.query;
    const query = { month, year: Number(year) };
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;

    const bonuses = await Bonus.find(query).sort({ createdAt: 1 });
    const workbook = await buildCommissionExcel(bonuses, month, String(year));

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'Bonus',
      details: `Exported Commission Details Excel for ${month} ${year}`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Commission_Details_${month}_${year}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export Commission Excel.');
  }
};

exports.exportBonusPDF = async (req, res) => {
  try {
    const { month = 'Aug', year = 2026, employeeId, shopId } = req.query;
    const query = { month, year: Number(year) };
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;

    const bonuses = await Bonus.find(query).sort({ createdAt: 1 });
    const totals = {
      totalSales: bonuses.reduce((sum, b) => sum + (b.salesAmount || 0), 0),
      totalBonus: bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0)
    };

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'Bonus',
      details: `Exported Bonus PDF for ${month} ${year}`,
      req
    });

    buildBonusPDF(res, bonuses, month, year, totals, req.user?.name || 'Admin');
  } catch (error) {
    return sendServerError(res, error, 'Failed to export Bonus PDF.');
  }
};

// ============================================================
// 8. SHOP LABOUR HOURS REPORT & MONTHLY SUMMARY
// ============================================================

exports.getShopLabourHours = async (req, res) => {
  try {
    const { startDate, endDate, shopId, employeeId } = req.query;
    const query = { approvalStatus: { $in: ['Checked', 'Finalized'] } };

    if (startDate && endDate) {
      query.dateString = { $gte: startDate, $lte: endDate };
    }
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;

    const attendances = await Attendance.find(query).populate('employee').sort({ shopName: 1, employeeName: 1 });

    const shopLabourMap = {};
    attendances.forEach(a => {
      const sName = a.shopName || 'Shop';
      if (!shopLabourMap[sName]) {
        shopLabourMap[sName] = {
          shopId: a.shop,
          shopName: sName,
          employees: {},
          totalHours: 0,
          totalScheduledHours: 0,
          totalWageCost: 0,
          totalWorkingDays: 0,
          totalLateMinutes: 0
        };
      }

      const empId = a.employee ? (a.employee._id ? a.employee._id.toString() : a.employee.toString()) : a.employeeName;
      if (!shopLabourMap[sName].employees[empId]) {
        shopLabourMap[sName].employees[empId] = {
          employeeName: a.employeeName,
          employeeId: a.employeeId,
          workingDays: 0,
          scheduledHours: 0,
          hours: 0,
          lateMinutes: 0,
          wageCost: 0
        };
      }

      const empEntry = shopLabourMap[sName].employees[empId];
      if (a.status !== 'Absent') {
        empEntry.workingDays += 1;
        shopLabourMap[sName].totalWorkingDays += 1;
      }
      const sched = Number(a.scheduledHours) || 0;
      const act = Number(a.actualHours) || 0;
      const lMin = Number(a.lateMinutes) || 0;

      empEntry.scheduledHours = Number((Number(empEntry.scheduledHours || 0) + sched).toFixed(2));
      empEntry.hours = Number((Number(empEntry.hours || 0) + act).toFixed(2));
      empEntry.lateMinutes = Number(empEntry.lateMinutes || 0) + lMin;

      const effectiveWage = resolveDailyWage(a.dailyWage, a.employee?.dailyWage);
      const calcResult = calculateAttendanceRecord({
        dailyWage: effectiveWage,
        shiftStart: a.shiftStart || '09:00',
        shiftEnd: a.shiftEnd || '19:00',
        timeReached: a.timeReached || a.shiftStart || '09:00',
        workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
        status: a.status,
        gracePeriodMinutes: 15
      });
      const attPay = Number(calcResult.attendancePay) || 0;

      empEntry.wageCost = Number((Number(empEntry.wageCost || 0) + attPay).toFixed(2));

      shopLabourMap[sName].totalScheduledHours = Number((Number(shopLabourMap[sName].totalScheduledHours || 0) + sched).toFixed(2));
      shopLabourMap[sName].totalHours = Number((Number(shopLabourMap[sName].totalHours || 0) + act).toFixed(2));
      shopLabourMap[sName].totalLateMinutes = Number(shopLabourMap[sName].totalLateMinutes || 0) + lMin;
      shopLabourMap[sName].totalWageCost = Number((Number(shopLabourMap[sName].totalWageCost || 0) + attPay).toFixed(2));
    });

    const result = Object.values(shopLabourMap).map(s => ({
      ...s,
      employeeCount: Object.keys(s.employees).length,
      employees: Object.values(s.employees)
    }));

    const isAdmin = req.user.role === 'ADMIN';
    const grandTotals = {
      totalWorkingDays: result.reduce((sum, s) => sum + s.totalWorkingDays, 0),
      totalScheduledHours: Number(result.reduce((sum, s) => sum + s.totalScheduledHours, 0).toFixed(2)),
      totalActualHours: Number(result.reduce((sum, s) => sum + s.totalHours, 0).toFixed(2)),
      totalLateMinutes: result.reduce((sum, s) => sum + s.totalLateMinutes, 0),
      ...(isAdmin && {
        totalWageCost: Number(result.reduce((sum, s) => sum + s.totalWageCost, 0).toFixed(2))
      })
    };

    res.json({
      success: true,
      count: result.length,
      grandTotals,
      data: isAdmin ? result : result.map(({ totalWageCost, employees, ...shop }) => ({
        ...shop,
        employees: employees.map(({ wageCost, ...employee }) => employee)
      }))
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve shop labour hours.');
  }
};

exports.getMonthlyShopLabourSummary = async (req, res) => {
  try {
    const { month, year } = req.query;
    const targetYear = Number(year) || new Date().getFullYear();
    const targetMonth = month ? Number(month) : new Date().getMonth() + 1;

    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const monthEnd = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

    // Dynamic shops from DB
    const shops = await Shop.find({ isActive: true }).sort({ name: 1 });
    const shopSummaries = [];

    for (const shop of shops) {
      const attendances = await Attendance.find({
        shop: shop._id,
        dateString: { $gte: startStr, $lte: endStr },
        approvalStatus: { $in: ['Checked', 'Finalized'] }
      }).populate('employee');

      const uniqueWorkers = new Set(attendances.map(a => a.employee ? (a.employee._id ? a.employee._id.toString() : a.employee.toString()) : a.employeeName));
      const workingDays = attendances.filter(a => a.status !== 'Absent').length;
      const scheduledHours = Number(attendances.reduce((sum, a) => sum + (a.scheduledHours || 0), 0).toFixed(2));
      const actualHours = Number(attendances.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2));
      const lateDeductions = Number(attendances.reduce((sum, a) => {
        const effectiveWage = resolveDailyWage(a.dailyWage, a.employee?.dailyWage);
        const calcResult = calculateAttendanceRecord({
          dailyWage: effectiveWage,
          shiftStart: a.shiftStart || '09:00',
          shiftEnd: a.shiftEnd || '19:00',
          timeReached: a.timeReached || a.shiftStart || '09:00',
          workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
          status: a.status,
          gracePeriodMinutes: 15
        });
        return sum + calcResult.lateDeduction;
      }, 0).toFixed(2));
      const attendancePay = Number(attendances.reduce((sum, a) => {
        const effectiveWage = resolveDailyWage(a.dailyWage, a.employee?.dailyWage);
        const calcResult = calculateAttendanceRecord({
          dailyWage: effectiveWage,
          shiftStart: a.shiftStart || '09:00',
          shiftEnd: a.shiftEnd || '19:00',
          timeReached: a.timeReached || a.shiftStart || '09:00',
          workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
          status: a.status,
          gracePeriodMinutes: 15
        });
        return sum + calcResult.attendancePay;
      }, 0).toFixed(2));

      // Finalized salary cost where available
      const salaries = req.user.role === 'ADMIN'
        ? await WeeklySalary.find({
          shop: shop._id,
          status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
          weekEndDate: { $gte: monthStart, $lte: monthEnd }
        })
        : [];
      const finalizedSalaryCost = Number(salaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0).toFixed(2));

      shopSummaries.push({
        shopId: shop._id,
        shopName: shop.name,
        employees: uniqueWorkers.size,
        workingDays,
        scheduledHours,
        actualHours,
        lateDeductions,
        attendancePay,
        finalizedSalaryCost
      });
    }

    const isAdmin = req.user.role === 'ADMIN';
    const responseShops = isAdmin
      ? shopSummaries
      : shopSummaries.map(({ lateDeductions, attendancePay, finalizedSalaryCost, ...shop }) => shop);
    const grandTotals = {
      totalEmployees: shopSummaries.reduce((sum, s) => sum + s.employees, 0),
      totalWorkingDays: shopSummaries.reduce((sum, s) => sum + s.workingDays, 0),
      totalScheduledHours: Number(shopSummaries.reduce((sum, s) => sum + s.scheduledHours, 0).toFixed(2)),
      totalActualHours: Number(shopSummaries.reduce((sum, s) => sum + s.actualHours, 0).toFixed(2)),
      ...(isAdmin && {
        totalLateDeductions: Number(shopSummaries.reduce((sum, s) => sum + s.lateDeductions, 0).toFixed(2)),
        totalAttendancePay: Number(shopSummaries.reduce((sum, s) => sum + s.attendancePay, 0).toFixed(2)),
        totalFinalizedSalaryCost: Number(shopSummaries.reduce((sum, s) => sum + s.finalizedSalaryCost, 0).toFixed(2))
      })
    };

    res.json({
      success: true,
      month: targetMonth,
      year: targetYear,
      shopSummaries: responseShops,
      grandTotals
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve monthly shop labour summary.');
  }
};

exports.exportShopLabourExcel = async (req, res) => {
  try {
    const { startDate, endDate, shopId, employeeId } = req.query;
    const query = { approvalStatus: { $in: ['Checked', 'Finalized'] } };
    if (startDate && endDate) query.dateString = { $gte: startDate, $lte: endDate };
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;

    const attendances = await Attendance.find(query).populate('employee').sort({ shopName: 1, employeeName: 1 });
    const shopLabourMap = {};
    attendances.forEach(a => {
      const sName = a.shopName || 'Shop';
      if (!shopLabourMap[sName]) shopLabourMap[sName] = { shopName: sName, employees: {} };
      const empId = a.employee ? (a.employee._id ? a.employee._id.toString() : a.employee.toString()) : a.employeeName;
      if (!shopLabourMap[sName].employees[empId]) {
        shopLabourMap[sName].employees[empId] = {
          employeeName: a.employeeName,
          employeeId: a.employeeId,
          workingDays: 0,
          scheduledHours: 0,
          hours: 0,
          lateMinutes: 0,
          wageCost: 0
        };
      }
      const e = shopLabourMap[sName].employees[empId];
      if (a.status !== 'Absent') e.workingDays += 1;
      e.scheduledHours += (a.scheduledHours || 0);
      e.hours += (a.actualHours || 0);
      e.lateMinutes += (a.lateMinutes || 0);

      const effectiveWage = resolveDailyWage(a.dailyWage, a.employee?.dailyWage);
      const calcResult = calculateAttendanceRecord({
        dailyWage: effectiveWage,
        shiftStart: a.shiftStart || '09:00',
        shiftEnd: a.shiftEnd || '19:00',
        timeReached: a.timeReached || a.shiftStart || '09:00',
        workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
        status: a.status,
        gracePeriodMinutes: 15
      });
      e.wageCost += calcResult.attendancePay;
    });

    const shopData = Object.values(shopLabourMap).map(s => ({
      ...s,
      employees: Object.values(s.employees)
    }));

    const periodLabel = startDate && endDate ? `${startDate} to ${endDate}` : 'All Dates';
    const workbook = await buildShopLabourExcel(shopData, periodLabel, req.user.role === 'ADMIN');

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'ShopLabour',
      details: `Exported Shop Labour Excel for ${periodLabel}`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Shop_Labour_${periodLabel.replace(/\s+/g, '_')}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export Shop Labour Excel.');
  }
};

exports.exportShopLabourPDF = async (req, res) => {
  try {
    const { startDate, endDate, shopId, employeeId } = req.query;
    const query = { approvalStatus: { $in: ['Checked', 'Finalized'] } };
    if (startDate && endDate) query.dateString = { $gte: startDate, $lte: endDate };
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;

    const attendances = await Attendance.find(query).populate('employee').sort({ shopName: 1, employeeName: 1 });
    const shopLabourMap = {};
    attendances.forEach(a => {
      const sName = a.shopName || 'Shop';
      if (!shopLabourMap[sName]) shopLabourMap[sName] = { shopName: sName, employees: {} };
      const empId = a.employee ? (a.employee._id ? a.employee._id.toString() : a.employee.toString()) : a.employeeName;
      if (!shopLabourMap[sName].employees[empId]) {
        shopLabourMap[sName].employees[empId] = {
          employeeName: a.employeeName,
          employeeId: a.employeeId,
          workingDays: 0,
          scheduledHours: 0,
          hours: 0,
          lateMinutes: 0,
          wageCost: 0
        };
      }
      const e = shopLabourMap[sName].employees[empId];
      if (a.status !== 'Absent') e.workingDays += 1;
      e.scheduledHours += (a.scheduledHours || 0);
      e.hours += (a.actualHours || 0);
      e.lateMinutes += (a.lateMinutes || 0);

      const effectiveWage = resolveDailyWage(a.dailyWage, a.employee?.dailyWage);
      const calcResult = calculateAttendanceRecord({
        dailyWage: effectiveWage,
        shiftStart: a.shiftStart || '09:00',
        shiftEnd: a.shiftEnd || '19:00',
        timeReached: a.timeReached || a.shiftStart || '09:00',
        workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
        status: a.status,
        gracePeriodMinutes: 15
      });
      e.wageCost += calcResult.attendancePay;
    });

    const shopData = Object.values(shopLabourMap).map(s => ({
      ...s,
      employees: Object.values(s.employees)
    }));

    const periodLabel = startDate && endDate ? `${startDate} to ${endDate}` : 'All Dates';

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'ShopLabour',
      details: `Exported Shop Labour PDF for ${periodLabel}`,
      req
    });

    buildShopLabourPDF(res, shopData, periodLabel, req.user?.name || 'Admin', req.user.role === 'ADMIN');
  } catch (error) {
    return sendServerError(res, error, 'Failed to export Shop Labour PDF.');
  }
};

// ============================================================
// 9. SALARY PAYMENT REPORT & CASH VS BANK
// ============================================================

exports.getSalaryPaymentsReport = async (req, res) => {
  try {
    const { employeeId, shopId, startDate, endDate, paymentMethod, paymentStatus } = req.query;
    const query = {};

    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (startDate && endDate) {
      query.paymentDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const payments = await SalaryPayment.find(query)
      .populate('employee')
      .populate('weeklySalary')
      .sort({ paymentDate: -1, createdAt: -1 });

    const cashPayments = payments.filter(p => p.paymentMethod === 'Cash');
    const bankPayments = payments.filter(p => p.paymentMethod === 'Bank');

    const totals = {
      paymentCount: payments.length,
      cashCount: cashPayments.length,
      bankCount: bankPayments.length,
      cashTotal: Number(cashPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)),
      bankTotal: Number(bankPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)),
      totalPaid: Number(payments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2))
    };

    res.json({
      success: true,
      count: payments.length,
      totals,
      payments
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve salary payments report.');
  }
};

exports.getPaymentsSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};
    if (startDate && endDate) {
      query.paymentDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const payments = await SalaryPayment.find(query);
    const cash = payments.filter(p => p.paymentMethod === 'Cash');
    const bank = payments.filter(p => p.paymentMethod === 'Bank');

    const summary = {
      cash: {
        count: cash.length,
        totalAmount: Number(cash.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2))
      },
      bank: {
        count: bank.length,
        totalAmount: Number(bank.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2))
      },
      total: {
        count: payments.length,
        totalAmount: Number(payments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2))
      }
    };

    res.json({ success: true, summary });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve payments summary.');
  }
};

exports.exportSalaryPaymentsExcel = async (req, res) => {
  try {
    const { employeeId, shopId, startDate, endDate, paymentMethod } = req.query;
    const query = {};
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (startDate && endDate) query.paymentDate = { $gte: new Date(startDate), $lte: new Date(endDate) };

    const payments = await SalaryPayment.find(query).sort({ paymentDate: -1 });
    const cash = payments.filter(p => p.paymentMethod === 'Cash');
    const bank = payments.filter(p => p.paymentMethod === 'Bank');

    const totals = { totalPaid: payments.reduce((sum, p) => sum + (p.amount || 0), 0) };
    const cashBankSummary = {
      cashCount: cash.length,
      cashTotal: cash.reduce((sum, p) => sum + (p.amount || 0), 0),
      bankCount: bank.length,
      bankTotal: bank.reduce((sum, p) => sum + (p.amount || 0), 0)
    };

    const periodLabel = startDate && endDate ? `${startDate} to ${endDate}` : 'All Dates';
    const workbook = await buildPaymentsExcel(payments, periodLabel, totals, cashBankSummary);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'SalaryPayment',
      details: `Exported Salary Payments Excel for ${periodLabel}`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Salary_Payments_${periodLabel.replace(/\s+/g, '_')}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export salary payments Excel.');
  }
};

exports.exportSalaryPaymentsPDF = async (req, res) => {
  try {
    const { employeeId, shopId, startDate, endDate, paymentMethod } = req.query;
    const query = {};
    const eId = safeObjectId(employeeId);
    if (eId) query.employee = eId;
    const sId = safeObjectId(shopId);
    if (sId) query.shop = sId;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (startDate && endDate) query.paymentDate = { $gte: new Date(startDate), $lte: new Date(endDate) };

    const payments = await SalaryPayment.find(query).sort({ paymentDate: -1 });
    const cash = payments.filter(p => p.paymentMethod === 'Cash');
    const bank = payments.filter(p => p.paymentMethod === 'Bank');

    const totals = { totalPaid: payments.reduce((sum, p) => sum + (p.amount || 0), 0) };
    const cashBankSummary = {
      cashCount: cash.length,
      cashTotal: cash.reduce((sum, p) => sum + (p.amount || 0), 0),
      bankCount: bank.length,
      bankTotal: bank.reduce((sum, p) => sum + (p.amount || 0), 0)
    };

    const periodLabel = startDate && endDate ? `${startDate} to ${endDate}` : 'All Dates';

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'SalaryPayment',
      details: `Exported Salary Payments PDF for ${periodLabel}`,
      req
    });

    buildPaymentsPDF(res, payments, periodLabel, totals, cashBankSummary, req.user?.name || 'Admin');
  } catch (error) {
    return sendServerError(res, error, 'Failed to export salary payments PDF.');
  }
};

// ============================================================
// 10. SALARY LEDGER REPORT
// ============================================================

exports.getEmployeeLedger = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    // Ensure running balances are updated
    await recalculateEmployeeLedger(employeeId);

    const SYSTEM_START_DATE = new Date('2026-10-11T00:00:00.000Z');
    const query = {
      employee: employeeId,
      date: { $gte: SYSTEM_START_DATE }
    };
    if (startDate && endDate) {
      const parsedStart = new Date(startDate);
      query.date = {
        $gte: parsedStart > SYSTEM_START_DATE ? parsedStart : SYSTEM_START_DATE,
        $lte: new Date(endDate)
      };
    }

    const ledgerTransactions = await LedgerTransaction.find(query).sort({ date: 1, createdAt: 1 });

    const totalEarned = Number(ledgerTransactions.reduce((sum, t) => sum + (t.amountEarned || 0), 0).toFixed(2));
    const totalPaid = Number(ledgerTransactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0).toFixed(2));
    const outstanding = Number((totalEarned - totalPaid).toFixed(2));

    res.json({
      success: true,
      employee,
      summary: {
        openingBalance: employee.openingBalance || 0,
        totalEarned,
        totalPaid,
        outstanding
      },
      transactions: ledgerTransactions
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve employee ledger.');
  }
};

exports.exportEmployeeLedgerExcel = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    await recalculateEmployeeLedger(employeeId);
    const transactions = await LedgerTransaction.find({
      employee: employeeId,
      date: { $gte: new Date('2026-10-11T00:00:00.000Z') }
    }).sort({ date: 1, createdAt: 1 });
    const totalEarned = Number(transactions.reduce((sum, t) => sum + (t.amountEarned || 0), 0).toFixed(2));
    const totalPaid = Number(transactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0).toFixed(2));
    const summary = {
      openingBalance: employee.openingBalance || 0,
      totalEarned,
      totalPaid,
      outstanding: Number((totalEarned - totalPaid).toFixed(2))
    };

    const workbook = await buildLedgerExcel(employee, transactions, summary);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'Ledger',
      details: `Exported Ledger Excel for ${employee.name}`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Ledger_${employee.name.replace(/\s+/g, '_')}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export ledger Excel.');
  }
};

exports.exportEmployeeLedgerPDF = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    await recalculateEmployeeLedger(employeeId);
    const transactions = await LedgerTransaction.find({
      employee: employeeId,
      date: { $gte: new Date('2026-10-11T00:00:00.000Z') }
    }).sort({ date: 1, createdAt: 1 });
    const totalEarned = Number(transactions.reduce((sum, t) => sum + (t.amountEarned || 0), 0).toFixed(2));
    const totalPaid = Number(transactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0).toFixed(2));
    const summary = {
      openingBalance: employee.openingBalance || 0,
      totalEarned,
      totalPaid,
      outstanding: Number((totalEarned - totalPaid).toFixed(2))
    };

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'Ledger',
      details: `Exported Ledger PDF for ${employee.name}`,
      req
    });

    buildLedgerPDF(res, employee, transactions, summary, req.user?.name || 'Admin');
  } catch (error) {
    return sendServerError(res, error, 'Failed to export ledger PDF.');
  }
};

// ============================================================
// 11. COMPANY-WIDE PAYROLL SUMMARY & ANALYTICS
// ============================================================

function getWeeklySalaryShopShares(salary, shops) {
  const shopsByName = new Map(shops.map(shop => [shop.name.trim().toLowerCase(), shop._id.toString()]));
  const breakdown = salary.finalizationSnapshot?.attendanceBreakdown
    || salary.attendanceBreakdown
    || [];
  const attendancePayByShop = new Map();
  breakdown.forEach(record => {
    const shopId = shopsByName.get(String(record.shopName || '').trim().toLowerCase());
    if (!shopId) return;
    attendancePayByShop.set(
      shopId,
      (attendancePayByShop.get(shopId) || 0) + (Number(record.attendancePay) || 0)
    );
  });

  const totalAttendancePay = [...attendancePayByShop.values()].reduce((total, amount) => total + amount, 0);
  if (totalAttendancePay > 0) {
    return shops
      .filter(shop => attendancePayByShop.has(shop._id.toString()))
      .map(shop => ({
        shopId: shop._id.toString(),
        proportion: attendancePayByShop.get(shop._id.toString()) / totalAttendancePay
      }));
  }

  const primaryShopId = String(salary.shop?._id || salary.shop || '');
  return shops.some(shop => shop._id.toString() === primaryShopId)
    ? [{ shopId: primaryShopId, proportion: 1 }]
    : [];
}

function allocateWeeklySalaryValue(salary, shops, field, shopId) {
  const shares = getWeeklySalaryShopShares(salary, shops);
  const value = Number(salary[field]) || 0;
  if (shopId) {
    const share = shares.find(item => item.shopId === String(shopId));
    return share ? value * share.proportion : 0;
  }
  return value;
}

exports.getCompanyPayrollSummary = async (req, res) => {
  try {
    const { weekLabel, month, year, shopId } = req.query;
    const now = new Date(`${getUKDateString()}T12:00:00Z`);
    const targetYear = Number(year) || now.getUTCFullYear();
    const selectedWeekDate = weekLabel
      ? weekLabel.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/)?.[0] || getUKDateString()
      : getUKDateString();
    const week = getWeekRange(selectedWeekDate);
    const currentWeek = weekLabel || week.weekLabel;
    const sId = safeObjectId(shopId);

    // 1. Compute 6 months trend date range
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const sixMonthsAgoStr = `${sixMonthsAgo.getUTCFullYear()}-${String(sixMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}-01`;

    const salaryQuery = {
      status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
      $or: [
        { weekLabel: { $in: [week.weekLabel, week.legacyWeekLabel, currentWeek] } },
        { weekStartDateString: week.startDateString },
        { weekStartDate: { $gte: week.startDate, $lte: week.endDate } }
      ]
    };

    const targetMonthStr = month || now.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const bonusQuery = { month: targetMonthStr, year: targetYear };
    if (sId) bonusQuery.shop = sId;

    const weekAttendanceQuery = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ]
    };
    if (sId) weekAttendanceQuery.shop = sId;

    // 2. Run all queries in parallel with Promise.all
    const [
      activeEmployees,
      finalizedSalaries,
      shops,
      bonuses,
      weekAttendances,
      trendSalaries,
      trendPayments
    ] = await Promise.all([
      Employee.countDocuments({ employmentStatus: 'Active' }),
      WeeklySalary.find(salaryQuery).lean(),
      Shop.find({ isActive: true }).lean(),
      Bonus.find(bonusQuery).lean(),
      Attendance.find(weekAttendanceQuery).lean(),
      WeeklySalary.find({
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
        $or: [
          { weekEndDate: { $gte: sixMonthsAgo } },
          { weekEndDateString: { $gte: sixMonthsAgoStr } }
        ]
      }).lean(),
      SalaryPayment.find({
        $or: [
          { paymentDate: { $gte: sixMonthsAgo } },
          { createdAt: { $gte: sixMonthsAgo } }
        ]
      }).lean()
    ]);

    const selectedShopId = sId ? sId.toString() : null;
    const sumAllocated = field => Number(finalizedSalaries.reduce(
      (total, salary) => total + allocateWeeklySalaryValue(salary, shops, field, selectedShopId),
      0
    ).toFixed(2));
    const finalizedSalary = sumAllocated('finalSalary');
    const totalPaid = sumAllocated('totalPaid');
    const outstanding = sumAllocated('balanceRemaining');
    const attendancePay = sumAllocated('netAttendancePay');
    const allowances = Number(finalizedSalaries.reduce((total, salary) => (
      total + allocateWeeklySalaryValue(salary, shops, 'travelAllowance', selectedShopId)
      + allocateWeeklySalaryValue(salary, shops, 'otherAllowances', selectedShopId)
    ), 0).toFixed(2));
    const deductions = sumAllocated('manualDeductions');
    const totalBonuses = Number(bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0).toFixed(2));

    // 4. Weekly payroll cost by shop and attendance hours by actual work location.
    const salaryByShop = [];
    const labourHoursByShop = [];
    const salaryCostByShop = new Map();

    shops.forEach(sh => {
      salaryCostByShop.set(sh._id.toString(), 0);
    });

    finalizedSalaries.forEach(salary => {
      const shares = getWeeklySalaryShopShares(salary, shops);
      let allocatedCents = 0;
      shares.forEach((share, index) => {
        const amountCents = index === shares.length - 1
          ? Math.round((Number(salary.finalSalary) || 0) * 100) - allocatedCents
          : Math.round((Number(salary.finalSalary) || 0) * share.proportion * 100);
        allocatedCents += amountCents;
        salaryCostByShop.set(share.shopId, (salaryCostByShop.get(share.shopId) || 0) + amountCents / 100);
      });
    });

    const weeklyHoursByShop = new Map();
    weekAttendances.forEach(attendance => {
      const attendanceShopId = String(attendance.shop?._id || attendance.shop || '');
      if (!attendanceShopId) return;
      const totals = weeklyHoursByShop.get(attendanceShopId) || { scheduledHours: 0, actualHours: 0 };
      totals.scheduledHours += Number(attendance.scheduledHours) || 0;
      totals.actualHours += Number(attendance.actualHours) || 0;
      weeklyHoursByShop.set(attendanceShopId, totals);
    });
    const labourHours = Number([...weeklyHoursByShop.values()]
      .reduce((total, hours) => total + hours.actualHours, 0)
      .toFixed(2));
    shops.filter(shop => !selectedShopId || shop._id.toString() === selectedShopId).forEach(shop => {
      const hours = weeklyHoursByShop.get(shop._id.toString()) || { scheduledHours: 0, actualHours: 0 };
      salaryByShop.push({
        shopId: shop._id,
        shopName: shop.name,
        amount: Number((salaryCostByShop.get(shop._id.toString()) || 0).toFixed(2))
      });
      labourHoursByShop.push({
        shopId: shop._id,
        shopName: shop.name,
        scheduledHours: Number(hours.scheduledHours.toFixed(2)),
        actualHours: Number(hours.actualHours.toFixed(2))
      });
    });

    // 5. Current-week status counts
    const attendanceDistribution = {
      present: weekAttendances.filter(a => a.status === 'Present').length,
      late: weekAttendances.filter(a => a.status === 'Late').length,
      half: weekAttendances.filter(a => a.status === 'Half').length,
      absent: weekAttendances.filter(a => a.status === 'Absent').length
    };

    // 6. Monthly Salary Trend (last 6 months in memory from single query)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlySalaryTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const mName = monthNames[d.getUTCMonth()];
      const mYear = d.getUTCFullYear();
      const mStart = new Date(Date.UTC(mYear, d.getUTCMonth(), 1));
      const mEnd = new Date(Date.UTC(mYear, d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      const mPrefix = `${mYear}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

      const mSalaries = trendSalaries.filter(s => {
        if (s.weekEndDateString && s.weekEndDateString.startsWith(mPrefix)) return true;
        if (s.weekEndDate) {
          const dt = new Date(s.weekEndDate);
          return dt >= mStart && dt <= mEnd;
        }
        return false;
      });

      const mSalaryIds = new Set(mSalaries.map(s => String(s._id)));
      const mPayments = (trendPayments || []).filter(p => {
        if (p.weeklySalary && mSalaryIds.has(String(p.weeklySalary))) return true;
        if (p.paymentDate) {
          const dt = new Date(p.paymentDate);
          return dt >= mStart && dt <= mEnd;
        }
        return false;
      });

      const cashPaid = Number(mPayments
        .filter(p => String(p.paymentMethod || '').toLowerCase() === 'cash' && (!selectedShopId || String(p.shop) === selectedShopId))
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
        .toFixed(2));
      const bankPaid = Number(mPayments
        .filter(p => String(p.paymentMethod || '').toLowerCase() === 'bank' && (!selectedShopId || String(p.shop) === selectedShopId))
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
        .toFixed(2));

      const totalPaidVal = Number(mSalaries.reduce(
        (sum, salary) => sum + allocateWeeklySalaryValue(salary, shops, 'totalPaid', selectedShopId),
        0
      ).toFixed(2));

      let finalCash = cashPaid;
      let finalBank = bankPaid;
      if (totalPaidVal > 0 && finalCash === 0 && finalBank === 0) {
        finalCash = totalPaidVal;
      }

      monthlySalaryTrend.push({
        month: `${mName} '${String(mYear).slice(-2)}`,
        finalizedSalary: Number(mSalaries.reduce(
          (sum, salary) => sum + allocateWeeklySalaryValue(salary, shops, 'finalSalary', selectedShopId),
          0
        ).toFixed(2)),
        totalPaid: totalPaidVal,
        cashPaid: finalCash,
        bankPaid: finalBank
      });
    }

    res.json({
      success: true,
      currentWeek,
      cards: {
        finalizedSalary,
        totalPaid,
        outstanding,
        activeEmployees,
        labourHours,
        attendancePay,
        bonuses: totalBonuses,
        allowances,
        deductions
      },
      charts: {
        salaryByShop,
        labourHoursByShop,
        attendanceDistribution,
        monthlySalaryTrend
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve company payroll summary.');
  }
};

// ============================================================
// 8. SYSTEM DATABASE BACKUP & MONTH-END ARCHIVE (Admin only)
// ============================================================

async function getSystemBackupData(query = {}) {
  const { month, year, scope } = query;
  const now = new Date();

  let targetYear = year ? Number(year) : now.getFullYear();
  let targetMonth;
  const isAllTime = scope === 'all';

  const monthsMap = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };

  if (month === 'last') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    targetMonth = lastMonthDate.getMonth() + 1;
    targetYear = lastMonthDate.getFullYear();
  } else if (month && monthsMap[String(month).toLowerCase().slice(0, 3)]) {
    targetMonth = monthsMap[String(month).toLowerCase().slice(0, 3)];
  } else if (month && !isNaN(Number(month))) {
    targetMonth = Number(month);
  } else {
    targetMonth = now.getMonth() + 1;
  }

  let period;
  let startStr, endStr, monthStart, monthEnd, monthLabel;

  if (isAllTime) {
    period = {
      scope: 'all',
      targetYear,
      targetMonth,
      monthLabel: 'Full Lifetime',
      startStr: 'All Records',
      endStr: 'All Records'
    };
  } else {
    monthStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    monthEnd = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));
    const monthName = monthStart.toLocaleString('en-US', { timeZone: 'UTC', month: 'short' });
    monthLabel = `${monthName}-${String(targetYear).slice(-2)}`;
    startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    period = {
      scope: 'month',
      targetYear,
      targetMonth,
      monthName,
      monthLabel,
      startStr,
      endStr,
      monthStart,
      monthEnd
    };
  }

  // 1. Fetch Shops
  const rawShops = await Shop.find().sort({ name: 1 }).lean();
  const rawEmployees = await Employee.find().populate('assignedShop').sort({ name: 1 }).lean();

  const shops = rawShops.map(s => {
    const count = rawEmployees.filter(e => e.assignedShop && String(e.assignedShop._id || e.assignedShop) === String(s._id)).length;
    return {
      _id: s._id,
      name: s.name,
      address: s.address || '',
      phone: s.phone || '',
      status: s.status || 'Active',
      staffCount: count
    };
  });

  // 2. Fetch Ledger running balances for all employees
  const ledgerBalances = await Promise.all(rawEmployees.map(async emp => {
    const lastTx = await LedgerTransaction.findOne({ employee: emp._id }).sort({ date: -1, createdAt: -1 });
    const balance = lastTx ? Number(lastTx.runningBalance || 0) : Number(emp.openingBalance || 0);
    const allTx = await LedgerTransaction.find({ employee: emp._id });
    const totalEarned = allTx.reduce((sum, t) => sum + (Number(t.amountEarned) || 0), 0);
    const totalPaid = allTx.reduce((sum, t) => sum + (Number(t.amountPaid) || 0), 0);
    return {
      _id: emp._id,
      employeeId: emp.employeeId,
      employeeName: emp.name,
      shopName: emp.assignedShop?.name || 'Unassigned',
      dailyWage: emp.dailyWage || 0,
      role: emp.role || 'WORKER',
      status: emp.status || 'Active',
      openingBalance: emp.openingBalance || 0,
      currentBalance: balance,
      totalEarned,
      totalPaid
    };
  }));

  const employees = ledgerBalances.map(l => ({
    _id: l._id,
    employeeId: l.employeeId,
    name: l.employeeName,
    shopName: l.shopName,
    role: l.role,
    dailyWage: l.dailyWage,
    status: l.status,
    openingBalance: l.openingBalance,
    currentBalance: l.currentBalance
  }));

  // 3. Attendance Query
  const attQuery = isAllTime ? {} : { dateString: { $gte: startStr, $lte: endStr } };
  const rawAttendances = await Attendance.find(attQuery).populate('shop employee').sort({ dateString: 1 }).lean();

  // Aggregate attendance by worker
  const attMap = new Map();
  rawEmployees.forEach(emp => {
    attMap.set(String(emp._id), {
      employeeId: emp.employeeId,
      employeeName: emp.name,
      shopName: emp.assignedShop?.name || 'Unassigned',
      shiftsCount: 0,
      present: 0,
      late: 0,
      half: 0,
      absent: 0,
      hours: 0,
      lateDeductions: 0,
      attendancePay: 0
    });
  });

  rawAttendances.forEach(a => {
    const empKey = String(a.employee?._id || a.employee);
    if (!attMap.has(empKey)) {
      attMap.set(empKey, {
        employeeId: a.employeeId || '',
        employeeName: a.employeeName || 'Worker',
        shopName: a.shopName || a.shop?.name || 'Shop',
        shiftsCount: 0,
        present: 0,
        late: 0,
        half: 0,
        absent: 0,
        hours: 0,
        lateDeductions: 0,
        attendancePay: 0
      });
    }
    const item = attMap.get(empKey);
    item.shiftsCount += 1;
    if (a.status === 'Present') item.present += 1;
    else if (a.status === 'Late') item.late += 1;
    else if (a.status === 'Half') item.half += 1;
    else if (a.status === 'Absent') item.absent += 1;

    item.hours += Number(a.actualHours || 0);

    const wage = resolveDailyWage(a.dailyWage, a.employee?.dailyWage);
    let calc = { lateDeduction: 0, attendancePay: 0 };
    if (a.status !== 'Absent') {
      calc = calculateAttendanceRecord({
        dailyWage: wage,
        shiftStart: a.shiftStart || '09:00',
        shiftEnd: a.shiftEnd || '19:00',
        timeReached: a.timeReached || a.shiftStart || '09:00',
        workerEndTime: a.workerEndTime || a.shiftEnd || '19:00',
        status: a.status,
        gracePeriodMinutes: 15
      });
    }
    item.lateDeductions += calc.lateDeduction || 0;
    item.attendancePay += calc.attendancePay || 0;
  });

  const attendanceByWorker = Array.from(attMap.values()).filter(a => a.shiftsCount > 0);

  // 4. Weekly Salaries Query
  let salQuery = {};
  if (!isAllTime) {
    salQuery = {
      $or: [
        { weekEndDate: { $gte: monthStart, $lte: monthEnd } },
        { weekStartDate: { $gte: monthStart, $lte: monthEnd } }
      ]
    };
  }
  const rawSalaries = await WeeklySalary.find(salQuery).populate('employee shop').sort({ weekStartDate: 1 }).lean();

  const salaries = rawSalaries.map(s => {
    const weeklyWages = Number(s.attendanceSalary ?? (s.netAttendancePay || s.grossDailyWages || 0));
    const deductions = Number(s.manualDeductions || s.lateDeductions || 0);
    const allowances = Number((s.travelAllowance || 0) + (s.otherAllowances || 0));
    const openingBal = Number(s.openingBalance || 0);
    const bonus = Number(s.bonus || 0);
    const payable = Number(s.totalPayable || (weeklyWages + allowances + openingBal + bonus - deductions));
    const paid = Number(s.totalPaid || 0);
    const remaining = Number(s.balanceRemaining || 0);

    return {
      weekLabel: s.weekLabel,
      employeeName: s.employeeName,
      shopName: s.shopName,
      workingDays: s.workingDays || 0,
      attendanceSalary: weeklyWages,
      deductions,
      allowances,
      openingBalance: openingBal,
      bonus,
      totalPayable: payable,
      totalPaid: paid,
      balanceRemaining: remaining,
      status: s.status || (remaining === 0 ? 'PAID' : 'FINALIZED')
    };
  });

  // 5. Salary Payments Query
  let payQuery = {};
  if (!isAllTime) {
    payQuery = { paymentDate: { $gte: monthStart, $lte: monthEnd } };
  }
  const rawPayments = await SalaryPayment.find(payQuery).populate('employee').sort({ paymentDate: -1 }).lean();

  const payments = rawPayments.map(p => ({
    dateStr: p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-GB') : '',
    receiptId: p.clientReference || String(p._id).slice(-8).toUpperCase(),
    employeeName: p.employeeName || p.employee?.name || 'Worker',
    shopName: p.shopName || p.employee?.assignedShop?.name || 'Shop',
    paymentMethod: p.paymentMethod || 'Cash',
    amount: Number(p.amount || 0),
    deductionAmount: Number(p.deductionAmount || 0),
    paidBy: p.paidByName || 'Admin',
    notes: p.notes || '',
    status: 'COMPLETED'
  }));

  // 6. Summary Totals
  const totalWagesEarned = salaries.reduce((sum, s) => sum + s.attendanceSalary, 0) || attendanceByWorker.reduce((sum, a) => sum + a.attendancePay, 0);
  const totalAllowances = salaries.reduce((sum, s) => sum + s.allowances, 0);
  const totalBonus = salaries.reduce((sum, s) => sum + s.bonus, 0);
  const totalPayable = salaries.reduce((sum, s) => sum + s.totalPayable, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const cashTotal = payments.filter(p => String(p.paymentMethod).toLowerCase() === 'cash').reduce((sum, p) => sum + p.amount, 0);
  const bankTotal = payments.filter(p => String(p.paymentMethod).toLowerCase() === 'bank').reduce((sum, p) => sum + p.amount, 0);
  const totalRemaining = ledgerBalances.reduce((sum, l) => sum + l.currentBalance, 0);

  const summary = {
    totalEmployees: employees.length,
    activeEmployees: employees.filter(e => e.status === 'Active').length,
    totalShops: shops.length,
    activeShops: shops.filter(s => s.status === 'Active').length,
    totalAttendanceRecords: rawAttendances.length,
    totalWeeklySalaries: salaries.length,
    totalPaymentsCount: payments.length,
    totalWagesEarned,
    totalAllowances,
    totalBonus,
    totalPayable,
    totalPaid,
    cashTotal,
    bankTotal,
    totalRemaining,
    totalOutstandingLiability: totalRemaining
  };

  return {
    period,
    summary,
    shops,
    employees,
    attendanceByWorker,
    salaries,
    payments,
    ledgerBalances
  };
}

exports.getSystemBackupSummary = async (req, res) => {
  try {
    const backupData = await getSystemBackupData(req.query);
    res.json({
      success: true,
      period: backupData.period,
      summary: backupData.summary,
      shopsCount: backupData.shops.length,
      employeesCount: backupData.employees.length,
      attendanceCount: backupData.attendanceByWorker.length,
      salariesCount: backupData.salaries.length,
      paymentsCount: backupData.payments.length
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to generate system backup summary.');
  }
};

exports.exportSystemBackupPDF = async (req, res) => {
  try {
    const backupData = await getSystemBackupData(req.query);
    await logAction({
      user: req.user,
      action: 'SYSTEM_DATABASE_BACKUP_PDF',
      recordType: 'SystemBackup',
      details: `Generated complete system database backup PDF for ${backupData.period.monthLabel}`,
      req
    });
    await buildSystemBackupPDF(res, backupData, req.user?.name || 'Fahad Rasheed');
  } catch (error) {
    return sendServerError(res, error, 'Failed to export system database backup PDF.');
  }
};

exports.exportSystemBackupExcel = async (req, res) => {
  try {
    const backupData = await getSystemBackupData(req.query);
    const workbook = await buildSystemBackupExcel(backupData);
    await logAction({
      user: req.user,
      action: 'SYSTEM_DATABASE_BACKUP_EXCEL',
      recordType: 'SystemBackup',
      details: `Generated complete system database backup Excel for ${backupData.period.monthLabel}`,
      req
    });
    const filename = `Pixx_System_Database_Backup_${(backupData.period.monthLabel || 'All').replace(/[\/–\s]/g, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export system database backup Excel.');
  }
};
