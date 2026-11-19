const Attendance = require('../models/Attendance');
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const { calculateAttendanceRecord, getUKDateString, formatUKDate, getDefaultShiftTimesForDate } = require('../utils/calc');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

/**
 * Reviewers (Sarfraz & Admin) list correction requests
 */
exports.getAllCorrectionRequests = async (req, res) => {
  try {
    const { status = 'ALL', shopId, search } = req.query;

    const query = {};
    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (shopId && shopId !== 'ALL') {
      query.shop = shopId;
    }
    if (search && search.trim()) {
      const reg = new RegExp(search.trim(), 'i');
      query.$or = [{ employeeName: reg }, { employeeId: reg }, { explanation: reg }];
    }

    const requests = await AttendanceCorrectionRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('shop', 'name code')
      .populate('employee', 'name employeeId phone assignedShop');

    const pendingCount = await AttendanceCorrectionRequest.countDocuments({ status: 'PENDING' });
    const approvedCount = await AttendanceCorrectionRequest.countDocuments({ status: 'APPROVED' });
    const rejectedCount = await AttendanceCorrectionRequest.countDocuments({ status: 'REJECTED' });

    return res.json({
      success: true,
      counts: {
        pendingCount,
        approvedCount,
        rejectedCount,
        total: pendingCount + approvedCount + rejectedCount
      },
      requests
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving attendance correction requests.');
  }
};

/**
 * Reviewers (Sarfraz & Admin) approve or reject a correction request
 */
exports.reviewCorrectionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, workerResponse = '', reviewerNotes = '', updatedFields = {} } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be 'APPROVE' or 'REJECT'."
      });
    }

    const request = await AttendanceCorrectionRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Correction request not found.' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `This correction request has already been reviewed (${request.status}).`
      });
    }

    // Handle Rejection
    if (action === 'REJECT') {
      request.status = 'REJECTED';
      request.reviewedBy = req.user._id;
      request.reviewedByName = req.user.name;
      request.reviewedAt = new Date();
      request.reviewerNotes = reviewerNotes ? reviewerNotes.trim() : '';
      request.workerResponse = workerResponse ? workerResponse.trim() : 'Request was reviewed and declined.';
      await request.save();

      await logAction({
        user: req.user._id,
        username: req.user.name,
        role: req.user.role,
        action: 'ATTENDANCE_CORRECTION_REJECTED',
        recordType: 'AttendanceCorrectionRequest',
        recordId: request._id,
        details: `Rejected correction request for ${request.employeeName} (${request.dateString}). Notes: ${reviewerNotes}`,
        req
      });

      return res.json({
        success: true,
        message: 'Correction request has been rejected.',
        request
      });
    }

    // Handle Approval
    // 1. Locate existing attendance record
    let attendance = request.attendance
      ? await Attendance.findById(request.attendance)
      : await Attendance.findOne({ employee: request.employee, dateString: request.dateString });

    // 2. Strict Payroll Safety Check: Finalized salary records CANNOT be silently altered
    if (attendance && (attendance.approvalStatus === 'Finalized' || Boolean(attendance.weeklySalary))) {
      return res.status(400).json({
        success: false,
        code: 'FINALIZED_SALARY_LOCKED',
        message: `Attendance for ${formatUKDate(request.dateString)} has already been finalized in payroll. Direct modification is prohibited to prevent payroll discrepancies. Please process an authorized salary adjustment in the Weekly Salary module instead.`
      });
    }

    // 3. Apply approved changes to Attendance document
    if (attendance) {
      const isAbsent = (updatedFields.status || request.proposedChanges?.status || attendance.status) === 'Absent';

      const shiftStart = updatedFields.shiftStart || attendance.shiftStart || '09:00';
      const shiftEnd = updatedFields.shiftEnd || attendance.shiftEnd || '17:00';
      const timeReached = isAbsent ? '' : (updatedFields.timeReached || request.proposedChanges?.timeReached || attendance.timeReached);
      const workerEndTime = isAbsent ? '' : (updatedFields.workerEndTime || request.proposedChanges?.workerEndTime || attendance.workerEndTime);
      const status = updatedFields.status || request.proposedChanges?.status || attendance.status;

      // Preserve historical daily wage on attendance
      const dailyWage = Number(attendance.dailyWage || 0);

      const calc = calculateAttendanceRecord({
        dailyWage,
        shiftStart,
        shiftEnd,
        timeReached,
        workerEndTime,
        status,
        gracePeriodMinutes: 15
      });

      attendance.shiftStart = shiftStart;
      attendance.shiftEnd = shiftEnd;
      attendance.timeReached = timeReached;
      attendance.workerEndTime = workerEndTime;
      attendance.scheduledHours = calc.scheduledHours;
      attendance.actualHours = calc.actualHours;
      attendance.lateMinutes = calc.lateMinutes;
      attendance.lateDeduction = calc.lateDeduction;
      attendance.attendancePay = calc.attendancePay;
      attendance.status = calc.status;
      attendance.approvalStatus = 'Checked'; // Re-verified
      attendance.checkedBy = req.user._id;
      attendance.checkedByName = req.user.name;
      attendance.checkedAt = new Date();

      const remarkNote = workerResponse ? ` [CORRECTION APPROVED: ${workerResponse}]` : ` [CORRECTION APPROVED by ${req.user.name}]`;
      attendance.remarks = (attendance.remarks || '') + remarkNote;

      if (updatedFields.shop || request.proposedChanges?.shop) {
        const shopObj = await Shop.findById(updatedFields.shop || request.proposedChanges.shop);
        if (shopObj) {
          attendance.shop = shopObj._id;
          attendance.shopName = shopObj.name;
        }
      }

      await attendance.save();
    }

    // 4. Update the Correction Request record
    request.status = 'APPROVED';
    request.reviewedBy = req.user._id;
    request.reviewedByName = req.user.name;
    request.reviewedAt = new Date();
    request.reviewerNotes = reviewerNotes ? reviewerNotes.trim() : '';
    request.workerResponse = workerResponse ? workerResponse.trim() : 'Your attendance correction request was approved.';
    await request.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'ATTENDANCE_CORRECTION_APPROVED',
      recordType: 'AttendanceCorrectionRequest',
      recordId: request._id,
      details: `Approved correction request for ${request.employeeName} (${request.dateString}) by ${req.user.name}`,
      req
    });

    return res.json({
      success: true,
      message: 'Correction request approved and attendance record updated.',
      request
    });
  } catch (error) {
    return sendServerError(res, error, 'Error reviewing correction request.');
  }
};
