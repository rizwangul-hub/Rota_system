const ExcelJS = require('exceljs');
require('./pdfkitFontPatch'); // Must be before PDFDocument — patches font resolution for Vercel
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

// ── SHOP COLOR PALETTE & HELPERS ─────────────────────────
const SHOP_COLORS = {
  Camden: {
    primary: '#0D9488',
    lightBg: '#F0FDFA',
    text: '#0F766E',
    border: '#5EEAD4',
    excelBg: 'FFF0FDFA',
    excelText: 'FF0F766E',
    excelBorder: 'FF5EEAD4'
  },
  Chelsea: {
    primary: '#4338CA',
    lightBg: '#EEF2FF',
    text: '#3730A3',
    border: '#A5B4FC',
    excelBg: 'FFEEF2FF',
    excelText: 'FF3730A3',
    excelBorder: 'FFA5B4FC'
  },
  Edgware: {
    primary: '#7E22CE',
    lightBg: '#FAF5FF',
    text: '#6B21A8',
    border: '#D8B4FE',
    excelBg: 'FFFAF5FF',
    excelText: 'FF6B21A8',
    excelBorder: 'FFD8B4FE'
  },
  Southwark: {
    primary: '#D97706',
    lightBg: '#FFFBEB',
    text: '#92400E',
    border: '#FCD34D',
    excelBg: 'FFFFFBEB',
    excelText: 'FF92400E',
    excelBorder: 'FFFCD34D'
  },
  Station: {
    primary: '#0284C7',
    lightBg: '#F0F9FF',
    text: '#0369A1',
    border: '#7DD3FC',
    excelBg: 'FFF0F9FF',
    excelText: 'FF0369A1',
    excelBorder: 'FF7DD3FC'
  },
  Leebridge: {
    primary: '#E11D48',
    lightBg: '#FFF1F2',
    text: '#9F1239',
    border: '#FDA4AF',
    excelBg: 'FFFFF1F2',
    excelText: 'FF9F1239',
    excelBorder: 'FFFDA4AF'
  },
  'ABSENT / OFF': {
    primary: '#991B1B',
    lightBg: '#FEF2F2',
    text: '#B91C1C',
    border: '#FECACA',
    excelBg: 'FFFEF2F2',
    excelText: 'FFB91C1C',
    excelBorder: 'FFFECACA'
  },
  Absent: {
    primary: '#991B1B',
    lightBg: '#FEF2F2',
    text: '#B91C1C',
    border: '#FECACA',
    excelBg: 'FFFEF2F2',
    excelText: 'FFB91C1C',
    excelBorder: 'FFFECACA'
  }
};

const FALLBACK_PALETTE = [
  { primary: '#0891B2', lightBg: '#ECFEFF', text: '#0E7490', border: '#67E8F9', excelBg: 'FFECFEFF', excelText: 'FF0E7490', excelBorder: 'FF67E8F9' },
  { primary: '#059669', lightBg: '#ECFDF5', text: '#047857', border: '#6EE7B7', excelBg: 'FFECFDF5', excelText: 'FF047857', excelBorder: 'FF6EE7B7' },
  { primary: '#DB2777', lightBg: '#FDF2F8', text: '#BE185D', border: '#F472B6', excelBg: 'FFFDF2F8', excelText: 'FFBE185D', excelBorder: 'FFF472B6' },
  { primary: '#EA580C', lightBg: '#FFF7ED', text: '#C2410C', border: '#FDBA74', excelBg: 'FFFFF7ED', excelText: 'FFC2410C', excelBorder: 'FFFDBA74' },
  { primary: '#65A30D', lightBg: '#F7FEE7', text: '#4D7C0F', border: '#BEF264', excelBg: 'FFF7FEE7', excelText: 'FF4D7C0F', excelBorder: 'FFBEF264' }
];

function getShopColor(shopName) {
  if (!shopName) return SHOP_COLORS.Absent;
  const match = Object.keys(SHOP_COLORS).find(k => k.toLowerCase() === String(shopName).trim().toLowerCase());
  if (match) return SHOP_COLORS[match];
  let hash = 0;
  for (let i = 0; i < shopName.length; i++) hash = shopName.charCodeAt(i) + ((hash << 5) - hash);
  const idx = Math.abs(hash) % FALLBACK_PALETTE.length;
  return FALLBACK_PALETTE[idx];
}

function sortDailyAttendanceRecords(records) {
  if (!Array.isArray(records)) return [];
  return [...records].sort((a, b) => {
    const aAbsent = a.status === 'Absent';
    const bAbsent = b.status === 'Absent';
    if (aAbsent && !bAbsent) return 1;
    if (!aAbsent && bAbsent) return -1;
    if (!aAbsent && !bAbsent) {
      const sDiff = (a.shopName || '').localeCompare(b.shopName || '');
      if (sDiff !== 0) return sDiff;
    }
    return (a.employeeName || '').localeCompare(b.employeeName || '');
  });
}

/**
 * Generate Excel workbook for Daily Attendance — visually rich, grouped by shop
 */
