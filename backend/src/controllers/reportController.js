const Attendance = require('../models/Attendance');
const { sendServerError } = require('../utils/httpErrors');
const WeeklySalary = require('../models/WeeklySalary');
const SalaryPayment = require('../models/SalaryPayment');
const Bonus = require('../models/Bonus');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const LedgerTransaction = require('../models/LedgerTransaction');
const PDFDocument = require('pdfkit');
const {
  usmanSignBase64,
  sarfrazSignBase64
} = require('../assets/signatureData');
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
  buildLedgerPDF
} = require('../utils/reports');
const { getWeekRange, formatUKDate, getUKDateString } = require('../utils/calc');
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

    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;
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

    const shopDoc = shopId ? await Shop.findById(shopId) : null;
    const shopName = shopDoc ? shopDoc.name : 'All Shops';

    const responseRecords = req.user.role === 'ATTENDANCE_OPERATOR'
      ? records.map(attendanceOperatorRecord)
      : req.user.role === 'ATTENDANCE_CHECKER'
        ? records.map(attendanceCheckerRecord)
        : records;
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

    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;
    if (status) query.status = status;
    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const records = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });
    const workbook = await buildDailyAttendanceExcel(records, formatUKDate(dateStr));
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

    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;
    if (status) query.status = status;
    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const records = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });
    const shopDoc = shopId ? await Shop.findById(shopId) : null;

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'DailyAttendance',
      details: `Exported Daily Attendance PDF for ${dateStr}`,
      req
    });

    const usmanSign = Buffer.from(usmanSignBase64, 'base64');
    const sarfrazSign = Buffer.from(sarfrazSignBase64, 'base64');

    // Group records by shop
    const shopGroups = {};
    records.forEach(r => {
      const sName = r.status === 'Absent' ? 'ABSENT / OFF' : (r.shopName || 'Unknown Shop');
      if (!shopGroups[sName]) shopGroups[sName] = [];
      shopGroups[sName].push(r);
    });

    // Sort: real shops first, then absent group last
    const sortedShopNames = Object.keys(shopGroups).sort((a, b) => {
      if (a === 'ABSENT / OFF') return 1;
      if (b === 'ABSENT / OFF') return -1;
      return a.localeCompare(b);
    });

    const totalPresent = records.filter(r => r.status === 'Present').length;
    const totalLate = records.filter(r => r.status === 'Late').length;
    const totalHalf = records.filter(r => r.status === 'Half').length;
    const totalAbsent = records.filter(r => r.status === 'Absent').length;

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${attendanceReportFilename(shopDoc?.name || 'All-Shops', dateStr, 'pdf')}"`
    );
    doc.pipe(res);

    // ── COLOUR PALETTE ─────────────────────────────────────
    const DARK    = '#0f172a';
    const BLUE    = '#2563eb';
    const SLATE   = '#64748b';
    const GREEN   = '#16a34a';
    const AMBER   = '#d97706';
    const RED     = '#dc2626';
    const SKY     = '#0284c7';
    const LIGHT   = '#f8fafc';
    const BORDER  = '#e2e8f0';
    const PAGE_W  = doc.page.width - 60;

    // ── HEADER BANNER ──────────────────────────────────────
    doc.rect(30, 30, PAGE_W, 64).fill(DARK);
    doc.rect(30, 30, 7, 64).fill(BLUE);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
       .text('PIXX ROTA', 50, 38, { align: 'left' });
    doc.font('Helvetica').fontSize(10).fillColor('#cbd5e1')
       .text('PixxTechnologies UK  |  Daily Worker Attendance', 50, 65);

    // Date + shop badge top-right
    const dateLabel = formatUKDate(dateStr);
    const shopLabel = shopDoc ? shopDoc.name : 'All Shops';
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
       .text(`REPORT DATE  ${dateLabel}`, 30, 42, { align: 'right', width: PAGE_W - 16 });
    doc.font('Helvetica').fontSize(9).fillColor('#cbd5e1')
       .text(`SHOP  ${shopLabel}`, 30, 64, { align: 'right', width: PAGE_W - 16 });

    let curY = 108;

    // ── SUMMARY STAT BOXES ─────────────────────────────────
    const stats = [
      { label: 'Total Staff', value: records.length, color: BLUE },
      { label: 'Present',     value: totalPresent,   color: GREEN },
      { label: 'Late',        value: totalLate,      color: AMBER },
      { label: 'Half Day',    value: totalHalf,      color: SKY },
      { label: 'Absent',      value: totalAbsent,    color: RED },
    ];
    const boxW = PAGE_W / stats.length;
    stats.forEach((s, i) => {
      const bx = 30 + i * boxW;
      doc.rect(bx, curY, boxW - 4, 44).fill(LIGHT).stroke(BORDER);
      doc.fillColor(s.color).font('Helvetica-Bold').fontSize(18)
         .text(String(s.value), bx + 4, curY + 5, { width: boxW - 12, align: 'center' });
      doc.fillColor(SLATE).font('Helvetica').fontSize(8)
         .text(s.label, bx + 4, curY + 27, { width: boxW - 12, align: 'center' });
    });
    curY += 56;

    const drawContinuationBanner = () => {
      doc.rect(30, 30, PAGE_W, 30).fill(DARK);
      doc.rect(30, 30, 6, 30).fill(BLUE);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
        .text('PIXX ROTA  |  DAILY WORKER ATTENDANCE', 44, 39);
      doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9)
        .text(dateLabel, 30, 39, { width: PAGE_W - 16, align: 'right' });
    };

    const drawSectionHeader = (shopName, isAbsentGroup, continued = false) => {
      doc.rect(30, curY, PAGE_W, 22).fill(isAbsentGroup ? '#7f1d1d' : DARK);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
        .text(
          isAbsentGroup
            ? 'ABSENT / OFF DUTY - NO SHOP ASSIGNED'
            : `${shopName.toUpperCase()}${continued ? ' (CONTINUED)' : ''}`,
          38,
          curY + 6,
          { width: PAGE_W - 16 }
        );
      curY += 22;
    };

    const drawColumnHeader = isAbsentGroup => {
      doc.rect(30, curY, PAGE_W, 16).fill(isAbsentGroup ? '#fee2e2' : '#dbeafe');
      doc.fillColor(isAbsentGroup ? '#991b1b' : DARK).font('Helvetica-Bold').fontSize(8);
      doc.text('#', 35, curY + 4, { width: 20 });
      doc.text('Worker', 58, curY + 4, { width: isAbsentGroup ? 190 : 157 });
      doc.text('Employee ID', isAbsentGroup ? 255 : 222, curY + 4, { width: isAbsentGroup ? 100 : 74 });
      if (isAbsentGroup) {
        doc.text('Attendance', 365, curY + 4, { width: PAGE_W - 345 });
      } else {
        doc.text('Shift', 303, curY + 4, { width: 98 });
        doc.text('Arrival', 408, curY + 4, { width: 62 });
        doc.text('Leave', 477, curY + 4, { width: 62 });
        doc.text('Status', 546, curY + 4, { width: 80 });
        doc.text('Notes', 633, curY + 4, { width: PAGE_W - 603 });
      }
      curY += 16;
    };

    // ── SHOP SECTIONS ─────────────────────────────────────
    for (const shopName of sortedShopNames) {
      const group = shopGroups[shopName];
      const isAbsentGroup = shopName === 'ABSENT / OFF';

      // New page guard
      if (curY > doc.page.height - 160) {
        doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
        drawContinuationBanner();
        curY = 72;
      }

      drawSectionHeader(shopName, isAbsentGroup);
      drawColumnHeader(isAbsentGroup);

      // Rows
      group.forEach((r, idx) => {
        if (curY > doc.page.height - 80) {
          doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
          drawContinuationBanner();
          curY = 72;
          drawSectionHeader(shopName, isAbsentGroup, true);
          drawColumnHeader(isAbsentGroup);
        }

        const rowBg = idx % 2 === 0 ? '#ffffff' : LIGHT;
        doc.rect(30, curY, PAGE_W, 15).fill(rowBg);
        doc.fillColor(DARK).font('Helvetica').fontSize(8.5);

        if (!isAbsentGroup) {
          // Status colour
          let statusColor = GREEN;
          if (r.status === 'Late')   statusColor = AMBER;
          if (r.status === 'Half')   statusColor = SKY;
          if (r.status === 'Absent') statusColor = RED;

          doc.text(String(idx + 1),                     35, curY + 3, { width: 20 });
          doc.text((r.employeeName || '').slice(0, 27), 58, curY + 3, { width: 157 });
          doc.text(r.employeeId || '',                 222, curY + 3, { width: 74 });
          doc.text(`${formatTime12Hour(r.shiftStart) || '--'} - ${formatTime12Hour(r.shiftEnd) || '--'}`, 303, curY + 3, { width: 98 });
          doc.text(formatTime12Hour(r.timeReached) || '--', 408, curY + 3, { width: 62 });
          doc.text(formatTime12Hour(r.workerEndTime) || '--', 477, curY + 3, { width: 62 });
          doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(8)
             .text(r.status || 'Present',              546, curY + 3, { width: 80 });
          doc.fillColor(SLATE).font('Helvetica').fontSize(7.5)
             .text((r.remarks || '').slice(0, 48),     633, curY + 3, { width: PAGE_W - 603 });
        } else {
          doc.text(String(idx + 1), 35, curY + 3, { width: 20 });
          doc.fillColor(RED).font('Helvetica-Bold').fontSize(8.5)
             .text((r.employeeName || '').slice(0, 32), 58, curY + 3, { width: 190 });
          doc.fillColor(SLATE).font('Helvetica').fontSize(8)
             .text(r.employeeId || '', 255, curY + 3, { width: 100 });
          doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(8)
             .text('ABSENT / OFF', 365, curY + 3, { width: PAGE_W - 345 });
        }

        doc.fillColor(BORDER)
           .moveTo(30, curY + 15).lineTo(30 + PAGE_W, curY + 15).stroke();
        curY += 15;
      });

      curY += 8; // gap between shop sections
    }

    // ── SIGNATURES SECTION ─────────────────────────────────
    const signatureSpaceNeeded = 130;
    if (curY > doc.page.height - signatureSpaceNeeded - 20) {
      doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
      drawContinuationBanner();
      curY = 76;
    }

    curY += 20;
    doc.moveTo(30, curY).lineTo(30 + PAGE_W, curY).strokeColor(BORDER).lineWidth(1).stroke();
    curY += 10;

    // Two signature boxes
    const sigBoxW = PAGE_W / 2 - 10;

    // Left: Usman (Submitted by)
    doc.rect(30, curY, sigBoxW, 92).fillAndStroke('#ffffff', BORDER);
    doc.fillColor(SLATE).font('Helvetica').fontSize(8)
       .text('SUBMITTED BY (ATTENDANCE OPERATOR)', 36, curY + 6, { width: sigBoxW - 12 });
    try {
      doc.image(usmanSign, 36, curY + 18, { fit: [130, 42] });
    } catch (e) {
      console.warn('Failed to embed Usman signature:', e.message);
    }
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
       .text('Usman', 36, curY + 64, { width: sigBoxW - 12 });
    doc.fillColor(SLATE).font('Helvetica').fontSize(7.5)
       .text('Attendance Operator  |  PixxTechnologies UK', 36, curY + 77, { width: sigBoxW - 12 });

    // Right: Sarfraz (Verified by)
    const rightX = 30 + sigBoxW + 20;
    doc.rect(rightX, curY, sigBoxW, 92).fillAndStroke('#ffffff', BORDER);
    doc.fillColor(SLATE).font('Helvetica').fontSize(8)
       .text('VERIFIED BY (ATTENDANCE CHECKER)', rightX + 6, curY + 6, { width: sigBoxW - 12 });
    try {
      doc.image(sarfrazSign, rightX + 6, curY + 18, { fit: [130, 42] });
    } catch (e) {
      console.warn('Failed to embed Sarfraz signature:', e.message);
    }
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
       .text('Sarfraz Khan', rightX + 6, curY + 64, { width: sigBoxW - 12 });
    doc.fillColor(SLATE).font('Helvetica').fontSize(7.5)
       .text('Attendance Checker  |  PixxTechnologies UK', rightX + 6, curY + 77, { width: sigBoxW - 12 });

    curY += 102;

    // ── FOOTER ─────────────────────────────────────────────
    doc.fillColor(SLATE).font('Helvetica').fontSize(7.5)
       .text(
         `Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}  |  PixxTechnologies Rota System`,
         30, curY, { width: PAGE_W, align: 'center' }
       );

    doc.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to generate PDF.');
  }
};

