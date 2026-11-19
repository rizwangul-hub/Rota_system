const Announcement = require('../models/Announcement');
const Employee = require('../models/Employee');
const { sendServerError } = require('../utils/httpErrors');

/**
 * Builds the MongoDB query condition for announcements targeted to a specific worker
 */
function buildTargetFilter(employee) {
  const shopId = employee.assignedShop?._id || employee.assignedShop;
  const orConditions = [
    { targetType: 'ALL' }
  ];

  if (shopId) {
    orConditions.push({ targetType: 'SHOPS', targetShops: shopId });
  }

  orConditions.push({ targetType: 'EMPLOYEES', targetEmployees: employee._id });

  return { $or: orConditions };
}

/**
 * Priority sort ranking
 */
const PRIORITY_ORDER = {
  Urgent: 1,
  Important: 2,
  Normal: 3
};

/**
 * GET /api/worker/announcements
 * Retrieves published, active announcements targeted to the authenticated worker
 */
exports.getAnnouncements = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const employee = await Employee.findById(employeeId).select('assignedShop');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const now = new Date();
    const targetFilter = buildTargetFilter(employee);

    // Active announcements: Published and not expired
    const filter = {
      status: 'Published',
      $and: [
        targetFilter,
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gte: now } }
          ]
        }
      ]
    };

    const announcements = await Announcement.find(filter)
      .populate('publishedBy', 'name role')
      .sort({ publishedAt: -1 })
      .lean();

    // Map readership and sort by priority first, then publishedAt
    const items = announcements.map(a => {
      const readRecord = (a.readBy || []).find(r => String(r.employee) === String(employeeId));
      return {
        _id: a._id,
        title: a.title,
        message: a.message,
        priority: a.priority || 'Normal',
        publishedAt: a.publishedAt,
        publishedByName: a.publishedByName || a.publishedBy?.name || 'Management',
        expiresAt: a.expiresAt,
        attachment: a.attachment,
        isRead: Boolean(readRecord),
        readAt: readRecord?.readAt || null
      };
    });

    items.sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.priority] || 3) - (PRIORITY_ORDER[b.priority] || 3);
      if (pDiff !== 0) return pDiff;
      return new Date(b.publishedAt) - new Date(a.publishedAt);
    });

    const unreadCount = items.filter(i => !i.isRead).length;

    return res.json({
      success: true,
      announcements: items,
      unreadCount
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving announcements.');
  }
};

/**
 * POST /api/worker/announcements/:id/read
 * Marks an announcement as read by the authenticated worker
 */
exports.markAsRead = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const { id } = req.params;

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    const alreadyRead = (announcement.readBy || []).some(r => String(r.employee) === String(employeeId));
    if (!alreadyRead) {
      announcement.readBy.push({
        employee: employeeId,
        readAt: new Date()
      });
      await announcement.save();
    }

    return res.json({
      success: true,
      message: 'Announcement marked as read.',
      isRead: true,
      readAt: new Date().toISOString()
    });
  } catch (error) {
    return sendServerError(res, error, 'Error recording announcement read receipt.');
  }
};

/**
 * GET /api/worker/announcements/history
 * Retrieves full archive of notices received by this worker (including expired)
 */
exports.getAnnouncementHistory = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const employee = await Employee.findById(employeeId).select('assignedShop');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const targetFilter = buildTargetFilter(employee);
    const filter = {
      status: { $in: ['Published', 'Archived'] },
      ...targetFilter
    };

    const announcements = await Announcement.find(filter)
      .populate('publishedBy', 'name role')
      .sort({ publishedAt: -1 })
      .lean();

    const items = announcements.map(a => {
      const readRecord = (a.readBy || []).find(r => String(r.employee) === String(employeeId));
      return {
        _id: a._id,
        title: a.title,
        message: a.message,
        priority: a.priority || 'Normal',
        status: a.status,
        publishedAt: a.publishedAt,
        publishedByName: a.publishedByName || a.publishedBy?.name || 'Management',
        expiresAt: a.expiresAt,
        attachment: a.attachment,
        isRead: Boolean(readRecord),
        readAt: readRecord?.readAt || null
      };
    });

    return res.json({
      success: true,
      announcements: items
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving announcement history.');
  }
};
