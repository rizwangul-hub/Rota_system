require('../utils/pdfkitFontPatch'); // MUST be before PDFDocument
const PDFDocument = require('pdfkit');
const WeeklySalary = require('../models/WeeklySalary');
const SalaryPayment = require('../models/SalaryPayment');
const LedgerTransaction = require('../models/LedgerTransaction');
const Shop = require('../models/Shop');
const { getUKDateString, getWeekRange, formatUKDate } = require('../utils/calc');
const { sendServerError } = require('../utils/httpErrors');

const FINALIZED_STATUSES = ['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'];

function normalizeStatus(st) {
  if (!st) return 'FINALIZED';
  const s = String(st).toUpperCase();
  if (s === 'PAID') return 'PAID';
  if (s === 'PARTIALLY_PAID' || s === 'PARTIALLY PAID') return 'PARTIALLY_PAID';
  return 'FINALIZED';
}

function getDateFilterQuery(filter, startDate, endDate) {
  const todayStr = getUKDateString();
  const [tY, tM, tD] = todayStr.split('-').map(Number);

  if (filter === 'THIS_WEEK') {
    const range = getWeekRange(todayStr);
    return {
      query: {
        $or: [
          { weekStartDateString: { $gte: range.startDateString, $lte: range.endDateString } },
          { weekStartDate: { $gte: new Date(`${range.startDateString}T00:00:00Z`), $lte: new Date(`${range.endDateString}T23:59:59Z`) } }
        ]
      },
      label: range.weekLabel
    };
  }

  if (filter === 'LAST_WEEK') {
    const pastDate = new Date(Date.UTC(tY, tM - 1, tD - 7, 12, 0, 0));
    const range = getWeekRange(pastDate.toISOString().slice(0, 10));
    return {
      query: {
        $or: [
          { weekStartDateString: { $gte: range.startDateString, $lte: range.endDateString } },
          { weekStartDate: { $gte: new Date(`${range.startDateString}T00:00:00Z`), $lte: new Date(`${range.endDateString}T23:59:59Z`) } }
        ]
      },
      label: range.weekLabel
    };
  }

  if (filter === 'THIS_MONTH') {
    const startStr = `${tY}-${String(tM).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(tY, tM, 0, 12, 0, 0)).toISOString().slice(0, 10);
    return {
      query: {
        $or: [
          { weekStartDateString: { $gte: startStr, $lte: lastDay } },
          { weekStartDate: { $gte: new Date(`${startStr}T00:00:00Z`), $lte: new Date(`${lastDay}T23:59:59Z`) } }
        ]
      },
      label: `This Month (${startStr.slice(0, 7)})`
    };
  }

  if (filter === 'LAST_MONTH') {
    const lastMonthDate = new Date(Date.UTC(tY, tM - 2, 1, 12, 0, 0));
    const lmY = lastMonthDate.getUTCFullYear();
    const lmM = lastMonthDate.getUTCMonth() + 1;
    const startStr = `${lmY}-${String(lmM).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(lmY, lmM, 0, 12, 0, 0)).toISOString().slice(0, 10);
    return {
      query: {
        $or: [
          { weekStartDateString: { $gte: startStr, $lte: lastDay } },
          { weekStartDate: { $gte: new Date(`${startStr}T00:00:00Z`), $lte: new Date(`${lastDay}T23:59:59Z`) } }
        ]
      },
      label: `Last Month (${startStr.slice(0, 7)})`
    };
  }

  if (filter === 'THIS_YEAR') {
    const startStr = `${tY}-01-01`;
    const endStr = `${tY}-12-31`;
    return {
      query: {
        $or: [
          { weekStartDateString: { $gte: startStr, $lte: endStr } },
          { weekStartDate: { $gte: new Date(`${startStr}T00:00:00Z`), $lte: new Date(`${endStr}T23:59:59Z`) } }
        ]
      },
      label: `Year ${tY}`
    };
  }

  if (filter === 'CUSTOM' && startDate && endDate) {
    const sStr = startDate.slice(0, 10);
    const eStr = endDate.slice(0, 10);
    return {
      query: {
        $or: [
          { weekStartDateString: { $gte: sStr, $lte: eStr } },
          { weekStartDate: { $gte: new Date(`${sStr}T00:00:00Z`), $lte: new Date(`${eStr}T23:59:59Z`) } }
        ]
      },
      label: `${sStr} to ${eStr}`
    };
  }

  return { query: {}, label: 'All Finalized Records' };
}

