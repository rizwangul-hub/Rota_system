const Attendance = require('../models/Attendance');
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const Shop = require('../models/Shop');
const { getUKDateString, getWeekRange, formatUKDate } = require('../utils/calc');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

const ISSUE_LABELS = {
  INCORRECT_ARRIVAL_TIME: 'Arrival time is incorrect',
  INCORRECT_LEAVING_TIME: 'Leaving time is incorrect',
  MISSING_ATTENDANCE: 'Attendance record is missing',
  WRONG_SHOP: 'Wrong shop assigned',
  WRONG_STATUS: 'Wrong attendance status',
  OTHER: 'Other attendance issue'
};

/**
 * Calculates start and end YYYY-MM-DD date strings for standard filters
 */
function getDateRangeForFilter(filter, customStart, customEnd) {
  const todayStr = getUKDateString();
  const [tY, tM, tD] = todayStr.split('-').map(Number);

  if (filter === 'LAST_WEEK') {
    // 7 days before today
    const pastDate = new Date(Date.UTC(tY, tM - 1, tD - 7, 12, 0, 0));
    const pastStr = pastDate.toISOString().slice(0, 10);
    const range = getWeekRange(pastStr);
    return {
      startDateString: range.startDateString,
      endDateString: range.endDateString,
      label: range.weekLabel
    };
  }

  if (filter === 'THIS_MONTH') {
    const startStr = `${tY}-${String(tM).padStart(2, '0')}-01`;
    // Last day of current month
    const nextMonth = new Date(Date.UTC(tY, tM, 0, 12, 0, 0));
    const endStr = nextMonth.toISOString().slice(0, 10);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return {
      startDateString: startStr,
      endDateString: endStr,
      label: `${months[tM - 1]} ${tY}`
    };
  }

  if (filter === 'LAST_MONTH') {
    const lastMonthDate = new Date(Date.UTC(tY, tM - 2, 1, 12, 0, 0));
    const lmY = lastMonthDate.getUTCFullYear();
    const lmM = lastMonthDate.getUTCMonth() + 1;
    const startStr = `${lmY}-${String(lmM).padStart(2, '0')}-01`;
    const lastDayDate = new Date(Date.UTC(lmY, lmM, 0, 12, 0, 0));
    const endStr = lastDayDate.toISOString().slice(0, 10);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return {
      startDateString: startStr,
      endDateString: endStr,
      label: `${months[lmM - 1]} ${lmY}`
    };
  }

  if (filter === 'CUSTOM' && customStart && customEnd) {
    return {
      startDateString: customStart.slice(0, 10),
      endDateString: customEnd.slice(0, 10),
      label: `${formatUKDate(customStart)} – ${formatUKDate(customEnd)}`
    };
  }

  // Default: THIS_WEEK
  const currentWeek = getWeekRange(todayStr);
  return {
    startDateString: currentWeek.startDateString,
    endDateString: currentWeek.endDateString,
    label: currentWeek.weekLabel
  };
}

/**
 * Worker Personal Attendance History
 * Strictly filters: employee === req.employee._id AND approvalStatus in ['Checked', 'Finalized']
 * Strictly excludes: wage, hourlyRate, attendancePay, lateDeductions
 */
exports.getAttendanceHistory = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const { filter = 'THIS_WEEK', startDate, endDate } = req.query;

    const range = getDateRangeForFilter(filter, startDate, endDate);

    const records = await Attendance.find({
      employee: employeeId,
      dateString: { $gte: range.startDateString, $lte: range.endDateString },
      approvalStatus: { $in: ['Checked', 'Finalized'] }
    })
      .sort({ dateString: -1 })
      .populate('shop', 'name code address phone');

    // Aggregate summary
    let verifiedDays = 0;
    let verifiedHours = 0;
    let lateArrivals = 0;
    let totalLateMinutes = 0;
    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;

    const safeRecords = records.map(rec => {
      const isAbsent = rec.status === 'Absent';
      const isHalf = rec.status === 'Half';
      const isLate = rec.status === 'Late' || (rec.lateMinutes && rec.lateMinutes > 0);

      if (!isAbsent) {
        verifiedDays++;
        verifiedHours += Number(rec.actualHours || rec.scheduledHours || 0);
      }

      if (rec.status === 'Present') presentDays++;
      else if (isHalf) halfDays++;
      else if (isAbsent) absentDays++;

      if (isLate) {
        lateArrivals++;
        totalLateMinutes += Number(rec.lateMinutes || 0);
      }

      const [y, m, d] = rec.dateString.split('-').map(Number);
      const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      return {
        id: rec._id,
        date: rec.date,
        dateString: rec.dateString,
        formattedDate: `${d} ${months[dateObj.getUTCMonth()]} ${y}`,
        dayOfWeek: days[dateObj.getUTCDay()],
        shopName: rec.shopName || rec.shop?.name || 'Assigned Branch',
        shopCode: rec.shop?.code || '',
        shiftStart: rec.shiftStart || '',
        shiftEnd: rec.shiftEnd || '',
        timeReached: rec.timeReached || '',
        workerEndTime: rec.workerEndTime || '',
        scheduledHours: rec.scheduledHours || 0,
        actualHours: rec.actualHours || 0,
        lateMinutes: rec.lateMinutes || 0,
        status: rec.status,
        approvalStatus: rec.approvalStatus,
        remarks: rec.remarks || '',
        checkedByName: rec.checkedByName || '',
        checkedAt: rec.checkedAt || null,
        isFinalized: rec.approvalStatus === 'Finalized' || Boolean(rec.weeklySalary)
      };
    });

    return res.json({
      success: true,
      filterRange: {
        filter,
        label: range.label,
        startDate: range.startDateString,
        endDate: range.endDateString
      },
      summary: {
        verifiedDays,
        verifiedHours: Number(verifiedHours.toFixed(2)),
        lateArrivals,
        totalLateMinutes,
        presentDays,
        halfDays,
        absentDays,
        totalRecords: safeRecords.length
      },
      records: safeRecords
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving attendance history.');
  }
};

