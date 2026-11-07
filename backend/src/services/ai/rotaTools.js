const mongoose = require('mongoose');
const Employee = require('../../models/Employee');
const Shop = require('../../models/Shop');
const Attendance = require('../../models/Attendance');
const WeeklyRota = require('../../models/WeeklyRota');
const WeeklySalary = require('../../models/WeeklySalary');
const Loan = require('../../models/Loan');
const Bonus = require('../../models/Bonus');
const { getUKDateString, formatUKDate, getWeekRange, calculateAttendanceRecord } = require('../../utils/calc');

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
async function getWorkerDetails({ workerName, workerId }) {
  const emp = await findEmployee(workerName || workerId);
  if (!emp) {
    const all = await Employee.find({ employmentStatus: 'Active' }).select('name employeeId').limit(15);
    return {
      error: `Worker "${workerName || workerId || ''}" not found.`,
      availableWorkers: all.map(e => `${e.name} (${e.employeeId})`)
    };
  }

  // Fetch recent loans if any
  const loans = await Loan.find({ employee: emp._id }).sort({ createdAt: -1 });
  const totalLoanAmount = loans.reduce((s, l) => s + (l.amount || 0), 0);
  const remainingLoanBalance = loans.reduce((s, l) => s + (l.remainingBalance || 0), 0);

  // Fetch latest week's salary if available
  const latestSalary = await WeeklySalary.findOne({ employee: emp._id }).sort({ weekStartDate: -1 });

  return {
    worker: {
      name: emp.name,
      employeeId: emp.employeeId,
      phone: emp.phone || '—',
      email: emp.email || '—',
      assignedShop: emp.assignedShop ? emp.assignedShop.name : '—',
      dailyWage: `£${emp.dailyWage || 0}`,
      hourlyWage: `£${((emp.dailyWage || 0) / 9).toFixed(2)}`,
      employmentStatus: emp.employmentStatus,
      startDate: emp.startDate ? formatUKDate(emp.startDate) : '—',
      notes: emp.notes || '—'
    },
    loans: {
      totalLoansCount: loans.length,
      totalLoanAmount: `£${totalLoanAmount.toFixed(2)}`,
      remainingLoanBalance: `£${remainingLoanBalance.toFixed(2)}`
    },
    latestPayroll: latestSalary ? {
      weekLabel: latestSalary.weekLabel,
      workingDays: latestSalary.workingDays,
      totalHours: latestSalary.actualHours,
      finalSalary: `£${latestSalary.finalSalary.toFixed(2)}`,
      status: latestSalary.status
    } : null
  };
}

/**
 * 2. getWorkerAttendance
 */
async function getWorkerAttendance({ workerName, workerId, date, startDate, endDate, status, limit = 15 }) {
  const emp = await findEmployee(workerName || workerId);
  if (!emp) {
    const all = await Employee.find({ employmentStatus: 'Active' }).select('name employeeId').limit(15);
    return {
      error: `Worker "${workerName || workerId || ''}" not found.`,
      availableWorkers: all.map(e => `${e.name} (${e.employeeId})`)
    };
  }

  const query = { employee: emp._id };
  if (date) {
    query.dateString = getUKDateString(date);
  } else if (startDate || endDate) {
    query.dateString = {};
    if (startDate) query.dateString.$gte = getUKDateString(startDate);
    if (endDate) query.dateString.$lte = getUKDateString(endDate);
  }
  if (status) query.status = status;

  const records = await Attendance.find(query)
    .populate('shop')
    .sort({ dateString: -1 })
    .limit(Number(limit) || 20);

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
    pay: `£${(r.attendancePay || 0).toFixed(2)}`,
    deduction: r.lateDeduction ? `£${r.lateDeduction.toFixed(2)}` : '£0.00',
    approvalStatus: r.approvalStatus || 'Pending Review',
    remarks: r.remarks || '—'
  }));

  const totalPresent = records.filter(r => r.status === 'Present').length;
  const totalLate = records.filter(r => r.status === 'Late').length;
  const totalHalf = records.filter(r => r.status === 'Half').length;
  const totalAbsent = records.filter(r => r.status === 'Absent').length;
  const totalHours = records.reduce((s, r) => s + (r.actualHours || 0), 0);
  const totalPay = records.reduce((s, r) => s + (r.attendancePay || 0), 0);

  return {
    workerName: emp.name,
    workerId: emp.employeeId,
    totalRecords: records.length,
    summary: {
      totalPresent,
      totalLate,
      totalHalf,
      totalAbsent,
      totalHoursLogged: Number(totalHours.toFixed(1)),
      totalEarned: `£${totalPay.toFixed(2)}`
    },
    records: formattedRows
  };
}

