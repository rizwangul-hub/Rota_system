const WeeklyRota = require('../models/WeeklyRota');
const Attendance = require('../models/Attendance');
const WeeklySalary = require('../models/WeeklySalary');
const Employee = require('../models/Employee');
const { getUKDateString, getWeekRange } = require('../utils/calc');
const { sendServerError } = require('../utils/httpErrors');

/**
 * Helper to format dateKey ("YYYY-MM-DD") into human-friendly format
 */
function formatShiftDate(dateKey, todayStr) {
  if (!dateKey) return '';
  if (dateKey === todayStr) return 'Today';

  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(tY, tM - 1, tD + 1, 12, 0, 0));
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  if (dateKey === tomorrowStr) return 'Tomorrow';

  const [y, m, d] = dateKey.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[dateObj.getUTCDay()]}, ${d} ${months[dateObj.getUTCMonth()]}`;
}

/**
 * Worker Dashboard Aggregator
 * Strictly scoped to authenticated worker (req.user.employee)
 * Strict business visibility:
 * - Only PUBLISHED rotas
 * - Only CHECKED/FINALIZED attendance
 * - Only FINALIZED/PAID/PARTIALLY_PAID salaries
 */
exports.getDashboard = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const todayStr = getUKDateString();

    // 1. Fetch populated employee profile (safe fields only)
    const employee = await Employee.findById(employeeId)
      .populate('assignedShop', 'name code address phone');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // 2. Next Scheduled Shift (from PUBLISHED WeeklyRota only)
    let nextShift = null;
    const activeRotas = await WeeklyRota.find({
      status: 'PUBLISHED',
      weekEnd: { $gte: todayStr }
    })
      .sort({ weekStart: 1 })
      .populate('assignments.shopId', 'name code address phone');

    const futureAssignments = [];
    for (const rota of activeRotas) {
      for (const assignment of rota.assignments || []) {
        if (
          String(assignment.employeeId) === String(employeeId) &&
          assignment.dateKey >= todayStr &&
          assignment.status !== 'OFF'
        ) {
          futureAssignments.push(assignment);
        }
      }
    }

    // Sort by dateKey asc, then startTime asc
    futureAssignments.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

    if (futureAssignments.length > 0) {
      const shift = futureAssignments[0];
      const shopObj = shift.shopId || employee.assignedShop;
      nextShift = {
        dateKey: shift.dateKey,
        formattedDate: formatShiftDate(shift.dateKey, todayStr),
        shopName: shopObj?.name || 'Assigned Branch',
        shopCode: shopObj?.code || '',
        shopAddress: shopObj?.address || '',
        startTime: shift.startTime || '09:00',
        endTime: shift.endTime || '17:00',
        scheduledHours: shift.scheduledHours || 8,
        note: shift.note || ''
      };
    }

    // 3. This Week's Attendance (from CHECKED / FINALIZED attendance only)
    const { startDateString, endDateString, weekLabel } = getWeekRange(todayStr);

    const weekAttendances = await Attendance.find({
      employee: employeeId,
      dateString: { $gte: startDateString, $lte: endDateString },
      approvalStatus: { $in: ['Checked', 'Finalized'] }
    }).sort({ dateString: 1 });

    let verifiedDays = 0;
    let verifiedHours = 0;
    let lateArrivals = 0;

    for (const att of weekAttendances) {
      if (att.status !== 'Absent') {
        verifiedDays++;
        verifiedHours += Number(att.actualHours || att.scheduledHours || 0);
      }
      if (att.status === 'Late' || (att.lateMinutes && att.lateMinutes > 0)) {
        lateArrivals++;
      }
    }
    verifiedHours = Number(verifiedHours.toFixed(2));

    const thisWeekAttendance = {
      weekLabel,
      startDateString,
      endDateString,
      verifiedDays,
      verifiedHours,
      lateArrivals,
      recordsCount: weekAttendances.length
    };

    // 4. Latest Finalized Salary (strictly FINALIZED / PAID / PARTIALLY_PAID)
    const latestSalaryRecord = await WeeklySalary.findOne({
      employee: employeeId,
      status: {
        $in: [
          'FINALIZED', 'PAID', 'PARTIALLY_PAID',
          'Finalized', 'Paid', 'Partially Paid'
        ]
      }
    }).sort({ weekEndDate: -1 });

    let latestFinalizedSalary = null;
    if (latestSalaryRecord) {
      latestFinalizedSalary = {
        id: latestSalaryRecord._id,
        weekLabel: latestSalaryRecord.weekLabel,
        amount: Number(latestSalaryRecord.finalSalary || 0),
        status: latestSalaryRecord.status,
        totalPaid: Number(latestSalaryRecord.totalPaid || 0),
        balanceRemaining: Number(latestSalaryRecord.balanceRemaining || 0),
        workingDays: latestSalaryRecord.workingDays || 0,
        actualHours: latestSalaryRecord.actualHours || 0
      };
    }

    // 5. Outstanding Balance (Across all finalized salaries)
    const allFinalized = await WeeklySalary.find({
      employee: employeeId,
      status: {
        $in: [
          'FINALIZED', 'PAID', 'PARTIALLY_PAID',
          'Finalized', 'Paid', 'Partially Paid'
        ]
      }
    }).select('balanceRemaining');

    const outstandingBalance = allFinalized.reduce(
      (sum, s) => sum + Number(s.balanceRemaining || 0),
      0
    );

    // 6. Leave Requests (Phase 6 placeholder)
    const leaveRequests = {
      pending: 0,
      approved: 0
    };

    // 7. Announcements (Phase 6 placeholder)
    const announcements = {
      unreadCount: 0,
      latest: null
    };

    return res.json({
      success: true,
      worker: {
        id: employee._id,
        employeeId: employee.employeeId,
        name: employee.name,
        preferredName: employee.preferredName || '',
        jobTitle: employee.jobTitle || 'Retail Assistant / Sales',
        assignedShop: employee.assignedShop ? {
          name: employee.assignedShop.name,
          code: employee.assignedShop.code,
          address: employee.assignedShop.address || ''
        } : null,
        employmentStatus: employee.employmentStatus
      },
      nextShift,
      thisWeekAttendance,
      latestFinalizedSalary,
      outstandingBalance: Number(outstandingBalance.toFixed(2)),
      leaveRequests,
      announcements
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving worker dashboard data.');
  }
};
