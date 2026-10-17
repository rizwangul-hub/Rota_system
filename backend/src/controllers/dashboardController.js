const Employee = require('../models/Employee');
const { sendServerError } = require('../utils/httpErrors');
const Shop = require('../models/Shop');
const Attendance = require('../models/Attendance');
const WeeklySalary = require('../models/WeeklySalary');
const Bonus = require('../models/Bonus');
const { getWeekRange, getUKDateString, formatUKDate } = require('../utils/calc');
const { attendanceCheckerRecord } = require('../utils/attendanceViews');

exports.getAdminDashboard = async (req, res) => {
  try {
    const todayStr = getUKDateString();
    const week = getWeekRange(todayStr);
    const { startDate, endDate, weekLabel } = week;

    const [currentYear, currentMonthNumber] = todayStr.split('-').map(Number);
    const currentMonth = new Date(Date.UTC(currentYear, currentMonthNumber - 1, 1))
      .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

    // Parallelize all independent DB queries to dramatically reduce load time
    const [
      totalEmployees,
      activeEmployees,
      totalShops,
      todayAttendance,
      pendingAttendanceCount,
      weekSalaries,
      shops,
      monthlyBonuses
    ] = await Promise.all([
      Employee.countDocuments(),
      Employee.countDocuments({ employmentStatus: 'Active' }),
      Shop.countDocuments({ isActive: true }),
      Attendance.find({ dateString: todayStr }).lean(),
      Attendance.countDocuments({ approvalStatus: 'Pending Review' }),
      WeeklySalary.find({
        status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
        $or: [
          { weekLabel: { $in: [week.weekLabel, week.legacyWeekLabel] } },
          { weekStartDateString: week.startDateString },
          { weekStartDate: { $gte: week.startDate, $lte: week.endDate } }
        ]
      }).lean(),
      Shop.find({ isActive: true }).lean(),
      Bonus.find({ month: currentMonth, year: currentYear }).lean()
    ]);

    const attendanceStats = {
      total: todayAttendance.length,
      present: todayAttendance.filter(a => a.status === 'Present').length,
      late: todayAttendance.filter(a => a.status === 'Late').length,
      half: todayAttendance.filter(a => a.status === 'Half').length,
      absent: todayAttendance.filter(a => a.status === 'Absent').length,
      totalHours: todayAttendance.reduce((sum, a) => sum + (a.actualHours || 0), 0),
      totalWages: todayAttendance.reduce((sum, a) => sum + (a.attendancePay || 0), 0)
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
      const shopAttendance = todayAttendance.filter(a => a.shop && a.shop.toString() === s._id.toString());
      const presentWorkers = new Set(shopAttendance
        .filter(a => ['Present', 'Late', 'Half'].includes(a.status))
        .map(a => String(a.employee?._id || a.employee || ''))
        .filter(Boolean));
      shopBreakdown.push({
        shopId: s._id,
        shopName: s.name,
        todayWorkers: presentWorkers.size,
        todayHours: Number(shopAttendance.reduce((sum, a) => sum + (a.actualHours || 0), 0).toFixed(2)),
        todayCost: Number(shopAttendance.reduce((sum, a) => sum + (a.attendancePay || 0), 0).toFixed(2)),
        weekSalaryCost: Number(((allocatedSalaryCentsByShop.get(s._id.toString()) || 0) / 100).toFixed(2))
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

exports.getDistributorDashboard = async (req, res) => {
  try {
    const { weekLabel, shopId, status } = req.query;
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

    if (weekLabel) {
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

    const Bonus = require('../models/Bonus');
    const allBonuses = await Bonus.find({ status: { $ne: 'DRAFT' } }).lean();
    const bonusMap = {};
    allBonuses.forEach(b => {
      const empKey = b.employee?.toString();
      if (!empKey) return;
      if (!bonusMap[empKey]) bonusMap[empKey] = [];
      bonusMap[empKey].push(b);
    });

    const salaries = eligibleSalaries.map(s => {
      const sObj = s.toObject ? s.toObject() : { ...s };
      const empKey = (s.employee?._id || s.employee || '').toString();
      const empBonuses = bonusMap[empKey] || [];
      const standaloneBonus = empBonuses
        .filter(b => !b.assignedWeeklySalary || b.assignedWeeklySalary.toString() === s._id.toString())
        .reduce((sum, b) => sum + (Number(b.bonusAmount) || 0), 0);
      const commissionBonus = Number(((s.bonus || 0) > 0 ? s.bonus : standaloneBonus).toFixed(2));

      const openingBal = Number(s.employee?.openingBalance || 0);
      const weeklySalary = Number(s.finalSalary || 0);
      const totalPayableForEmp = Number((weeklySalary + openingBal + commissionBonus).toFixed(2));
      const totalPaidForEmp = Number((s.totalPaid || 0).toFixed(2));
      const balanceRemainingForEmp = Number(Math.max(0, totalPayableForEmp - totalPaidForEmp).toFixed(2));

      sObj.openingBalance = openingBal;
      sObj.weeklySalary = weeklySalary;
      sObj.bonus = commissionBonus;
      sObj.bonusDetails = empBonuses;
      sObj.totalPayable = totalPayableForEmp;
      sObj.balanceRemaining = balanceRemainingForEmp;
      if (balanceRemainingForEmp === 0 && totalPaidForEmp > 0) {
        sObj.status = 'PAID';
      } else if (totalPaidForEmp > 0) {
        sObj.status = 'PARTIALLY_PAID';
      }
      return sObj;
    });

    const totalWeeklyWages = salaries.reduce((sum, s) => sum + (s.weeklySalary || 0), 0);
    const totalOpeningBalance = salaries.reduce((sum, s) => sum + (s.openingBalance || 0), 0);
    const totalCommissionBonus = salaries.reduce((sum, s) => sum + (s.bonus || 0), 0);
    const totalPayable = salaries.reduce((sum, s) => sum + (s.totalPayable || 0), 0);
    const totalPaid = salaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const totalOutstanding = salaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
    const pendingCount = salaries.filter(s => s.balanceRemaining > 0).length;

    const availableWeeks = await WeeklySalary.distinct('weekLabel', {
      weekStartDate: { $gte: new Date('2026-10-11T00:00:00.000Z') },
      status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] }
    });

    res.json({
      success: true,
      currentWeek,
      availableWeeks,
      metrics: {
        totalWeeklyWages: Number(totalWeeklyWages.toFixed(2)),
        totalOpeningBalance: Number(totalOpeningBalance.toFixed(2)),
        totalCommissionBonus: Number(totalCommissionBonus.toFixed(2)),
        totalPayable: Number(totalPayable.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        pendingCount
      },
      salaries
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve distributor dashboard.');
  }
};
