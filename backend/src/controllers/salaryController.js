const mongoose = require('mongoose');
const WeeklySalary = require('../models/WeeklySalary');
const { sendServerError } = require('../utils/httpErrors');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const SalaryAdjustment = require('../models/SalaryAdjustment');
const SalaryPayment = require('../models/SalaryPayment');
const Bonus = require('../models/Bonus');
const LedgerTransaction = require('../models/LedgerTransaction');
const { getWeekRange, formatUKDate, calculateWeeklySalaryComponents } = require('../utils/calc');
const { logAction } = require('../utils/audit');
const { validatePaymentAmount, calculatePaymentState } = require('../utils/payment');

/**
 * Recompute a single WeeklySalary document's numbers and sync with adjustments and bonus
 */
async function recalculateWeeklySalary(salaryDoc) {
  if (['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'].includes(salaryDoc.status)) {
    throw new Error('Finalized salary calculations are locked.');
  }
  // Sum adjustments
  const adjustments = await SalaryAdjustment.find({ weeklySalary: salaryDoc._id });
  // Check bonuses assigned to this weekly salary
  const bonuses = await Bonus.find({ assignedWeeklySalary: salaryDoc._id, status: { $ne: 'DRAFT' } });
  salaryDoc.bonus = Number(bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0).toFixed(2));

  const calc = calculateWeeklySalaryComponents({
    netAttendancePay: salaryDoc.netAttendancePay,
    adjustments,
    bonus: salaryDoc.bonus,
  });
  salaryDoc.travelAllowance = calc.travelAllowance;
  salaryDoc.otherAllowances = calc.otherAllowances;
  salaryDoc.manualDeductions = calc.otherDeductions;
  salaryDoc.finalSalary = calc.finalSalary;

  // Compute payments (if any from Phase 7)
  const payments = await SalaryPayment.find({ weeklySalary: salaryDoc._id });
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  salaryDoc.totalPaid = Number(totalPaid.toFixed(2));
  salaryDoc.balanceRemaining = Number(Math.max(0, salaryDoc.finalSalary - salaryDoc.totalPaid).toFixed(2));

  if (['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salaryDoc.status)) {
    if (salaryDoc.balanceRemaining <= 0 && salaryDoc.totalPaid > 0) {
      salaryDoc.status = 'PAID';
    } else if (salaryDoc.totalPaid > 0) {
      salaryDoc.status = 'PARTIALLY_PAID';
    } else {
      salaryDoc.status = 'FINALIZED';
    }
  }

  await salaryDoc.save();
  return salaryDoc;
}

/**
 * Get week period info & pending attendance status
 */
exports.getWeekInfo = async (req, res) => {
  try {
    const { date, shopId } = req.query;
    const week = getWeekRange(date || new Date());

    const attendanceQuery = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ]
    };
    if (shopId) attendanceQuery.shop = shopId;

    const attendances = await Attendance.find(attendanceQuery).sort({ dateString: 1 });

    const checkedRecords = attendances.filter(a => ['Checked', 'Finalized'].includes(a.approvalStatus));
    const pendingRecords = attendances.filter(a => !['Checked', 'Finalized'].includes(a.approvalStatus));

    // Check existing salaries for this week
    const existingSalaries = await WeeklySalary.find({
      $or: [
        { weekLabel: week.weekLabel },
        { weekLabel: week.legacyWeekLabel }
      ]
    });

    const pendingEmployees = Array.from(new Set(pendingRecords.map(p => p.employeeName)));

    res.json({
      success: true,
      week,
      checkedCount: checkedRecords.length,
      pendingCount: pendingRecords.length,
      pendingEmployees,
      warning: pendingRecords.length > 0
        ? `${pendingRecords.length} attendance record(s) are still pending review and will not be included until approved by Sarfraz.`
        : null,
      generatedSalaryCount: existingSalaries.length
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve week info.');
  }
};

/**
 * Generate weekly salaries from CHECKED attendance for a given week
 */
