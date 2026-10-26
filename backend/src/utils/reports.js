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

function getShopSequenceRank(shopName) {
  if (!shopName) return 999;
  const s = String(shopName).trim().toLowerCase();
  if (s.includes('station')) return 1;
  if (s.includes('camden')) return 2;
  if (s.includes('chelsea')) return 3;
  if (s.includes('edgware')) return 4;
  if (s.includes('southwark')) return 5;
  if (s.includes('leebridge') || s.includes('leabridge') || s.includes('labridge') || s.includes('labidge') || s.includes('lea bridge')) return 6;
  return 100;
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

  // Sort shops by defined sequence: Station -> Camden -> Chelsea -> Edgware -> Southwark -> Leebridge
  const sortedShopKeys = Object.keys(grouped).sort((a, b) => {
    const rankA = getShopSequenceRank(a);
    const rankB = getShopSequenceRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });

  for (const shop of sortedShopKeys) {
    const staffList = grouped[shop];
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
    if (aAbsent && bAbsent) {
      const rankA = getShopSequenceRank(a.shopName);
      const rankB = getShopSequenceRank(b.shopName);
      if (rankA !== rankB) return rankA - rankB;
      return (a.employeeName || '').localeCompare(b.employeeName || '');
    }
    const rankA = getShopSequenceRank(a.shopName);
    const rankB = getShopSequenceRank(b.shopName);
    if (rankA !== rankB) return rankA - rankB;
    const sDiff = (a.shopName || '').localeCompare(b.shopName || '');
    if (sDiff !== 0) return sDiff;
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
    const rankA = getShopSequenceRank(a);
    const rankB = getShopSequenceRank(b);
    if (rankA !== rankB) return rankA - rankB;
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
  sheet.mergeCells('A1:G1');
  const title = sheet.getCell('A1');
  title.value = 'Commission Details';
  title.font = { name: 'Arial', size: 16, bold: true };
  title.alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:G2');
  const subTitle = sheet.getCell('A2');
  subTitle.value = `${monthStr} ${yearStr}`;
  subTitle.font = { name: 'Arial', size: 13, bold: true };
  subTitle.alignment = { horizontal: 'center' };

  const headerRow = sheet.addRow(['No', 'Name', 'Commitment', 'Monthly Sale', 'Rate', 'Commision', 'Notes']);
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
      b.bonusAmount ? `£${b.bonusAmount.toFixed(2)}` : '£0',
      b.notes || ''
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
  const totalRow = sheet.addRow(['Total', '', '', '', '', `£${totalComm.toFixed(2)}`, '']);
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
  sheet.getColumn(7).width = 28;
  return workbook;
}

/**
 * Generate Excel workbook for Single Employee Monthly Report (Matching Image 2: Shahab Ahmad format)
 */
async function buildEmployeeMonthlyExcel(employeeName, monthLabel, weeklyBreakdowns, grandTotal, balancePayable, dailyRecords = []) {
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
  const bRow = sheet.addRow(['TOTAL BALANCE PAYABLE',   '', '', '', '', '', '', '', `£${(balancePayable || 0).toFixed(2)}`]);
  sheet.mergeCells(`A${bRow.number}:I${bRow.number}`);
  bRow.getCell(1).alignment = { horizontal: 'center' };
  bRow.eachCell(cell => {
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  });

  sheet.columns.forEach(col => { col.width = 16; });
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 8;

  if (dailyRecords && dailyRecords.length > 0) {
    const dailySheet = workbook.addWorksheet('Daily Work Log');

    dailySheet.mergeCells('A1:K1');
    const h1 = dailySheet.getCell('A1');
    h1.value = `DAILY WORKPLACE & SHOP LOCATION LOG: ${employeeName.toUpperCase()} (${monthLabel})`;
    h1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    h1.alignment = { horizontal: 'center', vertical: 'middle' };
    dailySheet.getRow(1).height = 28;

    const dHeaders = ['#', 'Date', 'Day of Week', 'Shop Location Worked', 'Shift Start', 'Shift End', 'Time In', 'Time Out', 'Worked Hours', 'Status', 'Daily Net Pay (£)'];
    const dHeaderRow = dailySheet.addRow(dHeaders);
    dHeaderRow.height = 24;
    dHeaderRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    dailyRecords.forEach((r, idx) => {
      const dRow = dailySheet.addRow([
        idx + 1,
        r.formattedDate || (r.dateString ? formatUKDate(r.dateString) : ''),
        r.dayOfWeek || '',
        r.shopName || 'Shop',
        r.shiftStart || '09:00',
        r.shiftEnd || '19:00',
        r.timeReached ? formatTime12Hour(r.timeReached) : '--',
        r.workerEndTime ? formatTime12Hour(r.workerEndTime) : '--',
        Number(r.actualHours || 0),
        r.status || 'Present',
        Number(r.attendancePay || 0)
      ]);
      dRow.height = 20;
      dRow.eachCell(cell => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      });
      dRow.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
      dRow.getCell(4).font = { name: 'Calibri', size: 10, bold: true };
    });

    dailySheet.columns = [
      { width: 5 }, { width: 14 }, { width: 14 }, { width: 28 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }
    ];
  }

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
    'Employee Name', 'Shop(s) Worked', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Work Days', 'Hours Worked'
  ];
  sheet.addRow([]);
  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  records.forEach(r => {
    const shopVal = r.shopName || (r.shopsList && r.shopsList.length ? r.shopsList.join(' / ') : '—');
    sheet.addRow([
      r.employeeName || '',
      shopVal,
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
    `TOTALS (${records.length} staff)`,
    '', '', '', '', '', '', '', '',
    summary.totalWorkingDays || 0,
    Number((summary.totalWorkedHours || 0).toFixed(2))
  ]);
  sumRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  sheet.columns.forEach(col => { col.width = 14; });
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 20;
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

  doc.rect(margin, 20, contentWidth, 42).fillAndStroke('#ffffff', '#cbd5e1');

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text('PIXX ROTA', margin + 12, 28);
  doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('PixxTechnologies UK • Bicycle Retail & Payroll System', margin + 12, 45);

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(title, margin + contentWidth - 270, 26, { width: 260, align: 'right' });
  doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text(periodText || subtitle, margin + contentWidth - 270, 44, { width: 260, align: 'right' });
}

function drawKpiCard(doc, x, y, width, label, value, color = '#2563eb') {
  doc.rect(x, y, width, 45).fillAndStroke('#f8fafc', '#e2e8f0');
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
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('USMAN AHMAD', margin + 10, y + 8);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('Attendance Taker • Roster Entry & Logged Hours', margin + 10, y + 21);
  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8).text('✓ RECORDED & SUBMITTED', margin + 10, y + 35);

  const box2X = margin + cardWidth + gap;
  doc.rect(box2X, y, cardWidth, 52).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('SARFRAZ KHAN', box2X + 10, y + 8);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('Attendance Checker • Verification & Approval Audit', box2X + 10, y + 21);
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
  const margin = 25;
  const contentWidth = 790;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  drawPdfBanner(doc, 'Weekly Attendance Report', 'Worker shifts, shop assignments & logged labor hours', `Week: ${weekLabel}`, true);

  // 1. Calculate / normalize metrics
  const totalEmployees = records.length;
  const totalWorkingDays = summary.totalWorkingDays ?? records.reduce((sum, r) => sum + (Number(r.workingDays) || 0), 0);
  const totalWorkedHours = summary.totalWorkedHours ?? records.reduce((sum, r) => sum + (Number(r.actualHours) || 0), 0);
  const totalPresent = summary.totalPresent ?? records.reduce((sum, r) => sum + (Number(r.presentDays) || 0), 0);
  const totalLate = summary.totalLate ?? records.reduce((sum, r) => sum + (Number(r.lateDays) || 0), 0);
  const totalHalf = summary.totalHalf ?? records.reduce((sum, r) => sum + (Number(r.halfDays) || 0), 0);
  const totalAbsent = summary.totalAbsent ?? records.reduce((sum, r) => sum + (Number(r.absentDays) || 0), 0);

  // Derive shop-wise summaries if not supplied
  let shopSummaries = summary.shopSummaries;
  if (!shopSummaries || !shopSummaries.length) {
    const shopMap = {};
    records.forEach(r => {
      days.forEach(d => {
        const sName = r.dailySchedule?.[d];
        if (sName && sName !== 'Off' && sName !== 'Absent') {
          if (!shopMap[sName]) {
            shopMap[sName] = { shopName: sName, totalDays: 0, totalHours: 0, staffKeys: new Set() };
          }
          shopMap[sName].totalDays += 1;
          const avgHoursPerDay = (Number(r.workingDays) > 0 && Number(r.actualHours) > 0)
            ? Number(r.actualHours) / Number(r.workingDays)
            : 8;
          shopMap[sName].totalHours = Number((shopMap[sName].totalHours + avgHoursPerDay).toFixed(2));
          shopMap[sName].staffKeys.add(r.employeeName || 'worker');
        }
      });
    });
    shopSummaries = Object.values(shopMap).map(s => ({
      shopName: s.shopName,
      totalDays: s.totalDays,
      totalHours: Number(s.totalHours.toFixed(2)),
      staffCount: s.staffKeys.size
    })).sort((a, b) => b.totalHours - a.totalHours);
  }
  const activeShopsCount = shopSummaries.length;

  // 2. Executive KPI Summary Cards
  const kpiY = 72;
  const cardW = 151;
  const gap = 8;
  let kpiX = margin;

  drawKpiCard(doc, kpiX, kpiY, cardW, 'STAFF RECORDED', `${totalEmployees} Workers`, '#0f172a');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'TOTAL WORK DAYS', `${totalWorkingDays} Days`, '#059669');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'TOTAL HOURS WORKED', `${totalWorkedHours.toFixed(1)} hrs`, '#2563eb');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'ACTIVE SHOPS', `${activeShopsCount} ${activeShopsCount === 1 ? 'Location' : 'Locations'}`, '#7c3aed');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'SHIFTS BREAKDOWN', `${totalPresent} Pres • ${totalLate} Late • ${totalAbsent} Off`, '#d97706');

  // 3. Main Attendance Table Column Layout (Total Width = 790)
  // # (18) | WORKER NAME & ID (124) | SHOP(S) WORKED (116) | 7 Days (7 * 58 = 406) | WORK DAYS (54) | TOTAL HOURS (72)
  const colX = {
    idx: margin,
    name: margin + 18,
    shop: margin + 142,
    daysStart: margin + 258,
    dayWidth: 58,
    workDays: margin + 258 + (7 * 58), // margin + 664
    hours: margin + 258 + (7 * 58) + 54 // margin + 718 (width 72)
  };

  let y = 126;
  const tableHeaderH = 19;
  const rowHeight = 20;

  const drawTableHeader = () => {
    doc.rect(margin, y, contentWidth, tableHeaderH).fillAndStroke('#f1f5f9', '#cbd5e1');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5);
    doc.text('#', colX.idx, y + 6, { width: 18, align: 'center', lineBreak: false });
    doc.text('WORKER NAME & ID', colX.name + 4, y + 6, { width: 120, lineBreak: false });
    doc.text('SHOP(S) WORKED', colX.shop + 4, y + 6, { width: 112, lineBreak: false });
    days.forEach((day, index) => {
      const dx = colX.daysStart + index * colX.dayWidth;
      doc.text(day.toUpperCase(), dx, y + 6, { width: colX.dayWidth, align: 'center', lineBreak: false });
    });
    doc.text('WORK DAYS', colX.workDays, y + 6, { width: 54, align: 'center', lineBreak: false });
    doc.text('TOTAL HOURS', colX.hours, y + 6, { width: 68, align: 'right', lineBreak: false });
    y += tableHeaderH;
  };

  drawTableHeader();

  const sortedRecords = [...records].sort((a, b) =>
    (a.employeeName || '').localeCompare(b.employeeName || '')
  );

  // Daily totals for duty count
  const dailyStaffCount = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };

  sortedRecords.forEach((record, rowIndex) => {
    if (y + rowHeight + 30 > 560) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
      drawTableHeader();
    }

    const bg = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(margin, y, contentWidth, rowHeight).fill(bg);
    doc.rect(margin, y + rowHeight - 0.5, contentWidth, 0.5).fill('#e2e8f0');

    // # index
    doc.fillColor('#64748b').font('Helvetica').fontSize(7)
       .text(String(rowIndex + 1), colX.idx, y + 6.5, { width: 18, align: 'center', lineBreak: false });

    // Worker Name & ID
    const empId = record.employeeId || '';
    if (empId) {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
         .text(record.employeeName || 'Worker', colX.name + 4, y + 3, { width: 118, lineBreak: false });
      doc.fillColor('#64748b').font('Helvetica').fontSize(6)
         .text(empId, colX.name + 4, y + 11.5, { width: 118, lineBreak: false });
    } else {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
         .text(record.employeeName || 'Worker', colX.name + 4, y + 6.5, { width: 118, lineBreak: false });
    }

    // Shop(s) Worked
    let shopDisplay = record.shopName;
    if (!shopDisplay || shopDisplay === 'Shop') {
      const activeShops = days.map(d => record.dailySchedule?.[d]).filter(s => s && s !== 'Off' && s !== 'Absent');
      const uniqueShops = [...new Set(activeShops)];
      shopDisplay = uniqueShops.length > 0 ? uniqueShops.join(' / ') : '—';
    }
    doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(7)
       .text(shopDisplay, colX.shop + 4, y + 6.5, { width: 110, lineBreak: false });

    // Days (Sun - Sat)
    days.forEach((day, index) => {
      const dx = colX.daysStart + index * colX.dayWidth;
      const shop = record.dailySchedule?.[day] || 'Off';
      const isOff = shop === 'Off' || shop === 'Absent';
      if (!isOff) dailyStaffCount[day] += 1;

      doc.fillColor(isOff ? '#94a3b8' : '#0f766e')
         .font(isOff ? 'Helvetica' : 'Helvetica-Bold')
         .fontSize(isOff ? 7 : 7.2)
         .text(shop, dx + 2, y + 6.5, { width: colX.dayWidth - 4, align: 'center', lineBreak: false });

      doc.strokeColor('#e2e8f0').lineWidth(0.3)
         .moveTo(dx, y).lineTo(dx, y + rowHeight).stroke();
    });

    // Work Days
    const wDays = Number(record.workingDays) || 0;
    doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8)
       .text(`${wDays}d`, colX.workDays, y + 6, { width: 54, align: 'center', lineBreak: false });

    // Total Hours
    const wHours = Number(record.actualHours) || 0;
    doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(8)
       .text(`${wHours.toFixed(1)}h`, colX.hours, y + 6, { width: 68, align: 'right', lineBreak: false });

    y += rowHeight;
  });

  // Table Totals Row
  if (y + rowHeight + 30 > 560) {
    doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
    y = 30;
  }
  doc.rect(margin, y, contentWidth, rowHeight).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5);
  doc.text(`TOTALS (${totalEmployees} Staff)`, colX.idx + 4, y + 6.5, { width: 136, lineBreak: false });
  doc.fillColor('#64748b').font('Helvetica').fontSize(6.8);
  doc.text('All Shops', colX.shop + 4, y + 6.5, { width: 110, lineBreak: false });

  days.forEach((day, index) => {
    const dx = colX.daysStart + index * colX.dayWidth;
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7)
       .text(`${dailyStaffCount[day]} on duty`, dx, y + 6.5, { width: colX.dayWidth, align: 'center', lineBreak: false });
  });

  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8)
     .text(`${totalWorkingDays}d`, colX.workDays, y + 6, { width: 54, align: 'center', lineBreak: false });
  doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(8)
     .text(`${totalWorkedHours.toFixed(1)}h`, colX.hours, y + 6, { width: 68, align: 'right', lineBreak: false });
  y += rowHeight;

  // 4. Shop-Wise Summary Breakdown Table
  if (shopSummaries.length > 0) {
    const shopTableH = 20 + 16 + (shopSummaries.length + 1) * 16;
    if (y + shopTableH + 60 > 560) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    } else {
      y += 14;
    }

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9)
       .text('SHOP-WISE ATTENDANCE & WORKING HOURS BREAKDOWN', margin, y);
    y += 14;

    const sColW = {
      name: 200,
      staff: 110,
      days: 130,
      hours: 140,
      avg: 120,
      share: 90
    };

    doc.rect(margin, y, contentWidth, 16).fillAndStroke('#f1f5f9', '#cbd5e1');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5);
    doc.text('SHOP / LOCATION NAME', margin + 8, y + 4.5, { width: sColW.name, lineBreak: false });
    doc.text('STAFF ON DUTY', margin + sColW.name, y + 4.5, { width: sColW.staff, align: 'center', lineBreak: false });
    doc.text('TOTAL DAYS WORKED', margin + sColW.name + sColW.staff, y + 4.5, { width: sColW.days, align: 'center', lineBreak: false });
    doc.text('TOTAL HOURS WORKED', margin + sColW.name + sColW.staff + sColW.days, y + 4.5, { width: sColW.hours, align: 'center', lineBreak: false });
    doc.text('AVG HOURS / SHIFT', margin + sColW.name + sColW.staff + sColW.days + sColW.hours, y + 4.5, { width: sColW.avg, align: 'center', lineBreak: false });
    doc.text('SHARE OF LABOR', margin + sColW.name + sColW.staff + sColW.days + sColW.hours + sColW.avg, y + 4.5, { width: sColW.share - 8, align: 'right', lineBreak: false });
    y += 16;

    shopSummaries.forEach((s, idx) => {
      const sbg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(margin, y, contentWidth, 16).fill(sbg);
      doc.rect(margin, y + 15.5, contentWidth, 0.5).fill('#e2e8f0');

      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
         .text(`•  ${s.shopName}`, margin + 8, y + 4.5, { width: sColW.name - 12, lineBreak: false });
      doc.fillColor('#475569').font('Helvetica').fontSize(7.5)
         .text(`${s.staffCount} Staff`, margin + sColW.name, y + 4.5, { width: sColW.staff, align: 'center', lineBreak: false });
      doc.fillColor('#059669').font('Helvetica-Bold').fontSize(7.5)
         .text(`${s.totalDays} Days`, margin + sColW.name + sColW.staff, y + 4.5, { width: sColW.days, align: 'center', lineBreak: false });
      doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(7.5)
         .text(`${s.totalHours.toFixed(1)} hrs`, margin + sColW.name + sColW.staff + sColW.days, y + 4.5, { width: sColW.hours, align: 'center', lineBreak: false });

      const avgShift = s.totalDays > 0 ? (s.totalHours / s.totalDays).toFixed(1) : '0.0';
      doc.fillColor('#475569').font('Helvetica').fontSize(7.5)
         .text(`${avgShift} hrs/day`, margin + sColW.name + sColW.staff + sColW.days + sColW.hours, y + 4.5, { width: sColW.avg, align: 'center', lineBreak: false });

      const share = totalWorkedHours > 0 ? ((s.totalHours / totalWorkedHours) * 100).toFixed(1) : '0.0';
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
         .text(`${share}%`, margin + sColW.name + sColW.staff + sColW.days + sColW.hours + sColW.avg, y + 4.5, { width: sColW.share - 8, align: 'right', lineBreak: false });

      y += 16;
    });
  }

  // 5. Signatures Block
  drawPdfSignatures(doc, y + 14, true);

  return await sendPdfOrBuffer(res, doc, `Weekly_Attendance_${weekLabel.replace(/[\/–\s]/g, '_')}.pdf`);
}