async function buildDailyAttendanceExcel(records, dateStr) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PixxTechnologies Rota System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Daily Attendance', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  });

  // ── COLOUR PALETTE ──────────────────────────────────────────────────────────
  const C = {
    navy:       'FF0F172A',
    navyMid:    'FF1E293B',
    blue:       'FF2563EB',
    blueLight:  'FFEFF6FF',
    slate:      'FF64748B',
    slateLight: 'FFF1F5F9',
    white:      'FFFFFFFF',
    border:     'FFE2E8F0',
    darkBorder: 'FFCBD5E1',
    // KPI colours
    kpiPresent: { bg: 'FFdcfce7', font: 'FF166534', label: 'FF16a34a' },
    kpiLate:    { bg: 'FFFEF3C7', font: 'FFB45309', label: 'FFD97706' },
    kpiHalf:    { bg: 'FFE0F2FE', font: 'FF0369A1', label: 'FF0284C7' },
    kpiAbsent:  { bg: 'FFFEE2E2', font: 'FF991B1B', label: 'FFDC2626' },
    kpiTotal:   { bg: 'FFEFF6FF', font: 'FF1D4ED8', label: 'FF2563EB' }
  };

  const sortedRecords = sortDailyAttendanceRecords(records);
  const preparedBy = sortedRecords.find(r => r.createdByName)?.createdByName || 'Usman Salahuddin';
  const verifiedBy = sortedRecords.find(r => r.checkedByName)?.checkedByName || 'Sarfraz Khan';

  const totalPresent = records.filter(r => r.status === 'Present').length;
  const totalLate    = records.filter(r => r.status === 'Late').length;
  const totalHalf    = records.filter(r => r.status === 'Half').length;
  const totalAbsent  = records.filter(r => r.status === 'Absent').length;

  // Helper: apply fill + font
  const applyCell = (cell, { bg, fontColor, bold = false, size = 10, italic = false, align = 'left', wrapText = false }) => {
    if (bg)        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    if (fontColor) cell.font = { name: 'Calibri', size, bold, italic, color: { argb: fontColor } };
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText };
  };

  const thinBorder = (argb) => ({ style: 'thin', color: { argb } });
  const medBorder  = (argb) => ({ style: 'medium', color: { argb } });

  const setAllBorders = (cell, style, argb) => {
    const b = style === 'medium' ? medBorder(argb) : thinBorder(argb);
    cell.border = { top: b, bottom: b, left: b, right: b };
  };

  // ── ROW 1: MAIN TITLE BANNER ──────────────────────────────────────────────
  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = '  🚴  PIXX ROTA  ·  DAILY WORKFORCE ATTENDANCE';
  applyCell(titleCell, { bg: C.navy, fontColor: C.white, bold: true, size: 14, align: 'left' });
  sheet.getRow(1).height = 40;

  // Accent stripe via border (left thick blue stripe visual)
  titleCell.border = { left: { style: 'thick', color: { argb: C.blue } }, bottom: { style: 'medium', color: { argb: C.blue } } };

  // ── ROW 2: DATE + SUBTITLE BAR ────────────────────────────────────────────
  sheet.mergeCells('A2:E2');
  const dateCell = sheet.getCell('A2');
  dateCell.value = `📅  Date: ${dateStr}   ·   Times in 12-Hour (AM/PM)   ·   All Active Shops`;
  applyCell(dateCell, { bg: C.slateLight, fontColor: C.slate, size: 9, italic: true, align: 'left' });

  sheet.mergeCells('F2:H2');
  const prepCell = sheet.getCell('F2');
  prepCell.value = `Prepared by: ${preparedBy}  |  Verified by: ${verifiedBy}`;
  applyCell(prepCell, { bg: C.slateLight, fontColor: C.slate, size: 9, italic: true, align: 'right' });
  sheet.getRow(2).height = 22;

  // ── ROWS 3–4: KPI SUMMARY CARDS ──────────────────────────────────────────
  // Row 3: Labels, Row 4: Values — 5 KPIs across 8 columns (cols A-B, C, D-E, F, G-H)
  const kpis = [
    { label: 'TOTAL STAFF',   value: records.length,  ...C.kpiTotal },
    { label: 'PRESENT',        value: totalPresent,    ...C.kpiPresent },
    { label: 'LATE ARRIVALS',  value: totalLate,       ...C.kpiLate },
    { label: 'HALF DAY',       value: totalHalf,       ...C.kpiHalf },
    { label: 'ABSENT / OFF',   value: totalAbsent,     ...C.kpiAbsent }
  ];

  // Merge spans for 5 KPIs across 8 cols: A-B, C, D-E, F, G-H
  const kpiRanges = ['A3:B4', 'C3:C4', 'D3:E4', 'F3:F4', 'G3:H4'];
  sheet.getRow(3).height = 14;
  sheet.getRow(4).height = 38;

  kpis.forEach(({ label, value, bg, font, label: labelColor }, i) => {
    const range = kpiRanges[i];
    sheet.mergeCells(range);
    const startCol = range.split(':')[0].replace(/\d/, '');
    const startRow = parseInt(range.match(/\d+/)[0]);
    const cell = sheet.getCell(`${startCol}${startRow}`);
    cell.value = { richText: [
      { text: String(value), font: { name: 'Calibri', size: 18, bold: true, color: { argb: font } } },
      { text: `\n${label}`, font: { name: 'Calibri', size: 7.5, bold: true, color: { argb: font } } }
    ]};
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top:    medBorder(font),
      bottom: medBorder(font),
      left:   thinBorder(font),
      right:  thinBorder(font)
    };
  });

  // ── ROW 5: BLANK SPACER ──────────────────────────────────────────────────
  sheet.getRow(5).height = 6;

  // ── ROW 6: TABLE COLUMN HEADERS ──────────────────────────────────────────
  const headers = ['#', 'Worker Name', 'Shift Start', 'Shift End', 'Arrival (Time In)', 'Left At', 'Hours', 'Status'];
  const headerRow = sheet.addRow(headers); // row 6
  headerRow.height = 30;
  headerRow.eachCell((cell, col) => {
    applyCell(cell, { bg: C.blue, fontColor: C.white, bold: true, size: 10, align: col === 2 ? 'left' : 'center' });
    cell.border = {
      top:    medBorder(C.navy),
      bottom: medBorder(C.navy),
      left:   thinBorder('FF3B82F6'),
      right:  thinBorder('FF3B82F6')
    };
  });

  // ── SHOP-GROUPED DATA ROWS ────────────────────────────────────────────────
  // Group records by shop (absent group goes last)
  const shopGroups = {};
  sortedRecords.forEach(r => {
    const key = r.status === 'Absent' ? 'ABSENT / OFF' : (r.shopName || 'Unknown');
    if (!shopGroups[key]) shopGroups[key] = [];
    shopGroups[key].push(r);
  });

  const shopOrder = Object.keys(shopGroups).sort((a, b) => {
    if (a === 'ABSENT / OFF') return 1;
    if (b === 'ABSENT / OFF') return -1;
    return a.localeCompare(b);
  });

  let dataRowStart = 7; // first data row after header

  shopOrder.forEach(shopName => {
    const group = shopGroups[shopName];
    const isAbsentGroup = shopName === 'ABSENT / OFF';
    const sc = getShopColor(isAbsentGroup ? 'Absent' : shopName);

    // ── SHOP SECTION HEADER ──────────────────────────────────────────────
    const shopHeaderRow = sheet.addRow([]);
    sheet.mergeCells(`A${shopHeaderRow.number}:H${shopHeaderRow.number}`);
    const shopHeaderCell = sheet.getCell(`A${shopHeaderRow.number}`);
    shopHeaderCell.value = isAbsentGroup
      ? `  ✖  ABSENT / OFF DUTY  —  ${group.length} Staff`
      : `  ●  ${shopName.toUpperCase()}  —  ${group.length} ${group.length === 1 ? 'Worker' : 'Workers'}`;
    shopHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.excelText.replace('FF', 'FF') } };
    shopHeaderCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } };
    shopHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
    shopHeaderCell.border = {
      top:    medBorder(sc.excelText),
      bottom: { style: 'thin', color: { argb: C.white } },
      left:   medBorder(sc.excelText),
      right:  medBorder(sc.excelText)
    };
    shopHeaderRow.height = 22;

    // ── STAFF ROWS ───────────────────────────────────────────────────────
    group.forEach((r, idx) => {
      const isLate = r.status === 'Late' || (r.lateMinutes && r.lateMinutes > 0);
      const arrivalDisplay = r.timeReached
        ? formatTime12Hour(r.timeReached) + (isLate && r.lateMinutes ? `  (+${r.lateMinutes}m)` : '')
        : '--';

      const workedHrs = (r.actualHours !== undefined && r.actualHours !== null)
        ? `${Number(r.actualHours).toFixed(1)}h` : '--';

      const rowData = isAbsentGroup
        ? [idx + 1, r.employeeName || '', '', '', '', '', '', 'Absent / Off']
        : [
            idx + 1,
            r.employeeName || '',
            formatTime12Hour(r.shiftStart) || '--',
            formatTime12Hour(r.shiftEnd) || '--',
            arrivalDisplay,
            formatTime12Hour(r.workerEndTime) || '--',
            workedHrs,
            r.status || 'Present'
          ];

      const dataRow = sheet.addRow(rowData);
      dataRow.height = 26;

      const isEven = idx % 2 === 0;
      const rowBg = isAbsentGroup ? 'FFFFF5F5' : (isEven ? C.white : 'FFF8FAFC');

      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.font = { name: 'Calibri', size: 10, color: { argb: C.navyMid } };
        cell.alignment = { horizontal: colNum === 2 ? 'left' : 'center', vertical: 'middle' };
        cell.border = {
          top:    thinBorder(C.border),
          bottom: thinBorder(C.border),
          left:   thinBorder(isAbsentGroup ? sc.excelBorder : C.border),
          right:  thinBorder(isAbsentGroup ? sc.excelBorder : C.border)
        };
      });

      // # (row number): slate
      dataRow.getCell(1).font = { name: 'Calibri', size: 9, color: { argb: C.slate } };

      // Worker Name: bold
      dataRow.getCell(2).font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: isAbsentGroup ? 'FF991B1B' : C.navy } };

      // Arrival Time: green if on time, amber if late, red if absent
      if (!isAbsentGroup) {
        const arrCell = dataRow.getCell(5);
        if (r.timeReached) {
          const arrColor = isLate ? 'FFB45309' : 'FF15803D';
          const arrBg    = isLate ? 'FFFEF3C7' : 'FFdcfce7';
          arrCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: arrColor } };
          arrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: arrBg } };
        } else {
          arrCell.font = { name: 'Calibri', size: 9, color: { argb: C.slate } };
        }
      }

      // Status badge cell
      const statusCell = dataRow.getCell(8);
      const statusMap = {
        Present: { bg: 'FFdcfce7', font: 'FF166534' },
        Late:    { bg: 'FFFEF3C7', font: 'FFB45309' },
        Half:    { bg: 'FFE0F2FE', font: 'FF0369A1' },
        Absent:  { bg: 'FFFEE2E2', font: 'FF991B1B' }
      };
      const sColor = statusMap[r.status] || statusMap.Present;
      statusCell.value = isAbsentGroup ? 'ABSENT' : (r.status || 'Present').toUpperCase();
      statusCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: sColor.font } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sColor.bg } };
      statusCell.border = {
        top:    thinBorder(sColor.font),
        bottom: thinBorder(sColor.font),
        left:   thinBorder(sColor.font),
        right:  thinBorder(sColor.font)
      };
    });

    // ── SHOP SUBTOTAL ROW ────────────────────────────────────────────────
    const presentCount = group.filter(r => r.status === 'Present').length;
    const lateCount    = group.filter(r => r.status === 'Late').length;
    const subtotalRow  = sheet.addRow([]);
    sheet.mergeCells(`A${subtotalRow.number}:B${subtotalRow.number}`);
    const subtotalLabelCell = sheet.getCell(`A${subtotalRow.number}`);
    subtotalLabelCell.value = isAbsentGroup
      ? `  Total Absent / Off: ${group.length}`
      : `  ${shopName}  —  Total: ${group.length}   Present: ${presentCount}   Late: ${lateCount}`;
    subtotalLabelCell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: sc.excelText } };
    subtotalLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.excelBg } };
    subtotalLabelCell.alignment = { horizontal: 'left', vertical: 'middle' };
    subtotalRow.height = 18;

    // Merge rest of subtotal row
    sheet.mergeCells(`C${subtotalRow.number}:H${subtotalRow.number}`);
    const subtotalRestCell = sheet.getCell(`C${subtotalRow.number}`);
    subtotalRestCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.excelBg } };

    // thick bottom border on subtotal row (visual separator between shops)
    ['A','B','C','D','E','F','G','H'].forEach(col => {
      sheet.getCell(`${col}${subtotalRow.number}`).border = {
        bottom: medBorder(sc.excelBorder),
        left:   thinBorder(sc.excelBorder),
        right:  thinBorder(sc.excelBorder)
      };
    });

    // Spacer
    sheet.addRow([]).height = 4;
  });

  // ── GRAND SUMMARY FOOTER ──────────────────────────────────────────────────
  sheet.addRow([]).height = 8;

  const summaryRow = sheet.addRow([
    'TOTAL WORKERS', records.length,
    'PRESENT', totalPresent,
    'LATE', totalLate,
    'HALF DAY', totalHalf
  ]);
  summaryRow.height = 30;

  // Merge summary cells into pairs: A-B, C-D, E-F, G-H
  const sumPairs = [['A','B'], ['C','D'], ['E','F'], ['G','H']];
  const sumColors = [
    { bg: 'FFEFF6FF', font: C.blue },
    { bg: 'FFdcfce7', font: 'FF166534' },
    { bg: 'FFFEF3C7', font: 'FFB45309' },
    { bg: 'FFE0F2FE', font: 'FF0369A1' }
  ];

  sumPairs.forEach(([c1, c2], idx) => {
    const row = summaryRow.number;
    sheet.mergeCells(`${c1}${row}:${c2}${row}`);
    const cell = sheet.getCell(`${c1}${row}`);
    const col = sumColors[idx];
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: col.font } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.bg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: medBorder(col.font), bottom: medBorder(col.font), left: thinBorder(col.font), right: thinBorder(col.font) };
  });

  // ── SIGN-OFF / VERIFICATION CARDS ─────────────────────────────────────────
  sheet.addRow([]).height = 12;

  const sigHeaderRow = sheet.addRow(['SUBMITTED BY — ATTENDANCE OPERATOR', '', '', '', 'VERIFIED BY — ATTENDANCE CHECKER', '', '', '']);
  const sigHIdx = sigHeaderRow.number;
  sheet.mergeCells(`A${sigHIdx}:D${sigHIdx}`);
  sheet.mergeCells(`E${sigHIdx}:H${sigHIdx}`);
  sigHeaderRow.height = 22;

  [['A', C.blue], ['E', 'FF047857']].forEach(([col, color]) => {
    const cell = sheet.getCell(`${col}${sigHIdx}`);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: medBorder(color), left: medBorder(color), right: medBorder(color), bottom: thinBorder(C.border) };
  });

  const sigNameRow = sheet.addRow([preparedBy, '', '', '', verifiedBy, '', '', '']);
  const sigNIdx = sigNameRow.number;
  sheet.mergeCells(`A${sigNIdx}:D${sigNIdx}`);
  sheet.mergeCells(`E${sigNIdx}:H${sigNIdx}`);
  sigNameRow.height = 30;

  [['A', C.blue, 'FFEFF6FF'], ['E', '047857', 'FFECFDF5']].forEach(([col, fontColor, bgColor]) => {
    const cell = sheet.getCell(`${col}${sigNIdx}`);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF' + fontColor } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { left: medBorder('FF' + fontColor), right: medBorder('FF' + fontColor) };
  });

  const sigTitleRow = sheet.addRow([
    'Attendance Operator  ·  PixxTechnologies UK', '', '', '',
    'Attendance Checker  ·  PixxTechnologies UK', '', '', ''
  ]);
  const sigTIdx = sigTitleRow.number;
  sheet.mergeCells(`A${sigTIdx}:D${sigTIdx}`);
  sheet.mergeCells(`E${sigTIdx}:H${sigTIdx}`);
  sigTitleRow.height = 20;

  [['A', C.blue, 'FFEFF6FF'], ['E', '047857', 'FFECFDF5']].forEach(([col, fontColor, bgColor]) => {
    const cell = sheet.getCell(`${col}${sigTIdx}`);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: C.slate } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: medBorder('FF' + fontColor), left: medBorder('FF' + fontColor), right: medBorder('FF' + fontColor) };
  });

  // ── COLUMN WIDTHS ──────────────────────────────────────────────────────────
  sheet.columns = [
    { width: 5  }, // #
    { width: 28 }, // Worker Name
    { width: 13 }, // Shift Start
    { width: 13 }, // Shift End
    { width: 20 }, // Arrival (Time In)
    { width: 13 }, // Left At
    { width: 10 }, // Hours
    { width: 14 }  // Status
  ];

  // Freeze: freeze rows 1-6 (title + subtitle + KPIs + spacer + header)
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 6, showGridLines: false, activeCell: 'A7' }];
  sheet.headerFooter.oddFooter = '&LPixxTechnologies Rota System&CConfidential Attendance Record  ·  ' + dateStr + '&RPage &P of &N';
  sheet.printTitlesRow = '1:6';

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
 * Generate Excel workbook for Weekly Attendance Report (Sun - Sat Roster)
 */