exports.generateWeeklySalary = async (req, res) => {
  try {
    const { date, shopId, isRegenerate } = req.body;
    const week = getWeekRange(date || new Date());

    // 1. Query checked attendance for this week
    const attendanceQuery = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ],
      approvalStatus: { $in: ['Checked', 'Finalized'] }
    };
    if (shopId) attendanceQuery.shop = shopId;

    const attendances = await Attendance.find(attendanceQuery);

    // 2. Query pending attendance for warning count
    const pendingQuery = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ],
      approvalStatus: { $nin: ['Checked', 'Finalized'] }
    };
    if (shopId) pendingQuery.shop = shopId;
    const pendingCount = await Attendance.countDocuments(pendingQuery);

    if (attendances.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No approved/checked attendance records found for week ${week.weekLabel}.${pendingCount > 0 ? ` Note: ${pendingCount} record(s) are still pending review by Sarfraz.` : ''}`,
        pendingCount
      });
    }

    // 3. Group by employee
    const employeeMap = {};
    for (const att of attendances) {
      const empId = att.employee.toString();
      if (!employeeMap[empId]) {
        employeeMap[empId] = {
          employee: att.employee,
          employeeName: att.employeeName,
          employeeId: att.employeeId,
          shop: att.shop,
          shopName: att.shopName,
          records: []
        };
      }
      employeeMap[empId].records.push(att);
    }

    const generatedSalaries = [];
    const skippedFinalized = [];
    const { getDayOfWeekUK } = require('../utils/calc');

    for (const empId of Object.keys(employeeMap)) {
      const group = employeeMap[empId];
      // Sort records chronologically
      const records = group.records.sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));

      // Check working days (exclude Absent, preserve Half and Present/Late)
      const workingDays = records.filter(r => r.status !== 'Absent').length;
      const scheduledHours = Number(records.reduce((sum, r) => sum + (r.scheduledHours || 0), 0).toFixed(2));
      const actualHours = Number(records.reduce((sum, r) => sum + (r.actualHours || 0), 0).toFixed(2));
      const grossDailyWages = Number(records.reduce((sum, r) => sum + (r.dailyWage || 0), 0).toFixed(2));
      const lateDeductions = Number(records.reduce((sum, r) => sum + (r.lateDeduction || 0), 0).toFixed(2));
      const netAttendancePay = Number(records.reduce((sum, r) => sum + (r.attendancePay || 0), 0).toFixed(2));

      // Shops worked during the week
      const shopsWorked = Array.from(new Set(records.map(r => r.shopName).filter(Boolean)));
      const primaryShop = records[records.length - 1].shop || group.shop;
      const primaryShopName = shopsWorked.length === 1 ? shopsWorked[0] : shopsWorked.join(' / ');

      // Build day-by-day attendance breakdown
      const breakdown = records.map(r => ({
        attendanceId: r._id,
        dateString: r.dateString,
        dayOfWeek: getDayOfWeekUK(r.dateString),
        shopName: r.shopName,
        shiftStart: r.shiftStart,
        shiftEnd: r.shiftEnd,
        timeReached: r.timeReached,
        workerEndTime: r.workerEndTime,
        scheduledHours: r.scheduledHours,
        actualHours: r.actualHours,
        status: r.status,
        dailyWage: r.dailyWage,
        lateMinutes: r.lateMinutes,
        lateDeduction: r.lateDeduction,
        attendancePay: r.attendancePay,
        remarks: r.remarks || ''
      }));

      let salaryDoc = await WeeklySalary.findOne({
        employee: group.employee,
        $or: [
          { weekLabel: week.weekLabel },
          { weekLabel: week.legacyWeekLabel }
        ]
      });

      if (salaryDoc && ['FINALIZED', 'PAID', 'Finalized', 'Paid'].includes(salaryDoc.status)) {
        skippedFinalized.push(group.employeeName);
        generatedSalaries.push(salaryDoc);
        continue;
      }

      if (!salaryDoc) {
        salaryDoc = new WeeklySalary({
          employee: group.employee,
          employeeName: group.employeeName,
          employeeId: group.employeeId,
          shop: primaryShop,
          shopName: primaryShopName,
          shopsWorked,
          weekStartDate: week.startDate,
          weekEndDate: week.endDate,
          weekStartDateString: week.startDateString,
          weekEndDateString: week.endDateString,
          weekLabel: week.weekLabel,
          status: 'Generated',
          createdBy: req.user._id,
          createdByName: req.user.name
        });
      }

      salaryDoc.workingDays = workingDays;
      salaryDoc.scheduledHours = scheduledHours;
      salaryDoc.actualHours = actualHours;
      salaryDoc.grossDailyWages = grossDailyWages;
      salaryDoc.lateDeductions = lateDeductions;
      salaryDoc.netAttendancePay = netAttendancePay;
      salaryDoc.finalSalary = netAttendancePay;
      salaryDoc.shop = primaryShop;
      salaryDoc.shopName = primaryShopName;
      salaryDoc.shopsWorked = shopsWorked;
      salaryDoc.weekStartDateString = week.startDateString;
      salaryDoc.weekEndDateString = week.endDateString;
      salaryDoc.attendanceBreakdown = breakdown;

      await salaryDoc.save();
      await recalculateWeeklySalary(salaryDoc);

      // Link attendance records to weeklySalary
      await Attendance.updateMany(
        { _id: { $in: records.map(r => r._id) } },
        { $set: { weeklySalary: salaryDoc._id } }
      );

      generatedSalaries.push(salaryDoc);
    }

    const action = isRegenerate ? 'WEEKLY_SALARY_REGENERATED' : 'WEEKLY_SALARY_GENERATED';
    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action,
      recordType: 'WeeklySalary',
      details: `${isRegenerate ? 'Regenerated' : 'Generated'} weekly salary for week ${week.weekLabel} (${generatedSalaries.length} employees)${pendingCount > 0 ? ` [${pendingCount} pending attendance records excluded]` : ''}`,
      req
    });

    res.json({
      success: true,
      message: `Weekly salary calculated successfully for week ${week.weekLabel}.`,
      week,
      count: generatedSalaries.length,
      salaries: generatedSalaries,
      pendingAttendanceCount: pendingCount,
      pendingWarning: pendingCount > 0
        ? `${pendingCount} attendance record(s) are still pending review and were excluded.`
        : null,
      skippedFinalizedCount: skippedFinalized.length
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to generate weekly salary.');
  }
};

/**
 * Regenerate weekly salary (safe recalculation of non-finalized records)
 */
exports.regenerateWeeklySalary = async (req, res) => {
  req.body.isRegenerate = true;
  return exports.generateWeeklySalary(req, res);
};

/**
 * Get weekly salaries with filters and aggregate totals
 */
exports.getWeeklySalaries = async (req, res) => {
  try {
    const { date, weekLabel, shopId, status, employeeId, search } = req.query;
    const query = {};

    let resolvedWeek = null;
    if (weekLabel) {
      const altLabel = weekLabel.includes(' – ') ? weekLabel.replace(' – ', ' to ') : weekLabel.replace(' to ', ' – ');
      query.weekLabel = { $in: [weekLabel, altLabel] };
    } else if (date) {
      resolvedWeek = getWeekRange(date);
      query.$or = [
        { weekLabel: resolvedWeek.weekLabel },
        { weekLabel: resolvedWeek.legacyWeekLabel },
        { weekStartDateString: resolvedWeek.startDateString }
      ];
    }

    if (shopId) query.shop = shopId;
    if (req.user && req.user.role === 'SALARY_DISTRIBUTOR') {
      query.status = { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] };
    } else if (status && status !== 'All') {
      query.status = status;
    }
    if (employeeId) query.employee = employeeId;
    if (search) {
      query.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const salaries = await WeeklySalary.find(query)
      .populate('employee')
      .populate('shop')
      .sort({ weekStartDate: -1, shopName: 1, employeeName: 1 });

    // Aggregate totals for the week
    const totals = {
      totalEmployees: salaries.length,
      totalWorkingDays: salaries.reduce((sum, s) => sum + (s.workingDays || 0), 0),
      totalScheduledHours: Number(salaries.reduce((sum, s) => sum + (s.scheduledHours || 0), 0).toFixed(2)),
      totalActualHours: Number(salaries.reduce((sum, s) => sum + (s.actualHours || 0), 0).toFixed(2)),
      grossAttendanceWages: Number(salaries.reduce((sum, s) => sum + (s.grossDailyWages || 0), 0).toFixed(2)),
      totalLateDeductions: Number(salaries.reduce((sum, s) => sum + (s.lateDeductions || 0), 0).toFixed(2)),
      totalAttendancePay: Number(salaries.reduce((sum, s) => sum + (s.netAttendancePay || 0), 0).toFixed(2))
    };

    res.json({
      success: true,
      count: salaries.length,
      week: resolvedWeek,
      totals,
      salaries
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch weekly salaries.');
  }
};

/**
 * Get single weekly salary with adjustments and payments
 */
exports.getWeeklySalaryById = async (req, res) => {
  try {
    const { id } = req.params;
    const salary = await WeeklySalary.findById(id).populate('employee').populate('shop');
    if (!salary) return res.status(404).json({ success: false, message: 'Salary record not found.' });

    if (req.user && req.user.role === 'SALARY_DISTRIBUTOR') {
      if (!['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'].includes(salary.status)) {
        return res.status(403).json({ success: false, message: 'Salary Distributor can only view finalized salaries.' });
      }
    }

    const adjustments = await SalaryAdjustment.find({ weeklySalary: id }).populate('addedBy', 'name');
    const payments = await SalaryPayment.find({ weeklySalary: id }).populate('paidBy', 'name');
    const attendances = await Attendance.find({ weeklySalary: id }).sort({ date: 1 });
    const bonuses = await Bonus.find({ assignedWeeklySalary: id });

    res.json({
      success: true,
      salary,
      adjustments,
      payments,
      attendances,
      bonuses
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch salary details.');
  }
};

/**
 * Admin adds an adjustment (travel, other allowance, or other deduction)
 */
exports.addAdjustment = async (req, res) => {
  try {
    const { id } = req.params; // weeklySalary id
    const { type, amount, reason } = req.body;

    const salary = await WeeklySalary.findById(id);
    if (!salary) return res.status(404).json({ success: false, message: 'Weekly salary not found.' });

    if (['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salary.status)) {
      return res.status(403).json({ success: false, message: 'Cannot add adjustments to finalized salary.' });
    }

    const numAmount = Number(amount);
    if (!type || amount === undefined || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Adjustment amount must be a positive number.' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Adjustment reason is required.' });
    }

    const adjustment = await SalaryAdjustment.create({
      weeklySalary: salary._id,
      employee: salary.employee,
      type,
      amount: numAmount,
      reason: reason.trim(),
      addedBy: req.user._id,
      addedByName: req.user.name
    });

    await recalculateWeeklySalary(salary);

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SALARY_ADJUSTMENT_ADDED',
      recordType: 'SalaryAdjustment',
      recordId: adjustment._id,
      details: `Added ${type} of £${numAmount.toFixed(2)} (${reason}) to ${salary.employeeName} for week ${salary.weekLabel}`,
      req
    });

    res.status(201).json({ success: true, message: 'Adjustment added successfully.', adjustment, salary });
  } catch (error) {
    return sendServerError(res, error, 'Failed to add adjustment.');
  }
};

/**
 * Admin updates an existing adjustment
 */
exports.updateAdjustment = async (req, res) => {
  try {
    const { adjustmentId } = req.params;
    const { type, amount, reason } = req.body;

    const adjustment = await SalaryAdjustment.findById(adjustmentId);
    if (!adjustment) return res.status(404).json({ success: false, message: 'Adjustment not found.' });

    const salary = await WeeklySalary.findById(adjustment.weeklySalary);
    if (!salary) return res.status(404).json({ success: false, message: 'Weekly salary not found.' });

    if (['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salary.status)) {
      return res.status(403).json({ success: false, message: 'Cannot edit adjustments on finalized salary.' });
    }

    if (type) adjustment.type = type;
    if (amount !== undefined) {
      const numAmt = Number(amount);
      if (isNaN(numAmt) || numAmt <= 0) {
        return res.status(400).json({ success: false, message: 'Adjustment amount must be a positive number.' });
      }
      adjustment.amount = numAmt;
    }
    if (reason !== undefined) {
      if (!reason.trim()) {
        return res.status(400).json({ success: false, message: 'Adjustment reason cannot be empty.' });
      }
      adjustment.reason = reason.trim();
    }

    await adjustment.save();
    await recalculateWeeklySalary(salary);

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SALARY_ADJUSTMENT_UPDATED',
      recordType: 'SalaryAdjustment',
      recordId: adjustment._id,
      details: `Updated adjustment to ${adjustment.type} £${adjustment.amount.toFixed(2)} (${adjustment.reason}) for ${salary.employeeName}`,
      req
    });

    res.json({ success: true, message: 'Adjustment updated successfully.', adjustment, salary });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update adjustment.');
  }
};

/**
 * Admin removes an adjustment
 */
exports.removeAdjustment = async (req, res) => {
  try {
    const { adjustmentId } = req.params;
    const adjustment = await SalaryAdjustment.findById(adjustmentId);
    if (!adjustment) return res.status(404).json({ success: false, message: 'Adjustment not found.' });

    const salary = await WeeklySalary.findById(adjustment.weeklySalary);
    if (salary && ['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salary.status)) {
      return res.status(403).json({ success: false, message: 'Cannot remove adjustments from finalized salary.' });
    }

    await SalaryAdjustment.findByIdAndDelete(adjustmentId);

    if (salary) {
      await recalculateWeeklySalary(salary);
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SALARY_ADJUSTMENT_REMOVED',
      recordType: 'SalaryAdjustment',
      recordId: adjustment._id,
      details: `Removed ${adjustment.type} adjustment of £${adjustment.amount.toFixed(2)} (${adjustment.reason}) from ${salary ? salary.employeeName : 'salary'}`,
      req
    });

    res.json({ success: true, message: 'Adjustment removed successfully.', salary });
  } catch (error) {
    return sendServerError(res, error, 'Failed to remove adjustment.');
  }
};

/**
 * Admin finalizes weekly salary (Locks salary & creates Ledger entry without duplicates)
 */
exports.finalizeWeeklySalary = async (req, res) => {
  try {
    const { id } = req.params;
    const salary = await WeeklySalary.findById(id);
    if (!salary) return res.status(404).json({ success: false, message: 'Weekly salary not found.' });
    if (['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'].includes(salary.status)) {
      return res.status(409).json({ success: false, message: 'This salary has already been finalized.' });
    }

    await recalculateWeeklySalary(salary);

    salary.status = salary.totalPaid >= salary.finalSalary && salary.finalSalary > 0 ? 'PAID' : 'FINALIZED';
    salary.finalizedBy = req.user._id;
    salary.finalizedAt = new Date();
    salary.finalizationSnapshot = {
      employee: salary.employee,
      employeeName: salary.employeeName,
      employeeId: salary.employeeId,
      shop: salary.shop,
      shopName: salary.shopName,
      weekStartDate: salary.weekStartDate,
      weekEndDate: salary.weekEndDate,
      workingDays: salary.workingDays,
      scheduledHours: salary.scheduledHours,
      actualHours: salary.actualHours,
      grossDailyWages: salary.grossDailyWages,
      lateDeductions: salary.lateDeductions,
      netAttendancePay: salary.netAttendancePay,
      travelAllowance: salary.travelAllowance,
      otherAllowances: salary.otherAllowances,
      bonus: salary.bonus,
      manualDeductions: salary.manualDeductions,
      finalSalary: salary.finalSalary,
      attendanceBreakdown: salary.attendanceBreakdown,
      capturedAt: salary.finalizedAt
    };
    await salary.save();

    // Lock corresponding attendances
    await Attendance.updateMany(
      { weeklySalary: salary._id },
      { $set: { approvalStatus: 'Finalized' } }
    );

    // Create or update single ledger entry for this salary earned
    // Calculate running balance for this employee
    const prevTransactions = await LedgerTransaction.find({
      employee: salary.employee,
      $nor: [
        { transactionType: 'SALARY_EARNED', referenceId: salary._id }
      ]
    }).sort({ date: 1, createdAt: 1 });

    let currentBalance = 0;
    prevTransactions.forEach(t => {
      currentBalance += (t.amountEarned || 0) - (t.amountPaid || 0);
    });

    const netEarned = salary.finalSalary;
    const newBalance = currentBalance + netEarned;

    await LedgerTransaction.findOneAndUpdate(
      {
        employee: salary.employee,
        transactionType: 'SALARY_EARNED',
        referenceId: salary._id
      },
      {
        date: salary.weekEndDate,
        description: `Weekly Salary for week ${salary.weekLabel} (${salary.shopName})`,
        referenceType: 'WeeklySalary',
        referenceId: salary._id,
        attendancePay: salary.netAttendancePay,
        lateDeduction: salary.lateDeductions,
        allowance: (salary.travelAllowance || 0) + (salary.otherAllowances || 0),
        bonus: salary.bonus || 0,
        otherDeduction: salary.manualDeductions || 0,
        amountEarned: netEarned,
        amountPaid: 0,
        runningBalance: newBalance,
        createdBy: req.user._id
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      recordType: 'WeeklySalary',
      recordId: salary._id,
      action: 'SALARY_FINALIZED',
      details: `Finalized weekly salary £${salary.finalSalary} for ${salary.employeeName} (${salary.weekLabel})`,
      req
    });

    res.json({ success: true, message: 'Weekly salary finalized successfully.', salary });
  } catch (error) {
    return sendServerError(res, error, 'Failed to finalize salary.');
  }
};

/**
 * Salary Distributor records payment (PAID / OK)
 */
exports.recordSalaryPayment = async (req, res) => {
  let session;
  try {
    const { id } = req.params; // weeklySalary id
    const { amount, paymentMethod = 'Cash', notes = '', clientReference } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid salary record ID.' });
    }
    if (clientReference != null && (
      typeof clientReference !== 'string' ||
      !clientReference.trim() ||
      clientReference.trim().length > 160
    )) {
      return res.status(400).json({ success: false, message: 'Payment reference must be a non-empty string of at most 160 characters.' });
    }
    if (typeof notes !== 'string' || notes.length > 500) {
      return res.status(400).json({ success: false, message: 'Payment notes must be text no longer than 500 characters.' });
    }

    const methodStr = String(paymentMethod || '').trim();
    let normalizedMethod = 'Cash';
    if (/^bank$/i.test(methodStr)) normalizedMethod = 'Bank';
    else if (/^cash$/i.test(methodStr)) normalizedMethod = 'Cash';
    else {
      return res.status(400).json({ success: false, message: 'Payment method must be Cash or Bank.' });
    }

    let salary;
    let payment;
    let previousPaid = 0;
    let totalPaid = 0;
    let balanceRemaining = 0;
    let outcome;
    const clientReferenceValue = clientReference ? clientReference.trim() : null;
    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      outcome = null;
      salary = await WeeklySalary.findById(id).session(session);
      if (!salary) {
        outcome = { status: 404, message: 'Salary record not found.' };
        return;
      }

      if (!['FINALIZED', 'PARTIALLY_PAID', 'Finalized', 'Partially Paid'].includes(salary.status)) {
        outcome = { status: 400, message: 'Only finalized salaries can receive payments.' };
        return;
      }

      if (clientReferenceValue) {
        const duplicate = await SalaryPayment.findOne({ clientReference: clientReferenceValue }).session(session);
        if (duplicate) {
          outcome = {
            status: 409,
            message: 'This payment request was already processed.',
            payment: duplicate
          };
          return;
        }
      }

      const priorPayments = await SalaryPayment.find({ weeklySalary: salary._id }).session(session);
      previousPaid = Number(priorPayments.reduce((sum, record) => sum + record.amount, 0).toFixed(2));
      const outstanding = Number(Math.max(0, salary.finalSalary - previousPaid).toFixed(2));
      if (outstanding <= 0) {
        outcome = { status: 400, message: 'This salary is already fully paid.' };
        return;
      }

      const paymentValidation = validatePaymentAmount(amount, outstanding);
      if (!paymentValidation.valid) {
        outcome = { status: 400, message: paymentValidation.message };
        return;
      }
      const payAmount = paymentValidation.amount;

      const recentDuplicate = await SalaryPayment.findOne({
        weeklySalary: salary._id,
        amount: payAmount,
        paymentMethod: normalizedMethod,
        createdAt: { $gte: new Date(Date.now() - 3000) }
      }).session(session);
      if (recentDuplicate) {
        outcome = {
          status: 409,
          message: 'Duplicate payment submission detected. Please wait.',
          payment: recentDuplicate
        };
        return;
      }

      const paymentPayload = {
        weeklySalary: salary._id,
        employee: salary.employee,
        employeeName: salary.employeeName,
        shop: salary.shop,
        shopName: salary.shopName,
        weekLabel: salary.weekLabel,
        amount: payAmount,
        paymentMethod: normalizedMethod,
        paymentDate: new Date(),
        paidBy: req.user._id,
        paidByName: req.user.name,
        notes: notes.trim()
      };
      if (clientReferenceValue) {
        paymentPayload.clientReference = clientReferenceValue;
      }

      [payment] = await SalaryPayment.create([paymentPayload], { session });
      totalPaid = Number((previousPaid + payAmount).toFixed(2));
      balanceRemaining = Number(Math.max(0, salary.finalSalary - totalPaid).toFixed(2));
      salary.totalPaid = totalPaid;
      salary.balanceRemaining = balanceRemaining;
      salary.status = balanceRemaining === 0 ? 'PAID' : 'PARTIALLY_PAID';
      await salary.save({ session });

      const allTransactions = await LedgerTransaction.find({ employee: salary.employee })
        .sort({ date: 1, createdAt: 1 })
        .session(session);
      const currentBalance = allTransactions.reduce(
        (balance, transaction) => balance + (transaction.amountEarned || 0) - (transaction.amountPaid || 0),
        0
      );
      const newBalance = Number((currentBalance - payAmount).toFixed(2));

      await LedgerTransaction.create([{
        employee: salary.employee,
        date: payment.paymentDate,
        transactionType: 'SALARY_PAYMENT',
        description: `Payment via ${normalizedMethod} for week ${salary.weekLabel}`,
        referenceType: 'SalaryPayment',
        referenceId: payment._id,
        amountEarned: 0,
        amountPaid: payAmount,
        runningBalance: newBalance,
        createdBy: req.user._id
      }], { session });
    });

    if (outcome) {
      return res.status(outcome.status).json({
        success: false,
        message: outcome.message,
        ...(outcome.payment ? { payment: outcome.payment } : {})
      });
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SALARY_PAYMENT_CREATED',
      recordType: 'SalaryPayment',
      recordId: payment._id,
      details: `Paid £${payAmount.toFixed(2)} via ${normalizedMethod} to ${salary.employeeName} for week ${salary.weekLabel}`,
      req
    });

    res.json({
      success: true,
      message: `Payment of £${payAmount.toFixed(2)} recorded successfully.`,
      payment,
      salary,
      receipt: {
        employeeName: salary.employeeName,
        employeeId: salary.employeeId,
        weekLabel: salary.weekLabel,
        paymentAmount: payAmount,
        paymentDate: payment.paymentDate,
        paymentMethod: normalizedMethod,
        previousPaid,
        newTotalPaid: totalPaid,
        remainingOutstanding: balanceRemaining,
        paidByName: payment.paidByName,
        status: salary.status,
        clientReference: payment.clientReference
      }
    });
  } catch (error) {
    if (
      error.code === 11000 &&
      typeof req.body?.clientReference === 'string' &&
      req.body.clientReference.trim()
    ) {
      const duplicate = await SalaryPayment.findOne({ clientReference: req.body.clientReference.trim() });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: 'This payment request was already processed.',
          payment: duplicate
        });
      }
    }
    return sendServerError(res, error, 'Failed to record payment.');
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

exports.getSalaryPayments = async (req, res) => {
  try {
    const salary = await WeeklySalary.findById(req.params.id).select('_id employee finalSalary totalPaid balanceRemaining status');
    if (!salary) return res.status(404).json({ success: false, message: 'Salary record not found.' });
    const payments = await SalaryPayment.find({ weeklySalary: salary._id })
      .populate('paidBy', 'name username role')
      .sort({ paymentDate: 1, createdAt: 1 });
    res.json({ success: true, salary, payments });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch payment history.');
  }
};

exports.getEmployeeLedger = async (req, res) => {
  try {
    const transactions = await LedgerTransaction.find({ employee: req.params.employeeId })
      .populate('createdBy', 'name username role')
      .sort({ date: 1, createdAt: 1 });
    const earned = Number(transactions.reduce((sum, t) => sum + (t.amountEarned || 0), 0).toFixed(2));
    const paid = Number(transactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0).toFixed(2));
    res.json({
      success: true,
      transactions,
      totals: { earned, paid, outstanding: Number((earned - paid).toFixed(2)) }
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch employee ledger.');
  }
};