// ============================================================
// 2. WEEKLY ATTENDANCE REPORT (Monday -> Sunday)
// ============================================================

exports.getWeeklyAttendanceReport = async (req, res) => {
  try {
    const { weekLabel, date, shopId, employeeId } = req.query;
    const week = getWeekRange(date || new Date());
    const targetWeekLabel = weekLabel || week.weekLabel;

    const query = {
      dateString: { $gte: week.startDateString, $lte: week.endDateString }
    };
    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;

    const attendances = await Attendance.find(query).sort({ shopName: 1, employeeName: 1, dateString: 1 });

    const empMap = {};
    attendances.forEach(a => {
      const key = a.employee ? a.employee.toString() : a.employeeName;
      if (!empMap[key]) {
        empMap[key] = {
          employee: a.employee,
          employeeId: a.employeeId,
          employeeName: a.employeeName,
          shopId: a.shop,
          shopName: a.shopName,
          workingDays: 0,
          presentDays: 0,
          lateDays: 0,
          halfDays: 0,
          absentDays: 0,
          scheduledHours: 0,
          actualHours: 0,
          lateMinutes: 0,
          lateDeduction: 0,
          attendancePay: 0
        };
      }

      const rec = empMap[key];
      if (a.status !== 'Absent') rec.workingDays += 1;
      if (a.status === 'Present') rec.presentDays += 1;
      else if (a.status === 'Late') rec.lateDays += 1;
      else if (a.status === 'Half') rec.halfDays += 1;
      else if (a.status === 'Absent') rec.absentDays += 1;

      rec.scheduledHours = Number((rec.scheduledHours + (a.scheduledHours || 0)).toFixed(2));
      rec.actualHours = Number((rec.actualHours + (a.actualHours || 0)).toFixed(2));
      rec.lateMinutes += (a.lateMinutes || 0);
      rec.lateDeduction = Number((rec.lateDeduction + (a.lateDeduction || 0)).toFixed(2));
      rec.attendancePay = Number((rec.attendancePay + (a.attendancePay || 0)).toFixed(2));
    });

    const records = Object.values(empMap);

    const summary = {
      totalEmployees: records.length,
      totalWorkingDays: records.reduce((sum, r) => sum + r.workingDays, 0),
      totalPresent: records.reduce((sum, r) => sum + r.presentDays, 0),
      totalLate: records.reduce((sum, r) => sum + r.lateDays, 0),
      totalHalf: records.reduce((sum, r) => sum + r.halfDays, 0),
      totalAbsent: records.reduce((sum, r) => sum + r.absentDays, 0),
      totalScheduledHours: Number(records.reduce((sum, r) => sum + r.scheduledHours, 0).toFixed(2)),
      totalWorkedHours: Number(records.reduce((sum, r) => sum + r.actualHours, 0).toFixed(2)),
      totalLateMinutes: records.reduce((sum, r) => sum + r.lateMinutes, 0),
      totalLateDeductions: Number(records.reduce((sum, r) => sum + r.lateDeduction, 0).toFixed(2)),
      totalAttendancePay: Number(records.reduce((sum, r) => sum + r.attendancePay, 0).toFixed(2))
    };

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
    const week = getWeekRange(date || new Date());
    const targetWeekLabel = weekLabel || week.weekLabel;

    const query = {
      dateString: { $gte: week.startDateString, $lte: week.endDateString }
    };
    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;

    const attendances = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });
    const empMap = {};
    attendances.forEach(a => {
      const key = a.employee ? a.employee.toString() : a.employeeName;
      if (!empMap[key]) {
        empMap[key] = {
          employeeId: a.employeeId,
          employeeName: a.employeeName,
          shopName: a.shopName,
          workingDays: 0,
          presentDays: 0,
          lateDays: 0,
          halfDays: 0,
          absentDays: 0,
          scheduledHours: 0,
          actualHours: 0,
          lateMinutes: 0,
          lateDeduction: 0,
          attendancePay: 0
        };
      }
      const rec = empMap[key];
      if (a.status !== 'Absent') rec.workingDays += 1;
      if (a.status === 'Present') rec.presentDays += 1;
      else if (a.status === 'Late') rec.lateDays += 1;
      else if (a.status === 'Half') rec.halfDays += 1;
      else if (a.status === 'Absent') rec.absentDays += 1;
      rec.scheduledHours += (a.scheduledHours || 0);
      rec.actualHours += (a.actualHours || 0);
      rec.lateMinutes += (a.lateMinutes || 0);
      rec.lateDeduction += (a.lateDeduction || 0);
      rec.attendancePay += (a.attendancePay || 0);
    });

    const records = Object.values(empMap);
    const summary = {
      totalWorkingDays: records.reduce((sum, r) => sum + r.workingDays, 0),
      totalPresent: records.reduce((sum, r) => sum + r.presentDays, 0),
      totalLate: records.reduce((sum, r) => sum + r.lateDays, 0),
      totalHalf: records.reduce((sum, r) => sum + r.halfDays, 0),
      totalAbsent: records.reduce((sum, r) => sum + r.absentDays, 0),
      totalScheduledHours: records.reduce((sum, r) => sum + r.scheduledHours, 0),
      totalWorkedHours: records.reduce((sum, r) => sum + r.actualHours, 0),
      totalLateMinutes: records.reduce((sum, r) => sum + r.lateMinutes, 0),
      totalLateDeductions: records.reduce((sum, r) => sum + r.lateDeduction, 0),
      totalAttendancePay: records.reduce((sum, r) => sum + r.attendancePay, 0)
    };

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
    const week = getWeekRange(date || new Date());
    const targetWeekLabel = weekLabel || week.weekLabel;

    const query = {
      dateString: { $gte: week.startDateString, $lte: week.endDateString }
    };
    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;

    const attendances = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });
    const empMap = {};
    attendances.forEach(a => {
      const key = a.employee ? a.employee.toString() : a.employeeName;
      if (!empMap[key]) {
        empMap[key] = {
          employeeId: a.employeeId,
          employeeName: a.employeeName,
          shopName: a.shopName,
          workingDays: 0,
          presentDays: 0,
          lateDays: 0,
          halfDays: 0,
          absentDays: 0,
          scheduledHours: 0,
          actualHours: 0,
          lateMinutes: 0,
          lateDeduction: 0,
          attendancePay: 0
        };
      }
      const rec = empMap[key];
      if (a.status !== 'Absent') rec.workingDays += 1;
      if (a.status === 'Present') rec.presentDays += 1;
      else if (a.status === 'Late') rec.lateDays += 1;
      else if (a.status === 'Half') rec.halfDays += 1;
      else if (a.status === 'Absent') rec.absentDays += 1;
      rec.scheduledHours += (a.scheduledHours || 0);
      rec.actualHours += (a.actualHours || 0);
      rec.lateMinutes += (a.lateMinutes || 0);
      rec.lateDeduction += (a.lateDeduction || 0);
      rec.attendancePay += (a.attendancePay || 0);
    });

    const records = Object.values(empMap);
    const summary = {
      totalWorkingDays: records.reduce((sum, r) => sum + r.workingDays, 0),
      totalWorkedHours: records.reduce((sum, r) => sum + r.actualHours, 0),
      totalLateDeductions: records.reduce((sum, r) => sum + r.lateDeduction, 0),
      totalAttendancePay: records.reduce((sum, r) => sum + r.attendancePay, 0)
    };

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'WeeklyAttendance',
      details: `Exported Weekly Attendance PDF for ${targetWeekLabel}`,
      req
    });

    buildWeeklyAttendancePDF(res, records, targetWeekLabel, summary, req.user?.name || 'Admin');
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