async function buildWeeklyAttendanceExcel(records, weekLabel, summary = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Weekly Attendance');

  sheet.mergeCells(1, 1, 1, 11);
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Weekly Attendance Roster (${weekLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Shop', 'Employee Name', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Work Days', 'Hours Worked'
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
      r.employeeName || '',
      r.dailySchedule?.Sun || 'Off',
      r.dailySchedule?.Mon || 'Off',
      r.dailySchedule?.Tue || 'Off',
      r.dailySchedule?.Wed || 'Off',
      r.dailySchedule?.Thu || 'Off',
      r.dailySchedule?.Fri || 'Off',
      r.dailySchedule?.Sat || 'Off',
      r.workingDays || 0,
      Number((r.actualHours || 0).toFixed(2))
    ]);
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    'TOTALS',
    `Staff: ${records.length}`,
    '', '', '', '', '', '', '',
    summary.totalWorkingDays || 0,
    Number((summary.totalWorkedHours || 0).toFixed(2))
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 14; });
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 22;
  return workbook;
}

/**
 * Generate PDF for Weekly Attendance Report
 */
function streamDocToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function sendPdfOrBuffer(res, doc, filename) {
  const buffer = await streamDocToBuffer(doc);
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  }
  return buffer;
}

function drawPdfBanner(doc, title, subtitle, periodText, isLandscape = true) {
  const width = isLandscape ? 841.89 : 595.28;
  const margin = 25;
  const contentWidth = width - margin * 2;

  doc.rect(margin, 20, contentWidth, 42).fill('#0f172a');
  doc.rect(margin, 60, contentWidth, 3).fill('#2563eb');

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('PIXX ROTA', margin + 12, 28);
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(9).text('PixxTechnologies UK • Bicycle Retail & Payroll System', margin + 12, 45);

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(title, margin + contentWidth - 270, 26, { width: 260, align: 'right' });
  doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8.5).text(periodText || subtitle, margin + contentWidth - 270, 44, { width: 260, align: 'right' });
}

function drawKpiCard(doc, x, y, width, label, value, color = '#2563eb') {
  doc.rect(x, y, width, 45).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.rect(x, y, width, 3).fill(color);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(12).text(value, x + 8, y + 10);
  doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7).text(label, x + 8, y + 28);
}

