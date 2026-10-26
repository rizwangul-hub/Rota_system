const mongoose = require('mongoose');
const WeeklySalary = require('../models/WeeklySalary');
const { sendServerError } = require('../utils/httpErrors');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const SalaryAdjustment = require('../models/SalaryAdjustment');
const SalaryPayment = require('../models/SalaryPayment');
const Bonus = require('../models/Bonus');
const LedgerTransaction = require('../models/LedgerTransaction');
const Loan = require('../models/Loan');
const { applySalaryLoanDeduction, revertSalaryLoanDeduction } = require('./loanController');
const { getWeekRange, formatUKDate, calculateWeeklySalaryComponents, calculateAttendanceRecord, safeObjectId, resolveDailyWage } = require('../utils/calc');
const { logAction } = require('../utils/audit');
const { validatePaymentAmount, calculatePaymentState, getSalaryFinancialBreakdown } = require('../utils/payment');
const { recalculateEmployeeLedger } = require('../utils/ledgerHelper');

/**
 * Recompute a single WeeklySalary document's numbers and sync with adjustments and bonus
 */
async function recalculateWeeklySalary(salaryDoc, allowFinalized = false) {
  const isFinalizedStatus = ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'].includes(salaryDoc.status);
  if (isFinalizedStatus && !allowFinalized) {
    throw new Error('Finalized salary calculations are locked.');
  }
  // Sum adjustments
  const adjustments = await SalaryAdjustment.find({ weeklySalary: salaryDoc._id });
  // Check bonuses assigned to this weekly salary
  const bonuses = await Bonus.find({ assignedWeeklySalary: salaryDoc._id, status: { $ne: 'DRAFT' } });
  salaryDoc.bonus = Number(bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0).toFixed(2));

  const calc = calculateWeeklySalaryComponents({
    netAttendancePay: salaryDoc.weeklySalaryOverride ?? salaryDoc.netAttendancePay,
    adjustments,
    bonus: salaryDoc.bonus,
    loanDeduction: salaryDoc.loanDeduction || 0,
  });
  salaryDoc.netAttendancePay = calc.netAttendancePay;
  salaryDoc.travelAllowance = calc.travelAllowance;
  salaryDoc.otherAllowances = calc.otherAllowances;
  salaryDoc.manualDeductions = calc.otherDeductions;
  salaryDoc.loanDeduction = calc.loanDeduction;
  salaryDoc.finalSalary = calc.finalSalary;

  // Compute payments (if any from Phase 7)
  const payments = await SalaryPayment.find({ weeklySalary: salaryDoc._id });
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  salaryDoc.totalPaid = Number(totalPaid.toFixed(2));
  salaryDoc.balanceRemaining = Number(Math.max(0, salaryDoc.finalSalary - salaryDoc.totalPaid).toFixed(2));

  if (isFinalizedStatus) {
    if (salaryDoc.balanceRemaining <= 0 && salaryDoc.totalPaid > 0) {
      salaryDoc.status = 'PAID';
    } else if (salaryDoc.totalPaid > 0) {
      salaryDoc.status = 'PARTIALLY_PAID';
    } else {
      salaryDoc.status = 'FINALIZED';
    }

    // Update finalization snapshot with corrected figures
    if (salaryDoc.finalizationSnapshot) {
      salaryDoc.finalizationSnapshot.netAttendancePay = salaryDoc.netAttendancePay;
      salaryDoc.finalizationSnapshot.travelAllowance = salaryDoc.travelAllowance;
      salaryDoc.finalizationSnapshot.otherAllowances = salaryDoc.otherAllowances;
      salaryDoc.finalizationSnapshot.bonus = salaryDoc.bonus;
      salaryDoc.finalizationSnapshot.manualDeductions = salaryDoc.manualDeductions;
      salaryDoc.finalizationSnapshot.loanDeduction = salaryDoc.loanDeduction || 0;
      salaryDoc.finalizationSnapshot.finalSalary = salaryDoc.finalSalary;
      salaryDoc.finalizationSnapshot.updatedAt = new Date();
      if (typeof salaryDoc.markModified === 'function') {
        salaryDoc.markModified('finalizationSnapshot');
      }
    }

    // Sync corresponding LedgerTransaction for SALARY_EARNED
    try {
      await LedgerTransaction.findOneAndUpdate(
        {
          employee: salaryDoc.employee,
          transactionType: 'SALARY_EARNED',
          referenceId: salaryDoc._id
        },
        {
          employee: salaryDoc.employee,
          date: salaryDoc.weekEndDate,
          description: `Weekly Salary for week ${salaryDoc.weekLabel} (${salaryDoc.shopName})`,
          referenceType: 'WeeklySalary',
          referenceId: salaryDoc._id,
          attendancePay: salaryDoc.netAttendancePay,
          lateDeduction: salaryDoc.lateDeductions,
          allowance: (salaryDoc.travelAllowance || 0) + (salaryDoc.otherAllowances || 0),
          bonus: salaryDoc.bonus || 0,
          otherDeduction: salaryDoc.manualDeductions || 0,
          loanDeduction: salaryDoc.loanDeduction || 0,
          amountEarned: salaryDoc.finalSalary,
          amountPaid: 0
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await recalculateEmployeeLedger(salaryDoc.employee);
    } catch (ledgerErr) {
      console.warn('Ledger sync warning during salary recalculation:', ledgerErr?.message);
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
    const sId = safeObjectId(shopId);
    if (sId) attendanceQuery.shop = sId;

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

    if (new Date(week.startDate) < new Date('2026-10-11T00:00:00.000Z')) {
      return res.status(400).json({
        success: false,
        message: 'System baseline date is 11 October 2026. Weekly salaries cannot be generated before 11/10/2026.'
      });
    }

    // 1. Query checked attendance for this week
    const attendanceQuery = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ],
      approvalStatus: { $in: ['Checked', 'Finalized'] }
    };
    const sId = safeObjectId(shopId);
    if (sId) attendanceQuery.shop = sId;

    const attendances = await Attendance.find(attendanceQuery).populate('employee').populate('shop');

    // 2. Query pending attendance for warning count
    const pendingQuery = {
      $or: [
        { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
        { date: { $gte: week.startDate, $lte: week.endDate } }
      ],
      approvalStatus: { $nin: ['Checked', 'Finalized'] }
    };
    if (sId) pendingQuery.shop = sId;
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
      const empObj = att.employee;
      const empKey = empObj
        ? (empObj._id ? empObj._id.toString() : empObj.toString())
        : (att.employeeId || att.employeeName || att._id.toString());

      if (!employeeMap[empKey]) {
        employeeMap[empKey] = {
          employee: empObj ? (empObj._id || empObj) : att.employee,
          employeeName: att.employeeName || empObj?.name || 'Worker',
          employeeId: att.employeeId || empObj?.employeeId || 'EMP',
          shop: att.shop ? (att.shop._id || att.shop) : null,
          shopName: att.shopName || att.shop?.name || 'Shop',
          records: []
        };
      }
      employeeMap[empKey].records.push(att);
    }

    const generatedSalaries = [];
    const skippedFinalized = [];
    const { getDayOfWeekUK } = require('../utils/calc');

    const defaultShopDoc = await Shop.findOne({ isActive: true }) || await Shop.findOne();

    for (const empKey of Object.keys(employeeMap)) {
      const group = employeeMap[empKey];
      // Sort records chronologically
      const records = group.records.sort((a, b) => (a.dateString || '').localeCompare(b.dateString || ''));

      // Check if employee has 0 daily wage (unpaid staff like Ali, Arslan, Ash, Sam)
      let empDoc = null;
      if (group.employee) {
        empDoc = await Employee.findById(group.employee);
      }
      const workerDailyWage = resolveDailyWage(records[0]?.dailyWage, empDoc?.dailyWage);

      if (workerDailyWage === 0 || (empDoc && empDoc.dailyWage === 0)) {
        // Exclude worker from weekly salary generation as requested
        // Remove any non-finalized weekly salary for this unpaid worker
        if (group.employee) {
          await WeeklySalary.deleteMany({
            employee: group.employee,
            weekStartDateString: week.startDateString,
            status: { $in: ['Generated', 'Draft', 'Pending'] }
          });
        }
        // Ensure their attendance records for this week accurately have 0 financials
        for (const r of records) {
          await Attendance.updateOne(
            { _id: r._id },
            {
              $set: {
                dailyWage: 0,
                hourlyWage: 0,
                lateDeduction: 0,
                attendancePay: 0,
                weeklySalary: null
              }
            }
          );
        }
        continue;
      }

      // Check working days (exclude Absent, preserve Half and Present/Late)
      const workingDays = records.filter(r => r.status !== 'Absent').length;
      const scheduledHours = Number(records.reduce((sum, r) => sum + (Number(r.scheduledHours) || 0), 0).toFixed(2));
      const actualHours = Number(records.reduce((sum, r) => sum + (Number(r.actualHours) || 0), 0).toFixed(2));

      // Dynamically calculate lateness deductions and pay for each attendance record
      records.forEach(r => {
        const effectiveEmpWage = empDoc?.dailyWage ?? r.employee?.dailyWage;
        const wage = (effectiveEmpWage !== undefined && effectiveEmpWage !== null)
          ? Number(effectiveEmpWage)
          : resolveDailyWage(r.dailyWage, effectiveEmpWage);
        r.dailyWage = wage;
        const calcResult = calculateAttendanceRecord({
          dailyWage: wage,
          shiftStart: r.shiftStart || '09:00',
          shiftEnd: r.shiftEnd || '19:00',
          timeReached: r.timeReached || r.shiftStart || '09:00',
          workerEndTime: r.workerEndTime || r.shiftEnd || '19:00',
          status: r.status,
          gracePeriodMinutes: 15
        });
        r.lateMinutes = calcResult.lateMinutes;
        r.lateDeduction = calcResult.lateDeduction;
        r.attendancePay = calcResult.attendancePay;
      });

      const grossDailyWages = Number(records.reduce((sum, r) => sum + (Number(r.dailyWage) || 0), 0).toFixed(2));
      const lateDeductions = Number(records.reduce((sum, r) => sum + (Number(r.lateDeduction) || 0), 0).toFixed(2));
      const netAttendancePay = Number(records.reduce((sum, r) => sum + (Number(r.attendancePay) || 0), 0).toFixed(2));

      // Shops worked during the week
      const shopsWorked = Array.from(new Set(records.map(r => r.shopName).filter(Boolean)));
      const lastRecShop = records[records.length - 1].shop;
      let primaryShop = (lastRecShop ? (lastRecShop._id || lastRecShop) : null) || group.shop || defaultShopDoc?._id;
      let primaryShopName = shopsWorked.length === 1
        ? shopsWorked[0]
        : (shopsWorked.length > 1 ? shopsWorked.join(' / ') : (group.shopName || defaultShopDoc?.name || 'Shop'));

      const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

      // Build day-by-day attendance breakdown (all 7 days, Sunday to Saturday)
      const breakdown = records.map(r => {
        const dayNum = getDayOfWeekUK(r.dateString); // 0=Sun..6=Sat
        return {
          attendanceId: r._id,
          dateString: r.dateString,
          dayOfWeek: DAY_NAMES[dayNum] || `Day ${dayNum}`,
          shopName: r.shopName || 'Shop',
          shiftStart: r.shiftStart,
          shiftEnd: r.shiftEnd,
          timeReached: r.timeReached,
          workerEndTime: r.workerEndTime,
          scheduledHours: r.scheduledHours || 0,
          actualHours: r.actualHours || 0,
          status: r.status,
          dailyWage: r.dailyWage != null ? r.dailyWage : 0,
          lateMinutes: r.lateMinutes || 0,
          lateDeduction: r.lateDeduction || 0,
          attendancePay: r.attendancePay || 0,
          remarks: r.remarks || ''
        };
      });

      let salaryDoc = null;
      if (group.employee) {
        salaryDoc = await WeeklySalary.findOne({
          employee: group.employee,
          $or: [
            { weekLabel: { $in: [week.weekLabel, week.legacyWeekLabel] } },
            { weekStartDateString: week.startDateString },
            { weekStartDate: { $gte: week.startDate, $lte: week.endDate } }
          ]
        });
      }

      if (salaryDoc && ['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salaryDoc.status)) {
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
          createdBy: req.user?._id,
          createdByName: req.user?.name || req.user?.username || 'Admin'
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
      try {
        await recalculateWeeklySalary(salaryDoc);
      } catch (recalcErr) {
        console.warn('Recalculate warning:', recalcErr.message);
      }

      // Link attendance records to weeklySalary and save updated lateness deductions
      for (const r of records) {
        await Attendance.updateOne(
          { _id: r._id },
          {
            $set: {
              weeklySalary: salaryDoc._id,
              lateMinutes: r.lateMinutes,
              lateDeduction: r.lateDeduction,
              attendancePay: r.attendancePay,
              dailyWage: r.dailyWage
            }
          }
        );
      }

      generatedSalaries.push(salaryDoc);
    }

    const action = isRegenerate ? 'WEEKLY_SALARY_REGENERATED' : 'WEEKLY_SALARY_GENERATED';
    await logAction({
      user: req.user,
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
    const query = {
      weekStartDate: { $gte: new Date('2026-10-11T00:00:00.000Z') }
    };

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

    const rawSalaries = await WeeklySalary.find(query)
      .populate('employee')
      .populate('shop')
      .sort({ weekStartDate: -1, shopName: 1, employeeName: 1 });

    // Exclude unpaid workers whose daily wage is 0 as requested
    const salaries = rawSalaries.filter(s => {
      if (s.employee && s.employee.dailyWage === 0) return false;
      return true;
    });

    // Query active loans for all relevant employees
    const empIds = [...new Set(salaries.map(s => (s.employee?._id || s.employee || '').toString()).filter(Boolean))];
    const activeLoans = await Loan.find({ employee: { $in: empIds }, status: 'ACTIVE' }).lean();
    const loanMap = {};
    activeLoans.forEach(l => {
      const k = (l.employee || '').toString();
      if (k) loanMap[k] = Number(((loanMap[k] || 0) + (l.remainingBalance || 0)).toFixed(2));
    });

    const enrichedSalaries = salaries.map(s => {
      const sObj = s.toObject ? s.toObject() : { ...s };
      const eId = (s.employee?._id || s.employee || '').toString();
      sObj.activeLoanBalance = loanMap[eId] || 0;
      return sObj;
    });

    // Aggregate totals for the week
    const totals = {
      totalEmployees: salaries.length,
      totalWorkingDays: salaries.reduce((sum, s) => sum + (s.workingDays || 0), 0),
      totalScheduledHours: Number(salaries.reduce((sum, s) => sum + (s.scheduledHours || 0), 0).toFixed(2)),
      totalActualHours: Number(salaries.reduce((sum, s) => sum + (s.actualHours || 0), 0).toFixed(2)),
      grossAttendanceWages: Number(salaries.reduce((sum, s) => sum + (s.grossDailyWages || 0), 0).toFixed(2)),
      totalLateDeductions: Number(salaries.reduce((sum, s) => sum + (s.lateDeductions || 0), 0).toFixed(2)),
      totalAttendancePay: Number(salaries.reduce((sum, s) => sum + (s.netAttendancePay || 0), 0).toFixed(2)),
      totalLoanDeductions: Number(salaries.reduce((sum, s) => sum + (s.loanDeduction || 0), 0).toFixed(2))
    };

    res.json({
      success: true,
      count: enrichedSalaries.length,
      week: resolvedWeek,
      totals,
      salaries: enrichedSalaries
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

    const activeLoans = await Loan.find({ employee: salary.employee, status: 'ACTIVE' }).lean();
    const activeLoanBalance = Number(activeLoans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0).toFixed(2));

    res.json({
      success: true,
      salary,
      activeLoanBalance,
      activeLoans,
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

    const isFinalized = ['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salary.status);
    if (isFinalized && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Cannot add adjustments to finalized salary without Admin privileges.' });
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

    await recalculateWeeklySalary(salary, isFinalized && req.user?.role === 'ADMIN');

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: isFinalized ? 'FINALIZED_SALARY_ADJUSTMENT_ADDED' : 'SALARY_ADJUSTMENT_ADDED',
      recordType: 'SalaryAdjustment',
      recordId: adjustment._id,
      details: `Added ${type} of £${numAmount.toFixed(2)} (${reason}) to ${salary.employeeName} for week ${salary.weekLabel}${isFinalized ? ' [FINALIZED OVERRIDE]' : ''}`,
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

    const isFinalized = ['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salary.status);
    if (isFinalized && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Cannot edit adjustments on finalized salary without Admin privileges.' });
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
    await recalculateWeeklySalary(salary, isFinalized && req.user?.role === 'ADMIN');

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: isFinalized ? 'FINALIZED_SALARY_ADJUSTMENT_UPDATED' : 'SALARY_ADJUSTMENT_UPDATED',
      recordType: 'SalaryAdjustment',
      recordId: adjustment._id,
      details: `Updated adjustment to ${adjustment.type} £${adjustment.amount.toFixed(2)} (${adjustment.reason}) for ${salary.employeeName}${isFinalized ? ' [FINALIZED OVERRIDE]' : ''}`,
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
    const isFinalized = salary && ['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salary.status);
    if (isFinalized && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Cannot remove adjustments from finalized salary without Admin privileges.' });
    }

    await SalaryAdjustment.findByIdAndDelete(adjustmentId);

    if (salary) {
      await recalculateWeeklySalary(salary, isFinalized && req.user?.role === 'ADMIN');
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: isFinalized ? 'FINALIZED_SALARY_ADJUSTMENT_REMOVED' : 'SALARY_ADJUSTMENT_REMOVED',
      recordType: 'SalaryAdjustment',
      recordId: adjustment._id,
      details: `Removed ${adjustment.type} adjustment of £${adjustment.amount.toFixed(2)} (${adjustment.reason}) from ${salary ? salary.employeeName : 'salary'}${isFinalized ? ' [FINALIZED OVERRIDE]' : ''}`,
      req
    });

    res.json({ success: true, message: 'Adjustment removed successfully.', salary });
  } catch (error) {
    return sendServerError(res, error, 'Failed to remove adjustment.');
  }
};

/**
 * Admin directly updates/edits deduction and base weekly salary on a weekly salary record
 */
exports.updateSalaryDeduction = async (req, res) => {
  try {
    const { id } = req.params; // weeklySalary id
    const { deductionAmount, weeklySalaryAmount, reason } = req.body;

    const salary = await WeeklySalary.findById(id);
    if (!salary) return res.status(404).json({ success: false, message: 'Weekly salary not found.' });

    const isFinalized = ['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salary.status);
    if (isFinalized && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Cannot edit salary or deduction on finalized salary without Admin privileges.' });
    }

    const numAmount = Number(deductionAmount);
    if (deductionAmount === undefined || isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, message: 'Deduction amount must be a valid non-negative number.' });
    }

    let salaryOverrideAmount;
    if (weeklySalaryAmount !== undefined) {
      salaryOverrideAmount = Number(weeklySalaryAmount);
      if (!Number.isFinite(salaryOverrideAmount) || salaryOverrideAmount < 0) {
        return res.status(400).json({ success: false, message: 'Weekly salary must be a valid non-negative number.' });
      }
      salary.weeklySalaryOverride = salaryOverrideAmount;
    }

    const adjReason = (reason && reason.trim()) ? reason.trim() : (isFinalized ? 'Admin correction on finalized salary' : 'Manual deduction adjustment');

    // Find any existing MANUAL_DEDUCTION or OTHER_DEDUCTION adjustment for this weekly salary
    let manualAdj = await SalaryAdjustment.findOne({
      weeklySalary: salary._id,
      type: { $in: ['MANUAL_DEDUCTION', 'OTHER_DEDUCTION'] }
    });

    if (numAmount === 0) {
      // Remove deduction adjustments for this weekly salary
      await SalaryAdjustment.deleteMany({
        weeklySalary: salary._id,
        type: { $in: ['MANUAL_DEDUCTION', 'OTHER_DEDUCTION'] }
      });
    } else if (manualAdj) {
      // Update existing deduction adjustment
      manualAdj.amount = numAmount;
      manualAdj.reason = adjReason;
      manualAdj.type = 'MANUAL_DEDUCTION';
      await manualAdj.save();
    } else {
      // Create new MANUAL_DEDUCTION adjustment
      await SalaryAdjustment.create({
        weeklySalary: salary._id,
        employee: salary.employee,
        type: 'MANUAL_DEDUCTION',
        amount: numAmount,
        reason: adjReason,
        addedBy: req.user._id,
        addedByName: req.user.name || 'Admin'
      });
    }

    await recalculateWeeklySalary(salary, isFinalized && req.user?.role === 'ADMIN');

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: isFinalized ? 'FINALIZED_SALARY_DEDUCTION_UPDATED' : 'SALARY_DEDUCTION_UPDATED',
      recordType: 'WeeklySalary',
      recordId: salary._id,
      details: `Updated weekly salary${salaryOverrideAmount === undefined ? '' : ` to £${salaryOverrideAmount.toFixed(2)}`} and deduction to £${numAmount.toFixed(2)} (${adjReason}) for ${salary.employeeName} for week ${salary.weekLabel}${isFinalized ? ' [FINALIZED OVERRIDE]' : ''}`,
      req
    });

    res.json({
      success: true,
      message: salaryOverrideAmount === undefined
        ? `Deduction updated to £${numAmount.toFixed(2)} for ${salary.employeeName}.${isFinalized ? ' Finalized salary and ledger synchronized.' : ''}`
        : `Weekly salary updated to £${salaryOverrideAmount.toFixed(2)} and deduction to £${numAmount.toFixed(2)} for ${salary.employeeName}.${isFinalized ? ' Finalized salary and ledger synchronized.' : ''}`,
      salary
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update salary deduction.');
  }
};

/**
 * Helper to finalize a single WeeklySalary document (locks record & writes ledger)
 */
async function finalizeSingleSalaryHelper(salary, user, req) {
  if (['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'].includes(salary.status)) {
    return salary;
  }

  await recalculateWeeklySalary(salary);

  salary.status = salary.totalPaid >= salary.finalSalary && salary.finalSalary > 0 ? 'PAID' : 'FINALIZED';
  salary.finalizedBy = user._id;
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
      createdBy: user._id
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await recalculateEmployeeLedger(salary.employee);

  await logAction({
    user: user._id,
    username: user.name,
    role: user.role,
    recordType: 'WeeklySalary',
    recordId: salary._id,
    action: 'SALARY_FINALIZED',
    details: `Finalized weekly salary £${salary.finalSalary} for ${salary.employeeName} (${salary.weekLabel})`,
    req
  });

  return salary;
}

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

    const finalizedSalary = await finalizeSingleSalaryHelper(salary, req.user, req);
    res.json({ success: true, message: 'Weekly salary finalized successfully.', salary: finalizedSalary });
  } catch (error) {
    return sendServerError(res, error, 'Failed to finalize salary.');
  }
};

/**
 * Admin finalizes all weekly salaries for a given week or list of salary IDs
 */
exports.finalizeAllWeeklySalaries = async (req, res) => {
  try {
    const { weekLabel, salaryIds } = req.body;
    let query = {};
    if (Array.isArray(salaryIds) && salaryIds.length > 0) {
      query._id = { $in: salaryIds };
    } else if (weekLabel) {
      const altLabel = weekLabel.includes(' – ') ? weekLabel.replace(' – ', ' to ') : weekLabel.replace(' to ', ' – ');
      query.weekLabel = { $in: [weekLabel, altLabel] };
    } else {
      return res.status(400).json({ success: false, message: 'Please provide weekLabel or salaryIds to finalize.' });
    }

    query.status = { $nin: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] };

    const salariesToFinalize = await WeeklySalary.find(query);
    if (!salariesToFinalize.length) {
      return res.json({
        success: true,
        count: 0,
        message: 'All salaries for this period are already finalized.',
        finalized: []
      });
    }

    const finalizedList = [];
    for (const salary of salariesToFinalize) {
      const fin = await finalizeSingleSalaryHelper(salary, req.user, req);
      finalizedList.push(fin);
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SALARY_BULK_FINALIZED',
      details: `Bulk finalized ${finalizedList.length} weekly salaries for ${weekLabel || 'selected records'}`,
      req
    });

    res.json({
      success: true,
      count: finalizedList.length,
      message: `Successfully finalized ${finalizedList.length} salaries. These are now available in Arsalan's dashboard for payment.`,
      finalized: finalizedList
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to bulk finalize weekly salaries.');
  }
};

/**
 * Admin unfinalizes a weekly salary if no payments have been disbursed
 */
exports.unfinalizeWeeklySalary = async (req, res) => {
  try {
    const { id } = req.params;
    const salary = await WeeklySalary.findById(id);
    if (!salary) return res.status(404).json({ success: false, message: 'Weekly salary not found.' });

    const isFinalized = ['FINALIZED', 'PAID', 'PARTIALLY_PAID', 'Finalized', 'Paid', 'Partially Paid'].includes(salary.status);
    if (!isFinalized) {
      return res.status(400).json({ success: false, message: 'Salary is not finalized.' });
    }

    // Check if payments were made
    const payments = await SalaryPayment.find({ weeklySalary: salary._id });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    if (totalPaid > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot unfinalize salary because £${totalPaid.toFixed(2)} has already been paid. Please reverse payments in Distributor dashboard first, or use "Edit Salary" directly to adjust amounts.`
      });
    }

    salary.status = 'Generated';
    salary.finalizedBy = null;
    salary.finalizedAt = null;
    salary.finalizationSnapshot = null;

    // Unlock corresponding attendance records back to 'Checked'
    await Attendance.updateMany(
      { weeklySalary: salary._id },
      { $set: { approvalStatus: 'Checked' } }
    );

    // Remove SALARY_EARNED ledger transaction
    await LedgerTransaction.deleteMany({
      employee: salary.employee,
      transactionType: 'SALARY_EARNED',
      referenceId: salary._id
    });

    await salary.save();
    await recalculateEmployeeLedger(salary.employee);

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SALARY_UNFINALIZED',
      recordType: 'WeeklySalary',
      recordId: salary._id,
      details: `Admin unfinalized weekly salary for ${salary.employeeName} (${salary.weekLabel})`,
      req
    });

    res.json({
      success: true,
      message: `Salary for ${salary.employeeName} unfinalized successfully. Record is unlocked and can be regenerated or edited.`,
      salary
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to unfinalize weekly salary.');
  }
};

/**
 * Salary Distributor records payment (PAID / OK)
 */
exports.recordSalaryPayment = async (req, res) => {
  let session;
  try {
    const { id } = req.params; // weeklySalary id
    const {
      amount = 0,
      paymentMethod = 'Cash',
      notes = '',
      clientReference,
      paymentDate,
      deductionAmount = 0,
      deductionReason = ''
    } = req.body || {};
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

    const numAmount = Number(amount || 0);
    const numDeduct = Number(deductionAmount || 0);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be 0 or a positive number.' });
    }
    if (isNaN(numDeduct) || numDeduct < 0) {
      return res.status(400).json({ success: false, message: 'Deduction amount must be 0 or a positive number.' });
    }
    if (numAmount === 0 && numDeduct === 0) {
      return res.status(400).json({ success: false, message: 'Please enter a payment amount or a deduction amount.' });
    }

    const methodStr = String(paymentMethod || '').trim();
    let normalizedMethod = 'Cash';
    if (/^bank$/i.test(methodStr)) normalizedMethod = 'Bank';
    else if (/^cash$/i.test(methodStr)) normalizedMethod = 'Cash';
    else {
      return res.status(400).json({ success: false, message: 'Payment method must be Cash or Bank.' });
    }

    let salary;
    let payment = null;
    let openingBal = 0;
    let commissionBonus = 0;
    let totalPayable = 0;
    let previousPaid = 0;
    let payAmount = 0;
    let deductAmt = 0;
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
        outcome = { status: 400, message: 'Only finalized salaries can receive payments or deductions.' };
        return;
      }

      if (clientReferenceValue && numAmount > 0) {
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

      const breakdown = await getSalaryFinancialBreakdown(salary, session);
      if (!breakdown) {
        outcome = { status: 400, message: 'Could not compute salary breakdown.' };
        return;
      }
      openingBal = breakdown.openingBalance;
      commissionBonus = breakdown.bonus;
      totalPayable = breakdown.totalPayable;

      const priorPayments = await SalaryPayment.find({ weeklySalary: salary._id }).session(session);
      previousPaid = Number(priorPayments.reduce((sum, record) => sum + record.amount, 0).toFixed(2));
      const outstanding = Number(Math.max(0, totalPayable - previousPaid).toFixed(2));
      if (outstanding <= 0) {
        outcome = { status: 400, message: 'This salary is already fully settled.' };
        return;
      }

      const totalAction = Number((numAmount + numDeduct).toFixed(2));
      if (totalAction > outstanding + 0.005) {
        outcome = {
          status: 400,
          message: `Combined payment (£${numAmount.toFixed(2)}) and deduction (£${numDeduct.toFixed(2)}) cannot exceed the outstanding balance (£${outstanding.toFixed(2)}).`
        };
        return;
      }

      payAmount = Number(numAmount.toFixed(2));
      deductAmt = Number(numDeduct.toFixed(2));

      if (payAmount > 0) {
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
      }

      let pDate = new Date();
      if (paymentDate) {
        const parsed = new Date(paymentDate);
        if (!isNaN(parsed.getTime())) {
          pDate = parsed;
        }
      }
      if (pDate < new Date('2026-10-11T00:00:00.000Z')) {
        pDate = new Date('2026-10-11T00:00:00.000Z');
      }

      // 1. Process adjustment/deduction if requested
      if (deductAmt > 0) {
        const reasonText = (deductionReason && deductionReason.trim()) || 'Rounding / balance adjustment';
        await SalaryAdjustment.create([{
          weeklySalary: salary._id,
          employee: salary.employee,
          type: 'MANUAL_DEDUCTION',
          amount: deductAmt,
          reason: reasonText,
          addedBy: req.user._id,
          addedByName: req.user.name
        }], { session });

        salary.manualDeductions = Number(((salary.manualDeductions || 0) + deductAmt).toFixed(2));
        salary.finalSalary = Number(Math.max(0, (salary.finalSalary || 0) - deductAmt).toFixed(2));
        totalPayable = Number(Math.max(0, totalPayable - deductAmt).toFixed(2));

        await LedgerTransaction.findOneAndUpdate(
          {
            employee: salary.employee,
            transactionType: 'SALARY_EARNED',
            referenceId: salary._id
          },
          {
            employee: salary.employee,
            date: salary.weekEndDate,
            description: `Weekly Salary for week ${salary.weekLabel} (${salary.shopName})`,
            referenceType: 'WeeklySalary',
            referenceId: salary._id,
            attendancePay: salary.netAttendancePay,
            lateDeduction: salary.lateDeductions,
            allowance: (salary.travelAllowance || 0) + (salary.otherAllowances || 0),
            deduction: salary.manualDeductions || 0,
            amountEarned: salary.finalSalary,
            amountPaid: 0
          },
          { upsert: true, session }
        );
      }

      // 2. Process payment payout if requested
      if (payAmount > 0) {
        const paymentPayload = {
          weeklySalary: salary._id,
          employee: salary.employee,
          employeeName: salary.employeeName,
          shop: salary.shop,
          shopName: salary.shopName,
          weekLabel: salary.weekLabel,
          amount: payAmount,
          paymentMethod: normalizedMethod,
          paymentDate: pDate,
          paidBy: req.user._id,
          paidByName: req.user.name,
          notes: notes.trim()
        };
        if (clientReferenceValue) {
          paymentPayload.clientReference = clientReferenceValue;
        }

        [payment] = await SalaryPayment.create([paymentPayload], { session });
        totalPaid = Number((previousPaid + payAmount).toFixed(2));

        await LedgerTransaction.create([{
          employee: salary.employee,
          date: payment.paymentDate,
          transactionType: 'SALARY_PAYMENT',
          description: `Payment via ${normalizedMethod} for week ${salary.weekLabel}`,
          referenceType: 'SalaryPayment',
          referenceId: payment._id,
          amountEarned: 0,
          amountPaid: payAmount,
          createdBy: req.user._id
        }], { session });
      } else {
        totalPaid = previousPaid;
      }

      balanceRemaining = Number(Math.max(0, totalPayable - totalPaid).toFixed(2));
      salary.totalPaid = totalPaid;
      salary.balanceRemaining = balanceRemaining;
      salary.status = balanceRemaining === 0 ? 'PAID' : (totalPaid > 0 ? 'PARTIALLY_PAID' : 'FINALIZED');
      await salary.save({ session });
    });

    if (outcome) {
      return res.status(outcome.status).json({
        success: false,
        message: outcome.message,
        ...(outcome.payment ? { payment: outcome.payment } : {})
      });
    }

    // Fully recalculate running balances and sync ledger statement
    await recalculateEmployeeLedger(salary.employee);

    let logDetails = '';
    if (payAmount > 0 && deductAmt > 0) {
      logDetails = `Paid £${payAmount.toFixed(2)} via ${normalizedMethod} & deducted £${deductAmt.toFixed(2)} for ${salary.employeeName} for week ${salary.weekLabel}`;
    } else if (payAmount > 0) {
      logDetails = `Paid £${payAmount.toFixed(2)} via ${normalizedMethod} to ${salary.employeeName} for week ${salary.weekLabel}`;
    } else {
      logDetails = `Deducted £${deductAmt.toFixed(2)} (${deductionReason || 'balance write-off'}) from remaining balance for ${salary.employeeName} for week ${salary.weekLabel}`;
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: payAmount > 0 ? 'SALARY_PAYMENT_CREATED' : 'SALARY_ADJUSTMENT_CREATED',
      recordType: payment ? 'SalaryPayment' : 'WeeklySalary',
      recordId: payment ? payment._id : salary._id,
      details: logDetails,
      req
    });

    const msg = payAmount > 0 && deductAmt > 0
      ? `Payment of £${payAmount.toFixed(2)} and deduction of £${deductAmt.toFixed(2)} recorded successfully.`
      : payAmount > 0
        ? `Payment of £${payAmount.toFixed(2)} recorded successfully.`
        : `Deduction of £${deductAmt.toFixed(2)} applied and removed from balance & ledger successfully.`;

    res.json({
      success: true,
      message: msg,
      payment,
      salary,
      receipt: {
        paymentId: payment ? payment._id : null,
        employeeName: salary.employeeName,
        employeeId: salary.employeeId,
        shopName: salary.shopName,
        weekLabel: salary.weekLabel,
        weeklySalary: salary.finalSalary,
        openingBalance: openingBal,
        bonus: commissionBonus,
        totalPayable: totalPayable,
        paymentAmount: payAmount,
        deductionAmount: deductAmt,
        paymentDate: payment ? payment.paymentDate : new Date(),
        paymentMethod: normalizedMethod,
        notes: payment ? payment.notes : deductionReason,
        previousPaid,
        newTotalPaid: totalPaid,
        remainingOutstanding: balanceRemaining,
        paidByName: req.user.name,
        status: salary.status,
        clientReference: payment ? payment.clientReference : null
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
    const employeeId = req.params.employeeId;
    const employee = await Employee.findById(employeeId).populate('assignedShop');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const { transactions, totalEarned, totalPaid, currentBalance } = await recalculateEmployeeLedger(employeeId);

    res.json({
      success: true,
      employee,
      summary: {
        openingBalance: employee.openingBalance || 0,
        totalEarned,
        totalPaid,
        outstanding: currentBalance
      },
      transactions,
      totals: { earned: totalEarned, paid: totalPaid, outstanding: currentBalance }
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch employee ledger.');
  }
};

/**
 * Edit an existing salary payment (amount, date, method, notes)
 */
exports.updateSalaryPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount, paymentDate, paymentMethod, notes } = req.body;

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required.' });
    }

    let normalizedMethod = 'Cash';
    if (/^bank$/i.test(paymentMethod)) normalizedMethod = 'Bank';
    else if (/^cash$/i.test(paymentMethod)) normalizedMethod = 'Cash';
    else {
      return res.status(400).json({ success: false, message: 'Payment method must be Cash or Bank.' });
    }

    const payment = await SalaryPayment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    const salary = await WeeklySalary.findById(payment.weeklySalary);
    if (!salary) {
      return res.status(404).json({ success: false, message: 'Associated salary record not found.' });
    }

    const breakdown = await getSalaryFinancialBreakdown(salary);
    if (!breakdown) {
      return res.status(400).json({ success: false, message: 'Could not compute salary breakdown.' });
    }
    const totalPayable = breakdown.totalPayable;

    // Calculate other payments excluding this one
    const otherPayments = await SalaryPayment.find({ weeklySalary: salary._id, _id: { $ne: payment._id } });
    const otherPaymentsTotal = Number(otherPayments.reduce((sum, p) => sum + p.amount, 0).toFixed(2));

    const maxAllowed = Number((totalPayable - otherPaymentsTotal).toFixed(2));
    if (numAmount > maxAllowed) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed the total payable balance (£${maxAllowed.toFixed(2)}).`
      });
    }

    const oldAmount = payment.amount;
    const oldDate = payment.paymentDate;
    const oldMethod = payment.paymentMethod;

    payment.amount = Number(numAmount.toFixed(2));
    if (paymentDate) {
      const pDate = new Date(paymentDate);
      if (!isNaN(pDate.getTime())) {
        payment.paymentDate = pDate < new Date('2026-10-11T00:00:00.000Z') ? new Date('2026-10-11T00:00:00.000Z') : pDate;
      }
    }
    payment.paymentMethod = normalizedMethod;
    if (notes !== undefined) payment.notes = notes ? notes.trim() : '';
    payment.paidBy = req.user._id;
    payment.paidByName = req.user.name || 'Salary Distributor';
    await payment.save();

    // Recalculate salary
    const newTotalPaid = Number((otherPaymentsTotal + payment.amount).toFixed(2));
    const newBalanceRemaining = Number(Math.max(0, totalPayable - newTotalPaid).toFixed(2));
    salary.totalPaid = newTotalPaid;
    salary.balanceRemaining = newBalanceRemaining;
    salary.status = newBalanceRemaining === 0 ? 'PAID' : (newTotalPaid > 0 ? 'PARTIALLY_PAID' : 'FINALIZED');
    await salary.save();

    // Update corresponding LedgerTransaction
    const tx = await LedgerTransaction.findOne({
      referenceId: payment._id,
      referenceType: 'SalaryPayment'
    });
    if (tx) {
      tx.date = payment.paymentDate;
      tx.amountPaid = payment.amount;
      tx.description = `Payment via ${normalizedMethod} for week ${salary.weekLabel}${payment.notes ? ` - ${payment.notes}` : ''}`;
      await tx.save();
    } else {
      await LedgerTransaction.create({
        employee: salary.employee,
        date: payment.paymentDate,
        transactionType: 'SALARY_PAYMENT',
        description: `Payment via ${normalizedMethod} for week ${salary.weekLabel}${payment.notes ? ` - ${payment.notes}` : ''}`,
        referenceType: 'SalaryPayment',
        referenceId: payment._id,
        amountEarned: 0,
        amountPaid: payment.amount,
        runningBalance: 0,
        createdBy: req.user._id
      });
    }

    // Recalculate employee ledger running balances
    await recalculateEmployeeLedger(salary.employee);

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SALARY_PAYMENT_UPDATED',
      recordType: 'SalaryPayment',
      recordId: payment._id,
      details: `Updated payment for ${salary.employeeName}: £${oldAmount} -> £${payment.amount}, date: ${oldDate} -> ${payment.paymentDate}, method: ${oldMethod} -> ${normalizedMethod}`,
      req
    });

    return res.json({
      success: true,
      message: 'Payment updated successfully.',
      payment,
      salary
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update payment.');
  }
};

/**
 * Reverse / Delete a salary payment and restore the worker's remaining balance
 */
exports.reverseSalaryPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await SalaryPayment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    const salary = await WeeklySalary.findById(payment.weeklySalary);
    if (!salary) {
      return res.status(404).json({ success: false, message: 'Associated salary record not found.' });
    }

    const breakdown = await getSalaryFinancialBreakdown(salary);
    const totalPayable = breakdown ? breakdown.totalPayable : Number(((salary.finalSalary || 0) + (salary.bonus || 0)).toFixed(2));

    // Calculate remaining payments excluding this one
    const otherPayments = await SalaryPayment.find({ weeklySalary: salary._id, _id: { $ne: payment._id } });
    const newTotalPaid = Number(otherPayments.reduce((sum, p) => sum + p.amount, 0).toFixed(2));
    const newBalanceRemaining = Number(Math.max(0, totalPayable - newTotalPaid).toFixed(2));

    salary.totalPaid = newTotalPaid;
    salary.balanceRemaining = newBalanceRemaining;
    salary.status = newTotalPaid === 0 ? 'FINALIZED' : (newBalanceRemaining === 0 ? 'PAID' : 'PARTIALLY_PAID');
    await salary.save();

    // Delete associated LedgerTransaction
    await LedgerTransaction.deleteMany({
      referenceId: payment._id,
      referenceType: 'SalaryPayment'
    });

    // Delete the SalaryPayment record
    await SalaryPayment.findByIdAndDelete(payment._id);

    // Recalculate employee ledger running balances
    await recalculateEmployeeLedger(salary.employee);

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SALARY_PAYMENT_REVERSED',
      recordType: 'SalaryPayment',
      recordId: payment._id,
      details: `Reversed payment of £${payment.amount} via ${payment.paymentMethod} to ${salary.employeeName} for week ${salary.weekLabel}. Balance restored to £${newBalanceRemaining}.`,
      req
    });

    return res.json({
      success: true,
      message: `Payment of £${payment.amount.toFixed(2)} reversed successfully. Worker's remaining balance restored.`,
      salary
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to reverse payment.');
  }
};
