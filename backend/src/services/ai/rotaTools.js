const mongoose = require('mongoose');
const Employee = require('../../models/Employee');
const Shop = require('../../models/Shop');
const Attendance = require('../../models/Attendance');
const WeeklyRota = require('../../models/WeeklyRota');
const WeeklySalary = require('../../models/WeeklySalary');
const Loan = require('../../models/Loan');
const Bonus = require('../../models/Bonus');
const LedgerTransaction = require('../../models/LedgerTransaction');
const SalaryPayment = require('../../models/SalaryPayment');
const ShopSchedule = require('../../models/ShopSchedule');
const AuditLog = require('../../models/AuditLog');
const { getUKDateString, formatUKDate, getWeekRange, calculateAttendanceRecord } = require('../../utils/calc');
const { buildTimingSheetData } = require('../../utils/reports');

// Helper to determine if a user role is permitted for financial operations
function isFinancialAuthorized(user) {
  const role = user?.role || '';
  return role === 'ADMIN' || role === 'SALARY_DISTRIBUTOR';
}

function isAdmin(user) {
  return (user?.role || '') === 'ADMIN';
}

function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper to find employee by name or ID (case-insensitive fuzzy match)
async function findEmployee(searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string') return null;
  const clean = searchTerm.trim();
  if (mongoose.Types.ObjectId.isValid(clean)) {
    const byId = await Employee.findById(clean).populate('assignedShop');
    if (byId) return byId;
  }

  // Exact or prefix match on employeeId (e.g. PIXX001)
  let emp = await Employee.findOne({ employeeId: new RegExp(`^${clean}$`, 'i') }).populate('assignedShop');
  if (emp) return emp;

  // Exact name match
  emp = await Employee.findOne({ name: new RegExp(`^${clean}$`, 'i') }).populate('assignedShop');
  if (emp) return emp;

  // Word boundary regex or partial match
  emp = await Employee.findOne({ name: new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).populate('assignedShop');
  return emp;
}

// Helper to find shop by name or code
async function findShop(searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string') return null;
  const clean = searchTerm.trim();
  if (mongoose.Types.ObjectId.isValid(clean)) {
    const byId = await Shop.findById(clean);
    if (byId) return byId;
  }

  let shop = await Shop.findOne({ code: new RegExp(`^${clean}$`, 'i') });
  if (shop) return shop;

  shop = await Shop.findOne({ name: new RegExp(`^${clean}$`, 'i') });
  if (shop) return shop;

  shop = await Shop.findOne({ name: new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
  return shop;
}

/**
 * 1. getWorkerDetails
 */
async function getWorkerDetails({ workerName, workerId }, user) {
  const emp = await findEmployee(workerName || workerId);
  if (!emp) {
    const all = await Employee.find({ employmentStatus: 'Active' }).select('name employeeId').limit(15);
    return {
      error: `Worker "${workerName || workerId || ''}" not found.`,
      availableWorkers: all.map(e => `${e.name} (${e.employeeId})`)
    };
  }

  const role = user?.role || '';
  const canViewFinancials = role === 'ADMIN' || role === 'SALARY_DISTRIBUTOR';

  let loansData = null;
  let payrollData = null;

  if (canViewFinancials) {
    // Fetch recent loans if any
    const loans = await Loan.find({ employee: emp._id }).sort({ createdAt: -1 });
    const totalLoanAmount = loans.reduce((s, l) => s + (l.amount || 0), 0);
    const remainingLoanBalance = loans.reduce((s, l) => s + (l.remainingBalance || 0), 0);
    loansData = {
      totalLoansCount: loans.length,
      totalLoanAmount: `£${totalLoanAmount.toFixed(2)}`,
      remainingLoanBalance: `£${remainingLoanBalance.toFixed(2)}`
    };

    // Fetch latest week's salary if available
    const latestSalary = await WeeklySalary.findOne({ employee: emp._id }).sort({ weekStartDate: -1 });
    if (latestSalary) {
      payrollData = {
        weekLabel: latestSalary.weekLabel,
        workingDays: latestSalary.workingDays,
        totalHours: latestSalary.actualHours,
        finalSalary: `£${latestSalary.finalSalary.toFixed(2)}`,
        status: latestSalary.status
      };
    }
  }

  return {
    worker: {
      name: emp.name,
      employeeId: emp.employeeId,
      phone: emp.phone || '—',
      email: emp.email || '—',
      assignedShop: emp.assignedShop ? emp.assignedShop.name : '—',
      dailyWage: canViewFinancials ? `£${emp.dailyWage || 0}` : '[Confidential]',
      hourlyWage: canViewFinancials ? `£${((emp.dailyWage || 0) / 9).toFixed(2)}` : '[Confidential]',
      employmentStatus: emp.employmentStatus,
      startDate: emp.startDate ? formatUKDate(emp.startDate) : '—',
      notes: emp.notes || '—'
    },
    loans: loansData,
    latestPayroll: payrollData,
    financialAccessRestricted: !canViewFinancials
  };
}

/**
 * 2. getWorkerAttendance
 */
async function getWorkerAttendance({ workerName, workerId, date, startDate, endDate, status, limit }, user) {
  const emp = await findEmployee(workerName || workerId);
  if (!emp) {
    const all = await Employee.find({ employmentStatus: 'Active' }).select('name employeeId').limit(15);
    return {
      error: `Worker "${workerName || workerId || ''}" not found.`,
      availableWorkers: all.map(e => `${e.name} (${e.employeeId})`)
    };
  }

  const role = user?.role || '';
  const canViewFinancials = role === 'ADMIN' || role === 'SALARY_DISTRIBUTOR';

  const query = { employee: emp._id };
  if (date) {
    query.dateString = getUKDateString(date);
  } else if (startDate || endDate) {
    query.dateString = {};
    if (startDate) query.dateString.$gte = getUKDateString(startDate);
    if (endDate) query.dateString.$lte = getUKDateString(endDate);
  }
  if (status) query.status = status;

  const maxRecords = Number(limit) || ((startDate && endDate) ? 50 : 20);
  const records = await Attendance.find(query)
    .populate('shop')
    .sort({ dateString: -1 })
    .limit(maxRecords);

  const formattedRows = records.map(r => ({
    date: formatUKDate(r.dateString),
    dateKey: r.dateString,
    shop: r.shopName || r.shop?.name || (r.status === 'Absent' ? 'Absent' : '—'),
    shiftStart: r.shiftStart || '—',
    shiftEnd: r.shiftEnd || '—',
    reachedTime: r.timeReached || '—',
    leftTime: r.workerEndTime || '—',
    lateMinutes: r.lateMinutes || 0,
    hours: r.actualHours || 0,
    status: r.status,
    pay: canViewFinancials ? `£${(r.attendancePay || 0).toFixed(2)}` : '—',
    deduction: canViewFinancials ? (r.lateDeduction ? `£${r.lateDeduction.toFixed(2)}` : '£0.00') : '—',
    approvalStatus: r.approvalStatus || 'Pending Review',
    remarks: r.remarks || '—'
  }));

  const totalPresent = records.filter(r => r.status === 'Present').length;
  const totalLate = records.filter(r => r.status === 'Late').length;
  const totalHalf = records.filter(r => r.status === 'Half').length;
  const totalAbsent = records.filter(r => r.status === 'Absent').length;
  const totalHours = records.reduce((s, r) => s + (r.actualHours || 0), 0);
  const totalPay = records.reduce((s, r) => s + (r.attendancePay || 0), 0);
  const totalLateMinutes = records.reduce((s, r) => s + (r.lateMinutes || 0), 0);
  const totalLateDeductions = records.reduce((s, r) => s + (r.lateDeduction || 0), 0);

  const lateRecords = formattedRows.filter(r => r.lateMinutes > 0);
  const absentRecords = formattedRows.filter(r => r.status === 'Absent');

  return {
    workerName: emp.name,
    workerId: emp.employeeId,
    totalRecords: records.length,
    summary: {
      totalPresent,
      totalLate,
      totalHalf,
      totalAbsent,
      totalLateMinutes,
      totalLateDeductions: canViewFinancials ? `£${totalLateDeductions.toFixed(2)}` : '[Restricted]',
      totalHoursLogged: Number(totalHours.toFixed(1)),
      totalEarned: canViewFinancials ? `£${totalPay.toFixed(2)}` : '[Restricted]'
    },
    lateRecords,
    absentRecords,
    records: formattedRows
  };
}

/**
 * 3. getWorkerSalaryAndPayroll
 */
async function getWorkerSalaryAndPayroll({ workerName, workerId, weekStart, startDate, endDate, limit = 10 }, user) {
  if (!isFinancialAuthorized(user)) {
    return {
      error: `Permission Denied: Your user role (${user?.role || 'Guest'}) does not have authorization to view employee salaries, earnings, or payroll. Please contact an administrator.`,
      restricted: true
    };
  }

  const emp = await findEmployee(workerName || workerId);
  if (!emp) {
    const all = await Employee.find({ employmentStatus: 'Active' }).select('name employeeId').limit(15);
    return {
      error: `Worker "${workerName || workerId || ''}" not found.`,
      availableWorkers: all.map(e => `${e.name} (${e.employeeId})`)
    };
  }

  const query = { employee: emp._id };
  if (startDate || endDate) {
    query.$or = [];
    if (startDate && endDate) {
      query.$or.push(
        { weekStartDateString: { $gte: getUKDateString(startDate), $lte: getUKDateString(endDate) } },
        { weekEndDateString: { $gte: getUKDateString(startDate), $lte: getUKDateString(endDate) } }
      );
    } else if (startDate) {
      query.weekStartDateString = { $gte: getUKDateString(startDate) };
    } else if (endDate) {
      query.weekEndDateString = { $lte: getUKDateString(endDate) };
    }
  } else if (weekStart) {
    const range = getWeekRange(weekStart);
    query.weekStartDateString = range.startDateString;
  }

  const salaries = await WeeklySalary.find(query)
    .sort({ weekStartDate: -1 })
    .limit(Number(limit) || 10);

  const rows = salaries.map(s => ({
    week: s.weekLabel || formatUKDate(s.weekStartDateString),
    workingDays: s.workingDays,
    scheduledHours: s.scheduledHours,
    actualHours: s.actualHours,
    grossWages: `£${(s.grossDailyWages || 0).toFixed(2)}`,
    lateDeductions: `£${(s.lateDeductions || 0).toFixed(2)}`,
    netAttendancePay: `£${(s.netAttendancePay || 0).toFixed(2)}`,
    bonus: `£${(s.bonus || 0).toFixed(2)}`,
    loanDeduction: `£${(s.loanDeduction || 0).toFixed(2)}`,
    finalSalary: `£${(s.finalSalary || 0).toFixed(2)}`,
    totalPaid: `£${(s.totalPaid || 0).toFixed(2)}`,
    balanceRemaining: `£${(s.balanceRemaining || 0).toFixed(2)}`,
    status: s.status
  }));

  const totalGrossWages = salaries.reduce((s, r) => s + (r.grossDailyWages || 0), 0);
  const totalLateDeductions = salaries.reduce((s, r) => s + (r.lateDeductions || 0), 0);
  const totalFinalSalary = salaries.reduce((s, r) => s + (r.finalSalary || 0), 0);
  const totalPaid = salaries.reduce((s, r) => s + (r.totalPaid || 0), 0);
  const totalBalanceRemaining = salaries.reduce((s, r) => s + (r.balanceRemaining || 0), 0);

  return {
    workerName: emp.name,
    workerId: emp.employeeId,
    totalWeeksFound: salaries.length,
    period: startDate && endDate ? `${startDate} to ${endDate}` : (weekStart || 'Recent'),
    summary: {
      totalGrossWages: `£${totalGrossWages.toFixed(2)}`,
      totalLateDeductions: `£${totalLateDeductions.toFixed(2)}`,
      totalFinalSalary: `£${totalFinalSalary.toFixed(2)}`,
      totalPaid: `£${totalPaid.toFixed(2)}`,
      totalBalanceRemaining: `£${totalBalanceRemaining.toFixed(2)}`
    },
    salaries: rows
  };
}

/**
 * 4. getShopDetails
 */
async function getShopDetails({ shopName, shopCode }) {
  const shop = await findShop(shopName || shopCode);
  if (!shop) {
    const all = await Shop.find().select('name code');
    return {
      error: `Shop "${shopName || shopCode || ''}" not found.`,
      availableShops: all.map(s => `${s.name} (${s.code || ''})`)
    };
  }

  const assignedEmployees = await Employee.find({ assignedShop: shop._id, employmentStatus: 'Active' })
    .select('name employeeId dailyWage');

  return {
    shop: {
      name: shop.name,
      code: shop.code || '—',
      address: shop.address || '—',
      phone: shop.phone || '—',
      status: shop.status || (shop.isActive ? 'Active' : 'Inactive'),
      notes: shop.notes || '—'
    },
    totalAssignedWorkers: assignedEmployees.length,
    assignedWorkers: assignedEmployees.map(e => ({
      name: e.name,
      employeeId: e.employeeId,
      dailyWage: `£${e.dailyWage}`
    }))
  };
}

/**
 * 5. getShopDailyAttendance
 */
async function getShopDailyAttendance({ shopName, date }) {
  const shop = await findShop(shopName);
  if (!shop) {
    const all = await Shop.find().select('name code');
    return {
      error: `Shop "${shopName || ''}" not found.`,
      availableShops: all.map(s => `${s.name} (${s.code || ''})`)
    };
  }

  const dateStr = date ? getUKDateString(date) : getUKDateString(new Date());
  const records = await Attendance.find({ shop: shop._id, dateString: dateStr })
    .populate('employee')
    .sort({ employeeName: 1 });

  const rows = records.map(r => ({
    workerName: r.employeeName,
    employeeId: r.employeeId,
    shift: `${r.shiftStart || '09:00'} – ${r.shiftEnd || '19:00'}`,
    actualTime: `${r.timeReached || '—'} – ${r.workerEndTime || '—'}`,
    hours: r.actualHours || 0,
    lateMinutes: r.lateMinutes || 0,
    status: r.status,
    pay: `£${(r.attendancePay || 0).toFixed(2)}`,
    approvalStatus: r.approvalStatus || 'Pending Review'
  }));

  const totalWorkers = records.length;
  const totalHours = records.reduce((s, r) => s + (r.actualHours || 0), 0);
  const totalCost = records.reduce((s, r) => s + (r.attendancePay || 0), 0);

  return {
    shopName: shop.name,
    date: formatUKDate(dateStr),
    dateKey: dateStr,
    summary: {
      workersPresent: totalWorkers,
      totalHours: Number(totalHours.toFixed(1)),
      totalDailyCost: `£${totalCost.toFixed(2)}`
    },
    workers: rows
  };
}

/**
 * 6. getShopWeeklyRota
 */
async function getShopWeeklyRota({ shopName, weekStart }) {
  const shop = await findShop(shopName);
  if (!shop) {
    const all = await Shop.find().select('name code');
    return {
      error: `Shop "${shopName || ''}" not found.`,
      availableShops: all.map(s => `${s.name} (${s.code || ''})`)
    };
  }

  const range = getWeekRange(weekStart);
  const rota = await WeeklyRota.findOne({ weekStart: range.startDateString })
    .populate('assignments.employeeId', 'name employeeId')
    .populate('assignments.shopId', 'name');

  if (!rota) {
    return {
      shopName: shop.name,
      week: range.weekLabel,
      message: `No weekly rota schedule generated yet for week ${range.weekLabel}.`
    };
  }

  // Filter assignments for this shop
  const shopAssignments = (rota.assignments || []).filter(a => {
    const aShopId = a.shopId?._id || a.shopId;
    return aShopId && String(aShopId) === String(shop._id);
  });

  const dayMap = {};
  shopAssignments.forEach(a => {
    const dKey = a.dateKey;
    if (!dayMap[dKey]) dayMap[dKey] = [];
    dayMap[dKey].push({
      workerName: a.employeeId?.name || 'Worker',
      employeeId: a.employeeId?.employeeId || '—',
      time: `${a.startTime} – ${a.endTime}`,
      hours: a.scheduledHours,
      note: a.note || ''
    });
  });

  return {
    shopName: shop.name,
    week: range.weekLabel,
    status: rota.status,
    totalAssignments: shopAssignments.length,
    scheduleByDate: dayMap
  };
}

/**
 * 7. getDailyAttendanceOverview
 */
async function getDailyAttendanceOverview({ date, shopName, status }, user) {
  const dateStr = date ? getUKDateString(date) : getUKDateString(new Date());
  const query = { dateString: dateStr };

  let targetShop = null;
  if (shopName) {
    targetShop = await findShop(shopName);
    if (targetShop) query.shop = targetShop._id;
  }
  if (status) query.status = status;

  const records = await Attendance.find(query)
    .populate('employee')
    .populate('shop')
    .sort({ shopName: 1, employeeName: 1 });

  const canViewFinancials = isFinancialAuthorized(user);

  const present = records.filter(r => r.status === 'Present').length;
  const late = records.filter(r => r.status === 'Late').length;
  const half = records.filter(r => r.status === 'Half').length;
  const absent = records.filter(r => r.status === 'Absent').length;
  const totalHours = records.reduce((s, r) => s + (r.actualHours || 0), 0);
  const totalWages = records.reduce((s, r) => s + (r.attendancePay || 0), 0);
  const totalLateDeductions = records.reduce((s, r) => s + (r.lateDeduction || 0), 0);

  // Group by shop
  const shopBreakdown = {};
  records.forEach(r => {
    const s = r.status === 'Absent' ? 'Absent Workers' : (r.shopName || r.shop?.name || 'Other');
    if (!shopBreakdown[s]) shopBreakdown[s] = [];
    shopBreakdown[s].push({
      worker: r.employeeName,
      id: r.employeeId,
      status: r.status,
      shift: r.status === 'Absent' ? 'OFF' : `${r.shiftStart} – ${r.shiftEnd}`,
      actual: r.status === 'Absent' ? '—' : `${r.timeReached} – ${r.workerEndTime}`,
      hours: r.actualHours || 0,
      lateMin: r.lateMinutes || 0,
      deduction: canViewFinancials ? `£${(r.lateDeduction || 0).toFixed(2)}` : '—',
      pay: canViewFinancials ? `£${(r.attendancePay || 0).toFixed(2)}` : '—',
      approval: r.approvalStatus || 'Pending Review'
    });
  });

  return {
    date: formatUKDate(dateStr),
    dateKey: dateStr,
    filterShop: targetShop ? targetShop.name : 'All Shops',
    summary: {
      totalLogged: records.length,
      present,
      late,
      half,
      absent,
      totalHours: Number(totalHours.toFixed(1)),
      totalWages: canViewFinancials ? `£${totalWages.toFixed(2)}` : '[Restricted]',
      totalLateDeductions: canViewFinancials ? `£${totalLateDeductions.toFixed(2)}` : '[Restricted]'
    },
    shopBreakdown
  };
}

/**
 * 7.5 getWeeklyTimingSheet
 * Weekly worker arrival times sheet grouped by shop (Timing UK Sales Staff)
 */
async function getWeeklyTimingSheet({ date, weekLabel }, user) {
  const targetDate = date ? new Date(date) : new Date();
  const week = weekLabel || getWeekRange(targetDate).label;
  const [attendances, allShops] = await Promise.all([
    Attendance.find({ week }).sort({ dateString: 1 }),
    Shop.find({ isActive: { $ne: false } }).sort({ name: 1 })
  ]);

  const timingData = buildTimingSheetData(attendances, week, allShops);
  return {
    title: 'Timing UK Sales Staff',
    week: timingData.week,
    days: timingData.days,
    totalShops: timingData.shops.length,
    activeWorkers: timingData.shops.reduce((acc, s) => acc + s.workers.length, 0),
    shops: timingData.shops.map(s => ({
      shopName: s.shopName,
      workerCount: s.workers.length,
      workers: s.workers.map(w => ({
        name: w.workerName,
        days: w.days.map(d => ({ date: d.dateStr, day: d.dayName, value: d.text, isAlert: d.isAlert }))
      }))
    })),
    downloadLinks: {
      excel: `/api/reports/timing-sheet/excel?weekLabel=${encodeURIComponent(timingData.week)}`,
      pdf: `/api/reports/timing-sheet/pdf?weekLabel=${encodeURIComponent(timingData.week)}`
    }
  };
}

/**
 * 8. getWeeklyRotaOverview
 */
async function getWeeklyRotaOverview({ weekStart }) {
  const range = getWeekRange(weekStart);
  const rota = await WeeklyRota.findOne({ weekStart: range.startDateString })
    .populate('assignments.employeeId', 'name employeeId')
    .populate('assignments.shopId', 'name');

  if (!rota) {
    return {
      week: range.weekLabel,
      startDate: range.startDateString,
      endDate: range.endDateString,
      status: 'NOT_FOUND',
      message: `No weekly rota generated yet for week ${range.weekLabel}.`
    };
  }

  const totalAssignments = (rota.assignments || []).length;
  const shopsCount = (rota.shopRoster || []).length;

  return {
    week: range.weekLabel,
    startDate: rota.weekStart,
    endDate: rota.weekEnd,
    status: rota.status,
    totalAssignments,
    shopsConfigured: shopsCount,
    publishedAt: rota.publishedAt ? formatUKDate(rota.publishedAt) : 'Not Published',
    validationErrors: rota.validation?.errors || [],
    validationWarnings: rota.validation?.warnings || []
  };
}

/**
 * 9. getWeeklyPayrollSummary
 */
async function getWeeklyPayrollSummary({ weekStart }, user) {
  if (!isFinancialAuthorized(user)) {
    return {
      error: `Permission Denied: Your user role (${user?.role || 'Guest'}) does not have authorization to view company payroll summaries. Please contact an administrator.`,
      restricted: true
    };
  }

  const range = getWeekRange(weekStart);
  const salaries = await WeeklySalary.find({ weekStartDateString: range.startDateString });

  if (!salaries.length) {
    return {
      week: range.weekLabel,
      message: `No payroll records generated yet for week ${range.weekLabel}.`
    };
  }

  const totalEmployees = salaries.length;
  const totalHours = salaries.reduce((s, r) => s + (r.actualHours || 0), 0);
  const totalGross = salaries.reduce((s, r) => s + (r.grossDailyWages || 0), 0);
  const totalDeductions = salaries.reduce((s, r) => s + (r.lateDeductions || 0) + (r.loanDeduction || 0) + (r.manualDeductions || 0), 0);
  const totalBonuses = salaries.reduce((s, r) => s + (r.bonus || 0), 0);
  const totalNet = salaries.reduce((s, r) => s + (r.finalSalary || 0), 0);
  const totalPaid = salaries.reduce((s, r) => s + (r.totalPaid || 0), 0);
  const totalBalance = salaries.reduce((s, r) => s + (r.balanceRemaining || 0), 0);

  return {
    week: range.weekLabel,
    startDate: range.startDateString,
    endDate: range.endDateString,
    totalStaff: totalEmployees,
    totals: {
      totalHoursLogged: Number(totalHours.toFixed(1)),
      totalGrossWages: `£${totalGross.toFixed(2)}`,
      totalDeductions: `£${totalDeductions.toFixed(2)}`,
      totalBonuses: `£${totalBonuses.toFixed(2)}`,
      totalNetSalary: `£${totalNet.toFixed(2)}`,
      totalPaidOut: `£${totalPaid.toFixed(2)}`,
      balanceRemaining: `£${totalBalance.toFixed(2)}`
    },
    staffSummary: salaries.map(s => ({
      name: s.employeeName,
      id: s.employeeId,
      hours: s.actualHours,
      finalPay: `£${s.finalSalary.toFixed(2)}`,
      status: s.status
    }))
  };
}

/**
 * 10. getAllEmployeesSummary
 */
async function getAllEmployeesSummary({ status = 'Active' }, user) {
  const query = {};
  if (status && status !== 'all') query.employmentStatus = status;

  const employees = await Employee.find(query)
    .populate('assignedShop')
    .sort({ name: 1 });

  const canViewFinancials = isFinancialAuthorized(user);

  return {
    totalEmployees: employees.length,
    statusFilter: status,
    employees: employees.map(e => ({
      name: e.name,
      employeeId: e.employeeId,
      assignedShop: e.assignedShop ? e.assignedShop.name : 'Unassigned',
      dailyWage: canViewFinancials ? `£${e.dailyWage}` : '[Confidential]',
      phone: e.phone || '—',
      status: e.employmentStatus
    }))
  };
}

/**
 * 11. getAllShopsSummary
 */
async function getAllShopsSummary() {
  const shops = await Shop.find().sort({ name: 1 });
  const counts = await Employee.aggregate([
    { $match: { employmentStatus: 'Active', assignedShop: { $ne: null } } },
    { $group: { _id: '$assignedShop', count: { $sum: 1 } } }
  ]);
  const countMap = {};
  counts.forEach(c => { countMap[String(c._id)] = c.count; });

  return {
    totalShops: shops.length,
    shops: shops.map(s => ({
      name: s.name,
      code: s.code || '—',
      address: s.address || '—',
      activeWorkersAssigned: countMap[String(s._id)] || 0,
      status: s.status || (s.isActive ? 'Active' : 'Inactive')
    }))
  };
}

/**
 * 12. getEmployeeLedger
 */
async function getEmployeeLedger({ workerName, workerId, startDate, endDate, limit = 50 }, user) {
  if (!isAdmin(user)) {
    return {
      error: `Permission Denied: Only administrators have access to employee financial ledger balances and running accounts (current role: ${user?.role || 'Guest'}).`,
      restricted: true
    };
  }
  const emp = await findEmployee(workerName || workerId);
  if (!emp) {
    const all = await Employee.find({ employmentStatus: 'Active' }).select('name employeeId').limit(15);
    return {
      error: `Worker "${workerName || workerId || ''}" not found.`,
      availableWorkers: all.map(e => `${e.name} (${e.employeeId})`)
    };
  }

  const query = { employee: emp._id };
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const txs = await LedgerTransaction.find(query)
    .sort({ date: -1, createdAt: -1 })
    .limit(Number(limit) || 50);

  const totalEarned = txs.reduce((s, t) => s + (t.amountEarned || 0), 0);
  const totalPaid = txs.reduce((s, t) => s + (t.amountPaid || 0), 0);
  const latestRunningBalance = txs.length > 0 ? (txs[0].runningBalance || 0) : 0;

  return {
    workerName: emp.name,
    workerId: emp.employeeId,
    totalTransactions: txs.length,
    latestRunningBalance: `£${latestRunningBalance.toFixed(2)}`,
    periodSummary: {
      totalEarned: `£${totalEarned.toFixed(2)}`,
      totalPaid: `£${totalPaid.toFixed(2)}`
    },
    transactions: txs.map(t => ({
      date: formatUKDate(t.date),
      type: t.transactionType,
      description: t.description,
      amountEarned: `£${(t.amountEarned || 0).toFixed(2)}`,
      amountPaid: `£${(t.amountPaid || 0).toFixed(2)}`,
      runningBalance: `£${(t.runningBalance || 0).toFixed(2)}`,
      referenceType: t.referenceType
    }))
  };
}

/**
 * 13. getSalaryPayments
 */
async function getSalaryPayments({ workerName, workerId, weekLabel, paymentMethod, startDate, endDate, limit = 50 }, user) {
  if (!isFinancialAuthorized(user)) {
    return {
      error: `Permission Denied: Your role (${user?.role || 'Guest'}) does not have authorization to view salary payment disbursements.`,
      restricted: true
    };
  }

  const query = {};
  if (workerName || workerId) {
    const emp = await findEmployee(workerName || workerId);
    if (emp) query.employee = emp._id;
  }
  if (weekLabel) query.weekLabel = new RegExp(weekLabel, 'i');
  if (paymentMethod) query.paymentMethod = paymentMethod;
  if (startDate || endDate) {
    query.paymentDate = {};
    if (startDate) query.paymentDate.$gte = new Date(startDate);
    if (endDate) query.paymentDate.$lte = new Date(endDate);
  }

  const payments = await SalaryPayment.find(query)
    .sort({ paymentDate: -1 })
    .limit(Number(limit) || 50);

  const totalAmount = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const cashTotal = payments.filter(p => p.paymentMethod === 'Cash').reduce((s, p) => s + (p.amount || 0), 0);
  const bankTotal = payments.filter(p => p.paymentMethod === 'Bank').reduce((s, p) => s + (p.amount || 0), 0);

  return {
    totalPayments: payments.length,
    summary: {
      totalAmount: `£${totalAmount.toFixed(2)}`,
      cashTotal: `£${cashTotal.toFixed(2)}`,
      bankTotal: `£${bankTotal.toFixed(2)}`
    },
    payments: payments.map(p => ({
      worker: p.employeeName,
      shop: p.shopName,
      week: p.weekLabel,
      amount: `£${(p.amount || 0).toFixed(2)}`,
      method: p.paymentMethod,
      date: formatUKDate(p.paymentDate),
      paidBy: p.paidByName || 'System'
    }))
  };
}

/**
 * 14. getPendingAttendance
 */
async function getPendingAttendance({ date, shopName, limit = 50 }) {
  const query = { approvalStatus: { $in: ['Pending Review', 'pending review', 'Pending', 'pending'] } };
  if (date) query.dateString = getUKDateString(date);
  if (shopName) {
    const shop = await findShop(shopName);
    if (shop) query.shop = shop._id;
  }

  const pending = await Attendance.find(query)
    .populate('employee')
    .populate('shop')
    .sort({ dateString: -1, employeeName: 1 })
    .limit(Number(limit) || 50);

  return {
    count: pending.length,
    dateFilter: date ? formatUKDate(getUKDateString(date)) : 'All Dates',
    shopFilter: shopName || 'All Shops',
    records: pending.map(p => ({
      worker: p.employeeName,
      id: p.employeeId,
      shop: p.shopName || p.shop?.name || '—',
      date: p.dateString ? formatUKDate(p.dateString) : '—',
      status: p.status,
      shift: `${p.shiftStart || '—'} – ${p.shiftEnd || '—'}`,
      logged: `${p.timeReached || '—'} – ${p.workerEndTime || '—'}`,
      hours: p.actualHours || 0,
      lateMinutes: p.lateMinutes || 0,
      notes: p.notes || p.remarks || '—',
      approvalStatus: p.approvalStatus
    }))
  };
}

/**
 * 15. getCheckedAttendance
 */
async function getCheckedAttendance({ date, shopName, limit = 50 }) {
  const query = { approvalStatus: { $in: ['Checked', 'Approved', 'Finalized', 'checked'] } };
  if (date) query.dateString = getUKDateString(date);
  if (shopName) {
    const shop = await findShop(shopName);
    if (shop) query.shop = shop._id;
  }

  const checked = await Attendance.find(query)
    .populate('employee')
    .populate('shop')
    .sort({ dateString: -1, employeeName: 1 })
    .limit(Number(limit) || 50);

  return {
    count: checked.length,
    dateFilter: date ? formatUKDate(getUKDateString(date)) : 'All Dates',
    shopFilter: shopName || 'All Shops',
    records: checked.map(p => ({
      worker: p.employeeName,
      id: p.employeeId,
      shop: p.shopName || p.shop?.name || '—',
      date: p.dateString ? formatUKDate(p.dateString) : '—',
      status: p.status,
      shift: `${p.shiftStart || '—'} – ${p.shiftEnd || '—'}`,
      logged: `${p.timeReached || '—'} – ${p.workerEndTime || '—'}`,
      hours: p.actualHours || 0,
      lateMinutes: p.lateMinutes || 0,
      approvalStatus: p.approvalStatus,
      checkedBy: p.checkedByName || 'Sarfraz Khan'
    }))
  };
}

/**
 * 16. getShopOpeningHours
 */
async function getShopOpeningHours({ shopName, shopCode }) {
  let shop = null;
  if (shopName || shopCode) {
    shop = await findShop(shopName || shopCode);
  }

  let schedules = [];
  if (shop) {
    schedules = await ShopSchedule.find({ shop: shop._id, isActive: true }).sort({ dayOfWeek: 1 });
  }
  if (!schedules.length) {
    schedules = await ShopSchedule.find({ shop: null, isActive: true }).sort({ dayOfWeek: 1 });
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const formatted = schedules.map(s => ({
    day: s.dayName || dayNames[s.dayOfWeek],
    dayOfWeek: s.dayOfWeek,
    openingTime: s.openingTime,
    closingTime: s.closingTime,
    defaultHours: s.defaultHours
  }));

  return {
    shopName: shop ? shop.name : 'Default System Schedule (All Shops)',
    shopCode: shop ? shop.code : 'ALL',
    address: shop ? shop.address : '—',
    schedules: formatted
  };
}

/**
 * 17. getAuditHistory
 */
async function getAuditHistory({ username, action, recordType, limit = 30 }, user) {
  if (!isAdmin(user)) {
    return {
      error: `Permission Denied: Security and audit logs can only be viewed by administrators (current role: ${user?.role || 'Guest'}).`,
      restricted: true
    };
  }

  const query = {};
  if (username) query.username = new RegExp(username, 'i');
  if (action) query.action = new RegExp(action, 'i');
  if (recordType) query.recordType = new RegExp(recordType, 'i');

  const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(Number(limit) || 30);

  return {
    totalLogs: logs.length,
    logs: logs.map(l => ({
      timestamp: formatUKDate(l.timestamp),
      username: l.username,
      role: l.role,
      action: l.action,
      recordType: l.recordType,
      details: l.details || '—'
    }))
  };
}

/**
 * 18. getBonusHistory
 */
async function getBonusHistory({ workerName, workerId, month, year, limit = 30 }, user) {
  if (!isAdmin(user)) {
    return {
      error: `Permission Denied: Only administrators can view monthly performance bonuses (current role: ${user?.role || 'Guest'}).`,
      restricted: true
    };
  }

  const query = {};
  if (workerName || workerId) {
    const emp = await findEmployee(workerName || workerId);
    if (emp) query.employee = emp._id;
  }
  if (month) query.month = Number(month);
  if (year) query.year = Number(year);

  const bonuses = await Bonus.find(query).populate('employee').populate('shop').sort({ year: -1, month: -1 }).limit(Number(limit) || 30);
  const totalBonusAmount = bonuses.reduce((s, b) => s + (b.bonusAmount || 0), 0);

  return {
    totalBonuses: bonuses.length,
    totalBonusAmount: `£${totalBonusAmount.toFixed(2)}`,
    bonuses: bonuses.map(b => ({
      worker: b.employeeName || b.employee?.name || '—',
      shop: b.shop?.name || '—',
      monthYear: `${b.month}/${b.year}`,
      salesAmount: `£${(b.salesAmount || 0).toFixed(2)}`,
      targetAmount: `£${(b.targetAmount || 0).toFixed(2)}`,
      bonusAmount: `£${(b.bonusAmount || 0).toFixed(2)}`,
      status: b.status
    }))
  };
}

/**
 * 19. getLoansSummary
 */
async function getLoansSummary({ workerName, workerId, status, limit = 30 }, user) {
  if (!isAdmin(user)) {
    return {
      error: `Permission Denied: Only administrators can view employee loan records (current role: ${user?.role || 'Guest'}).`,
      restricted: true
    };
  }

  const query = {};
  if (workerName || workerId) {
    const emp = await findEmployee(workerName || workerId);
    if (emp) query.employee = emp._id;
  }
  if (status) query.status = status;

  const loans = await Loan.find(query).populate('employee').sort({ createdAt: -1 }).limit(Number(limit) || 30);
  const totalAmount = loans.reduce((s, l) => s + (l.amount || 0), 0);
  const remainingTotal = loans.reduce((s, l) => s + (l.remainingBalance || 0), 0);

  return {
    totalLoans: loans.length,
    summary: {
      totalOriginalAmount: `£${totalAmount.toFixed(2)}`,
      totalRemainingBalance: `£${remainingTotal.toFixed(2)}`
    },
    loans: loans.map(l => ({
      worker: l.employeeName || l.employee?.name || '—',
      amount: `£${(l.amount || 0).toFixed(2)}`,
      remainingBalance: `£${(l.remainingBalance || 0).toFixed(2)}`,
      weeklyDeduction: `£${(l.weeklyDeduction || 0).toFixed(2)}`,
      reason: l.reason || '—',
      status: l.status,
      date: formatUKDate(l.createdAt)
    }))
  };
}

/**
 * 16. Worker Rankings and Comparison Tool
 * Compares staff across all shops or within a specific shop based on:
 * - Activity / Hours / Shifts (most_active, most_hours)
 * - Punctuality / Lateness (least_late, most_late)
 * - Attendance / Absences (most_absent, least_absent)
 */
async function getWorkerRankingsAndComparison(args = {}, user = {}) {
  const criteria = args.criteria || 'most_active';
  const shopFilter = args.shopName ? args.shopName.trim() : null;

  let startDate = args.startDate;
  let endDate = args.endDate;
  let periodLabel = '';

  if (startDate && endDate) {
    periodLabel = `${formatUKDate(startDate)} – ${formatUKDate(endDate)}`;
  } else {
    const now = new Date();
    const yr = now.getUTCFullYear();
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
    startDate = `${yr}-${mo}-01`;
    const lastDay = new Date(Date.UTC(yr, now.getUTCMonth() + 1, 0)).getUTCDate();
    endDate = `${yr}-${mo}-${String(lastDay).padStart(2, '0')}`;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    periodLabel = `${monthNames[now.getUTCMonth()]} ${yr}`;
  }

  let empQuery = {
    $or: [
      { employmentStatus: 'Active' },
      { employmentStatus: { $exists: false } },
      { employmentStatus: null }
    ]
  };
  let shopObj = null;
  if (shopFilter) {
    shopObj = await Shop.findOne({ name: new RegExp(`^${escapeRegex(shopFilter)}$`, 'i') }).lean();
    if (shopObj) {
      empQuery.assignedShop = shopObj._id;
    }
  }

  const employees = await Employee.find(empQuery)
    .populate('assignedShop', 'name code')
    .lean();

  if (!employees || employees.length === 0) {
    return {
      success: false,
      message: shopFilter ? `No active workers found assigned to shop "${shopFilter}".` : 'No active workers found in system.'
    };
  }

  const empMap = {};
  employees.forEach(e => {
    const key = String(e._id);
    empMap[key] = {
      id: key,
      workerName: e.name,
      employeeId: e.employeeId,
      assignedShop: e.assignedShop?.name || 'Unassigned',
      presentDays: 0,
      absentDays: 0,
      totalHours: 0,
      totalLateMinutes: 0,
      officialLateCount: 0,
      minorDelayCount: 0,
      totalEarned: 0
    };
  });

  const attQuery = {
    dateString: { $gte: startDate, $lte: endDate }
  };
  if (shopObj) {
    attQuery.$or = [
      { shop: shopObj._id },
      { shopName: new RegExp(`^${escapeRegex(shopObj.name)}$`, 'i') }
    ];
  }

  const attendances = await Attendance.find(attQuery).lean();

  attendances.forEach(a => {
    const empId = a.employee ? String(a.employee) : null;
    let w = empId ? empMap[empId] : null;
    if (!w && a.employeeId) {
      w = Object.values(empMap).find(x => x.employeeId === a.employeeId);
    }
    if (!w) return;

    if (a.status === 'Present' || a.status === 'Half-Day' || a.status === 'Late') {
      w.presentDays += (a.status === 'Half-Day' ? 0.5 : 1);
      w.totalHours += (a.actualHours || 0);
      const lm = a.lateMinutes || 0;
      w.totalLateMinutes += lm;
      if (a.status === 'Late' || lm > 15) {
        w.officialLateCount += 1;
      } else if (lm > 0) {
        w.minorDelayCount += 1;
      }
      w.totalEarned += (a.attendancePay || 0);
    } else if (a.status === 'Absent') {
      w.absentDays += 1;
    }
  });

  const workerList = Object.values(empMap);

  if (criteria === 'least_late') {
    workerList.sort((a, b) => {
      if (a.totalLateMinutes !== b.totalLateMinutes) return a.totalLateMinutes - b.totalLateMinutes;
      return b.presentDays - a.presentDays;
    });
  } else if (criteria === 'most_late') {
    workerList.sort((a, b) => {
      if (b.totalLateMinutes !== a.totalLateMinutes) return b.totalLateMinutes - a.totalLateMinutes;
      return b.officialLateCount - a.officialLateCount;
    });
  } else if (criteria === 'most_absent') {
    workerList.sort((a, b) => b.absentDays - a.absentDays);
  } else if (criteria === 'least_absent') {
    workerList.sort((a, b) => {
      if (a.absentDays !== b.absentDays) return a.absentDays - b.absentDays;
      return b.presentDays - a.presentDays;
    });
  } else {
    // most_active / most_hours
    workerList.sort((a, b) => {
      if (b.totalHours !== a.totalHours) return b.totalHours - a.totalHours;
      return b.presentDays - a.presentDays;
    });
  }

  workerList.forEach(w => {
    w.totalHours = Number(w.totalHours.toFixed(2));
    if (user.role !== 'ADMIN' && user.role !== 'SALARY_DISTRIBUTOR') {
      w.totalEarned = '[Restricted]';
    } else {
      w.totalEarned = `£${w.totalEarned.toFixed(2)}`;
    }
  });

  const limit = Math.min(50, Math.max(1, args.limit || 15));
  const topRanked = workerList.slice(0, limit);
  const winner = topRanked[0] || null;

  return {
    success: true,
    criteria,
    shopFilter: shopObj ? shopObj.name : 'All Shops',
    periodLabel,
    startDate,
    endDate,
    totalWorkersEvaluated: workerList.length,
    winner,
    rankings: topRanked
  };
}

// Function Declarations for Gemini & natural language resolver
const ALL_ROTA_TOOL_DECLARATIONS = [
  {
    name: 'getWorkerDetails',
    description: 'Get profile, contact, wage, assigned shop, status, and loan balance for any worker.',
    parameters: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: 'Name of the worker (e.g. Shiva, Qasim, Usman, Fardin)' },
        workerId: { type: 'string', description: 'ID of the worker (e.g. PIXX001, PIXX002)' }
      }
    }
  },
  {
    name: 'getWorkerAttendance',
    description: 'Get detailed attendance records for any worker on any day or date range, including shift times, arrival/departure, late minutes, status, and pay.',
    parameters: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: 'Worker name' },
        workerId: { type: 'string', description: 'Worker ID' },
        date: { type: 'string', description: 'Specific date (YYYY-MM-DD or readable date)' },
        startDate: { type: 'string', description: 'Start of date range' },
        endDate: { type: 'string', description: 'End of date range' },
        status: { type: 'string', enum: ['Present', 'Late', 'Half', 'Absent'], description: 'Filter by attendance status' },
        limit: { type: 'number', description: 'Max records to return' }
      }
    }
  },
  {
    name: 'getWorkerSalaryAndPayroll',
    description: 'Get weekly salary breakdown, hours, gross wages, late deductions, bonuses, loans, final pay, and payment status for any worker. Restricted to authorized financial roles.',
    parameters: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: 'Worker name (e.g. Shiva, Ubaid, Qasim)' },
        workerId: { type: 'string', description: 'Worker ID (e.g. PIXX008)' },
        weekStart: { type: 'string', description: 'Specific week start date (YYYY-MM-DD)' },
        startDate: { type: 'string', description: 'Start date for month or range filter (YYYY-MM-DD, e.g. 2026-10-01)' },
        endDate: { type: 'string', description: 'End date for month or range filter (YYYY-MM-DD, e.g. 2026-10-31)' },
        limit: { type: 'number', description: 'Max records to return' }
      }
    }
  },
  {
    name: 'getEmployeeLedger',
    description: 'Get complete financial ledger transactions, debit/credit entries, and running account balance for an employee. (Admin only)',
    parameters: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: 'Worker name' },
        workerId: { type: 'string', description: 'Worker ID' },
        startDate: { type: 'string', description: 'Start date filter' },
        endDate: { type: 'string', description: 'End date filter' },
        limit: { type: 'number', description: 'Max records' }
      }
    }
  },
  {
    name: 'getSalaryPayments',
    description: 'Get history of actual salary disbursements (Cash vs Bank payments, amounts, dates, disbursed by).',
    parameters: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: 'Worker name' },
        workerId: { type: 'string', description: 'Worker ID' },
        weekLabel: { type: 'string', description: 'Week label filter' },
        paymentMethod: { type: 'string', enum: ['Cash', 'Bank'], description: 'Filter Cash or Bank' },
        startDate: { type: 'string', description: 'Start date' },
        endDate: { type: 'string', description: 'End date' },
        limit: { type: 'number', description: 'Max records' }
      }
    }
  },
  {
    name: 'getPendingAttendance',
    description: 'Get unverified attendance entries in the verification queue awaiting review or approval.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional date filter' },
        shopName: { type: 'string', description: 'Optional shop filter' },
        limit: { type: 'number', description: 'Max records' }
      }
    }
  },
  {
    name: 'getCheckedAttendance',
    description: 'Get verified/checked attendance entries that have been reviewed by managers/checkers.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional date filter' },
        shopName: { type: 'string', description: 'Optional shop filter' },
        limit: { type: 'number', description: 'Max records' }
      }
    }
  },
  {
    name: 'getShopDetails',
    description: 'Get details about any shop including address, code, assigned workers, and operating status.',
    parameters: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: 'Name of the shop (e.g. Station, Camden, Chelsea, Edgware, Southwark, Leebridge)' },
        shopCode: { type: 'string', description: 'Shop code (e.g. STAT, CAMD, CHEL)' }
      }
    }
  },
  {
    name: 'getShopDailyAttendance',
    description: 'Get attendance of all workers who worked at a specific shop on a given date (arrival, leave, hours, status, wages).',
    parameters: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: 'Shop name' },
        date: { type: 'string', description: 'Date to inspect (YYYY-MM-DD)' }
      },
      required: ['shopName']
    }
  },
  {
    name: 'getShopWeeklyRota',
    description: 'Get the planned weekly rota schedule for a specific shop across all 7 days of the week.',
    parameters: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: 'Shop name' },
        weekStart: { type: 'string', description: 'Week start date' }
      },
      required: ['shopName']
    }
  },
  {
    name: 'getShopOpeningHours',
    description: 'Get operating schedule, opening hours, closing times, and standard hours for any shop.',
    parameters: {
      type: 'object',
      properties: {
        shopName: { type: 'string', description: 'Shop name' },
        shopCode: { type: 'string', description: 'Shop code' }
      }
    }
  },
  {
    name: 'getDailyAttendanceOverview',
    description: 'Get complete attendance overview across all shops for any specific date (totals present, late, absent, hours, wages, approval status).',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date to view (YYYY-MM-DD or today/yesterday)' },
        shopName: { type: 'string', description: 'Optional shop filter' },
        status: { type: 'string', enum: ['Present', 'Late', 'Half', 'Absent'], description: 'Optional status filter' }
      }
    }
  },
  {
    name: 'getWeeklyTimingSheet',
    description: 'Get weekly worker arrival times and deductions across all shops (Timing UK Sales Staff sheet) verified by Sarfraz and operators.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date to target the week for (YYYY-MM-DD or today)' },
        weekLabel: { type: 'string', description: 'Optional exact week range string (e.g. 27/09/2026 – 03/10/2026)' }
      }
    }
  },
  {
    name: 'getWeeklyRotaOverview',
    description: 'Get the weekly planned rota summary, assignment count, and publication status for any week.',
    parameters: {
      type: 'object',
      properties: {
        weekStart: { type: 'string', description: 'Week start date' }
      }
    }
  },
  {
    name: 'getWeeklyPayrollSummary',
    description: 'Get weekly payroll totals (total gross wages, total deductions, net payable, total paid, and balance) for the entire company. Restricted to Admin/Salary Distributor.',
    parameters: {
      type: 'object',
      properties: {
        weekStart: { type: 'string', description: 'Week start date' }
      }
    }
  },
  {
    name: 'getAllEmployeesSummary',
    description: 'Get full list of all active staff members with assigned shops, daily wage, and phone.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Active', 'Inactive', 'Suspended', 'all'] }
      }
    }
  },
  {
    name: 'getAllShopsSummary',
    description: 'Get a list of all shops with codes, locations, and active assigned worker counts.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'getAuditHistory',
    description: 'Get administrative audit trail and system activity logs. (Admin only)',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Filter by username' },
        action: { type: 'string', description: 'Filter by action' },
        recordType: { type: 'string', description: 'Filter by record type' },
        limit: { type: 'number', description: 'Max logs' }
      }
    }
  },
  {
    name: 'getBonusHistory',
    description: 'Get monthly sales target bonus credits and performance records. (Admin only)',
    parameters: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: 'Worker name' },
        workerId: { type: 'string', description: 'Worker ID' },
        month: { type: 'number', description: 'Month (1-12)' },
        year: { type: 'number', description: 'Year (e.g. 2026)' },
        limit: { type: 'number', description: 'Max records' }
      }
    }
  },
  {
    name: 'getLoansSummary',
    description: 'Get employee loan and advance records, repayments, and outstanding balances. (Admin only)',
    parameters: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: 'Worker name' },
        workerId: { type: 'string', description: 'Worker ID' },
        status: { type: 'string', enum: ['Active', 'Repaid', 'all'], description: 'Loan status' },
        limit: { type: 'number', description: 'Max records' }
      }
    }
  },
  {
    name: 'getWorkerRankingsAndComparison',
    description: 'Rank and compare workers across the company or for a specific shop by activity (most active/most hours), punctuality (least late minutes/most punctual), highest late minutes, or absences.',
    parameters: {
      type: 'object',
      properties: {
        criteria: {
          type: 'string',
          enum: ['most_active', 'least_late', 'most_late', 'most_hours', 'most_absent', 'least_absent'],
          description: 'Ranking criterion: "most_active", "least_late", "most_late", "most_hours", "most_absent", "least_absent"'
        },
        shopName: { type: 'string', description: 'Optional shop name (e.g. Camden, Chelsea, Edgware) to filter rankings to that shop' },
        startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
        endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max rankings to return (default 15)' }
      }
    }
  }
];

