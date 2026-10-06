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

    const totalEmployees = await Employee.countDocuments();
    const activeEmployees = await Employee.countDocuments({ employmentStatus: 'Active' });
    const totalShops = await Shop.countDocuments({ isActive: true });

    // Today's attendance
    const todayAttendance = await Attendance.find({ dateString: todayStr });
    const attendanceStats = {
      total: todayAttendance.length,
      present: todayAttendance.filter(a => a.status === 'Present').length,
      late: todayAttendance.filter(a => a.status === 'Late').length,
      half: todayAttendance.filter(a => a.status === 'Half').length,
      absent: todayAttendance.filter(a => a.status === 'Absent').length,
      totalHours: todayAttendance.reduce((sum, a) => sum + (a.actualHours || 0), 0),
      totalWages: todayAttendance.reduce((sum, a) => sum + (a.attendancePay || 0), 0)
    };

    const pendingAttendanceCount = await Attendance.countDocuments({ approvalStatus: 'Pending Review' });

    // Weekly salaries
    const weekSalaries = await WeeklySalary.find({
      status: { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] },
      $or: [
        { weekLabel: { $in: [week.weekLabel, week.legacyWeekLabel] } },
        { weekStartDateString: week.startDateString },
        { weekStartDate: { $gte: week.startDate, $lte: week.endDate } }
      ]
    });
    const thisWeekSalaryTotal = weekSalaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0);
    const thisWeekPaidTotal = weekSalaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const thisWeekOutstanding = weekSalaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
    const allocatedSalaryCentsByShop = new Map();
    const shops = await Shop.find({ isActive: true });
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

    // Monthly bonus total
    const [currentYear, currentMonthNumber] = todayStr.split('-').map(Number);
    const currentMonth = new Date(Date.UTC(currentYear, currentMonthNumber - 1, 1))
      .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const monthlyBonuses = await Bonus.find({ month: currentMonth, year: currentYear });
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

    const query = {};
    if (status && status !== 'All') {
      query.status = status;
    } else {
      query.status = { $in: ['FINALIZED', 'PARTIALLY_PAID', 'PAID', 'Finalized', 'Partially Paid', 'Paid'] };
    }

    if (weekLabel) {
      const altLabel = weekLabel.includes(' – ') ? weekLabel.replace(' – ', ' to ') : weekLabel.replace(' to ', ' – ');
      query.weekLabel = { $in: [weekLabel, altLabel] };
    }
    if (shopId) query.shop = shopId;

    const salaries = await WeeklySalary.find(query)
      .populate('employee')
      .populate('shop')
      .sort({ status: 1, shopName: 1, employeeName: 1 });

    const totalPayable = salaries.reduce((sum, s) => sum + (s.finalSalary || 0), 0);
    const totalPaid = salaries.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const totalOutstanding = salaries.reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
    const pendingCount = salaries.filter(s => s.balanceRemaining > 0).length;

    res.json({
      success: true,
      currentWeek,
      metrics: {
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