exports.getWeeklySalaryReport = async (req, res) => {
  try {
    const { weekLabel, date, shopId, employeeId, status, paymentStatus } = req.query;
    const query = {};

    if (weekLabel) {
      const altLabel = weekLabel.includes(' – ') ? weekLabel.replace(' – ', ' to ') : weekLabel.replace(' to ', ' – ');
      query.weekLabel = { $in: [weekLabel, altLabel] };
    } else if (date) {
      const week = getWeekRange(date);
      query.weekLabel = { $in: [week.weekLabel, week.legacyWeekLabel] };
    }

    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;
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

    const salaries = await WeeklySalary.find(query)
      .populate('employee')
      .populate('shop')
      .sort({ shopName: 1, employeeName: 1 });

    const totals = {
      count: salaries.length,
      totalAttendancePay: Number(salaries.reduce((sum, s) => sum + (s.netAttendancePay || 0), 0).toFixed(2)),
      totalAllowances: Number(salaries.reduce((sum, s) => sum + (s.travelAllowance || 0) + (s.otherAllowances || 0), 0).toFixed(2)),
      totalBonus: Number(salaries.reduce((sum, s) => sum + (s.bonus || 0), 0).toFixed(2)),
      totalDeductions: Number(salaries.reduce((sum, s) => sum + (s.manualDeductions || 0), 0).toFixed(2)),
      totalFinalSalary: Number(salaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0).toFixed(2)),
      totalPaid: Number(salaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0).toFixed(2)),
      totalOutstanding: Number(salaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0).toFixed(2))
    };

    res.json({
      success: true,
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
    const { weekLabel, date, shopId, employeeId, status } = req.query;
    const targetWeek = weekLabel || getWeekRange(date || new Date()).weekLabel;
    const query = {};
    if (weekLabel) {
      const altLabel = weekLabel.includes(' – ') ? weekLabel.replace(' – ', ' to ') : weekLabel.replace(' to ', ' – ');
      query.weekLabel = { $in: [weekLabel, altLabel] };
    }
    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;
    if (status) query.status = status;

    const salaries = await WeeklySalary.find(query).sort({ shopName: 1, employeeName: 1 });
    const totals = {
      totalAttendancePay: salaries.reduce((sum, s) => sum + (s.netAttendancePay || 0), 0),
      totalAllowances: salaries.reduce((sum, s) => sum + (s.travelAllowance || 0) + (s.otherAllowances || 0), 0),
      totalBonus: salaries.reduce((sum, s) => sum + (s.bonus || 0), 0),
      totalDeductions: salaries.reduce((sum, s) => sum + (s.manualDeductions || 0), 0),
      totalFinalSalary: salaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0),
      totalPaid: salaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0),
      totalOutstanding: salaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0)
    };

    const workbook = await buildWeeklySalaryExcel(salaries, targetWeek, totals);

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_EXCEL',
      recordType: 'WeeklySalary',
      details: `Exported Weekly Salary Excel for ${targetWeek}`,
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Weekly_Salary_${targetWeek.replace(/[\/–\s]/g, '_')}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return sendServerError(res, error, 'Failed to export weekly salary Excel.');
  }
};