function drawPdfSignatures(doc, yPos, isLandscape = true) {
  const width = isLandscape ? 841.89 : 595.28;
  const margin = 25;
  const cardWidth = isLandscape ? 385 : 260;
  const gap = isLandscape ? 20 : 25;

  let y = yPos;
  if (y > (isLandscape ? 470 : 690)) {
    doc.addPage({ margin: 25, size: 'A4', layout: isLandscape ? 'landscape' : 'portrait' });
    y = 40;
  }

  doc.rect(margin, y, cardWidth, 52).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.rect(margin, y, cardWidth, 3).fill('#2563eb');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('USMAN AHMAD', margin + 10, y + 8);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('Attendance Operator • Roster Entry & Logged Hours', margin + 10, y + 21);
  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8).text('✓ RECORDED & SUBMITTED', margin + 10, y + 35);

  const box2X = margin + cardWidth + gap;
  doc.rect(box2X, y, cardWidth, 52).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.rect(box2X, y, cardWidth, 3).fill('#10b981');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('SARFRAZ AHMAD', box2X + 10, y + 8);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('Attendance Checker / Manager • Verification & Approval Audit', box2X + 10, y + 21);
  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8).text('✓ AUDITED & APPROVED', box2X + 10, y + 35);

  doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5).text(
    `PIXX ROTA • Official Business Record • Generated on ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    margin, y + 60, { align: 'center', width: width - margin * 2 }
  );
}

/**
 * Generate PDF for Weekly Attendance Report (Sun - Sat Workplace Schedule)
 */
async function buildWeeklyAttendancePDF(res, records, weekLabel, summary = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'Weekly Attendance Schedule', 'Sun - Sat Workplace Roster', `Week: ${weekLabel}`, true);

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 245, 'TOTAL STAFF', String(records.length), '#2563eb');
  drawKpiCard(doc, 295, kpiY, 245, 'TOTAL WORK DAYS', String(summary.totalWorkingDays || 0), '#059669');
  drawKpiCard(doc, 565, kpiY, 250, 'TOTAL HOURS WORKED', `${(summary.totalWorkedHours || 0).toFixed(1)}h`, '#d97706');

  let y = 135;

  // Group records by shop (with Absent at bottom)
  const shopGroups = {};
  records.forEach(r => {
    const sName = r.status === 'Absent' ? 'ABSENT / OFF' : (r.shopName || 'Unknown Shop');
    if (!shopGroups[sName]) shopGroups[sName] = [];
    shopGroups[sName].push(r);
  });

  const sortedShopNames = Object.keys(shopGroups).sort((a, b) => {
    if (a === 'ABSENT / OFF') return 1;
    if (b === 'ABSENT / OFF') return -1;
    return a.localeCompare(b);
  });

  const sectionHeaderH = 18;
  const tableHeaderH = 16;
  const rowH = 16;

  sortedShopNames.forEach(shopName => {
    const group = shopGroups[shopName];
    const isAbsentGroup = shopName === 'ABSENT / OFF';
    const sc = getShopColor(isAbsentGroup ? 'ABSENT / OFF' : shopName);

    // Check page overflow
    if (y + sectionHeaderH + tableHeaderH + rowH > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }

    // 1. Shop Header Banner Bar
    const headerBg = sc.primary || '#1e293b';
    doc.roundedRect(25, y, 790, sectionHeaderH, 3).fill(headerBg);
    doc.circle(34, y + 9, 2.5).fill('#ffffff');

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
       .text(isAbsentGroup ? 'ABSENT / OFF DUTY' : `${shopName.toUpperCase()} CYCLES`, 42, y + 4.5, { lineBreak: false });

    const countText = isAbsentGroup
      ? `${group.length} Staff Off / Absent`
      : `${group.length} ${group.length === 1 ? 'Worker' : 'Workers'} Assigned`;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
       .text(countText, 550, y + 5, { width: 255, align: 'right', lineBreak: false });

    y += sectionHeaderH;

    // 2. Table Column Headers
    doc.rect(25, y, 790, tableHeaderH).fill(sc.lightBg || '#f1f5f9');
    doc.fillColor(sc.text || '#334155').font('Helvetica-Bold').fontSize(7.5);

    doc.text('WORKER NAME', 35, y + 4, { width: 175, lineBreak: false });
    doc.text('Sun', 220, y + 4, { width: 50, align: 'center', lineBreak: false });
    doc.text('Mon', 275, y + 4, { width: 50, align: 'center', lineBreak: false });
    doc.text('Tue', 330, y + 4, { width: 50, align: 'center', lineBreak: false });
    doc.text('Wed', 385, y + 4, { width: 50, align: 'center', lineBreak: false });
    doc.text('Thu', 440, y + 4, { width: 50, align: 'center', lineBreak: false });
    doc.text('Fri', 495, y + 4, { width: 50, align: 'center', lineBreak: false });
    doc.text('Sat', 550, y + 4, { width: 50, align: 'center', lineBreak: false });
    doc.text('Work Days', 615, y + 4, { width: 60, align: 'center', lineBreak: false });
    doc.text('Hours (h)', 690, y + 4, { width: 70, align: 'center', lineBreak: false });

    y += tableHeaderH;

    // 3. Rows for this Shop
    let shopDays = 0;
    let shopHours = 0;

    group.forEach((r, idx) => {
      if (y + rowH > 520) {
        doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
        y = 30;
        doc.rect(25, y, 790, tableHeaderH).fill(sc.lightBg || '#f1f5f9');
        doc.fillColor(sc.text || '#334155').font('Helvetica-Bold').fontSize(7.5);
        doc.text('WORKER NAME', 35, y + 4, { width: 175, lineBreak: false });
        doc.text('Sun', 220, y + 4, { width: 50, align: 'center', lineBreak: false });
        doc.text('Mon', 275, y + 4, { width: 50, align: 'center', lineBreak: false });
        doc.text('Tue', 330, y + 4, { width: 50, align: 'center', lineBreak: false });
        doc.text('Wed', 385, y + 4, { width: 50, align: 'center', lineBreak: false });
        doc.text('Thu', 440, y + 4, { width: 50, align: 'center', lineBreak: false });
        doc.text('Fri', 495, y + 4, { width: 50, align: 'center', lineBreak: false });
        doc.text('Sat', 550, y + 4, { width: 50, align: 'center', lineBreak: false });
        doc.text('Work Days', 615, y + 4, { width: 60, align: 'center', lineBreak: false });
        doc.text('Hours (h)', 690, y + 4, { width: 70, align: 'center', lineBreak: false });
        y += tableHeaderH;
      }

      shopDays += r.workingDays || 0;
      shopHours += r.actualHours || 0;

      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(25, y, 790, rowH).fill(bg);
      doc.rect(25, y, 3, rowH).fill(sc.primary || '#2563eb');

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      doc.text((r.employeeName || '').slice(0, 24), 35, y + 3.5, { width: 175, lineBreak: false });
      doc.font('Helvetica').fontSize(7.5);
      doc.text((r.dailySchedule?.Sun || 'Off').slice(0, 8), 220, y + 4, { width: 50, align: 'center', lineBreak: false });
      doc.text((r.dailySchedule?.Mon || 'Off').slice(0, 8), 275, y + 4, { width: 50, align: 'center', lineBreak: false });
      doc.text((r.dailySchedule?.Tue || 'Off').slice(0, 8), 330, y + 4, { width: 50, align: 'center', lineBreak: false });
      doc.text((r.dailySchedule?.Wed || 'Off').slice(0, 8), 385, y + 4, { width: 50, align: 'center', lineBreak: false });
      doc.text((r.dailySchedule?.Thu || 'Off').slice(0, 8), 440, y + 4, { width: 50, align: 'center', lineBreak: false });
      doc.text((r.dailySchedule?.Fri || 'Off').slice(0, 8), 495, y + 4, { width: 50, align: 'center', lineBreak: false });
      doc.text((r.dailySchedule?.Sat || 'Off').slice(0, 8), 550, y + 4, { width: 50, align: 'center', lineBreak: false });
      doc.text(String(r.workingDays || 0), 615, y + 4, { width: 60, align: 'center', lineBreak: false });
      doc.text(`${(r.actualHours || 0).toFixed(1)}h`, 690, y + 4, { width: 70, align: 'center', lineBreak: false });
      y += rowH;
    });

    // Shop Subtotal Bar
    if (y + 15 > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    doc.rect(25, y, 790, 15).fill(sc.lightBg || '#f1f5f9');
    doc.rect(25, y, 3, 15).fill(sc.primary || '#2563eb');
    doc.fillColor(sc.text || '#0f172a').font('Helvetica-Bold').fontSize(7.5);
    doc.text(`SUBTOTAL — ${shopName.toUpperCase()}`, 35, y + 3.5, { lineBreak: false });
    doc.text(`Staff: ${group.length}`, 450, y + 3.5, { lineBreak: false });
    doc.text(`Total Days: ${shopDays}`, 600, y + 3.5, { lineBreak: false });
    doc.text(`Total Hours: ${shopHours.toFixed(1)}h`, 690, y + 3.5, { lineBreak: false });
    y += 21;
  });

  drawPdfSignatures(doc, y + 15, true);
  return await sendPdfOrBuffer(res, doc, `Weekly_Attendance_${weekLabel.replace(/[\/–\s]/g, '_')}.pdf`);
}

/**
 * Generate Excel workbook for Weekly Salary Report
 */
async function buildWeeklySalaryExcel(salaries, weekLabel, totals = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Weekly Salary');

  sheet.mergeCells('A1:K1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Weekly Salary Report (${weekLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Shop', 'Employee Name', 'Week Period',
    'Attendance Pay (£)', 'Allowances (£)', 'Bonus (£)',
    'Deductions (£)', 'Final Salary (£)', 'Paid (£)', 'Outstanding (£)', 'Status'
  ];
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  salaries.forEach(s => {
    const allow = (s.travelAllowance || 0) + (s.otherAllowances || 0);
    sheet.addRow([
      s.shopName || '',
      s.employeeName || '',
      s.weekLabel || weekLabel,
      Number((s.netAttendancePay || 0).toFixed(2)),
      Number(allow.toFixed(2)),
      Number((s.bonus || 0).toFixed(2)),
      Number((s.manualDeductions || 0).toFixed(2)),
      Number((s.finalSalary || 0).toFixed(2)),
      Number((s.totalPaid || 0).toFixed(2)),
      Number((s.balanceRemaining || 0).toFixed(2)),
      s.status || 'FINALIZED'
    ]);
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    'TOTALS', `Staff: ${salaries.length}`, '',
    Number((totals.totalAttendancePay || 0).toFixed(2)),
    Number((totals.totalAllowances || 0).toFixed(2)),
    Number((totals.totalBonus || 0).toFixed(2)),
    Number((totals.totalDeductions || 0).toFixed(2)),
    Number((totals.totalFinalSalary || 0).toFixed(2)),
    Number((totals.totalPaid || 0).toFixed(2)),
    Number((totals.totalOutstanding || 0).toFixed(2)),
    ''
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 24;
  return workbook;
}

/**
 * Generate PDF for Weekly Salary Report
 */
async function buildWeeklySalaryPDF(res, salaries, weekLabel, totals = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'Weekly Salary Report', 'Weekly Payroll & Salary Distribution', `Week: ${weekLabel}`, true);

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 120, 'STAFF COUNT', String(salaries.length), '#2563eb');
  drawKpiCard(doc, 155, kpiY, 125, 'ATTENDANCE PAY', `£${(totals.totalAttendancePay || 0).toFixed(2)}`, '#059669');
  drawKpiCard(doc, 290, kpiY, 125, 'ALLOWANCES', `£${(totals.totalAllowances || 0).toFixed(2)}`, '#10b981');
  drawKpiCard(doc, 425, kpiY, 125, 'BONUS', `£${(totals.totalBonus || 0).toFixed(2)}`, '#d97706');
  drawKpiCard(doc, 560, kpiY, 125, 'FINAL SALARY', `£${(totals.totalFinalSalary || 0).toFixed(2)}`, '#2563eb');
  drawKpiCard(doc, 695, kpiY, 120, 'OUTSTANDING', `£${(totals.totalOutstanding || 0).toFixed(2)}`, '#dc2626');

  let y = 135;

  // Group salaries by shop
  const shopGroups = {};
  salaries.forEach(s => {
    const sName = s.shopName || 'Unknown Shop';
    if (!shopGroups[sName]) shopGroups[sName] = [];
    shopGroups[sName].push(s);
  });

  const sortedShopNames = Object.keys(shopGroups).sort((a, b) => a.localeCompare(b));

  const sectionHeaderH = 18;
  const tableHeaderH = 16;
  const rowH = 16;

  sortedShopNames.forEach(shopName => {
    const group = shopGroups[shopName];
    const sc = getShopColor(shopName);

    // Check page overflow
    if (y + sectionHeaderH + tableHeaderH + rowH > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }

    // 1. Shop Header Banner Bar
    const headerBg = sc.primary || '#1e293b';
    doc.roundedRect(25, y, 790, sectionHeaderH, 3).fill(headerBg);
    doc.circle(34, y + 9, 2.5).fill('#ffffff');

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
       .text(`${shopName.toUpperCase()} CYCLES`, 42, y + 4.5, { lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
       .text(`${group.length} ${group.length === 1 ? 'Worker' : 'Workers'} Payroll`, 550, y + 5, { width: 255, align: 'right', lineBreak: false });

    y += sectionHeaderH;

    // 2. Table Column Headers
    doc.rect(25, y, 790, tableHeaderH).fill(sc.lightBg || '#f1f5f9');
    doc.fillColor(sc.text || '#334155').font('Helvetica-Bold').fontSize(7.5);

    doc.text('EMPLOYEE NAME', 35, y + 4, { width: 170, lineBreak: false });
    doc.text('Attendance Pay', 215, y + 4, { width: 75, align: 'right', lineBreak: false });
    doc.text('Allowances', 295, y + 4, { width: 65, align: 'right', lineBreak: false });
    doc.text('Bonus', 365, y + 4, { width: 55, align: 'right', lineBreak: false });
    doc.text('Deductions', 425, y + 4, { width: 65, align: 'right', lineBreak: false });
    doc.text('Final Salary', 495, y + 4, { width: 80, align: 'right', lineBreak: false });
    doc.text('Paid (£)', 580, y + 4, { width: 70, align: 'right', lineBreak: false });
    doc.text('Outstanding', 655, y + 4, { width: 75, align: 'right', lineBreak: false });
    doc.text('Status', 740, y + 4, { width: 70, align: 'center', lineBreak: false });

    y += tableHeaderH;

    // 3. Shop Subtotal Aggregators
    let subAtt = 0, subAllow = 0, subBonus = 0, subDed = 0, subFinal = 0, subPaid = 0, subBal = 0;

    group.forEach((s, idx) => {
      if (y + rowH > 520) {
        doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
        y = 30;
        doc.rect(25, y, 790, tableHeaderH).fill(sc.lightBg || '#f1f5f9');
        doc.fillColor(sc.text || '#334155').font('Helvetica-Bold').fontSize(7.5);
        doc.text('EMPLOYEE NAME', 35, y + 4, { width: 170, lineBreak: false });
        doc.text('Attendance Pay', 215, y + 4, { width: 75, align: 'right', lineBreak: false });
        doc.text('Allowances', 295, y + 4, { width: 65, align: 'right', lineBreak: false });
        doc.text('Bonus', 365, y + 4, { width: 55, align: 'right', lineBreak: false });
        doc.text('Deductions', 425, y + 4, { width: 65, align: 'right', lineBreak: false });
        doc.text('Final Salary', 495, y + 4, { width: 80, align: 'right', lineBreak: false });
        doc.text('Paid (£)', 580, y + 4, { width: 70, align: 'right', lineBreak: false });
        doc.text('Outstanding', 655, y + 4, { width: 75, align: 'right', lineBreak: false });
        doc.text('Status', 740, y + 4, { width: 70, align: 'center', lineBreak: false });
        y += tableHeaderH;
      }

      const allowances = (s.travelAllowance || 0) + (s.otherAllowances || 0);
      const deductions = s.manualDeductions || 0;
      subAtt += (s.netAttendancePay || 0);
      subAllow += allowances;
      subBonus += (s.bonus || 0);
      subDed += deductions;
      subFinal += (s.finalSalary || 0);
      subPaid += (s.totalPaid || 0);
      subBal += (s.balanceRemaining || 0);

      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(25, y, 790, rowH).fill(bg);
      doc.rect(25, y, 3, rowH).fill(sc.primary || '#2563eb');

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      doc.text((s.employeeName || '').slice(0, 24), 35, y + 3.5, { width: 170, lineBreak: false });
      doc.font('Helvetica').fontSize(7.5);
      doc.text(`£${(s.netAttendancePay || 0).toFixed(2)}`, 215, y + 4, { width: 75, align: 'right', lineBreak: false });
      doc.text(`£${allowances.toFixed(2)}`, 295, y + 4, { width: 65, align: 'right', lineBreak: false });
      doc.text(`£${(s.bonus || 0).toFixed(2)}`, 365, y + 4, { width: 55, align: 'right', lineBreak: false });
      doc.text(`£${deductions.toFixed(2)}`, 425, y + 4, { width: 65, align: 'right', lineBreak: false });
      doc.font('Helvetica-Bold').fillColor('#2563eb').text(`£${(s.finalSalary || 0).toFixed(2)}`, 495, y + 4, { width: 80, align: 'right', lineBreak: false }).font('Helvetica').fillColor('#0f172a');
      doc.fillColor('#059669').text(`£${(s.totalPaid || 0).toFixed(2)}`, 580, y + 4, { width: 70, align: 'right', lineBreak: false }).fillColor('#0f172a');
      doc.font('Helvetica-Bold').fillColor(s.balanceRemaining > 0 ? '#dc2626' : '#64748b').text(`£${(s.balanceRemaining || 0).toFixed(2)}`, 655, y + 4, { width: 75, align: 'right', lineBreak: false }).font('Helvetica').fillColor('#0f172a');
      doc.text(s.status || 'Generated', 740, y + 4, { width: 70, align: 'center', lineBreak: false });
      y += rowH;
    });

    // Shop Subtotal Bar
    if (y + 15 > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    doc.rect(25, y, 790, 15).fill(sc.lightBg || '#f1f5f9');
    doc.rect(25, y, 3, 15).fill(sc.primary || '#2563eb');
    doc.fillColor(sc.text || '#0f172a').font('Helvetica-Bold').fontSize(7.5);
    doc.text(`SUBTOTAL — ${shopName.toUpperCase()}`, 35, y + 3.5, { lineBreak: false });
    doc.text(`£${subAtt.toFixed(2)}`, 215, y + 3.5, { width: 75, align: 'right', lineBreak: false });
    doc.text(`£${subAllow.toFixed(2)}`, 295, y + 3.5, { width: 65, align: 'right', lineBreak: false });
    doc.text(`£${subBonus.toFixed(2)}`, 365, y + 3.5, { width: 55, align: 'right', lineBreak: false });
    doc.text(`£${subDed.toFixed(2)}`, 425, y + 3.5, { width: 65, align: 'right', lineBreak: false });
    doc.text(`£${subFinal.toFixed(2)}`, 495, y + 3.5, { width: 80, align: 'right', lineBreak: false });
    doc.text(`£${subPaid.toFixed(2)}`, 580, y + 3.5, { width: 70, align: 'right', lineBreak: false });
    doc.text(`£${subBal.toFixed(2)}`, 655, y + 3.5, { width: 75, align: 'right', lineBreak: false });
    y += 21;
  });

  drawPdfSignatures(doc, y + 15, true);
  return await sendPdfOrBuffer(res, doc, `Weekly_Salary_${weekLabel.replace(/[\/–\s]/g, '_')}.pdf`);
}

/**
 * Generate PDF for Employee Monthly Report
 */
async function buildEmployeeMonthlyPDF(res, employeeName, employeeId, shopName, monthLabel, attendanceSummary = {}, weeklyBreakdowns = [], grandTotal = {}, balancePayable = 0, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, `Employee Monthly Statement`, `${employeeName} (${employeeId}) • ${shopName}`, `Period: ${monthLabel}`, true);

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 125, 'WORK DAYS', String(attendanceSummary.workingDays || 0), '#2563eb');
  drawKpiCard(doc, 160, kpiY, 125, 'PRESENT / LATE', `${attendanceSummary.present || 0} / ${attendanceSummary.late || 0}`, '#059669');
  drawKpiCard(doc, 295, kpiY, 125, 'WORKED HOURS', `${(attendanceSummary.actualHours || 0).toFixed(1)}h`, '#d97706');
  drawKpiCard(doc, 430, kpiY, 125, 'LATE DEDUCTION', `£${(attendanceSummary.lateDeduction || 0).toFixed(2)}`, '#dc2626');
  drawKpiCard(doc, 565, kpiY, 125, 'TOTAL PAID', `£${(grandTotal.paid || 0).toFixed(2)}`, '#059669');
  drawKpiCard(doc, 700, kpiY, 115, 'OUTSTANDING', `£${(balancePayable || 0).toFixed(2)}`, '#dc2626');

  let y = 135;
  doc.rect(25, y, 790, 20).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('Week Dates', 32, y + 6);
  doc.text('Days', 190, y + 6);
  doc.text('Gross Wages (£)', 240, y + 6);
  doc.text('Deductions (£)', 330, y + 6);
  doc.text('Bonus (£)', 410, y + 6);
  doc.text('Final Salary (£)', 480, y + 6);
  doc.text('Received Date', 565, y + 6);
  doc.text('Cash (£)', 645, y + 6);
  doc.text('Bank (£)', 705, y + 6);
  doc.text('Total Paid (£)', 755, y + 6);
  y += 20;

  weeklyBreakdowns.forEach((w, idx) => {
    if (y > 470) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(25, y, 790, 16).fill(bg);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
    doc.text(w.weekDates || '', 32, y + 4);
    doc.text(String(w.days || 0), 190, y + 4);
    doc.text(`£${(w.wage || 0).toFixed(2)}`, 240, y + 4);
    doc.text(`£${(w.ded || 0).toFixed(2)}`, 330, y + 4);
    doc.text(`£${(w.bonus || 0).toFixed(2)}`, 410, y + 4);
    doc.font('Helvetica-Bold').fillColor('#2563eb').text(`£${(w.total || 0).toFixed(2)}`, 480, y + 4).font('Helvetica').fillColor('#0f172a');
    doc.text(w.receivedDate || '-', 565, y + 4);
    doc.text(`£${(w.cash || 0).toFixed(2)}`, 645, y + 4);
    doc.text(`£${(w.bank || 0).toFixed(2)}`, 705, y + 4);
    doc.font('Helvetica-Bold').fillColor('#059669').text(`£${(w.paymentTotal || 0).toFixed(2)}`, 755, y + 4).font('Helvetica').fillColor('#0f172a');
    y += 16;
  });

  drawPdfSignatures(doc, y + 15, true);
  return await sendPdfOrBuffer(res, doc, `Monthly_${employeeName.replace(/\s+/g, '_')}_${monthLabel}.pdf`);
}

/**
 * Generate Excel workbook for Employee Yearly Report
 */
async function buildEmployeeYearlyExcel(employeeName, employeeId, shopName, year, monthlyRows, yearlyTotals = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Yearly ${year}`);

  sheet.mergeCells('A1:J1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Annual Employee Payroll Report (${year}): ${employeeName.toUpperCase()}`;
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
async function buildEmployeeYearlyPDF(res, employeeName, employeeId, shopName, year, monthlyRows, yearlyTotals = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, `Annual Employee Statement`, `${employeeName} • ${shopName}`, `Year: ${year}`, true);

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 125, 'ANNUAL WORK DAYS', String(yearlyTotals.totalWorkingDays || 0), '#2563eb');
  drawKpiCard(doc, 160, kpiY, 125, 'TOTAL HOURS', `${(yearlyTotals.totalActualHours || 0).toFixed(1)}h`, '#d97706');
  drawKpiCard(doc, 295, kpiY, 125, 'ATTENDANCE PAY', `£${(yearlyTotals.totalAttendancePay || 0).toFixed(2)}`, '#059669');
  drawKpiCard(doc, 430, kpiY, 125, 'FINALIZED SALARY', `£${(yearlyTotals.totalFinalSalary || 0).toFixed(2)}`, '#2563eb');
  drawKpiCard(doc, 565, kpiY, 125, 'TOTAL PAID', `£${(yearlyTotals.totalPaid || 0).toFixed(2)}`, '#059669');
  drawKpiCard(doc, 700, kpiY, 115, 'OUTSTANDING', `£${(yearlyTotals.totalOutstanding || 0).toFixed(2)}`, '#dc2626');

  let y = 135;
  doc.rect(25, y, 790, 20).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('Month', 32, y + 6);
  doc.text('Work Days', 115, y + 6);
  doc.text('Hours (h)', 180, y + 6);
  doc.text('Att Pay (£)', 250, y + 6);
  doc.text('Allowances (£)', 330, y + 6);
  doc.text('Bonus (£)', 410, y + 6);
  doc.text('Deductions (£)', 480, y + 6);
  doc.text('Final Salary (£)', 560, y + 6);
  doc.text('Total Paid (£)', 650, y + 6);
  doc.text('Outstanding (£)', 735, y + 6);
  y += 20;

  monthlyRows.forEach((m, idx) => {
    if (y > 470) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(25, y, 790, 16).fill(bg);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
    doc.font('Helvetica-Bold').text(m.monthName, 32, y + 4).font('Helvetica');
    doc.text(String(m.workingDays || 0), 115, y + 4);
    doc.text(`${(m.actualHours || 0).toFixed(1)}h`, 180, y + 4);
    doc.text(`£${(m.attendancePay || 0).toFixed(2)}`, 250, y + 4);
    doc.text(`£${(m.allowances || 0).toFixed(2)}`, 330, y + 4);
    doc.text(`£${(m.bonus || 0).toFixed(2)}`, 410, y + 4);
    doc.text(`£${(m.deductions || 0).toFixed(2)}`, 480, y + 4);
    doc.font('Helvetica-Bold').fillColor('#2563eb').text(`£${(m.finalSalary || 0).toFixed(2)}`, 560, y + 4).font('Helvetica').fillColor('#0f172a');
    doc.fillColor('#059669').text(`£${(m.paid || 0).toFixed(2)}`, 650, y + 4).fillColor('#0f172a');
    doc.font('Helvetica-Bold').fillColor(m.outstanding > 0 ? '#dc2626' : '#64748b').text(`£${(m.outstanding || 0).toFixed(2)}`, 735, y + 4).font('Helvetica').fillColor('#0f172a');
    y += 16;
  });

  drawPdfSignatures(doc, y + 15, true);
  return await sendPdfOrBuffer(res, doc, `Annual_${employeeName.replace(/\s+/g, '_')}_${year}.pdf`);
}