/**
 * GET /api/worker/salaries
 * Finalized weekly salary records & summary dashboard metrics
 */
exports.getSalaries = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const { filter = 'ALL', startDate, endDate } = req.query;

    const todayStr = getUKDateString();
    const [tY, tM] = todayStr.split('-').map(Number);
    const curMonthStart = new Date(Date.UTC(tY, tM - 1, 1, 0, 0, 0));
    const curMonthEnd = new Date(Date.UTC(tY, tM, 0, 23, 59, 59));

    // 1. Fetch ALL finalized salaries for all-time summary calculation
    const allFinalizedSalaries = await WeeklySalary.find({
      employee: employeeId,
      status: { $in: FINALIZED_STATUSES }
    }).sort({ weekStartDate: -1 }).lean();

    // 2. Fetch payments for this employee to compute total payments and last payment date
    const allPayments = await SalaryPayment.find({
      employee: employeeId
    }).sort({ paymentDate: -1 }).lean();

    // Compute Metrics:
    // Latest finalized salary
    const latestSalary = allFinalizedSalaries[0] || null;

    // Month earnings (salaries finalized in this month)
    const monthSalaries = allFinalizedSalaries.filter(s => {
      const dt = s.weekStartDate ? new Date(s.weekStartDate) : null;
      return dt && dt >= curMonthStart && dt <= curMonthEnd;
    });
    const totalEarningsMonth = Number(monthSalaries.reduce((acc, s) => acc + (s.finalSalary || 0), 0).toFixed(2));

    // Month payments received
    const monthPayments = allPayments.filter(p => {
      const dt = p.paymentDate ? new Date(p.paymentDate) : null;
      return dt && dt >= curMonthStart && dt <= curMonthEnd;
    });
    const totalReceivedMonth = Number(monthPayments.reduce((acc, p) => acc + (p.amount || 0), 0).toFixed(2));

    // Total outstanding balance across all finalized records
    const outstandingBalance = Number(allFinalizedSalaries.reduce((acc, s) => acc + (s.balanceRemaining || 0), 0).toFixed(2));

    // Total lifetime earned & paid
    const totalLifetimeEarned = Number(allFinalizedSalaries.reduce((acc, s) => acc + (s.finalSalary || 0), 0).toFixed(2));
    const totalLifetimePaid = Number(allPayments.reduce((acc, p) => acc + (p.amount || 0), 0).toFixed(2));

    const lastPayment = allPayments[0] || null;

    // 3. Apply Date Filter to the returned records list
    const { query: dateQuery, label: filterLabel } = getDateFilterQuery(filter, startDate, endDate);

    const listQuery = {
      employee: employeeId,
      status: { $in: FINALIZED_STATUSES },
      ...dateQuery
    };

    const filteredSalaries = await WeeklySalary.find(listQuery)
      .sort({ weekStartDate: -1 })
      .lean();

    const sanitizedRecords = filteredSalaries.map(s => {
      const normStatus = normalizeStatus(s.status);
      return {
        id: s._id,
        weekLabel: s.weekLabel,
        weekStartDate: s.weekStartDate,
        weekEndDate: s.weekEndDate,
        weekStartDateString: s.weekStartDateString || (s.weekStartDate ? s.weekStartDate.toISOString().slice(0, 10) : ''),
        weekEndDateString: s.weekEndDateString || (s.weekEndDate ? s.weekEndDate.toISOString().slice(0, 10) : ''),
        shopName: s.shopName,
        shopsWorked: s.shopsWorked || [s.shopName],
        workingDays: s.workingDays || 0,
        scheduledHours: s.scheduledHours || 0,
        actualHours: s.actualHours || 0,
        grossDailyWages: s.grossDailyWages || 0,
        lateDeductions: s.lateDeductions || 0,
        manualDeductions: s.manualDeductions || 0,
        travelAllowance: s.travelAllowance || 0,
        otherAllowances: s.otherAllowances || 0,
        loanDeduction: s.loanDeduction || 0,
        bonus: s.bonus || 0,
        finalSalary: s.finalSalary || 0,
        totalPaid: s.totalPaid || 0,
        balanceRemaining: s.balanceRemaining || 0,
        status: normStatus,
        finalizedAt: s.finalizedAt || s.updatedAt
      };
    });

    return res.json({
      success: true,
      filterLabel,
      summary: {
        latestFinalizedSalary: latestSalary ? {
          id: latestSalary._id,
          weekLabel: latestSalary.weekLabel,
          finalSalary: latestSalary.finalSalary,
          totalPaid: latestSalary.totalPaid,
          balanceRemaining: latestSalary.balanceRemaining,
          status: normalizeStatus(latestSalary.status)
        } : null,
        totalEarningsMonth,
        totalReceivedMonth,
        outstandingBalance,
        totalLifetimeEarned,
        totalLifetimePaid,
        finalizedWeeksCount: allFinalizedSalaries.length,
        lastPaymentDate: lastPayment ? lastPayment.paymentDate : null,
        lastPaymentAmount: lastPayment ? lastPayment.amount : null,
        lastPaymentMethod: lastPayment ? lastPayment.paymentMethod : null
      },
      records: sanitizedRecords
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving worker salary history.');
  }
};