// Tool dispatcher
async function executeRotaTool(name, args = {}, user) {
  switch (name) {
    case 'getWorkerDetails':
      return await getWorkerDetails(args, user);
    case 'getWorkerAttendance':
      return await getWorkerAttendance(args, user);
    case 'getWorkerSalaryAndPayroll':
      return await getWorkerSalaryAndPayroll(args, user);
    case 'getWorkerRankingsAndComparison':
      return await getWorkerRankingsAndComparison(args, user);
    case 'getEmployeeLedger':
      return await getEmployeeLedger(args, user);
    case 'getSalaryPayments':
      return await getSalaryPayments(args, user);
    case 'getPendingAttendance':
      return await getPendingAttendance(args, user);
    case 'getCheckedAttendance':
      return await getCheckedAttendance(args, user);
    case 'getShopOpeningHours':
      return await getShopOpeningHours(args, user);
    case 'getShopDetails':
      return await getShopDetails(args);
    case 'getShopDailyAttendance':
      return await getShopDailyAttendance(args);
    case 'getShopWeeklyRota':
      return await getShopWeeklyRota(args);
    case 'getDailyAttendanceOverview':
      return await getDailyAttendanceOverview(args, user);
    case 'getWeeklyTimingSheet':
      return await getWeeklyTimingSheet(args, user);
    case 'getWeeklyRotaOverview':
      return await getWeeklyRotaOverview(args);
    case 'getWeeklyPayrollSummary':
      return await getWeeklyPayrollSummary(args, user);
    case 'getAllEmployeesSummary':
      return await getAllEmployeesSummary(args, user);
    case 'getAllShopsSummary':
      return await getAllShopsSummary();
    case 'getAuditHistory':
      return await getAuditHistory(args, user);
    case 'getBonusHistory':
      return await getBonusHistory(args, user);
    case 'getLoansSummary':
      return await getLoansSummary(args, user);
    case 'securityNotice':
      return {
        isNotice: true,
        noticeType: 'security',
        text: '🔒 **Security Notice:** For system protection and privacy compliance, I do not store or provide user passwords, admin login credentials, or secret keys.\n\nPlease log in via the official **[Admin Login](/login)** page or contact your system administrator for account credentials.'
      };
    case 'clarifyOrOutOfScopeNotice':
      return {
        isNotice: true,
        noticeType: 'clarify',
        text: '❓ **I didn\'t quite catch that:**\n\nI couldn\'t match a worker name, shop, or attendance request from your query: *"' + (args.query || '') + '"*.\n\nI can help you with:\n1. 👤 **Worker Attendance & Lateness** (e.g. *"Show Shiva\'s attendance"*, *"how many mints late by arslan in october"*)\n2. 💰 **Weekly Salaries & Payroll** (e.g. *"Qasim salary report"*, *"Ubaid october earnings"*)\n3. 🏪 **Shop Staffing & Shifts** (e.g. *"Who worked at Camden yesterday?"*, *"Chelsea rota"*)\n4. 📄 **Official PDF & Excel Reports** (e.g. *"Give me Shiva\'s report in PDF"*, *"Export to Excel"*)\n\n_Tip: If asking about a worker, check their spelling or use their ID (e.g. Arslan Bhai, Shiva, PIXX001)._'
      };
    default:
      throw new Error('Tool ' + name + ' is not implemented.');
  }
}

module.exports = {
  ALL_ROTA_TOOL_DECLARATIONS,
  executeRotaTool,
  findEmployee,
  findShop
};