/**
 * Generate PDF for Bonus Report
 */
async function buildBonusPDF(res, bonuses, month, year, totals = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'Sales Bonus & Commission', 'Monthly Retail Sales Incentives', `Period: ${month} ${year}`, true);

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 250, 'QUALIFIED STAFF', String(bonuses.length), '#2563eb');
  drawKpiCard(doc, 295, kpiY, 250, 'TOTAL RETAIL SALES LOGGED', `£${(totals.totalSales || 0).toLocaleString('en-GB')}`, '#d97706');
  drawKpiCard(doc, 565, kpiY, 250, 'TOTAL COMMISSION PAYABLE', `£${(totals.totalBonus || 0).toFixed(2)}`, '#059669');

  let y = 135;
  doc.rect(25, y, 790, 20).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('Employee Name', 32, y + 6);
  doc.text('Shop Location', 200, y + 6);
  doc.text('Commitment / Tier', 330, y + 6);
  doc.text('Sales Amount (£)', 500, y + 6);
  doc.text('Rate (%)', 630, y + 6);
  doc.text('Commission (£)', 710, y + 6);
  y += 20;

  bonuses.forEach((b, idx) => {
    if (y > 470) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(25, y, 790, 16).fill(bg);
    doc.fillColor('#0f172a').font('Helvetica-Bold').text((b.employeeName || '').slice(0, 22), 32, y + 4).font('Helvetica');
    doc.text((b.shopName || '').slice(0, 16), 200, y + 4);
    doc.text((b.commitmentText || `${b.bonusPercentage}% commission`).slice(0, 24), 330, y + 4);
    doc.text(`£${(b.salesAmount || 0).toLocaleString('en-GB')}`, 500, y + 4);
    doc.text(`${b.bonusPercentage}%`, 630, y + 4);
    doc.font('Helvetica-Bold').fillColor('#059669').text(`£${(b.bonusAmount || 0).toFixed(2)}`, 710, y + 4).font('Helvetica').fillColor('#0f172a');
    y += 16;
  });

  drawPdfSignatures(doc, y + 15, true);
  return await sendPdfOrBuffer(res, doc, `Bonus_Report_${month}_${year}.pdf`);
}