/**
 * GET /api/worker/salaries/:id
 * Itemized payslip breakdown for a specific finalized salary record
 */
exports.getSalaryDetails = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const { id } = req.params;

    const salary = await WeeklySalary.findOne({
      _id: id,
      employee: employeeId,
      status: { $in: FINALIZED_STATUSES }
    }).populate('employee', 'name employeeId phone').populate('shop', 'name code address').lean();

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Finalized payslip record not found or access denied.'
      });
    }

    // Fetch payments applied against this specific weekly salary
    const payments = await SalaryPayment.find({
      weeklySalary: salary._id,
      employee: employeeId
    }).sort({ paymentDate: 1 }).lean();

    const sanitizedPayments = payments.map(p => ({
      id: p._id,
      paymentDate: p.paymentDate,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      clientReference: p.clientReference || `REC-${String(p._id).slice(-6).toUpperCase()}`
    }));

    const grossEarnings = Number((
      (salary.grossDailyWages || 0) +
      (salary.travelAllowance || 0) +
      (salary.otherAllowances || 0) +
      (salary.bonus || 0)
    ).toFixed(2));

    const totalDeductions = Number((
      (salary.lateDeductions || 0) +
      (salary.manualDeductions || 0) +
      (salary.loanDeduction || 0)
    ).toFixed(2));

    return res.json({
      success: true,
      payslip: {
        id: salary._id,
        employeeName: salary.employeeName || salary.employee?.name,
        employeeId: salary.employeeId || salary.employee?.employeeId,
        shopName: salary.shopName || salary.shop?.name,
        shopsWorked: salary.shopsWorked || [salary.shopName],
        weekLabel: salary.weekLabel,
        weekStartDate: salary.weekStartDate,
        weekEndDate: salary.weekEndDate,
        workingDays: salary.workingDays || 0,
        scheduledHours: salary.scheduledHours || 0,
        actualHours: salary.actualHours || 0,
        earnings: {
          grossDailyWages: salary.grossDailyWages || 0,
          travelAllowance: salary.travelAllowance || 0,
          otherAllowances: salary.otherAllowances || 0,
          bonus: salary.bonus || 0,
          grossTotal: grossEarnings
        },
        deductions: {
          lateDeductions: salary.lateDeductions || 0,
          manualDeductions: salary.manualDeductions || 0,
          loanDeduction: salary.loanDeduction || 0,
          totalDeductions
        },
        finalSalary: salary.finalSalary || 0,
        totalPaid: salary.totalPaid || 0,
        balanceRemaining: salary.balanceRemaining || 0,
        status: normalizeStatus(salary.status),
        finalizedAt: salary.finalizedAt || salary.updatedAt,
        attendanceBreakdown: (salary.attendanceBreakdown || []).map(b => ({
          dateString: b.dateString,
          dayOfWeek: b.dayOfWeek,
          shopName: b.shopName,
          shiftStart: b.shiftStart,
          shiftEnd: b.shiftEnd,
          timeReached: b.timeReached,
          workerEndTime: b.workerEndTime,
          hours: b.actualHours || b.scheduledHours || 0,
          status: b.status
        })),
        payments: sanitizedPayments
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving payslip details.');
  }
};

/**
 * GET /api/worker/salaries/:id/payslip-pdf
 * Printable and downloadable PDF payslip strictly owned by the authenticated worker
 */
exports.downloadPayslipPDF = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const { id } = req.params;

    const salary = await WeeklySalary.findOne({
      _id: id,
      employee: employeeId,
      status: { $in: FINALIZED_STATUSES }
    }).populate('employee', 'name employeeId phone').populate('shop', 'name code address phone').lean();

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Finalized payslip not found or access denied.'
      });
    }

    const payments = await SalaryPayment.find({
      weeklySalary: salary._id,
      employee: employeeId
    }).sort({ paymentDate: 1 }).lean();

    const empName = salary.employeeName || salary.employee?.name || 'Worker';
    const empCode = salary.employeeId || salary.employee?.employeeId || 'PIXX';
    const safeWeek = (salary.weekLabel || 'week').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Payslip_${empCode}_${safeWeek}.pdf`;

    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      autoFirstPage: true
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const result = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Content-Length', result.length);
      return res.send(result);
    });

    // ── PDF CONTENT GENERATION ─────────────────────────────────────────
    const primaryColor = '#0284c7'; // Brand Blue
    const darkColor = '#0f172a';
    const slateColor = '#475569';
    const lightBorder = '#cbd5e1';
    const successColor = '#16a34a';

    // Header Branding
    doc.fontSize(18).fillColor(darkColor).font('Helvetica-Bold').text('PIXX TECHNOLOGIES', 36, 36);
    doc.fontSize(9).fillColor(slateColor).font('Helvetica').text('Rota System & Workforce Payroll', 36, 58);

    doc.fontSize(14).fillColor(primaryColor).font('Helvetica-Bold').text('OFFICIAL PAYSLIP', 400, 36, { align: 'right' });
    doc.fontSize(9).fillColor(slateColor).font('Helvetica').text(`Generated: ${formatUKDate(new Date())}`, 400, 54, { align: 'right' });

    // Divider Line
    doc.strokeColor(primaryColor).lineWidth(2).moveTo(36, 75).lineTo(559, 75).stroke();

    // Employee & Week Box
    doc.rect(36, 86, 523, 62).fillAndStroke('#f8fafc', lightBorder);

    doc.fillColor(slateColor).fontSize(8).font('Helvetica-Bold').text('EMPLOYEE NAME', 48, 96);
    doc.fillColor(darkColor).fontSize(11).font('Helvetica-Bold').text(empName, 48, 107);

    doc.fillColor(slateColor).fontSize(8).font('Helvetica-Bold').text('EMPLOYEE ID', 220, 96);
    doc.fillColor(darkColor).fontSize(10).font('Helvetica').text(empCode, 220, 107);

    doc.fillColor(slateColor).fontSize(8).font('Helvetica-Bold').text('PRIMARY SHOP', 320, 96);
    doc.fillColor(darkColor).fontSize(10).font('Helvetica').text(salary.shopName || 'Branch', 320, 107);

    doc.fillColor(slateColor).fontSize(8).font('Helvetica-Bold').text('SALARY PERIOD', 430, 96);
    doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text(salary.weekLabel || 'Weekly', 430, 107);

    // Working Hours Summary
    doc.fillColor(slateColor).fontSize(9).font('Helvetica').text(
      `Working Days: ${salary.workingDays || 0} days   |   Actual Hours: ${salary.actualHours || 0} hrs   |   Shops: ${(salary.shopsWorked || [salary.shopName]).join(', ')}`,
      48, 130
    );

    // Earnings & Deductions Tables (Two Columns)
    let y = 162;

    // Left Column Header: EARNINGS
    doc.rect(36, y, 255, 20).fill('#e0f2fe');
    doc.fillColor('#0369a1').fontSize(9).font('Helvetica-Bold').text('EARNINGS BREAKDOWN', 44, y + 5);
    doc.text('AMOUNT', 220, y + 5, { width: 60, align: 'right' });

    // Right Column Header: DEDUCTIONS
    doc.rect(304, y, 255, 20).fill('#fee2e2');
    doc.fillColor('#991b1b').fontSize(9).font('Helvetica-Bold').text('DEDUCTIONS & ADJUSTMENTS', 312, y + 5);
    doc.text('AMOUNT', 488, y + 5, { width: 60, align: 'right' });

    y += 24;

    // Rows
    const earningsRows = [
      ['Gross Daily Wages', `£${(salary.grossDailyWages || 0).toFixed(2)}`],
      ['Travel Allowance', `£${(salary.travelAllowance || 0).toFixed(2)}`],
      ['Other Allowances', `£${(salary.otherAllowances || 0).toFixed(2)}`],
      ['Sales / Bonus Credit', `£${(salary.bonus || 0).toFixed(2)}`]
    ];

    const deductionRows = [
      ['Late Arrival Deductions', `£${(salary.lateDeductions || 0).toFixed(2)}`],
      ['Authorized Adjustments', `£${(salary.manualDeductions || 0).toFixed(2)}`],
      ['Loan / Advance Repayment', `£${(salary.loanDeduction || 0).toFixed(2)}`]
    ];

    const maxRows = Math.max(earningsRows.length, deductionRows.length);
    for (let i = 0; i < maxRows; i++) {
      const eRow = earningsRows[i];
      const dRow = deductionRows[i];

      if (eRow) {
        doc.fillColor(darkColor).fontSize(9).font('Helvetica').text(eRow[0], 44, y);
        doc.text(eRow[1], 220, y, { width: 60, align: 'right' });
      }

      if (dRow) {
        doc.fillColor(darkColor).fontSize(9).font('Helvetica').text(dRow[0], 312, y);
        doc.text(dRow[1], 488, y, { width: 60, align: 'right' });
      }

      y += 18;
    }

    // Totals Line
    const grossTotal = ((salary.grossDailyWages || 0) + (salary.travelAllowance || 0) + (salary.otherAllowances || 0) + (salary.bonus || 0)).toFixed(2);
    const deductionsTotal = ((salary.lateDeductions || 0) + (salary.manualDeductions || 0) + (salary.loanDeduction || 0)).toFixed(2);

    doc.rect(36, y + 4, 255, 20).fill('#f1f5f9');
    doc.fillColor(darkColor).fontSize(9).font('Helvetica-Bold').text('TOTAL GROSS', 44, y + 9);
    doc.text(`£${grossTotal}`, 220, y + 9, { width: 60, align: 'right' });

    doc.rect(304, y + 4, 255, 20).fill('#f1f5f9');
    doc.fillColor(darkColor).fontSize(9).font('Helvetica-Bold').text('TOTAL DEDUCTIONS', 312, y + 9);
    doc.text(`£${deductionsTotal}`, 488, y + 9, { width: 60, align: 'right' });

    y += 38;

    // Net Salary Box (Prominent)
    doc.rect(36, y, 523, 44).fillAndStroke('#ecfdf5', '#a7f3d0');
    doc.fillColor(darkColor).fontSize(12).font('Helvetica-Bold').text('NET FINALIZED SALARY:', 48, y + 14);
    doc.fillColor(successColor).fontSize(18).font('Helvetica-Bold').text(`£${(salary.finalSalary || 0).toFixed(2)}`, 380, y + 11, { width: 165, align: 'right' });

    y += 56;

    // Payment & Settlement History
    doc.fontSize(11).fillColor(darkColor).font('Helvetica-Bold').text('PAYMENT SETTLEMENT HISTORY', 36, y);
    y += 16;

    doc.rect(36, y, 523, 18).fill('#f8fafc');
    doc.fillColor(slateColor).fontSize(8).font('Helvetica-Bold').text('DATE', 44, y + 4);
    doc.text('METHOD', 140, y + 4);
    doc.text('REFERENCE', 260, y + 4);
    doc.text('AMOUNT PAID', 460, y + 4, { width: 85, align: 'right' });
    y += 20;

    if (payments.length > 0) {
      payments.forEach(p => {
        doc.fillColor(darkColor).fontSize(9).font('Helvetica').text(formatUKDate(p.paymentDate), 44, y);
        doc.text(p.paymentMethod || 'Cash', 140, y);
        doc.text(p.clientReference || `REC-${String(p._id).slice(-6).toUpperCase()}`, 260, y);
        doc.text(`£${(p.amount || 0).toFixed(2)}`, 460, y, { width: 85, align: 'right' });
        y += 16;
      });
    } else {
      doc.fillColor(slateColor).fontSize(9).font('Helvetica-Oblique').text('No payment installments disbursed yet.', 44, y);
      y += 16;
    }

    // Remaining Balance Card
    y += 8;
    doc.rect(36, y, 523, 30).fill('#f8fafc');
    doc.fillColor(slateColor).fontSize(9).font('Helvetica-Bold').text(`TOTAL PAID TO DATE:  £${(salary.totalPaid || 0).toFixed(2)}`, 48, y + 9);
    doc.fillColor(salary.balanceRemaining > 0 ? '#b45309' : '#15803d').fontSize(10).font('Helvetica-Bold').text(
      `OUTSTANDING BALANCE: £${(salary.balanceRemaining || 0).toFixed(2)}`,
      340, y + 9, { width: 205, align: 'right' }
    );

    // Footer
    doc.fontSize(8).fillColor(slateColor).font('Helvetica').text(
      'This is an authorized computer-generated payslip issued by Pixx Technologies. No signature required.',
      36, 760, { align: 'center', width: 523 }
    );

    doc.end();
  } catch (error) {
    return sendServerError(res, error, 'Error generating payslip PDF.');
  }
};

/**
 * GET /api/worker/ledger
 * Personal salary ledger tracking chronological earnings, payments and running balance
 */
exports.getLedger = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const { filter = 'ALL', startDate, endDate } = req.query;

    // Fetch existing ledger transactions from LedgerTransaction collection
    const dbTransactions = await LedgerTransaction.find({
      employee: employeeId
    }).sort({ date: 1, _id: 1 }).lean();

    let combinedList = [];

    if (dbTransactions.length > 0) {
      combinedList = dbTransactions.map(tx => ({
        id: tx._id,
        date: tx.date,
        type: tx.transactionType,
        description: tx.description,
        amountEarned: Number(tx.amountEarned || 0),
        amountPaid: Number(tx.amountPaid || 0),
        runningBalance: Number(tx.runningBalance || 0),
        referenceType: tx.referenceType,
        referenceId: tx.referenceId
      }));
    } else {
      // Synthesize ledger timeline from WeeklySalary (FINALIZED/PAID) and SalaryPayment
      const salaries = await WeeklySalary.find({
        employee: employeeId,
        status: { $in: FINALIZED_STATUSES }
      }).lean();

      const payments = await SalaryPayment.find({
        employee: employeeId
      }).lean();

      const events = [];

      salaries.forEach(s => {
        events.push({
          date: s.finalizedAt || s.weekEndDate || s.createdAt,
          type: 'SALARY_EARNED',
          description: `Salary Finalized for ${s.weekLabel}`,
          amountEarned: Number(s.finalSalary || 0),
          amountPaid: 0,
          referenceType: 'WeeklySalary',
          referenceId: s._id
        });
      });

      payments.forEach(p => {
        events.push({
          date: p.paymentDate || p.createdAt,
          type: 'SALARY_PAYMENT',
          description: `Payment Received (${p.paymentMethod || 'Cash'}) - ${p.weekLabel || 'Salary'}`,
          amountEarned: 0,
          amountPaid: Number(p.amount || 0),
          referenceType: 'SalaryPayment',
          referenceId: p._id
        });
      });

      // Sort chronologically
      events.sort((a, b) => new Date(a.date) - new Date(b.date));

      let running = 0;
      combinedList = events.map((ev, idx) => {
        running += (ev.amountEarned - ev.amountPaid);
        return {
          id: `syn-${idx}`,
          ...ev,
          runningBalance: Number(running.toFixed(2))
        };
      });
    }

    // Compute all-time totals
    const totalEarned = Number(combinedList.reduce((acc, t) => acc + (t.amountEarned || 0), 0).toFixed(2));
    const totalPaid = Number(combinedList.reduce((acc, t) => acc + (t.amountPaid || 0), 0).toFixed(2));
    const outstandingBalance = Number((totalEarned - totalPaid).toFixed(2));

    // Reverse for UI display (newest transaction on top)
    const displayList = [...combinedList].reverse();

    return res.json({
      success: true,
      summary: {
        totalEarned,
        totalPaid,
        outstandingBalance,
        transactionCount: combinedList.length
      },
      transactions: displayList
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving worker salary ledger.');
  }
};

/**
 * GET /api/worker/payments
 * History of payment receipts with internal notes stripped
 */
exports.getPayments = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const payments = await SalaryPayment.find({
      employee: employeeId
    }).sort({ paymentDate: -1 }).populate('weeklySalary', 'weekLabel status').lean();

    const sanitized = payments.map(p => ({
      id: p._id,
      paymentDate: p.paymentDate,
      amount: p.amount,
      paymentMethod: p.paymentMethod || 'Cash',
      weekLabel: p.weekLabel || p.weeklySalary?.weekLabel || 'Weekly Salary',
      receiptNumber: p.clientReference || `REC-${String(p._id).slice(-8).toUpperCase()}`,
      status: 'PAID'
    }));

    const totalPaid = Number(sanitized.reduce((acc, p) => acc + (p.amount || 0), 0).toFixed(2));

    return res.json({
      success: true,
      totalPaid,
      paymentsCount: sanitized.length,
      payments: sanitized
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving payment history.');
  }
};
