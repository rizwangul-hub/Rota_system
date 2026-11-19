const LeaveRequest = require('../models/LeaveRequest');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

const VALID_LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Emergency Leave', 'Unpaid Leave', 'Other'];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Calculate total calendar days between two YYYY-MM-DD dates (inclusive)
 */
function calculateDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const diff = end.getTime() - start.getTime();
  return Math.round(diff / (1000 * 3600 * 24)) + 1;
}

/**
 * POST /api/worker/leaves
 * Submits a new leave request for the authenticated worker
 */
exports.submitLeaveRequest = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const userId = req.user._id;
    const { leaveType, startDate, endDate, reason, attachment } = req.body;

    // 1. Validation
    if (!leaveType || !VALID_LEAVE_TYPES.includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid leave type. Must be one of: ${VALID_LEAVE_TYPES.join(', ')}`
      });
    }

    if (!startDate || !DATE_REGEX.test(startDate) || !endDate || !DATE_REGEX.test(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate must be valid dates in YYYY-MM-DD format.'
      });
    }

    if (endDate < startDate) {
      return res.status(400).json({
        success: false,
        message: 'End date cannot be earlier than start date.'
      });
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a reason for your leave request.'
      });
    }

    const totalDays = calculateDays(startDate, endDate);
    if (totalDays > 90) {
      return res.status(400).json({
        success: false,
        message: 'Leave requests cannot exceed 90 consecutive days in a single submission.'
      });
    }

    // 2. Overlap & Duplicate Protection
    // Check if worker already has a Pending or Approved leave overlapping this period
    const overlapping = await LeaveRequest.findOne({
      employee: employeeId,
      status: { $in: ['Pending', 'Approved'] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    });

    if (overlapping) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${overlapping.status.toLowerCase()} leave request from ${overlapping.startDate} to ${overlapping.endDate} overlapping these dates.`
      });
    }

    // 3. Create Leave Request
    const leave = await LeaveRequest.create({
      employee: employeeId,
      userAccount: userId,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason: reason.trim(),
      attachment: attachment || null,
      status: 'Pending'
    });

    // 4. Audit Log
    await logAction({
      user: req.user,
      action: 'LEAVE_REQUEST_SUBMITTED',
      recordType: 'LeaveRequest',
      recordId: leave._id,
      details: `Worker ${req.employee.name} submitted ${leaveType} for ${totalDays} day(s) (${startDate} to ${endDate}).`,
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully for management review.',
      leaveRequest: leave
    });
  } catch (error) {
    return sendServerError(res, error, 'Error submitting leave request.');
  }
};

/**
 * GET /api/worker/leaves
 * Retrieves leave requests for the authenticated worker
 */
exports.getMyLeaves = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const { status, limit = 50, page = 1 } = req.query;

    const query = { employee: employeeId };
    if (status && ['Pending', 'Approved', 'Rejected', 'Cancelled'].includes(status)) {
      query.status = status;
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const leaves = await LeaveRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    const total = await LeaveRequest.countDocuments(query);

    return res.json({
      success: true,
      leaves,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving leave requests.');
  }
};

/**
 * GET /api/worker/leaves/summary
 * Aggregates leave statistics for the authenticated worker
 */
exports.getLeaveSummary = async (req, res) => {
  try {
    const employeeId = req.employee._id;

    const allLeaves = await LeaveRequest.find({ employee: employeeId }).lean();

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let approvedAnnualLeaveDays = 0;
    let approvedSickLeaveDays = 0;
    let totalApprovedDays = 0;

    for (const l of allLeaves) {
      if (l.status === 'Pending') pendingCount++;
      if (l.status === 'Rejected') rejectedCount++;
      if (l.status === 'Approved') {
        approvedCount++;
        totalApprovedDays += (l.totalDays || 0);
        if (l.leaveType === 'Annual Leave') approvedAnnualLeaveDays += (l.totalDays || 0);
        if (l.leaveType === 'Sick Leave') approvedSickLeaveDays += (l.totalDays || 0);
      }
    }

    return res.json({
      success: true,
      summary: {
        pendingCount,
        approvedCount,
        rejectedCount,
        totalRequests: allLeaves.length,
        approvedAnnualLeaveDays,
        approvedSickLeaveDays,
        totalApprovedDays
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error calculating leave summary.');
  }
};

/**
 * POST /api/worker/leaves/:id/cancel
 * Allows worker to cancel their own pending leave request
 */
exports.cancelLeaveRequest = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const { id } = req.params;

    const leave = await LeaveRequest.findOne({ _id: id, employee: employeeId });
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    if (leave.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a leave request with status "${leave.status}". Only pending requests may be cancelled.`
      });
    }

    leave.status = 'Cancelled';
    leave.cancelledAt = new Date();
    await leave.save();

    await logAction({
      user: req.user,
      action: 'LEAVE_REQUEST_CANCELLED',
      recordType: 'LeaveRequest',
      recordId: leave._id,
      details: `Worker ${req.employee.name} cancelled leave request for ${leave.startDate} to ${leave.endDate}.`,
      req
    });

    return res.json({
      success: true,
      message: 'Leave request has been successfully cancelled.',
      leaveRequest: leave
    });
  } catch (error) {
    return sendServerError(res, error, 'Error cancelling leave request.');
  }
};