/**
 * 3. getWorkerSalaryAndPayroll
 */
async function getWorkerSalaryAndPayroll({ workerName, workerId, weekStart, limit = 10 }) {
  const emp = await findEmployee(workerName || workerId);
  if (!emp) {
    const all = await Employee.find({ employmentStatus: 'Active' }).select('name employeeId').limit(15);
    return {
      error: `Worker "${workerName || workerId || ''}" not found.`,
      availableWorkers: all.map(e => `${e.name} (${e.employeeId})`)
    };
  }

  const query = { employee: emp._id };
  if (weekStart) {
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

  return {
    workerName: emp.name,
    workerId: emp.employeeId,
    totalWeeksFound: salaries.length,
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
async function getDailyAttendanceOverview({ date, shopName, status }) {
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
      deduction: `£${(r.lateDeduction || 0).toFixed(2)}`,
      pay: `£${(r.attendancePay || 0).toFixed(2)}`,
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
      totalWages: `£${totalWages.toFixed(2)}`,
      totalLateDeductions: `£${totalLateDeductions.toFixed(2)}`
    },
    shopBreakdown
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
async function getWeeklyPayrollSummary({ weekStart }) {
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
async function getAllEmployeesSummary({ status = 'Active' }) {
  const query = {};
  if (status && status !== 'all') query.employmentStatus = status;

  const employees = await Employee.find(query)
    .populate('assignedShop')
    .sort({ name: 1 });

  return {
    totalEmployees: employees.length,
    statusFilter: status,
    employees: employees.map(e => ({
      name: e.name,
      employeeId: e.employeeId,
      assignedShop: e.assignedShop ? e.assignedShop.name : 'Unassigned',
      dailyWage: `£${e.dailyWage}`,
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
    description: 'Get weekly salary breakdown, hours, gross wages, late deductions, bonuses, loans, final pay, and payment status for any worker.',
    parameters: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: 'Worker name' },
        workerId: { type: 'string', description: 'Worker ID' },
        weekStart: { type: 'string', description: 'Week start date (YYYY-MM-DD)' }
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
    description: 'Get the weekly rota schedule for a specific shop across all 7 days of the week.',
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
    name: 'getWeeklyRotaOverview',
    description: 'Get the weekly rota summary, assignment count, and publication status for any week.',
    parameters: {
      type: 'object',
      properties: {
        weekStart: { type: 'string', description: 'Week start date' }
      }
    }
  },
  {
    name: 'getWeeklyPayrollSummary',
    description: 'Get weekly payroll totals (total gross wages, total deductions, net payable, total paid, and balance) for the entire company.',
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
  }
];

// Tool dispatcher
async function executeRotaTool(name, args = {}, user) {
  switch (name) {
    case 'getWorkerDetails':
      return await getWorkerDetails(args);
    case 'getWorkerAttendance':
      return await getWorkerAttendance(args);
    case 'getWorkerSalaryAndPayroll':
      return await getWorkerSalaryAndPayroll(args);
    case 'getShopDetails':
      return await getShopDetails(args);
    case 'getShopDailyAttendance':
      return await getShopDailyAttendance(args);
    case 'getShopWeeklyRota':
      return await getShopWeeklyRota(args);
    case 'getDailyAttendanceOverview':
      return await getDailyAttendanceOverview(args);
    case 'getWeeklyRotaOverview':
      return await getWeeklyRotaOverview(args);
    case 'getWeeklyPayrollSummary':
      return await getWeeklyPayrollSummary(args);
    case 'getAllEmployeesSummary':
      return await getAllEmployeesSummary(args);
    case 'getAllShopsSummary':
      return await getAllShopsSummary(args);
    default:
      throw new Error(`Tool "${name}" is not implemented.`);
  }
}

module.exports = {
  ALL_ROTA_TOOL_DECLARATIONS,
  executeRotaTool,
  findEmployee,
  findShop
};