/**
 * Worker's Correction Requests List
 */
exports.getCorrectionRequests = async (req, res) => {
  try {
    const employeeId = req.employee._id;

    const requests = await AttendanceCorrectionRequest.find({
      employee: employeeId
    })
      .sort({ createdAt: -1 })
      .populate('shop', 'name code');

    const safeRequests = requests.map(r => ({
      id: r._id,
      dateString: r.dateString,
      shopName: r.shopName || r.shop?.name || '',
      issueType: r.issueType,
      issueLabel: r.issueLabel || ISSUE_LABELS[r.issueType] || r.issueType,
      explanation: r.explanation,
      originalValues: r.originalValues,
      proposedChanges: r.proposedChanges,
      status: r.status,
      workerResponse: r.workerResponse || '',
      reviewedByName: r.reviewedByName || '',
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt
    }));

    return res.json({
      success: true,
      count: safeRequests.length,
      requests: safeRequests
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving correction requests.');
  }
};

/**
 * Worker Submits Attendance Correction Request
 */
exports.submitCorrectionRequest = async (req, res) => {
  try {
    const {
      dateString,
      issueType,
      explanation,
      proposedChanges = {}
    } = req.body;

    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A valid attendance date (YYYY-MM-DD) is required.'
      });
    }

    if (!issueType || !ISSUE_LABELS[issueType]) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid problem category.'
      });
    }

    if (!explanation || typeof explanation !== 'string' || !explanation.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an explanation describing the attendance problem.'
      });
    }

    const employee = req.employee;
    const cleanDate = dateString.trim();

    // Check duplicate unresolved request for the same date
    const existingPending = await AttendanceCorrectionRequest.findOne({
      employee: employee._id,
      dateString: cleanDate,
      status: 'PENDING'
    });

    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: `A correction request for ${formatUKDate(cleanDate)} is already pending review.`
      });
    }

    // Capture original attendance values if record exists
    const existingAttendance = await Attendance.findOne({
      employee: employee._id,
      dateString: cleanDate
    });

    const originalValues = existingAttendance ? {
      shiftStart: existingAttendance.shiftStart || '',
      shiftEnd: existingAttendance.shiftEnd || '',
      timeReached: existingAttendance.timeReached || '',
      workerEndTime: existingAttendance.workerEndTime || '',
      actualHours: existingAttendance.actualHours || 0,
      lateMinutes: existingAttendance.lateMinutes || 0,
      status: existingAttendance.status || '',
      shopName: existingAttendance.shopName || '',
      approvalStatus: existingAttendance.approvalStatus || ''
    } : {
      shiftStart: '',
      shiftEnd: '',
      timeReached: '',
      workerEndTime: '',
      actualHours: 0,
      lateMinutes: 0,
      status: 'Missing',
      shopName: employee.assignedShop?.name || '',
      approvalStatus: 'None'
    };

    let shopRef = existingAttendance?.shop || employee.assignedShop?._id || employee.assignedShop;
    let shopNameStr = existingAttendance?.shopName || employee.assignedShop?.name || '';

    if (proposedChanges?.shop) {
      const shopObj = await Shop.findById(proposedChanges.shop);
      if (shopObj) {
        proposedChanges.shopName = shopObj.name;
      }
    }

    const newRequest = new AttendanceCorrectionRequest({
      employee: employee._id,
      employeeName: employee.name,
      employeeId: employee.employeeId,
      attendance: existingAttendance ? existingAttendance._id : null,
      dateString: cleanDate,
      shop: shopRef,
      shopName: shopNameStr,
      issueType,
      issueLabel: ISSUE_LABELS[issueType],
      originalValues,
      proposedChanges: {
        timeReached: proposedChanges.timeReached ? proposedChanges.timeReached.trim() : '',
        workerEndTime: proposedChanges.workerEndTime ? proposedChanges.workerEndTime.trim() : '',
        shop: proposedChanges.shop || null,
        shopName: proposedChanges.shopName || '',
        status: proposedChanges.status || ''
      },
      explanation: explanation.trim(),
      status: 'PENDING'
    });

    await newRequest.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: 'WORKER',
      action: 'WORKER_SUBMIT_ATTENDANCE_CORRECTION',
      recordType: 'AttendanceCorrectionRequest',
      recordId: newRequest._id,
      details: `Worker ${employee.name} submitted attendance correction for ${cleanDate}: ${ISSUE_LABELS[issueType]}`,
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Attendance problem reported successfully. Your manager will review it.',
      request: {
        id: newRequest._id,
        dateString: newRequest.dateString,
        issueLabel: newRequest.issueLabel,
        status: newRequest.status,
        createdAt: newRequest.createdAt
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error submitting correction request.');
  }
};
