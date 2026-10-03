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
  getShopColor,
  sortDailyAttendanceRecords
} = require('../utils/reports');
const { getWeekRange, formatUKDate, getUKDateString, calculateAttendanceRecord, safeObjectId, getDayOfWeekUK } = require('../utils/calc');
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
      const wage = (r.dailyWage && r.dailyWage > 0) ? r.dailyWage : (r.employee?.dailyWage || 50);
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
      const wage = (r.dailyWage && r.dailyWage > 0) ? r.dailyWage : (r.employee?.dailyWage || 50);
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
      const wage = (r.dailyWage && r.dailyWage > 0) ? r.dailyWage : (r.employee?.dailyWage || 50);
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
        path.join(__dirname, 'assets', filename)
      ];
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) return fs.readFileSync(p);
        } catch {}
      }
      return null;
    };
    const usmanSign = findAsset('usmansign.png');
    const sarfrazSign = findAsset('sarfrazsign.png');

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
      margin: 20,
      size: 'A4',
      layout: 'portrait',
      autoFirstPage: true
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    const PAGE_W = 555.28;
    const MARGIN_LEFT = 20;
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

    let curY = 18;

    // ── HEADER BANNER ──────────────────────────────────────────
    doc.rect(MARGIN_LEFT, curY, PAGE_W, 44).fill(DARK);
    doc.rect(MARGIN_LEFT, curY, 6, 44).fill(BLUE);

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
       .text('PIXX ROTA', MARGIN_LEFT + 14, curY + 8, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8')
       .text('PixxTechnologies UK  •  Daily Workforce Attendance', MARGIN_LEFT + 14, curY + 26, { lineBreak: false });

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
       .text(formattedDate, MARGIN_LEFT + 200, curY + 8, { width: PAGE_W - 210, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor('#38bdf8')
       .text(shopDoc ? `Shop: ${shopDoc.name}` : 'Times in 12-Hour UK Format  •  All Active Shops', MARGIN_LEFT + 200, curY + 25, { width: PAGE_W - 210, align: 'right', lineBreak: false });

    curY += 48;

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
      doc.roundedRect(kx, curY, kpiW, 32, 4).fillAndStroke('#f8fafc', LIGHT_BORDER);
      doc.rect(kx, curY, kpiW, 2.5).fill(kpi.color);

      doc.fillColor(kpi.color).font('Helvetica-Bold').fontSize(12)
         .text(String(kpi.value), kx, curY + 5, { width: kpiW, align: 'center', lineBreak: false });
      doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(6)
         .text(kpi.label, kx, curY + 21, { width: kpiW, align: 'center', lineBreak: false });
    });

    curY += 37;

    const drawContinuationBanner = () => {
      doc.rect(MARGIN_LEFT, 18, PAGE_W, 24).fill(DARK);
      doc.rect(MARGIN_LEFT, 18, 5, 24).fill(BLUE);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
         .text('PIXX ROTA  •  DAILY ATTENDANCE (CONTINUED)', MARGIN_LEFT + 12, 26, { lineBreak: false });
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
         .text(formattedDate, MARGIN_LEFT + 250, 26, { width: PAGE_W - 258, align: 'right', lineBreak: false });
    };

    // ── DRAW SHOP SECTIONS ──────────────────────────────────────
    for (const shopName of sortedShopNames) {
      const group = shopGroups[shopName];
      const isAbsentGroup = shopName === 'ABSENT / OFF';
      const sc = getShopColor(isAbsentGroup ? 'ABSENT / OFF' : shopName);

      const sectionHeaderH = 16;
      const tableHeaderH = 13;
      const rowH = 19.5;

      // Check if we need page break
      if (curY + sectionHeaderH + tableHeaderH + rowH > doc.page.height - 45) {
        doc.addPage({ margin: 20, size: 'A4', layout: 'portrait' });
        drawContinuationBanner();
        curY = 48;
      }

      // 1. Shop Header Bar
      const headerBg = isAbsentGroup ? '#991b1b' : (sc.primary || '#1e293b');
      doc.roundedRect(MARGIN_LEFT, curY, PAGE_W, sectionHeaderH, 3).fill(headerBg);
      doc.circle(MARGIN_LEFT + 8, curY + 8, 2.5).fill('#ffffff');

      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
         .text(
           isAbsentGroup ? 'ABSENT / OFF DUTY' : `${shopName.toUpperCase()} CYCLES`,
           MARGIN_LEFT + 15,
           curY + 4,
           { lineBreak: false }
         );

      const countText = isAbsentGroup
        ? `${group.length} Staff Off / Absent`
        : `${group.length} ${group.length === 1 ? 'Worker' : 'Workers'} on Duty`;

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
         .text(countText, MARGIN_LEFT + 300, curY + 4.5, { width: PAGE_W - 308, align: 'right', lineBreak: false });

      curY += sectionHeaderH;

      // 2. Table Column Headers
      doc.rect(MARGIN_LEFT, curY, PAGE_W, tableHeaderH).fill(isAbsentGroup ? '#fee2e2' : '#f1f5f9');
      doc.fillColor(isAbsentGroup ? '#991b1b' : '#334155').font('Helvetica-Bold').fontSize(6.5);

      if (!isAbsentGroup) {
        doc.text('#', MARGIN_LEFT + 2, curY + 3.5, { width: 18, align: 'center', lineBreak: false });
        doc.text('WORKER NAME', MARGIN_LEFT + 24, curY + 3.5, { width: 146, lineBreak: false });
        doc.text('SCHEDULED SHIFT', MARGIN_LEFT + 174, curY + 3.5, { width: 90, align: 'center', lineBreak: false });
        doc.fillColor('#1d4ed8').text('ARRIVAL (TIME COME)', MARGIN_LEFT + 268, curY + 3.5, { width: 106, align: 'center', lineBreak: false });
        doc.fillColor('#334155');
        doc.text('LEFT AT', MARGIN_LEFT + 378, curY + 3.5, { width: 60, align: 'center', lineBreak: false });
        doc.text('WORKED', MARGIN_LEFT + 442, curY + 3.5, { width: 44, align: 'center', lineBreak: false });
        doc.text('STATUS', MARGIN_LEFT + 488, curY + 3.5, { width: 64, align: 'center', lineBreak: false });
      } else {
        doc.text('#', MARGIN_LEFT + 2, curY + 3.5, { width: 18, align: 'center', lineBreak: false });
        doc.text('WORKER NAME', MARGIN_LEFT + 24, curY + 3.5, { width: 165, lineBreak: false });
        doc.text('ASSIGNED SHOP', MARGIN_LEFT + 195, curY + 3.5, { width: 130, align: 'left', lineBreak: false });
        doc.text('STATUS', MARGIN_LEFT + 330, curY + 3.5, { width: 90, align: 'center', lineBreak: false });
        doc.text('NOTES / REMARKS', MARGIN_LEFT + 425, curY + 3.5, { width: 125, align: 'left', lineBreak: false });
      }

      curY += tableHeaderH;

      // 3. Table Rows
      group.forEach((r, idx) => {
        if (curY + rowH > doc.page.height - 40) {
          doc.addPage({ margin: 20, size: 'A4', layout: 'portrait' });
          drawContinuationBanner();
          curY = 48;

          doc.rect(MARGIN_LEFT, curY, PAGE_W, tableHeaderH).fill(isAbsentGroup ? '#fee2e2' : '#f1f5f9');
          doc.fillColor(isAbsentGroup ? '#991b1b' : '#334155').font('Helvetica-Bold').fontSize(6.5);
          if (!isAbsentGroup) {
            doc.text('#', MARGIN_LEFT + 2, curY + 3.5, { width: 18, align: 'center', lineBreak: false });
            doc.text('WORKER NAME', MARGIN_LEFT + 24, curY + 3.5, { width: 146, lineBreak: false });
            doc.text('SCHEDULED SHIFT', MARGIN_LEFT + 174, curY + 3.5, { width: 90, align: 'center', lineBreak: false });
            doc.fillColor('#1d4ed8').text('ARRIVAL (TIME COME)', MARGIN_LEFT + 268, curY + 3.5, { width: 106, align: 'center', lineBreak: false });
            doc.fillColor('#334155');
            doc.text('LEFT AT', MARGIN_LEFT + 378, curY + 3.5, { width: 60, align: 'center', lineBreak: false });
            doc.text('WORKED', MARGIN_LEFT + 442, curY + 3.5, { width: 44, align: 'center', lineBreak: false });
            doc.text('STATUS', MARGIN_LEFT + 488, curY + 3.5, { width: 64, align: 'center', lineBreak: false });
          } else {
            doc.text('#', MARGIN_LEFT + 2, curY + 3.5, { width: 18, align: 'center', lineBreak: false });
            doc.text('WORKER NAME', MARGIN_LEFT + 24, curY + 3.5, { width: 165, lineBreak: false });
            doc.text('ASSIGNED SHOP', MARGIN_LEFT + 195, curY + 3.5, { width: 130, align: 'left', lineBreak: false });
            doc.text('STATUS', MARGIN_LEFT + 330, curY + 3.5, { width: 90, align: 'center', lineBreak: false });
            doc.text('NOTES / REMARKS', MARGIN_LEFT + 425, curY + 3.5, { width: 125, align: 'left', lineBreak: false });
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

        if (!isAbsentGroup) {
          doc.fillColor(SLATE).font('Helvetica').fontSize(7)
             .text(String(idx + 1), MARGIN_LEFT + 2, curY + 5.5, { width: 18, align: 'center', lineBreak: false });

          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8)
             .text(r.employeeName || 'Unknown', MARGIN_LEFT + 24, curY + 5.5, { width: 146, lineBreak: false });

          const shiftStr = (r.shiftStart && r.shiftEnd)
            ? `${formatTime12hPadded(r.shiftStart)} - ${formatTime12hPadded(r.shiftEnd)}`
            : '--';
          doc.fillColor('#475569').font('Helvetica').fontSize(6.5)
             .text(shiftStr, MARGIN_LEFT + 174, curY + 6, { width: 90, align: 'center', lineBreak: false });

          // ARRIVAL (TIME COME) - PROMINENT FOR BOSS
          const isLate = r.status === 'Late' || (r.lateMinutes && r.lateMinutes > 0);
          if (r.timeReached) {
            const reachedStr = formatTime12hPadded(r.timeReached);
            if (isLate) {
              const lateBadgeText = r.lateMinutes ? `(+${r.lateMinutes}m)` : '(Late)';
              doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(7.5)
                 .text(`${reachedStr}  ${lateBadgeText}`, MARGIN_LEFT + 268, curY + 5.5, { width: 106, align: 'center', lineBreak: false });
            } else {
              doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(7.5)
                 .text(`${reachedStr}  (On Time)`, MARGIN_LEFT + 268, curY + 5.5, { width: 106, align: 'center', lineBreak: false });
            }
          } else {
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(7)
               .text('--', MARGIN_LEFT + 268, curY + 5.5, { width: 106, align: 'center', lineBreak: false });
          }

          const leftStr = r.workerEndTime ? formatTime12hPadded(r.workerEndTime) : '--';
          doc.fillColor('#475569').font('Helvetica').fontSize(7)
             .text(leftStr, MARGIN_LEFT + 378, curY + 5.5, { width: 60, align: 'center', lineBreak: false });

          const workedStr = (r.actualHours !== undefined && r.actualHours !== null)
            ? `${Number(r.actualHours).toFixed(1)}h`
            : '--';
          doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7)
             .text(workedStr, MARGIN_LEFT + 442, curY + 5.5, { width: 44, align: 'center', lineBreak: false });

          // Status Badge Pill
          const pillX = MARGIN_LEFT + 490;
          const pillY = curY + 3;
          const pillW = 60;
          const pillH = 13.5;

          let pillBg = '#dcfce7';
          let pillFg = '#166534';
          let pillLabel = 'PRESENT';

          if (r.status === 'Late') {
            pillBg = '#fef3c7'; pillFg = '#b45309'; pillLabel = 'LATE';
          } else if (r.status === 'Half') {
            pillBg = '#e0f2fe'; pillFg = '#0369a1'; pillLabel = 'HALF DAY';
          } else if (r.status === 'Absent') {
            pillBg = '#fee2e2'; pillFg = '#991b1b'; pillLabel = 'ABSENT';
          }

          doc.roundedRect(pillX, pillY, pillW, pillH, 5).fill(pillBg);
          doc.fillColor(pillFg).font('Helvetica-Bold').fontSize(6)
             .text(pillLabel, pillX, pillY + 3.5, { width: pillW, align: 'center', lineBreak: false });

        } else {
          // Absent row
          doc.fillColor('#991b1b').font('Helvetica').fontSize(7)
             .text(String(idx + 1), MARGIN_LEFT + 2, curY + 5.5, { width: 18, align: 'center', lineBreak: false });

          doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(8)
             .text(r.employeeName || 'Unknown', MARGIN_LEFT + 24, curY + 5.5, { width: 165, lineBreak: false });

          doc.fillColor('#64748b').font('Helvetica').fontSize(7)
             .text('Not Assigned', MARGIN_LEFT + 195, curY + 5.5, { width: 130, lineBreak: false });

          const pillX = MARGIN_LEFT + 340;
          const pillY = curY + 3;
          const pillW = 68;
          const pillH = 13.5;
          doc.roundedRect(pillX, pillY, pillW, pillH, 5).fill('#fee2e2');
          doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(6)
             .text('ABSENT / OFF', pillX, pillY + 3.5, { width: pillW, align: 'center', lineBreak: false });

          doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(6.5)
             .text(r.remarks || 'Scheduled day off', MARGIN_LEFT + 425, curY + 5.5, { width: 125, lineBreak: false });
        }

        curY += rowH;
      });

      curY += 4;
    }

    // ── SIGNATURES / VERIFICATION SECTION ─────────────────────
    const sigNeededH = 65;
    if (curY + sigNeededH > doc.page.height - 30) {
      doc.addPage({ margin: 20, size: 'A4', layout: 'portrait' });
      drawContinuationBanner();
      curY = 48;
    }

    curY += 4;
    const sigBoxW = (PAGE_W - 14) / 2;
    const sigBoxH = 58;

    // Box 1: Usman (Operator)
    doc.roundedRect(MARGIN_LEFT, curY, sigBoxW, sigBoxH, 4).fillAndStroke('#ffffff', LIGHT_BORDER);
    doc.rect(MARGIN_LEFT, curY, sigBoxW, 14).fill('#f1f5f9');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7)
       .text('SUBMITTED BY (ATTENDANCE OPERATOR)', MARGIN_LEFT + 8, curY + 3.5, { lineBreak: false });

    if (usmanSign) {
      try { doc.image(usmanSign, MARGIN_LEFT + 8, curY + 16, { fit: [85, 26] }); } catch (e) {}
    }
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7.5)
       .text('Usman Salahuddin', MARGIN_LEFT + 100, curY + 20, { lineBreak: false });
    doc.fillColor(SLATE).font('Helvetica').fontSize(6)
       .text('Attendance Operator  •  PixxTechnologies UK', MARGIN_LEFT + 100, curY + 32, { lineBreak: false });

    // Box 2: Sarfraz (Checker)
    const rightX = MARGIN_LEFT + sigBoxW + 14;
    doc.roundedRect(rightX, curY, sigBoxW, sigBoxH, 4).fillAndStroke('#ffffff', LIGHT_BORDER);
    doc.rect(rightX, curY, sigBoxW, 14).fill('#f1f5f9');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7)
       .text('VERIFIED BY (ATTENDANCE CHECKER)', rightX + 8, curY + 3.5, { lineBreak: false });

    if (sarfrazSign) {
      try { doc.image(sarfrazSign, rightX + 8, curY + 16, { fit: [85, 26] }); } catch (e) {}
    }
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7.5)
       .text('Sarfraz Khan', rightX + 100, curY + 20, { lineBreak: false });
    doc.fillColor(SLATE).font('Helvetica').fontSize(6)
       .text('Attendance Checker  •  PixxTechnologies UK', rightX + 100, curY + 32, { lineBreak: false });

    curY += sigBoxH + 4;

    // Bottom footer: turn off bottom margin auto-page-break
    doc.page.margins.bottom = 0;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(6)
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

  (attendances || []).forEach(a => {
    if (!a) return;
    const empObj = a.employee;
    const empKey = empObj
      ? (empObj._id ? empObj._id.toString() : empObj.toString())
      : (a.employeeId || a.employeeName || (a._id ? a._id.toString() : 'unknown'));

    const empName = a.employeeName || (empObj && empObj.name) || 'Worker';
    const sName = a.shopName || (a.shop && a.shop.name) || 'Shop';

    if (!empMap[empKey]) {
      empMap[empKey] = {
        employee: empObj ? (empObj._id || empObj) : null,
        employeeName: empName,
        shopId: a.shop ? (a.shop._id || a.shop) : null,
        shopName: sName,
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

    if (a.status !== 'Absent') rec.workingDays += 1;
    if (a.status === 'Present' || a.status === 'Late') rec.presentDays += 1;
    if (a.status === 'Late') rec.lateDays += 1;
    else if (a.status === 'Half') rec.halfDays += 1;
    else if (a.status === 'Absent') rec.absentDays += 1;

    const sched = Number(a.scheduledHours) || 0;
    const act = Number(a.actualHours) || 0;
    const lMin = Number(a.lateMinutes) || 0;

    rec.scheduledHours = Number((Number(rec.scheduledHours || 0) + sched).toFixed(2));
    rec.actualHours = Number((Number(rec.actualHours || 0) + act).toFixed(2));
    rec.lateMinutes = Number(rec.lateMinutes || 0) + lMin;
  });

  const records = Object.values(empMap);
  const summary = {
    totalEmployees: records.length,
    totalWorkingDays: records.reduce((sum, r) => sum + (Number(r.workingDays) || 0), 0),
    totalPresent: records.reduce((sum, r) => sum + (Number(r.presentDays) || 0), 0),
    totalLate: records.reduce((sum, r) => sum + (Number(r.lateDays) || 0), 0),
    totalHalf: records.reduce((sum, r) => sum + (Number(r.halfDays) || 0), 0),
    totalAbsent: records.reduce((sum, r) => sum + (Number(r.absentDays) || 0), 0),
    totalScheduledHours: Number(records.reduce((sum, r) => sum + (Number(r.scheduledHours) || 0), 0).toFixed(2)),
    totalWorkedHours: Number(records.reduce((sum, r) => sum + (Number(r.actualHours) || 0), 0).toFixed(2)),
    totalLateMinutes: records.reduce((sum, r) => sum + (Number(r.lateMinutes) || 0), 0)
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

  const query = {
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
            status: 'Calculated'
          };
        }
        const rec = empMap[key];
        const effectiveWage = (Number(a.dailyWage) && Number(a.dailyWage) > 0) ? Number(a.dailyWage) : (Number(a.employee?.dailyWage) || 50);
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
    const { salaries, targetWeekLabel } = await fetchWeeklySalariesWithFallback(req.query);

    const totals = {
      count: salaries.length,
      totalAttendancePay: Number(salaries.reduce((sum, s) => sum + (Number(s.netAttendancePay) || 0), 0).toFixed(2)),
      totalAllowances: Number(salaries.reduce((sum, s) => sum + (Number(s.travelAllowance) || 0) + (Number(s.otherAllowances) || 0), 0).toFixed(2)),
      totalBonus: Number(salaries.reduce((sum, s) => sum + (Number(s.bonus) || 0), 0).toFixed(2)),
      totalDeductions: Number(salaries.reduce((sum, s) => sum + (Number(s.manualDeductions) || 0), 0).toFixed(2)),
      totalFinalSalary: Number(salaries.reduce((sum, s) => sum + (Number(s.finalSalary) || 0), 0).toFixed(2)),
      totalPaid: Number(salaries.reduce((sum, s) => sum + (Number(s.totalPaid) || 0), 0).toFixed(2)),
      totalOutstanding: Number(salaries.reduce((sum, s) => sum + (Number(s.balanceRemaining) || 0), 0).toFixed(2))
    };

    res.json({
      success: true,
      weekLabel: targetWeekLabel,
      count: salaries.length,
      totals,
      salaries
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch weekly salary report.');
  }
};

exports.exportWeeklySalaryExcel = async (req, res) => {
  try {
    const { salaries, targetWeekLabel } = await fetchWeeklySalariesWithFallback(req.query);
    const totals = {
      totalAttendancePay: Number(salaries.reduce((sum, s) => sum + (Number(s.netAttendancePay) || 0), 0).toFixed(2)),
      totalAllowances: Number(salaries.reduce((sum, s) => sum + (Number(s.travelAllowance) || 0) + (Number(s.otherAllowances) || 0), 0).toFixed(2)),
      totalBonus: Number(salaries.reduce((sum, s) => sum + (Number(s.bonus) || 0), 0).toFixed(2)),
      totalDeductions: Number(salaries.reduce((sum, s) => sum + (Number(s.manualDeductions) || 0), 0).toFixed(2)),
      totalFinalSalary: Number(salaries.reduce((sum, s) => sum + (Number(s.finalSalary) || 0), 0).toFixed(2)),
      totalPaid: Number(salaries.reduce((sum, s) => sum + (Number(s.totalPaid) || 0), 0).toFixed(2)),
      totalOutstanding: Number(salaries.reduce((sum, s) => sum + (Number(s.balanceRemaining) || 0), 0).toFixed(2))
    };

    const workbook = await buildWeeklySalaryExcel(salaries, targetWeekLabel, totals);

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
    const { salaries, targetWeekLabel } = await fetchWeeklySalariesWithFallback(req.query);
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

    await buildWeeklySalaryPDF(res, salaries, targetWeekLabel, totals, req.user?.name || 'Admin');
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
      const wage = (Number(r.dailyWage) && Number(r.dailyWage) > 0) ? Number(r.dailyWage) : (Number(r.employee?.dailyWage) || 50);
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
      const wage = (Number(r.dailyWage) && Number(r.dailyWage) > 0) ? Number(r.dailyWage) : (Number(r.employee?.dailyWage) || 50);
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
      const wage = (Number(r.dailyWage) && Number(r.dailyWage) > 0) ? Number(r.dailyWage) : (Number(r.employee?.dailyWage) || 50);
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

exports.getEmployeeYearlyReport = async (req, res) => {
  try {
    const { employeeId, year } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });

    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const targetYear = Number(year) || new Date().getFullYear();
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
      const monthStart = new Date(Date.UTC(targetYear, m, 1));
      const monthEnd = new Date(Date.UTC(targetYear, m + 1, 0, 23, 59, 59, 999));
      const startStr = `${targetYear}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, m + 1, 0).getDate();
      const endStr = `${targetYear}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Attendance in month
      const monthAttendances = await Attendance.find({
        employee: employeeId,
        dateString: { $gte: startStr, $lte: endStr }
      });

      const mWorkingDays = monthAttendances.filter(a => a.status !== 'Absent').length;
      const mActualHours = Number(monthAttendances.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2));
      const mAttendancePay = Number(monthAttendances.reduce((sum, a) => sum + (a.attendancePay || 0), 0).toFixed(2));

      // Finalized weekly salaries overlapping month end date
      const monthSalaries = await WeeklySalary.find({
        employee: employeeId,
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
        weekEndDate: { $gte: monthStart, $lte: monthEnd }
      });

      const mAllowances = Number(monthSalaries.reduce((sum, s) => sum + (s.travelAllowance || 0) + (s.otherAllowances || 0), 0).toFixed(2));
      const mBonus = Number(monthSalaries.reduce((sum, s) => sum + (s.bonus || 0), 0).toFixed(2));
      const mDeductions = Number(monthSalaries.reduce((sum, s) => sum + (s.manualDeductions || 0), 0).toFixed(2));
      const mFinalSalary = Number(monthSalaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0).toFixed(2));

      // Payments in month
      const monthPayments = await SalaryPayment.find({
        employee: employeeId,
        paymentDate: { $gte: monthStart, $lte: monthEnd }
      });
      const mPaid = Number(monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2));
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
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyRows = [];
    let totDays = 0, totHours = 0, totAtt = 0, totAllow = 0, totBonus = 0, totDed = 0, totFinal = 0, totPaid = 0;

    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(Date.UTC(targetYear, m, 1));
      const monthEnd = new Date(Date.UTC(targetYear, m + 1, 0, 23, 59, 59, 999));
      const startStr = `${targetYear}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, m + 1, 0).getDate();
      const endStr = `${targetYear}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const atts = await Attendance.find({ employee: employeeId, dateString: { $gte: startStr, $lte: endStr } });
      const wDays = atts.filter(a => a.status !== 'Absent').length;
      const hours = Number(atts.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2));
      const attPay = Number(atts.reduce((sum, a) => {
        const wage = (a.dailyWage && a.dailyWage > 0) ? a.dailyWage : (a.employee?.dailyWage || 50);
        if (a.status === 'Absent') return sum;
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

      const sals = await WeeklySalary.find({
        employee: employeeId,
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
        weekEndDate: { $gte: monthStart, $lte: monthEnd }
      });
      const allow = sals.reduce((sum, s) => sum + (s.travelAllowance || 0) + (s.otherAllowances || 0), 0);
      const bon = sals.reduce((sum, s) => sum + (s.bonus || 0), 0);
      const ded = sals.reduce((sum, s) => sum + (s.manualDeductions || 0), 0);
      const fin = sals.reduce((sum, s) => sum + (s.finalSalary || 0), 0);

      const pays = await SalaryPayment.find({ employee: employeeId, paymentDate: { $gte: monthStart, $lte: monthEnd } });
      const paid = pays.reduce((sum, p) => sum + (p.amount || 0), 0);

      totDays += wDays;
      totHours += hours;
      totAtt += attPay;
      totAllow += allow;
      totBonus += bon;
      totDed += ded;
      totFinal += fin;
      totPaid += paid;

      monthlyRows.push({
        monthName: monthNames[m],
        workingDays: wDays,
        actualHours: hours,
        attendancePay: attPay,
        allowances: allow,
        bonus: bon,
        deductions: ded,
        finalSalary: fin,
        paid,
        outstanding: Math.max(0, fin - paid)
      });
    }

    const yearlyTotals = {
      totalWorkingDays: totDays,
      totalActualHours: totHours,
      totalAttendancePay: totAtt,
      totalAllowances: totAllow,
      totalBonus: totBonus,
      totalDeductions: totDed,
      totalFinalSalary: totFinal,
      totalPaid: totPaid,
      totalOutstanding: Math.max(0, totFinal - totPaid)
    };

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
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyRows = [];
    let totDays = 0, totHours = 0, totAtt = 0, totAllow = 0, totBonus = 0, totDed = 0, totFinal = 0, totPaid = 0;

    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(Date.UTC(targetYear, m, 1));
      const monthEnd = new Date(Date.UTC(targetYear, m + 1, 0, 23, 59, 59, 999));
      const startStr = `${targetYear}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(targetYear, m + 1, 0).getDate();
      const endStr = `${targetYear}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const atts = await Attendance.find({ employee: employeeId, dateString: { $gte: startStr, $lte: endStr } });
      const wDays = atts.filter(a => a.status !== 'Absent').length;
      const hours = Number(atts.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2));
      const attPay = Number(atts.reduce((sum, a) => {
        const wage = (a.dailyWage && a.dailyWage > 0) ? a.dailyWage : (a.employee?.dailyWage || 50);
        if (a.status === 'Absent') return sum;
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

      const sals = await WeeklySalary.find({
        employee: employeeId,
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
        weekEndDate: { $gte: monthStart, $lte: monthEnd }
      });
      const allow = sals.reduce((sum, s) => sum + (s.travelAllowance || 0) + (s.otherAllowances || 0), 0);
      const bon = sals.reduce((sum, s) => sum + (s.bonus || 0), 0);
      const ded = sals.reduce((sum, s) => sum + (s.manualDeductions || 0), 0);
      const fin = sals.reduce((sum, s) => sum + (s.finalSalary || 0), 0);

      const pays = await SalaryPayment.find({ employee: employeeId, paymentDate: { $gte: monthStart, $lte: monthEnd } });
      const paid = pays.reduce((sum, p) => sum + (p.amount || 0), 0);

      totDays += wDays;
      totHours += hours;
      totAtt += attPay;
      totAllow += allow;
      totBonus += bon;
      totDed += ded;
      totFinal += fin;
      totPaid += paid;

      monthlyRows.push({
        monthName: monthNames[m],
        workingDays: wDays,
        actualHours: hours,
        attendancePay: attPay,
        allowances: allow,
        bonus: bon,
        deductions: ded,
        finalSalary: fin,
        paid,
        outstanding: Math.max(0, fin - paid)
      });
    }

    const yearlyTotals = {
      totalWorkingDays: totDays,
      totalActualHours: totHours,
      totalAttendancePay: totAtt,
      totalAllowances: totAllow,
      totalBonus: totBonus,
      totalDeductions: totDed,
      totalFinalSalary: totFinal,
      totalPaid: totPaid,
      totalOutstanding: Math.max(0, totFinal - totPaid)
    };

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

      const effectiveWage = (Number(a.dailyWage) && Number(a.dailyWage) > 0) ? Number(a.dailyWage) : (Number(a.employee?.dailyWage) || 50);
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
        const effectiveWage = (a.dailyWage && a.dailyWage > 0) ? a.dailyWage : (a.employee?.dailyWage || 50);
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
        const effectiveWage = (a.dailyWage && a.dailyWage > 0) ? a.dailyWage : (a.employee?.dailyWage || 50);
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

      const effectiveWage = (a.dailyWage && a.dailyWage > 0) ? a.dailyWage : (a.employee?.dailyWage || 50);
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

      const effectiveWage = (a.dailyWage && a.dailyWage > 0) ? a.dailyWage : (a.employee?.dailyWage || 50);
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

    const query = { employee: employeeId };
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const ledgerTransactions = await LedgerTransaction.find(query).sort({ date: 1, createdAt: 1 });

    const totalEarned = Number(ledgerTransactions.reduce((sum, t) => sum + (t.amountEarned || 0), 0).toFixed(2));
    const totalPaid = Number(ledgerTransactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0).toFixed(2));
    const outstanding = Number(Math.max(0, totalEarned - totalPaid).toFixed(2));

    res.json({
      success: true,
      employee,
      summary: {
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

    const transactions = await LedgerTransaction.find({ employee: employeeId }).sort({ date: 1, createdAt: 1 });
    const totalEarned = transactions.reduce((sum, t) => sum + (t.amountEarned || 0), 0);
    const totalPaid = transactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0);
    const summary = {
      totalEarned,
      totalPaid,
      outstanding: Math.max(0, totalEarned - totalPaid)
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

    const transactions = await LedgerTransaction.find({ employee: employeeId }).sort({ date: 1, createdAt: 1 });
    const totalEarned = transactions.reduce((sum, t) => sum + (t.amountEarned || 0), 0);
    const totalPaid = transactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0);
    const summary = {
      totalEarned,
      totalPaid,
      outstanding: Math.max(0, totalEarned - totalPaid)
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

exports.getCompanyPayrollSummary = async (req, res) => {
  try {
    const { weekLabel, month, year, shopId } = req.query;
    const now = new Date();
    const targetYear = Number(year) || now.getFullYear();
    const currentWeek = weekLabel || getWeekRange(now).weekLabel;
    const sId = safeObjectId(shopId);

    // 1. Active workforce
    const activeEmployees = await Employee.countDocuments({ employmentStatus: 'Active' });

    // 2. Finalized payroll query
    const salaryQuery = {
      status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] }
    };
    if (weekLabel) {
      const alt = weekLabel.includes(' – ') ? weekLabel.replace(' – ', ' to ') : weekLabel.replace(' to ', ' – ');
      salaryQuery.weekLabel = { $in: [weekLabel, alt] };
    }
    if (sId) salaryQuery.shop = sId;

    const finalizedSalaries = await WeeklySalary.find(salaryQuery);
    const finalizedSalary = Number(finalizedSalaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0).toFixed(2));
    const totalPaid = Number(finalizedSalaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0).toFixed(2));
    const outstanding = Number(finalizedSalaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0).toFixed(2));
    const attendancePay = Number(finalizedSalaries.reduce((sum, s) => sum + (s.netAttendancePay || 0), 0).toFixed(2));
    const allowances = Number(finalizedSalaries.reduce((sum, s) => sum + (s.travelAllowance || 0) + (s.otherAllowances || 0), 0).toFixed(2));
    const deductions = Number(finalizedSalaries.reduce((sum, s) => sum + (s.manualDeductions || 0), 0).toFixed(2));
    const labourHours = Number(finalizedSalaries.reduce((sum, s) => sum + (s.actualHours || 0), 0).toFixed(2));

    // 3. Bonuses for the month
    const targetMonthStr = month || now.toLocaleString('en-US', { month: 'short' });
    const bonusQuery = { month: targetMonthStr, year: targetYear };
    if (sId) bonusQuery.shop = sId;
    const bonuses = await Bonus.find(bonusQuery);
    const totalBonuses = Number(bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0).toFixed(2));

    // 4. Visual Analytics: Salary by Shop & Labour Hours by Shop
    const shops = await Shop.find({ isActive: true });
    const salaryByShop = [];
    const labourHoursByShop = [];

    shops.forEach(sh => {
      const shSalaries = finalizedSalaries.filter(s => s.shop?.toString() === sh._id.toString());
      const shSched = shSalaries.reduce((sum, s) => sum + (s.scheduledHours || 0), 0);
      const shActual = shSalaries.reduce((sum, s) => sum + (s.actualHours || 0), 0);
      const shCost = shSalaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0);

      salaryByShop.push({
        shopId: sh._id,
        shopName: sh.name,
        amount: Number(shCost.toFixed(2))
      });

      labourHoursByShop.push({
        shopId: sh._id,
        shopName: sh.name,
        scheduledHours: Number(shSched.toFixed(2)),
        actualHours: Number(shActual.toFixed(2))
      });
    });

    // 5. Attendance Status distribution (current week or recent)
    const week = getWeekRange(now);
    const weekAttendances = await Attendance.find({
      dateString: { $gte: week.startDateString, $lte: week.endDateString }
    });
    const attendanceDistribution = {
      present: weekAttendances.filter(a => a.status === 'Present').length,
      late: weekAttendances.filter(a => a.status === 'Late').length,
      half: weekAttendances.filter(a => a.status === 'Half').length,
      absent: weekAttendances.filter(a => a.status === 'Absent').length
    };

    // 6. Monthly Salary Trend (last 6 months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlySalaryTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = monthNames[d.getMonth()];
      const mYear = d.getFullYear();
      const mStart = new Date(Date.UTC(mYear, d.getMonth(), 1));
      const mEnd = new Date(Date.UTC(mYear, d.getMonth() + 1, 0, 23, 59, 59, 999));

      const mSalaries = await WeeklySalary.find({
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
        weekEndDate: { $gte: mStart, $lte: mEnd }
      });

      monthlySalaryTrend.push({
        month: `${mName} '${String(mYear).slice(-2)}`,
        finalizedSalary: Number(mSalaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0).toFixed(2)),
        totalPaid: Number(mSalaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0).toFixed(2))
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
