const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

function formatTime12Hour(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!match) return value || '';

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return value;

  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${match[2]} ${period}`;
}

/**
 * Format daily attendance as clean WhatsApp message text
 */
function generateWhatsAppAttendanceText(dateStr, records, shopName = 'All Shops') {
  let text = `🚴 *PixxTechnologies - Daily Attendance*\n`;
  text += `📅 *Date:* ${dateStr}\n`;
  text += `📍 *Location:* ${shopName}\n`;
  text += `-------------------------------------------\n\n`;

  // Group by shop — absent workers go into a separate group at the end
  const grouped = {};
  const absentList = [];
  records.forEach(r => {
    if (r.status === 'Absent') {
      absentList.push(r);
    } else {
      const sName = r.shopName || 'Shop';
      if (!grouped[sName]) grouped[sName] = [];
      grouped[sName].push(r);
    }
  });

  let totalStaff = 0;
  let totalPresent = 0;
  let totalLate = 0;
  let totalHalf = 0;
  let totalAbsent = absentList.length;

  for (const [shop, staffList] of Object.entries(grouped)) {
    text += `🏬 *${shop.toUpperCase()}*\n`;
    staffList.forEach((r, idx) => {
      totalStaff++;
      if (r.status === 'Present') totalPresent++;
      else if (r.status === 'Late') totalLate++;
      else if (r.status === 'Half') totalHalf++;

      const remarkStr = r.remarks ? ` [${r.remarks}]` : '';
      const timeStr = `In: ${formatTime12Hour(r.timeReached) || '--'} - Out: ${formatTime12Hour(r.workerEndTime) || '--'}`;
      text += `${idx + 1}. *${r.employeeName}*: ${r.status} | ${timeStr}${remarkStr}\n`;
    });
    text += `\n`;
  }

  // Absent section
  if (absentList.length > 0) {
    text += `🔴 *ABSENT / OFF TODAY*\n`;
    absentList.forEach((r, idx) => {
      totalStaff++;
      const remarkStr = r.remarks ? ` — ${r.remarks}` : '';
      text += `${idx + 1}. *${r.employeeName}*: Absent${remarkStr}\n`;
    });
    text += `\n`;
  }

  text += `-------------------------------------------\n`;
  text += `📊 *SUMMARY:*\n`;
  text += `• Total Staff: ${totalStaff}\n`;
  text += `• ✅ Present: ${totalPresent} | ⚠️ Late: ${totalLate} | 🔵 Half: ${totalHalf} | 🔴 Absent: ${totalAbsent}\n`;
  text += `\n_PixxTechnologies Rota System_`;

  return text;
}

/**
 * Generate Excel workbook for Daily Attendance
 */
async function buildDailyAttendanceExcel(records, dateStr) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Daily Attendance');
  const navy = 'FF0F172A';
  const blue = 'FF2563EB';
  const paleBlue = 'FFEFF6FF';
  const slate = 'FF475569';
  const border = 'FFCBD5E1';

  sheet.mergeCells('A1:L1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'PIXX ROTA  |  DAILY ATTENDANCE';
  titleCell.font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  sheet.mergeCells('A2:L2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = `Attendance register  •  ${dateStr}  •  Times shown in 12-hour format`;
  subtitleCell.font = { name: 'Aptos', size: 10, color: { argb: slate }, italic: true };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 24;

  const headers = [
    'Date', 'Shop', 'Employee ID', 'Worker Name', 'Shift Start', 'Shift End',
    'Arrival', 'Leave', 'Status', 'Remarks', 'Submitted By', 'Checked By'
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: navy } } };
  });
  headerRow.height = 30;

  records.forEach(r => {
    const isAbsent = r.status === 'Absent';
    const row = sheet.addRow([
      r.dateString || dateStr,
      isAbsent ? '' : (r.shopName || ''),
      r.employeeId || '',
      r.employeeName || '',
      isAbsent ? '' : formatTime12Hour(r.shiftStart),
      isAbsent ? '' : formatTime12Hour(r.shiftEnd),
      isAbsent ? '' : formatTime12Hour(r.timeReached),
      isAbsent ? '' : formatTime12Hour(r.workerEndTime),
      isAbsent ? 'Absent / Off' : (r.status || 'Present'),
      r.remarks || '',
      r.createdByName || '',
      r.checkedByName || ''
    ]);
    const statusColors = {
      Present: ['FFE8F5E9', 'FF166534'],
      Late: ['FFFFF7ED', 'FFB45309'],
      Half: ['FFEFF6FF', 'FF1D4ED8'],
      Absent: ['FFFEF2F2', 'FFB91C1C']
    };
    const [statusFill, statusFont] = statusColors[r.status] || statusColors.Present;
    row.height = 24;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.font = { name: 'Aptos', size: 10, color: { argb: 'FF1E293B' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: row.number % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' }
      };
      cell.border = {
        bottom: { style: 'hair', color: { argb: border } }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: [1, 3, 5, 6, 7, 8, 9].includes(columnNumber) ? 'center' : 'left',
        wrapText: [2, 4, 10, 11, 12].includes(columnNumber)
      };
    });
    const statusCell = row.getCell(9);
    statusCell.value = isAbsent ? 'Absent / Off' : (r.status || 'Present');
    statusCell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: statusFont } };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill } };
  });

  sheet.addRow([]);
  const summaryRow = sheet.addRow([
    'TOTAL WORKERS', records.length,
    'PRESENT', records.filter(record => record.status === 'Present').length,
    'LATE', records.filter(record => record.status === 'Late').length,
    'HALF DAY', records.filter(record => record.status === 'Half').length,
    'ABSENT', records.filter(record => record.status === 'Absent').length
  ]);
  summaryRow.height = 26;
  summaryRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    const isLabel = [1, 3, 5, 7, 9].includes(columnNumber);
    cell.font = {
      name: 'Aptos',
      size: 9,
      bold: true,
      color: { argb: isLabel ? 'FFFFFFFF' : navy }
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isLabel ? navy : paleBlue }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: border } },
      bottom: { style: 'thin', color: { argb: border } }
    };
  });

  sheet.columns = [
    { width: 14 }, { width: 22 }, { width: 16 }, { width: 25 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 16 }, { width: 30 }, { width: 22 }, { width: 22 }
  ];
  sheet.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  sheet.autoFilter = { from: 'A3', to: `L${Math.max(3, records.length + 3)}` };
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
  sheet.printTitlesRow = '1:3';
  sheet.headerFooter.oddFooter = '&LPixxTechnologies Rota System&CConfidential Attendance Report&RPage &P of &N';

  return workbook;
}


/**
 * Generate Excel workbook for Monthly Commission Report (Matching Image 1: Commission Details)
 */
async function buildCommissionExcel(bonuses, monthStr, yearStr) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Commission Details');

  // Title
  sheet.mergeCells('A1:F1');
  const title = sheet.getCell('A1');
  title.value = 'Commission Details';
  title.font = { name: 'Arial', size: 16, bold: true };
  title.alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:F2');
  const subTitle = sheet.getCell('A2');
  subTitle.value = `${monthStr} ${yearStr}`;
  subTitle.font = { name: 'Arial', size: 13, bold: true };
  subTitle.alignment = { horizontal: 'center' };

  const headerRow = sheet.addRow(['No', 'Name', 'Commitment', 'Monthly Sale', 'Rate', 'Commision']);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow matching image
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    cell.alignment = { horizontal: 'center' };
  });

  let totalComm = 0;
  bonuses.forEach((b, idx) => {
    totalComm += b.bonusAmount || 0;
    const row = sheet.addRow([
      idx + 1,
      b.employeeName,
      b.commitmentText || `${b.bonusPercentage}% - ${b.shopName}`,
      b.salesAmount ? `£${b.salesAmount.toLocaleString()}` : '£0',
      `${b.bonusPercentage}%`,
      b.bonusAmount ? `£${b.bonusAmount.toFixed(2)}` : '£0'
    ]);
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Total Row matching yellow footer in image
  const totalRow = sheet.addRow(['Total', '', '', '', '', `£${totalComm.toFixed(2)}`]);
  sheet.mergeCells(`A${totalRow.number}:E${totalRow.number}`);
  totalRow.getCell(1).alignment = { horizontal: 'center' };
  totalRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 11, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  sheet.columns.forEach(col => { col.width = 18; });
  sheet.getColumn(1).width = 6;
  return workbook;
}

/**
 * Generate Excel workbook for Single Employee Monthly Report (Matching Image 2: Shahab Ahmad format)
 */
async function buildEmployeeMonthlyExcel(employeeName, monthLabel, weeklyBreakdowns, grandTotal, balancePayable) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Monthly Report');

  // Title: Employee Name
  sheet.mergeCells('A1:J1');
  const t1 = sheet.getCell('A1');
  t1.value = employeeName.toUpperCase();
  t1.font = { name: 'Arial', size: 16, bold: true };
  t1.alignment = { horizontal: 'center' };

  // Subtitle: Month-Year (e.g. May-26)
  sheet.mergeCells('A2:J2');
  const t2 = sheet.getCell('A2');
  t2.value = monthLabel;
  t2.font = { name: 'Arial', size: 13, bold: true };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  t2.alignment = { horizontal: 'center' };

  // Two major section headers
  sheet.mergeCells('A3:E3');
  const wageH = sheet.getCell('A3');
  wageH.value = 'Wage Details';
  wageH.font = { bold: true };
  wageH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }; // Light green
  wageH.alignment = { horizontal: 'center' };

  sheet.mergeCells('F3:I3');
  const payH = sheet.getCell('F3');
  payH.value = 'Payments';
  payH.font = { bold: true };
  payH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCFE2F3' } }; // Light blue
  payH.alignment = { horizontal: 'center' };

  sheet.mergeCells('J3:J4');
  const balH = sheet.getCell('J3');
  balH.value = 'Balance';
  balH.font = { bold: true };
  balH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } }; // Light red/salmon
  balH.alignment = { horizontal: 'center', vertical: 'middle' };

  // Subheaders
  const subH = sheet.addRow(['Dates', 'Days', 'Wage', 'Ded', 'Bonus', 'Total', 'Received Date', 'Cash', 'Bank', 'Total', '']);
  subH.eachCell(cell => {
    cell.font = { size: 10, bold: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  weeklyBreakdowns.forEach(w => {
    const row = sheet.addRow([
      w.weekDates,
      w.days || '-',
      w.wage ? w.wage : '-',
      w.ded ? w.ded : '-',
      w.bonus ? w.bonus : '-',
      w.total ? w.total : '-',
      w.receivedDate || '-',
      w.cash ? w.cash.toFixed(2) : '-',
      w.bank ? w.bank.toFixed(2) : '-',
      w.paymentTotal ? w.paymentTotal.toFixed(2) : '-',
      w.balance ? w.balance.toFixed(2) : '-'
    ]);
    row.eachCell(cell => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  // Grand Total Row
  const gRow = sheet.addRow([
    `Grand Total (${monthLabel})`,
    grandTotal.days,
    grandTotal.wage,
    grandTotal.ded || '-',
    grandTotal.bonus || '-',
    grandTotal.total,
    '',
    grandTotal.cash ? grandTotal.cash.toFixed(2) : '-',
    grandTotal.bank ? grandTotal.bank.toFixed(2) : '-',
    grandTotal.paid ? grandTotal.paid.toFixed(2) : '-',
    balancePayable ? balancePayable.toFixed(2) : '-'
  ]);
  gRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
    cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  // Total Balance Payable banner
  const bRow = sheet.addRow(['TOTAL BALANCE PAYABLE', '', '', '', '', '', '', '', '', `£${(balancePayable || 0).toFixed(2)}`]);
  sheet.mergeCells(`A${bRow.number}:I${bRow.number}`);
  bRow.getCell(1).alignment = { horizontal: 'center' };
  bRow.eachCell(cell => {
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 8;
  return workbook;
}

/**
 * Generate Excel workbook for Weekly Attendance Report
 */
async function buildWeeklyAttendanceExcel(records, weekLabel, summary = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Weekly Attendance');

  sheet.mergeCells('A1:M1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Weekly Attendance Report (${weekLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Shop', 'Employee ID', 'Employee Name', 'Work Days', 'Present', 'Late', 'Half', 'Absent',
    'Sched Hours', 'Worked Hours', 'Late (min)', 'Late Ded (£)', 'Attendance Pay (£)'
  ];
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  records.forEach(r => {
    sheet.addRow([
      r.shopName || '',
      r.employeeId || '',
      r.employeeName || '',
      r.workingDays || 0,
      r.presentDays || 0,
      r.lateDays || 0,
      r.halfDays || 0,
      r.absentDays || 0,
      Number((r.scheduledHours || 0).toFixed(2)),
      Number((r.actualHours || 0).toFixed(2)),
      r.lateMinutes || 0,
      Number((r.lateDeduction || 0).toFixed(2)),
      Number((r.attendancePay || 0).toFixed(2))
    ]);
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    'TOTALS',
    `Employees: ${records.length}`,
    '',
    summary.totalWorkingDays || 0,
    summary.totalPresent || 0,
    summary.totalLate || 0,
    summary.totalHalf || 0,
    summary.totalAbsent || 0,
    Number((summary.totalScheduledHours || 0).toFixed(2)),
    Number((summary.totalWorkedHours || 0).toFixed(2)),
    summary.totalLateMinutes || 0,
    Number((summary.totalLateDeductions || 0).toFixed(2)),
    Number((summary.totalAttendancePay || 0).toFixed(2))
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 15; });
  sheet.getColumn(1).width = 18;
  sheet.getColumn(3).width = 22;
  return workbook;
}

/**
 * Generate PDF for Weekly Attendance Report
 */
function buildWeeklyAttendancePDF(res, records, weekLabel, summary = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Weekly_Attendance_${weekLabel.replace(/[\/–\s]/g, '_')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('PixxTechnologies UK', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Weekly Staff Attendance Report', { align: 'center' });
  doc.fontSize(10).font('Helvetica-Oblique').text(
    `Week: ${weekLabel} | Generated By: ${generatedBy} | Date: ${new Date().toLocaleDateString('en-GB')}`,
    { align: 'center' }
  );
  doc.moveDown(0.8);

  let y = doc.y;
  doc.fontSize(8.5).font('Helvetica-Bold');
  doc.text('Shop', 25, y);
  doc.text('ID', 110, y);
  doc.text('Employee Name', 160, y);
  doc.text('Days', 290, y);
  doc.text('Pres/Late/Half/Abs', 330, y);
  doc.text('Sched (h)', 445, y);
  doc.text('Worked (h)', 510, y);
  doc.text('Late (m)', 580, y);
  doc.text('Late Ded (£)', 640, y);
  doc.text('Attendance Pay (£)', 720, y);

  doc.moveTo(25, y + 13).lineTo(815, y + 13).stroke();
  doc.font('Helvetica').fontSize(8);
  y += 18;

  records.forEach(r => {
    if (y > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    doc.text((r.shopName || '').slice(0, 14), 25, y);
    doc.text(r.employeeId || '', 110, y);
    doc.text((r.employeeName || '').slice(0, 20), 160, y);
    doc.text(String(r.workingDays || 0), 290, y);
    doc.text(`${r.presentDays || 0} / ${r.lateDays || 0} / ${r.halfDays || 0} / ${r.absentDays || 0}`, 330, y);
    doc.text(`${(r.scheduledHours || 0).toFixed(1)}h`, 445, y);
    doc.text(`${(r.actualHours || 0).toFixed(1)}h`, 510, y);
    doc.text(`${r.lateMinutes || 0}m`, 580, y);
    doc.text(`£${(r.lateDeduction || 0).toFixed(2)}`, 640, y);
    doc.text(`£${(r.attendancePay || 0).toFixed(2)}`, 720, y);
    y += 14;
  });

  const summaryY = Math.min(y + 10, 530);
  doc.rect(25, summaryY, 790, 26).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
  doc.text(
    `TOTALS: Staff: ${records.length} | Working Days: ${summary.totalWorkingDays || 0} | Worked Hours: ${(summary.totalWorkedHours || 0).toFixed(1)}h | Late Deductions: £${(summary.totalLateDeductions || 0).toFixed(2)} | Net Attendance Pay: £${(summary.totalAttendancePay || 0).toFixed(2)}`,
    35,
    summaryY + 8
  );

  doc.end();
}

/**
 * Generate Excel workbook for Weekly Salary Report
 */
async function buildWeeklySalaryExcel(salaries, weekLabel, totals = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Weekly Salary');

  sheet.mergeCells('A1:M1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Weekly Salary Report (${weekLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Shop', 'Employee ID', 'Employee Name', 'Week', 'Attendance Pay (£)',
    'Allowances (£)', 'Bonus (£)', 'Deductions (£)', 'Final Salary (£)',
    'Paid (£)', 'Outstanding (£)', 'Salary Status', 'Payment Status'
  ];
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  salaries.forEach(s => {
    const allowances = (s.travelAllowance || 0) + (s.otherAllowances || 0);
    const deductions = (s.manualDeductions || 0);
    const paymentStatus = (s.balanceRemaining <= 0 && s.finalSalary > 0) ? 'Paid' : (s.totalPaid > 0 ? 'Partially Paid' : 'Unpaid');

    sheet.addRow([
      s.shopName || '',
      s.employeeId || '',
      s.employeeName || '',
      s.weekLabel || weekLabel,
      Number((s.netAttendancePay || 0).toFixed(2)),
      Number(allowances.toFixed(2)),
      Number((s.bonus || 0).toFixed(2)),
      Number(deductions.toFixed(2)),
      Number((s.finalSalary || 0).toFixed(2)),
      Number((s.totalPaid || 0).toFixed(2)),
      Number((s.balanceRemaining || 0).toFixed(2)),
      s.status || 'Generated',
      paymentStatus
    ]);
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    'TOTALS',
    `Count: ${salaries.length}`,
    '', '',
    Number((totals.totalAttendancePay || 0).toFixed(2)),
    Number((totals.totalAllowances || 0).toFixed(2)),
    Number((totals.totalBonus || 0).toFixed(2)),
    Number((totals.totalDeductions || 0).toFixed(2)),
    Number((totals.totalFinalSalary || 0).toFixed(2)),
    Number((totals.totalPaid || 0).toFixed(2)),
    Number((totals.totalOutstanding || 0).toFixed(2)),
    '', ''
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(1).width = 18;
  sheet.getColumn(3).width = 22;
  return workbook;
}

/**
 * Generate PDF for Weekly Salary Report
 */
function buildWeeklySalaryPDF(res, salaries, weekLabel, totals = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Weekly_Salary_${weekLabel.replace(/[\/–\s]/g, '_')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('PixxTechnologies UK', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Weekly Payroll & Salary Report', { align: 'center' });
  doc.fontSize(10).font('Helvetica-Oblique').text(
    `Week: ${weekLabel} | Generated By: ${generatedBy} | Date: ${new Date().toLocaleDateString('en-GB')}`,
    { align: 'center' }
  );
  doc.moveDown(0.8);

  let y = doc.y;
  doc.fontSize(8.5).font('Helvetica-Bold');
  doc.text('Shop', 25, y);
  doc.text('ID', 105, y);
  doc.text('Employee Name', 150, y);
  doc.text('Att Pay (£)', 270, y);
  doc.text('Allow (£)', 335, y);
  doc.text('Bonus (£)', 395, y);
  doc.text('Ded (£)', 455, y);
  doc.text('Final Salary', 515, y);
  doc.text('Paid (£)', 585, y);
  doc.text('Outstanding', 650, y);
  doc.text('Status', 735, y);

  doc.moveTo(25, y + 13).lineTo(815, y + 13).stroke();
  doc.font('Helvetica').fontSize(8);
  y += 18;

  salaries.forEach(s => {
    if (y > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    const allowances = (s.travelAllowance || 0) + (s.otherAllowances || 0);
    const deductions = s.manualDeductions || 0;

    doc.text((s.shopName || '').slice(0, 12), 25, y);
    doc.text(s.employeeId || '', 105, y);
    doc.text((s.employeeName || '').slice(0, 18), 150, y);
    doc.text(`£${(s.netAttendancePay || 0).toFixed(2)}`, 270, y);
    doc.text(`£${allowances.toFixed(2)}`, 335, y);
    doc.text(`£${(s.bonus || 0).toFixed(2)}`, 395, y);
    doc.text(`£${deductions.toFixed(2)}`, 455, y);
    doc.text(`£${(s.finalSalary || 0).toFixed(2)}`, 515, y);
    doc.text(`£${(s.totalPaid || 0).toFixed(2)}`, 585, y);
    doc.text(`£${(s.balanceRemaining || 0).toFixed(2)}`, 650, y);
    doc.text(s.status || 'Generated', 735, y);
    y += 14;
  });

  const summaryY = Math.min(y + 10, 530);
  doc.rect(25, summaryY, 790, 26).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
  doc.text(
    `TOTALS: Staff: ${salaries.length} | Net Attendance: £${(totals.totalAttendancePay || 0).toFixed(2)} | Allowances: £${(totals.totalAllowances || 0).toFixed(2)} | Bonus: £${(totals.totalBonus || 0).toFixed(2)} | Final Salary: £${(totals.totalFinalSalary || 0).toFixed(2)} | Paid: £${(totals.totalPaid || 0).toFixed(2)} | Outstanding: £${(totals.totalOutstanding || 0).toFixed(2)}`,
    35,
    summaryY + 8
  );

  doc.end();
}

/**
 * Generate PDF for Employee Monthly Report
 */
function buildEmployeeMonthlyPDF(res, employeeName, employeeId, shopName, monthLabel, attendanceSummary = {}, weeklyBreakdowns = [], grandTotal = {}, balancePayable = 0, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Monthly_${employeeName.replace(/\s+/g, '_')}_${monthLabel}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('PixxTechnologies UK', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`Employee Monthly Payroll & Attendance: ${employeeName.toUpperCase()} (${employeeId})`, { align: 'center' });
  doc.fontSize(10).font('Helvetica-Oblique').text(
    `Month: ${monthLabel} | Shop: ${shopName} | Generated By: ${generatedBy} | Date: ${new Date().toLocaleDateString('en-GB')}`,
    { align: 'center' }
  );
  doc.moveDown(0.8);

  // Attendance KPI banner
  doc.rect(25, doc.y, 790, 24).fillAndStroke('#f1f5f9', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
  doc.text(
    `MONTH ATTENDANCE: Working Days: ${attendanceSummary.workingDays || 0} (Present: ${attendanceSummary.present || 0}, Late: ${attendanceSummary.late || 0}, Half: ${attendanceSummary.half || 0}, Absent: ${attendanceSummary.absent || 0}) | Hours: ${(attendanceSummary.actualHours || 0).toFixed(1)}h | Late Ded: £${(attendanceSummary.lateDeduction || 0).toFixed(2)} | Net Attendance Pay: £${(attendanceSummary.attendancePay || 0).toFixed(2)}`,
    35,
    doc.y - 17
  );
  doc.moveDown(1.2);

  let y = doc.y;
  doc.fontSize(8.5).font('Helvetica-Bold');
  doc.text('Week Range', 25, y);
  doc.text('Days', 180, y);
  doc.text('Gross Wages (£)', 230, y);
  doc.text('Deductions (£)', 320, y);
  doc.text('Bonus (£)', 400, y);
  doc.text('Final Salary (£)', 470, y);
  doc.text('Received Date', 555, y);
  doc.text('Cash (£)', 635, y);
  doc.text('Bank (£)', 695, y);
  doc.text('Total Paid (£)', 755, y);

  doc.moveTo(25, y + 13).lineTo(815, y + 13).stroke();
  doc.font('Helvetica').fontSize(8);
  y += 18;

  weeklyBreakdowns.forEach(w => {
    if (y > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    doc.text(w.weekDates || '', 25, y);
    doc.text(String(w.days || 0), 180, y);
    doc.text(`£${(w.wage || 0).toFixed(2)}`, 230, y);
    doc.text(`£${(w.ded || 0).toFixed(2)}`, 320, y);
    doc.text(`£${(w.bonus || 0).toFixed(2)}`, 400, y);
    doc.text(`£${(w.total || 0).toFixed(2)}`, 470, y);
    doc.text(w.receivedDate || '-', 555, y);
    doc.text(`£${(w.cash || 0).toFixed(2)}`, 635, y);
    doc.text(`£${(w.bank || 0).toFixed(2)}`, 695, y);
    doc.text(`£${(w.paymentTotal || 0).toFixed(2)}`, 755, y);
    y += 14;
  });

  const summaryY = Math.min(y + 10, 520);
  doc.rect(25, summaryY, 790, 26).fillAndStroke('#ecfdf5', '#10b981');
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(9);
  doc.text(
    `GRAND TOTALS: Final Salary: £${(grandTotal.total || 0).toFixed(2)} | Total Paid: £${(grandTotal.paid || 0).toFixed(2)} (Cash: £${(grandTotal.cash || 0).toFixed(2)}, Bank: £${(grandTotal.bank || 0).toFixed(2)}) | OUTSTANDING BALANCE PAYABLE: £${(balancePayable || 0).toFixed(2)}`,
    35,
    summaryY + 8
  );

  doc.end();
}

/**
 * Generate Excel workbook for Employee Yearly Report
 */
async function buildEmployeeYearlyExcel(employeeName, employeeId, shopName, year, monthlyRows, yearlyTotals = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Yearly ${year}`);

  sheet.mergeCells('A1:J1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Annual Employee Payroll Report (${year}): ${employeeName.toUpperCase()} (${employeeId})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Month', 'Work Days', 'Hours Worked', 'Attendance Pay (£)', 'Allowances (£)',
    'Bonus (£)', 'Deductions (£)', 'Final Salary (£)', 'Total Paid (£)', 'Outstanding (£)'
  ];
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  monthlyRows.forEach(m => {
    sheet.addRow([
      m.monthName,
      m.workingDays || 0,
      Number((m.actualHours || 0).toFixed(2)),
      Number((m.attendancePay || 0).toFixed(2)),
      Number((m.allowances || 0).toFixed(2)),
      Number((m.bonus || 0).toFixed(2)),
      Number((m.deductions || 0).toFixed(2)),
      Number((m.finalSalary || 0).toFixed(2)),
      Number((m.paid || 0).toFixed(2)),
      Number((m.outstanding || 0).toFixed(2))
    ]);
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    `ANNUAL TOTAL (${year})`,
    yearlyTotals.totalWorkingDays || 0,
    Number((yearlyTotals.totalActualHours || 0).toFixed(2)),
    Number((yearlyTotals.totalAttendancePay || 0).toFixed(2)),
    Number((yearlyTotals.totalAllowances || 0).toFixed(2)),
    Number((yearlyTotals.totalBonus || 0).toFixed(2)),
    Number((yearlyTotals.totalDeductions || 0).toFixed(2)),
    Number((yearlyTotals.totalFinalSalary || 0).toFixed(2)),
    Number((yearlyTotals.totalPaid || 0).toFixed(2)),
    Number((yearlyTotals.totalOutstanding || 0).toFixed(2))
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(1).width = 18;
  return workbook;
}

/**
 * Generate PDF for Employee Yearly Report
 */
function buildEmployeeYearlyPDF(res, employeeName, employeeId, shopName, year, monthlyRows, yearlyTotals = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Annual_${employeeName.replace(/\s+/g, '_')}_${year}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('PixxTechnologies UK', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`Annual Employee Payroll Summary (${year})`, { align: 'center' });
  doc.fontSize(10).font('Helvetica-Oblique').text(
    `Employee: ${employeeName} (${employeeId}) | Shop: ${shopName} | Generated By: ${generatedBy} | Date: ${new Date().toLocaleDateString('en-GB')}`,
    { align: 'center' }
  );
  doc.moveDown(0.8);

  let y = doc.y;
  doc.fontSize(8.5).font('Helvetica-Bold');
  doc.text('Month', 25, y);
  doc.text('Days', 105, y);
  doc.text('Hours (h)', 155, y);
  doc.text('Att Pay (£)', 230, y);
  doc.text('Allow (£)', 310, y);
  doc.text('Bonus (£)', 380, y);
  doc.text('Ded (£)', 450, y);
  doc.text('Final Salary (£)', 520, y);
  doc.text('Total Paid (£)', 610, y);
  doc.text('Outstanding (£)', 700, y);

  doc.moveTo(25, y + 13).lineTo(815, y + 13).stroke();
  doc.font('Helvetica').fontSize(8);
  y += 18;

  monthlyRows.forEach(m => {
    if (y > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    doc.text(m.monthName, 25, y);
    doc.text(String(m.workingDays || 0), 105, y);
    doc.text(`${(m.actualHours || 0).toFixed(1)}h`, 155, y);
    doc.text(`£${(m.attendancePay || 0).toFixed(2)}`, 230, y);
    doc.text(`£${(m.allowances || 0).toFixed(2)}`, 310, y);
    doc.text(`£${(m.bonus || 0).toFixed(2)}`, 380, y);
    doc.text(`£${(m.deductions || 0).toFixed(2)}`, 450, y);
    doc.text(`£${(m.finalSalary || 0).toFixed(2)}`, 520, y);
    doc.text(`£${(m.paid || 0).toFixed(2)}`, 610, y);
    doc.text(`£${(m.outstanding || 0).toFixed(2)}`, 700, y);
    y += 14;
  });

  const summaryY = Math.min(y + 10, 520);
  doc.rect(25, summaryY, 790, 26).fillAndStroke('#ecfdf5', '#10b981');
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(8.5);
  doc.text(
    `ANNUAL TOTALS (${year}): Working Days: ${yearlyTotals.totalWorkingDays || 0} | Hours: ${(yearlyTotals.totalActualHours || 0).toFixed(1)}h | Attendance Pay: £${(yearlyTotals.totalAttendancePay || 0).toFixed(2)} | Finalized Salary: £${(yearlyTotals.totalFinalSalary || 0).toFixed(2)} | Paid: £${(yearlyTotals.totalPaid || 0).toFixed(2)} | OUTSTANDING LIABILITY: £${(yearlyTotals.totalOutstanding || 0).toFixed(2)}`,
    35,
    summaryY + 8
  );

  doc.end();
}

/**
 * Generate PDF for Bonus Report
 */
function buildBonusPDF(res, bonuses, month, year, totals = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Bonus_Report_${month}_${year}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('PixxTechnologies UK', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`Monthly Sales Bonus & Commission Report: ${month} ${year}`, { align: 'center' });
  doc.fontSize(10).font('Helvetica-Oblique').text(
    `Generated By: ${generatedBy} | Date: ${new Date().toLocaleDateString('en-GB')}`,
    { align: 'center' }
  );
  doc.moveDown(0.8);

  let y = doc.y;
  doc.fontSize(8.5).font('Helvetica-Bold');
  doc.text('Employee Name', 25, y);
  doc.text('Employee ID', 170, y);
  doc.text('Shop / Location', 260, y);
  doc.text('Commitment / Tier', 380, y);
  doc.text('Sales Amount (£)', 520, y);
  doc.text('Rate (%)', 630, y);
  doc.text('Commission (£)', 710, y);

  doc.moveTo(25, y + 13).lineTo(815, y + 13).stroke();
  doc.font('Helvetica').fontSize(8);
  y += 18;

  bonuses.forEach(b => {
    if (y > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    doc.text((b.employeeName || '').slice(0, 22), 25, y);
    doc.text(b.employeeId || '', 170, y);
    doc.text((b.shopName || '').slice(0, 16), 260, y);
    doc.text((b.commitmentText || `${b.bonusPercentage}% commission`).slice(0, 24), 380, y);
    doc.text(`£${(b.salesAmount || 0).toLocaleString('en-GB')}`, 520, y);
    doc.text(`${b.bonusPercentage}%`, 630, y);
    doc.text(`£${(b.bonusAmount || 0).toFixed(2)}`, 710, y);
    y += 14;
  });

  const summaryY = Math.min(y + 10, 520);
  doc.rect(25, summaryY, 790, 26).fillAndStroke('#fffbeb', '#f59e0b');
  doc.fillColor('#78350f').font('Helvetica-Bold').fontSize(9);
  doc.text(
    `TOTALS: Qualified Staff: ${bonuses.length} | Total Monthly Sales: £${(totals.totalSales || 0).toLocaleString('en-GB')} | TOTAL COMMISSION PAYABLE: £${(totals.totalBonus || 0).toFixed(2)}`,
    35,
    summaryY + 8
  );

  doc.end();
}

/**
 * Generate Excel workbook for Shop Labour Hours Report
 */
async function buildShopLabourExcel(shopData, periodLabel = '') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Shop Labour Hours');

  sheet.mergeCells('A1:H1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Shop Labour Hours Report (${periodLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Shop Location', 'Employee ID', 'Employee Name', 'Work Days',
    'Scheduled Hours', 'Actual Hours Worked', 'Late (min)', 'Attendance Pay (£)'
  ];
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let grandDays = 0, grandSched = 0, grandActual = 0, grandLate = 0, grandCost = 0;

  shopData.forEach(s => {
    (s.employees || []).forEach(e => {
      grandDays += e.workingDays || 0;
      grandSched += e.scheduledHours || 0;
      grandActual += e.hours || 0;
      grandLate += e.lateMinutes || 0;
      grandCost += e.wageCost || 0;

      sheet.addRow([
        s.shopName,
        e.employeeId || '',
        e.employeeName || '',
        e.workingDays || 0,
        Number((e.scheduledHours || 0).toFixed(2)),
        Number((e.hours || 0).toFixed(2)),
        e.lateMinutes || 0,
        Number((e.wageCost || 0).toFixed(2))
      ]);
    });
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    'TOTALS',
    '', '',
    grandDays,
    Number(grandSched.toFixed(2)),
    Number(grandActual.toFixed(2)),
    grandLate,
    Number(grandCost.toFixed(2))
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(1).width = 20;
  sheet.getColumn(3).width = 22;
  return workbook;
}

/**
 * Generate PDF for Shop Labour Hours Report
 */
function buildShopLabourPDF(res, shopData, periodLabel = '', generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Shop_Labour_Hours_${periodLabel.replace(/\s+/g, '_')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('PixxTechnologies UK', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`Shop Labour Hours & Wage Cost Report (${periodLabel})`, { align: 'center' });
  doc.fontSize(10).font('Helvetica-Oblique').text(
    `Generated By: ${generatedBy} | Date: ${new Date().toLocaleDateString('en-GB')}`,
    { align: 'center' }
  );
  doc.moveDown(0.8);

  let y = doc.y;
  doc.fontSize(8.5).font('Helvetica-Bold');
  doc.text('Shop Location', 25, y);
  doc.text('Employee ID', 140, y);
  doc.text('Employee Name', 220, y);
  doc.text('Days', 360, y);
  doc.text('Sched Hours', 420, y);
  doc.text('Actual Hours', 510, y);
  doc.text('Late (min)', 600, y);
  doc.text('Attendance Pay (£)', 690, y);

  doc.moveTo(25, y + 13).lineTo(815, y + 13).stroke();
  doc.font('Helvetica').fontSize(8);
  y += 18;

  let grandDays = 0, grandSched = 0, grandActual = 0, grandCost = 0;

  shopData.forEach(s => {
    (s.employees || []).forEach(e => {
      if (y > 520) {
        doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
        y = 30;
      }
      grandDays += e.workingDays || 0;
      grandSched += e.scheduledHours || 0;
      grandActual += e.hours || 0;
      grandCost += e.wageCost || 0;

      doc.text((s.shopName || '').slice(0, 16), 25, y);
      doc.text(e.employeeId || '', 140, y);
      doc.text((e.employeeName || '').slice(0, 20), 220, y);
      doc.text(String(e.workingDays || 0), 360, y);
      doc.text(`${(e.scheduledHours || 0).toFixed(1)}h`, 420, y);
      doc.text(`${(e.hours || 0).toFixed(1)}h`, 510, y);
      doc.text(`${e.lateMinutes || 0}m`, 600, y);
      doc.text(`£${(e.wageCost || 0).toFixed(2)}`, 690, y);
      y += 14;
    });
  });

  const summaryY = Math.min(y + 10, 520);
  doc.rect(25, summaryY, 790, 26).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
  doc.text(
    `TOTALS: Working Days: ${grandDays} | Sched Hours: ${grandSched.toFixed(1)}h | Actual Worked: ${grandActual.toFixed(1)}h | TOTAL ATTENDANCE WAGE COST: £${grandCost.toFixed(2)}`,
    35,
    summaryY + 8
  );

  doc.end();
}

/**
 * Generate Excel workbook for Salary Payments Report
 */
async function buildPaymentsExcel(payments, periodLabel = '', totals = {}, cashBankSummary = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Salary Payments');

  sheet.mergeCells('A1:J1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Salary Payment Disbursement Report (${periodLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Employee ID', 'Employee Name', 'Shop', 'Salary Week', 'Payment Date',
    'Amount (£)', 'Method', 'Paid By', 'Reference', 'Notes'
  ];
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  payments.forEach(p => {
    sheet.addRow([
      p.employeeId || '',
      p.employeeName || '',
      p.shopName || '',
      p.weekLabel || '',
      p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-GB') : '',
      Number((p.amount || 0).toFixed(2)),
      p.paymentMethod || 'Cash',
      p.paidByName || '',
      p.clientReference || '',
      p.notes || ''
    ]);
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    'TOTALS',
    `Payments: ${payments.length}`,
    '', '', '',
    Number((totals.totalPaid || 0).toFixed(2)),
    `Cash: £${(cashBankSummary.cashTotal || 0).toFixed(2)} | Bank: £${(cashBankSummary.bankTotal || 0).toFixed(2)}`,
    '', '', ''
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(2).width = 22;
  sheet.getColumn(4).width = 22;
  return workbook;
}

/**
 * Generate PDF for Salary Payments Report
 */
function buildPaymentsPDF(res, payments, periodLabel = '', totals = {}, cashBankSummary = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Salary_Payments_${periodLabel.replace(/\s+/g, '_')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('PixxTechnologies UK', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`Salary Payment Disbursements Report (${periodLabel})`, { align: 'center' });
  doc.fontSize(10).font('Helvetica-Oblique').text(
    `Generated By: ${generatedBy} | Date: ${new Date().toLocaleDateString('en-GB')}`,
    { align: 'center' }
  );
  doc.moveDown(0.8);

  let y = doc.y;
  doc.fontSize(8.5).font('Helvetica-Bold');
  doc.text('Employee Name', 25, y);
  doc.text('Employee ID', 170, y);
  doc.text('Shop', 250, y);
  doc.text('Salary Week', 340, y);
  doc.text('Payment Date', 480, y);
  doc.text('Amount (£)', 560, y);
  doc.text('Method', 635, y);
  doc.text('Paid By', 700, y);

  doc.moveTo(25, y + 13).lineTo(815, y + 13).stroke();
  doc.font('Helvetica').fontSize(8);
  y += 18;

  payments.forEach(p => {
    if (y > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    doc.text((p.employeeName || '').slice(0, 20), 25, y);
    doc.text(p.employeeId || '', 170, y);
    doc.text((p.shopName || '').slice(0, 14), 250, y);
    doc.text((p.weekLabel || '').slice(0, 20), 340, y);
    doc.text(p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-GB') : '', 480, y);
    doc.text(`£${(p.amount || 0).toFixed(2)}`, 560, y);
    doc.text(p.paymentMethod || 'Cash', 635, y);
    doc.text((p.paidByName || '').slice(0, 16), 700, y);
    y += 14;
  });

  const summaryY = Math.min(y + 10, 520);
  doc.rect(25, summaryY, 790, 26).fillAndStroke('#ecfdf5', '#10b981');
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(8.5);
  doc.text(
    `TOTAL DISBURSED: £${(totals.totalPaid || 0).toFixed(2)} (Payments: ${payments.length}) | Cash: £${(cashBankSummary.cashTotal || 0).toFixed(2)} (${cashBankSummary.cashCount || 0}) | Bank: £${(cashBankSummary.bankTotal || 0).toFixed(2)} (${cashBankSummary.bankCount || 0})`,
    35,
    summaryY + 8
  );

  doc.end();
}

/**
 * Generate Excel workbook for Employee Salary Ledger
 */
async function buildLedgerExcel(employee, transactions, summary = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Salary Ledger');

  sheet.mergeCells('A1:G1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Employee Financial Ledger: ${employee.name.toUpperCase()} (${employee.employeeId})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Transaction Date', 'Type', 'Description', 'Reference Type',
    'Earned / Credit (£)', 'Paid / Debit (£)', 'Running Balance (£)'
  ];
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  transactions.forEach(t => {
    sheet.addRow([
      t.date ? new Date(t.date).toLocaleDateString('en-GB') : '',
      t.transactionType || '',
      t.description || '',
      t.referenceType || '',
      Number((t.amountEarned || 0).toFixed(2)),
      Number((t.amountPaid || 0).toFixed(2)),
      Number((t.runningBalance || 0).toFixed(2))
    ]);
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    'TOTALS & BALANCE',
    `Transactions: ${transactions.length}`,
    '', '',
    Number((summary.totalEarned || 0).toFixed(2)),
    Number((summary.totalPaid || 0).toFixed(2)),
    Number((summary.outstanding || 0).toFixed(2))
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 18; });
  sheet.getColumn(3).width = 30;
  return workbook;
}

/**
 * Generate PDF for Employee Salary Ledger
 */
function buildLedgerPDF(res, employee, transactions, summary = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'portrait' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Ledger_${employee.name.replace(/\s+/g, '_')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text('PixxTechnologies UK', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(`Employee Salary & Payment Ledger`, { align: 'center' });
  doc.fontSize(10).font('Helvetica-Oblique').text(
    `Employee: ${employee.name} (${employee.employeeId}) | Generated By: ${generatedBy}`,
    { align: 'center' }
  );
  doc.moveDown(0.8);

  let y = doc.y;
  doc.fontSize(8.5).font('Helvetica-Bold');
  doc.text('Date', 25, y);
  doc.text('Type', 95, y);
  doc.text('Description', 190, y);
  doc.text('Earned (£)', 360, y);
  doc.text('Paid (£)', 430, y);
  doc.text('Balance (£)', 500, y);

  doc.moveTo(25, y + 13).lineTo(570, y + 13).stroke();
  doc.font('Helvetica').fontSize(8);
  y += 18;

  transactions.forEach(t => {
    if (y > 750) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'portrait' });
      y = 30;
    }
    doc.text(t.date ? new Date(t.date).toLocaleDateString('en-GB') : '', 25, y);
    doc.text((t.transactionType || '').replace('_', ' '), 95, y);
    doc.text((t.description || '').slice(0, 32), 190, y);
    doc.text(`£${(t.amountEarned || 0).toFixed(2)}`, 360, y);
    doc.text(`£${(t.amountPaid || 0).toFixed(2)}`, 430, y);
    doc.text(`£${(t.runningBalance || 0).toFixed(2)}`, 500, y);
    y += 14;
  });

  const summaryY = Math.min(y + 10, 750);
  doc.rect(25, summaryY, 545, 26).fillAndStroke('#ecfdf5', '#10b981');
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(8.5);
  doc.text(
    `TOTALS: Total Earned: £${(summary.totalEarned || 0).toFixed(2)} | Total Paid: £${(summary.totalPaid || 0).toFixed(2)} | OUTSTANDING BALANCE: £${(summary.outstanding || 0).toFixed(2)}`,
    35,
    summaryY + 8
  );

  doc.end();
}

module.exports = {
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
};