exports.exportWeeklySalaryPDF = async (req, res) => {
  try {
    const { weekLabel, date, shopId, employeeId, status } = req.query;
    const targetWeek = weekLabel || getWeekRange(date || new Date()).weekLabel;
    const query = {};
    if (weekLabel) {
      const altLabel = weekLabel.includes(' – ') ? weekLabel.replace(' – ', ' to ') : weekLabel.replace(' to ', ' – ');
      query.weekLabel = { $in: [weekLabel, altLabel] };
    }
    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;
    if (status) query.status = status;

    const salaries = await WeeklySalary.find(query).sort({ shopName: 1, employeeName: 1 });
    const totals = {
      totalAttendancePay: salaries.reduce((sum, s) => sum + (s.netAttendancePay || 0), 0),
      totalAllowances: salaries.reduce((sum, s) => sum + (s.travelAllowance || 0) + (s.otherAllowances || 0), 0),
      totalBonus: salaries.reduce((sum, s) => sum + (s.bonus || 0), 0),
      totalDeductions: salaries.reduce((sum, s) => sum + (s.manualDeductions || 0), 0),
      totalFinalSalary: salaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0),
      totalPaid: salaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0),
      totalOutstanding: salaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0)
    };

    await logAction({
      user: req.user,
      action: 'REPORT_EXPORTED_PDF',
      recordType: 'WeeklySalary',
      details: `Exported Weekly Salary PDF for ${targetWeek}`,
      req
    });

    buildWeeklySalaryPDF(res, salaries, targetWeek, totals, req.user?.name || 'Admin');
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
    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const { monthStart, monthEnd, monthLabel } = period;

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
      balancePayable
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

    const { targetYear, monthStart, monthEnd, monthLabel } = period;

    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const attendances = await Attendance.find({ employee: employeeId, dateString: { $gte: startStr, $lte: endStr } });
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
      req.user?.name || 'Admin'
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
      const hours = atts.reduce((sum, a) => sum + (a.actualHours || 0), 0);
      const attPay = atts.reduce((sum, a) => sum + (a.attendancePay || 0), 0);

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
      const hours = atts.reduce((sum, a) => sum + (a.actualHours || 0), 0);
      const attPay = atts.reduce((sum, a) => sum + (a.attendancePay || 0), 0);

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

    if (employeeId) query.employee = employeeId;
    if (month) query.month = month;
    if (year) query.year = Number(year);
    if (shopId) query.shop = shopId;

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
    if (employeeId) query.employee = employeeId;
    if (shopId) query.shop = shopId;

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
    if (employeeId) query.employee = employeeId;
    if (shopId) query.shop = shopId;

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
    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;

    const attendances = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });

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

      const empId = a.employee?.toString() || a.employeeName;
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
      empEntry.scheduledHours = Number((empEntry.scheduledHours + (a.scheduledHours || 0)).toFixed(2));
      empEntry.hours = Number((empEntry.hours + (a.actualHours || 0)).toFixed(2));
      empEntry.lateMinutes += (a.lateMinutes || 0);
      empEntry.wageCost = Number((empEntry.wageCost + (a.attendancePay || 0)).toFixed(2));

      shopLabourMap[sName].totalScheduledHours = Number((shopLabourMap[sName].totalScheduledHours + (a.scheduledHours || 0)).toFixed(2));
      shopLabourMap[sName].totalHours = Number((shopLabourMap[sName].totalHours + (a.actualHours || 0)).toFixed(2));
      shopLabourMap[sName].totalLateMinutes += (a.lateMinutes || 0);
      shopLabourMap[sName].totalWageCost = Number((shopLabourMap[sName].totalWageCost + (a.attendancePay || 0)).toFixed(2));
    });

    const result = Object.values(shopLabourMap).map(s => ({
      ...s,
      employeeCount: Object.keys(s.employees).length,
      employees: Object.values(s.employees)
    }));

    const grandTotals = {
      totalWorkingDays: result.reduce((sum, s) => sum + s.totalWorkingDays, 0),
      totalScheduledHours: Number(result.reduce((sum, s) => sum + s.totalScheduledHours, 0).toFixed(2)),
      totalActualHours: Number(result.reduce((sum, s) => sum + s.totalHours, 0).toFixed(2)),
      totalLateMinutes: result.reduce((sum, s) => sum + s.totalLateMinutes, 0),
      totalWageCost: Number(result.reduce((sum, s) => sum + s.totalWageCost, 0).toFixed(2))
    };

    res.json({
      success: true,
      count: result.length,
      grandTotals,
      data: result
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
      });

      const uniqueWorkers = new Set(attendances.map(a => a.employee?.toString() || a.employeeName));
      const workingDays = attendances.filter(a => a.status !== 'Absent').length;
      const scheduledHours = Number(attendances.reduce((sum, a) => sum + (a.scheduledHours || 0), 0).toFixed(2));
      const actualHours = Number(attendances.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2));
      const lateDeductions = Number(attendances.reduce((sum, a) => sum + (a.lateDeduction || 0), 0).toFixed(2));
      const attendancePay = Number(attendances.reduce((sum, a) => sum + (a.attendancePay || 0), 0).toFixed(2));

      // Finalized salary cost where available
      const salaries = await WeeklySalary.find({
        shop: shop._id,
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
        weekEndDate: { $gte: monthStart, $lte: monthEnd }
      });
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

    const grandTotals = {
      totalEmployees: shopSummaries.reduce((sum, s) => sum + s.employees, 0),
      totalWorkingDays: shopSummaries.reduce((sum, s) => sum + s.workingDays, 0),
      totalScheduledHours: Number(shopSummaries.reduce((sum, s) => sum + s.scheduledHours, 0).toFixed(2)),
      totalActualHours: Number(shopSummaries.reduce((sum, s) => sum + s.actualHours, 0).toFixed(2)),
      totalLateDeductions: Number(shopSummaries.reduce((sum, s) => sum + s.lateDeductions, 0).toFixed(2)),
      totalAttendancePay: Number(shopSummaries.reduce((sum, s) => sum + s.attendancePay, 0).toFixed(2)),
      totalFinalizedSalaryCost: Number(shopSummaries.reduce((sum, s) => sum + s.finalizedSalaryCost, 0).toFixed(2))
    };

    res.json({
      success: true,
      month: targetMonth,
      year: targetYear,
      shopSummaries,
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
    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;

    const attendances = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });
    const shopLabourMap = {};
    attendances.forEach(a => {
      const sName = a.shopName || 'Shop';
      if (!shopLabourMap[sName]) shopLabourMap[sName] = { shopName: sName, employees: {} };
      const empId = a.employee?.toString() || a.employeeName;
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
      e.wageCost += (a.attendancePay || 0);
    });

    const shopData = Object.values(shopLabourMap).map(s => ({
      ...s,
      employees: Object.values(s.employees)
    }));

    const periodLabel = startDate && endDate ? `${startDate} to ${endDate}` : 'All Dates';
    const workbook = await buildShopLabourExcel(shopData, periodLabel);

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
    if (shopId) query.shop = shopId;
    if (employeeId) query.employee = employeeId;

    const attendances = await Attendance.find(query).sort({ shopName: 1, employeeName: 1 });
    const shopLabourMap = {};
    attendances.forEach(a => {
      const sName = a.shopName || 'Shop';
      if (!shopLabourMap[sName]) shopLabourMap[sName] = { shopName: sName, employees: {} };
      const empId = a.employee?.toString() || a.employeeName;
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
      e.wageCost += (a.attendancePay || 0);
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

    buildShopLabourPDF(res, shopData, periodLabel, req.user?.name || 'Admin');
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

    if (employeeId) query.employee = employeeId;
    if (shopId) query.shop = shopId;
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
    if (employeeId) query.employee = employeeId;
    if (shopId) query.shop = shopId;
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
    if (employeeId) query.employee = employeeId;
    if (shopId) query.shop = shopId;
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
    if (shopId) salaryQuery.shop = shopId;

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
    if (shopId) bonusQuery.shop = shopId;
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