/**
 * Generate Excel workbook for Shop Labour Hours
 */
async function buildShopLabourExcel(shopData, periodLabel = '', includeWageCost = true) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Shop Labour Hours');

  const columnCount = includeWageCost ? 7 : 6;
  sheet.mergeCells(1, 1, 1, columnCount);
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Shop Labour Hours Report (${periodLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Shop Location', 'Employee Name', 'Work Days',
    'Scheduled Hours', 'Actual Hours Worked', 'Late (min)',
    ...(includeWageCost ? ['Attendance Pay (£)'] : [])
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
        e.employeeName || '',
        e.workingDays || 0,
        Number((e.scheduledHours || 0).toFixed(2)),
        Number((e.hours || 0).toFixed(2)),
        e.lateMinutes || 0,
        ...(includeWageCost ? [Number((e.wageCost || 0).toFixed(2))] : [])
      ]);
    });
  });

  sheet.addRow([]);
  const sumRow = sheet.addRow([
    'TOTALS', '',
    grandDays,
    Number(grandSched.toFixed(2)),
    Number(grandActual.toFixed(2)),
    grandLate,
    ...(includeWageCost ? [Number(grandCost.toFixed(2))] : [])
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(1).width = 20;
  sheet.getColumn(2).width = 22;
  return workbook;
}

/**
 * Generate PDF for Shop Labour Hours Report
 */
async function buildShopLabourPDF(res, shopData, periodLabel = '', generatedBy = 'Admin', includeWageCost = true) {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'Shop Labour Hours Summary', 'Workforce Hours & Attendance Wage Cost', periodLabel || 'All Period', true);

  let grandDays = 0, grandSched = 0, grandActual = 0, grandCost = 0;
  shopData.forEach(s => {
    (s.employees || []).forEach(e => {
      grandDays += e.workingDays || 0;
      grandSched += e.scheduledHours || 0;
      grandActual += e.hours || 0;
      grandCost += e.wageCost || 0;
    });
  });

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 185, 'ACTIVE LOCATIONS', String(shopData.length), '#2563eb');
  drawKpiCard(doc, 225, kpiY, 185, 'SCHEDULED HOURS', `${grandSched.toFixed(1)}h`, '#2563eb');
  drawKpiCard(doc, 425, kpiY, 185, 'ACTUAL WORKED HOURS', `${grandActual.toFixed(1)}h`, '#d97706');
  if (includeWageCost) {
    drawKpiCard(doc, 625, kpiY, 190, 'ATTENDANCE WAGE COST', `£${grandCost.toFixed(2)}`, '#059669');
  }

  let y = 135;
  const sectionHeaderH = 18;
  const tableHeaderH = 16;
  const rowH = 16;

  shopData.forEach(s => {
    const shopName = s.shopName || 'Shop';
    const sc = getShopColor(shopName);
    const employees = s.employees || [];

    if (y + sectionHeaderH + tableHeaderH + rowH > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }

    // 1. Shop Header Banner Bar
    const headerBg = sc.primary || '#1e293b';
    doc.roundedRect(25, y, 790, sectionHeaderH, 3).fill(headerBg);
    doc.circle(34, y + 9, 2.5).fill('#ffffff');

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
       .text(`${shopName.toUpperCase()} CYCLES`, 42, y + 4.5, { lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
       .text(`${employees.length} Staff Members`, 550, y + 5, { width: 255, align: 'right', lineBreak: false });

    y += sectionHeaderH;

    // 2. Table Column Headers
    doc.rect(25, y, 790, tableHeaderH).fill(sc.lightBg || '#f1f5f9');
    doc.fillColor(sc.text || '#334155').font('Helvetica-Bold').fontSize(7.5);

    doc.text('WORKER NAME', 35, y + 4, { width: 220, lineBreak: false });
    doc.text('Work Days', 320, y + 4, { width: 70, align: 'center', lineBreak: false });
    doc.text('Sched Hours', 410, y + 4, { width: 85, align: 'right', lineBreak: false });
    doc.text('Actual Hours', 510, y + 4, { width: 85, align: 'right', lineBreak: false });
    doc.text('Late (min)', 610, y + 4, { width: 65, align: 'right', lineBreak: false });
    if (includeWageCost) doc.text('Attendance Pay (£)', 690, y + 4, { width: 115, align: 'right', lineBreak: false });

    y += tableHeaderH;

    let sDays = 0, sSched = 0, sActual = 0, sLate = 0, sCost = 0;

    employees.forEach((e, idx) => {
      if (y + rowH > 520) {
        doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
        y = 30;
        doc.rect(25, y, 790, tableHeaderH).fill(sc.lightBg || '#f1f5f9');
        doc.fillColor(sc.text || '#334155').font('Helvetica-Bold').fontSize(7.5);
        doc.text('WORKER NAME', 35, y + 4, { width: 220, lineBreak: false });
        doc.text('Work Days', 320, y + 4, { width: 70, align: 'center', lineBreak: false });
        doc.text('Sched Hours', 410, y + 4, { width: 85, align: 'right', lineBreak: false });
        doc.text('Actual Hours', 510, y + 4, { width: 85, align: 'right', lineBreak: false });
        doc.text('Late (min)', 610, y + 4, { width: 65, align: 'right', lineBreak: false });
        if (includeWageCost) doc.text('Attendance Pay (£)', 690, y + 4, { width: 115, align: 'right', lineBreak: false });
        y += tableHeaderH;
      }

      sDays += e.workingDays || 0;
      sSched += e.scheduledHours || 0;
      sActual += e.hours || 0;
      sLate += e.lateMinutes || 0;
      sCost += e.wageCost || 0;

      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(25, y, 790, rowH).fill(bg);
      doc.rect(25, y, 3, rowH).fill(sc.primary || '#2563eb');

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      doc.text((e.employeeName || '').slice(0, 26), 35, y + 3.5, { width: 220, lineBreak: false });
      doc.font('Helvetica').fontSize(7.5);
      doc.text(String(e.workingDays || 0), 320, y + 4, { width: 70, align: 'center', lineBreak: false });
      doc.text(`${(e.scheduledHours || 0).toFixed(1)}h`, 410, y + 4, { width: 85, align: 'right', lineBreak: false });
      doc.text(`${(e.hours || 0).toFixed(1)}h`, 510, y + 4, { width: 85, align: 'right', lineBreak: false });
      doc.text(`${e.lateMinutes || 0}m`, 610, y + 4, { width: 65, align: 'right', lineBreak: false });
      if (includeWageCost) {
        doc.font('Helvetica-Bold').fillColor('#2563eb').text(`£${(e.wageCost || 0).toFixed(2)}`, 690, y + 4, { width: 115, align: 'right', lineBreak: false }).font('Helvetica').fillColor('#0f172a');
      }
      y += rowH;
    });

    // Shop Subtotal Bar
    if (y + 15 > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    doc.rect(25, y, 790, 15).fill(sc.lightBg || '#f1f5f9');
    doc.rect(25, y, 3, 15).fill(sc.primary || '#2563eb');
    doc.fillColor(sc.text || '#0f172a').font('Helvetica-Bold').fontSize(7.5);
    doc.text(`SUBTOTAL — ${shopName.toUpperCase()}`, 35, y + 3.5, { lineBreak: false });
    doc.text(String(sDays), 320, y + 3.5, { width: 70, align: 'center', lineBreak: false });
    doc.text(`${sSched.toFixed(1)}h`, 410, y + 3.5, { width: 85, align: 'right', lineBreak: false });
    doc.text(`${sActual.toFixed(1)}h`, 510, y + 3.5, { width: 85, align: 'right', lineBreak: false });
    doc.text(`${sLate}m`, 610, y + 3.5, { width: 65, align: 'right', lineBreak: false });
    if (includeWageCost) {
      doc.text(`£${sCost.toFixed(2)}`, 690, y + 3.5, { width: 115, align: 'right', lineBreak: false });
    }
    y += 21;
  });

  drawPdfSignatures(doc, y + 15, true);
  return await sendPdfOrBuffer(res, doc, `Shop_Labour_Hours_${periodLabel.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Generate Excel workbook for Salary Payments
 */
async function buildPaymentsExcel(payments, periodLabel = '', totals = {}, cashBankSummary = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Salary Payments');

  sheet.mergeCells('A1:I1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Salary Payment Disbursement Report (${periodLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Employee Name', 'Shop', 'Salary Week', 'Payment Date',
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
    '', '',
    Number((totals.totalPaid || 0).toFixed(2)),
    `Cash: £${(cashBankSummary.cashTotal || 0).toFixed(2)} | Bank: £${(cashBankSummary.bankTotal || 0).toFixed(2)}`,
    '', '', ''
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(1).width = 22;
  sheet.getColumn(3).width = 22;
  return workbook;
}

/**
 * Generate PDF for Salary Payments Report
 */
async function buildPaymentsPDF(res, payments, periodLabel = '', totals = {}, cashBankSummary = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'Salary Payments Report', 'Payment & Disbursement Records', periodLabel || 'All Period', true);

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 185, 'PAYMENTS COUNT', String(payments.length), '#2563eb');
  drawKpiCard(doc, 225, kpiY, 185, 'TOTAL DISBURSED', `£${(totals.totalPaid || 0).toFixed(2)}`, '#059669');
  drawKpiCard(doc, 425, kpiY, 185, 'CASH DISBURSED', `£${(cashBankSummary.cashTotal || 0).toFixed(2)}`, '#d97706');
  drawKpiCard(doc, 625, kpiY, 190, 'BANK TRANSFERS', `£${(cashBankSummary.bankTotal || 0).toFixed(2)}`, '#7c3aed');

  let y = 135;
  doc.rect(25, y, 790, 20).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('Employee Name', 32, y + 6);
  doc.text('Shop', 200, y + 6);
  doc.text('Salary Week', 300, y + 6);
  doc.text('Payment Date', 460, y + 6);
  doc.text('Amount (£)', 540, y + 6);
  doc.text('Method', 620, y + 6);
  doc.text('Paid By', 690, y + 6);
  y += 20;

  payments.forEach((p, idx) => {
    if (y > 470) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(25, y, 790, 16).fill(bg);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
    doc.font('Helvetica-Bold').text((p.employeeName || '').slice(0, 20), 32, y + 4).font('Helvetica');
    doc.text((p.shopName || '').slice(0, 14), 200, y + 4);
    doc.text((p.weekLabel || '').slice(0, 20), 300, y + 4);
    doc.text(p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-GB') : '', 460, y + 4);
    doc.font('Helvetica-Bold').fillColor('#059669').text(`£${(p.amount || 0).toFixed(2)}`, 540, y + 4).font('Helvetica').fillColor('#0f172a');
    doc.text(p.paymentMethod || 'Cash', 620, y + 4);
    doc.text((p.paidByName || '').slice(0, 16), 690, y + 4);
    y += 16;
  });

  drawPdfSignatures(doc, y + 15, true);
  return await sendPdfOrBuffer(res, doc, `Salary_Payments_${periodLabel.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Generate Excel workbook for Employee Salary Ledger
 */
async function buildLedgerExcel(employee, transactions, summary = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Salary Ledger');

  sheet.mergeCells('A1:G1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Employee Financial Ledger: ${employee.name.toUpperCase()}`;
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
async function buildLedgerPDF(res, employee, transactions, summary = {}, generatedBy = 'Admin') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'portrait' });
  drawPdfBanner(doc, `Financial Ledger: ${employee.name}`, 'Official Salary & Payment Ledger', '', false);

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 170, 'TOTAL WAGES EARNED', `£${(summary.totalEarned || 0).toFixed(2)}`, '#2563eb');
  drawKpiCard(doc, 212, kpiY, 170, 'TOTAL PAYMENTS DISBURSED', `£${(summary.totalPaid || 0).toFixed(2)}`, '#059669');
  drawKpiCard(doc, 400, kpiY, 170, 'CURRENT BALANCE', `£${(summary.outstanding || 0).toFixed(2)}`, summary.outstanding > 0 ? '#dc2626' : '#10b981');

  let y = 135;
  doc.rect(25, y, 545, 20).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('Date', 32, y + 6);
  doc.text('Type', 105, y + 6);
  doc.text('Description', 200, y + 6);
  doc.text('Earned (£)', 365, y + 6);
  doc.text('Paid (£)', 435, y + 6);
  doc.text('Balance (£)', 505, y + 6);
  y += 20;

  transactions.forEach((t, idx) => {
    if (y > 690) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'portrait' });
      y = 30;
    }
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(25, y, 545, 16).fill(bg);
    doc.fillColor('#0f172a').font('Helvetica').fontSize(8);
    doc.text(t.date ? new Date(t.date).toLocaleDateString('en-GB') : '', 32, y + 4);
    doc.text((t.transactionType || '').replace('_', ' '), 105, y + 4);
    doc.text((t.description || '').slice(0, 32), 200, y + 4);
    doc.text(t.amountEarned > 0 ? `£${t.amountEarned.toFixed(2)}` : '-', 365, y + 4);
    doc.text(t.amountPaid > 0 ? `£${t.amountPaid.toFixed(2)}` : '-', 435, y + 4);
    doc.font('Helvetica-Bold').text(`£${(t.runningBalance || 0).toFixed(2)}`, 505, y + 4).font('Helvetica');
    y += 16;
  });

  drawPdfSignatures(doc, y + 15, false);
  return await sendPdfOrBuffer(res, doc, `Ledger_${employee.name.replace(/\s+/g, '_')}.pdf`);
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
  buildLedgerPDF,
  SHOP_COLORS,
  getShopColor,
  sortDailyAttendanceRecords
};