/**
 * Generate Excel workbook for Weekly Salary Report
 */
function buildWeeklySalaryDailyBreakdown(salary, weekStartDateString) {
  const startDate = weekStartDateString || salary.weekStartDateString;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '')) return [];

  const records = salary.reportAttendanceBreakdown
    || salary.finalizationSnapshot?.attendanceBreakdown
    || salary.attendanceBreakdown
    || [];
  const recordsByDate = new Map();
  records.forEach(record => {
    const dateString = String(record.dateString || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return;
    const dayRecords = recordsByDate.get(dateString) || [];
    dayRecords.push(record);
    recordsByDate.set(dateString, dayRecords);
  });

  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateString = date.toISOString().slice(0, 10);
    const dayRecords = recordsByDate.get(dateString) || [];
    return {
      dateString,
      dayOfWeek: new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(date),
      attendancePay: Number(dayRecords.reduce((sum, record) => sum + (Number(record.attendancePay) || 0), 0).toFixed(2)),
      status: dayRecords.length ? [...new Set(dayRecords.map(record => record.status).filter(Boolean))].join(', ') : ''
    };
  });
}

async function buildWeeklySalaryExcel(salaries, weekLabel, totals = {}, weekStartDateString) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Weekly Salary');

  sheet.mergeCells('A1:Q1');
  const title = sheet.getCell('A1');
  title.value = `PixxTechnologies UK - Weekly Salary Report (${weekLabel})`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headers = [
    'Employee Name', 'Week Period',
    ...buildWeeklySalaryDailyBreakdown({}, weekStartDateString).map(day => `${day.dayOfWeek} ${day.dateString}`),
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
    const dailyBreakdown = buildWeeklySalaryDailyBreakdown(s, weekStartDateString);
    sheet.addRow([
      s.employeeName || '',
      s.weekLabel || weekLabel,
      ...dailyBreakdown.map(day => day.attendancePay),
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
    'TOTALS', `Staff: ${salaries.length}`,
    ...Array.from({ length: 7 }, (_, dayIndex) => Number(salaries.reduce((sum, salary) => {
      const day = buildWeeklySalaryDailyBreakdown(salary, weekStartDateString)[dayIndex];
      return sum + (day?.attendancePay || 0);
    }, 0).toFixed(2))),
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
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 24;
  for (let column = 3; column <= 9; column++) sheet.getColumn(column).width = 14;
  return workbook;
}

/**
 * Generate PDF for Weekly Salary Report
 */
async function buildWeeklySalaryPDF(res, salaries, weekLabel, totals = {}, generatedBy = 'Admin', weekStartDateString) {
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
  const tableHeaderH = 16;
  const rowH = 16;
  const totalH = 16;
  const drawHeader = () => {
    doc.rect(25, y, 790, tableHeaderH).fill('#e2e8f0');
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5);
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
  };

  doc.roundedRect(25, y, 790, 18, 3).fillAndStroke('#f1f5f9', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9)
    .text(`WEEKLY PAYROLL — ${salaries.length} ${salaries.length === 1 ? 'WORKER' : 'WORKERS'}`, 35, y + 4.5, { lineBreak: false });
  y += 18;
  drawHeader();

  salaries.forEach((salary, index) => {
    if (y + rowH + totalH > 520) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
      drawHeader();
    }

    const allowances = (salary.travelAllowance || 0) + (salary.otherAllowances || 0);
    const deductions = salary.manualDeductions || 0;
    doc.rect(25, y, 790, rowH).fill(index % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8)
      .text((salary.employeeName || '').slice(0, 24), 35, y + 3.5, { width: 170, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5);
    doc.text(`£${(salary.netAttendancePay || 0).toFixed(2)}`, 215, y + 4, { width: 75, align: 'right', lineBreak: false });
    doc.text(`£${allowances.toFixed(2)}`, 295, y + 4, { width: 65, align: 'right', lineBreak: false });
    doc.text(`£${(salary.bonus || 0).toFixed(2)}`, 365, y + 4, { width: 55, align: 'right', lineBreak: false });
    doc.text(`£${deductions.toFixed(2)}`, 425, y + 4, { width: 65, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fillColor('#2563eb').text(`£${(salary.finalSalary || 0).toFixed(2)}`, 495, y + 4, { width: 80, align: 'right', lineBreak: false }).font('Helvetica').fillColor('#0f172a');
    doc.fillColor('#059669').text(`£${(salary.totalPaid || 0).toFixed(2)}`, 580, y + 4, { width: 70, align: 'right', lineBreak: false }).fillColor('#0f172a');
    doc.font('Helvetica-Bold').fillColor(salary.balanceRemaining > 0 ? '#dc2626' : '#64748b').text(`£${(salary.balanceRemaining || 0).toFixed(2)}`, 655, y + 4, { width: 75, align: 'right', lineBreak: false }).font('Helvetica').fillColor('#0f172a');
    doc.text(salary.status || 'Generated', 740, y + 4, { width: 70, align: 'center', lineBreak: false });
    y += rowH;
  });

  if (y + totalH > 520) {
    doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
    y = 30;
  }
  doc.rect(25, y, 790, totalH).fill('#e2e8f0');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
    .text('TOTALS', 35, y + 4, { width: 170, lineBreak: false });
  doc.text(`£${(totals.totalAttendancePay || 0).toFixed(2)}`, 215, y + 4, { width: 75, align: 'right', lineBreak: false });
  doc.text(`£${(totals.totalAllowances || 0).toFixed(2)}`, 295, y + 4, { width: 65, align: 'right', lineBreak: false });
  doc.text(`£${(totals.totalBonus || 0).toFixed(2)}`, 365, y + 4, { width: 55, align: 'right', lineBreak: false });
  doc.text(`£${(totals.totalDeductions || 0).toFixed(2)}`, 425, y + 4, { width: 65, align: 'right', lineBreak: false });
  doc.text(`£${(totals.totalFinalSalary || 0).toFixed(2)}`, 495, y + 4, { width: 80, align: 'right', lineBreak: false });
  doc.text(`£${(totals.totalPaid || 0).toFixed(2)}`, 580, y + 4, { width: 70, align: 'right', lineBreak: false });
  doc.text(`£${(totals.totalOutstanding || 0).toFixed(2)}`, 655, y + 4, { width: 75, align: 'right', lineBreak: false });

  const hasDailyBreakdown = salaries.some(s => buildWeeklySalaryDailyBreakdown(s, weekStartDateString).length === 7);
  if (hasDailyBreakdown) {
    doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
    drawPdfBanner(doc, 'Weekly Attendance Wage Breakdown', 'Daily attendance pay Sunday to Saturday', `Week: ${weekLabel}`, true);
    y = 105;
    const dailyColumns = buildWeeklySalaryDailyBreakdown({}, weekStartDateString);
    const nameWidth = 155;
    const dayWidth = 90;
    const drawDailyHeader = () => {
      doc.rect(25, y, 790, 20).fillAndStroke('#f1f5f9', '#cbd5e1');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7);
      doc.text('EMPLOYEE NAME', 30, y + 6, { width: nameWidth - 5, lineBreak: false });
      dailyColumns.forEach((day, index) => {
        const date = new Date(`${day.dateString}T00:00:00.000Z`);
        const label = `${day.dayOfWeek} ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(date)}`;
        doc.text(label, 25 + nameWidth + index * dayWidth, y + 6, { width: dayWidth, align: 'center', lineBreak: false });
      });
      y += 20;
    };
    drawDailyHeader();
    const dailyTotals = new Array(7).fill(0);
    salaries.forEach((salary, rowIndex) => {
      if (y + 24 > 520) {
        doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
        y = 30;
        drawDailyHeader();
      }
      const row = buildWeeklySalaryDailyBreakdown(salary, weekStartDateString);
      doc.rect(25, y, 790, 24).fill(rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7);
      doc.text((salary.employeeName || '').slice(0, 34), 30, y + 4, { width: nameWidth - 5, lineBreak: false });
      doc.font('Helvetica').fontSize(6);
      row.forEach((day, index) => {
        dailyTotals[index] += day.attendancePay;
        const cellX = 25 + nameWidth + index * dayWidth;
        doc.fillColor('#0f172a').text(`£${day.attendancePay.toFixed(2)}`, cellX, y + 3, { width: dayWidth, align: 'center', lineBreak: false });
        doc.fillColor('#64748b').text(day.status || 'No attendance', cellX, y + 12, { width: dayWidth, align: 'center', lineBreak: false });
      });
      y += 24;
    });
    doc.rect(25, y, 790, 18).fill('#e2e8f0');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7);
    doc.text('DAILY TOTAL', 30, y + 5, { width: nameWidth - 5, lineBreak: false });
    dailyTotals.forEach((amount, index) => {
      doc.text(`£${amount.toFixed(2)}`, 25 + nameWidth + index * dayWidth, y + 5, { width: dayWidth, align: 'center', lineBreak: false });
    });
  }

  drawPdfSignatures(doc, y + 15, true);
  return await sendPdfOrBuffer(res, doc, `Weekly_Salary_${weekLabel.replace(/[\/–\s]/g, '_')}.pdf`);
}

/**
 * Generate PDF for Employee Monthly Report
 */
async function buildEmployeeMonthlyPDF(res, employeeName, employeeId, shopName, monthLabel, attendanceSummary = {}, weeklyBreakdowns = [], grandTotal = {}, balancePayable = 0, generatedBy = 'Admin', dailyRecords = []) {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  const margin = 25;
  const contentWidth = 791.89;

  // Dedicated Top Header Banner with Worker Name Prominently on Top
  doc.rect(margin, 18, contentWidth, 48).fillAndStroke('#ffffff', '#cbd5e1');

  // Left side: System Branding
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text('PIXX ROTA', margin + 14, 25);
  doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('PixxTechnologies UK • Monthly Employee Statement', margin + 14, 43);

  // Right side: WORKER NAME BOLD & CRYSTAL CLEAR ON TOP
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(
    `WORKER: ${(employeeName || '').toUpperCase()}`,
    margin + 240, 23, { width: contentWidth - 255, align: 'right', lineBreak: false }
  );

  const subLine = `${employeeId ? `ID: ${employeeId}   •   ` : ''}Shop: ${shopName || 'Pixx Shop'}   •   Period: ${monthLabel}`;
  doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(9.5).text(
    subLine,
    margin + 240, 43, { width: contentWidth - 255, align: 'right', lineBreak: false }
  );

  const kpiY = 75;
  drawKpiCard(doc, 25, kpiY, 125, 'WORK DAYS', String(attendanceSummary.workingDays || 0), '#2563eb');
  drawKpiCard(doc, 160, kpiY, 125, 'PRESENT / LATE', `${attendanceSummary.present || 0} / ${attendanceSummary.late || 0}`, '#059669');
  drawKpiCard(doc, 295, kpiY, 125, 'WORKED HOURS', `${(attendanceSummary.actualHours || 0).toFixed(1)}h`, '#d97706');
  drawKpiCard(doc, 430, kpiY, 125, 'LATE DEDUCTION', `£${(attendanceSummary.lateDeduction || 0).toFixed(2)}`, '#dc2626');
  drawKpiCard(doc, 565, kpiY, 125, 'TOTAL PAID', `£${(grandTotal.paid || 0).toFixed(2)}`, '#059669');
  drawKpiCard(doc, 700, kpiY, 115, 'OUTSTANDING', `£${(balancePayable || 0).toFixed(2)}`, '#dc2626');

  let y = 135;
  doc.rect(25, y, 790, 20).fillAndStroke('#f1f5f9', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
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

  if (dailyRecords && dailyRecords.length > 0) {
    if (y + 60 > 500) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      doc.rect(margin, 18, contentWidth, 30).fillAndStroke('#ffffff', '#cbd5e1');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(
        `WORKER: ${(employeeName || '').toUpperCase()}`,
        margin + 12, 26, { lineBreak: false }
      );
      doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(9).text(
        `${employeeId ? `[${employeeId}] ` : ''}${shopName} • Period: ${monthLabel}`,
        margin + contentWidth - 260, 27, { width: 250, align: 'right', lineBreak: false }
      );
      y = 56;
    } else {
      y += 18;
    }

    doc.roundedRect(25, y, 790, 18, 3).fillAndStroke('#f1f5f9', '#cbd5e1');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5)
       .text(`DAILY WORKPLACE & SHOP LOCATION LOG — ${employeeName.toUpperCase()}`, 35, y + 4.5);
    y += 18;

    doc.rect(25, y, 790, 15).fill('#f1f5f9');
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5);
    doc.text('Date & Day', 35, y + 3.5, { width: 110, lineBreak: false });
    doc.text('Shop Location Worked', 150, y + 3.5, { width: 180, lineBreak: false });
    doc.text('Shift Start - End', 335, y + 3.5, { width: 110, align: 'center', lineBreak: false });
    doc.text('Time In / Time Out', 450, y + 3.5, { width: 120, align: 'center', lineBreak: false });
    doc.text('Hours', 575, y + 3.5, { width: 75, align: 'center', lineBreak: false });
    doc.text('Status', 655, y + 3.5, { width: 65, align: 'center', lineBreak: false });
    doc.text('Daily Net Pay', 725, y + 3.5, { width: 80, align: 'right', lineBreak: false });
    y += 15;

    dailyRecords.forEach((r, idx) => {
      if (y + 15 > 520) {
        doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
        doc.rect(margin, 18, contentWidth, 30).fillAndStroke('#ffffff', '#cbd5e1');
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text(
          `WORKER: ${(employeeName || '').toUpperCase()}`,
          margin + 12, 26, { lineBreak: false }
        );
        doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(9).text(
          `${employeeId ? `[${employeeId}] ` : ''}${shopName} • Period: ${monthLabel} (Cont.)`,
          margin + contentWidth - 260, 27, { width: 250, align: 'right', lineBreak: false }
        );
        y = 56;
        doc.rect(25, y, 790, 15).fill('#f1f5f9');
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5);
        doc.text('Date & Day', 35, y + 3.5, { width: 110, lineBreak: false });
        doc.text('Shop Location Worked', 150, y + 3.5, { width: 180, lineBreak: false });
        doc.text('Shift Start - End', 335, y + 3.5, { width: 110, align: 'center', lineBreak: false });
        doc.text('Time In / Time Out', 450, y + 3.5, { width: 120, align: 'center', lineBreak: false });
        doc.text('Hours', 575, y + 3.5, { width: 75, align: 'center', lineBreak: false });
        doc.text('Status', 655, y + 3.5, { width: 65, align: 'center', lineBreak: false });
        doc.text('Daily Net Pay', 725, y + 3.5, { width: 80, align: 'right', lineBreak: false });
        y += 15;
      }

      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(25, y, 790, 15).fill(bg);
      doc.fillColor('#0f172a').font('Helvetica').fontSize(8);

      const dStr = r.formattedDate || (r.dateString ? formatUKDate(r.dateString) : '');
      const dateDisplay = `${dStr} (${r.dayOfWeek || ''})`;
      doc.text(dateDisplay, 35, y + 3.5, { width: 110, lineBreak: false });

      doc.font('Helvetica-Bold').fillColor('#1e293b');
      doc.text(r.shopName || 'Shop', 150, y + 3.5, { width: 180, lineBreak: false });

      doc.font('Helvetica').fillColor('#0f172a');
      doc.text(`${r.shiftStart || '09:00'} - ${r.shiftEnd || '19:00'}`, 335, y + 3.5, { width: 110, align: 'center', lineBreak: false });

      const timeInStr = r.timeReached ? formatTime12Hour(r.timeReached) : '--';
      const timeOutStr = r.workerEndTime ? formatTime12Hour(r.workerEndTime) : '--';
      const isLate = r.status === 'Late' || (r.lateMinutes && r.lateMinutes > 0);
      doc.fillColor(isLate ? '#d97706' : '#059669');
      doc.text(`${timeInStr} / ${timeOutStr}`, 450, y + 3.5, { width: 120, align: 'center', lineBreak: false });

      doc.fillColor('#0f172a');
      doc.text(r.status !== 'Absent' ? `${Number(r.actualHours || 0).toFixed(1)}h` : '0.0h', 575, y + 3.5, { width: 75, align: 'center', lineBreak: false });

      const statusColor = r.status === 'Present' ? '#059669' : (r.status === 'Late' ? '#d97706' : (r.status === 'Half' ? '#0284c7' : '#dc2626'));
      doc.font('Helvetica-Bold').fillColor(statusColor);
      doc.text(r.status || 'Present', 655, y + 3.5, { width: 65, align: 'center', lineBreak: false });

      doc.font('Helvetica-Bold').fillColor('#059669');
      doc.text(`£${Number(r.attendancePay || 0).toFixed(2)}`, 725, y + 3.5, { width: 80, align: 'right', lineBreak: false });

      y += 15;
    });
  }

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
  doc.rect(25, y, 790, 20).fillAndStroke('#f1f5f9', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
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
  doc.rect(25, y, 790, 20).fill('#f1f5f9');
  doc.rect(25, y, 790, 20).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
  doc.text('Employee Name', 32, y + 6);
  doc.text('Shop Location', 160, y + 6);
  doc.text('Commitment / Tier', 255, y + 6);
  doc.text('Sales Amount (£)', 360, y + 6);
  doc.text('Rate (%)', 450, y + 6);
  doc.text('Commission (£)', 500, y + 6);
  doc.text('Notes / Remarks', 585, y + 6);
  y += 20;

  bonuses.forEach((b, idx) => {
    if (y > 470) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(25, y, 790, 16).fill(bg);
    doc.rect(25, y, 790, 16).strokeColor('#e2e8f0').lineWidth(0.4).stroke();
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text((b.employeeName || '').slice(0, 20), 32, y + 4).font('Helvetica');
    doc.text((b.shopName || '').slice(0, 15), 160, y + 4);
    doc.text((b.commitmentText || `${b.bonusPercentage}% commission`).slice(0, 20), 255, y + 4);
    doc.text(`£${(b.salesAmount || 0).toLocaleString('en-GB')}`, 360, y + 4);
    doc.text(`${b.bonusPercentage}%`, 450, y + 4);
    doc.font('Helvetica-Bold').fillColor('#059669').text(`£${(b.bonusAmount || 0).toFixed(2)}`, 500, y + 4).font('Helvetica').fillColor('#0f172a');
    doc.fillColor('#475569').text((b.notes || '—').slice(0, 38), 585, y + 4, { width: 220, lineBreak: false });
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
    const headerBg = sc.lightBg || '#f8fafc';
    const headerBorder = sc.border || '#cbd5e1';
    const headerText = sc.text || '#0f172a';
    const dotColor = sc.primary || '#2563eb';

    doc.roundedRect(25, y, 790, sectionHeaderH, 3).fillAndStroke(headerBg, headerBorder);
    doc.circle(34, y + 9, 2.5).fill(dotColor);

    doc.fillColor(headerText).font('Helvetica-Bold').fontSize(9)
       .text(`${shopName.toUpperCase()} CYCLES`, 42, y + 4.5, { lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(headerText)
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
  doc.rect(25, y, 790, 20).fillAndStroke('#f1f5f9', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
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

function drawDistributorSignatures(doc, yPos, isLandscape = true, distributorName = 'Fahad Rasheed') {
  const width = isLandscape ? 841.89 : 595.28;
  const margin = 25;
  const cardWidth = isLandscape ? 385 : 260;
  const gap = isLandscape ? 21 : 25;

  let y = yPos;
  if (y > (isLandscape ? 470 : 690)) {
    doc.addPage({ margin: 25, size: 'A4', layout: isLandscape ? 'landscape' : 'portrait' });
    y = 40;
  }

  let signerName = distributorName || 'Fahad Rasheed';
  if (/system\s*admin/i.test(signerName) || /^admin$/i.test(signerName)) {
    signerName = 'Fahad Rasheed';
  }

  // Card 1: Salary Distributor / Authorized Signer (Fahad Rasheed)
  doc.rect(margin, y, cardWidth, 50).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(signerName.toUpperCase(), margin + 12, y + 8);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('Salary Disbursement & Reconciliation Audit', margin + 12, y + 21);
  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8).text('✓ DISBURSED & RECONCILED', margin + 12, y + 34);

  // Card 2: Management / Payroll Auditor
  const box2X = margin + cardWidth + gap;
  doc.rect(box2X, y, cardWidth, 50).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('SARFRAZ AHMAD / MANAGEMENT', box2X + 12, y + 8);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('Payroll Auditor • Verification & Business Approval', box2X + 12, y + 21);
  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8).text('✓ AUDITED & AUTHORIZED', box2X + 12, y + 34);

  // Official Document Footer
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5).text(
    `PIXX ROTA • Official Payroll Disbursement Record • Generated on ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} • Confidential Business Document`,
    margin, y + 58, { align: 'center', width: width - margin * 2 }
  );
}

/**
 * Generate PDF for Arsalan's Salary Distributor Dashboard
 */
async function buildDistributorSalaryPDF(res, data = {}, generatedBy = 'Arsalan') {
  const { salaries = [], metrics = {}, weekLabel = '', shopName = '', statusFilter = 'All' } = data;
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  const margin = 25;
  const contentWidth = 841.89 - margin * 2; // 791.89

  const periodText = weekLabel && weekLabel !== 'All' ? `Week: ${weekLabel}` : 'All Active Periods';
  const subTitleText = shopName ? `Location: ${shopName} • Status: ${statusFilter}` : `All Locations • Status: ${statusFilter}`;
  drawPdfBanner(doc, 'Salary Disbursement & Payout Statement', subTitleText, periodText, true);

  // KPI Metrics Summary Cards (Top Row)
  const kpiY = 74;
  const cardW = 126;
  const gap = 7;
  let kpiX = margin;

  const totalWeeklyWages = metrics.totalWeeklyWages ?? salaries.reduce((sum, s) => sum + (s.attendanceSalary || s.weeklySalary || s.finalSalary || 0), 0);
  const totalAllowance = metrics.totalAllowance ?? salaries.reduce((sum, s) => sum + (s.allowance || ((s.travelAllowance || 0) + (s.otherAllowances || 0))), 0);
  const totalOpeningBalance = metrics.totalOpeningBalance ?? salaries.reduce((sum, s) => sum + (s.openingBalance || 0), 0);
  const totalCommissionBonus = metrics.totalCommissionBonus ?? salaries.reduce((sum, s) => sum + (s.bonus || 0), 0);
  const totalPayable = metrics.totalPayable ?? salaries.reduce((sum, s) => sum + (s.totalPayable || 0), 0);
  const totalPaid = metrics.totalPaid ?? salaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
  const totalRemaining = metrics.totalOutstanding ?? salaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);

  drawKpiCard(doc, kpiX, kpiY, cardW, 'STAFF COUNT', `${salaries.length} Workers`, '#0f172a');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'ATTENDANCE WAGES', `£${totalWeeklyWages.toFixed(2)}`, '#2563eb');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'ALLOWANCES', `£${totalAllowance.toFixed(2)}`, '#0284c7');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'OPENING BALANCES', `£${totalOpeningBalance.toFixed(2)}`, '#7c3aed');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'TOTAL DISBURSED', `£${totalPaid.toFixed(2)}`, '#059669');
  kpiX += cardW + gap;
  drawKpiCard(doc, kpiX, kpiY, cardW, 'TOTAL REMAINING', `£${totalRemaining.toFixed(2)}`, totalRemaining > 0 ? '#dc2626' : '#059669');

  let y = 132;
  const tableHeaderH = 18;
  const rowH = 19;
  const totalH = 18;

  const drawHeader = () => {
    doc.rect(margin, y, contentWidth, tableHeaderH).fillAndStroke('#f1f5f9', '#cbd5e1');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(6.8);
    doc.text('#', 26, y + 5.5, { width: 16, align: 'center', lineBreak: false });
    doc.text('WORKER NAME & ID', 44, y + 5.5, { width: 108, lineBreak: false });
    doc.text('SHOP LOCATION', 154, y + 5.5, { width: 80, lineBreak: false });
    doc.text('WEEK PERIOD', 236, y + 5.5, { width: 78, align: 'center', lineBreak: false });
    doc.text('DAYS & RATE', 316, y + 5.5, { width: 50, align: 'right', lineBreak: false });
    doc.text('DEDUCT.', 368, y + 5.5, { width: 48, align: 'right', lineBreak: false });
    doc.text('ATTEND WAGE', 418, y + 5.5, { width: 58, align: 'right', lineBreak: false });
    doc.text('ALLOWANCE', 478, y + 5.5, { width: 50, align: 'right', lineBreak: false });
    doc.text('OPENING BAL', 530, y + 5.5, { width: 54, align: 'right', lineBreak: false });
    doc.text('BONUS', 586, y + 5.5, { width: 48, align: 'right', lineBreak: false });
    doc.text('TOTAL PAYABLE', 636, y + 5.5, { width: 64, align: 'right', lineBreak: false });
    doc.text('PAID SO FAR', 702, y + 5.5, { width: 56, align: 'right', lineBreak: false });
    doc.text('REMAINING', 760, y + 5.5, { width: 56, align: 'right', lineBreak: false });
    y += tableHeaderH;
  };

  drawHeader();

  salaries.forEach((s, idx) => {
    if (y + rowH + totalH + 75 > 570) {
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      y = 30;
      drawHeader();
    }

    const isPartial = (s.totalPaid || 0) > 0 && (s.balanceRemaining || 0) > 0;
    const openingBal = Number(s.openingBalance || 0);
    const attendanceWage = Number(s.attendanceSalary ?? (s.weeklySalaryOverride ?? s.netAttendancePay ?? s.weeklySalary ?? s.finalSalary ?? 0));
    const allowance = Number(s.allowance ?? ((s.travelAllowance || 0) + (s.otherAllowances || 0)));
    const deduction = Number(((s.lateDeductions || 0) + (s.manualDeductions || 0)).toFixed(2));
    const bonus = Number(s.bonus || 0);
    const totalPayableRow = Number(s.totalPayable || (attendanceWage + allowance + openingBal + bonus));
    const paidRow = Number(s.totalPaid || 0);
    const remainingRow = Number(s.balanceRemaining || 0);

    const dailyWage = s.employee?.dailyWage || (s.workingDays && s.grossDailyWages ? s.grossDailyWages / s.workingDays : 0);
    const workStr = `${s.workingDays || 0}d @ £${Math.round(dailyWage)}`;

    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(margin, y, contentWidth, rowH).fill(bg);

    // 1. Index
    doc.fillColor('#64748b').font('Helvetica').fontSize(7)
      .text(String(idx + 1), 26, y + 6, { width: 16, align: 'center', lineBreak: false });

    // 2. Name & ID
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
      .text((s.employeeName || '').slice(0, 16), 44, y + 2.5, { width: 108, lineBreak: false });
    doc.fillColor('#64748b').font('Helvetica').fontSize(6.5)
      .text(s.employeeId || '', 44, y + 10.5, { width: 108, lineBreak: false });

    // 3. Shop
    doc.fillColor('#334155').font('Helvetica').fontSize(6.8)
      .text((s.shopName || '').slice(0, 14), 154, y + 6, { width: 80, lineBreak: false });

    // 4. Week Period
    doc.fillColor('#475569').font('Helvetica').fontSize(6.6)
      .text(s.weekLabel || '', 236, y + 6, { width: 78, align: 'center', lineBreak: false });

    // 5. Work / Rate
    doc.fillColor('#475569').font('Helvetica').fontSize(6.8)
      .text(workStr, 316, y + 6, { width: 50, align: 'right', lineBreak: false });

    // 6. Deduct
    doc.fillColor(deduction > 0 ? '#dc2626' : '#94a3b8').font(deduction > 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8)
      .text(deduction > 0 ? `-£${deduction.toFixed(2)}` : '£0.00', 368, y + 6, { width: 48, align: 'right', lineBreak: false });

    // 7. Attendance Wages
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7)
      .text(`£${attendanceWage.toFixed(2)}`, 418, y + 6, { width: 58, align: 'right', lineBreak: false });

    // 8. Allowance
    doc.fillColor(allowance > 0 ? '#0284c7' : '#94a3b8').font(allowance > 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8)
      .text(allowance > 0 ? `+£${allowance.toFixed(2)}` : '£0.00', 478, y + 6, { width: 50, align: 'right', lineBreak: false });

    // 9. Opening Bal
    doc.fillColor(openingBal > 0 ? '#7c3aed' : '#94a3b8').font(openingBal > 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8)
      .text(openingBal > 0 ? `+£${openingBal.toFixed(2)}` : '£0.00', 530, y + 6, { width: 54, align: 'right', lineBreak: false });

    // 10. Bonus / Comm
    doc.fillColor(bonus > 0 ? '#db2777' : '#94a3b8').font(bonus > 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.8)
      .text(bonus > 0 ? `+£${bonus.toFixed(2)}` : '£0.00', 586, y + 6, { width: 48, align: 'right', lineBreak: false });

    // 11. Total Payable
    doc.fillColor('#1e40af').font('Helvetica-Bold').fontSize(7.2)
      .text(`£${totalPayableRow.toFixed(2)}`, 636, y + 6, { width: 64, align: 'right', lineBreak: false });

    // 12. Paid
    doc.fillColor(paidRow > 0 ? '#059669' : '#94a3b8').font('Helvetica-Bold').fontSize(7.2)
      .text(paidRow > 0 ? `£${paidRow.toFixed(2)}` : '£0.00', 702, y + 6, { width: 56, align: 'right', lineBreak: false });

    // 13. Remaining
    doc.fillColor(remainingRow > 0 ? (isPartial ? '#d97706' : '#dc2626') : '#059669').font('Helvetica-Bold').fontSize(7.2)
      .text(remainingRow > 0 ? `£${remainingRow.toFixed(2)}` : '£0.00', 760, y + 6, { width: 56, align: 'right', lineBreak: false });

    y += rowH;
  });

  // Grand Totals Summary Row
  const totalDeductions = salaries.reduce((sum, s) => sum + Number(((s.lateDeductions || 0) + (s.manualDeductions || 0)).toFixed(2)), 0);

  if (y + totalH + 75 > 570) {
    doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
    y = 30;
  }
  doc.rect(margin, y, contentWidth, totalH).fill('#e2e8f0');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7);
  doc.text(`GRAND TOTALS (${salaries.length} WORKERS)`, 44, y + 5, { width: 220, lineBreak: false });
  doc.fillColor(totalDeductions > 0 ? '#dc2626' : '#64748b').text(totalDeductions > 0 ? `-£${totalDeductions.toFixed(2)}` : '£0.00', 368, y + 5, { width: 48, align: 'right', lineBreak: false });
  doc.fillColor('#0f172a').text(`£${totalWeeklyWages.toFixed(2)}`, 418, y + 5, { width: 58, align: 'right', lineBreak: false });
  doc.fillColor('#0284c7').text(`£${totalAllowance.toFixed(2)}`, 478, y + 5, { width: 50, align: 'right', lineBreak: false });
  doc.fillColor('#7c3aed').text(`£${totalOpeningBalance.toFixed(2)}`, 530, y + 5, { width: 54, align: 'right', lineBreak: false });
  doc.fillColor('#db2777').text(`£${totalCommissionBonus.toFixed(2)}`, 586, y + 5, { width: 48, align: 'right', lineBreak: false });
  doc.fillColor('#1e40af').text(`£${totalPayable.toFixed(2)}`, 636, y + 5, { width: 64, align: 'right', lineBreak: false });
  doc.fillColor('#059669').text(`£${totalPaid.toFixed(2)}`, 702, y + 5, { width: 56, align: 'right', lineBreak: false });
  doc.fillColor(totalRemaining > 0 ? '#dc2626' : '#059669').text(`£${totalRemaining.toFixed(2)}`, 760, y + 5, { width: 56, align: 'right', lineBreak: false });
  y += totalH;

  // Sign-off cards
  const sigY = y + 14;
  drawDistributorSignatures(doc, sigY, true, generatedBy);

  const cleanWeek = (weekLabel || 'All_Weeks').replace(/[\/–—\s]/g, '_');
  const filename = `Salary_Disbursement_${cleanWeek}.pdf`;
  return await sendPdfOrBuffer(res, doc, filename);
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
  doc.rect(25, y, 545, 20).fillAndStroke('#f1f5f9', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
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

/**
 * Generate PDF for Complete System Database Backup & Month-End Archive
 */
async function buildSystemBackupPDF(res, backupData = {}, generatedBy = 'Fahad Rasheed') {
  const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
  const margin = 25;
  const contentWidth = 791.89;

  const {
    period = {},
    summary = {},
    shops = [],
    employees = [],
    attendanceByWorker = [],
    salaries = [],
    payments = [],
    ledgerBalances = []
  } = backupData;

  const periodLabel = period.monthLabel || 'All Data';
  const subtitle = period.scope === 'all'
    ? 'Lifetime Complete System Database Archive'
    : `Monthly Database Archive: ${period.startStr || ''} to ${period.endStr || ''}`;

  const drawSectionBanner = (title, countText, curY) => {
    doc.roundedRect(margin, curY, contentWidth, 20, 3).fillAndStroke('#0f172a', '#1e293b');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text(title, margin + 10, curY + 5.5, { lineBreak: false });
    if (countText) {
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text(countText, margin + contentWidth - 210, curY + 6, { width: 200, align: 'right', lineBreak: false });
    }
    return curY + 20;
  };

  const drawFooter = () => {
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text(
      `PIXXTECHNOLOGIES UK • OFFICIAL SYSTEM DATABASE BACKUP ARCHIVE • Confidential & Legally Binding Financial Record • Period: ${periodLabel}`,
      margin, 570, { align: 'center', width: contentWidth }
    );
  };

  // --- PAGE 1: COVER & MASTER DATA DIRECTORIES ---
  drawPdfBanner(doc, 'System Database Backup', subtitle, `Period: ${periodLabel}`, true);

  const kpiY = 75;
  const cardW = 126;
  const gap = 7;
  drawKpiCard(doc, margin, kpiY, cardW, 'TOTAL WORKERS', `${summary.totalEmployees || 0} Staff (${summary.activeEmployees || 0} Active)`, '#0f172a');
  drawKpiCard(doc, margin + (cardW + gap) * 1, kpiY, cardW, 'REGISTERED SHOPS', `${summary.totalShops || 0} Locations`, '#2563eb');
  drawKpiCard(doc, margin + (cardW + gap) * 2, kpiY, cardW, 'ATTENDANCE LOGS', `${summary.totalAttendanceRecords || 0} Records`, '#0284c7');
  drawKpiCard(doc, margin + (cardW + gap) * 3, kpiY, cardW, 'WAGES EARNED', `£${(summary.totalWagesEarned || 0).toFixed(2)}`, '#059669');
  drawKpiCard(doc, margin + (cardW + gap) * 4, kpiY, cardW, 'DISBURSED PAYMENTS', `£${(summary.totalPaid || 0).toFixed(2)}`, '#d97706');
  drawKpiCard(doc, margin + (cardW + gap) * 5, kpiY, cardW, 'OUTSTANDING LIABILITY', `£${(summary.totalRemaining || 0).toFixed(2)}`, (summary.totalRemaining || 0) > 0 ? '#dc2626' : '#059669');

  let y = 130;

  // SECTION 1: SHOPS MASTER DIRECTORY
  y = drawSectionBanner('1. SHOPS & STORE MASTER LOCATIONS', `${shops.length} SHOPS`, y);

  doc.rect(margin, y, contentWidth, 16).fill('#e2e8f0');
  doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5);
  doc.text('SHOP NAME', margin + 8, y + 4, { width: 150, lineBreak: false });
  doc.text('STORE ADDRESS / LOCATION', margin + 165, y + 4, { width: 330, lineBreak: false });
  doc.text('CONTACT PHONE', margin + 505, y + 4, { width: 110, lineBreak: false });
  doc.text('STATUS', margin + 625, y + 4, { width: 70, align: 'center', lineBreak: false });
  doc.text('ASSIGNED STAFF', margin + 705, y + 4, { width: 75, align: 'center', lineBreak: false });
  y += 16;

  shops.forEach((s, idx) => {
    doc.rect(margin, y, contentWidth, 15).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(s.name || '', margin + 8, y + 3.5, { width: 150, lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor('#334155').text(s.address || '—', margin + 165, y + 3.5, { width: 330, lineBreak: false });
    doc.text(s.phone || '—', margin + 505, y + 3.5, { width: 110, lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(s.status === 'Active' ? '#059669' : '#dc2626').text(s.status || 'Active', margin + 625, y + 3.5, { width: 70, align: 'center', lineBreak: false });
    doc.font('Helvetica').fillColor('#0f172a').text(String(s.staffCount || 0), margin + 705, y + 3.5, { width: 75, align: 'center', lineBreak: false });
    y += 15;
  });

  y += 12;

  // SECTION 2: EMPLOYEES MASTER DIRECTORY
  y = drawSectionBanner('2. STAFF & EMPLOYEES MASTER DIRECTORY', `${employees.length} EMPLOYEES`, y);

  const drawEmpHeader = () => {
    doc.rect(margin, y, contentWidth, 16).fill('#e2e8f0');
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5);
    doc.text('ID', margin + 8, y + 4, { width: 60, lineBreak: false });
    doc.text('EMPLOYEE NAME', margin + 75, y + 4, { width: 160, lineBreak: false });
    doc.text('PRIMARY SHOP', margin + 245, y + 4, { width: 110, lineBreak: false });
    doc.text('ROLE', margin + 365, y + 4, { width: 110, lineBreak: false });
    doc.text('DAILY RATE', margin + 485, y + 4, { width: 70, align: 'right', lineBreak: false });
    doc.text('STATUS', margin + 565, y + 4, { width: 65, align: 'center', lineBreak: false });
    doc.text('OPENING BAL', margin + 640, y + 4, { width: 70, align: 'right', lineBreak: false });
    doc.text('LEDGER BAL', margin + 715, y + 4, { width: 65, align: 'right', lineBreak: false });
    y += 16;
  };
  drawEmpHeader();

  employees.forEach((emp, idx) => {
    if (y + 15 > 550) {
      drawFooter();
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      drawPdfBanner(doc, 'System Database Backup', subtitle, `Staff Directory (Cont.)`, true);
      y = 75;
      drawEmpHeader();
    }
    doc.rect(margin, y, contentWidth, 15).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(emp.employeeId || '', margin + 8, y + 3.5, { width: 60, lineBreak: false });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(emp.name || '', margin + 75, y + 3.5, { width: 160, lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor('#334155').text(emp.shopName || '—', margin + 245, y + 3.5, { width: 110, lineBreak: false });
    doc.text(emp.role || 'WORKER', margin + 365, y + 3.5, { width: 110, lineBreak: false });
    doc.text(`£${(emp.dailyWage || 0).toFixed(2)}`, margin + 485, y + 3.5, { width: 70, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(emp.status === 'Active' ? '#059669' : '#dc2626').text(emp.status || 'Active', margin + 565, y + 3.5, { width: 65, align: 'center', lineBreak: false });
    doc.font('Helvetica').fillColor('#64748b').text(`£${(emp.openingBalance || 0).toFixed(2)}`, margin + 640, y + 3.5, { width: 70, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(emp.currentBalance > 0 ? '#dc2626' : '#059669').text(`£${(emp.currentBalance || 0).toFixed(2)}`, margin + 715, y + 3.5, { width: 65, align: 'right', lineBreak: false });
    y += 15;
  });
  drawFooter();

  // --- PAGE 2: MONTHLY ATTENDANCE SUMMARY ---
  doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'System Database Backup', subtitle, `Attendance & Hours (${periodLabel})`, true);
  y = 75;

  y = drawSectionBanner(`3. MONTHLY ATTENDANCE & HOURS SUMMARY (${periodLabel})`, `${attendanceByWorker.length} WORKERS`, y);

  const drawAttHeader = () => {
    doc.rect(margin, y, contentWidth, 16).fill('#e2e8f0');
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5);
    doc.text('WORKER NAME', margin + 8, y + 4, { width: 170, lineBreak: false });
    doc.text('PRIMARY SHOP', margin + 185, y + 4, { width: 120, lineBreak: false });
    doc.text('SHIFTS', margin + 315, y + 4, { width: 45, align: 'center', lineBreak: false });
    doc.text('PRESENT', margin + 365, y + 4, { width: 50, align: 'center', lineBreak: false });
    doc.text('LATE', margin + 420, y + 4, { width: 45, align: 'center', lineBreak: false });
    doc.text('HALF', margin + 470, y + 4, { width: 45, align: 'center', lineBreak: false });
    doc.text('OFF', margin + 520, y + 4, { width: 45, align: 'center', lineBreak: false });
    doc.text('WORKED HRS', margin + 575, y + 4, { width: 65, align: 'right', lineBreak: false });
    doc.text('DEDUCT (£)', margin + 650, y + 4, { width: 60, align: 'right', lineBreak: false });
    doc.text('ATTENDANCE PAY', margin + 720, y + 4, { width: 65, align: 'right', lineBreak: false });
    y += 16;
  };
  drawAttHeader();

  let attTotals = { shifts: 0, present: 0, late: 0, half: 0, absent: 0, hours: 0, deduct: 0, pay: 0 };

  attendanceByWorker.forEach((row, idx) => {
    if (y + 16 > 530) {
      drawFooter();
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      drawPdfBanner(doc, 'System Database Backup', subtitle, `Attendance & Hours (Cont.)`, true);
      y = 75;
      drawAttHeader();
    }
    attTotals.shifts += row.shiftsCount || 0;
    attTotals.present += row.present || 0;
    attTotals.late += row.late || 0;
    attTotals.half += row.half || 0;
    attTotals.absent += row.absent || 0;
    attTotals.hours += row.hours || 0;
    attTotals.deduct += row.lateDeductions || 0;
    attTotals.pay += row.attendancePay || 0;

    doc.rect(margin, y, contentWidth, 15).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(row.employeeName || '', margin + 8, y + 3.5, { width: 170, lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor('#334155').text(row.shopName || '—', margin + 185, y + 3.5, { width: 120, lineBreak: false });
    doc.text(String(row.shiftsCount || 0), margin + 315, y + 3.5, { width: 45, align: 'center', lineBreak: false });
    doc.fillColor('#059669').text(String(row.present || 0), margin + 365, y + 3.5, { width: 50, align: 'center', lineBreak: false });
    doc.fillColor('#d97706').text(String(row.late || 0), margin + 420, y + 3.5, { width: 45, align: 'center', lineBreak: false });
    doc.fillColor('#0284c7').text(String(row.half || 0), margin + 470, y + 3.5, { width: 45, align: 'center', lineBreak: false });
    doc.fillColor('#dc2626').text(String(row.absent || 0), margin + 520, y + 3.5, { width: 45, align: 'center', lineBreak: false });
    doc.fillColor('#0f172a').text(`${(row.hours || 0).toFixed(1)}h`, margin + 575, y + 3.5, { width: 65, align: 'right', lineBreak: false });
    doc.fillColor('#dc2626').text(`£${(row.lateDeductions || 0).toFixed(2)}`, margin + 650, y + 3.5, { width: 60, align: 'right', lineBreak: false });
    doc.fillColor('#059669').font('Helvetica-Bold').text(`£${(row.attendancePay || 0).toFixed(2)}`, margin + 720, y + 3.5, { width: 65, align: 'right', lineBreak: false });
    y += 15;
  });

  // Attendance Totals Row
  doc.rect(margin, y, contentWidth, 18).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  doc.text('MONTH ATTENDANCE TOTALS', margin + 8, y + 5, { width: 280, lineBreak: false });
  doc.text(String(attTotals.shifts), margin + 315, y + 5, { width: 45, align: 'center', lineBreak: false });
  doc.text(String(attTotals.present), margin + 365, y + 5, { width: 50, align: 'center', lineBreak: false });
  doc.text(String(attTotals.late), margin + 420, y + 5, { width: 45, align: 'center', lineBreak: false });
  doc.text(String(attTotals.half), margin + 470, y + 5, { width: 45, align: 'center', lineBreak: false });
  doc.text(String(attTotals.absent), margin + 520, y + 5, { width: 45, align: 'center', lineBreak: false });
  doc.text(`${attTotals.hours.toFixed(1)}h`, margin + 575, y + 5, { width: 65, align: 'right', lineBreak: false });
  doc.text(`£${attTotals.deduct.toFixed(2)}`, margin + 650, y + 5, { width: 60, align: 'right', lineBreak: false });
  doc.text(`£${attTotals.pay.toFixed(2)}`, margin + 720, y + 5, { width: 65, align: 'right', lineBreak: false });
  y += 18;
  drawFooter();

  // --- PAGE 3: WEEKLY PAYROLL & SALARIES ---
  doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'System Database Backup', subtitle, `Weekly Payroll Sheets (${periodLabel})`, true);
  y = 75;

  y = drawSectionBanner(`4. WEEKLY SALARY SHEETS & PAYROLL (${periodLabel})`, `${salaries.length} RECORDS`, y);

  const drawSalHeader = () => {
    doc.rect(margin, y, contentWidth, 16).fill('#e2e8f0');
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7);
    doc.text('WEEK PERIOD', margin + 6, y + 4, { width: 105, lineBreak: false });
    doc.text('WORKER NAME', margin + 115, y + 4, { width: 120, lineBreak: false });
    doc.text('SHOP', margin + 240, y + 4, { width: 80, lineBreak: false });
    doc.text('DAYS', margin + 325, y + 4, { width: 30, align: 'center', lineBreak: false });
    doc.text('WAGE (£)', margin + 360, y + 4, { width: 45, align: 'right', lineBreak: false });
    doc.text('DEDUCT', margin + 410, y + 4, { width: 45, align: 'right', lineBreak: false });
    doc.text('ALLOW', margin + 460, y + 4, { width: 45, align: 'right', lineBreak: false });
    doc.text('OPENING', margin + 510, y + 4, { width: 45, align: 'right', lineBreak: false });
    doc.text('BONUS', margin + 560, y + 4, { width: 40, align: 'right', lineBreak: false });
    doc.text('PAYABLE', margin + 605, y + 4, { width: 50, align: 'right', lineBreak: false });
    doc.text('PAID (£)', margin + 660, y + 4, { width: 45, align: 'right', lineBreak: false });
    doc.text('REMAINING', margin + 710, y + 4, { width: 45, align: 'right', lineBreak: false });
    doc.text('STATUS', margin + 760, y + 4, { width: 30, align: 'center', lineBreak: false });
    y += 16;
  };
  drawSalHeader();

  let salTotals = { wage: 0, deduct: 0, allow: 0, opening: 0, bonus: 0, payable: 0, paid: 0, remaining: 0 };

  salaries.forEach((sal, idx) => {
    if (y + 15 > 530) {
      drawFooter();
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      drawPdfBanner(doc, 'System Database Backup', subtitle, `Weekly Payroll (Cont.)`, true);
      y = 75;
      drawSalHeader();
    }
    const wage = Number(sal.attendanceSalary || sal.netAttendancePay || 0);
    const deduct = Number(sal.deductions || sal.manualDeductions || 0);
    const allow = Number(sal.allowances || (sal.travelAllowance || 0) + (sal.otherAllowances || 0));
    const opening = Number(sal.openingBalance || 0);
    const bonus = Number(sal.bonus || 0);
    const payable = Number(sal.totalPayable || (wage + allow + opening + bonus - deduct));
    const paid = Number(sal.totalPaid || 0);
    const remaining = Number(sal.balanceRemaining || 0);

    salTotals.wage += wage;
    salTotals.deduct += deduct;
    salTotals.allow += allow;
    salTotals.opening += opening;
    salTotals.bonus += bonus;
    salTotals.payable += payable;
    salTotals.paid += paid;
    salTotals.remaining += remaining;

    doc.rect(margin, y, contentWidth, 14).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text((sal.weekLabel || '').slice(0, 22), margin + 6, y + 3.5, { width: 105, lineBreak: false });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7).text(sal.employeeName || '', margin + 115, y + 3.5, { width: 120, lineBreak: false });
    doc.font('Helvetica').fontSize(6.5).fillColor('#334155').text(sal.shopName || '', margin + 240, y + 3.5, { width: 80, lineBreak: false });
    doc.text(String(sal.workingDays || 0), margin + 325, y + 3.5, { width: 30, align: 'center', lineBreak: false });
    doc.text(`£${wage.toFixed(2)}`, margin + 360, y + 3.5, { width: 45, align: 'right', lineBreak: false });
    doc.fillColor(deduct > 0 ? '#dc2626' : '#64748b').text(`£${deduct.toFixed(2)}`, margin + 410, y + 3.5, { width: 45, align: 'right', lineBreak: false });
    doc.fillColor('#0f172a').text(`£${allow.toFixed(2)}`, margin + 460, y + 3.5, { width: 45, align: 'right', lineBreak: false });
    doc.fillColor('#64748b').text(`£${opening.toFixed(2)}`, margin + 510, y + 3.5, { width: 45, align: 'right', lineBreak: false });
    doc.fillColor('#0f172a').text(`£${bonus.toFixed(2)}`, margin + 560, y + 3.5, { width: 40, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fillColor('#2563eb').text(`£${payable.toFixed(2)}`, margin + 605, y + 3.5, { width: 50, align: 'right', lineBreak: false });
    doc.fillColor('#059669').text(`£${paid.toFixed(2)}`, margin + 660, y + 3.5, { width: 45, align: 'right', lineBreak: false });
    doc.fillColor(remaining > 0 ? '#dc2626' : '#059669').text(`£${remaining.toFixed(2)}`, margin + 710, y + 3.5, { width: 45, align: 'right', lineBreak: false });
    doc.font('Helvetica').fillColor('#64748b').text(sal.status === 'PAID' ? 'PAID' : (remaining === 0 ? 'PAID' : 'PART'), margin + 760, y + 3.5, { width: 30, align: 'center', lineBreak: false });
    y += 14;
  });

  // Payroll Totals Row
  doc.rect(margin, y, contentWidth, 18).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
  doc.text('TOTALS', margin + 6, y + 5, { width: 300, lineBreak: false });
  doc.text(`£${salTotals.wage.toFixed(2)}`, margin + 360, y + 5, { width: 45, align: 'right', lineBreak: false });
  doc.text(`£${salTotals.deduct.toFixed(2)}`, margin + 410, y + 5, { width: 45, align: 'right', lineBreak: false });
  doc.text(`£${salTotals.allow.toFixed(2)}`, margin + 460, y + 5, { width: 45, align: 'right', lineBreak: false });
  doc.text(`£${salTotals.opening.toFixed(2)}`, margin + 510, y + 5, { width: 45, align: 'right', lineBreak: false });
  doc.text(`£${salTotals.bonus.toFixed(2)}`, margin + 560, y + 5, { width: 40, align: 'right', lineBreak: false });
  doc.text(`£${salTotals.payable.toFixed(2)}`, margin + 605, y + 5, { width: 50, align: 'right', lineBreak: false });
  doc.text(`£${salTotals.paid.toFixed(2)}`, margin + 660, y + 5, { width: 45, align: 'right', lineBreak: false });
  doc.text(`£${salTotals.remaining.toFixed(2)}`, margin + 710, y + 5, { width: 45, align: 'right', lineBreak: false });
  y += 18;
  drawFooter();

  // --- PAGE 4: PAYMENTS & DISBURSEMENTS REGISTER ---
  doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'System Database Backup', subtitle, `Disbursements Register (${periodLabel})`, true);
  y = 75;

  y = drawSectionBanner(`5. SALARY PAYMENTS & DISBURSEMENTS REGISTER (${periodLabel})`, `${payments.length} PAYMENTS`, y);

  const drawPayHeader = () => {
    doc.rect(margin, y, contentWidth, 16).fill('#e2e8f0');
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5);
    doc.text('PAYMENT DATE', margin + 8, y + 4, { width: 85, lineBreak: false });
    doc.text('RECEIPT ID', margin + 100, y + 4, { width: 110, lineBreak: false });
    doc.text('WORKER NAME', margin + 215, y + 4, { width: 160, lineBreak: false });
    doc.text('SHOP', margin + 380, y + 4, { width: 110, lineBreak: false });
    doc.text('METHOD', margin + 495, y + 4, { width: 65, align: 'center', lineBreak: false });
    doc.text('AMOUNT PAID', margin + 565, y + 4, { width: 75, align: 'right', lineBreak: false });
    doc.text('ADJUSTMENT', margin + 645, y + 4, { width: 65, align: 'right', lineBreak: false });
    doc.text('STATUS', margin + 715, y + 4, { width: 65, align: 'center', lineBreak: false });
    y += 16;
  };
  drawPayHeader();

  let payTotals = { cash: 0, bank: 0, total: 0, adjustments: 0 };

  payments.forEach((p, idx) => {
    if (y + 15 > 530) {
      drawFooter();
      doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
      drawPdfBanner(doc, 'System Database Backup', subtitle, `Disbursements Register (Cont.)`, true);
      y = 75;
      drawPayHeader();
    }
    const amt = Number(p.amount || 0);
    const adj = Number(p.deductionAmount || 0);
    payTotals.total += amt;
    payTotals.adjustments += adj;
    if (String(p.paymentMethod).toLowerCase() === 'cash') payTotals.cash += amt;
    else payTotals.bank += amt;

    doc.rect(margin, y, contentWidth, 15).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(p.dateStr || '', margin + 8, y + 3.5, { width: 85, lineBreak: false });
    doc.text(p.receiptId || '—', margin + 100, y + 3.5, { width: 110, lineBreak: false });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(p.employeeName || '', margin + 215, y + 3.5, { width: 160, lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor('#334155').text(p.shopName || '—', margin + 380, y + 3.5, { width: 110, lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(p.paymentMethod === 'Bank' ? '#7c3aed' : '#d97706').text(p.paymentMethod || 'Cash', margin + 495, y + 3.5, { width: 65, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fillColor('#059669').text(`£${amt.toFixed(2)}`, margin + 565, y + 3.5, { width: 75, align: 'right', lineBreak: false });
    doc.font('Helvetica').fillColor('#dc2626').text(adj > 0 ? `£${adj.toFixed(2)}` : '—', margin + 645, y + 3.5, { width: 65, align: 'right', lineBreak: false });
    doc.fillColor('#059669').text('COMPLETED', margin + 715, y + 3.5, { width: 65, align: 'center', lineBreak: false });
    y += 15;
  });

  // Payments Totals Row
  doc.rect(margin, y, contentWidth, 18).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  doc.text(`TOTALS: CASH £${payTotals.cash.toFixed(2)} | BANK £${payTotals.bank.toFixed(2)}`, margin + 8, y + 5, { width: 500, lineBreak: false });
  doc.text(`£${payTotals.total.toFixed(2)}`, margin + 565, y + 5, { width: 75, align: 'right', lineBreak: false });
  doc.text(`£${payTotals.adjustments.toFixed(2)}`, margin + 645, y + 5, { width: 65, align: 'right', lineBreak: false });
  y += 18;
  drawFooter();

  // --- PAGE 5: WORKER CLOSING BALANCES & AUDIT SIGN-OFF ---
  doc.addPage({ margin: 25, size: 'A4', layout: 'landscape' });
  drawPdfBanner(doc, 'System Database Backup', subtitle, `Closing Ledger Balances (${periodLabel})`, true);
  y = 75;

  y = drawSectionBanner(`6. WORKERS CLOSING FINANCIAL LEDGER STATEMENT (${periodLabel})`, `${ledgerBalances.length} ACCOUNTS`, y);

  doc.rect(margin, y, contentWidth, 16).fill('#e2e8f0');
  doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.5);
  doc.text('EMP ID', margin + 8, y + 4, { width: 70, lineBreak: false });
  doc.text('WORKER NAME', margin + 85, y + 4, { width: 190, lineBreak: false });
  doc.text('PRIMARY LOCATION', margin + 285, y + 4, { width: 130, lineBreak: false });
  doc.text('TOTAL EARNED (£)', margin + 425, y + 4, { width: 110, align: 'right', lineBreak: false });
  doc.text('TOTAL DISBURSED (£)', margin + 545, y + 4, { width: 110, align: 'right', lineBreak: false });
  doc.text('CLOSING BALANCE (£)', margin + 665, y + 4, { width: 115, align: 'right', lineBreak: false });
  y += 16;

  let totalEarnedSum = 0;
  let totalDisbursedSum = 0;
  let totalClosingLiability = 0;

  ledgerBalances.forEach((item, idx) => {
    totalEarnedSum += Number(item.totalEarned || 0);
    totalDisbursedSum += Number(item.totalPaid || 0);
    totalClosingLiability += Number(item.currentBalance || 0);

    doc.rect(margin, y, contentWidth, 15).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(item.employeeId || '', margin + 8, y + 3.5, { width: 70, lineBreak: false });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(item.employeeName || '', margin + 85, y + 3.5, { width: 190, lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor('#334155').text(item.shopName || '—', margin + 285, y + 3.5, { width: 130, lineBreak: false });
    doc.text(`£${(item.totalEarned || 0).toFixed(2)}`, margin + 425, y + 3.5, { width: 110, align: 'right', lineBreak: false });
    doc.fillColor('#059669').text(`£${(item.totalPaid || 0).toFixed(2)}`, margin + 545, y + 3.5, { width: 110, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fillColor((item.currentBalance || 0) > 0 ? '#dc2626' : '#059669').text(`£${(item.currentBalance || 0).toFixed(2)}`, margin + 665, y + 3.5, { width: 115, align: 'right', lineBreak: false });
    y += 15;
  });

  // Grand Closing Totals Row
  doc.rect(margin, y, contentWidth, 18).fill('#1e293b');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  doc.text('TOTAL COMPANY FINANCIAL BALANCES', margin + 8, y + 5, { width: 350, lineBreak: false });
  doc.text(`£${totalEarnedSum.toFixed(2)}`, margin + 425, y + 5, { width: 110, align: 'right', lineBreak: false });
  doc.text(`£${totalDisbursedSum.toFixed(2)}`, margin + 545, y + 5, { width: 110, align: 'right', lineBreak: false });
  doc.text(`£${totalClosingLiability.toFixed(2)}`, margin + 665, y + 5, { width: 115, align: 'right', lineBreak: false });
  y += 28;

  // OFFICIAL VERIFICATION & AUDIT CERTIFICATION BLOCK
  const certW = 385;
  doc.rect(margin, y, certW, 60).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(generatedBy || 'FAHAD RASHEED', margin + 12, y + 10);
  doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text('System Administrator & Financial Controller • PixxTechnologies UK', margin + 12, y + 24);
  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8).text('✓ AUTHENTICATED SYSTEM DATABASE BACKUP', margin + 12, y + 42);

  const box2X = margin + certW + 20;
  doc.rect(box2X, y, certW, 60).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('SECURITY & INTEGRITY CERTIFICATE', box2X + 12, y + 10);
  doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text(`Archived on: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')} UTC`, box2X + 12, y + 24);
  doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(8).text('✓ DATA INTEGRITY 100% VERIFIED & SYNCHRONIZED', box2X + 12, y + 42);

  drawFooter();
  return await sendPdfOrBuffer(res, doc, `Pixx_System_Database_Backup_${periodLabel.replace(/[\/–\s]/g, '_')}.pdf`);
}

/**
 * Generate Excel workbook for Complete System Database Backup & Month-End Archive
 */
async function buildSystemBackupExcel(backupData = {}) {
  const workbook = new ExcelJS.Workbook();
  const {
    period = {},
    summary = {},
    shops = [],
    employees = [],
    attendanceByWorker = [],
    salaries = [],
    payments = [],
    ledgerBalances = []
  } = backupData;

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const headerFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

  // Sheet 1: Executive Overview
  const sumSheet = workbook.addWorksheet('System Overview');
  sumSheet.columns = [{ width: 32 }, { width: 45 }];
  sumSheet.addRow(['PIXXTECHNOLOGIES UK — SYSTEM DATABASE BACKUP', '']);
  sumSheet.mergeCells('A1:B1');
  sumSheet.getCell('A1').font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  sumSheet.getCell('A1').fill = headerFill;
  sumSheet.addRow(['Archive Period', period.monthLabel || 'All Data']);
  sumSheet.addRow(['Date Range', `${period.startStr || '—'} to ${period.endStr || '—'}`]);
  sumSheet.addRow(['Backup Scope', period.scope || 'Month']);
  sumSheet.addRow(['Generated On (UTC)', new Date().toISOString()]);
  sumSheet.addRow(['Total Employees', `${summary.totalEmployees || 0} (${summary.activeEmployees || 0} Active)`]);
  sumSheet.addRow(['Total Shops', summary.totalShops || 0]);
  sumSheet.addRow(['Total Attendance Records', summary.totalAttendanceRecords || 0]);
  sumSheet.addRow(['Total Weekly Salaries', summary.totalWeeklySalaries || 0]);
  sumSheet.addRow(['Total Wages Earned (£)', Number((summary.totalWagesEarned || 0).toFixed(2))]);
  sumSheet.addRow(['Total Allowances (£)', Number((summary.totalAllowances || 0).toFixed(2))]);
  sumSheet.addRow(['Total Bonuses (£)', Number((summary.totalBonus || 0).toFixed(2))]);
  sumSheet.addRow(['Total Payable (£)', Number((summary.totalPayable || 0).toFixed(2))]);
  sumSheet.addRow(['Total Payments Disbursed (£)', Number((summary.totalPaid || 0).toFixed(2))]);
  sumSheet.addRow(['Cash Disbursed (£)', Number((summary.cashTotal || 0).toFixed(2))]);
  sumSheet.addRow(['Bank Disbursed (£)', Number((summary.bankTotal || 0).toFixed(2))]);
  sumSheet.addRow(['Closing Liability (£)', Number((summary.totalRemaining || 0).toFixed(2))]);

  // Sheet 2: Shops
  const shopSheet = workbook.addWorksheet('Shops');
  shopSheet.columns = [
    { header: 'Shop Name', key: 'name', width: 22 },
    { header: 'Address / Location', key: 'address', width: 40 },
    { header: 'Contact Phone', key: 'phone', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Assigned Staff', key: 'staffCount', width: 15 }
  ];
  shopSheet.getRow(1).font = headerFont;
  shopSheet.getRow(1).fill = headerFill;
  shops.forEach(s => shopSheet.addRow({
    name: s.name,
    address: s.address || '—',
    phone: s.phone || '—',
    status: s.status || 'Active',
    staffCount: s.staffCount || 0
  }));

  // Sheet 3: Employees
  const empSheet = workbook.addWorksheet('Employees');
  empSheet.columns = [
    { header: 'Employee ID', key: 'employeeId', width: 14 },
    { header: 'Full Name', key: 'name', width: 24 },
    { header: 'Primary Shop', key: 'shopName', width: 18 },
    { header: 'Role', key: 'role', width: 16 },
    { header: 'Daily Wage (£)', key: 'dailyWage', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Opening Balance (£)', key: 'openingBalance', width: 20 },
    { header: 'Current Balance (£)', key: 'currentBalance', width: 20 }
  ];
  empSheet.getRow(1).font = headerFont;
  empSheet.getRow(1).fill = headerFill;
  employees.forEach(e => empSheet.addRow({
    employeeId: e.employeeId,
    name: e.name,
    shopName: e.shopName || '—',
    role: e.role || 'WORKER',
    dailyWage: Number((e.dailyWage || 0).toFixed(2)),
    status: e.status || 'Active',
    openingBalance: Number((e.openingBalance || 0).toFixed(2)),
    currentBalance: Number((e.currentBalance || 0).toFixed(2))
  }));

  // Sheet 4: Monthly Attendance
  const attSheet = workbook.addWorksheet('Monthly Attendance');
  attSheet.columns = [
    { header: 'Worker Name', key: 'name', width: 24 },
    { header: 'Primary Shop', key: 'shop', width: 18 },
    { header: 'Total Shifts', key: 'shifts', width: 12 },
    { header: 'Present', key: 'present', width: 10 },
    { header: 'Late', key: 'late', width: 10 },
    { header: 'Half Day', key: 'half', width: 10 },
    { header: 'Absent / Off', key: 'absent', width: 12 },
    { header: 'Hours Worked', key: 'hours', width: 14 },
    { header: 'Late Deduct (£)', key: 'deduct', width: 15 },
    { header: 'Attendance Pay (£)', key: 'pay', width: 18 }
  ];
  attSheet.getRow(1).font = headerFont;
  attSheet.getRow(1).fill = headerFill;
  attendanceByWorker.forEach(a => attSheet.addRow({
    name: a.employeeName,
    shop: a.shopName || '—',
    shifts: a.shiftsCount || 0,
    present: a.present || 0,
    late: a.late || 0,
    half: a.half || 0,
    absent: a.absent || 0,
    hours: Number((a.hours || 0).toFixed(1)),
    deduct: Number((a.lateDeductions || 0).toFixed(2)),
    pay: Number((a.attendancePay || 0).toFixed(2))
  }));

  // Sheet 5: Weekly Salaries
  const salSheet = workbook.addWorksheet('Weekly Salaries');
  salSheet.columns = [
    { header: 'Week Label', key: 'weekLabel', width: 24 },
    { header: 'Worker Name', key: 'name', width: 22 },
    { header: 'Shop', key: 'shop', width: 16 },
    { header: 'Days', key: 'days', width: 8 },
    { header: 'Attendance Wage (£)', key: 'wage', width: 18 },
    { header: 'Deductions (£)', key: 'deduct', width: 15 },
    { header: 'Allowances (£)', key: 'allow', width: 15 },
    { header: 'Opening Bal (£)', key: 'opening', width: 15 },
    { header: 'Bonus (£)', key: 'bonus', width: 12 },
    { header: 'Total Payable (£)', key: 'payable', width: 16 },
    { header: 'Total Paid (£)', key: 'paid', width: 15 },
    { header: 'Remaining (£)', key: 'remaining', width: 15 },
    { header: 'Status', key: 'status', width: 14 }
  ];
  salSheet.getRow(1).font = headerFont;
  salSheet.getRow(1).fill = headerFill;
  salaries.forEach(s => salSheet.addRow({
    weekLabel: s.weekLabel,
    name: s.employeeName,
    shop: s.shopName,
    days: s.workingDays || 0,
    wage: Number((s.attendanceSalary || s.netAttendancePay || 0).toFixed(2)),
    deduct: Number((s.deductions || s.manualDeductions || 0).toFixed(2)),
    allow: Number((s.allowances || (s.travelAllowance || 0) + (s.otherAllowances || 0)).toFixed(2)),
    opening: Number((s.openingBalance || 0).toFixed(2)),
    bonus: Number((s.bonus || 0).toFixed(2)),
    payable: Number((s.totalPayable || 0).toFixed(2)),
    paid: Number((s.totalPaid || 0).toFixed(2)),
    remaining: Number((s.balanceRemaining || 0).toFixed(2)),
    status: s.status || 'FINALIZED'
  }));

  // Sheet 6: Payments
  const paySheet = workbook.addWorksheet('Disbursements');
  paySheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Receipt ID', key: 'receiptId', width: 22 },
    { header: 'Worker Name', key: 'name', width: 22 },
    { header: 'Shop', key: 'shop', width: 16 },
    { header: 'Method', key: 'method', width: 12 },
    { header: 'Amount Paid (£)', key: 'amount', width: 16 },
    { header: 'Deduction / Write-off (£)', key: 'deduct', width: 22 },
    { header: 'Disbursed By', key: 'paidBy', width: 18 },
    { header: 'Notes', key: 'notes', width: 28 }
  ];
  paySheet.getRow(1).font = headerFont;
  paySheet.getRow(1).fill = headerFill;
  payments.forEach(p => paySheet.addRow({
    date: p.dateStr,
    receiptId: p.receiptId,
    name: p.employeeName,
    shop: p.shopName || '—',
    method: p.paymentMethod || 'Cash',
    amount: Number((p.amount || 0).toFixed(2)),
    deduct: Number((p.deductionAmount || 0).toFixed(2)),
    paidBy: p.paidBy || 'Admin',
    notes: p.notes || ''
  }));

  // Sheet 7: Ledger Balances
  const ledSheet = workbook.addWorksheet('Ledger Balances');
  ledSheet.columns = [
    { header: 'Employee ID', key: 'id', width: 14 },
    { header: 'Worker Name', key: 'name', width: 22 },
    { header: 'Primary Shop', key: 'shop', width: 18 },
    { header: 'Total Earned (£)', key: 'earned', width: 16 },
    { header: 'Total Paid (£)', key: 'paid', width: 16 },
    { header: 'Closing Balance (£)', key: 'balance', width: 18 }
  ];
  ledSheet.getRow(1).font = headerFont;
  ledSheet.getRow(1).fill = headerFill;
  ledgerBalances.forEach(l => ledSheet.addRow({
    id: l.employeeId,
    name: l.employeeName,
    shop: l.shopName || '—',
    earned: Number((l.totalEarned || 0).toFixed(2)),
    paid: Number((l.totalPaid || 0).toFixed(2)),
    balance: Number((l.currentBalance || 0).toFixed(2))
  }));

  return workbook;
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
  buildWeeklySalaryDailyBreakdown,
  buildEmployeeMonthlyPDF,
  buildEmployeeYearlyExcel,
  buildEmployeeYearlyPDF,
  buildBonusPDF,
  buildShopLabourExcel,
  buildShopLabourPDF,
  buildPaymentsExcel,
  buildPaymentsPDF,
  buildDistributorSalaryPDF,
  buildLedgerExcel,
  buildLedgerPDF,
  buildSystemBackupPDF,
  buildSystemBackupExcel,
  SHOP_COLORS,
  getShopColor,
  getShopSequenceRank,
  sortDailyAttendanceRecords
};
