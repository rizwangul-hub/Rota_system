const LeaveRequest = require('../models/LeaveRequest');
const Employee = require('../models/Employee');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

/**
 * GET /api/admin/leaves
 * Lists all employee leave requests with filtering and pagination
 */
exports.getLeaves = async (req, res) => {
  try {
    const { status, leaveType, shopId, employeeId, startDate, endDate, page = 1, limit = 50 } = req.query;

    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (leaveType && leaveType !== 'ALL') {
      filter.leaveType = leaveType;
    }

    if (startDate && endDate) {
      filter.startDate = { $lte: endDate };
      filter.endDate = { $gte: startDate };
    }

    // Shop filter: Find employee IDs in that shop
    if (shopId && shopId !== 'ALL') {
      const empsInShop = await Employee.find({ assignedShop: shopId }).select('_id');
      const empIds = empsInShop.map(e => e._id);
      filter.employee = { $in: empIds };
    }

    if (employeeId && employeeId !== 'ALL') {
      filter.employee = employeeId;
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const leaves = await LeaveRequest.find(filter)
      .populate({
        path: 'employee',
        select: 'name employeeId assignedShop employmentStatus jobTitle',
        populate: { path: 'assignedShop', select: 'name code' }
      })
      .populate('reviewedBy', 'name username role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    const total = await LeaveRequest.countDocuments(filter);

    // Summary statistics for the admin dashboard cards
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      LeaveRequest.countDocuments({ status: 'Pending' }),
      LeaveRequest.countDocuments({ status: 'Approved' }),
      LeaveRequest.countDocuments({ status: 'Rejected' })
    ]);

    return res.json({
      success: true,
      leaves,
      stats: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total
      },
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching leave requests for admin.');
  }
};

/**
 * GET /api/admin/leaves/:id
 * Fetches single leave request details along with shop overlap detection
 */
exports.getLeaveDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const leave = await LeaveRequest.findById(id)
      .populate({
        path: 'employee',
        select: 'name employeeId assignedShop employmentStatus jobTitle startDate',
        populate: { path: 'assignedShop', select: 'name code address' }
      })
      .populate('reviewedBy', 'name username role')
      .lean();

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    // Check other approved leaves for colleagues in the same shop during these dates (understaffing warning)
    let shopOverlaps = [];
    if (leave.employee?.assignedShop?._id) {
      const colleagues = await Employee.find({
        assignedShop: leave.employee.assignedShop._id,
        _id: { $ne: leave.employee._id }
      }).select('_id');

      const colleagueIds = colleagues.map(c => c._id);

      shopOverlaps = await LeaveRequest.find({
        employee: { $in: colleagueIds },
        status: 'Approved',
        startDate: { $lte: leave.endDate },
        endDate: { $gte: leave.startDate }
      }).populate('employee', 'name employeeId').lean();
    }

    return res.json({
      success: true,
      leave,
      shopOverlaps
    });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching leave details.');
  }
};

/**
 * POST /api/admin/leaves/:id/review
 * Approves or Rejects a leave request with audit logging
 */
exports.reviewLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewRemarks } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "Approved" or "Rejected".'
      });
    }

    const leave = await LeaveRequest.findById(id).populate('employee', 'name employeeId');
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    if (leave.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot review a leave request that was already cancelled by the employee.'
      });
    }

    const previousStatus = leave.status;
    leave.status = status;
    leave.reviewedBy = req.user._id;
    leave.reviewedByName = req.user.name || 'Admin';
    leave.reviewedAt = new Date();
    leave.reviewRemarks = (reviewRemarks || '').trim();

    await leave.save();

    // Critical Audit Trail
    const actionName = status === 'Approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED';
    await logAction({
      user: req.user,
      action: actionName,
      recordType: 'LeaveRequest',
      recordId: leave._id,
      details: `${req.user.name} ${status.toLowerCase()} leave request for ${leave.employee?.name} (${leave.startDate} to ${leave.endDate}, ${leave.totalDays} days). Remarks: "${leave.reviewRemarks || 'None'}"`,
      req
    });

    return res.json({
      success: true,
      message: `Leave request has been ${status.toLowerCase()} successfully.`,
      leave
    });
  } catch (error) {
    return sendServerError(res, error, 'Error reviewing leave request.');
  }
};
