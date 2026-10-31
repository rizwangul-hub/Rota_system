const Employee = require('../models/Employee');
const { sendServerError } = require('../utils/httpErrors');
const Shop = require('../models/Shop');
const Attendance = require('../models/Attendance');
const WeeklySalary = require('../models/WeeklySalary');
const Bonus = require('../models/Bonus');
const Loan = require('../models/Loan');
const { getWeekRange, getUKDateString, formatUKDate } = require('../utils/calc');
const { attendanceCheckerRecord } = require('../utils/attendanceViews');
const { getAvailableWeeksList } = require('../utils/weekList');

exports.getAdminDashboard = async (req, res) => {
  try {
    const todayStr = getUKDateString();
    const requestedWeek = req.query?.weekLabel;

    let week;
    if (requestedWeek && requestedWeek !== 'All' && requestedWeek !== 'current') {
      const dmyMatch = requestedWeek.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const ymdMatch = requestedWeek.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (dmyMatch) {
        week = getWeekRange(`${dmyMatch[1]}/${dmyMatch[2]}/${dmyMatch[3]}`);
      } else if (ymdMatch) {
        week = getWeekRange(ymdMatch[0]);
      } else {
        week = getWeekRange(todayStr);
      }
    } else {
      week = getWeekRange(todayStr);
    }
    const { startDate, endDate, weekLabel } = week;

    const [targetYear, targetMonthNumber] = week.endDateString.split('-').map(Number);
    const targetMonth = new Date(Date.UTC(targetYear, targetMonthNumber - 1, 1))
      .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

    // Parallelize all independent DB queries to dramatically reduce load time
    const toLean = q => (typeof q?.lean === 'function' ? q.lean() : q);
    const [
      totalEmployees,
      activeEmployees,
      totalShops,
      todayAttendance,
      weekAttendance,
      pendingAttendanceCount,
      weekSalaries,
      shops,
      monthlyBonuses,
      availableWeeks
    ] = await Promise.all([
      Employee.countDocuments(),
      Employee.countDocuments({ employmentStatus: 'Active' }),
      Shop.countDocuments({ isActive: true }),
      toLean(Attendance.find({ dateString: todayStr })),
      toLean(Attendance.find({
        $or: [
          { dateString: { $gte: week.startDateString, $lte: week.endDateString } },
          { date: { $gte: week.startDate, $lte: week.endDate } }
        ]
      })),
      Attendance.countDocuments({ approvalStatus: 'Pending Review' }),
      toLean(WeeklySalary.find({
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
        $or: [
          { weekLabel: { $in: [week.weekLabel, week.legacyWeekLabel, requestedWeek].filter(Boolean) } },
          { weekStartDateString: week.startDateString },
          { weekStartDate: { $gte: week.startDate, $lte: week.endDate } }
        ]
      })),
      toLean(Shop.find({ isActive: true })),
      toLean(Bonus.find({ month: targetMonth, year: targetYear })),
      getAvailableWeeksList()
    ]);

    const attendanceStats = {
      total: weekAttendance.length,
      present: weekAttendance.filter(a => a.status === 'Present').length,
      late: weekAttendance.filter(a => a.status === 'Late').length,
      half: weekAttendance.filter(a => a.status === 'Half').length,
      absent: weekAttendance.filter(a => a.status === 'Absent').length,
      totalHours: Number(weekAttendance.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2)),
      totalWages: Number(weekAttendance.reduce((sum, a) => sum + (a.attendancePay || 0), 0).toFixed(2))
    };

    const thisWeekSalaryTotal = weekSalaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0);
    const thisWeekPaidTotal = weekSalaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const thisWeekOutstanding = weekSalaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
    const allocatedSalaryCentsByShop = new Map();
    weekSalaries.forEach(salary => {
      const breakdown = salary.finalizationSnapshot?.attendanceBreakdown || salary.attendanceBreakdown || [];
      const weightsByShop = new Map();
      breakdown.forEach(record => {
        const shop = shops.find(candidate => candidate.name.trim().toLowerCase() === String(record.shopName || '').trim().toLowerCase());
        if (!shop) return;
        const shopId = shop._id.toString();
        weightsByShop.set(shopId, (weightsByShop.get(shopId) || 0) + (Number(record.attendancePay) || 0));
      });

      const weightedShops = shops
        .filter(shop => (weightsByShop.get(shop._id.toString()) || 0) > 0)
        .map(shop => ({
          shopId: shop._id.toString(),
          weight: weightsByShop.get(shop._id.toString())
        }));
      const totalWeight = weightedShops.reduce((sum, shop) => sum + shop.weight, 0);
      const primaryShopId = String(salary.shop?._id || salary.shop || '');
      const shares = totalWeight > 0
        ? weightedShops.map(shop => ({ shopId: shop.shopId, proportion: shop.weight / totalWeight }))
        : shops.some(shop => shop._id.toString() === primaryShopId)
          ? [{ shopId: primaryShopId, proportion: 1 }]
          : [];
      let allocatedCents = 0;
      shares.forEach((share, index) => {
        const salaryCents = Math.round((Number(salary.finalSalary) || 0) * 100);
        const cents = index === shares.length - 1
          ? salaryCents - allocatedCents
          : Math.round(salaryCents * share.proportion);
        allocatedCents += cents;
        allocatedSalaryCentsByShop.set(
          share.shopId,
          (allocatedSalaryCentsByShop.get(share.shopId) || 0) + cents
        );
      });
    });

    const monthlyBonusTotal = monthlyBonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0);

    // Shop labour breakdown
    const shopBreakdown = [];

    for (const s of shops) {
      const sId = s._id.toString();
      const shopWeekAttendance = weekAttendance.filter(a => a.shop && a.shop.toString() === sId);
      const weekWorkers = new Set(shopWeekAttendance
        .filter(a => ['Present', 'Late', 'Half'].includes(a.status))
        .map(a => String(a.employee?._id || a.employee || ''))
        .filter(Boolean));

      const shopTodayAttendance = todayAttendance.filter(a => a.shop && a.shop.toString() === sId);
      const todayWorkers = new Set(shopTodayAttendance
        .filter(a => ['Present', 'Late', 'Half'].includes(a.status))
        .map(a => String(a.employee?._id || a.employee || ''))
        .filter(Boolean));

      shopBreakdown.push({
        shopId: s._id,
        shopName: s.name,
        todayWorkers: todayWorkers.size,
        todayHours: Number(shopTodayAttendance.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2)),
        todayCost: Number(shopTodayAttendance.reduce((sum, a) => sum + (a.attendancePay || 0), 0).toFixed(2)),
        weekWorkers: weekWorkers.size,
        weekHours: Number(shopWeekAttendance.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2)),
        weekCost: Number(shopWeekAttendance.reduce((sum, a) => sum + (a.attendancePay || 0), 0).toFixed(2)),
        weekSalaryCost: Number(((allocatedSalaryCentsByShop.get(sId) || 0) / 100).toFixed(2))
      });
    }

    res.json({
      success: true,
      data: {
        totalEmployees,
        activeEmployees,
        totalShops,
        pendingAttendanceCount,
        attendanceStats,
        weekLabel,
        selectedWeek: weekLabel,
        availableWeeks,
        thisWeekSalaryTotal,
        thisWeekPaidTotal,
        thisWeekOutstanding,
        monthlyBonusTotal,
        shopBreakdown
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve admin dashboard.');
  }
};

exports.getCheckerDashboard = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const pendingRecords = await Attendance.find({ approvalStatus: 'Pending Review' })
      .populate('employee')
      .populate('shop')
      .sort({ date: -1, shopName: 1 });

    const todayChecked = await Attendance.find({ dateString: todayStr, approvalStatus: { $in: ['Checked', 'Finalized'] } });

    const stats = {
      pendingCount: pendingRecords.length,
      todayCheckedCount: todayChecked.length,
      present: pendingRecords.filter(r => r.status === 'Present').length,
      late: pendingRecords.filter(r => r.status === 'Late').length,
      half: pendingRecords.filter(r => r.status === 'Half').length,
      absent: pendingRecords.filter(r => r.status === 'Absent').length
    };

    res.json({
      success: true,
      stats,
      pendingRecords: pendingRecords.map(attendanceCheckerRecord)
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve checker dashboard.');
  }
};

const { buildDistributorSalaryPDF } = require('../utils/reports');

async function getDistributorDataInternal({ weekLabel, shopId, status }) {
  const currentWeek = weekLabel || getWeekRange(new Date()).weekLabel;

  const query = {
    weekStartDate: { $gte: new Date('2026-10-11T00:00:00.000Z') }
  };
  if (status && status !== 'All') {
    if (/^finalized$/i.test(status)) {
      query.status = { $in: ['FINALIZED', 'Finalized'] };
    } else if (/^partially[_\s]?paid$/i.test(status)) {
      query.status = { $in: ['PARTIALLY_PAID', 'Partially Paid'] };
    } else if (/^paid$/i.test(status)) {
      query.status = { $in: ['PAID', 'Paid'] };
    } else {
      query.status = status;
    }
  } else {
    query.status = { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] };
  }

  if (weekLabel && weekLabel !== 'All') {
    const altLabel = weekLabel.includes(' – ') ? weekLabel.replace(' – ', ' to ') : weekLabel.replace(' to ', ' – ');
    query.weekLabel = { $in: [weekLabel, altLabel] };
  }
  if (shopId) query.shop = shopId;

  const rawSalaries = await WeeklySalary.find(query)
    .populate('employee')
    .populate('shop')
    .sort({ status: 1, shopName: 1, employeeName: 1 });

  // Exclude unpaid workers whose daily wage is 0 from distributor dashboard
  const eligibleSalaries = rawSalaries.filter(s => {
    if (s.employee && s.employee.dailyWage === 0) return false;
    return true;
  });

  const empIds = [...new Set(eligibleSalaries.map(s => (s.employee?._id || s.employee || '').toString()).filter(Boolean))];

  // Fetch all historical salaries for these employees to accurately compute running opening balances
  const allHistSalaries = await WeeklySalary.find({
    employee: { $in: empIds }
  }).sort({ weekStartDate: 1 }).lean();

  const allBonuses = await Bonus.find({
    employee: { $in: empIds },
    status: { $ne: 'DRAFT' }
  }).lean();

  const bonusMap = {};
  allBonuses.forEach(b => {
    const empKey = b.employee?.toString();
    if (!empKey) return;
    if (!bonusMap[empKey]) bonusMap[empKey] = [];
    bonusMap[empKey].push(b);
  });

  const empSalariesMap = {};
  allHistSalaries.forEach(s => {
    const empKey = s.employee?.toString();
    if (!empKey) return;
    if (!empSalariesMap[empKey]) empSalariesMap[empKey] = [];
    empSalariesMap[empKey].push(s);
  });

  const empOpeningMap = {};
  eligibleSalaries.forEach(s => {
    const empKey = (s.employee?._id || s.employee || '').toString();
    if (s.employee && s.employee.openingBalance !== undefined) {
      empOpeningMap[empKey] = Number(s.employee.openingBalance || 0);
    }
  });
  for (const eId of empIds) {
    if (empOpeningMap[eId] === undefined) {
      const eDoc = await Employee.findById(eId).select('openingBalance').lean();
      empOpeningMap[eId] = Number(eDoc?.openingBalance || 0);
    }
  }

  // Calculate historical running remaining for every salary of each employee
  const salaryBreakdowns = new Map();
  for (const eId of empIds) {
    const hist = empSalariesMap[eId] || [];
    const empBonuses = bonusMap[eId] || [];
    let runningRemaining = empOpeningMap[eId] || 0;

    for (let i = 0; i < hist.length; i++) {
      const s = hist[i];
      // Week 1 opening is initial openingBalance; subsequent week opening is last week's remaining amount
      const opening = i === 0 ? (empOpeningMap[eId] || 0) : runningRemaining;

      const sStart = new Date(s.weekStartDate);
      const sEnd = new Date(s.weekEndDate);
      sEnd.setHours(23, 59, 59, 999);

      // Only include bonuses assigned to this specific salary OR created within this week's date range
      const weekBonusFromDocs = empBonuses.filter(b => {
        if (b.assignedWeeklySalary) {
          return b.assignedWeeklySalary.toString() === s._id.toString();
        }
        const bDate = new Date(b.createdAt);
        return bDate >= sStart && bDate <= sEnd;
      }).reduce((sum, b) => sum + (Number(b.bonusAmount) || 0), 0);

      const bonus = Number(((s.bonus || 0) > 0 ? s.bonus : weekBonusFromDocs).toFixed(2));
      const weeklySalary = Number(s.finalSalary || 0);
      const totalPayable = Number((opening + weeklySalary + bonus).toFixed(2));
      const totalPaid = Number(s.totalPaid || 0);
      const balanceRemaining = Number(Math.max(0, totalPayable - totalPaid).toFixed(2));

      runningRemaining = balanceRemaining;

      salaryBreakdowns.set(s._id.toString(), {
        openingBalance: opening,
        bonus,
        weeklySalary,
        totalPayable,
        totalPaid,
        balanceRemaining
      });
    }
  }

  // Query active loans for these employees
  const activeLoans = await Loan.find({ employee: { $in: empIds }, status: 'ACTIVE' }).lean();
  const activeLoanMap = {};
  activeLoans.forEach(l => {
    const k = (l.employee || '').toString();
    if (k) activeLoanMap[k] = Number(((activeLoanMap[k] || 0) + (l.remainingBalance || 0)).toFixed(2));
  });

  const salaries = eligibleSalaries.map(s => {
    const sObj = s.toObject ? s.toObject() : { ...s };
    const empKey = (s.employee?._id || s.employee || '').toString();
    const bd = salaryBreakdowns.get(s._id.toString()) || {
      openingBalance: 0,
      weeklySalary: Number(s.finalSalary || 0),
      bonus: Number(s.bonus || 0),
      totalPayable: Number(s.finalSalary || 0),
      totalPaid: Number(s.totalPaid || 0),
      balanceRemaining: Number(s.balanceRemaining || 0)
    };

    const sStart = new Date(s.weekStartDate);
    const sEnd = new Date(s.weekEndDate);
    sEnd.setHours(23, 59, 59, 999);

    const weekBonusDetails = (bonusMap[empKey] || []).filter(b => {
      if (b.assignedWeeklySalary) return b.assignedWeeklySalary.toString() === s._id.toString();
      const bDate = new Date(b.createdAt);
      return bDate >= sStart && bDate <= sEnd;
    });

    const attendanceSalary = Number((s.netAttendancePay ?? s.weeklySalaryOverride ?? (s.grossDailyWages - (s.lateDeductions || 0)) ?? s.finalSalary ?? 0).toFixed(2));
    const allowance = Number(((s.travelAllowance || 0) + (s.otherAllowances || 0)).toFixed(2));

    sObj.attendanceSalary = attendanceSalary;
    sObj.allowance = allowance;
    sObj.travelAllowance = Number(s.travelAllowance || 0);
    sObj.otherAllowances = Number(s.otherAllowances || 0);
    sObj.manualDeductions = Number(s.manualDeductions || 0);
    sObj.loanDeduction = Number(s.loanDeduction || 0);
    sObj.activeLoanBalance = activeLoanMap[empKey] || 0;
    sObj.weeklySalary = attendanceSalary; // Displays attendance wages in the salary field as requested
    sObj.finalSalary = Number(s.finalSalary || 0);
    sObj.openingBalance = bd.openingBalance;
    sObj.bonus = bd.bonus;
    sObj.bonusDetails = weekBonusDetails;
    sObj.totalPayable = bd.totalPayable;
    sObj.totalPaid = bd.totalPaid;
    sObj.balanceRemaining = bd.balanceRemaining;
    if (bd.balanceRemaining === 0 && bd.totalPaid > 0) {
      sObj.status = 'PAID';
    } else if (bd.totalPaid > 0) {
      sObj.status = 'PARTIALLY_PAID';
    }
    return sObj;
  });

  const totalWeeklyWages = salaries.reduce((sum, s) => sum + (s.attendanceSalary || s.weeklySalary || 0), 0);
  const totalAllowance = salaries.reduce((sum, s) => sum + (s.allowance || 0), 0);
  const totalOpeningBalance = salaries.reduce((sum, s) => sum + (s.openingBalance || 0), 0);
  const totalCommissionBonus = salaries.reduce((sum, s) => sum + (s.bonus || 0), 0);
  const totalLoanDeductions = salaries.reduce((sum, s) => sum + (s.loanDeduction || 0), 0);
  const totalPayable = salaries.reduce((sum, s) => sum + (s.totalPayable || 0), 0);
  const totalPaid = salaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
  const totalOutstanding = salaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
  const pendingCount = salaries.filter(s => s.balanceRemaining > 0).length;

  let shopName = '';
  if (shopId) {
    const shopDoc = await Shop.findById(shopId).select('name');
    shopName = shopDoc ? shopDoc.name : '';
  }

  const distinctWeeks = await WeeklySalary.aggregate([
    {
      $match: {
        weekStartDate: { $gte: new Date('2026-10-11T00:00:00.000Z') },
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] }
      }
    },
    { $group: { _id: '$weekLabel', weekStartDate: { $first: '$weekStartDate' } } },
    { $sort: { weekStartDate: -1 } }
  ]);
  const availableWeeks = distinctWeeks.map(w => w._id);

  return {
    currentWeek,
    availableWeeks,
    shopName,
    metrics: {
      totalWeeklyWages: Number(totalWeeklyWages.toFixed(2)),
      totalAllowance: Number(totalAllowance.toFixed(2)),
      totalOpeningBalance: Number(totalOpeningBalance.toFixed(2)),
      totalCommissionBonus: Number(totalCommissionBonus.toFixed(2)),
      totalLoanDeductions: Number(totalLoanDeductions.toFixed(2)),
      totalPayable: Number(totalPayable.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalOutstanding: Number(totalOutstanding.toFixed(2)),
      pendingCount
    },
    salaries
  };
}

exports.getDistributorDashboard = async (req, res) => {
  try {
    const { weekLabel, shopId, status } = req.query;
    const data = await getDistributorDataInternal({ weekLabel, shopId, status });
    res.json({
      success: true,
      ...data
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve distributor dashboard.');
  }
};

exports.exportDistributorPDF = async (req, res) => {
  try {
    const { weekLabel, shopId, status } = req.query;
    const data = await getDistributorDataInternal({ weekLabel, shopId, status });
    let author = req.user?.name || 'Fahad Rasheed';
    if (!author || /system\s*admin/i.test(author) || /^admin$/i.test(author)) {
      author = 'Fahad Rasheed';
    }
    return await buildDistributorSalaryPDF(
      res,
      {
        salaries: data.salaries,
        metrics: data.metrics,
        weekLabel: weekLabel || data.currentWeek,
        shopName: data.shopName,
        statusFilter: status || 'All'
      },
      author
    );
  } catch (error) {
    return sendServerError(res, error, 'Failed to export distributor PDF report.');
  }
};

exports.getDistributorDataInternal = getDistributorDataInternal;
